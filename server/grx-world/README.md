# grx-world (GRX 온라인 체육관 실시간 서버)

화면: crbuses.com/grx-gym/ (3D 체육관). 지금은 회원 입장(이름+뒤4자리 → 누적 출석일)에 쓰고, 나중에 실시간 접속(/beat)에 씀.

- 키오스크 서버(grx-api, 8100)와 **완전히 분리**. 포트 8110, 메모리 상한 150MB. 이게 죽어도 출석은 영향 없음
- grx.db 는 **읽기 전용**으로만 엶 (회원 이름+뒤4자리 확인, 누적 출석일)
- 접속자·횟수는 메모리, 종목별 누적만 data.json

## 설치 (bitauto 서버)
```
mkdir -p /opt/grx-world && cd /opt/grx-world
curl -fsSL -o app.py https://raw.githubusercontent.com/rladydgns3001-ui/crbuses/main/server/grx-world/app.py
curl -fsSL -o /etc/systemd/system/grx-world.service https://raw.githubusercontent.com/rladydgns3001-ui/crbuses/main/server/grx-world/grx-world.service
python3 -m venv venv && ./venv/bin/pip install -q fastapi uvicorn
systemctl daemon-reload && systemctl enable --now grx-world
curl -s localhost:8110/health
```

## 주소 연결 (Cloudflare Tunnel)
기존 grx.crbuses.com 터널에 world.crbuses.com → http://localhost:8110 추가
- 설정 파일 방식이면 /etc/cloudflared/config.yml 의 ingress 에서 `- service: http_status:404` 줄 **위에** 추가 후
  `cloudflared tunnel route dns <터널이름> world.crbuses.com` → `systemctl restart cloudflared`
- 토큰(대시보드) 방식이면 Cloudflare Zero Trust → Networks → Tunnels → 해당 터널 → Public Hostname 추가

확인: `curl -s https://world.crbuses.com/health` → {"ok":true,...}
