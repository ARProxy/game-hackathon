# Batch 6-7: 멀티플레이 방 시스템 설계

## 기획서 원문 (game-design-final.md 4.1절)

> | 역할 | 솔로 | 멀티 |
> |---|---|---|
> | 인간 플레이어 | 1명 | 2~4명 |
> | AI 동료 | 2명 | 부족한 슬롯을 AI가 채움 |
> | AI 술래 | 1명 | 1명 |
> | 합계 | 4캐릭터 | 최대 5캐릭터 |

## 서버 구현 명세

### Phase 1: 방 시스템

#### 새 모듈: app/game/room.py

```python
@dataclass
class RoomConfig:
    room_id: str
    host_id: str                    # 방장
    max_players: int = 4            # 최대 인간 플레이어
    runner_slots: int = 4           # 도망자 슬롯 (인간 + AI)
    state: RoomState = RoomState.WAITING

class RoomState(str, Enum):
    WAITING = "waiting"             # 대기 중
    CHARACTER_SELECT = "character_select"  # 캐릭터 선택
    ONBOARDING = "onboarding"       # 온보딩 진행
    PLAYING = "playing"             # 게임 중
    RESULT = "result"               # 결과
```

#### 방 생명주기

```
create_room(host_id) → room_id
  ↓
join_room(room_id, player_id) → 참가
  ↓
select_character(player_id, character_id) → 캐릭터 선택 (중복 방지)
  ↓
ready(player_id) → 준비 완료
  ↓
start_game(host_id) → AI 충원 + 게임 시작
```

#### 캐릭터 선택

```python
CHARACTERS = {
    "R01": {"name": "캡", "color": "오렌지"},
    "R02": {"name": "고글", "color": "파랑"},
    "R03": {"name": "리본", "color": "분홍"},
    "R04": {"name": "탑햇", "color": "보라"},
    "R05": {"name": "헤드셋", "color": "연두"},
}

# R00(술래)은 선택 불가
# 중복 선택 불가 — 먼저 선택한 플레이어 우선
```

#### AI 충원

```python
def fill_ai_partners(room: RoomConfig, session: GameSession):
    human_count = len([p for p in session.state.players.values()
                       if p.role == PlayerRole.HUMAN])
    needed_ai = room.runner_slots - human_count - 1  # -1은 술래
    # 남은 캐릭터 ID에서 AI 배정
    available = [c for c in CHARACTERS if c not in selected_characters]
    for i, char_id in enumerate(available[:needed_ai]):
        session.state.add_player(f"partner-{i}", PlayerRole.AI_PARTNER)
```

### Phase 2: 멀티 게임 루프

#### 다중 인간 플레이어 처리

**빙결**:
- 모든 인간 플레이어에게 금기어 판정 적용
- 각 플레이어 독립적으로 빙결/구조
- 전원 빙결 시에만 게임 오버 (인간 + AI 모두)

**금기어 정보 공개**:
- 솔로: 전원 동일 공개
- 멀티: 전원 동일 공개 (기획서 v4 확정)

**구조**:
- 인간이 다른 인간을 구조 가능 (2m 이내 + E키 또는 "땡")
- AI가 인간을 구조 가능 (기존 로직)
- 인간이 AI를 구조 가능 (기존 로직)

**개별 탈출**:
- 탈출문이 열리면 각 도망자가 개별적으로 센서 통과
- 먼저 통과한 사람은 탈출, 나머지는 계속 진행
- 전원 탈출 또는 전원 행동 불능 시 게임 종료
- 부분 탈출도 결과에 반영

#### WebSocket 메시지 확장

```python
# 새 메시지 타입
"create_room" → {"type": "room_created", "room_id": str}
"join_room" → {"type": "room_joined", "player_id": str, "players": list}
"select_character" → {"type": "character_selected", "player_id": str, "character_id": str}
"player_ready" → {"type": "player_ready", "player_id": str}
"room_state" → {"type": "room_state", "players": list, "ready": list}
```

### manager.py 수정사항

1. `_handle_message()`에 방 관련 메시지 타입 추가
2. `connect()`에서 방 참가 로직
3. `_handle_start_game()`에서 AI 충원 로직
4. 빙결 판정에서 인간/AI 구분 유지 (인간만 금기어 빙결)
5. 구조에서 인간→인간 허용
6. 개별 탈출 판정

### state.py 수정사항

- `all_non_seeker_frozen_or_eliminated()` → 모든 도망자 확인 (변경 없음)
- 개별 탈출 상태 추적 (escaped 목록)

### session.py 수정사항

- `RoomConfig` 저장
- 캐릭터 선택 상태 관리
- AI 충원 로직
