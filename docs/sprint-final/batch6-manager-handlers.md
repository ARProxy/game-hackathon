# Batch 6: manager.py 멀티플레이 핸들러 설계

## 새 메시지 타입

### 클라이언트 → 서버

| type | payload | 설명 |
|------|---------|------|
| create_room | {} | 방 생성 (호출자가 방장) |
| join_room | {room_id} | 기존 방 참가 |
| leave_room | {} | 방 퇴장 |
| select_character | {character_id} | 캐릭터 선택 |
| player_ready | {ready: bool} | 준비 상태 변경 |
| start_game | {} | 방장이 게임 시작 |

### 서버 → 클라이언트

| type | payload | 설명 |
|------|---------|------|
| room_created | {room_id, room} | 방 생성 완료 |
| room_joined | {player_id, room} | 참가 완료 |
| room_left | {player_id, room} | 퇴장 알림 |
| room_error | {reason} | 방 관련 오류 |
| character_selected | {player_id, character_id, room} | 캐릭터 선택 알림 |
| player_ready_changed | {player_id, ready, room} | 준비 상태 변경 |
| game_starting | {human_players, ai_partners} | 게임 시작 (AI 충원 정보) |

## WebSocket 연결 흐름 변경

현재: `/ws/{room_id}/{player_id}` — room_id를 미리 알아야 함

변경: 두 가지 엔드포인트
1. `/ws/lobby/{player_id}` — 로비 (방 생성/참가)
2. `/ws/{room_id}/{player_id}` — 게임 (기존 유지)

또는 단일 엔드포인트에서 room_id = "lobby"인 경우 방 관리 모드.

## 구현 순서

1. room.py는 이미 작성됨 (16 tests passed)
2. manager.py에 방 메시지 핸들러 추가
3. session.py에 RoomConfig 연동
4. 다중 인간 빙결/구조 검증
5. 개별 탈출 판정
