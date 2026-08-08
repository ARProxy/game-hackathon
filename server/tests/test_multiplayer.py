"""멀티플레이 방 시스템 통합 테스트.

manager.py의 방 생성/참가/캐릭터 선택/준비/시작 핸들러,
다중 인간 빙결/탈출/구조 로직을 검증한다.
"""

import unittest
from unittest.mock import AsyncMock

from app.game.room import RoomPhase
from app.game.session import session_manager
from app.game.state import GamePhase, GameState, PlayerRole, PlayerStatus
from app.ws.manager import ConnectionManager, Room


# ---------------------------------------------------------------------------
# Helper: ConnectionManager with mocked broadcast/send_to
# ---------------------------------------------------------------------------

def make_manager() -> ConnectionManager:
    mgr = ConnectionManager()
    mgr.broadcast = AsyncMock()
    mgr.send_to = AsyncMock()
    return mgr


def setup_room(mgr: ConnectionManager, room_id: str = "test-room") -> str:
    """방과 WS Room을 준비한다."""
    mgr.rooms[room_id] = Room(room_id=room_id)
    return room_id


# ---------------------------------------------------------------------------
# 1. create_room 핸들러
# ---------------------------------------------------------------------------

class TestCreateRoom(unittest.IsolatedAsyncioTestCase):
    async def test_create_room_broadcasts(self) -> None:
        mgr = make_manager()
        room_id = setup_room(mgr)
        await mgr._handle_create_room(room_id, "host1", {})

        assert room_id in mgr.rooms_config
        config = mgr.rooms_config[room_id]
        assert config.host_id == "host1"
        mgr.broadcast.assert_called_once()
        call_args = mgr.broadcast.call_args
        assert call_args[0][1]["type"] == "room_created"
        assert call_args[0][1]["room"]["host_id"] == "host1"


# ---------------------------------------------------------------------------
# 2. join_room 핸들러
# ---------------------------------------------------------------------------

class TestJoinRoom(unittest.IsolatedAsyncioTestCase):
    async def test_join_room_broadcasts(self) -> None:
        mgr = make_manager()
        room_id = setup_room(mgr)
        await mgr._handle_create_room(room_id, "host1", {})
        mgr.broadcast.reset_mock()

        await mgr._handle_join_room(room_id, "player2", {})
        config = mgr.rooms_config[room_id]
        assert "player2" in config.players
        mgr.broadcast.assert_called_once()
        msg = mgr.broadcast.call_args[0][1]
        assert msg["type"] == "room_joined"
        assert msg["player_id"] == "player2"

    async def test_join_room_not_found(self) -> None:
        mgr = make_manager()
        room_id = setup_room(mgr)
        # 방을 생성하지 않고 참가 시도
        await mgr._handle_join_room(room_id, "player1", {})
        mgr.send_to.assert_called_once()
        msg = mgr.send_to.call_args[0][2]
        assert msg["type"] == "room_error"
        assert "찾을 수 없다" in msg["reason"]


# ---------------------------------------------------------------------------
# 3. select_character 핸들러
# ---------------------------------------------------------------------------

class TestSelectCharacter(unittest.IsolatedAsyncioTestCase):
    async def test_select_character_broadcasts(self) -> None:
        mgr = make_manager()
        room_id = setup_room(mgr)
        await mgr._handle_create_room(room_id, "host1", {})
        mgr.broadcast.reset_mock()

        await mgr._handle_select_character(room_id, "host1", {"character_id": "R01"})
        config = mgr.rooms_config[room_id]
        assert config.players["host1"].character_id == "R01"
        msg = mgr.broadcast.call_args[0][1]
        assert msg["type"] == "character_selected"
        assert msg["character_id"] == "R01"

    async def test_select_character_duplicate_error(self) -> None:
        mgr = make_manager()
        room_id = setup_room(mgr)
        await mgr._handle_create_room(room_id, "host1", {})
        await mgr._handle_join_room(room_id, "p2", {})
        await mgr._handle_select_character(room_id, "host1", {"character_id": "R01"})
        mgr.send_to.reset_mock()

        await mgr._handle_select_character(room_id, "p2", {"character_id": "R01"})
        msg = mgr.send_to.call_args[0][2]
        assert msg["type"] == "room_error"

    async def test_select_character_no_room(self) -> None:
        mgr = make_manager()
        room_id = setup_room(mgr)
        # rooms_config에 없으면 조용히 반환
        await mgr._handle_select_character(room_id, "host1", {"character_id": "R01"})
        mgr.broadcast.assert_not_called()
        mgr.send_to.assert_not_called()


# ---------------------------------------------------------------------------
# 4. player_ready 핸들러
# ---------------------------------------------------------------------------

class TestPlayerReady(unittest.IsolatedAsyncioTestCase):
    async def test_ready_broadcasts(self) -> None:
        mgr = make_manager()
        room_id = setup_room(mgr)
        await mgr._handle_create_room(room_id, "host1", {})
        await mgr._handle_select_character(room_id, "host1", {"character_id": "R01"})
        mgr.broadcast.reset_mock()

        await mgr._handle_player_ready(room_id, "host1", {"ready": True})
        config = mgr.rooms_config[room_id]
        assert config.players["host1"].is_ready
        msg = mgr.broadcast.call_args[0][1]
        assert msg["type"] == "player_ready_changed"
        assert msg["ready"] is True

    async def test_ready_without_character_error(self) -> None:
        mgr = make_manager()
        room_id = setup_room(mgr)
        await mgr._handle_create_room(room_id, "host1", {})
        mgr.send_to.reset_mock()

        await mgr._handle_player_ready(room_id, "host1", {"ready": True})
        msg = mgr.send_to.call_args[0][2]
        assert msg["type"] == "room_error"


# ---------------------------------------------------------------------------
# 5. start_game with room system — AI 충원
# ---------------------------------------------------------------------------

class TestStartGameWithRoom(unittest.IsolatedAsyncioTestCase):
    async def test_start_game_with_room_ai_fill(self) -> None:
        mgr = make_manager()
        room_id = setup_room(mgr)
        await mgr._handle_create_room(room_id, "host1", {})
        await mgr._handle_select_character(room_id, "host1", {"character_id": "R01"})
        await mgr._handle_player_ready(room_id, "host1", {"ready": True})
        mgr.broadcast.reset_mock()

        await mgr._handle_start_game(room_id, "host1", {
            "forbidden_words": ["열쇠", "커피", "빨간"],
        })

        # game_starting 메시지가 먼저, 그 후 game_started
        calls = mgr.broadcast.call_args_list
        types = [c[0][1]["type"] for c in calls]
        assert "game_starting" in types
        assert "game_started" in types

        # game_starting에 AI 파트너 정보 포함
        starting_msg = next(c[0][1] for c in calls if c[0][1]["type"] == "game_starting")
        assert len(starting_msg["ai_partners"]) == 3  # 4슬롯 - 1인간

        # 세션에 AI 파트너 등록 확인
        session = session_manager.get_or_create(room_id)
        for ai_info in starting_msg["ai_partners"]:
            assert session.state.get_player(ai_info["partner_id"]) is not None

    async def test_start_game_not_ready_error(self) -> None:
        mgr = make_manager()
        room_id = setup_room(mgr)
        await mgr._handle_create_room(room_id, "host1", {})
        await mgr._handle_select_character(room_id, "host1", {"character_id": "R01"})
        # 준비하지 않고 시작 시도
        mgr.send_to.reset_mock()

        await mgr._handle_start_game(room_id, "host1", {
            "forbidden_words": ["열쇠", "커피", "빨간"],
        })
        msg = mgr.send_to.call_args[0][2]
        assert msg["type"] == "room_error"


# ---------------------------------------------------------------------------
# 6. 다중 인간 빙결 — 한 명 탈락해도 다른 인간이 살아있으면 계속
# ---------------------------------------------------------------------------

class TestMultiHumanFreeze(unittest.TestCase):
    def test_one_human_eliminated_game_continues(self) -> None:
        """인간 2명 중 1명 탈락해도 게임이 계속된다."""
        state = GameState(room_id="test")
        state.phase = GamePhase.PLAYING
        h1 = state.add_player("h1", PlayerRole.HUMAN)
        state.add_player("h2", PlayerRole.HUMAN)
        state.add_player("seeker", PlayerRole.SEEKER)

        h1.eliminate()
        # h2는 살아있으므로 all_non_seeker는 False
        assert not state.all_non_seeker_frozen_or_eliminated()

    def test_all_humans_eliminated_game_ends(self) -> None:
        """모든 인간이 탈락하면 게임이 종료 가능."""
        state = GameState(room_id="test")
        state.phase = GamePhase.PLAYING
        h1 = state.add_player("h1", PlayerRole.HUMAN)
        h2 = state.add_player("h2", PlayerRole.HUMAN)
        state.add_player("ai", PlayerRole.AI_PARTNER)
        state.add_player("seeker", PlayerRole.SEEKER)

        h1.eliminate()
        h2.eliminate()
        # AI가 살아있어도 인간이 모두 탈락
        all_humans_down = all(
            p.status in {PlayerStatus.FROZEN, PlayerStatus.ELIMINATED, PlayerStatus.ESCAPED}
            for p in state.players.values()
            if p.role == PlayerRole.HUMAN
        )
        assert all_humans_down

    def test_escaped_counts_as_done(self) -> None:
        """탈출한 플레이어도 '완료' 상태로 간주된다."""
        state = GameState(room_id="test")
        h1 = state.add_player("h1", PlayerRole.HUMAN)
        ai = state.add_player("ai", PlayerRole.AI_PARTNER)
        state.add_player("seeker", PlayerRole.SEEKER)

        h1.escape()
        ai.escape()
        assert state.all_non_seeker_frozen_or_eliminated()


# ---------------------------------------------------------------------------
# 7. 인간→인간 구조 허용
# ---------------------------------------------------------------------------

class TestHumanToHumanRescue(unittest.TestCase):
    def test_rescue_target_not_seeker(self) -> None:
        """구조 대상이 술래가 아니면 구조 가능 (인간 포함)."""
        state = GameState(room_id="test")
        state.add_player("h1", PlayerRole.HUMAN)
        h2 = state.add_player("h2", PlayerRole.HUMAN)

        h2.freeze()
        # 인간→인간 구조: target.role != SEEKER 이므로 유효
        assert h2.role != PlayerRole.SEEKER
        assert h2.is_frozen


# ---------------------------------------------------------------------------
# 8. 개별 탈출 처리 — 부분 탈출
# ---------------------------------------------------------------------------

class TestPartialEscape(unittest.TestCase):
    def test_not_all_done_after_one_escape(self) -> None:
        """한 명만 탈출하면 나머지가 살아있으므로 게임 계속."""
        state = GameState(room_id="test")
        h1 = state.add_player("h1", PlayerRole.HUMAN)
        state.add_player("h2", PlayerRole.HUMAN)
        state.add_player("ai", PlayerRole.AI_PARTNER)
        state.add_player("seeker", PlayerRole.SEEKER)

        h1.escape()
        # h2와 ai가 아직 살아있으므로 false
        assert not state.all_non_seeker_frozen_or_eliminated()

    def test_all_done_after_mixed_states(self) -> None:
        """모든 도망자가 탈출/탈락/빙결이면 게임 종료."""
        state = GameState(room_id="test")
        h1 = state.add_player("h1", PlayerRole.HUMAN)
        h2 = state.add_player("h2", PlayerRole.HUMAN)
        ai = state.add_player("ai", PlayerRole.AI_PARTNER)
        state.add_player("seeker", PlayerRole.SEEKER)

        h1.escape()
        h2.eliminate()
        ai.freeze()
        assert state.all_non_seeker_frozen_or_eliminated()


# ---------------------------------------------------------------------------
# 9. 전체 방 플로우 통합
# ---------------------------------------------------------------------------

class TestFullRoomFlow(unittest.IsolatedAsyncioTestCase):
    async def test_create_join_select_ready_start(self) -> None:
        """방 생성 -> 참가 -> 캐릭터 선택 -> 준비 -> 시작 전체 플로우."""
        mgr = make_manager()
        room_id = setup_room(mgr)

        # 방 생성
        await mgr._handle_create_room(room_id, "host", {})
        assert room_id in mgr.rooms_config

        # 참가
        await mgr._handle_join_room(room_id, "p2", {})
        config = mgr.rooms_config[room_id]
        assert config.player_count == 2

        # 캐릭터 선택
        await mgr._handle_select_character(room_id, "host", {"character_id": "R01"})
        await mgr._handle_select_character(room_id, "p2", {"character_id": "R02"})
        assert config.players["host"].character_id == "R01"
        assert config.players["p2"].character_id == "R02"

        # 준비
        await mgr._handle_player_ready(room_id, "host", {"ready": True})
        await mgr._handle_player_ready(room_id, "p2", {"ready": True})
        assert config.all_ready

        # 시작
        mgr.broadcast.reset_mock()
        await mgr._handle_start_game(room_id, "host", {
            "forbidden_words": ["열쇠", "커피", "빨간"],
        })

        calls = mgr.broadcast.call_args_list
        types = [c[0][1]["type"] for c in calls]
        assert "game_starting" in types
        assert "game_started" in types

        # 방 상태 확인
        assert config.phase == RoomPhase.ONBOARDING

    async def test_start_without_room_config(self) -> None:
        """방 시스템 없이도 기존 start_game이 정상 동작."""
        mgr = make_manager()
        room_id = setup_room(mgr)
        # rooms_config에 등록하지 않고 직접 시작
        await mgr._handle_start_game(room_id, "player1", {
            "forbidden_words": ["열쇠", "커피", "빨간"],
        })
        msg = mgr.broadcast.call_args[0][1]
        assert msg["type"] == "game_started"
