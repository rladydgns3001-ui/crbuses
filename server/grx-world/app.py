"""
GRX 3D 체육관 실시간 서버 (grx-world)

- 키오스크 서버(grx-api)와 완전히 분리된 작은 서비스. 이게 죽어도 키오스크 출석은 영향 없음
- 접속자 목록과 운동 횟수는 메모리에만 둠. 종목별 누적 횟수만 data.json 에 저장
- 회원 입장: 이름 + 전화번호 뒤 4자리가 모두 맞을 때만, grx.db 를 읽기 전용으로 열어 누적 출석일을 돌려줌
- 다른 사람에게는 회원 이름을 가려서(김○원) 보여줌

실행: uvicorn app:app --host 127.0.0.1 --port 8110
환경변수: GRX_DB(기본 /opt/grx/grx.db), WORLD_DATA(기본 ./data.json)
"""
import json
import os
import random
import re
import secrets
import sqlite3
import threading
import time
from datetime import datetime, timedelta, timezone

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

GRX_DB = os.environ.get("GRX_DB", "/opt/grx/grx.db")
DATA_FILE = os.environ.get("WORLD_DATA", os.path.join(os.path.dirname(os.path.abspath(__file__)), "data.json"))
KST = timezone(timedelta(hours=9))

STATIONS = 8               # 스키 / 슬레드 푸시 / 슬레드 풀 / 버피 브로드점프 / 로잉 / 파머스 캐리 / 샌드백 런지 / 월볼
PLAYER_TTL = 10            # 이 시간(초) 동안 신호가 없으면 퇴장 처리
MAX_PLAYERS = 5000
MAX_REPS_PER_BEAT = 6      # 한 번(약 0.4초)에 6회 넘게 누르면 잘라냄 (자동 클릭 방지)
LIST_LIMIT = 60            # 화면에 그릴 최대 인원

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https://(crbuses\.com|www\.crbuses\.com|([a-z0-9-]+\.)?crbuses\.pages\.dev)$|^http://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

lock = threading.Lock()
players = {}               # id -> dict
login_hits = {}            # ip -> [timestamps]


def today():
    return datetime.now(KST).strftime("%Y-%m-%d")


def load_data():
    try:
        with open(DATA_FILE, encoding="utf-8") as f:
            d = json.load(f)
    except Exception:
        d = {}
    d.setdefault("all", [0] * STATIONS)
    d.setdefault("today", [0] * STATIONS)
    d.setdefault("day", today())
    d.setdefault("best", [])          # 오늘 레이스 최고 기록 [{n, a, ms}]
    return d


data = load_data()
dirty = False


def roll_day():
    if data["day"] != today():
        data["day"] = today()
        data["today"] = [0] * STATIONS
        data["best"] = []


def saver():
    global dirty
    while True:
        time.sleep(20)
        with lock:
            if not dirty:
                continue
            snap = json.dumps(data, ensure_ascii=False)
            dirty = False
        tmp = DATA_FILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            f.write(snap)
        os.replace(tmp, DATA_FILE)


threading.Thread(target=saver, daemon=True).start()


def mask(name):
    name = (name or "").strip()
    if len(name) <= 1:
        return name or "회원"
    if len(name) == 2:
        return name[0] + "○"
    return name[0] + "○" * (len(name) - 2) + name[-1]


def member_lookup(name, phone4):
    """이름 + 뒤 4자리가 모두 맞는 회원 1명을 찾아 누적 출석일을 돌려줌. 없으면 None"""
    name = re.sub(r"\s+", "", name or "")
    phone4 = re.sub(r"\D", "", phone4 or "")[-4:]
    if not name or len(phone4) != 4:
        return None
    con = sqlite3.connect("file:%s?mode=ro" % GRX_DB, uri=True, timeout=3)
    try:
        con.row_factory = sqlite3.Row
        hits = []
        for r in con.execute("SELECT id, name, phone FROM members"):
            if re.sub(r"\s+", "", r["name"] or "") == name and re.sub(r"\D", "", r["phone"] or "")[-4:] == phone4:
                hits.append(r)
        if len(hits) != 1:
            return None
        mid = hits[0]["id"]
        total = con.execute("SELECT COUNT(DISTINCT d) FROM attendance WHERE member_id=?", (mid,)).fetchone()[0]
        return {"name": hits[0]["name"], "total": int(total or 0)}
    finally:
        con.close()


def prune(now):
    dead = [k for k, p in players.items() if now - p["seen"] > PLAYER_TTL]
    for k in dead:
        del players[k]
        race["racers"].pop(k, None)


# ───────── 레이스 (접속자끼리 시합) ─────────
# 코스: 트랙 한 바퀴(코너 4곳) → 월볼 15회 → 피니시 라인 = 20단계
RACE_STEPS = 20
RACE_MIN = 2            # 이 인원 이상 모이면 카운트다운 시작
RACE_WAIT = 15          # 카운트다운(초). 그동안 더 참가 가능
RACE_LIMIT = 300        # 5분 지나면 강제 종료
RACE_SHOW = 15          # 결과 보여주는 시간(초)
RACE_GRACE = 30         # 1등이 골인하면 남은 선수에게 주는 시간(초). 지나면 레이스 끝 (마리오카트처럼)
race = {"state": "idle", "rid": 0, "startAt": 0.0, "endAt": 0.0, "firstAt": None, "racers": {}, "results": []}


def race_tick(now):
    global dirty
    r = race
    if r["state"] in ("lobby", "countdown") and not r["racers"]:
        r["state"] = "idle"
    if r["state"] == "lobby" and len(r["racers"]) >= RACE_MIN:
        r["state"] = "countdown"; r["startAt"] = now + RACE_WAIT
    if r["state"] == "countdown":
        if len(r["racers"]) < RACE_MIN:
            r["state"] = "lobby"
        elif now >= r["startAt"]:
            r["state"] = "running"
    if r["state"] == "running":
        alive = [v for v in r["racers"].values() if v["fin"] is None]
        if r["firstAt"] is None and any(v["fin"] is not None for v in r["racers"].values()):
            r["firstAt"] = now
        grace_over = r["firstAt"] is not None and now - r["firstAt"] > RACE_GRACE
        if not alive or grace_over or now - r["startAt"] > RACE_LIMIT or not r["racers"]:
            res = sorted(r["racers"].items(), key=lambda kv: (kv[1]["fin"] is None, kv[1]["fin"] or 0, -kv[1]["prog"]))
            r["results"] = [{"id": players[k]["pub"] if k in players else "", "n": v["n"], "a": v["a"], "prog": v["prog"], "ms": v["fin"]} for k, v in res]
            res = [v for k, v in res]
            for v in res:
                if v["fin"] is not None:
                    data["best"].append({"n": v["n"], "a": v["a"], "ms": v["fin"]})
            data["best"] = sorted(data["best"], key=lambda b: b["ms"])[:10]
            dirty = True
            r["state"] = "done"; r["endAt"] = now
    if r["state"] == "done" and now - r["endAt"] > RACE_SHOW:
        r["state"] = "idle"; r["racers"] = {}; r["results"] = []; r["firstAt"] = None


def race_view(now):
    r = race
    rs = sorted(r["racers"].items(), key=lambda kv: (kv[1]["fin"] is None, kv[1]["fin"] or 0, -kv[1]["prog"]))
    return {
        "state": r["state"], "rid": r["rid"], "steps": RACE_STEPS, "min": RACE_MIN,
        "startIn": round(max(0.0, r["startAt"] - now), 2) if r["state"] == "countdown" else None,
        "elapsed": round(now - r["startAt"], 2) if r["state"] == "running" else None,
        "graceLeft": round(max(0.0, RACE_GRACE - (now - r["firstAt"])), 1) if r["state"] == "running" and r["firstAt"] is not None else None,
        "racers": [{"id": players[k]["pub"] if k in players else "", "n": v["n"], "a": v["a"], "prog": v["prog"], "ms": v["fin"]} for k, v in rs],
        "results": r["results"],
        "best": data["best"][:5],
    }


def client_ip(req: Request):
    return (req.headers.get("cf-connecting-ip") or req.headers.get("x-forwarded-for", "").split(",")[0].strip()
            or (req.client.host if req.client else "?"))


@app.get("/health")
def health():
    with lock:
        prune(time.time())
        return {"ok": True, "online": len(players)}


@app.post("/hello")
async def hello(req: Request):
    body = await req.json()
    now = time.time()
    mode = body.get("mode")
    member = None
    if mode == "member":
        ip = client_ip(req)
        with lock:
            hits = [t for t in login_hits.get(ip, []) if now - t < 60]
            if len(hits) >= 8:
                return {"ok": False, "error": "too_many"}
            hits.append(now)
            login_hits[ip] = hits
        try:
            member = member_lookup(body.get("name"), body.get("phone4"))
        except Exception:
            return {"ok": False, "error": "db"}
        if not member:
            return {"ok": False, "error": "not_found"}
    with lock:
        prune(now)
        if len(players) >= MAX_PLAYERS:
            return {"ok": False, "error": "full"}
        pid = secrets.token_hex(6)
        if member:
            p = {"n": mask(member["name"]), "m": 1, "a": member["total"]}
        else:
            p = {"n": "방문자" + str(random.randint(1000, 9999)), "m": 0, "a": 0}
        p.update({"st": -1, "r": 0, "seen": now, "act": 0, "pub": secrets.token_hex(4), "x": -15.2, "z": 0.5, "ry": 0.0, "mv": 0})
        players[pid] = p
        return {"ok": True, "id": pid, "pub": p["pub"], "name": p["n"], "member": p["m"], "total": p["a"]}


@app.post("/beat")
async def beat(req: Request):
    global dirty
    body = await req.json()
    now = time.time()
    pid = str(body.get("id") or "")
    try:
        st = int(body.get("st", -1))
    except (TypeError, ValueError):
        st = -1
    try:
        reps = max(0, min(MAX_REPS_PER_BEAT, int(body.get("reps", 0))))
    except (TypeError, ValueError):
        reps = 0

    def num(k, lo, hi, dflt):
        try:
            v = float(body.get(k, dflt))
        except (TypeError, ValueError):
            return dflt
        if v != v:            # NaN
            return dflt
        return max(lo, min(hi, v))
    with lock:
        roll_day()
        prune(now)
        p = players.get(pid)
        if not p:
            return {"ok": False, "error": "expired"}
        p["seen"] = now
        p["x"] = round(num("x", -17, 17, p["x"]), 2)
        p["z"] = round(num("z", -12, 12, p["z"]), 2)
        p["ry"] = round(num("ry", -7, 7, p["ry"]), 2)
        p["mv"] = 1 if body.get("mv") else 0
        p["st"] = st if 0 <= st < STATIONS else -1
        # 레이스 진행 보고 (한 번에 최대 3단계까지만 인정)
        rv = race["racers"].get(pid)
        if rv and race["state"] == "running" and rv["fin"] is None and body.get("rid") == race["rid"]:
            try:
                rp = int(body.get("rp", 0))
            except (TypeError, ValueError):
                rp = 0
            rv["prog"] = max(rv["prog"], min(RACE_STEPS, rp, rv["prog"] + 3))
            if rv["prog"] >= RACE_STEPS:
                rv["fin"] = int((now - race["startAt"]) * 1000)
        race_tick(now)
        if 0 <= st < STATIONS:
            if reps:
                p["r"] += reps
                p["act"] = now
                data["all"][st] += reps
                data["today"][st] += reps
                dirty = True
        # 나를 뺀 접속자 (최근에 운동한 사람부터). 다른 사람에게는 비밀 id 대신 공개용 id만 보냄
        others = sorted(((k, v) for k, v in players.items() if k != pid), key=lambda kv: -max(kv[1]["act"], kv[1]["seen"] - 60))
        lst = others[:LIST_LIMIT]
        return {
            "ok": True,
            "online": len(players),
            "today": data["today"],
            "all": data["all"],
            "players": [{"id": v["pub"], "n": v["n"], "m": v["m"], "a": v["a"], "st": v["st"], "r": v["r"],
                         "x": v["x"], "z": v["z"], "ry": v["ry"], "mv": v["mv"]} for k, v in lst],
            "race": race_view(now),
            "me": {"racer": pid in race["racers"]},
        }


@app.post("/race/join")
async def race_join(req: Request):
    body = await req.json()
    now = time.time()
    pid = str(body.get("id") or "")
    with lock:
        prune(now)
        race_tick(now)
        p = players.get(pid)
        if not p:
            return {"ok": False, "error": "expired"}
        if race["state"] in ("running", "done"):
            return {"ok": False, "error": "running", "race": race_view(now)}
        if race["state"] == "idle":
            race["state"] = "lobby"; race["rid"] += 1; race["racers"] = {}; race["results"] = []; race["firstAt"] = None
        race["racers"][pid] = {"n": p["n"], "a": p["a"], "prog": 0, "fin": None}
        race_tick(now)
        return {"ok": True, "race": race_view(now)}


@app.post("/race/leave")
async def race_leave(req: Request):
    body = await req.json()
    with lock:
        if race["state"] in ("lobby", "countdown"):
            race["racers"].pop(str(body.get("id") or ""), None)
            race_tick(time.time())
    return {"ok": True}


@app.post("/bye")
async def bye(req: Request):
    try:
        body = await req.json()
    except Exception:
        return {"ok": True}
    with lock:
        k = str(body.get("id") or "")
        players.pop(k, None)
        race["racers"].pop(k, None)
    return {"ok": True}
