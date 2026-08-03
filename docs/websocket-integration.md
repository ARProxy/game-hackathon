# WebSocket 통합 — 금기어 판정 연결

> 작성일: 2026-08-03
> 관련 파일:
> - `server/app/ws/manager.py` — 메시지 핸들러
> - `server/app/game/state.py` — 게임 상태 모델
> - `server/app/game/session.py` — 세션 관리
> 상태: 구현 완료, 통합 테스트 통과

---

## 게임 상태 모델

### 핵심 구조

```
SessionManager (싱글톤)
  └── GameSession (room_id별 1개)
        ├── GameState (상태: 플레이어, 금기어, 단서, 페이즈)
        └── ForbiddenWordEngine (금기어 판정)
```

### GameState 주요 필드

| 필드 | 타입 | 용도 |
|------|------|------|
| room_id | str | 방 식별자 |
| phase | GamePhase | lobby → onboarding → playing → final_spell → result |
| players | dict[str, Player] | 플레이어 상태 (위치, 빙결, 역할) |
| forbidden_words | list[str] | 현재 금기어 목록 |
| clues | list[MissionClue] | 획득한 단서 |
| freeze_timeout_sec | float | 빙결 제한시간 (기본 30초) |

### Player 상태

| 상태 | 설명 |
|------|------|
| ALIVE | 정상. 이동, 발화, 상호작용 가능 |
| FROZEN | 빙결. 이동/상호작용 불가. 발화 무시. 구조 대기 |
| ELIMINATED | 탈락. 게임에서 제외 |

### 역할

| 역할 | 설명 |
|------|------|
| HUMAN | 인간 플레이어 |
| AI_PARTNER | AI 동료 |
| SEEKER | 술래 |

---

## WebSocket 메시지 흐름

### Client → Server

| type | payload | 처리 |
|------|---------|------|
| `start_game` | `{ forbidden_words?: string[] }` | 금기어 설정, phase를 playing으로 전환 |
| `speech` | `{ transcript: string, is_final: boolean }` | 금기어 판정 → freeze 또는 speech_safe |
| `action` | `{ action_type: "move", x, z }` | 플레이어 위치 업데이트 |
| `action` | `{ action_type: "rescue", target_id }` | 빙결 해제 |

### Server → Client (broadcast)

| type | 발생 조건 | 포함 데이터 |
|------|-----------|-------------|
| `game_started` | start_game 처리 후 | 전체 GameState |
| `freeze` | 금기어 발화 | player_id, matched_word, stage, confidence, position |
| `speech_safe` | 안전한 발화 | player_id, transcript |
| `player_moved` | 이동 | player_id, position |
| `rescued` | 구조 성공 | rescuer_id, target_id |
| `game_over` | 전원 빙결/탈락 | reason |

---

## Room 구조 (멀티 확장 대비)

- WebSocket 엔드포인트: `/ws/{room_id}/{player_id}`
- 싱글 플레이도 room_id를 부여 (예: `solo-{uuid}`)
- ConnectionManager가 WebSocket 연결 관리
- SessionManager가 GameState + Engine 관리
- 방에 플레이어가 없으면 자동 정리

---

## 통합 테스트 결과 (2026-08-03)

| 단계 | 입력 | 결과 |
|------|------|------|
| 게임 시작 | `start_game` + 금기어 3개 | `phase=playing`, 금기어 확인 |
| 안전 발화 | "반짝이는 물건 확인해줘" | `speech_safe` 브로드캐스트 |
| 금기어 발화 | "열쇠를 가져와" | `freeze`, `word=열쇠`, `stage=exact`, `0.0ms` |
| 빙결 중 발화 | "커피 마시자" | 발화 무시, 전원 빙결로 `game_over` |

---

## 다음 단계

- [ ] 게임 상태 모델 단위 테스트
- [ ] WebSocket 통합 테스트 (pytest)
- [ ] Phase 2: 클라이언트 R3F 맵 + 캐릭터
