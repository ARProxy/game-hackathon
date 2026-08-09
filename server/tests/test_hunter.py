"""기획 2 능동 술래의 서버 권위 목표 선택 테스트."""

import time

from app.ai.hunter import (
    CONTRACT,
    _decide_blocker_intent,
    _safe_hunter_step,
    advance_hunter,
    advance_secondary_hunter,
    decide_hunter_intent,
    director_snapshot,
    effective_seeker_threat,
    record_hunter_signal,
    seeker_can_capture,
    vertical_threat_snapshot,
)
from app.game.session import GameSession
from app.game.progression import SeekerThreat, VerticalRoundPhase, WorldFloor
from app.game.state import PlayerRole
from app.game.authority import WALL_RECTS_BY_FLOOR, segment_intersects_rect
from app.game.map_slots import get_map_slot


def make_session(room_id: str = "hunter") -> GameSession:
    session = GameSession(room_id)
    human = session.state.add_player("human", role=PlayerRole.HUMAN)
    session.setup_game(["열쇠"])
    human.position.x, human.position.z = 20.0, 20.0
    human.position.floor = WorldFloor.F2
    session.state.get_player("partner").position.floor = WorldFloor.F2
    session.state.get_player("seeker").position.floor = WorldFloor.F2
    session.vertical_round.phase = VerticalRoundPhase.FLOOR_2
    return session


def test_contract_matches_design_detection_numbers() -> None:
    assert CONTRACT["visionDistance"] == 12
    assert CONTRACT["visionAngleDegrees"] == 100
    assert CONTRACT["proximityDetectionDistance"] == 8
    assert CONTRACT["hearingDistance"] == 18


def test_hunt_replaces_default_patrol_when_no_information() -> None:
    session = make_session("hunter-hunt")
    session.hunter_forward = {"x": 1.0, "z": 0.0}
    intent = decide_hunter_intent(session)
    assert intent["state"] == "HUNT"
    assert intent["reason"] == "probable_mission_zone"


def test_nearest_visible_human_or_ai_is_selected_equally() -> None:
    session = make_session("hunter-visible")
    seeker = session.state.get_player("seeker")
    human = session.state.get_player("human")
    partner = session.state.get_player("partner")
    assert seeker and human and partner
    seeker.position.x, seeker.position.z = 12.0, 0.0
    human.position.x, human.position.z = 17.0, 0.0
    partner.position.x, partner.position.z = 15.0, 0.0
    session.hunter_forward = {"x": 1.0, "z": 0.0}
    intent = decide_hunter_intent(session)
    assert intent["state"] == "DETECTED"
    assert intent["target_id"] == "partner"


def test_escaped_ai_is_removed_from_hunter_targets() -> None:
    session = make_session("hunter-escaped-ai")
    seeker = session.state.get_player("seeker")
    partner = session.state.get_player("partner")
    seeker.position.x, seeker.position.z = 12.0, 0.0
    partner.position.x, partner.position.z = 15.0, 0.0
    partner.escape()
    session.hunter_forward = {"x": 1.0, "z": 0.0}
    assert decide_hunter_intent(session)["target_id"] != "partner"


def test_wall_blocks_visual_detection() -> None:
    session = make_session("hunter-wall")
    seeker = session.state.get_player("seeker")
    human = session.state.get_player("human")
    partner = session.state.get_player("partner")
    assert seeker and human and partner
    x, z, sx, sz = next(rect for rect in WALL_RECTS_BY_FLOOR["F1"] if min(rect[2], rect[3]) <= 0.5)
    if sx < sz:
        seeker.position.x, seeker.position.z = x - sx, z
        human.position.x, human.position.z = x + sx, z
    else:
        seeker.position.x, seeker.position.z = x, z - sz
        human.position.x, human.position.z = x, z + sz
    partner.position.x, partner.position.z = 30.0, 30.0
    session.hunter_forward = {"x": human.position.x - seeker.position.x, "z": human.position.z - seeker.position.z}
    assert decide_hunter_intent(session)["state"] == "HUNT"


def test_sound_is_investigated_and_lost_visual_is_searched() -> None:
    session = make_session("hunter-memory")
    seeker = session.state.get_player("seeker")
    partner = session.state.get_player("partner")
    assert seeker and partner
    seeker.position.x, seeker.position.z = 0.0, 0.0
    partner.position.x, partner.position.z = 30.0, 30.0
    record_hunter_signal(session, "human", {"x": 4.0, "z": 9.0}, "speech")
    session.hunter_forward = {"x": -1.0, "z": 0.0}
    investigated = decide_hunter_intent(session)
    assert investigated["state"] == "INVESTIGATE"
    assert investigated["target"] == {"x": 4.0, "z": 9.0}

    session.hunter_signal = None
    session.hunter_last_seen = {
        "player_id": "partner", "position": {"x": -3.0, "z": 7.0},
        "timestamp": time.monotonic(),
    }
    searched = decide_hunter_intent(session)
    assert searched["state"] == "SEARCH"
    assert searched["target_id"] == "partner"


def test_normal_speech_outside_hearing_radius_is_not_a_signal() -> None:
    session = make_session("hunter-hearing")
    seeker = session.state.get_player("seeker")
    assert seeker
    seeker.position.x, seeker.position.z = 0.0, 0.0
    heard = record_hunter_signal(session, "human", {"x": 19.0, "z": 0.0}, "speech")
    assert not heard
    assert session.hunter_signal is None

    heard = record_hunter_signal(session, "human", {"x": 18.0, "z": 0.0}, "speech")
    assert heard
    assert session.hunter_signal is not None


def test_normal_speech_and_vision_do_not_cross_floors() -> None:
    session = make_session("hunter-floor-isolation")
    human = session.state.get_player("human")
    seeker = session.state.get_player("seeker")
    partner = session.state.get_player("partner")
    assert human and seeker and partner
    human.position.x, human.position.z = 1.0, 0.0
    seeker.position.x, seeker.position.z = 0.0, 0.0
    partner.position.x, partner.position.z = 30.0, 30.0
    human.position.floor = WorldFloor.F2
    seeker.position.floor = WorldFloor.F1
    session.vertical_round.phase = VerticalRoundPhase.FLOOR_1

    assert not record_hunter_signal(
        session, "human", {"x": 1.0, "z": 0.0}, "speech",
    )
    session.hunter_forward = {"x": 1.0, "z": 0.0}
    assert decide_hunter_intent(session)["state"] == "HUNT"


def test_freeze_ping_can_lure_a_seeker_from_another_floor() -> None:
    session = make_session("hunter-cross-floor-freeze")
    human = session.state.get_player("human")
    seeker = session.state.get_player("seeker")
    assert human and seeker
    human.position.floor = WorldFloor.F3
    seeker.position.floor = WorldFloor.F2

    assert record_hunter_signal(
        session, "human", {"x": 4.0, "z": 9.0}, "freeze",
    )
    intent = decide_hunter_intent(session)
    assert intent["state"] == "TRANSIT"
    assert intent["floor_transition"]["destination_floor"] == "F3"
    assert intent["floor_transition"]["traversal"] == "stairs"


def test_primary_hunter_reaches_stair_entry_before_server_floor_changes() -> None:
    session = make_session("hunter-physical-floor-transition")
    seeker = session.state.get_player("seeker")
    session.vertical_round.phase = VerticalRoundPhase.FLOOR_2
    seeker.position.floor = WorldFloor.F3
    entry = get_map_slot("F3_F2_STAIR_WEST_TOP_CROSSING")
    seeker.position.x, seeker.position.y, seeker.position.z = entry["position"]
    session.hunter_last_tick = time.monotonic() - 0.5

    intent = advance_hunter(session)

    assert seeker.position.floor == WorldFloor.F2
    assert intent["actor_floor_changed"] == {
        "actor_id": "seeker", "route": "west", "traversal": "stairs",
        "path_id": "F3_F2_STAIRS_WEST", "direction": "down", "duration": 3.6,
        "position": {
            "x": -38.35, "y": 3.6, "z": -40.8, "floor": "F2",
            "zone": "hunter_f3_f2_stairs_west_exit",
        },
    }
    assert not seeker_can_capture(session, "seeker")
    session.hunter_transit_until["seeker"] = time.monotonic() - 0.01
    assert seeker_can_capture(session, "seeker")


def test_hunter_chooses_nearest_parallel_stair() -> None:
    session = make_session("hunter-nearest-stair")
    seeker = session.state.get_player("seeker")
    east = get_map_slot("F3_F2_STAIR_EAST_TOP_CROSSING")
    seeker.position.floor = WorldFloor.F3
    seeker.position.x, seeker.position.y, seeker.position.z = east["position"]
    session.vertical_round.phase = VerticalRoundPhase.FLOOR_2

    intent = decide_hunter_intent(session)

    assert intent["floor_transition"]["path_id"] == "F3_F2_STAIRS_EAST"


def test_hunter_uses_nearby_elevator_for_multi_floor_pursuit() -> None:
    session = make_session("hunter-elevator")
    seeker = session.state.get_player("seeker")
    seeker.position.floor = WorldFloor.F3
    seeker.position.x, seeker.position.y, seeker.position.z = -12.0, 7.2, -41.7
    session.vertical_round.phase = VerticalRoundPhase.FLOOR_1
    session.hunter_last_tick = time.monotonic() - 0.5

    intent = advance_hunter(session)

    assert intent["floor_transition"]["traversal"] == "elevator"
    assert intent["floor_transition"]["path_id"] == "ELEVATOR_EVP"
    assert intent["actor_floor_changed"]["position"]["floor"] == "F1"
    assert session.hunter_transit_until["seeker"] > time.monotonic() + 3.0
    assert not seeker_can_capture(session, "seeker")


def test_server_step_does_not_cross_a_wall_segment() -> None:
    wall = next(rect for rect in WALL_RECTS_BY_FLOOR["F1"] if min(rect[2], rect[3]) <= 0.5)
    x, z, sx, sz = wall
    start, target = ((x - sx, z), (x + sx, z)) if sx < sz else ((x, z - sz), (x, z + sz))
    next_position = _safe_hunter_step(*start, *target, 0.4, "F1")
    assert not segment_intersects_rect(start, next_position, wall)


def test_server_step_repeatedly_follows_wall_instead_of_stalling() -> None:
    wall = next(rect for rect in WALL_RECTS_BY_FLOOR["F1"] if min(rect[2], rect[3]) <= 0.5)
    x, z, sx, sz = wall
    position, target = ((x - sx, z), (x + sx, z)) if sx < sz else ((x, z - sz), (x, z + sz))
    start = position
    visited = []
    for _ in range(50):
        position = _safe_hunter_step(*position, *target, 0.25, "F1")
        visited.append(position)
    assert any(point != start for point in visited)
    assert all(
        not segment_intersects_rect(previous, current, wall)
        for previous, current in zip([start, *visited], visited)
    )


def test_expired_signal_does_not_keep_visual_threat_bonus() -> None:
    session = make_session("hunter-stale-signal")
    session.hunter_signal = {
        "player_id": "human", "position": {"x": 0.0, "z": 0.0},
        "strength": "speech", "timestamp": time.monotonic() - CONTRACT["memorySeconds"] - 1,
    }
    session.hunter_forward = {"x": 1.0, "z": 0.0}
    intent = decide_hunter_intent(session)
    assert intent["reason"] != "speech"


def test_recent_signal_and_visible_runner_can_be_scored_together() -> None:
    session = make_session("hunter-visible-signal")
    seeker = session.state.get_player("seeker")
    human = session.state.get_player("human")
    partner = session.state.get_player("partner")
    assert seeker and human and partner
    seeker.position.x, seeker.position.z = 12.0, 0.0
    human.position.x, human.position.z = 17.0, 0.0
    partner.position.x, partner.position.z = 30.0, 30.0
    session.hunter_forward = {"x": 1.0, "z": 0.0}
    record_hunter_signal(session, "human", {"x": 17.0, "z": 0.0}, "speech")
    assert decide_hunter_intent(session)["target_id"] == "human"


def test_director_pressure_rises_with_time_and_mission_progress() -> None:
    session = make_session("hunter-director-progress")
    started_at = session.state.started_at
    early = director_snapshot(session, now=started_at)
    session.current_mission_index = 2
    late = director_snapshot(session, now=started_at + 180)

    assert late["director_tension"] > early["director_tension"]
    assert late["speed_multiplier"] > early["speed_multiplier"]
    assert CONTRACT["director"]["minSpeedMultiplier"] <= early["speed_multiplier"]
    assert late["speed_multiplier"] <= CONTRACT["director"]["maxSpeedMultiplier"]


def test_director_reduces_pressure_while_teammate_is_frozen() -> None:
    session = make_session("hunter-director-relief")
    checked_at = session.state.started_at + 90
    normal = director_snapshot(session, now=checked_at)
    session.state.get_player("partner").freeze()
    relief = director_snapshot(session, now=checked_at)

    assert relief["director_tension"] < normal["director_tension"]
    assert relief["speed_multiplier"] < normal["speed_multiplier"]


def test_vertical_threat_grows_as_runners_descend_and_time_passes() -> None:
    session = make_session("hunter-vertical-pressure")
    started_at = session.state.started_at
    session.vertical_round.phase = VerticalRoundPhase.FLOOR_3
    floor_3 = vertical_threat_snapshot(session, now=started_at)
    session.vertical_round.phase = VerticalRoundPhase.FLOOR_1
    floor_1 = vertical_threat_snapshot(session, now=started_at + 480)

    assert floor_1["stage_speed_multiplier"] > floor_3["stage_speed_multiplier"]


def test_vertical_phase_speed_never_drops_during_final_reveal_or_escape() -> None:
    session = make_session("hunter-stage-speed")
    started_at = session.state.started_at
    expected = {
        VerticalRoundPhase.FLOOR_3: 0.9,
        VerticalRoundPhase.FLOOR_2: 1.05,
        VerticalRoundPhase.FLOOR_1: 1.2,
        VerticalRoundPhase.FINAL_ROUTE_REVEAL: 1.2,
        VerticalRoundPhase.FIELD_FINAL: 1.3,
        VerticalRoundPhase.BASEMENT_FINAL: 1.3,
        VerticalRoundPhase.ESCAPE_OPEN: 1.3,
    }

    for phase, speed in expected.items():
        session.vertical_round.phase = phase
        assert vertical_threat_snapshot(session, now=started_at)[
            "stage_speed_multiplier"
        ] == speed


def test_forbidden_rage_expands_hearing_and_vision() -> None:
    session = make_session("hunter-rage-senses")
    session.vertical_round.phase = VerticalRoundPhase.FLOOR_2
    for _ in range(7):
        session.vertical_round.record_human_forbidden_word_violation()
    threat = vertical_threat_snapshot(session, now=session.state.started_at)

    assert threat["hearing_multiplier"] == 1.25
    assert threat["vision_multiplier"] == 1.2


def test_secondary_seeker_activates_only_from_first_floor() -> None:
    session = make_session("hunter-pincer")
    primary = {
        "target": {"x": 10.0, "z": 8.0}, "target_id": "human",
        "speed_multiplier": 1.0, "stage_speed_multiplier": 1.2,
    }
    session.vertical_round.phase = VerticalRoundPhase.FLOOR_2
    assert advance_secondary_hunter(session, primary) is None

    session.vertical_round.phase = VerticalRoundPhase.FLOOR_1
    secondary = session.state.get_player("seeker-2")
    secondary.position.floor = WorldFloor.F1
    result = advance_secondary_hunter(session, primary)
    assert result is not None
    # S3: 차단자는 역할 분화된 reason을 반환한다
    assert result["reason"] in {"pincer_flank", "area_patrol", "visual_block", "frozen_guard"}
    assert result.get("role") == "blocker" or result["target"] != primary["target"]


def test_rooftop_and_early_third_floor_cannot_track_or_capture() -> None:
    session = make_session("hunter-passive-phases")
    seeker = session.state.get_player("seeker")
    human = session.state.get_player("human")
    seeker.position.x, seeker.position.z = 0.0, 0.0
    human.position.x, human.position.z = 1.0, 0.0

    session.vertical_round.phase = VerticalRoundPhase.ROOFTOP_INTRO
    assert effective_seeker_threat(session) == SeekerThreat.INACTIVE
    assert not record_hunter_signal(session, "human", {"x": 1.0, "z": 0.0}, "freeze")
    assert decide_hunter_intent(session)["reason"] == "inactive"
    assert not seeker_can_capture(session, "seeker")

    session.vertical_round.phase = VerticalRoundPhase.FLOOR_3
    seeker.position.floor = human.position.floor = WorldFloor.F3
    assert effective_seeker_threat(session) == SeekerThreat.OMEN
    omen = decide_hunter_intent(session)
    assert omen["reason"] == "omen_patrol"
    assert omen["target"] != {"x": seeker.position.x, "z": seeker.position.z}
    assert not seeker_can_capture(session, "seeker")


def test_third_floor_broadcast_opens_limited_patrol_and_visual_chase() -> None:
    session = make_session("hunter-limited")
    seeker = session.state.get_player("seeker")
    human = session.state.get_player("human")
    partner = session.state.get_player("partner")
    session.vertical_round.phase = VerticalRoundPhase.FLOOR_3
    session.broadcast_mission_actor_id = "human"
    seeker.position.floor = human.position.floor = WorldFloor.F3
    partner.position.floor = WorldFloor.F2
    seeker.position.x, seeker.position.z = -24.0, -38.0
    human.position.x, human.position.z = -5.0, -5.0

    assert effective_seeker_threat(session) == SeekerThreat.LIMITED_HUNT
    patrol = decide_hunter_intent(session)
    assert patrol["reason"] == "limited_patrol"
    assert patrol["target"] != {"x": seeker.position.x, "z": seeker.position.z}
    assert seeker_can_capture(session, "seeker")

    human.position.x, human.position.z = -23.0, -38.0
    session.hunter_forward = {"x": 1.0, "z": 0.0}
    assert decide_hunter_intent(session)["state"] == "DETECTED"


def test_third_floor_omen_patrol_actually_moves_from_reveal_door() -> None:
    session = make_session("hunter-omen-moves")
    seeker = session.state.get_player("seeker")
    human = session.state.get_player("human")
    partner = session.state.get_player("partner")
    session.vertical_round.phase = VerticalRoundPhase.FLOOR_3
    seeker.position.floor = WorldFloor.F3
    seeker.position.x, seeker.position.z = -36.0, -38.2
    human.position.floor = partner.position.floor = WorldFloor.F2
    session.hunter_last_tick = time.monotonic() - 0.5
    before = (seeker.position.x, seeker.position.z)

    result = advance_hunter(session)

    assert result["reason"] == "omen_patrol"
    assert (seeker.position.x, seeker.position.z) != before


def test_blocker_uses_map_nodes_for_patrol_and_zone_sharing() -> None:
    from app.game.authority import NAVIGATION_NODES_BY_FLOOR

    session = make_session("hunter-blocker-map")
    session.vertical_round.phase = VerticalRoundPhase.FLOOR_1
    blocker = session.state.get_player("seeker-2")
    human = session.state.get_player("human")
    session.state.get_player("partner").position.floor = WorldFloor.F2
    session.state.get_player("partner-2").position.floor = WorldFloor.F2
    blocker.position.floor = human.position.floor = WorldFloor.F1
    blocker.position.x, blocker.position.z = -24.0, -38.0
    human.position.x, human.position.z = -21.3, -38.0
    session.blocker_forward = {"x": 1.0, "z": 0.0}
    primary = {"target": {"x": -10.0, "z": -18.0}}

    blocking = _decide_blocker_intent(session, primary)
    assert blocking["state"] == "BLOCK"
    assert session.blocker_zone_share["position"] != {
        "x": human.position.x, "z": human.position.z,
    }
    node_positions = {
        (float(node["position"][0]), float(node["position"][1]))
        for node in NAVIGATION_NODES_BY_FLOOR["F1"]
    }
    assert (blocking["target"]["x"], blocking["target"]["z"]) in node_positions

    human.position.floor = WorldFloor.F2
    patrol = _decide_blocker_intent(session, primary)
    assert patrol["state"] == "PATROL"
    assert (patrol["target"]["x"], patrol["target"]["z"]) in node_positions


def test_blocker_guard_timer_starts_on_first_guard_and_expires() -> None:
    session = make_session("hunter-blocker-guard")
    session.vertical_round.phase = VerticalRoundPhase.FLOOR_1
    blocker = session.state.get_player("seeker-2")
    human = session.state.get_player("human")
    session.state.get_player("partner").position.floor = WorldFloor.F2
    session.state.get_player("partner-2").position.floor = WorldFloor.F2
    blocker.position.floor = human.position.floor = WorldFloor.F1
    blocker.position.x, blocker.position.z = -24.0, -30.0
    human.position.x, human.position.z = -24.0, -26.0
    session.blocker_forward = {"x": 0.0, "z": -1.0}
    human.freeze()

    guarded = _decide_blocker_intent(session, {"target": {"x": -10.0, "z": -18.0}})
    assert guarded["state"] == "GUARD"
    assert session.blocker_guard_start is not None

    session.blocker_guard_start -= 9.0
    released = _decide_blocker_intent(session, {"target": {"x": -10.0, "z": -18.0}})
    assert released["state"] == "PATROL"
