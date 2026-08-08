"""기획 2 AI 동료 독립 목표와 서버 권위 계약 테스트."""

import math
import time

from app.ai.companion import (
    advance_companion,
    command_companion,
    decide_companion_intent,
    request_companion_rescue,
)
from app.ai.mission import generate_round
from app.game.map_slots import get_map_slot
from app.game.session import GameSession
from app.game.progression import FinalRoute, VerticalRoundPhase, WorldFloor
from app.game.state import GamePhase, PlayerRole
from app.game.vertical_flow import mission_interaction_position, start_intercom_mission


def make_session(room_id: str) -> GameSession:
    session = GameSession(room_id)
    session.state.add_player("human", PlayerRole.HUMAN)
    session.setup_game(["열쇠"])
    session.setup_round(generate_round(["열쇠"]))
    seeker = session.state.get_player("seeker")
    assert seeker
    seeker.position.x, seeker.position.z = 50.0, 50.0
    seeker.position.floor = session.state.get_player("partner").position.floor
    return session


def test_idle_partner_explores_a_mission_candidate_not_the_human() -> None:
    session = make_session("companion-explore")
    intent = decide_companion_intent(session)
    assert intent["state"] == "EXPLORE_ZONE"
    assert intent["target_id"] in {
        prop.prop_id for prop in [session.current_mission().real_prop, *session.current_mission().decoy_props]
    }
    human = session.state.get_player("human")
    assert intent["target"] != {"x": human.position.x, "z": human.position.z}


def test_exploration_reports_and_remembers_without_solving_mission() -> None:
    session = make_session("companion-memory")
    intent = decide_companion_intent(session)
    partner = session.state.get_player("partner")
    partner.position.x, partner.position.z = intent["target"]["x"], intent["target"]["z"]
    _, action = advance_companion(session)
    assert action["type"] == "report"
    assert action["prop_id"] == intent["target_id"]
    assert action["zone"]
    assert set(action["appearance"]) == {"color", "mesh"}
    assert session.companion_memory[intent["target_id"]]["zone"] == action["zone"]
    assert session.companion_memory[intent["target_id"]]["appearance"] == action["appearance"]
    assert intent["target_id"] in session.companion_memory
    assert session.current_mission_index == 0


def test_partner_autonomously_inspects_after_exploring_every_candidate() -> None:
    session = make_session("companion-autonomous-inspection")
    mission = session.current_mission()
    candidates = [mission.real_prop, *mission.decoy_props]
    runtime = session.companion_states["partner"]
    runtime.memory = {
        prop.prop_id: {"position": prop.position, "discovered_at": time.monotonic()}
        for prop in candidates
    }

    intent = decide_companion_intent(session)
    assert intent["state"] == "INSPECT_CANDIDATE"
    assert intent["reason"] == "autonomous_hypothesis"

    partner = session.state.get_player("partner")
    partner.position.x, partner.position.z = intent["target"]["x"], intent["target"]["z"]
    advance_companion(session)
    runtime.goal_started = time.monotonic() - 4.0
    _, action = advance_companion(session)
    assert action == {"type": "inspect", "prop_id": intent["target_id"]}


def test_partner_skips_candidate_already_inspected_by_teammate() -> None:
    session = make_session("companion-skip-inspected")
    mission = session.current_mission()
    candidates = [mission.real_prop, *mission.decoy_props]
    runtime = session.companion_states["partner-2"]
    runtime.memory = {
        prop.prop_id: {"position": prop.position, "discovered_at": time.monotonic()}
        for prop in candidates
    }
    nearest = min(
        candidates,
        key=lambda prop: math.hypot(
            prop.position["x"] - session.state.get_player("partner-2").position.x,
            prop.position["z"] - session.state.get_player("partner-2").position.z,
        ),
    )
    session.inspected_prop_ids.add(nearest.prop_id)

    intent = decide_companion_intent(session, "partner-2")
    assert intent["state"] == "INSPECT_CANDIDATE"
    assert intent["target_id"] != nearest.prop_id


def test_player_description_interrupts_exploration_for_inspection() -> None:
    session = make_session("companion-command")
    prop = session.current_mission().real_prop
    command_companion(session, prop.prop_id, prop.position, "문을 여는 작은 금속 물건")
    intent = decide_companion_intent(session)
    assert intent["state"] == "INSPECT_CANDIDATE"
    assert intent["target_id"] == prop.prop_id


def test_two_companions_keep_independent_memory_and_may_choose_same_target() -> None:
    session = make_session("companion-independent")
    first = decide_companion_intent(session, "partner")
    second = decide_companion_intent(session, "partner-2")
    assert first["target_id"]
    assert second["target_id"]

    prop = session.current_mission().real_prop
    command_companion(session, prop.prop_id, prop.position, "작은 금속 물건", "partner")
    assert decide_companion_intent(session, "partner")["state"] == "INSPECT_CANDIDATE"
    assert session.companion_states["partner-2"].command is None


def test_frozen_teammate_becomes_assigned_rescue_goal() -> None:
    session = make_session("companion-rescue")
    human = session.state.get_player("human")
    human.freeze()
    request_companion_rescue(session, human.player_id)
    intent = decide_companion_intent(session)
    assert intent["state"] == "RESCUE_TEAMMATE"
    assert intent["target_id"] == human.player_id


def test_visible_nearby_seeker_interrupts_exploration() -> None:
    session = make_session("companion-avoid")
    partner = session.state.get_player("partner")
    seeker = session.state.get_player("seeker")
    partner.position.x, partner.position.z = 12.0, 0.0
    seeker.position.x, seeker.position.z = 15.0, 0.0
    intent = decide_companion_intent(session)
    assert intent["state"] == "AVOID_SEEKER"
    assert intent["target"]["x"] < partner.position.x
    assert session.companion_last_seeker_seen["position"] == {"x": 15.0, "z": 0.0}


def test_companion_does_not_see_a_nearby_seeker_through_the_floor() -> None:
    session = make_session("companion-floor-isolation")
    partner = session.state.get_player("partner")
    seeker = session.state.get_player("seeker")
    partner.position.x, partner.position.z = 12.0, 0.0
    seeker.position.x, seeker.position.z = 13.0, 0.0
    partner.position.floor = WorldFloor.F2
    seeker.position.floor = WorldFloor.F1

    assert decide_companion_intent(session)["state"] != "AVOID_SEEKER"


def test_partner_uses_and_reports_recent_seeker_memory_after_losing_sight() -> None:
    session = make_session("companion-seeker-memory")
    partner = session.state.get_player("partner")
    seeker = session.state.get_player("seeker")
    partner.position.x, partner.position.z = 12.0, 0.0
    seeker.position.x, seeker.position.z = 15.0, 0.0
    decide_companion_intent(session)
    seeker.position.x, seeker.position.z = 50.0, 50.0
    remembered = decide_companion_intent(session)
    assert remembered["state"] == "AVOID_SEEKER"
    assert remembered["reason"] == "seeker_last_seen"
    _, action = advance_companion(session)
    assert action == {"type": "seeker_report", "position": {"x": 15.0, "z": 0.0}}


def test_partner_moves_to_gate_in_final_phases() -> None:
    session = make_session("companion-gate")
    session.state.phase = GamePhase.FINAL_SPELL
    assert decide_companion_intent(session)["state"] == "MOVE_TO_GATE"
    session.state.phase = GamePhase.ESCAPE
    assert decide_companion_intent(session)["state"] == "ESCAPE"


def test_vertical_partner_holds_station_then_runs_to_field_exit() -> None:
    from app.game.map_slots import get_map_slot
    from app.game.vertical_flow import final_station_position

    session = make_session("companion-vertical-field-exit")
    session.round_data = None
    session.vertical_round.phase = VerticalRoundPhase.FIELD_FINAL
    session.vertical_round.final_route = FinalRoute.FIELD

    session.state.phase = GamePhase.FINAL_SPELL
    spell_intent = decide_companion_intent(session)
    station_x, _, station_z = final_station_position("partner")
    assert spell_intent["state"] == "MOVE_TO_GATE"
    assert spell_intent["target"] == {"x": station_x, "z": station_z}

    session.vertical_round.phase = VerticalRoundPhase.ESCAPE_OPEN
    session.state.phase = GamePhase.ESCAPE
    escape_intent = decide_companion_intent(session)
    exit_x, _, exit_z = get_map_slot("FIELD_ESCAPE_GATE")["position"]
    assert escape_intent["state"] == "ESCAPE"
    assert escape_intent["target_id"] == "vertical_field_exit"
    assert escape_intent["target"] == {"x": exit_x, "z": exit_z}


def test_visible_seeker_makes_rescue_wait_instead_of_running_into_capture() -> None:
    session = make_session("companion-risky-rescue")
    human = session.state.get_player("human")
    partner = session.state.get_player("partner")
    seeker = session.state.get_player("seeker")
    human.freeze()
    request_companion_rescue(session, human.player_id)
    partner.position.x, partner.position.z = 12.0, 0.0
    seeker.position.x, seeker.position.z = 15.0, 0.0
    assert decide_companion_intent(session)["state"] == "AVOID_SEEKER"


def test_non_urgent_goal_is_held_long_enough_to_avoid_frame_thrashing() -> None:
    session = make_session("companion-goal-hold")
    first = decide_companion_intent(session)
    session.companion_last_intent = first
    session.companion_goal_changed_at = time.monotonic()
    session.companion_memory[first["target_id"]] = {"discovered_at": time.monotonic()}
    held, _ = advance_companion(session)
    assert held["state"] == first["state"]
    assert held["target_id"] == first["target_id"]


def test_vertical_companion_reports_when_it_reaches_active_objective() -> None:
    session = make_session("companion-vertical-objective")
    session.round_data = None
    session.vertical_missions = None  # 층별 미션 없이 기본 동선 테스트
    session.vertical_round.phase = VerticalRoundPhase.FLOOR_2
    partner = session.state.get_player("partner")
    seeker = session.state.get_player("seeker")
    x, y, z = mission_interaction_position(VerticalRoundPhase.FLOOR_2)
    partner.position.x, partner.position.y, partner.position.z = x, y, z
    partner.position.floor = WorldFloor.F2
    seeker.position.floor = WorldFloor.F1

    intent, action = advance_companion(session)

    assert intent["reason"] == "vertical_stage_objective"
    assert action == {"type": "vertical_objective", "phase": "floor_2"}
    assert "floor_2" in session.companion_states["partner"].memory


def test_rooftop_companions_split_east_and_west_signal_scouts() -> None:
    session = make_session("companion-rooftop-scouts")
    session.round_data = None
    seeker = session.state.get_player("seeker")
    seeker.position.floor = WorldFloor.F1

    east = decide_companion_intent(session, "partner")
    west = decide_companion_intent(session, "partner-2")
    east_slot = get_map_slot("ROOF_SIGNAL_EAST")
    west_slot = get_map_slot("ROOF_SIGNAL_WEST")

    assert east["reason"] == west["reason"] == "rooftop_signal_scout"
    assert east["target_id"] == "roof_signal_scout_east"
    assert west["target_id"] == "roof_signal_scout_west"
    assert east["target"] == {
        "x": east_slot["approachPosition"][0],
        "z": east_slot["approachPosition"][2],
    }
    assert west["target"] == {
        "x": west_slot["approachPosition"][0],
        "z": west_slot["approachPosition"][2],
    }
    assert east["arrival_distance"] == east_slot["approachRadius"]
    assert west["arrival_distance"] == west_slot["approachRadius"]
    assert east["target"] != west["target"]

    partner = session.state.get_player("partner")
    distance_before_tick = math.hypot(
        east["target"]["x"] - partner.position.x,
        east["target"]["z"] - partner.position.z,
    )
    session.companion_states["partner"].last_tick = time.monotonic() - 0.25
    advance_companion(session, "partner")
    distance_after_tick = math.hypot(
        east["target"]["x"] - partner.position.x,
        east["target"]["z"] - partner.position.z,
    )
    assert distance_after_tick < distance_before_tick


def test_rooftop_companions_do_not_reverse_near_signal_consoles() -> None:
    session = make_session("companion-rooftop-arrival-stability")
    session.round_data = None
    seeker = session.state.get_player("seeker")
    seeker.position.floor = WorldFloor.F1

    for companion_id in ("partner", "partner-2"):
        runtime = session.companion_states[companion_id]
        partner = session.state.get_player(companion_id)
        intent = decide_companion_intent(session, companion_id)
        previous_distance = math.hypot(
            intent["target"]["x"] - partner.position.x,
            intent["target"]["z"] - partner.position.z,
        )
        near_signal_distances: list[float] = []

        for _ in range(48):
            runtime.last_tick = time.monotonic() - 0.25
            snapshot, _ = advance_companion(session, companion_id)
            distance = math.hypot(
                snapshot["target"]["x"] - snapshot["partner_position"]["x"],
                snapshot["target"]["z"] - snapshot["partner_position"]["z"],
            )
            if previous_distance < 5.0:
                near_signal_distances.append(distance)
            previous_distance = distance
            if distance <= snapshot["arrival_distance"] + 0.05:
                break

        assert near_signal_distances
        assert all(
            current <= previous + 1e-6
            for previous, current in zip(near_signal_distances, near_signal_distances[1:])
        )
        assert previous_distance <= intent["arrival_distance"] + 0.05


def test_rooftop_companion_waits_at_assigned_signal_until_its_turn() -> None:
    session = make_session("companion-rooftop-signal-wait")
    session.round_data = None
    seeker = session.state.get_player("seeker")
    seeker.position.floor = WorldFloor.F1
    partner = session.state.get_player("partner")
    east_position = get_map_slot("ROOF_SIGNAL_EAST")["approachPosition"]
    partner.position.x, partner.position.y, partner.position.z = east_position
    partner.position.floor = WorldFloor.ROOF

    _, early_action = advance_companion(session, "partner")

    assert early_action is None
    assert "roof_signal_scout_east" not in session.companion_states["partner"].memory

    session.vertical_missions.rooftop.activate("center")
    _, ready_action = advance_companion(session, "partner")

    assert ready_action == {"type": "rooftop_signal_ready", "signal_id": "east"}
    assert "roof_signal_scout_east" not in session.companion_states["partner"].memory


def test_vertical_companions_split_mission_support_and_route_scout_roles() -> None:
    expected_support_reasons = {
        VerticalRoundPhase.FLOOR_3: "vertical_stage_objective",
        VerticalRoundPhase.FLOOR_2: "intercom_ai_position",
        VerticalRoundPhase.FLOOR_1: "simultaneous_ai_position",
    }
    floor_by_phase = {
        VerticalRoundPhase.FLOOR_3: WorldFloor.F3,
        VerticalRoundPhase.FLOOR_2: WorldFloor.F2,
        VerticalRoundPhase.FLOOR_1: WorldFloor.F1,
    }
    for phase, support_reason in expected_support_reasons.items():
        session = make_session(f"companion-role-{phase.value}")
        session.round_data = None
        session.vertical_round.phase = phase
        seeker = session.state.get_player("seeker")
        seeker.position.floor = WorldFloor.ROOF
        for companion_id in ("partner", "partner-2"):
            session.state.get_player(companion_id).position.floor = floor_by_phase[phase]

        support = decide_companion_intent(session, "partner")
        scout = decide_companion_intent(session, "partner-2")

        assert support["reason"] == support_reason
        assert scout["reason"] == "next_route_scout"
        assert support["target_id"] != scout["target_id"]
        assert support["target"] != scout["target"]


def test_intercom_companion_prepositions_but_waits_for_human_to_start_device() -> None:
    session = make_session("companion-intercom-preposition")
    session.round_data = None
    session.vertical_round.phase = VerticalRoundPhase.FLOOR_2
    seeker = session.state.get_player("seeker")
    seeker.position.floor = WorldFloor.ROOF
    partner = session.state.get_player("partner")
    intercom_position = get_map_slot("F2_INTERCOM_A")["position"]
    partner.position.x, partner.position.y, partner.position.z = intercom_position
    partner.position.floor = WorldFloor.F2

    _, early_action = advance_companion(session, "partner")

    assert early_action is None
    assert "intercom_mission" not in session.companion_states["partner"].memory

    start_intercom_mission(session)
    _, report_action = advance_companion(session, "partner")

    assert report_action["type"] == "intercom_report"
    assert report_action["sequence"] == session.vertical_missions.intercom.sequence
