# 배치 작업 운영 계획서

> 작성일: 2026-08-04
> 목적: 사람이 자리를 비운 동안 에이전트들이 자율적으로 작업을 이어가는 구조 정의
> 마감: 8월 10일 (남은 일수 6일)

---

## 1. 에셋 다운로드 목록

### 1.1 즉시 다운로드 (curl 직접 가능)

| # | 에셋팩 | URL | 포맷 | 모델 수 | 용도 |
|---|--------|-----|------|---------|------|
| 1 | Kenney Nature Kit | https://kenney.nl/assets/nature-kit | GLB | 330 | 나무/관목/울타리 — 맵 전체 빈 공간 채우기, 시야 차단 |
| 2 | Kenney Car Kit | https://kenney.nl/assets/car-kit | GLB | 45 | 주차장 차량, 자전거 보관대 |
| 3 | Kenney City Kit Roads | https://kenney.nl/assets/city-kit-roads | GLB | 70 | 후문 골목 가로등/표지판/소화전 |
| 4 | Kenney City Kit Suburban | https://kenney.nl/assets/city-kit-suburban | GLB | 40 | 학교 주변 울타리/나무/차도 |

### 1.2 수동 다운로드 필요 (사람이 돌아온 후)

| # | 에셋팩 | URL | 이유 |
|---|--------|-----|------|
| 5 | Tiny Treats Fun Playground | https://tinytreats.itch.io/fun-playground | itch.io 브라우저 로그인 필요 |
| 6 | Tiny Treats Pretty Park | https://tinytreats.itch.io/pretty-park | itch.io 브라우저 로그인 필요 |
| 7 | KayKit Furniture Bits | https://kaylousberg.itch.io/furniture-bits | itch.io 수동 |
| 8 | Quaternius Nature MegaKit | https://quaternius.com/packs/stylizednaturemegakit.html | 수동 다운로드 |

### 1.3 다운로드 후 처리 절차

```
1. ZIP 다운로드 → /tmp/에 압축 해제
2. GLB/GLTF 파일만 선별
3. 사용할 것 → client/public/models/에 복사
4. 원본 ZIP + 나머지 → _assets-archive/{팩이름}/에 보관
5. .gitignore에 이미 _assets-archive/ 포함됨
```

---

## 2. 에이전트 역할 정의

### 2.0 통합 에이전트 (Integration Lead) — 최우선 선행 역할

**역할**: 클라이언트와 서버 사이의 게임 상태를 하나의 계약으로 통합하고, 다른 에이전트가 작업할 수 있는 빌드 가능한 기준선을 만든다. 신규 콘텐츠보다 먼저 수행한다.

**담당 영역**:
- `client/src/App.tsx`, `client/src/hooks/useWebSocket.ts`, `client/src/stores/gameStore.ts`
- `server/app/ws/manager.py`, `server/app/game/state.py`, `server/app/game/session.py`
- `docs/websocket-messages.md` (신규, 메시지 계약의 정본)

**선행 작업 순서**:

| 순위 | 작업 | 완료 조건 |
|------|------|----------|
| 0 | 현재 클라이언트 빌드 복구 | `npm run build` 성공 |
| 1 | WebSocket 메시지 계약 문서화 | payload, 송신 주체, 수신 주체, 서버 권위 여부 명시 |
| 2 | 플레이어 위치 동기화 | 이동 중 제한된 주기로 `action: move` 전송, 빙결 핑이 실제 좌표 사용 |
| 3 | AI 동료 서버 등록 | 인간 1명 빙결이 즉시 `all_frozen` 게임 오버가 되지 않음 |
| 4 | 구조 서버 권위화 | 동료 구조가 `action: rescue`를 거쳐 서버와 클라이언트 모두 해제 |
| 5 | 트랩 서버 권위화 | 트랩 ID와 실제 위치를 서버에 전달하고 동일한 freeze 이벤트 수신 |
| 6 | 미션/주문 상태 통합 | 프롭 진위·단서·페이즈를 서버가 검증, 주문 성공 기준 2/3 보장 |
| 7 | 재시작 세션 초기화 | 새 room/session으로 온보딩부터 재시작 |

**차단 규칙**:
- 위 0~4가 끝나기 전 서버·게임 에이전트는 동일 파일을 수정하지 않는다.
- 통합 에이전트가 메시지 계약을 확정하기 전 임의의 WebSocket 타입을 추가하지 않는다.
- 테스트 통과만으로 완료 처리하지 않고, 실제 브라우저 한 판에서 상태 왕복을 확인한다.

**산출물**: `review/YYYY-MM-DD_HHMMSS_integration-report.md`

### 2.1 기획 에이전트 (Plan Guardian)

**역할**: 기획서의 수호자. 다른 에이전트가 기획 의도를 벗어나지 않도록 감시.

**참조 문서**:
- `docs/game-design.md` — 기획 1 (핵심 정체성과 기본 루프 정본)
- `docs/game-design-v2.md` — 기획 2 (현재 목표 경험과 명시적 개정 정본)
- `docs/gap-analysis.md` — 기획 대비 미구현 항목
- `CLAUDE.md` — 게임 핵심 규칙 (정확한 팩트)

**행동 규칙**:
- 모든 사이클 시작 시 기획 1 → 기획 2 순서로 읽고, 종료 시 두 문서에 번갈아 대조한다.
- 매 라이프사이클(20분)마다 다른 에이전트의 변경사항을 git diff로 확인
- 기획서에 명시된 규칙과 충돌하는 구현이 있으면 즉시 경고 문서 작성
- "본선에서 할 것"이라는 접근은 차단
- 기획서의 핵심 원칙 체크리스트:
  - [ ] "말하면 위험하다"가 유지되는가?
  - [ ] AI가 빠지면 게임이 안 되는 구조인가?
  - [ ] 금기어 → 빙결 → 술래 추격 루프가 작동하는가?
  - [ ] 온보딩 → 미션 → 주문 → 탈출 전체 플로우가 있는가?
  - [ ] 3~5분 내에 한 판이 끝나는가?

**산출물**: `review/YYYY-MM-DD_HHMMSS_plan-review.md`

---

### 2.2 서버 에이전트 (Python Backend)

**역할**: 서버 측 핵심 기능 구현. 기획 에이전트와 지속 협업.

**담당 영역**:
- `server/app/ai/` — AI 관련 로직 전체
- `server/app/ws/` — WebSocket 통신
- `server/app/game/` — 게임 상태 관리

**우선순위 작업**:

| 순위 | 작업 | 기획서 근거 | 파일 |
|------|------|------------|------|
| 1 | 통합 기준선 인수 | Integration Lead가 확정한 메시지 계약과 서버 권위 상태 유지 | ws/manager.py, game/session.py |
| 2 | 빙결 30초 사망 타이머 | 검사 메서드만 두지 않고 실제 주기 실행·탈락 broadcast 구현 | game/state.py, ws/manager.py |
| 3 | 술래 음성 반응 | "플레이어가 말하면 그 방향/거리를 감지" | ws/manager.py 수정 |
| 4 | 금기어 3분 주기 교체 | "3분 주기로 교체: 게임 중 대화를 분석하여 순환" | game/session.py, ai/forbidden.py |
| 5 | AI 동료 우회 표현 이해 | "우회 표현으로 AI에게 지시 → AI가 추론하고 행동" | ai/partner.py (신규) |
| 6 | 대화 기반 실시간 금기어 채집 | "게임 중 대화에서도 추가 채집" | ai/onboarding.py 확장 |
| 7 | STT 폴백용 텍스트 메시지 처리 | 음성과 같은 판정 경로 재사용 | ws/manager.py |

**협업 규칙**:
- WebSocket 메시지 타입을 추가할 때 반드시 클라이언트 에이전트에 인터페이스 명세 전달
- 새 메시지 타입: `docs/websocket-messages.md`에 기록
- 기획 에이전트에게 "이 구현이 기획 의도에 맞는지" 확인 요청

**산출물**: `review/YYYY-MM-DD_HHMMSS_server-report.md`

---

### 2.3 게임 에이전트 (Client Game)

**역할**: 완벽한 게임 경험 구현. 맵, 캐릭터, 조명, 인터랙션, UI.

**담당 영역**:
- `client/src/game/` — 3D 씬, 캐릭터, 맵
- `client/src/components/` — UI (HUD, 온보딩, 정산)
- `client/src/hooks/` — WebSocket, Speech, Keyboard
- `client/src/stores/` — Zustand 상태

**우선순위 작업**:

| 순위 | 작업 | 상세 | 파일 |
|------|------|------|------|
| 0 | 통합 기준선 인수 | 위치·구조·트랩·페이즈를 서버 계약에 맞게 연결 | App.tsx, hooks/useWebSocket.ts |
| 1 | 게임 기본 화면 전환 | 기본 카메라를 3D로 설정하고 CCTV/층 필터 패널을 개발 모드로 제한 | App.tsx |
| 2 | 시야 극단 축소 | Fog + 마스크. 플레이어 주변 5m만 보임 | game/Fog.tsx, App.tsx |
| 3 | 라운드 계획 연결 | `pickRound()` 결과를 `activeTraps`, `gateId`에 실제 전달 | App.tsx, game/SchoolCampus.tsx |
| 4 | 에셋 배치 (나무/조경) | 다운받은 Nature Kit GLB를 맵 빈 공간에 배치 | game/Vegetation.tsx (신규) |
| 5 | 캐릭터 움직임 자연스러움 | 걷기 바운스, 방향 전환 부드러움, idle 애니메이션 | game/Player.tsx, Partner.tsx |
| 6 | 술래 AI 강화 | 음성 반응, 시야 감지, 수색, 포획, RUSH 상태 | game/Seeker.tsx |
| 7 | AI 동료 자율 탐색 | 독립 탐색·정보 전달·위험 노출·서버 구조 요청 | game/Partner.tsx |
| 8 | 탈출 게이트 | 주문 성공 후 활성화, 술래 RUSH, 도달 시 승리 | game/SchoolCampus.tsx, game/Seeker.tsx |
| 9 | 사운드 | 빙결음, 구조음, 술래 발소리, 게이트 개방 | hooks/useSound.ts (신규) |
| 10 | WallOverlay/Furnishings InstancedMesh 교체 | GLB clone → InstancedMesh로 재활성화 | game/WallOverlay.tsx, Furnishings.tsx |
| 11 | 온보딩 재설계 | 면접형 → 연상 게임형 | components/Onboarding.tsx |
| 12 | 정산 화면 강화 | 서버 결과·금기어 출처·통계 | components/ResultScreen.tsx |

**기술 원칙**:
- InstancedMesh 우선 — 같은 GLB를 여러 번 배치할 때 반드시 인스턴싱
- PointLight 총 15개 이하 유지
- 새 컴포넌트 추가 시 frustumCulled 활성화
- Rapier 물리는 SchoolCampus compound collider 구조 유지

**산출물**: `review/YYYY-MM-DD_HHMMSS_game-report.md`

---

### 2.4 성능 에이전트 (Performance Reviewer)

**역할**: 코드 품질 감시, 성능 프로파일링, 다른 에이전트 작업 리뷰.

**행동 규칙**:
- 다른 에이전트의 라이프사이클이 끝날 때마다 변경된 파일을 리뷰
- `npx tsc --noEmit` + `npx vite build`로 빌드 검증
- draw call, physics body, PointLight 수를 추적
- 성능 위반 기준:
  - InstancedMesh 없이 같은 mesh 50개 이상 → 경고
  - PointLight 15개 초과 → 차단
  - 개별 RigidBody 100개 이상 → 경고
  - scene.clone() 반복 → 차단

**리뷰 포맷**:
```markdown
# 리뷰 — [에이전트명] [날짜]
## 변경 파일
## 성능 영향
## 빌드 결과
## 개선 제안
## 승인/반려
```

**산출물**: `review/YYYY-MM-DD_HHMMSS_perf-review.md`

---

## 3. 라이프사이클 규칙

### 3.0 작업 시작 게이트와 파일 소유권

1. 모든 에이전트는 시작 시 `git status --short`와 현재 diff를 읽고 사용자 변경을 보존한다.
2. 한 사이클에 한 파일의 주 편집자는 한 에이전트만 둔다. 공용 파일은 Integration Lead가 소유한다.
3. 다른 에이전트가 수정 중인 파일이 필요하면 직접 편집하지 않고 인터페이스 요청을 보고서에 남긴다.
4. 기존 변경을 `git checkout`, `git restore`, `git reset`으로 되돌리지 않는다.
5. 빌드 실패 상태에서는 신규 기능을 시작하지 않는다. 먼저 기준선 복구 후 기능 브랜치를 진행한다.
6. 커밋은 작업 단위별로 하되 관련 없는 기존 변경이나 대용량 원본 에셋을 포함하지 않는다.

### 3.0.1 동시 실행 슬롯 편성

현재 동시 실행 슬롯은 **총 4개(조정자 포함)**이므로 5개 역할을 동시에 실행하지 않는다. 역할은 상시 프로세스가 아니라 단계별 책임으로 운영한다.

```text
1단계 — 기준선 복구
  조정자 + Integration Lead + Plan Guardian + Performance Reviewer

2단계 — 핵심 기능 구현
  조정자 + Python Backend + Client Game + Performance Reviewer
  Plan Guardian은 사이클 종료 시 Performance Reviewer와 교대하여 검토

3단계 — 통합 QA
  조정자 + Integration Lead + Plan Guardian + Performance Reviewer
```

- 1단계 통과 전 서버와 게임 기능 에이전트를 동시에 투입하지 않는다.
- 같은 파일을 수정하는 역할은 반드시 시간적으로 분리한다.
- 유휴 에이전트를 유지하기보다 완료된 역할의 슬롯을 다음 역할에 넘긴다.

### 3.1 20분 배치 사이클

```
[0:00] 시작 — 이전 사이클 결과 확인, 작업 선택
[0:02] 작업 실행
[0:17] 작업 마무리 — 빌드 검증 (tsc + vite build)
[0:18] 문서 작성 — 의사결정 기록, 변경 사항
[0:20] 사이클 종료 → 다음 사이클 시작
```

### 3.2 30분 커밋 사이클

```
[0:00] git status 확인
[0:01] 변경 파일 분석
[0:02] 커밋 메시지 작성 (아래 형식)
[0:03] git add + git commit (push 안 함)
```

**커밋 메시지 형식**:
```
<Gitmoji> <Type>: 작업 요약.

- 변경 1
- 변경 2
- 변경 3

의사결정: 왜 이렇게 했는지 1줄

Co-Authored-By는 실제 작업에 참여한 에이전트만 기록한다.
```

**Gitmoji 규칙**:

| 종류 | 형식 | 용도 |
|------|------|------|
| 기능 | `👔 Feat:` | 새 게임 기능과 사용자 경험 |
| 수정 | `✏️ Fix:` | 버그 및 회귀 수정 |
| 문서 | `📝 Docs:` | 문서만 변경 |
| 리팩터링 | `♻️ Refactor:` | 동작을 유지한 구조 개선 |
| 테스트 | `✅ Test:` | 테스트 추가·수정 |
| 성능 | `⚡ Perf:` | 렌더링·메모리·네트워크 최적화 |
| 운영 | `🔖 Chore:` | 체크포인트, 설정, 배치 운영 |

- 제목은 기존 저장소 스타일에 맞춰 한국어로 작성하고 마침표로 끝낸다.
- 한 커밋에 여러 성격이 섞이면 사용자 체감 결과를 기준으로 대표 Gitmoji 하나를 고른다.
- 에이전트 이름을 제목 앞에 붙이지 않는다. 담당 에이전트는 보고서에서 추적한다.

예시:
```
👔 Feat: 시야 시스템 Fog 적용 — 플레이어 주변 5m만 가시.

- App.tsx: FogExp2 추가 (density 0.08)
- PlayerLight.tsx: 반경 축소 (10→5)
- SchoolCampus LAMPS: 거리 컬링 추가

의사결정: FogExp2가 선형 Fog보다 자연스러운 감쇠 제공

Co-Authored-By: <실제 참여 에이전트 이름과 주소>
```

### 3.3 에이전트 간 협업 프로토콜

```
서버가 WebSocket 메시지 추가 → docs/websocket-messages.md 업데이트
                              → 게임 에이전트가 hooks/useWebSocket.ts 반영

게임이 새 state 필드 필요     → stores/gameStore.ts에 추가
                              → 서버 에이전트에 state.to_dict() 반영 요청

기획 에이전트가 경고 발행      → review/에 경고 문서
                              → 해당 에이전트가 다음 사이클에서 수정

성능 에이전트가 반려           → review/에 반려 문서
                              → 해당 에이전트가 다음 사이클에서 수정 후 재리뷰 요청
```

---

## 4. 작업 우선순위 총괄 (에이전트 무관)

기획서 핵심 재미("말하면 위험하다") 기준으로 정렬.

| 순위 | 작업 | 담당 | 시간 추정 | 기획 임팩트 |
|------|------|------|----------|------------|
| 0 | 빌드 복구 + 상태 계약 통합 | 통합 | 2사이클 | 이후 작업의 안전한 기준선 |
| 1 | 위치·구조·트랩 서버 동기화 | 통합 | 2사이클 | 핵심 루프의 실제 일관성 |
| 2 | 싱글 팀 구성 + 30초 사망 | 통합+서버 | 1사이클 | 즉시 게임오버 제거, 긴박감 |
| 3 | 시야 극단 축소 + 기본 3D 카메라 | 게임 | 1사이클 | 숨바꼭질 전제 조건 |
| 4 | 술래 음성 반응·포획 | 서버+게임 | 2사이클 | "말하면 온다" = 게임 정체성 |
| 5 | 랜덤 트랩·게이트 + RUSH | 서버+게임 | 2사이클 | 최종 미션 완성 |
| 6 | AI 동료 자율 탐색 | 서버+게임 | 3사이클 | AI 활용 핵심 어필 |
| 7 | 금기어 3분 교체 | 서버 | 1사이클 | 긴장 리셋 |
| 8 | 사운드 | 게임 | 2사이클 | 술래 존재감 |
| 9 | 온보딩 재설계 | 게임 | 1사이클 | 시연 영상 첫 인상 |
| 10 | 에셋·인스턴싱 폴리시 | 게임+성능 | 2사이클 | 성능을 유지한 비주얼 복원 |

---

## 5. 금지 사항

- **기획서에 없는 기능 추가 금지** — 기획 에이전트가 승인하지 않은 새 메카닉은 만들지 않는다
- **push 금지** — commit만. push는 사람이 확인 후 수동으로
- **외부 API 의존 금지** — 무과금 원칙. Web Speech API 외 외부 서비스 호출 없음
- **기존 동작 파괴 금지** — 새 기능으로 회귀가 생기면 해당 에이전트 변경만 수정하거나 후속 커밋으로 되돌린다. 사용자 변경에 `git reset/restore/checkout` 사용 금지
- **미검증 완료 선언 금지** — 문서의 체크 표시보다 현재 명령 결과와 브라우저 검증을 우선한다
- **클라이언트 단독 상태 변경 금지** — 빙결·구조·탈락·미션 완료·승패는 서버 권위 이벤트를 통해 반영한다
- **대용량 원본 에셋 커밋 금지** — 런타임에 쓰는 최적화 모델만 `client/public/models/`에 둔다
- **PointLight 15개 초과 금지**
- **scene.clone() 반복 금지** — InstancedMesh 또는 재사용 구조 필수

---

## 6. 검증 기준

매 커밋 전 반드시 통과:

```bash
# 1. 타입 체크
cd client && npx tsc --noEmit

# 2. 빌드
npx vite build

# 3. 서버 테스트 (서버 변경 시)
cd ../server && python -m pytest tests/ -q

# 4. 성능 체크 (수동)
# - draw call 추정 < 500
# - PointLight < 15
# - physics bodies < 10
```

추가 필수 통합 시나리오:

```text
1. 서버 연결 → 온보딩 → 금기어 3개 발표
2. 이동 후 금기어 발화 → 실제 현재 좌표에서 빙결
3. 인간 1명 빙결 시 즉시 게임 오버가 발생하지 않음
4. AI 동료 구조 → 서버와 클라이언트 모두 alive
5. 트랩 → 빙결 → 30초 내 미구조 시 eliminated
6. 진짜 프롭만 단서 획득, 가짜 프롭은 진행도 증가 없음
7. 단서 3개 중 1개 발화는 실패, 2개 이상은 성공
8. 주문 성공 → 선택된 단일 게이트 활성화 → 술래 RUSH → 게이트 도달 시 승리
9. 다시 하기 → 새 세션에서 온보딩부터 정상 시작
```

### 6.1 2026-08-04 현재 기준선

- 서버: `47 passed`, Starlette TestClient deprecation warning 1건
- 클라이언트: `npm run build` 실패
- 대표 빌드 차단: Web Speech 타입, SchoolCampus `VISUALS.h` 타입, AssetTest GLTF 타입, 미사용 import/변수
- 문서의 과거 "빌드 통과" 기록보다 이 기준선을 우선한다.
- 첫 번째 배치의 종료 조건은 위 빌드 오류를 모두 제거하고 서버 47개 테스트를 유지하는 것이다.

---

## 7. 파일 구조 규칙

```
docs/
  batch-operation.md          ← 이 문서
  rendering-optimization.md   ← 성능 기록
  websocket-messages.md       ← 메시지 인터페이스 (신규)
  dev-log-day1-2.md           ← 개발 로그 (계속 추가)
  progress.md                 ← 진행 상황

review/
  YYYY-MM-DD_HHMMSS_{type}.md ← 에이전트 리뷰/보고

client/src/game/              ← 게임 컴포넌트
client/src/components/        ← UI
client/src/hooks/             ← 훅
client/src/stores/            ← 상태

server/app/ai/                ← AI 로직
server/app/ws/                ← WebSocket
server/app/game/              ← 게임 상태

_assets-archive/              ← 미사용 에셋 (.gitignore)
client/public/models/         ← 사용 중 에셋
```

---

## 8. 사람이 돌아왔을 때 확인할 것

1. `git log --oneline -20` — 커밋 히스토리 확인
2. `review/` 폴더 — 에이전트 보고서 읽기
3. `docs/progress.md` — 진행 상황 확인
4. `npx vite build` — 빌드 정상 확인
5. 브라우저에서 게임 실행 — 플레이 테스트
6. itch.io 에셋 수동 다운로드 (Fun Playground, Pretty Park, KayKit)
