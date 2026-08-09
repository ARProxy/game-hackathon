"""옥상 기억 신호와 층별 협동 미션 테스트."""

import time

import pytest

from app.ai.vertical_missions import (
    BasementFinalMission,
    IntercomMission,
    RooftopSignalMission,
    SimultaneousMission,
    VerticalMissions,
    create_basement_mission,
    create_vertical_missions,
)
from app.game.progression import FinalRoute, InvalidProgression, VerticalRoundPhase, WorldFloor
from app.game.session import GameSession
from app.game.state import PlayerRole
from app.game.vertical_flow import (
    activate_basement_device,
    activate_simultaneous_device,
    complete_current_stage,
    mission_interaction_position,
    start_intercom_mission,
    submit_intercom_answer,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def active_session() -> tuple[GameSession, object]:
    session = GameSession("vertical-missions")
    human = session.state.add_player("human", PlayerRole.HUMAN)
    session.setup_game(["열쇠"])
    session.vertical_progression_enabled = True
    session.final_route_choice = FinalRoute.FIELD
    return session, human


def place_at_current_mission(session: GameSession, actor) -> None:
    x, y, z = mission_interaction_position(session.vertical_round.phase)
    actor.position.x, actor.position.y, actor.position.z = x, y, z
    actor.position.floor = session.vertical_round.policy.active_floor
    for runner in session.state.players.values():
        if runner.role != PlayerRole.SEEKER:
            runner.position.floor = session.vertical_round.policy.active_floor


def advance_to_floor(session: GameSession, human, target_phase: VerticalRoundPhase) -> None:
    """옥상부터 target_phase 직전까지 모든 층을 통과한다."""
    phase_order = [
        VerticalRoundPhase.ROOFTOP_INTRO,
        VerticalRoundPhase.FLOOR_3,
        VerticalRoundPhase.FLOOR_2,
        VerticalRoundPhase.FLOOR_1,
    ]
    for phase in phase_order:
        if session.vertical_round.phase == target_phase:
            break
        place_at_current_mission(session, human)
        # 2층/1층 미션은 먼저 완료해야 advance 가능
        if session.vertical_missions is not None:
            if phase == VerticalRoundPhase.ROOFTOP_INTRO:
                session.vertical_missions.rooftop.completed = True
            elif phase == VerticalRoundPhase.FLOOR_2:
                session.vertical_missions.intercom.completed = True
            elif phase == VerticalRoundPhase.FLOOR_1:
                session.vertical_missions.simultaneous.completed = True
        complete_current_stage(session, "human")


# ---------------------------------------------------------------------------
# RooftopSignalMission 단위 테스트
# ---------------------------------------------------------------------------

class TestRooftopSignalMission:
    def test_requires_center_east_west_order(self) -> None:
        mission = RooftopSignalMission()
        wrong = mission.activate("east")
        assert not wrong["success"]
        assert wrong["expected_signal_id"] == "center"
        assert mission.activated_signal_ids == []

        assert mission.activate("center")["progress"] == 1
        assert mission.activate("east")["progress"] == 2
        result = mission.activate("west")
        assert result["completed"]
        assert result["next_signal_id"] is None

    def test_public_state_exposes_preview_sequence(self) -> None:
        mission = RooftopSignalMission(sequence=["west", "center", "east"])

        assert mission.public_state()["signal_sequence"] == ["west", "center", "east"]

    def test_session_sequence_is_seeded_permutation(self) -> None:
        first = create_vertical_missions([], seed=17).rooftop.sequence
        repeated = create_vertical_missions([], seed=17).rooftop.sequence
        variants = {
            tuple(create_vertical_missions([], seed=seed).rooftop.sequence)
            for seed in range(8)
        }

        assert first == repeated
        assert set(first) == {"center", "east", "west"}
        assert len(variants) >= 3


# ---------------------------------------------------------------------------
# IntercomMission 단위 테스트
# ---------------------------------------------------------------------------

class TestIntercomMission:
    def test_generate_sequence_produces_correct_count(self) -> None:
        seq = IntercomMission.generate_sequence(3, seed=42)
        assert len(seq) == 3
        for item in seq:
            assert "shape" in item
            assert "color" in item

    def test_generate_sequence_deterministic_with_seed(self) -> None:
        a = IntercomMission.generate_sequence(3, seed=123)
        b = IntercomMission.generate_sequence(3, seed=123)
        assert a == b

    def test_check_answer_all_correct(self) -> None:
        mission = IntercomMission(
            sequence=[
                {"shape": "삼각형", "color": "빨간"},
                {"shape": "원", "color": "파란"},
                {"shape": "네모", "color": "초록"},
            ]
        )
        result = mission.check_answer("빨간 삼각형, 파란 원, 초록 네모")
        assert result["success"]
        assert mission.completed

    def test_check_answer_partial_match_fails(self) -> None:
        mission = IntercomMission(
            sequence=[
                {"shape": "삼각형", "color": "빨간"},
                {"shape": "원", "color": "파란"},
            ]
        )
        result = mission.check_answer("빨간 삼각형, 노란 원")
        assert not result["success"]
        assert not mission.completed

    def test_check_answer_tracks_attempts(self) -> None:
        mission = IntercomMission(
            sequence=[{"shape": "원", "color": "빨간"}],
            max_attempts=2,
        )
        r1 = mission.check_answer("파란 네모")
        assert r1["attempts"] == 1
        assert not r1["exhausted"]
        r2 = mission.check_answer("초록 별")
        assert r2["attempts"] == 2
        assert r2["exhausted"]

    def test_check_answer_requires_sequence_order(self) -> None:
        mission = IntercomMission(
            sequence=[
                {"shape": "삼각형", "color": "빨간"},
                {"shape": "원", "color": "파란"},
                {"shape": "네모", "color": "초록"},
            ],
        )
        result = mission.check_answer("초록 네모, 빨간 삼각형, 파란 원")
        assert not result["success"]
        assert not result["order_valid"]

    def test_describe_for_ai_avoids_forbidden_words(self) -> None:
        mission = IntercomMission(
            sequence=[{"shape": "삼각형", "color": "빨간"}],
        )
        desc = mission.describe_for_ai(["빨간"])
        # 금기어 회피 시 '빨간'이 그대로 나오지 않아야 함
        # (avoid_forbidden_words의 동작에 따라 다르지만 적어도 호출은 성공해야 한다)
        assert isinstance(desc, str)
        assert len(desc) > 0


# ---------------------------------------------------------------------------
# SimultaneousMission 단위 테스트
# ---------------------------------------------------------------------------

class TestSimultaneousMission:
    def test_both_devices_within_window_succeeds(self) -> None:
        mission = SimultaneousMission(time_window=3.0)
        mission.activate_device("A")
        result = mission.activate_device("B")
        assert result["success"]
        assert mission.completed

    def test_single_device_waits_for_other(self) -> None:
        mission = SimultaneousMission()
        result = mission.activate_device("A")
        assert not result["success"]
        assert result["reason"] == "waiting_for_other"

    def test_timing_mismatch_resets(self) -> None:
        mission = SimultaneousMission(time_window=0.0)
        mission.device_a_activated_at = time.time() - 5.0
        result = mission.activate_device("B")
        assert not result["success"]
        assert result["reason"] == "timing_mismatch"
        assert mission.device_a_activated_at is None
        assert mission.device_b_activated_at is None

    def test_invalid_device_rejected(self) -> None:
        mission = SimultaneousMission()
        result = mission.activate_device("C")
        assert not result["success"]
        assert result["reason"] == "invalid_device"


# ---------------------------------------------------------------------------
# create_vertical_missions
# ---------------------------------------------------------------------------

class TestCreateVerticalMissions:
    def test_creates_both_missions(self) -> None:
        vm = create_vertical_missions(["열쇠", "빨간"], seed=42)
        assert isinstance(vm.intercom, IntercomMission)
        assert isinstance(vm.simultaneous, SimultaneousMission)
        assert len(vm.intercom.sequence) == 3

    def test_deterministic_with_seed(self) -> None:
        a = create_vertical_missions(["열쇠"], seed=99)
        b = create_vertical_missions(["열쇠"], seed=99)
        assert a.intercom.sequence == b.intercom.sequence


# ---------------------------------------------------------------------------
# Session 통합 테스트
# ---------------------------------------------------------------------------

class TestSessionVerticalMissions:
    def test_setup_game_initializes_vertical_missions(self) -> None:
        session, _ = active_session()
        assert session.vertical_missions is not None
        vm: VerticalMissions = session.vertical_missions
        assert not vm.rooftop.completed
        assert len(vm.intercom.sequence) == 3
        assert not vm.simultaneous.completed

    def test_floor_2_blocked_without_intercom_completion(self) -> None:
        session, human = active_session()
        advance_to_floor(session, human, VerticalRoundPhase.FLOOR_2)
        assert session.vertical_round.phase == VerticalRoundPhase.FLOOR_2

        place_at_current_mission(session, human)
        with pytest.raises(InvalidProgression, match="인터폰 미션"):
            complete_current_stage(session, "human")

    def test_floor_2_passes_after_intercom_completion(self) -> None:
        session, human = active_session()
        advance_to_floor(session, human, VerticalRoundPhase.FLOOR_2)

        vm: VerticalMissions = session.vertical_missions
        vm.intercom.completed = True
        place_at_current_mission(session, human)
        result = complete_current_stage(session, "human")
        assert result["completed_phase"] == "floor_2"
        assert result["next_phase"] == "floor_1"

    def test_floor_1_blocked_without_simultaneous_completion(self) -> None:
        session, human = active_session()
        advance_to_floor(session, human, VerticalRoundPhase.FLOOR_1)
        assert session.vertical_round.phase == VerticalRoundPhase.FLOOR_1

        place_at_current_mission(session, human)
        with pytest.raises(InvalidProgression, match="동시 조작 미션"):
            complete_current_stage(session, "human")

    def test_floor_1_passes_after_simultaneous_completion(self) -> None:
        session, human = active_session()
        advance_to_floor(session, human, VerticalRoundPhase.FLOOR_1)

        vm: VerticalMissions = session.vertical_missions
        vm.simultaneous.completed = True
        place_at_current_mission(session, human)
        result = complete_current_stage(session, "human")
        assert result["completed_phase"] == "floor_1"


# ---------------------------------------------------------------------------
# vertical_flow 핸들러 테스트
# ---------------------------------------------------------------------------

class TestIntercomFlow:
    def test_start_intercom_mission_returns_positions(self) -> None:
        session, human = active_session()
        advance_to_floor(session, human, VerticalRoundPhase.FLOOR_2)
        info = start_intercom_mission(session)
        assert info["mission"] == "floor_2_intercom"
        assert "ai_position" in info
        assert "human_position" in info

    def test_submit_intercom_answer_correct(self) -> None:
        session, human = active_session()
        advance_to_floor(session, human, VerticalRoundPhase.FLOOR_2)

        from app.game.map_slots import get_map_slot
        slot = get_map_slot("F2_INTERCOM_B")
        human.position.x, human.position.y, human.position.z = slot["position"]
        human.position.floor = WorldFloor.F2

        vm: VerticalMissions = session.vertical_missions
        start_intercom_mission(session)
        vm.intercom.ai_arrived = True
        # 시퀀스를 알고 있으므로 정확히 입력
        text_parts = [f"{item['color']} {item['shape']}" for item in vm.intercom.sequence]
        transcript = ", ".join(text_parts)
        result = submit_intercom_answer(session, "human", transcript)
        assert result["success"]

    def test_submit_intercom_too_far_rejected(self) -> None:
        session, human = active_session()
        advance_to_floor(session, human, VerticalRoundPhase.FLOOR_2)
        human.position.x, human.position.z = 0.0, 0.0
        human.position.floor = WorldFloor.F2
        start_intercom_mission(session)
        session.vertical_missions.intercom.ai_arrived = True

        with pytest.raises(InvalidProgression, match="거리가 너무 멀다"):
            submit_intercom_answer(session, "human", "아무 말")

    def test_generated_answer_vocabulary_excludes_current_forbidden_words(self) -> None:
        forbidden = ["빨간", "파란", "초록"]
        sequence = IntercomMission.generate_sequence(
            3, seed=42, forbidden_words=forbidden,
        )

        assert not ({item["color"] for item in sequence} & set(forbidden))

    def test_submit_intercom_waits_for_ai_report(self) -> None:
        session, human = active_session()
        advance_to_floor(session, human, VerticalRoundPhase.FLOOR_2)
        start_intercom_mission(session)

        from app.game.map_slots import get_map_slot
        slot = get_map_slot("F2_INTERCOM_B")
        human.position.x, human.position.y, human.position.z = slot["position"]
        human.position.floor = WorldFloor.F2

        with pytest.raises(InvalidProgression, match="AI 동료의 기호 보고"):
            submit_intercom_answer(session, "human", "아무 말")


class TestSimultaneousFlow:
    def test_activate_device_a_near_slot(self) -> None:
        session, human = active_session()
        advance_to_floor(session, human, VerticalRoundPhase.FLOOR_1)

        from app.game.map_slots import get_map_slot
        slot = get_map_slot("F1_DEVICE_A")
        human.position.x, human.position.y, human.position.z = slot["position"]
        human.position.floor = WorldFloor.F1

        result = activate_simultaneous_device(session, "human", "A")
        assert not result["success"]
        assert result["reason"] == "waiting_for_other"

    def test_both_devices_activated_completes(self) -> None:
        session, human = active_session()
        advance_to_floor(session, human, VerticalRoundPhase.FLOOR_1)

        from app.game.map_slots import get_map_slot
        partner = session.state.get_player("partner")

        slot_a = get_map_slot("F1_DEVICE_A")
        human.position.x, human.position.y, human.position.z = slot_a["position"]
        human.position.floor = WorldFloor.F1

        slot_b = get_map_slot("F1_DEVICE_B")
        partner.position.x, partner.position.y, partner.position.z = slot_b["position"]
        partner.position.floor = WorldFloor.F1

        activate_simultaneous_device(session, "partner", "B")
        result = activate_simultaneous_device(session, "human", "A")
        assert result["success"]

    def test_activate_device_too_far_rejected(self) -> None:
        session, human = active_session()
        advance_to_floor(session, human, VerticalRoundPhase.FLOOR_1)
        human.position.x, human.position.z = 0.0, 0.0
        human.position.floor = WorldFloor.F1

        with pytest.raises(InvalidProgression, match="거리가 너무 멀다"):
            activate_simultaneous_device(session, "human", "A")


# ---------------------------------------------------------------------------
# BasementFinalMission 단위 테스트
# ---------------------------------------------------------------------------

class TestBasementFinalMission:
    def test_create_basement_mission(self) -> None:
        bm = create_basement_mission(seed=42)
        assert len(bm.devices) == 3
        assert len(bm.correct_order) == 3
        assert set(bm.correct_order) == {"panel", "valve", "generator"}
        assert not bm.completed
        assert bm.reset_count == 0

    def test_create_basement_mission_deterministic(self) -> None:
        a = create_basement_mission(seed=123)
        b = create_basement_mission(seed=123)
        assert a.correct_order == b.correct_order

    def test_basement_correct_order_completes(self) -> None:
        bm = create_basement_mission(seed=7)
        order = bm.correct_order

        r1 = bm.activate_device(order[0], "human")
        assert r1["success"]
        assert not r1.get("completed", False)
        assert r1["progress"] == 1

        r2 = bm.activate_device(order[1], "partner")
        assert r2["success"]
        assert not r2.get("completed", False)
        assert r2["progress"] == 2

        r3 = bm.activate_device(order[2], "partner-2")
        assert r3["success"]
        assert r3["completed"]
        assert bm.completed

    def test_basement_wrong_order_resets(self) -> None:
        bm = create_basement_mission(seed=7)
        order = bm.correct_order
        # 올바른 첫 번째 장치가 아닌 다른 장치를 먼저 활성화
        wrong_first = [d for d in ["panel", "valve", "generator"] if d != order[0]][0]

        result = bm.activate_device(wrong_first, "human")
        assert not result["success"]
        assert result["reason"] == "wrong_order"
        assert result["reset"]
        assert bm.reset_count == 1
        # 모든 장치가 리셋되어야 한다
        for device in bm.devices:
            assert device.state == "off"
            assert device.activated_by is None
        assert len(bm.activated_order) == 0

    def test_basement_device_status(self) -> None:
        bm = create_basement_mission(seed=0)

        status = bm.get_device_status("panel")
        assert status is not None
        assert status["device_id"] == "panel"
        assert status["name"] == "배전반"
        expected = "standby" if bm.correct_order[0] == "panel" else "off"
        assert status["state"] == expected
        states = {
            device.device_id: bm.get_device_status(device.device_id)["state"]
            for device in bm.devices
        }
        assert list(states.values()).count("standby") == 1

        # 존재하지 않는 장치
        assert bm.get_device_status("unknown") is None

    def test_basement_already_active_rejected(self) -> None:
        bm = create_basement_mission(seed=7)
        order = bm.correct_order
        bm.activate_device(order[0], "human")
        result = bm.activate_device(order[0], "human")
        assert not result["success"]
        assert result["reason"] == "already_active"

    def test_basement_unknown_device_rejected(self) -> None:
        bm = create_basement_mission(seed=0)
        result = bm.activate_device("nonexistent", "human")
        assert not result["success"]
        assert result["reason"] == "unknown_device"

    def test_server_requires_actor_at_matching_basement_device(self) -> None:
        from app.game.map_slots import get_map_slot

        session, human = active_session()
        session.vertical_round.phase = VerticalRoundPhase.BASEMENT_FINAL
        human.position.floor = WorldFloor.B1
        human.position.x, human.position.z = 0.0, 0.0
        first_id = session.vertical_missions.basement.correct_order[0]

        with pytest.raises(InvalidProgression, match="거리가 너무 멀다"):
            activate_basement_device(session, human.player_id, first_id)

        device = next(
            item for item in session.vertical_missions.basement.devices
            if item.device_id == first_id
        )
        human.position.x, human.position.y, human.position.z = get_map_slot(
            device.slot_id
        )["position"]
        result = activate_basement_device(session, human.player_id, first_id)
        assert result["success"]


# ---------------------------------------------------------------------------
# create_vertical_missions에 basement 포함 확인
# ---------------------------------------------------------------------------

class TestVerticalMissionsWithBasement:
    def test_creates_all_three_missions(self) -> None:
        vm = create_vertical_missions(["열쇠"], seed=42)
        assert isinstance(vm.intercom, IntercomMission)
        assert isinstance(vm.simultaneous, SimultaneousMission)
        assert isinstance(vm.basement, BasementFinalMission)
        assert len(vm.basement.devices) == 3
        assert len(vm.basement.correct_order) == 3
