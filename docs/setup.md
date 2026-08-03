# 개발 환경 셋업

> 작성일: 2026-08-03
> 상태: 초기 셋업 완료

---

## 런타임 환경

| 항목 | 버전 |
|------|------|
| Node.js | v25.2.1 |
| npm | 11.6.2 |
| Python | 3.14.6 |
| OS | macOS (Apple Silicon) |

---

## 프로젝트 구조

```
game-hackathon/
├── client/          # React + Vite + R3F
├── server/          # FastAPI (Python)
├── docs/            # 기획서, 기술문서, ADR, 셋업 등
├── CLAUDE.md
├── .gitignore
└── README.md
```

---

## Client (React + R3F)

### 생성 방법
```bash
npm create vite@latest client -- --template react-ts
```

### 핵심 의존성

| 패키지 | 용도 |
|--------|------|
| react | UI 프레임워크 |
| three | 3D 렌더링 엔진 |
| @react-three/fiber | React에서 Three.js를 선언적으로 사용 (R3F) |
| @react-three/drei | R3F 헬퍼 (Text, Billboard, Controls 등) |
| zustand | 클라이언트 상태 관리 |
| @types/three | Three.js 타입 정의 (devDep) |

### 실행
```bash
cd client
npm install
npm run dev
# http://localhost:5173
```

---

## Server (FastAPI)

### 디렉토리 구조
```
server/
├── app/
│   ├── main.py          # FastAPI 엔트리 + CORS + /health
│   ├── ws/
│   │   ├── handler.py   # WebSocket 엔드포인트 (/ws/{room_id}/{player_id})
│   │   └── manager.py   # Room 기반 연결 관리 + broadcast
│   ├── game/            # 게임 상태 (미구현)
│   ├── ai/              # 금기어 판정 등 (미구현)
│   └── data/            # JSON 데이터 (미구현)
├── .venv/
└── requirements.txt
```

### 핵심 의존성

| 패키지 | 버전 | 용도 |
|--------|------|------|
| fastapi | >=0.115.0 | 웹 프레임워크 |
| uvicorn[standard] | >=0.34.0 | ASGI 서버 |
| websockets | >=15.0 | WebSocket 지원 |
| kiwipiepy | >=0.21.0 | 한국어 형태소 분석 (Java 불필요) |
| jamo | >=0.4.1 | 한글 자모 분리 |
| python-Levenshtein | >=0.27.0 | 편집거리 (유사 발음 매칭) |
| pydantic | >=2.10.0 | 데이터 검증 |

### 실행
```bash
cd server
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
# http://localhost:8000/health → {"status": "ok"}
```

---

## WebSocket 구조

- 엔드포인트: `/ws/{room_id}/{player_id}`
- Room 기반 — 싱글 플레이도 room_id를 부여 (멀티 확장 대비)
- 현재는 에코 응답으로 연결 검증만 동작
- `manager.py`의 `ConnectionManager`가 방 생성/삭제, 브로드캐스트, 개별 전송 담당

---

## 동작 확인 완료 항목

- [x] FastAPI 서버 기동 (`uvicorn app.main:app`)
- [x] `/health` 엔드포인트 200 OK
- [x] WebSocket 핸들러 연결 구조 (`/ws/{room_id}/{player_id}`)
- [x] Room 기반 ConnectionManager (connect, disconnect, broadcast, send_to)
- [x] CORS 전체 허용 (개발용)
- [ ] 클라이언트 ↔ 서버 WebSocket 실제 연결 테스트
- [ ] 금기어 판정 엔진 연결
