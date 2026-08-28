/**
 * ============================================================================
 *  GRX 출석 · 홀딩 확장 API   (appsscript_추가코드.gs)
 * ============================================================================
 *
 *  ▣ 이 파일이 하는 일
 *    1) "출석" 시트를 자동으로 만들고 (출석ID·회원ID·날짜·시각·타임·입력방식)
 *       키오스크에서 뒷번호 4자리 조회에 성공하면 출석 1행을 기록합니다.
 *       - 같은 날 두 번째부터는 기록하지 않고 "이미 출석" 으로 응답합니다.
 *    2) "회원" 시트에 홀딩시작일 / 홀딩종료일 / 홀딩누적일 열을 자동으로 추가하고
 *       관리자 화면에서 홀딩 시작·해제를 처리합니다.
 *       - 홀딩 해제 시 홀딩한 일수만큼 "홀딩누적일"에 더해지고,
 *         만료일 = 시작일 + 개월수 + 홀딩누적일  로 자동 연장됩니다.
 *       - 홀딩 중인 회원이 키오스크에서 출석을 시도하면 기록하지 않고
 *         "홀딩 중입니다" 로만 응답합니다.
 *
 * ----------------------------------------------------------------------------
 *  ▣ 왜 "새 프로젝트" 인가?
 *    Apps Script 프로젝트 하나에는 doGet / doPost 를 각각 하나씩만 둘 수 있습니다.
 *    기존 회원관리 스크립트에 이 코드를 그대로 붙여넣으면 doPost 가 충돌해서
 *    기존 add / update / delete / use 가 전부 망가집니다.
 *    그래서 이 코드는 **별도의 새 Apps Script 프로젝트**로 배포합니다.
 *    → 기존 스크립트는 손대지 않아도 됩니다. (아래 [부록] 만 예외)
 *
 * ----------------------------------------------------------------------------
 *  ▣ 배포 방법 (딱 6단계, 5분)
 *
 *   1. 회원 구글시트를 열고 주소창에서 시트 ID 를 복사합니다.
 *        https://docs.google.com/spreadsheets/d/[[[이 부분이 시트 ID]]]/edit
 *
 *   2. https://script.google.com  접속 → 좌측 상단 [새 프로젝트]
 *      프로젝트 이름은 "GRX 출석·홀딩 API" 정도로 지어주세요.
 *
 *   3. 편집기의 기본 코드(myFunction 등)를 전부 지우고 이 파일 내용을 통째로
 *      붙여넣습니다. 그리고 바로 아래 GRX2_SPREADSHEET_ID 에 1번에서 복사한
 *      시트 ID 를 따옴표 안에 넣습니다.
 *
 *   4. 저장(Ctrl+S) → 상단 함수 목록에서 GRX2_setup 선택 → [실행]
 *      처음 실행하면 권한 승인 창이 뜹니다.
 *        "고급" → "GRX 출석·홀딩 API(안전하지 않음)으로 이동" → 허용
 *      실행 로그(Ctrl+Enter)에 감지된 회원 시트/열 이름이 찍힙니다.
 *      → 여기서 id / 이름 / 전화번호 / 시작일 이 "없음" 으로 나오면
 *        그 시트의 헤더 이름을 GRX2_ALIAS 목록에 추가해 주세요.
 *
 *   5. 우측 상단 [배포] → [새 배포] → 톱니바퀴 → 유형: **웹 앱**
 *        설명           : v1
 *        실행 사용자     : 나(본인 계정)
 *        액세스 권한     : **모든 사용자**   ← 반드시 이걸로! (Anyone)
 *      [배포] → 나오는 **웹 앱 URL(.../exec)** 을 복사합니다.
 *
 *   6. 복사한 URL 을 아래 두 HTML 파일 상단의 ATTEND_API 에 붙여넣습니다.
 *        - GRX_키오스크_회원확인용 (5).html
 *        - GRX_관리자_전용_v3.html
 *
 *   ※ 코드를 수정한 뒤에는 [배포] → [배포 관리] → 연필 → 버전 "새 버전" → [배포]
 *     로 재배포해야 반영됩니다. URL 은 그대로 유지됩니다.
 *
 * ----------------------------------------------------------------------------
 *  ▣ 이름 충돌 방지
 *    이 파일의 모든 함수는 GRX2_ (부록은 GRXHOLD_) 접두사를 씁니다.
 *    접두사 없는 함수는 doGet / doPost 두 개뿐이며, 이 둘은 새 프로젝트에만
 *    존재하므로 기존 스크립트와 충돌하지 않습니다.
 * ============================================================================
 */


/* ══════════════════════════════════════════════════════════════════════════
   ①  설정 — 여기만 채우면 됩니다
   ══════════════════════════════════════════════════════════════════════════ */

/** 회원 구글시트의 ID (주소창 /d/ 와 /edit 사이의 긴 문자열) */
var GRX2_SPREADSHEET_ID = "";

/** 출석 기록 시트 이름 (없으면 자동 생성) */
var GRX2_ATTEND_SHEET = "출석";

/** 회원 시트 이름. 비워두면 헤더를 보고 자동으로 찾습니다. */
var GRX2_MEMBER_SHEET = "";

/** 시간대 */
var GRX2_TZ = "Asia/Seoul";

var GRX2_VERSION = "1.0.0";

/** 시트 헤더 이름 후보. 실제 시트 헤더가 목록에 없으면 여기에 추가하세요.
 *  (비교할 때 공백·괄호·밑줄·하이픈은 무시하고 소문자로 바꿔서 대조합니다) */
var GRX2_ALIAS = {
  id       : ["id", "아이디", "회원id", "고유id", "key", "uid"],
  name     : ["name", "이름", "회원명", "성명"],
  phone    : ["phone", "전화번호", "연락처", "휴대폰", "휴대전화", "전화", "핸드폰", "폰"],
  plan     : ["plan", "상품명", "회원권", "회원권종류", "상품", "권종"],
  type     : ["type", "구분", "유형", "종류", "회원권구분"],
  start    : ["start", "시작일", "등록일", "시작", "개시일", "startdate"],
  months   : ["months", "month", "개월", "개월수", "기간", "기간개월", "이용기간"],
  total    : ["total", "총횟수", "전체횟수", "횟수", "총회수"],
  used     : ["used", "사용", "사용횟수", "차감", "사용회수"],
  holdStart: ["홀딩시작일", "holdstart"],
  holdEnd  : ["홀딩종료일", "holdend"],
  holdDays : ["홀딩누적일", "홀딩누적일수", "holddays"]
};

/** 출석 시각 → 타임 구분 라벨 */
function GRX2_slotLabel(hour) {
  if (hour < 5)  return "심야";
  if (hour < 9)  return "새벽";
  if (hour < 12) return "오전";
  if (hour < 17) return "오후";
  if (hour < 22) return "저녁";
  return "심야";
}


/* ══════════════════════════════════════════════════════════════════════════
   ②  웹앱 진입점
   ══════════════════════════════════════════════════════════════════════════ */

function doGet(e) {
  var p = (e && e.parameter) ? e.parameter : {};
  return GRX2_route(p.action || "holds", p);
}

function doPost(e) {
  var p = {};
  try { p = JSON.parse(e.postData.contents); } catch (err) { p = {}; }
  return GRX2_route(p.action || "", p);
}

function GRX2_route(action, p) {
  try {
    switch (action) {
      case "ping":       return GRX2_json({ ok: true, service: "grx-attend", version: GRX2_VERSION });
      case "attend":     return GRX2_json(GRX2_attend(p));
      case "stats":      return GRX2_json(GRX2_stats(p));
      case "holds":      return GRX2_json(GRX2_holds());
      case "hold_start": return GRX2_json(GRX2_holdStart(p));
      case "hold_end":   return GRX2_json(GRX2_holdEnd(p));
      case "diag":       return GRX2_json(GRX2_diagInfo());
      default:           return GRX2_json({ ok: false, error: "unknown_action: " + action });
    }
  } catch (err) {
    return GRX2_json({ ok: false, error: String((err && err.message) || err) });
  }
}

function GRX2_json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}


/* ══════════════════════════════════════════════════════════════════════════
   ③  최초 1회 실행 — 시트/열 자동 생성 + 진단
   ══════════════════════════════════════════════════════════════════════════ */

/** 편집기에서 이 함수를 한 번 실행하세요.
 *  - 권한 승인
 *  - "출석" 시트 생성
 *  - 회원 시트에 홀딩시작일 / 홀딩종료일 / 홀딩누적일 열 추가
 *  - 감지된 열 매핑을 로그로 출력 */
function GRX2_setup() {
  var info = GRX2_diagInfo();
  Logger.log("─────────── GRX 출석·홀딩 API 진단 ───────────");
  Logger.log("스프레드시트 : " + info.spreadsheet);
  Logger.log("회원 시트    : " + info.memberSheet);
  Logger.log("출석 시트    : " + info.attendSheet + "  (기록 " + info.attendRows + "행)");
  Logger.log("회원 수      : " + info.memberCount + "명");
  Logger.log("헤더 원본    : " + info.headers.join(" | "));
  Logger.log("── 열 매핑 ──");
  var keys = ["id","name","phone","plan","type","start","months","total","used","holdStart","holdEnd","holdDays"];
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    Logger.log("  " + k + " : " + (info.mapping[k] || "❌ 없음 — GRX2_ALIAS 에 헤더 이름을 추가하세요"));
  }
  Logger.log("──────────────────────────────────────────────");
  if (!info.mapping.id)    Logger.log("⚠ id 열이 없어도 전화번호 뒤 4자리로 대신 동작합니다.");
  if (!info.mapping.phone) Logger.log("‼ 전화번호 열을 못 찾았습니다. 이건 반드시 매핑되어야 합니다.");
  return info;
}

function GRX2_diagInfo() {
  var ss = GRX2_ss();
  var ms = GRX2_memberSheet();
  var as = GRX2_attendSheet();
  var map = GRX2_headerMap(ms);
  var mapping = {};
  for (var k in map.col) if (map.col.hasOwnProperty(k)) mapping[k] = map.headers[map.col[k]];
  return {
    ok: true,
    version: GRX2_VERSION,
    spreadsheet: ss.getName(),
    memberSheet: ms.getName(),
    attendSheet: as.getName(),
    attendRows: Math.max(as.getLastRow() - 1, 0),
    memberCount: GRX2_readMembers().length,
    headers: map.headers,
    mapping: mapping
  };
}


/* ══════════════════════════════════════════════════════════════════════════
   ④  시트 접근 유틸
   ══════════════════════════════════════════════════════════════════════════ */

function GRX2_ss() {
  if (GRX2_SPREADSHEET_ID) return SpreadsheetApp.openById(GRX2_SPREADSHEET_ID);
  var act = SpreadsheetApp.getActiveSpreadsheet();
  if (act) return act;
  throw new Error("GRX2_SPREADSHEET_ID 를 먼저 설정하세요 (파일 상단 배포 방법 3번).");
}

/** 헤더 문자열 정규화: 공백/괄호/기호 제거 + 소문자 */
function GRX2_nk(v) {
  return String(v == null ? "" : v)
    .replace(/[\s()\[\]_\-.·]/g, "")
    .toLowerCase();
}

/** 회원 시트 찾기 (이름 지정 없으면 헤더 점수가 가장 높은 시트) */
function GRX2_memberSheet() {
  var ss = GRX2_ss();
  if (GRX2_MEMBER_SHEET) {
    var named = ss.getSheetByName(GRX2_MEMBER_SHEET);
    if (!named) throw new Error("회원 시트 '" + GRX2_MEMBER_SHEET + "' 를 찾을 수 없습니다.");
    return named;
  }
  var sheets = ss.getSheets();
  var best = null, bestScore = -1;
  for (var i = 0; i < sheets.length; i++) {
    var sh = sheets[i];
    if (sh.getName() === GRX2_ATTEND_SHEET) continue;
    if (sh.getLastColumn() < 1 || sh.getLastRow() < 1) continue;
    var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    var score = 0;
    var probe = ["name", "phone", "plan", "start", "id"];
    for (var j = 0; j < probe.length; j++) {
      if (GRX2_findCol(headers, GRX2_ALIAS[probe[j]]) >= 0) score++;
    }
    if (score > bestScore) { bestScore = score; best = sh; }
  }
  if (!best) throw new Error("회원 시트를 찾지 못했습니다. GRX2_MEMBER_SHEET 에 시트 이름을 직접 적어주세요.");
  return best;
}

function GRX2_findCol(headers, aliases) {
  for (var i = 0; i < headers.length; i++) {
    var h = GRX2_nk(headers[i]);
    if (!h) continue;
    for (var j = 0; j < aliases.length; j++) {
      if (h === GRX2_nk(aliases[j])) return i;
    }
  }
  return -1;
}

/** 회원 시트 헤더 → {headers:[], col:{key:index}} , 홀딩 열은 없으면 자동 추가 */
function GRX2_headerMap(sheet) {
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var col = {};
  for (var key in GRX2_ALIAS) {
    if (!GRX2_ALIAS.hasOwnProperty(key)) continue;
    var idx = GRX2_findCol(headers, GRX2_ALIAS[key]);
    if (idx >= 0) col[key] = idx;
  }
  // 홀딩 열 3개가 없으면 시트 맨 끝에 추가한다 (기존 열은 건드리지 않음)
  var need = [["holdStart", "홀딩시작일"], ["holdEnd", "홀딩종료일"], ["holdDays", "홀딩누적일"]];
  var added = false;
  for (var i = 0; i < need.length; i++) {
    if (col[need[i][0]] === undefined) {
      headers.push(need[i][1]);
      col[need[i][0]] = headers.length - 1;
      added = true;
    }
  }
  if (added) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    var c1 = col.holdStart + 1, c2 = col.holdEnd + 1;
    sheet.getRange(2, c1, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat("@");
    sheet.getRange(2, c2, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat("@");
  }
  return { headers: headers, col: col };
}

/** 출석 시트 (없으면 생성) */
function GRX2_attendSheet() {
  var ss = GRX2_ss();
  var sh = ss.getSheetByName(GRX2_ATTEND_SHEET);
  if (!sh) {
    sh = ss.insertSheet(GRX2_ATTEND_SHEET);
    sh.getRange(1, 1, 1, 6).setValues([["출석ID", "회원ID", "날짜", "시각", "타임", "입력방식"]]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, 6).setFontWeight("bold");
    // 날짜·시각은 문자열 그대로 보관 (시간대 오차 방지)
    sh.getRange(2, 3, sh.getMaxRows() - 1, 2).setNumberFormat("@");
    sh.setColumnWidth(1, 190);
    sh.setColumnWidth(2, 150);
  }
  return sh;
}


/* ══════════════════════════════════════════════════════════════════════════
   ⑤  날짜 유틸
   ══════════════════════════════════════════════════════════════════════════ */

function GRX2_pad2(n) { return (n < 10 ? "0" : "") + n; }

function GRX2_today() {
  var now = new Date();
  var s = Utilities.formatDate(now, GRX2_TZ, "yyyy-MM-dd").split("-");
  return new Date(Number(s[0]), Number(s[1]) - 1, Number(s[2]));
}

function GRX2_todayStr() { return GRX2_fmt(GRX2_today()); }

function GRX2_fmt(d) {
  return d ? d.getFullYear() + "-" + GRX2_pad2(d.getMonth() + 1) + "-" + GRX2_pad2(d.getDate()) : "";
}

/** 어떤 형식이든 Date 로 (실패 시 null) */
function GRX2_parse(v) {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    var s = Utilities.formatDate(v, GRX2_TZ, "yyyy-MM-dd").split("-");
    return new Date(Number(s[0]), Number(s[1]) - 1, Number(s[2]));
  }
  var t = String(v).trim();
  if (t.indexOf("T") !== -1) t = t.split("T")[0];
  var norm = t.replace(/[.\/\s]+/g, "-").replace(/-+$/, "").replace(/-+/g, "-");
  var m = norm.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return isNaN(d.getTime()) ? null : d;
  }
  var d2 = new Date(t);
  if (!isNaN(d2.getTime())) return new Date(d2.getFullYear(), d2.getMonth(), d2.getDate());
  return null;
}

function GRX2_days(a, b) { return Math.round((b.getTime() - a.getTime()) / 86400000); }

function GRX2_addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }

function GRX2_addMonths(d, n) {
  var r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  r.setMonth(r.getMonth() + n);
  return r;
}

/** 그 날짜가 속한 주의 월요일 (문자열 키) */
function GRX2_monday(d) {
  var off = (d.getDay() + 6) % 7;   // 월=0 … 일=6
  return GRX2_fmt(GRX2_addDays(d, -off));
}

function GRX2_last4(phone) {
  var d = String(phone == null ? "" : phone).replace(/\D/g, "");
  return d.length >= 4 ? d.slice(-4) : d;
}


/* ══════════════════════════════════════════════════════════════════════════
   ⑥  회원 읽기 / 쓰기
   ══════════════════════════════════════════════════════════════════════════ */

/** 회원 1명을 식별하는 키. id 열이 없는 시트에서도 동작하도록 전화번호로 대체 */
function GRX2_key(m) {
  return m.id ? String(m.id) : ("p:" + GRX2_last4(m.phone));
}

function GRX2_readMembers() {
  var sh = GRX2_memberSheet();
  var map = GRX2_headerMap(sh);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var width = Math.max(sh.getLastColumn(), map.headers.length);
  var rows = sh.getRange(2, 1, last - 1, width).getValues();
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var g = function (k) { return map.col[k] === undefined ? "" : r[map.col[k]]; };
    var name = String(g("name") || "").trim();
    var phone = String(g("phone") || "").trim();
    if (!name && !phone) continue;   // 빈 줄 skip
    out.push({
      row      : i + 2,
      id       : String(g("id") || "").trim(),
      name     : name,
      phone    : phone,
      plan     : String(g("plan") || "").trim(),
      type     : String(g("type") || "").trim(),
      start    : g("start"),
      months   : g("months"),
      total    : g("total"),
      used     : g("used"),
      holdStart: g("holdStart"),
      holdEnd  : g("holdEnd"),
      holdDays : Number(g("holdDays")) || 0
    });
  }
  return out;
}

/** id 또는 전화번호 뒤 4자리로 회원 찾기 */
function GRX2_findMember(p) {
  var list = GRX2_readMembers();
  var wantId = p.id ? String(p.id).trim() : "";
  var i;
  if (wantId) {
    if (wantId.indexOf("p:") === 0) {
      var c = wantId.slice(2);
      for (i = 0; i < list.length; i++) if (GRX2_last4(list[i].phone) === c) return list[i];
    } else {
      for (i = 0; i < list.length; i++) if (String(list[i].id) === wantId) return list[i];
    }
  }
  var code = p.phone4 ? String(p.phone4).replace(/\D/g, "").slice(-4) : "";
  if (code) {
    var hits = [];
    for (i = 0; i < list.length; i++) if (GRX2_last4(list[i].phone) === code) hits.push(list[i]);
    if (hits.length === 1) return hits[0];
    if (hits.length > 1 && p.name) {
      for (i = 0; i < hits.length; i++) if (String(hits[i].name).trim() === String(p.name).trim()) return hits[i];
    }
    if (hits.length > 1) return null;   // 중복 — 클라이언트가 본인 선택 후 id 로 다시 호출
  }
  return null;
}

function GRX2_setCell(sheet, map, row, key, value) {
  if (map.col[key] === undefined) return;
  sheet.getRange(row, map.col[key] + 1).setValue(value);
}


/* ══════════════════════════════════════════════════════════════════════════
   ⑦  홀딩
   ══════════════════════════════════════════════════════════════════════════ */

/** 홀딩 중 = 홀딩시작일 <= 오늘  AND  (홀딩종료일 없음 OR 홀딩종료일 > 오늘) */
function GRX2_isHolding(m, today) {
  var s = GRX2_parse(m.holdStart);
  if (!s) return false;
  var t = today || GRX2_today();
  if (GRX2_days(s, t) < 0) return false;          // 아직 시작 전
  var e = GRX2_parse(m.holdEnd);
  if (e && GRX2_days(t, e) <= 0) return false;    // 종료일이 오늘이거나 지남 → 해제됨
  return true;
}

function GRX2_holdInfo(m, today) {
  var t = today || GRX2_today();
  var s = GRX2_parse(m.holdStart);
  var holding = GRX2_isHolding(m, t);
  return {
    holding  : holding,
    holdStart: GRX2_fmt(s),
    holdEnd  : GRX2_fmt(GRX2_parse(m.holdEnd)),
    holdDays : Number(m.holdDays) || 0,
    holdingFor: holding && s ? GRX2_days(s, t) + 1 : 0
  };
}

/** 전체 회원의 홀딩 상태 (관리자 화면용) */
function GRX2_holds() {
  var list = GRX2_readMembers();
  var today = GRX2_today();
  var out = {};
  for (var i = 0; i < list.length; i++) {
    out[GRX2_key(list[i])] = GRX2_holdInfo(list[i], today);
  }
  return { ok: true, today: GRX2_fmt(today), holds: out };
}

function GRX2_holdStart(p) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var m = GRX2_findMember(p);
    if (!m) return { ok: false, error: "회원을 찾을 수 없습니다" };
    var today = GRX2_today();
    if (GRX2_isHolding(m, today)) {
      return { ok: false, error: "이미 홀딩 중입니다", hold: GRX2_holdInfo(m, today) };
    }
    var from = GRX2_parse(p.date) || today;
    var sh = GRX2_memberSheet();
    var map = GRX2_headerMap(sh);
    GRX2_setCell(sh, map, m.row, "holdStart", GRX2_fmt(from));
    GRX2_setCell(sh, map, m.row, "holdEnd", "");
    m.holdStart = GRX2_fmt(from);
    m.holdEnd = "";
    return { ok: true, result: "hold_started", name: m.name, hold: GRX2_holdInfo(m, today) };
  } finally {
    lock.releaseLock();
  }
}

function GRX2_holdEnd(p) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var m = GRX2_findMember(p);
    if (!m) return { ok: false, error: "회원을 찾을 수 없습니다" };
    var start = GRX2_parse(m.holdStart);
    if (!start) return { ok: false, error: "홀딩 기록이 없습니다" };
    var today = GRX2_today();
    var end = GRX2_parse(p.date) || today;
    var used = Math.max(GRX2_days(start, end), 0);     // 홀딩으로 못 쓴 일수
    var newTotal = (Number(m.holdDays) || 0) + used;

    var sh = GRX2_memberSheet();
    var map = GRX2_headerMap(sh);
    GRX2_setCell(sh, map, m.row, "holdEnd", GRX2_fmt(end));
    GRX2_setCell(sh, map, m.row, "holdDays", newTotal);

    m.holdEnd = GRX2_fmt(end);
    m.holdDays = newTotal;
    return {
      ok: true,
      result: "hold_ended",
      name: m.name,
      extendedDays: used,
      totalHoldDays: newTotal,
      endDate: GRX2_fmt(GRX2_endDate(m)),
      hold: GRX2_holdInfo(m, today)
    };
  } finally {
    lock.releaseLock();
  }
}

/** 만료일 = 시작일 + 개월수 + 홀딩누적일 */
function GRX2_endDate(m) {
  var s = GRX2_parse(m.start);
  var months = parseInt(m.months, 10);
  if (!s || isNaN(months)) return null;
  return GRX2_addDays(GRX2_addMonths(s, months), Number(m.holdDays) || 0);
}


/* ══════════════════════════════════════════════════════════════════════════
   ⑧  출석
   ══════════════════════════════════════════════════════════════════════════ */

/** 특정 회원의 출석 날짜 목록 (문자열 배열, 중복 제거) */
function GRX2_attendDates(memberKey) {
  var sh = GRX2_attendSheet();
  var last = sh.getLastRow();
  if (last < 2) return [];
  var vals = sh.getRange(2, 2, last - 1, 2).getValues();   // B:회원ID, C:날짜
  var seen = {}, out = [];
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]).trim() !== memberKey) continue;
    var d = GRX2_parse(vals[i][1]);
    if (!d) continue;
    var s = GRX2_fmt(d);
    if (!seen[s]) { seen[s] = true; out.push(s); }
  }
  out.sort();
  return out;
}

function GRX2_attend(p) {
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    var m = GRX2_findMember(p);
    if (!m) return { ok: true, result: "notfound" };

    var today = GRX2_today();
    var todayS = GRX2_fmt(today);

    // 홀딩 중이면 기록하지 않는다
    if (GRX2_isHolding(m, today)) {
      var hi = GRX2_holdInfo(m, today);
      return {
        ok: true, result: "holding", name: m.name, plan: m.plan,
        today: todayS, hold: hi
      };
    }

    var key = GRX2_key(m);
    var dates = GRX2_attendDates(key);
    var already = dates.indexOf(todayS) !== -1;

    if (!already) {
      var now = new Date();
      var stamp = Utilities.formatDate(now, GRX2_TZ, "yyyyMMdd-HHmmss");
      var rand = String(Math.floor(Math.random() * 900) + 100);
      var hour = Number(Utilities.formatDate(now, GRX2_TZ, "H"));
      GRX2_attendSheet().appendRow([
        "AT" + stamp + "-" + rand,                            // 출석ID
        key,                                                  // 회원ID
        todayS,                                               // 날짜
        Utilities.formatDate(now, GRX2_TZ, "HH:mm:ss"),       // 시각
        GRX2_slotLabel(hour),                                 // 타임
        p.via || "키오스크"                                    // 입력방식
      ]);
      dates.push(todayS);
      dates.sort();
    }

    return GRX2_buildStats(m, dates, already ? "already" : "attended", today);
  } finally {
    lock.releaseLock();
  }
}

/** 출석 기록 없이 통계만 (필요 시 사용) */
function GRX2_stats(p) {
  var m = GRX2_findMember(p);
  if (!m) return { ok: true, result: "notfound" };
  var today = GRX2_today();
  if (GRX2_isHolding(m, today)) {
    return { ok: true, result: "holding", name: m.name, plan: m.plan, today: GRX2_fmt(today), hold: GRX2_holdInfo(m, today) };
  }
  return GRX2_buildStats(m, GRX2_attendDates(GRX2_key(m)), "stats", today);
}

/** 출석 완료 화면에 필요한 값 전부 계산 */
function GRX2_buildStats(m, dates, result, today) {
  var y = today.getFullYear(), mo = today.getMonth() + 1;
  var prefix = y + "-" + GRX2_pad2(mo) + "-";

  // 이번 달 출석일(일자 숫자 배열)
  var monthDays = [], weekKeys = {}, i;
  var first = null;
  for (i = 0; i < dates.length; i++) {
    var ds = dates[i];
    if (ds.indexOf(prefix) === 0) monthDays.push(Number(ds.slice(8, 10)));
    var d = GRX2_parse(ds);
    if (d) {
      weekKeys[GRX2_monday(d)] = true;
      if (!first) first = d;
    }
  }
  monthDays.sort(function (a, b) { return a - b; });

  // N주 연속: 이번 주부터 거꾸로, 출석이 있는 주가 끊길 때까지
  var streak = 0;
  var cursor = GRX2_addDays(today, 0);
  while (weekKeys[GRX2_monday(cursor)]) {
    streak++;
    cursor = GRX2_addDays(cursor, -7);
    if (streak > 520) break;   // 안전장치
  }

  // 함께한 지 N일째 — 시작일과 첫 출석일 중 빠른 쪽 기준
  var startD = GRX2_parse(m.start);
  var base = startD;
  if (first && (!base || GRX2_days(first, base) > 0)) base = first;
  var togetherDays = base ? GRX2_days(base, today) + 1 : 1;

  // 남은 기간 / 남은 횟수
  var isCount = (String(m.type) === "count");
  var end = isCount ? null : GRX2_endDate(m);
  var dDay = end ? GRX2_days(today, end) : null;
  var total = Number(m.total) || 0;
  var used = Number(m.used) || 0;

  return {
    ok: true,
    result: result,
    id: GRX2_key(m),
    name: m.name,
    plan: m.plan,
    type: isCount ? "count" : "period",
    today: GRX2_fmt(today),
    time: Utilities.formatDate(new Date(), GRX2_TZ, "HH:mm"),
    year: y,
    month: mo,
    monthDays: monthDays,
    monthCount: monthDays.length,
    totalCount: dates.length,
    streakWeeks: streak,
    togetherDays: togetherDays,
    endDate: GRX2_fmt(end),
    dDay: dDay,
    countLeft: isCount ? (total - used) : null,
    total: isCount ? total : null,
    used: isCount ? used : null,
    hold: GRX2_holdInfo(m, today)
  };
}


/* ══════════════════════════════════════════════════════════════════════════
   ⑨  [부록] 기존(회원관리) Apps Script 프로젝트에 붙여넣는 헬퍼
   ──────────────────────────────────────────────────────────────────────────
   D-7 / D-3 만료 임박 문자 발송 코드에서 홀딩 중 회원을 제외하려면
   아래 GRXHOLD_ 함수들을 **기존 프로젝트**에 그대로 복사해 넣고,
   문자 발송 반복문 안에 한 줄만 추가하세요.

       // 회원 한 명씩 도는 반복문 안에서
       if (GRXHOLD_isHolding(회원의ID_또는_전화번호)) continue;   // ← 홀딩 중이면 건너뜀

   만료일 계산도 홀딩 연장분을 반영하려면 (D-7/D-3 을 정확히 맞추려면):

       var 만료일 = new Date(시작일);
       만료일.setMonth(만료일.getMonth() + 개월수);
       만료일.setDate(만료일.getDate() + GRXHOLD_holdDays(회원의ID_또는_전화번호));

   ※ 이 부록 함수들은 이 파일 안의 다른 코드에 전혀 의존하지 않는 독립 코드라,
     새 프로젝트에 그대로 남겨두어도 아무 문제 없습니다.
   ══════════════════════════════════════════════════════════════════════════ */

/** 홀딩 정보 캐시 (한 번의 실행 안에서 시트를 반복해서 읽지 않도록) */
var GRXHOLD_CACHE = null;

function GRXHOLD_load_() {
  if (GRXHOLD_CACHE) return GRXHOLD_CACHE;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error("GRXHOLD_: 스프레드시트에 연결된 프로젝트가 아닙니다. openById 로 바꿔주세요.");
  var sheets = ss.getSheets();
  var map = {};
  for (var s = 0; s < sheets.length; s++) {
    var sh = sheets[s];
    if (sh.getLastRow() < 2 || sh.getLastColumn() < 1) continue;
    var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    var ci = -1, cp = -1, chs = -1, che = -1, chd = -1;
    for (var c = 0; c < head.length; c++) {
      var h = String(head[c]).replace(/[\s()\[\]_\-.·]/g, "").toLowerCase();
      if (h === "id" || h === "아이디" || h === "회원id") ci = c;
      else if (h === "phone" || h === "전화번호" || h === "연락처" || h === "휴대폰" || h === "전화") cp = c;
      else if (h === "홀딩시작일") chs = c;
      else if (h === "홀딩종료일") che = c;
      else if (h === "홀딩누적일") chd = c;
    }
    if (chs < 0) continue;   // 홀딩 열이 없는 시트는 건너뜀
    var rows = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
    for (var r = 0; r < rows.length; r++) {
      var row = rows[r];
      var rec = {
        holdStart: chs >= 0 ? row[chs] : "",
        holdEnd  : che >= 0 ? row[che] : "",
        holdDays : chd >= 0 ? (Number(row[chd]) || 0) : 0
      };
      if (ci >= 0 && String(row[ci]).trim()) map[String(row[ci]).trim()] = rec;
      if (cp >= 0) {
        var d4 = String(row[cp]).replace(/\D/g, "").slice(-4);
        if (d4.length === 4) map["p:" + d4] = rec;
      }
    }
    break;
  }
  GRXHOLD_CACHE = map;
  return map;
}

function GRXHOLD_get_(who) {
  var map = GRXHOLD_load_();
  var k = String(who == null ? "" : who).trim();
  if (map[k]) return map[k];
  var d4 = k.replace(/\D/g, "").slice(-4);
  if (d4.length === 4 && map["p:" + d4]) return map["p:" + d4];
  return null;
}

function GRXHOLD_date_(v) {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : new Date(v.getFullYear(), v.getMonth(), v.getDate());
  var t = String(v).trim().split("T")[0].replace(/[.\/\s]+/g, "-").replace(/-+$/, "");
  var m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/** 회원 ID(또는 전화번호)로 지금 홀딩 중인지 확인 */
function GRXHOLD_isHolding(who) {
  var rec = GRXHOLD_get_(who);
  if (!rec) return false;
  var s = GRXHOLD_date_(rec.holdStart);
  if (!s) return false;
  var now = new Date();
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (s.getTime() > today.getTime()) return false;
  var e = GRXHOLD_date_(rec.holdEnd);
  if (e && e.getTime() <= today.getTime()) return false;
  return true;
}

/** 그 회원의 홀딩 누적일수 (만료일 계산에 더해 쓰세요) */
function GRXHOLD_holdDays(who) {
  var rec = GRXHOLD_get_(who);
  return rec ? (Number(rec.holdDays) || 0) : 0;
}

/** 지금 홀딩 중인 회원 키 목록 */
function GRXHOLD_holdingList() {
  var map = GRXHOLD_load_(), out = [];
  for (var k in map) {
    if (!map.hasOwnProperty(k)) continue;
    if (k.indexOf("p:") === 0) continue;
    if (GRXHOLD_isHolding(k)) out.push(k);
  }
  return out;
}
