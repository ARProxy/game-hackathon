"""AI 동료 전용 T1 미션의 서버 권위 흐름 테스트."""

import asyncio
import json
import unittest

from app.ai.mission import (
    Mission,
    PropPlacement,
    RoundData,
    round_to_dict,
)
from app.ai.partner import compare_partner_candidates, match_partner_command
from app.game.progression import VerticalRoundPhase, WorldFloor
from app.game.session import session_manager
from app.game.vertical_flow import mission_interaction_position
from app.ws.manager import ConnectionManager


def make_prop(prop_id: str, *, real: bool) -> PropPlacement:
    return PropPlacement(
        prop_id=prop_id,
        name="열쇠" if real else "동전",
        color="#FFD700" if real else "#C0C0C0",
        mesh="key" if real else "coin",
        scale=0.4,
        position={"x": 7.0 if real else -3.0, "z": -2.0},
        is_real=real,
        zone="A",
        forbidden_word="열쇠",
        tags=["shiny", "small", "metal", "door-related"] if real else ["shiny", "small", "metal", "round"],
        descriptions=["반짝이는", "작은", "금속", "문을 열 때 쓰는"] if real else [],
    )


def make_round() -> RoundData:
    real = make_prop("key", real=True)
    decoy = make_prop("coin", real=False)
    mission = Mission(
        mission_id=0,
        forbidden_word="열쇠",
        clue_word="별",
        clue_order=1,
        real_prop=real,
        decoy_props=[decoy],
    )
    return RoundData(
        missions=[mission],
        all_props=[real, decoy],
        spell_words=["별"],
    )


class FakeWebSocket:
    def __init__(self) -> None:
        self.messages: list[dict] = []

    async def accept(self) -> None:
        pass

    async def send_text(self, text: str) -> None:
        self.messages.append(json.loads(text))


class TestPartnerMatcher:
    def test_two_description_cues_are_required(self) -> None:
        prop = make_prop("key", real=True)
        assert not match_partner_command("반짝이는 물건 확인해줘", prop).matched
        result = match_partner_command("반짝이는 작은 금속 물건 확인해줘", prop)
        assert result.matched
        assert result.score >= 2

    def test_design_document_example_is_understood(self) -> None:
        prop = make_prop("key", real=True)
        result = match_partner_command(
            "문을 열 때 쓰는 반짝이는 작은 것 확인해줘", prop
        )
        assert result.matched
        assert {"반짝이", "작은"}.issubset(result.cues)

    def test_shared_cues_request_clarification_instead_of_revealing_truth(self) -> None:
        real = make_prop("key", real=True)
        decoy = make_prop("coin", real=False)
        decision = compare_partner_candidates("반짝이는 작은 금속 물건", [real, decoy])
        assert decision.action == "clarify"
        assert decision.target is None
        assert {item.prop.prop_id for item in decision.ranked} == {"key", "coin"}

    def test_wrong_distinguishing_cue_can_select_a_decoy(self) -> None:
        real = make_prop("key", real=True)
        decoy = PropPlacement(
            **{**make_prop("coin", real=False).__dict__, "tags": ["round", "small", "metal"]}
        )
        decision = compare_partner_candidates("둥근 작은 금속 물건", [real, decoy])
        assert decision.action == "act"
        assert decision.target is decoy

    def test_additional_use_cue_corrects_ambiguous_shape(self) -> None:
        real = make_prop("key", real=True)
        decoy = make_prop("coin", real=False)
        decision = compare_partner_candidates(
            "문을 열 때 쓰는 반짝이는 작은 것", [real, decoy]
        )
        assert decision.action == "act"
        assert decision.target is real


class TestPublicRoundPayload:
    def test_hidden_truth_and_ai_matching_metadata_are_not_exposed(self) -> None:
        payload = round_to_dict(make_round())
        for prop in payload["props"]:
            assert "is_real" not in prop
            assert "forbidden_word" not in prop
            assert "tags" not in prop
            assert "descriptions" not in prop


class TestPartnerMissionFlow(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.manager = ConnectionManager()
        self.room_id = f"partner-{id(self)}"
        self.player_id = "player1"
        self.websocket = FakeWebSocket()
        await self.manager.connect(
            self.room_id, self.player_id, self.websocket  # type: ignore[arg-type]
        )
        self.session = session_manager.get_or_create(self.room_id)
        self.session.setup_game(["열쇠"])
        self.session.setup_round(make_round())

    async def asyncTearDown(self) -> None:
        self.manager.disconnect(self.room_id, self.player_id)
        await asyncio.sleep(0)

    async def test_safe_description_commands_partner_after_existing_events(self) -> None:
        await self.manager.handle_message(self.room_id, self.player_id, {
            "type": "speech",
            "payload": {
                "transcript": "자물쇠에 넣어 돌리는 반짝이는 작은 물건 확인해줘",
                "is_final": True,
            },
        })

        assert [message["type"] for message in self.websocket.messages] == [
            "sound_ping", "speech_safe", "partner_decision", "partner_command",
        ]
        assert self.websocket.messages[-1] == {
            "type": "partner_command",
            "target_prop_id": "key",
            "position": {"x": 7.0, "z": -2.0},
            "utterance": "자물쇠에 넣어 돌리는 반짝이는 작은 물건 확인해줘",
        }
        assert {item["prop_id"] for item in self.session.companion_candidate_memory} == {"key", "coin"}
        assert all("confidence_score" in item and "matched_cues" in item for item in self.session.companion_candidate_memory)

    async def test_human_direct_inspect_is_rejected(self) -> None:
        await self.manager.handle_message(self.room_id, self.player_id, {
            "type": "action",
            "payload": {"action_type": "inspect_prop", "prop_id": "key"},
        })
        assert self.websocket.messages[-1]["reason"] == "server_authoritative_actor"
        assert self.session.current_mission_index == 0

    async def test_ambiguous_command_questions_then_correction_moves(self) -> None:
        await self.manager.handle_message(self.room_id, self.player_id, {
            "type": "speech",
            "payload": {"transcript": "반짝이는 작은 물건 봐줘", "is_final": True},
        })
        ambiguous = self.websocket.messages[-1]
        assert ambiguous["type"] == "partner_decision"
        assert ambiguous["decision"] == "clarify"
        assert "target_prop_id" not in ambiguous

        await self.manager.handle_message(self.room_id, self.player_id, {
            "type": "speech",
            "payload": {
                "transcript": "자물쇠에 넣어 돌리는 반짝이는 작은 물건 봐줘",
                "is_final": True,
            },
        })
        corrected = self.websocket.messages[-2]
        command = self.websocket.messages[-1]
        assert corrected["type"] == "partner_decision"
        assert corrected["decision"] == "act"
        assert command["type"] == "partner_command"
        assert command["target_prop_id"] == "key"

    async def test_misleading_cue_commands_decoy_instead_of_hidden_truth(self) -> None:
        await self.manager.handle_message(self.room_id, self.player_id, {
            "type": "speech",
            "payload": {"transcript": "둥근 작은 금속 물건 봐줘", "is_final": True},
        })
        decision = self.websocket.messages[-2]
        command = self.websocket.messages[-1]
        assert decision["decision"] == "act"
        assert command["target_prop_id"] == "coin"

    async def test_wrong_and_duplicate_prop_are_defended(self) -> None:
        await self.manager._handle_inspect_prop(
            self.room_id, self.player_id, self.session.state.get_player("partner"),
            {"prop_id": "coin"},
        )
        inspected = self.websocket.messages[-1]
        assert inspected["type"] == "prop_inspected"
        assert inspected["is_correct"] is False
        assert inspected["clue"] is None
        assert self.session.current_mission_index == 0

        await self.manager._handle_inspect_prop(
            self.room_id, self.player_id, self.session.state.get_player("partner"),
            {"prop_id": "coin"},
        )
        assert self.websocket.messages[-1]["reason"] == "already_inspected"

    async def test_ai_inspects_real_prop_and_completes_mission(self) -> None:
        await self.manager._handle_inspect_prop(
            self.room_id, self.player_id, self.session.state.get_player("partner"),
            {"prop_id": "key"},
        )

        assert self.websocket.messages[-1] == {
            "type": "prop_inspected",
            "prop_id": "key",
            "is_correct": True,
            "clue": {"word": "별", "order": 1, "total": 1},
            "mission_index": 0,
            "next_mission_index": 1,
            "all_complete": True,
            "active_gate": self.session.active_gate_payload(),
        }
        assert self.session.current_mission_index == 1
        assert self.session.inspected_prop_ids == {"key"}
        assert self.session.state.phase.value == "final_spell"

    async def test_vertical_wrong_inspection_waits_for_correction_then_advances(self) -> None:
        self.session.round_data = None
        self.session.vertical_round.phase = VerticalRoundPhase.FLOOR_3
        x, y, z = mission_interaction_position(VerticalRoundPhase.FLOOR_3)
        human = self.session.state.get_player(self.player_id)
        assert human is not None
        human.position.x, human.position.y, human.position.z = x, y, z
        for actor in self.session.state.players.values():
            if actor.role.value != "seeker":
                actor.position.floor = WorldFloor.F3
        self.session.broadcast_mission_actor_id = self.player_id
        self.websocket.messages.clear()

        await self.manager._handle_companion_action(
            self.room_id, "partner",
            {"type": "inspect", "prop_id": "vertical_f3_candidate_b"},
        )

        wrong = next(
            message for message in self.websocket.messages
            if message["type"] == "vertical_candidate_inspected"
        )
        assert not wrong["success"]
        assert self.session.vertical_round.phase == VerticalRoundPhase.FLOOR_3

        self.websocket.messages.clear()
        await self.manager._handle_companion_action(
            self.room_id, "partner",
            {"type": "inspect", "prop_id": "vertical_f3_candidate_a"},
        )

        accepted = next(
            message for message in self.websocket.messages
            if message["type"] == "vertical_candidate_inspected"
        )
        advanced = next(
            message for message in self.websocket.messages
            if message["type"] == "vertical_stage_advanced"
        )
        assert accepted["success"]
        assert advanced["completed_phase"] == "floor_3"
        assert advanced["next_phase"] == "floor_2"
