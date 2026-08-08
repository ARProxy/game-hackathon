"""층별 미션 상호작용 서버 권위 테스트."""

import pytest

from app.game.progression import InvalidProgression, VerticalRoundPhase, WorldFloor
from app.game.session import GameSession
from app.game.state import PlayerRole
from app.game.vertical_flow import (
    activate_final_station,
    complete_current_stage,
    evaluate_broadcast_phrase,
    final_station_position,
    mission_interaction_position,
    use_open_floor_transition,
    use_elevator,
)


def test_broadcast_phrase_requires_tool_exit_and_action_meaning() -> None:
    assert evaluate_broadcast_phrase("작은 금속 도구로 잠긴 출입구를 개방한다")["success"]
    result = evaluate_broadcast_phrase("출입구 근처에 금속 도구가 있다")
    assert not result["success"]
    assert result["missing"] == ["action"]


def active_session() -> tuple[GameSession, object]:
    session = GameSession("vertical-flow")
    human = session.state.add_player("human", PlayerRole.HUMAN)
    session.setup_game(["열쇠"])
    session.vertical_progression_enabled = True
    return session, human


def place_at_current_mission(session: GameSession, actor) -> None:
    x, y, z = mission_interaction_position(session.vertical_round.phase)
    actor.position.x, actor.position.y, actor.position.z = x, y, z
    actor.position.floor = session.vertical_round.policy.active_floor


def test_disabled_compatibility_game_cannot_advance_vertical_stage() -> None:
    session = GameSession("disabled-vertical-flow")
    session.vertical_progression_enabled = False
    session.state.add_player("human", PlayerRole.HUMAN)
    session.setup_game(["열쇠"])

    with pytest.raises(InvalidProgression, match="아직 활성화"):
        complete_current_stage(session, "human")


def test_rooftop_mission_advances_only_when_actor_is_near_device() -> None:
    session, human = active_session()
    human.position.floor = WorldFloor.ROOF

    with pytest.raises(InvalidProgression, match="거리가 너무 멀다"):
        complete_current_stage(session, "human")

    place_at_current_mission(session, human)
    result = complete_current_stage(session, "human")

    assert result["completed_phase"] == "rooftop_intro"
    assert result["next_phase"] == "floor_3"
    assert result["progression"]["accessible_floors"] == ["ROOF", "F3"]


def test_actor_on_wrong_floor_cannot_complete_current_mission() -> None:
    session, human = active_session()
    x, y, z = mission_interaction_position(VerticalRoundPhase.ROOFTOP_INTRO)
    human.position.x, human.position.y, human.position.z = x, y, z
    human.position.floor = WorldFloor.F3

    with pytest.raises(InvalidProgression, match="현재 활성 층"):
        complete_current_stage(session, "human")


def test_each_floor_uses_its_own_semantic_mission_position() -> None:
    session, human = active_session()

    expected = [
        VerticalRoundPhase.FLOOR_3,
        VerticalRoundPhase.FLOOR_2,
        VerticalRoundPhase.FLOOR_1,
        VerticalRoundPhase.FIELD_FINAL,
    ]
    for next_phase in expected:
        place_at_current_mission(session, human)
        result = complete_current_stage(session, "human")
        assert result["next_phase"] == next_phase.value


def test_frozen_actor_cannot_complete_stage() -> None:
    session, human = active_session()
    place_at_current_mission(session, human)
    human.freeze()

    with pytest.raises(InvalidProgression, match="살아 있는 도망자"):
        complete_current_stage(session, "human")


def test_open_transition_moves_actor_from_rooftop_to_active_third_floor() -> None:
    session, human = active_session()
    place_at_current_mission(session, human)
    complete_current_stage(session, "human")
    human.position.x, human.position.y, human.position.z = -54.05, 10.8, -54.2
    human.position.floor = WorldFloor.ROOF

    event = use_open_floor_transition(session, "human", "west")

    assert event["position"]["floor"] == "F3"
    assert human.position.floor == WorldFloor.F3
    assert human.position.y == pytest.approx(7.2)


def test_transition_rejects_wrong_floor_and_remote_use() -> None:
    session, human = active_session()
    place_at_current_mission(session, human)
    complete_current_stage(session, "human")

    human.position.floor = WorldFloor.F3
    with pytest.raises(InvalidProgression, match="출발 층"):
        use_open_floor_transition(session, "human", "west")

    human.position.floor = WorldFloor.ROOF
    with pytest.raises(InvalidProgression, match="거리가 너무 멀다"):
        use_open_floor_transition(session, "human", "west")


def test_east_and_west_routes_open_after_third_floor_completion() -> None:
    session, human = active_session()
    place_at_current_mission(session, human)
    complete_current_stage(session, "human")
    human.position.x, human.position.y, human.position.z = -54.05, 10.8, -54.2
    human.position.floor = WorldFloor.ROOF
    use_open_floor_transition(session, "human", "west")
    place_at_current_mission(session, human)
    complete_current_stage(session, "human")

    human.position.x, human.position.y, human.position.z = 6.05, 7.2, -54.2
    human.position.floor = WorldFloor.F3
    event = use_open_floor_transition(session, "human", "east")

    assert event["position"]["floor"] == "F2"
    assert event["position"]["zone"] == "f2_core_ne"


def test_first_floor_completion_opens_field_transition() -> None:
    session, human = active_session()
    for _ in range(4):
        place_at_current_mission(session, human)
        result = complete_current_stage(session, "human")
    assert result["next_phase"] == "field_final"
    assert session.vertical_round.final_route.value == "field"
    human.position.x, human.position.y, human.position.z = 2.35, 0, -1.8
    human.position.floor = WorldFloor.F1
    event = use_open_floor_transition(session, "human", "field")
    assert event["position"]["floor"] == "FIELD"


def test_field_final_requires_every_alive_runner_at_their_station() -> None:
    session, human = active_session()
    session.vertical_round.phase = VerticalRoundPhase.FIELD_FINAL
    actors = [human, session.state.get_player("partner"), session.state.get_player("partner-2")]
    for actor in actors:
        x, y, z = final_station_position(actor.player_id)
        actor.position.x, actor.position.y, actor.position.z = x, y, z
        actor.position.floor = WorldFloor.FIELD

    first = activate_final_station(session, human.player_id)
    second = activate_final_station(session, "partner")
    final = activate_final_station(session, "partner-2")

    assert not first["all_ready"]
    assert not second["all_ready"]
    assert final == {
        "actor_id": "partner-2", "ready_count": 3,
        "required_count": 3, "all_ready": True,
    }


def test_elevator_only_serves_accessible_floors_from_inside_car() -> None:
    session, human = active_session()
    session.vertical_round.phase = VerticalRoundPhase.FLOOR_2
    human.position.x, human.position.z = 2.35, -56.0
    human.position.floor = WorldFloor.F3

    event = use_elevator(session, human.player_id, "evp", "F2")
    assert event["position"]["floor"] == "F2"
    assert human.position.y == pytest.approx(3.6)

    with pytest.raises(InvalidProgression, match="열리지 않은"):
        use_elevator(session, human.player_id, "evp", "F1")
