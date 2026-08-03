# Phase 3: 게임 루프 연결

> 작성일: 2026-08-03
> 상태: 완료

---

## 완료된 단계

### 3-1. Zustand 게임 상태 스토어
- `stores/gameStore.ts` — 게임 전역 상태
- 연결 상태, 게임 페이즈, 플레이어 상태, 금기어, 빙결 이벤트, 음성 상태, 자막
- React UI와 Three.js 씬이 동일 스토어 구독

### 3-2. WebSocket 연결 hook
- `hooks/useWebSocket.ts`
- 자동 연결 (solo-{timestamp} 방 생성)
- 수신 메시지를 Zustand에 반영 (game_started, freeze, rescued, speech_safe, game_over)
- send 함수로 메시지 전송

### 3-3. Web Speech API (Push-to-Talk)
- `hooks/useSpeech.ts`
- 스페이스바 누르는 동안 음성 인식 (Push-to-Talk)
- interim result → 실시간 자막 표시
- final result → 서버에 전송 → 금기어 판정
- `types/speech.d.ts` — SpeechRecognition 타입 선언
- localhost에서만 마이크 허용됨 (Chrome 보안 정책)

### 3-4. 음성 → 금기어 판정 → 빙결 연결
- GameController 컴포넌트에서 통합
- 접속 시 자동으로 게임 시작 (MVP: 기본 금기어 3개)
- 음성 final → WebSocket speech 메시지 → 서버 판정 → freeze 이벤트 → 클라이언트 반영

### 3-5. 빙결 연출
- Player.tsx에 빙결 상태 연동
- 빙결 시: 이동 불가, 색 변화 (시안 → 회색 lerp), 바운스 정지
- HUD에 "얼음!" 알림 + 매칭된 금기어 표시 (2초간)

### 3-6. 술래 캐릭터
- `game/Seeker.tsx` — FSM 기반
- PATROL: 웨이포인트 9개를 순회하며 맵 배회
- ALERT: 빙결 핑 감지 → 1.5초 멈추고 목표 방향 주시
- CHASE: 빙결 위치로 추격 (CHASE_SPEED 3.2)
- 도착 시 순찰로 복귀
- 크고 각진 형태, 마젠타 발광 눈, 추격 시 눈 색 더 강렬

### 3-7. AI 동료 + 구조 시스템
- `game/Partner.tsx`
- 평소: 플레이어 주변 공전 (FOLLOW_DISTANCE 2.5)
- 빙결 감지 → 빠르게 달려감 (RESCUE_SPEED 5.0)
- 구조 거리(1.2) 이내 도달 → 자동 빙결 해제
- 라임색, 작고 둥근 형태, 약한 발광

### 3-8. HUD
- `components/HUD.tsx`
- 좌상단: 서버 연결 상태 + 금기어 표시 (마젠타 배지)
- 하단 중앙: 마이크 상태 + 자막 (최근 2개) + 현재 인식 중 텍스트
- 화면 중앙: 빙결 알림 ("얼음!" + 매칭 단어, 2초 표시)

---

## 현재 동작하는 게임 루프

```
스페이스바 누르고 말하기 (PTT)
    ↓
Web Speech API → interim/final 텍스트
    ↓
final → WebSocket → 서버 금기어 판정
    ↓
금기어 매칭 → freeze 이벤트 broadcast
    ↓
클라이언트: 플레이어 빙결 (회색, 이동불가) + HUD "얼음!" 알림
    ↓
술래: ALERT → 1.5초 후 CHASE → 빙결 위치로 추격
    ↓
AI 동료: 빙결 감지 → 달려감 → 구조 거리 도달 → 빙결 해제
    ↓
플레이어 복구 (시안, 이동 가능)
```

---

## 파일 구조 (Phase 3 추가분)

```
client/src/
├── stores/
│   └── gameStore.ts         # Zustand 전역 상태
├── hooks/
│   ├── useKeyboard.ts       # (Phase 2)
│   ├── useWebSocket.ts      # WebSocket 연결/수신/전송
│   └── useSpeech.ts         # Web Speech API PTT
├── components/
│   └── HUD.tsx              # 금기어, 마이크, 자막, 빙결 알림
├── game/
│   ├── Player.tsx           # 빙결 상태 연동 추가
│   ├── Seeker.tsx           # 술래 FSM (순찰→감지→추격)
│   └── Partner.tsx          # AI 동료 (따라다님→구조)
└── types/
    └── speech.d.ts          # Web Speech API 타입
```

---

## 다음 단계 (Phase 4)

- 온보딩 (질문 → 음성 답변 → 금기어 채집)
- 미션 T1 (프롭 배치 → 우회 지시 → AI 탐색)
- 최종 미션 (주문 외치기 → 탈출)
- 승리/실패 화면
