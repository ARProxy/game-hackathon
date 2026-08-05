"""기획 2 능동 술래의 서버 권위 목표 선택 테스트."""

import time

from app.ai.hunter import CONTRACT, _safe_hunter_step, decide_hunter_intent, record_hunter_signal
from app.game.session import GameSession
from app.game.state import PlayerRole


def make_session(room_id: str = "hunter") -> GameSession:
    session = GameSession(room_id)
    human = session.state.add_player("human", role=PlayerRole.HUMAN)
    session.setup_game(["열쇠"])
    human.position.x, human.position.z = 20.0, 20.0
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


def test_wall_blocks_visual_detection() -> None:
    session = make_session("hunter-wall")
    seeker = session.state.get_player("seeker")
    human = session.state.get_player("human")
    partner = session.state.get_player("partner")
    assert seeker and human and partner
    seeker.position.x, seeker.position.z = 0.0, -25.9
    human.position.x, human.position.z = 0.0, -24.9
    partner.position.x, partner.position.z = 30.0, 30.0
    session.hunter_forward = {"x": 0.0, "z": 1.0}
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


def test_server_step_does_not_cross_a_wall_segment() -> None:
    next_position = _safe_hunter_step(0.0, -25.9, 0.0, -24.0, 1.0)
    assert next_position[1] <= -25.4
    assert next_position != (0.0, -25.9)


def test_server_step_repeatedly_follows_wall_instead_of_stalling() -> None:
    position = (0.0, -25.9)
    target = (0.0, -24.0)
    visited = []
    for _ in range(50):
        position = _safe_hunter_step(*position, *target, 0.55)
        visited.append(position)

    assert max(abs(x) for x, _ in visited) > 8.0
    assert position[1] > -25.4


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
