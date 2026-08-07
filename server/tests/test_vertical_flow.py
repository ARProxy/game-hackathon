"""층별 미션 상호작용 서버 권위 테스트."""

import pytest

from app.game.progression import InvalidProgression, VerticalRoundPhase, WorldFloor
from app.game.session import GameSession
from app.game.state import PlayerRole
from app.game.vertical_flow import complete_current_stage, mission_interaction_position


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
        VerticalRoundPhase.FINAL_ROUTE_REVEAL,
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
