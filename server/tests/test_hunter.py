"""기획 2 능동 술래의 서버 권위 목표 선택 테스트."""

import time

from app.ai.hunter import (
    CONTRACT,
    _safe_hunter_step,
    advance_secondary_hunter,
    decide_hunter_intent,
    director_snapshot,
    record_hunter_signal,
    vertical_threat_snapshot,
)
from app.game.session import GameSession
from app.game.progression import VerticalRoundPhase, WorldFloor
from app.game.state import PlayerRole
from app.game.authority import WALL_RECTS_BY_FLOOR, segment_intersects_rect


def make_session(room_id: str = "hunter") -> GameSession:
    session = GameSession(room_id)
    human = session.state.add_player("human", role=PlayerRole.HUMAN)
    session.setup_game(["열쇠"])
    human.position.x, human.position.z = 20.0, 20.0
    human.position.floor = WorldFloor.F1
    session.state.get_player("partner").position.floor = WorldFloor.F1
    session.state.get_player("seeker").position.floor = WorldFloor.F1
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
    assert decide_hunter_intent(session)["state"] == "INVESTIGATE"


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
