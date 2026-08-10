# 개발·제출 실행 안내

> 갱신일: 2026-08-10
> 정본: 루트 `README.md`

현재 게임은 React/Three.js 클라이언트와 FastAPI WebSocket 서버로 구성된다. 서버가 금기어, 위치, 층 진행, AI, 술래, 빙결, 구조, 미션, 주문과 탈출을 최종 판정한다.

## 개발 실행

터미널 1:

```bash
cd server
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --reload-dir app --host 0.0.0.0 --port 8000
```

터미널 2:

```bash
cd client
npm ci
npm run dev
```

브라우저에서 `http://localhost:5173`을 연다. 개발 클라이언트는 같은 호스트의 8000번 포트에 연결한다.

## 제출용 production 실행

```bash
docker build -t ice-ddaeng:submission .
docker run --rm -p 8000:8000 ice-ddaeng:submission
```

브라우저 주소는 `http://localhost:8000`, 상태 확인은 `http://localhost:8000/health`다. 컨테이너 안에서 FastAPI가 production 클라이언트와 `/ws`를 같은 origin으로 제공한다.

게임 세션은 메모리 기반이므로 배포 시 인스턴스와 worker는 각각 1개로 유지한다.

## 검증

```bash
cd client
npm run lint
npm run build
npm run verify:campus

cd ../server
.venv/bin/pytest -q
```

세부 환경 변수와 Docker 없는 실행 방법은 루트 `README.md`를 따른다.
