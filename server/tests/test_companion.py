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
from app.game.session import GameSession
from app.game.progression import VerticalRoundPhase, WorldFloor
from app.game.state import GamePhase, PlayerRole
from app.game.vertical_flow import mission_interaction_position


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
