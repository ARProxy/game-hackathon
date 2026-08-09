"""기획 2 AI 동료 독립 목표와 서버 권위 계약 테스트."""

import math
import time

import pytest

from app.ai.companion import (
    advance_companion,
    command_companion,
    companion_snapshot,
    decide_companion_intent,
    request_companion_rescue,
)
from app.ai.mission import generate_round
from app.game.map_slots import get_map_slot
from app.game.session import GameSession
from app.game.progression import FinalRoute, VerticalRoundPhase, WorldFloor
from app.game.state import GamePhase, PlayerRole
from app.game.vertical_flow import activate_rooftop_signal, mission_interaction_position, start_intercom_mission


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


def test_companion_snapshot_is_safe_before_reserved_actor_registration() -> None:
    session = make_session("companion-pre-setup-snapshot")
    session.state.players.pop("partner-2")

    snapshot = companion_snapshot(session, "partner-2")

    assert snapshot["state"] == "INCAPACITATED"
    assert snapshot["reason"] == "partner_unavailable"
    assert snapshot["partner_position"] == {"x": 0.0, "z": 0.0}


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


def test_vertical_description_commands_physical_candidate_inspection() -> None:
    session = GameSession("vertical-companion-command")
    session.state.add_player("human", PlayerRole.HUMAN)
    session.setup_game(["열쇠"])
    session.vertical_round.phase = VerticalRoundPhase.FLOOR_3
    partner = session.state.get_player("partner")
    seeker = session.state.get_player("seeker")
    candidate = session.vertical_missions.broadcast.candidates[0]
    partner.position.floor = WorldFloor.F3
    partner.position.x = candidate.position["x"]
    partner.position.z = candidate.position["z"]
    seeker.position.floor = WorldFloor.F3
    seeker.position.x, seeker.position.z = -5.0, -5.0

    command_companion(
        session, candidate.prop_id, candidate.position,
        "은빛 작은 금속이고 잠긴 출입구를 여는 도구",
    )

    intent = decide_companion_intent(session)
    assert intent["state"] == "INSPECT_CANDIDATE"
    assert intent["target_id"] == candidate.prop_id
    assert intent["reason"] == "player_description"
    _, first_action = advance_companion(session)
    assert first_action is None
    session.companion_states["partner"].goal_started = time.monotonic() - 4.0
    _, completed_action = advance_companion(session)
    assert completed_action == {"type": "inspect", "prop_id": candidate.prop_id}


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


def test_rooftop_companions_split_live_signal_guide_and_opposite_scout() -> None:
    session = make_session("companion-rooftop-scouts")
    session.round_data = None
    seeker = session.state.get_player("seeker")
    seeker.position.floor = WorldFloor.F1

    intents = {
        "partner": decide_companion_intent(session, "partner"),
        "partner-2": decide_companion_intent(session, "partner-2"),
    }
    next_signal_id = session.vertical_missions.rooftop.next_signal_id
    guide_id = "partner-2" if next_signal_id == "west" else "partner"
    scout_id = "partner" if guide_id == "partner-2" else "partner-2"
    guide, scout = intents[guide_id], intents[scout_id]
    guide_slot = get_map_slot(f"ROOF_SIGNAL_{next_signal_id.upper()}")

    assert guide["reason"] == "rooftop_signal_guide"
    assert guide["target_id"] == f"roof_signal_guide_{next_signal_id}"
    assert guide["target"] == {
        "x": guide_slot["aiApproachPosition"][0],
        "z": guide_slot["aiApproachPosition"][2],
    }
    assert guide["arrival_distance"] == guide_slot["approachRadius"]
    assert scout["reason"] == "rooftop_signal_scout"
    assert scout["target_id"].startswith("roof_signal_scout_")
    assert guide["target"] != scout["target"]

    partner = session.state.get_player("partner")
    partner_intent = intents["partner"]
    distance_before_tick = math.hypot(
        partner_intent["target"]["x"] - partner.position.x,
        partner_intent["target"]["z"] - partner.position.z,
    )
    session.companion_states["partner"].last_tick = time.monotonic() - 0.25
    advance_companion(session, "partner")
    distance_after_tick = math.hypot(
        partner_intent["target"]["x"] - partner.position.x,
        partner_intent["target"]["z"] - partner.position.z,
    )
    assert distance_after_tick < distance_before_tick


def test_rooftop_guide_retargets_when_human_enters_the_next_signal() -> None:
    session = make_session("companion-rooftop-live-retarget")
    session.round_data = None
    human = session.state.get_player("human")
    human.position.floor = WorldFloor.ROOF
    first_signal = session.vertical_missions.rooftop.next_signal_id
    first_slot = get_map_slot(f"ROOF_SIGNAL_{first_signal.upper()}")
    human.position.x, human.position.y, human.position.z = first_slot["interactionPosition"]

    activate_rooftop_signal(session, "human", first_signal)

    next_signal = session.vertical_missions.rooftop.next_signal_id
    guide_id = "partner-2" if next_signal == "west" else "partner"
    guide = decide_companion_intent(session, guide_id)
    assert guide["reason"] == "rooftop_signal_guide"
    assert guide["target_id"] == f"roof_signal_guide_{next_signal}"


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


def test_rooftop_companion_reports_assigned_signal_once_on_arrival() -> None:
    session = make_session("companion-rooftop-signal-wait")
    session.round_data = None
    seeker = session.state.get_player("seeker")
    seeker.position.floor = WorldFloor.F1
    partner = session.state.get_player("partner")
    intent = decide_companion_intent(session, "partner")
    signal_id = intent["target_id"].rsplit("_", 1)[-1]
    signal_position = get_map_slot(f"ROOF_SIGNAL_{signal_id.upper()}")["aiApproachPosition"]
    partner.position.x, partner.position.y, partner.position.z = signal_position
    partner.position.floor = WorldFloor.ROOF

    _, observed_action = advance_companion(session, "partner")

    guiding = intent["reason"] == "rooftop_signal_guide"
    assert observed_action == {
        "type": "rooftop_signal_activate" if guiding and signal_id in {"east", "west"} else "rooftop_signal_observed",
        "signal_id": signal_id,
        "guiding": guiding,
    }
    assert intent["target_id"] in session.companion_states["partner"].memory

    _, repeated_action = advance_companion(session, "partner")

    assert repeated_action is None


def test_vertical_companions_split_mission_support_and_route_scout_roles() -> None:
    expected_support_reasons = {
        VerticalRoundPhase.FLOOR_3: "vertical_stage_objective",
        VerticalRoundPhase.FLOOR_2: "intercom_ai_position",
        VerticalRoundPhase.FLOOR_1: "security_waiting_for_guidance",
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


def test_floor_one_companion_moves_only_after_cctv_direction_is_accepted() -> None:
    session = make_session("companion-security-guidance")
    session.round_data = None
    session.vertical_round.phase = VerticalRoundPhase.FLOOR_1
    partner = session.state.get_player("partner")
    partner.position.floor = WorldFloor.F1
    session.state.get_player("seeker").position.floor = WorldFloor.ROOF
    sim = session.vertical_missions.simultaneous

    waiting = decide_companion_intent(session, "partner")
    assert waiting["reason"] == "security_waiting_for_guidance"

    sim.start_guidance("human")
    sim.submit_direction("앞으로 직진")
    moving = decide_companion_intent(session, "partner")

    assert moving["reason"] == "security_guided_route"
    assert moving["target_id"] == "security_route_1"


def test_basement_companion_activates_commanded_standby_device() -> None:
    session = make_session("companion-basement-command")
    session.round_data = None
    session.vertical_round.phase = VerticalRoundPhase.BASEMENT_FINAL
    session.vertical_round.final_route = FinalRoute.BASEMENT
    session.vertical_missions.basement.correct_order = ["panel", "valve", "generator"]
    partner = session.state.get_player("partner")
    slot = get_map_slot("BASEMENT_DEVICE_PANEL")
    partner.position.x, partner.position.y, partner.position.z = slot["position"]
    partner.position.floor = WorldFloor.B1
    session.state.get_player("seeker").position.floor = WorldFloor.ROOF
    session.vertical_missions.basement.command_device("panel", "human")

    _, action = advance_companion(session, "partner")

    assert action["type"] == "basement_device_activate"
    assert action["device_id"] == "panel"


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


def test_companion_holds_active_floor_role_when_human_returns_to_previous_floor() -> None:
    session = make_session("companion-hold-active-floor")
    session.round_data = None
    session.vertical_round.phase = VerticalRoundPhase.FLOOR_2
    partner = session.state.get_player("partner")
    seeker = session.state.get_player("seeker")
    partner.position.floor = WorldFloor.F2
    seeker.position.floor = WorldFloor.ROOF
    session.companion_states["partner"].player_floor_changed = {
        "floor": "F3",
        "position": {"x": -36.0, "y": 7.2, "z": -39.7, "floor": "F3", "zone": "f3_core_nw"},
        "timestamp": time.monotonic(),
    }

    intent = decide_companion_intent(session, "partner")

    assert intent["state"] != "FOLLOW_TO_FLOOR"
    assert intent["reason"] == "intercom_ai_position"
    assert session.companion_states["partner"].player_floor_changed is not None


def test_rooftop_companions_use_separate_stair_lanes_before_following_player_down() -> None:
    bottom = get_map_slot("ROOF_TO_F3_STAIR_BOTTOM_CROSSING")
    top = get_map_slot("F3_TO_ROOF_STAIR_TOP_CROSSING")
    for companion_id, lateral_offset, start_slot in (
        ("partner", -0.38, "ROOF_SIGNAL_EAST"),
        ("partner-2", 0.38, "ROOF_SIGNAL_WEST"),
    ):
        session = make_session(f"companion-physical-roof-stair-{companion_id}")
        session.round_data = None
        session.vertical_round.phase = VerticalRoundPhase.FLOOR_3
        partner = session.state.get_player(companion_id)
        seeker = session.state.get_player("seeker")
        partner.position.floor = WorldFloor.ROOF
        start = get_map_slot(start_slot)["aiApproachPosition"]
        partner.position.x, partner.position.y, partner.position.z = start
        seeker.position.floor = WorldFloor.F1
        runtime = session.companion_states[companion_id]
        runtime.player_floor_changed = {
            "floor": "F3",
            "position": {
                "x": bottom["position"][0], "y": bottom["position"][1],
                "z": bottom["position"][2], "floor": "F3", "zone": bottom["zone"],
            },
            "timestamp": time.monotonic(),
        }

        intent = decide_companion_intent(session, companion_id)

        assert intent["state"] == "FOLLOW_TO_FLOOR"
        assert intent["_stair_direction"] == "down"
        assert intent["target"] == {
            "x": top["position"][0] + lateral_offset,
            "z": top["position"][2],
        }
        assert runtime.player_floor_changed is not None

        action = None
        for _ in range(120):
            runtime.last_tick = time.monotonic() - 0.5
            _, action = advance_companion(session, companion_id)
            if action:
                break

        assert action == {
            "type": "floor_transition",
            "target_floor": runtime.player_floor_changed["position"],
            "traversal": "stairs",
            "direction": "down",
            "path_id": "ROOF_F3_STAIRS",
        }


def test_companion_walks_to_authored_stair_entry_before_following_between_floors() -> None:
    session = make_session("companion-physical-f3-f2-stair")
    session.round_data = None
    session.vertical_round.phase = VerticalRoundPhase.FLOOR_2
    partner = session.state.get_player("partner")
    session.state.get_player("seeker").position.floor = WorldFloor.F1
    partner.position.floor = WorldFloor.F3
    destination = get_map_slot("F3_F2_STAIR_EAST_BOTTOM_CROSSING")
    runtime = session.companion_states["partner"]
    runtime.player_floor_changed = {
        "floor": "F2",
        "position": {
            "x": destination["position"][0], "y": destination["position"][1],
            "z": destination["position"][2], "floor": "F2", "zone": destination["zone"],
        },
        "route": "east", "traversal": "stairs",
        "path_id": "F3_F2_STAIRS_EAST", "direction": "down",
        "timestamp": time.monotonic(),
    }

    intent = decide_companion_intent(session, "partner")

    assert intent["state"] == "FOLLOW_TO_FLOOR"
    assert intent["target"]["x"] == pytest.approx(-10.03)
    assert intent["target"]["z"] == pytest.approx(-15.66)
    assert intent["_path_id"] == "F3_F2_STAIRS_EAST"
    partner.position.x, partner.position.z = intent["target"]["x"], intent["target"]["z"]
    _, action = advance_companion(session, "partner")
    assert action == {
        "type": "floor_transition",
        "target_floor": runtime.player_floor_changed["position"],
        "traversal": "stairs", "direction": "down",
        "path_id": "F3_F2_STAIRS_EAST",
    }


def test_companion_follows_human_through_same_elevator_contract() -> None:
    session = make_session("companion-elevator-follow")
    session.round_data = None
    session.vertical_round.phase = VerticalRoundPhase.FLOOR_3
    partner = session.state.get_player("partner")
    session.state.get_player("seeker").position.floor = WorldFloor.F1
    partner.position.floor = WorldFloor.ROOF
    runtime = session.companion_states["partner"]
    runtime.player_floor_changed = {
        "floor": "F3",
        "position": {"x": -12.0, "y": 7.2, "z": -41.7, "floor": "F3", "zone": "evp_f3"},
        "route": "elevator", "traversal": "elevator", "elevator_id": "evp",
        "timestamp": time.monotonic(),
    }

    intent = decide_companion_intent(session, "partner")

    assert intent["state"] == "FOLLOW_TO_FLOOR"
    assert intent["target"] == {"x": -12.0, "z": -41.7}
    assert intent["_traversal"] == "elevator"
    partner.position.x, partner.position.z = -12.0, -41.7
    _, action = advance_companion(session, "partner")
    assert action == {
        "type": "floor_transition",
        "target_floor": runtime.player_floor_changed["position"],
        "traversal": "elevator", "direction": None,
        "path_id": None, "elevator_id": "evp",
    }
