"""최신 수직 맵 의미 슬롯의 진행·도달성 회귀 테스트.

절차형 맵은 더 이상 ``SchoolCampus.tsx`` 안에 BOX 리터럴을 두지 않는다.
따라서 렌더 구현 문자열이 아니라 서버·클라이언트가 공유하는 의미 슬롯 계약을 검증한다.
"""

from __future__ import annotations

import math

import pytest

from app.game.map_slots import actor_spawn_slots, get_map_slot
from app.game.progression import VerticalRoundPhase
from app.game.vertical_flow import (
    FINAL_STATION_SLOT_BY_ACTOR,
    MISSION_SLOT_BY_PHASE,
    TRANSITION_SLOTS_BY_PHASE,
)


def _position(slot_id: str) -> tuple[float, float, float]:
    slot = get_map_slot(slot_id)
    values = slot.get("position") or slot.get("interactionPosition")
    assert values and len(values) == 3
    position = tuple(float(value) for value in values)
    assert all(math.isfinite(value) for value in position)
    return position


def test_all_required_actor_spawns_are_distinct_and_finite() -> None:
    spawns = actor_spawn_slots()
    assert set(spawns) == {"human", "partner", "partner-2", "seeker", "seeker-2"}
    positions = [tuple(slot["position"]) for slot in spawns.values()]
    assert len(set(positions)) == len(positions)
    assert all(all(math.isfinite(float(value)) for value in position) for position in positions)


@pytest.mark.parametrize(
    "phase",
    [
        VerticalRoundPhase.ROOFTOP_INTRO,
        VerticalRoundPhase.FLOOR_3,
        VerticalRoundPhase.FLOOR_2,
        VerticalRoundPhase.FLOOR_1,
        VerticalRoundPhase.FIELD_FINAL,
    ],
)
def test_each_playable_phase_has_a_mission_on_its_active_floor(phase: VerticalRoundPhase) -> None:
    slot_id = MISSION_SLOT_BY_PHASE[phase]
    slot = get_map_slot(slot_id)
    _position(slot_id)
    expected_floor = {
        VerticalRoundPhase.ROOFTOP_INTRO: "ROOF",
        VerticalRoundPhase.FLOOR_3: "F3",
        VerticalRoundPhase.FLOOR_2: "F2",
        VerticalRoundPhase.FLOOR_1: "F1",
        VerticalRoundPhase.FIELD_FINAL: "FIELD",
    }[phase]
    assert slot["floor"] == expected_floor


@pytest.mark.parametrize(
    ("phase", "route"),
    [
        (VerticalRoundPhase.FLOOR_3, "west"),
        (VerticalRoundPhase.FLOOR_2, "west"),
        (VerticalRoundPhase.FLOOR_2, "east"),
        (VerticalRoundPhase.FLOOR_1, "west"),
        (VerticalRoundPhase.FLOOR_1, "east"),
        (VerticalRoundPhase.FIELD_FINAL, "field"),
    ],
)
def test_each_progression_route_connects_two_distinct_floors(
    phase: VerticalRoundPhase, route: str,
) -> None:
    source_id, destination_id = TRANSITION_SLOTS_BY_PHASE[phase][route]
    source, destination = get_map_slot(source_id), get_map_slot(destination_id)
    _position(source_id)
    _position(destination_id)
    assert source["floor"] != destination["floor"]


def test_field_final_stations_are_separated_for_three_runner_cooperation() -> None:
    slot_ids = [
        FINAL_STATION_SLOT_BY_ACTOR["partner"],
        "FIELD_FINAL_STATION_B",
        FINAL_STATION_SLOT_BY_ACTOR["partner-2"],
    ]
    positions = [_position(slot_id) for slot_id in slot_ids]
    assert all(get_map_slot(slot_id)["floor"] == "FIELD" for slot_id in slot_ids)
    assert min(
        math.hypot(left[0] - right[0], left[2] - right[2])
        for index, left in enumerate(positions)
        for right in positions[index + 1:]
    ) >= 10.0
