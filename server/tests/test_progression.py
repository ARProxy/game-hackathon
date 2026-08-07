"""기획 4 수직 진행 상태 계약 테스트."""

import pytest

from app.game.progression import (
    FinalRoute,
    InvalidProgression,
    SeekerThreat,
    VerticalRoundPhase,
    VerticalRoundState,
    WorldFloor,
)


def complete_and_advance(state: VerticalRoundState) -> VerticalRoundPhase:
    state.mark_mission_complete()
    return state.advance()


def test_round_starts_on_locked_rooftop_without_seeker() -> None:
    state = VerticalRoundState()

    assert state.phase == VerticalRoundPhase.ROOFTOP_INTRO
    assert state.policy.accessible_floors == (WorldFloor.ROOF,)
    assert state.policy.seeker_count == 0
    assert state.policy.seeker_threat == SeekerThreat.INACTIVE


def test_required_mission_blocks_floor_advance() -> None:
    state = VerticalRoundState()

    with pytest.raises(InvalidProgression, match="필수 미션"):
        state.advance()


def test_floor_progression_keeps_only_current_and_previous_floor_accessible() -> None:
    state = VerticalRoundState()

    assert complete_and_advance(state) == VerticalRoundPhase.FLOOR_3
    assert state.policy.accessible_floors == (WorldFloor.ROOF, WorldFloor.F3)

    assert complete_and_advance(state) == VerticalRoundPhase.FLOOR_2
    assert state.policy.accessible_floors == (WorldFloor.F3, WorldFloor.F2)

    assert complete_and_advance(state) == VerticalRoundPhase.FLOOR_1
    assert state.policy.accessible_floors == (WorldFloor.F2, WorldFloor.F1)
    assert state.policy.seeker_count == 2
    assert state.policy.seeker_threat == SeekerThreat.PINCER


@pytest.mark.parametrize(
    ("route", "expected_phase", "expected_floors"),
    [
        (FinalRoute.FIELD, VerticalRoundPhase.FIELD_FINAL, (WorldFloor.F1, WorldFloor.FIELD)),
        (FinalRoute.BASEMENT, VerticalRoundPhase.BASEMENT_FINAL, (WorldFloor.F1, WorldFloor.B1)),
    ],
)
def test_final_route_is_explicit_and_freezes_time_escalation(
    route: FinalRoute,
    expected_phase: VerticalRoundPhase,
    expected_floors: tuple[WorldFloor, ...],
) -> None:
    state = VerticalRoundState()
    for _ in range(4):
        complete_and_advance(state)

    assert state.phase == VerticalRoundPhase.FINAL_ROUTE_REVEAL
    assert state.advance(final_route=route) == expected_phase
    assert state.policy.accessible_floors == expected_floors
    assert state.policy.seeker_count == 2
    assert state.policy.seeker_threat == SeekerThreat.ENRAGED
    assert state.time_escalation_tier(3600) == 0


def test_final_route_reveal_requires_a_route() -> None:
    state = VerticalRoundState()
    for _ in range(4):
        complete_and_advance(state)

    with pytest.raises(InvalidProgression, match="파이널 경로"):
        state.advance()


def test_time_escalation_is_bounded_before_final() -> None:
    state = VerticalRoundState()

    assert state.time_escalation_tier(239) == 0
    assert state.time_escalation_tier(240) == 1
    assert state.time_escalation_tier(9600) == 3


def test_serialized_policy_contains_client_safe_values() -> None:
    state = VerticalRoundState()
    payload = state.to_dict()

    assert payload == {
        "phase": "rooftop_intro",
        "mission_complete": False,
        "final_route": None,
        "active_floor": "ROOF",
        "accessible_floors": ["ROOF"],
        "seeker_count": 0,
        "seeker_threat": "inactive",
        "time_escalation_enabled": True,
    }


def test_result_can_end_the_round_from_danger_state() -> None:
    state = VerticalRoundState(phase=VerticalRoundPhase.FLOOR_2)

    state.finish(VerticalRoundPhase.DEFEAT)

    assert state.phase == VerticalRoundPhase.DEFEAT
    assert state.policy.seeker_count == 0
    with pytest.raises(InvalidProgression, match="종료 상태"):
        state.advance()
