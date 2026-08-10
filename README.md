# 얼음, 땡!

> 게임이 내 말을 배운다. 나는 게임이 무엇을 배웠는지 모른다.

『얼음, 땡!』은 밤의 학교에서 두 AI 동료와 층별 미션을 해결하고, 말소리를 추적하는 술래를 피해 탈출하는 3인칭 음성 협동 호러 게임입니다.

플레이 중 인간의 대화를 서버가 비공개로 분석해 금기어를 형성하고 일부를 교체합니다. 플레이어는 정확한 단어를 알 수 없으며, 빙결 결과와 AI의 우회 발화를 관찰해 위험한 말버릇을 추론해야 합니다.

## 제출 버전 핵심

- PC Web, 목표 플레이 시간 10~15분
- 솔로: 인간 1명 + 독립 AI 동료 2명
- 협동: 인간 2명 + 독립 AI 동료 2명
- 옥상 → 3층 → 2층 → 1층 → 운동장/지하 파이널
- 비공개 동적 금기어, 빙결과 구조
- 청각형 추격자와 시야형 차단자의 협공
- AI 후보 비교, 오해, 확인 질문과 교정
- 단서 추론형 최종 주문과 실제 게이트 통과

## 조작

| 입력 | 동작 |
| --- | --- |
| WASD | 이동 |
| 마우스 | 카메라 |
| Space | 점프 |
| E | 조사·장치 조작·구조 |
| Q | Push-to-Talk |
| Enter | 텍스트 음성 폴백 |
| R | 현재 기억 단서 재확인 |
| Esc | 일시정지·설정 |

Chrome 계열 브라우저의 음성 인식을 권장합니다. 마이크를 사용할 수 없는 환경에서는 Enter 텍스트 입력으로 동일한 게임 판정을 받을 수 있습니다.

## 가장 빠른 production 실행

Docker가 설치된 환경에서는 클라이언트와 서버를 한 이미지로 실행합니다.

```bash
docker build -t ice-ddaeng:submission .
docker run --rm -p 8000:8000 ice-ddaeng:submission
```

브라우저에서 `http://localhost:8000`을 엽니다. 상태 확인 주소는 `http://localhost:8000/health`입니다.

production 서버는 빌드된 클라이언트와 WebSocket을 같은 origin에서 제공합니다. 게임 상태가 메모리에 있으므로 배포 인스턴스 수는 반드시 1개로 유지해야 합니다.

## 로컬 개발

### 1. 서버

```bash
cd server
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --reload-dir app --host 0.0.0.0 --port 8000
```

### 2. 클라이언트

```bash
cd client
npm ci
npm run dev
```

개발 주소는 `http://localhost:5173`입니다. 개발 클라이언트는 같은 호스트의 8000번 포트에 있는 WebSocket 서버에 연결합니다.

## Docker 없이 production 실행

```bash
cd client
npm ci
npm run build

cd ../server
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

`client/dist/index.html`이 존재하면 FastAPI가 자동으로 production 클라이언트를 제공합니다. 별도 서버를 사용할 경우 클라이언트 빌드 시 `VITE_WS_URL=wss://example.com/ws`를 지정할 수 있습니다.

## 검증

```bash
cd client
npm run lint
npm run build
npm run verify:campus

cd ../server
.venv/bin/pytest -q
```

2026-08-10 제출 기준:

- 서버 테스트 391개 통과
- TypeScript production build 통과
- 클라이언트 lint 통과
- 학교 구조·충돌·AI 내비게이션 계약 통과
- Docker clean build, HTTP health·정적 페이지·WebSocket 왕복 통과
- production 브라우저에서 타이틀 → 옥상 진입 → 텍스트 발화 왕복 통과

## 제출 자료

- 최종 게임 소개서: `output/pdf/ice-ddaeng-final-game-design.pdf`
- 최종 AI 활용 기술 문서: `output/pdf/ice-ddaeng-final-ai-technology.pdf`
- 30~60초 하이라이트: `output/video/ice-ddaeng-gameplay-highlight-final.mp4`
- 옥상~파이널 확인용 플레이스루: `output/video/ice-ddaeng-rooftop-to-final-playthrough.mp4`
- 최종 구현·검증 기록: `docs/submission/final-implementation-report.md`
- 제출 직전 체크리스트·영상 구성: `docs/submission/submission-checklist.md`

PDF는 다음 명령으로 최신 Markdown 정본에서 다시 생성할 수 있습니다.

```bash
python3 -m pip install -r scripts/requirements-pdf.txt
python3 scripts/build_submission_pdfs.py
```

## 구조

```text
client/  React + TypeScript + React Three Fiber + Rapier + Zustand
server/  FastAPI + WebSocket + 서버 권위 게임 상태와 AI
docs/    기획 1~5, 구현 계약, QA와 제출 문서
```

서버가 문, 층 진행, 인간·AI·술래 위치, 금기어, 빙결, 구조, 미션, 주문과 탈출을 최종 판정합니다. LLM은 관찰된 후보의 추천과 표현만 담당하며 월드 사실이나 성공 여부를 결정하지 않습니다.

## 기획 정본

문서는 다음 순서로 읽습니다.

1. `docs/game-design.md`
2. `docs/game-design-v2.md`
3. `docs/game-design-v3.md`
4. `docs/game-design-v4.md`
5. `docs/game-design-v5.md`
6. `docs/design-thinking-journey.md`

최신 금기어 규칙은 기획 5가 이전 문서를 명시적으로 개정하며, 제출용 정본은 `docs/submission/final-game-design.md`와 `docs/submission/final-ai-technology.md`입니다.
