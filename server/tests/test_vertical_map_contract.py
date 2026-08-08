"""기획 4 의미 슬롯과 최신 학교 맵 좌표 계약 테스트."""

import math

import pytest

from app.game.map_slots import VERTICAL_MAP_CONTRACT, actor_spawn_slots, get_map_slot


REQUIRED_SLOT_IDS = {
    "ROOF_RUNNER_SPAWN_A", "ROOF_RUNNER_SPAWN_B", "ROOF_RUNNER_SPAWN_C",
    "ROOF_INTRO_MISSION", "ROOF_TO_F3_FIRE_DOOR",
    "F3_MISSION_ROOM_POOL", "F3_SEEKER_REVEAL_ENTRY",
    "F3_TO_F2_STAIR_WEST", "F3_TO_F2_STAIR_EAST",
    "F2_MISSION_ROOM_POOL", "F2_INTERCOM_A", "F2_INTERCOM_B",
    "F2_TO_F1_STAIR_WEST", "F2_TO_F1_STAIR_EAST",
    "F1_STAIR_ARRIVAL_WEST", "F1_STAIR_ARRIVAL_EAST",
    "F1_MISSION_ROOM_POOL", "F1_SECURITY_ROOM", "F1_BLOCKER_SPAWN_ENTRY",
    "F1_TO_BASEMENT_FIRE_DOOR", "F1_TO_FIELD_FIRE_DOOR",
    "ELEVATOR_SHAFT_PASSENGER", "ELEVATOR_SHAFT_CARGO",
    "BASEMENT_FINAL_ENTRY", "BASEMENT_FINAL_DEVICE_POOL", "BASEMENT_ESCAPE_GATE",
    "BASEMENT_DEVICE_PANEL", "BASEMENT_DEVICE_VALVE", "BASEMENT_DEVICE_GENERATOR",
    "FIELD_FINAL_ENTRY", "FIELD_FINAL_STATION_A", "FIELD_FINAL_STATION_B",
    "FIELD_FINAL_STATION_C", "FIELD_ESCAPE_GATE",
}


def test_contract_is_seeded_and_active() -> None:
    assert VERTICAL_MAP_CONTRACT["source"] == "campusV4Data.js"
    assert VERTICAL_MAP_CONTRACT["sourceSeed"] == 0
    assert VERTICAL_MAP_CONTRACT["enabled"] is True


def test_all_design_v4_semantic_slots_exist() -> None:
    assert REQUIRED_SLOT_IDS <= set(VERTICAL_MAP_CONTRACT["slots"])


def test_position_slots_use_floor_height_and_finite_map_coordinates() -> None:
    floor_y = VERTICAL_MAP_CONTRACT["floorY"]
    for slot_id, slot in VERTICAL_MAP_CONTRACT["slots"].items():
        position = slot.get("position")
        if position is None:
            continue
        assert len(position) == 3, slot_id
        assert all(math.isfinite(value) for value in position), slot_id
        assert abs(position[0]) <= 60 and abs(position[2]) <= 60, slot_id
        base_y = floor_y[slot["floor"]]
        if slot["kind"] == "device":
            assert base_y < position[1] <= base_y + 3.2, slot_id
        else:
            assert position[1] == pytest.approx(base_y), slot_id


def test_rooftop_spawns_are_separate_and_keep_actor_feet_on_roof() -> None:
    spawns = [get_map_slot(f"ROOF_RUNNER_SPAWN_{suffix}") for suffix in "ABC"]
    positions = [tuple(slot["position"]) for slot in spawns]

    assert len(set(positions)) == 3
    assert all(slot["floor"] == "ROOF" for slot in spawns)
    for index, first in enumerate(positions):
        for second in positions[index + 1:]:
            assert math.hypot(first[0] - second[0], first[2] - second[2]) >= 2.0


def test_actor_spawn_mapping_has_exact_solo_team() -> None:
    spawns = actor_spawn_slots()

    assert set(spawns) == {"human", "partner", "partner-2", "seeker", "seeker-2"}
    assert all(spawns[actor_id]["floor"] == "ROOF" for actor_id in ("human", "partner", "partner-2"))
    assert spawns["seeker"]["floor"] == "F3"
    assert spawns["seeker-2"]["floor"] == "F1"


@pytest.mark.parametrize("pool_id", [
    "F3_MISSION_ROOM_POOL", "F2_MISSION_ROOM_POOL", "F1_MISSION_ROOM_POOL",
    "BASEMENT_FINAL_DEVICE_POOL",
])
def test_mission_pools_have_distinct_rooms_and_matching_devices(pool_id: str) -> None:
    pool = get_map_slot(pool_id)
    assert len(pool["roomIds"]) >= 4
    assert len(pool["roomIds"]) == len(set(pool["roomIds"]))
    assert len(pool["deviceIds"]) == len(pool["roomIds"])


def test_passenger_elevator_reaches_roof_but_cargo_elevator_does_not() -> None:
    passenger = get_map_slot("ELEVATOR_SHAFT_PASSENGER")
    cargo = get_map_slot("ELEVATOR_SHAFT_CARGO")

    assert passenger["servedFloors"] == ["B1", "F1", "F2", "F3", "ROOF"]
    assert cargo["servedFloors"] == ["B1", "F1", "F2", "F3"]


def test_missing_slot_fails_loudly() -> None:
    with pytest.raises(KeyError, match="정의되지 않은 수직 맵 슬롯"):
        get_map_slot("UNKNOWN_SLOT")


def test_unmodelled_rooftop_door_is_not_disguised_as_an_authored_door() -> None:
    roof_lock = get_map_slot("ROOF_TO_F3_FIRE_DOOR")

    assert roof_lock["kind"] == "transition_lock"
    assert roof_lock["authoredDoorIds"] == []
    assert "전용 문 메시가 없어" in roof_lock["note"]
