"""인간·AI 공통 빙결, 상호 구조와 개별 탈출 계약 테스트."""

import asyncio
import json
import unittest

from app.ai.companion import TRAP_CONTRACT, advance_companion
from app.game.map_slots import get_map_slot
from app.game.progression import FinalRoute, VerticalRoundPhase, WorldFloor
from app.game.session import session_manager
from app.game.state import GamePhase, PlayerStatus
from app.ws.manager import ConnectionManager


class FakeWebSocket:
    def __init__(self) -> None:
        self.messages: list[dict] = []

    async def accept(self) -> None:
        pass

    async def send_text(self, text: str) -> None:
        self.messages.append(json.loads(text))


class TestTeamRiskFlow(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.manager = ConnectionManager()
        self.room_id = f"team-risk-{id(self)}"
        self.player_id = "human"
        self.websocket = FakeWebSocket()
        await self.manager.connect(self.room_id, self.player_id, self.websocket)  # type: ignore[arg-type]
        self.session = session_manager.get_or_create(self.room_id)
        self.session.setup_game(["빨간"])
        seeker = self.session.state.get_player("seeker")
        seeker.position.x, seeker.position.z = 50.0, 50.0

    async def asyncTearDown(self) -> None:
        self.manager.disconnect(self.room_id, self.player_id)
        await asyncio.sleep(0)

    async def test_server_selected_trap_freezes_ai_at_authoritative_position(self) -> None:
        trap = next(item for item in TRAP_CONTRACT["traps"] if item["floor"] == "OUT")
        partner = self.session.state.get_player("partner")
        partner.position.x, partner.position.z = trap["x"], trap["z"]
        self.session.active_trap_ids = {trap["id"]}

        _, action = advance_companion(self.session)
        assert action == {"type": "trap", "trap_id": trap["id"]}
        await self.manager._freeze_companion_from_trap(self.room_id, trap["id"])

        assert partner.status == PlayerStatus.FROZEN
        assert self.websocket.messages[-1]["type"] == "freeze"
        assert self.websocket.messages[-1]["player_id"] == "partner"

    async def test_vertical_field_escape_records_each_runner_before_victory(self) -> None:
        exit_x, exit_y, exit_z = get_map_slot("FIELD_ESCAPE_GATE")["position"]
        self.session.round_data = None
        self.session.vertical_round.final_route = FinalRoute.FIELD
        self.session.vertical_round.phase = VerticalRoundPhase.ESCAPE_OPEN
        self.session.state.phase = GamePhase.ESCAPE
        for actor_id in (self.player_id, "partner", "partner-2"):
            actor = self.session.state.get_player(actor_id)
            actor.position.x, actor.position.y, actor.position.z = exit_x, exit_y, exit_z
            actor.position.floor = WorldFloor.FIELD

        await self.manager._complete_companion_escape(self.room_id, "partner")
        assert self.session.state.phase == GamePhase.ESCAPE
        await self.manager._complete_companion_escape(self.room_id, "partner-2")
        assert self.session.state.phase == GamePhase.ESCAPE
        await self.manager.handle_message(self.room_id, self.player_id, {
            "type": "action",
            "payload": {"action_type": "vertical_escape"},
        })

        assert [
            message["player_id"] for message in self.websocket.messages
            if message["type"] == "runner_escaped"
        ] == ["partner", "partner-2", self.player_id]
        won = self.websocket.messages[-1]
        assert won["type"] == "game_won"
        assert won["reason"] == "vertical_school_escape"
        assert won["escaped_player_ids"] == ["human", "partner", "partner-2"]
        assert won["progression"]["phase"] == "victory"

    async def test_vertical_field_escape_can_end_as_partial_result(self) -> None:
        exit_x, exit_y, exit_z = get_map_slot("FIELD_ESCAPE_GATE")["position"]
        self.session.round_data = None
        self.session.vertical_round.final_route = FinalRoute.FIELD
        self.session.vertical_round.phase = VerticalRoundPhase.ESCAPE_OPEN
        self.session.state.phase = GamePhase.ESCAPE
        human = self.session.state.get_player(self.player_id)
        human.position.x, human.position.y, human.position.z = exit_x, exit_y, exit_z
        human.position.floor = WorldFloor.FIELD
        self.session.state.get_player("partner").eliminate()
        self.session.state.get_player("partner-2").eliminate()

        await self.manager.handle_message(self.room_id, self.player_id, {
            "type": "action",
            "payload": {"action_type": "vertical_escape"},
        })

        assert self.websocket.messages[-2]["type"] == "runner_escaped"
        won = self.websocket.messages[-1]
        assert won["type"] == "game_won"
        assert won["reason"] == "vertical_partial_escape"
        assert won["progression"]["phase"] == "partial_result"

    async def test_human_rescues_frozen_ai_only_from_server_validated_range(self) -> None:
        human = self.session.state.get_player(self.player_id)
        partner = self.session.state.get_player("partner")
        partner.freeze()
        human.position.x, human.position.z = partner.position.x, partner.position.z

        await self.manager.handle_message(self.room_id, self.player_id, {
            "type": "action",
            "payload": {"action_type": "rescue_teammate", "target_id": "partner"},
        })
        assert partner.status == PlayerStatus.ALIVE
        assert self.websocket.messages[-1] == {
            "type": "rescued", "rescuer_id": self.player_id, "target_id": "partner",
        }

        partner.freeze()
        human.position.x, human.position.z = 20.0, 20.0
        await self.manager.handle_message(self.room_id, self.player_id, {
            "type": "action",
            "payload": {"action_type": "rescue_teammate", "target_id": "partner"},
        })
        assert self.websocket.messages[-1]["reason"] == "invalid_rescue"
        assert partner.status == PlayerStatus.FROZEN

    async def test_ai_forbidden_speech_avoids_forbidden_words(self) -> None:
        """S4: AI는 금기어를 회피 연출로 교체한다. 빙결되지 않는다."""
        partner = self.session.state.get_player("partner")
        delivered = await self.manager._broadcast_companion_speech(self.room_id, {
            "type": "companion_report", "message": "빨간 물건을 발견했어",
        })
        # 금기어 회피 연출이 적용되어 빙결 없이 전달된다
        assert delivered
        assert partner.status == PlayerStatus.ALIVE
        last = self.websocket.messages[-1]
        assert last.get("forbidden_avoidance") is True
        assert "빨간" not in last.get("message", "")

    async def test_ai_escape_is_server_validated_and_broadcast(self) -> None:
        partner = self.session.state.get_player("partner")
        gate = self.session.active_gate_payload()["position"]
        escape_sensor = self.session.active_gate_escape_position()
        self.session.state.phase = GamePhase.ESCAPE
        partner.position.x, partner.position.z = gate["x"], gate["z"]

        await self.manager._complete_companion_escape(self.room_id)
        assert partner.status == PlayerStatus.ALIVE

        partner.position.x, partner.position.z = escape_sensor["x"], escape_sensor["z"]
        await self.manager._complete_companion_escape(self.room_id)

        assert partner.status == PlayerStatus.ESCAPED
        assert self.session.escaped_player_ids == {"partner"}
        assert self.websocket.messages[-1]["type"] == "runner_escaped"

    async def test_one_ai_freeze_timeout_does_not_end_three_runner_team(self) -> None:
        partner = self.session.state.get_player("partner")
        partner.freeze()
        self.session.state.freeze_timeout_sec = 0.01
        self.manager._schedule_freeze_timeout(self.room_id, partner.player_id)
        await asyncio.sleep(0.03)
        assert partner.status == PlayerStatus.ELIMINATED
        assert self.session.state.phase == GamePhase.PLAYING

    async def test_ai_rescue_cannot_reach_human_through_a_wall(self) -> None:
        from app.game.authority import WALL_RECTS_BY_FLOOR
        from app.game.progression import WorldFloor
        human = self.session.state.get_player(self.player_id)
        partner = self.session.state.get_player("partner")
        x, z, sx, sz = next(rect for rect in WALL_RECTS_BY_FLOOR["F1"] if min(rect[2], rect[3]) <= 0.5)
        if sx < sz:
            partner.position.x, partner.position.z = x - sx, z
            human.position.x, human.position.z = x + sx, z
        else:
            partner.position.x, partner.position.z = x, z - sz
            human.position.x, human.position.z = x, z + sz
        human.position.floor = partner.position.floor = WorldFloor.F1
        human.freeze()
        await self.manager._complete_partner_rescue(self.room_id, human.player_id)
        assert human.status == PlayerStatus.FROZEN

    async def test_ai_freeze_only_finishes_when_all_three_runners_are_frozen(self) -> None:
        """기획 v4: AI 동료는 금기어 발화로 빙결되지 않지만, 트랩으로는 빙결될 수 있다.
        전원 빙결 시 게임 종료를 검증한다."""
        human = self.session.state.get_player(self.player_id)
        partner = self.session.state.get_player("partner")
        partner_two = self.session.state.get_player("partner-2")
        human.freeze()
        partner_two.freeze()
        # AI는 금기어로 빙결되지 않으므로 직접 freeze (트랩 시뮬레이션)
        partner.freeze()
        finished = await self.manager._finish_if_team_frozen(self.room_id)
        assert finished
        assert self.session.state.phase == GamePhase.RESULT
        game_over = self.websocket.messages[-1]
        assert game_over["type"] == "game_over"
        assert game_over["reason"] == "all_frozen"
        assert game_over["escaped_player_ids"] == []


def test_server_trap_pool_only_activates_reachable_solo_floors() -> None:
    session = session_manager.get_or_create("trap-contract")
    session.setup_game(["열쇠"])
    by_id = {trap["id"]: trap for trap in TRAP_CONTRACT["traps"]}
    assert len(session.active_trap_ids) == TRAP_CONTRACT["activeCount"]
    assert {by_id[trap_id]["floor"] for trap_id in session.active_trap_ids} <= {"OUT", "F1"}
    session_manager.remove("trap-contract")
