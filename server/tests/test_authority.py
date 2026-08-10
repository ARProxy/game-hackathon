"""서버 이동 속도와 벽 시야 계약 단위 테스트."""

import math

import pytest

from app.ai.hunter import _safe_hunter_step
from app.game.authority import (
    DYNAMIC_DOORS_BY_ID,
    MovementSample,
    NAVIGATION_NODES_BY_FLOOR,
    WALL_RECTS_BY_FLOOR,
    has_clear_catch_line,
    has_clear_hunter_line,
    movement_is_plausible,
)
from app.game.map_slots import get_map_slot


def test_normal_10hz_movement_has_jitter_headroom() -> None:
    previous = MovementSample(-9.8, -22.0, 10.0)
    assert movement_is_plausible(previous, -9.25, -22.0, 7.0, now=10.1)


def test_instant_teleport_is_rejected() -> None:
    previous = MovementSample(-9.8, -22.0, 10.0)
    assert not movement_is_plausible(previous, 20.0, 20.0, 7.0, now=10.01)


def test_wall_blocks_short_catch_line_but_open_space_does_not() -> None:
    wall = next(rect for rect in WALL_RECTS_BY_FLOOR["F1"] if min(rect[2], rect[3]) <= 0.5)
    x, z, sx, sz = wall
    if sx < sz:
        start, end = (x - sx, z), (x + sx, z)
    else:
        start, end = (x, z - sz), (x, z + sz)
    assert not has_clear_catch_line(start, end, "F1")


def test_outdoor_wall_blocks_short_rescue_or_catch_line() -> None:
    wall = next(rect for rect in WALL_RECTS_BY_FLOOR["OUT"] if min(rect[2], rect[3]) <= 0.5)
    x, z, sx, sz = wall
    start, end = ((x - sx, z), (x + sx, z)) if sx < sz else ((x, z - sz), (x, z + sz))
    assert not has_clear_catch_line(start, end, "OUT")


def test_low_outdoor_props_do_not_block_open_line() -> None:
    # 낮은 벤치와 화분은 시야 계약에 넣지 않아 열린 구조선으로 취급한다.
    assert has_clear_catch_line((-24.0, 8.0), (-24.0, 9.0), "OUT")


def test_closed_room_door_blocks_hunter_but_open_door_restores_line() -> None:
    door = DYNAMIC_DOORS_BY_ID["north_room_F1_1"]
    x, z = map(float, door["center"])
    start, end = (x, z - 0.6), (x, z + 0.6)
    assert has_clear_catch_line(start, end, "F1")
    assert not has_clear_hunter_line(start, end, "F1", {})
    assert has_clear_hunter_line(start, end, "F1", {door["id"]: True})


def test_navigation_graph_links_only_use_clear_authored_openings() -> None:
    for floor, nodes in NAVIGATION_NODES_BY_FLOOR.items():
        by_id = {node["id"]: node for node in nodes}
        for node in nodes:
            for neighbor_id in node["links"]:
                assert neighbor_id in by_id
                assert has_clear_catch_line(
                    tuple(node["position"]),
                    tuple(by_id[neighbor_id]["position"]),
                    floor,
                ), f"blocked navigation edge: {node['id']} -> {neighbor_id}"


def test_final_routes_have_authored_navigation_instead_of_legacy_fallbacks() -> None:
    assert len(NAVIGATION_NODES_BY_FLOOR["B1"]) >= 5
    assert len(NAVIGATION_NODES_BY_FLOOR["FIELD"]) >= 8
    assert WALL_RECTS_BY_FLOOR["B1"]
    assert WALL_RECTS_BY_FLOOR["FIELD"]


def test_permanently_locked_room_door_has_no_navigation_portal() -> None:
    node_ids = {
        node["id"]
        for nodes in NAVIGATION_NODES_BY_FLOOR.values()
        for node in nodes
    }
    assert "north_room_F1_3_nav_corridor" not in node_ids
    assert "south_room_F1_0_nav_corridor" not in node_ids


@pytest.mark.parametrize(
    ("floor", "slot_id"),
    [
        ("F2", "F2_INTERCOM_A"),
        ("F2", "F2_INTERCOM_B"),
        ("F1", "F1_DEVICE_A"),
        ("F1", "F1_DEVICE_B"),
    ],
)
def test_navigation_reaches_vertical_mission_devices_without_crossing_walls(
    floor: str,
    slot_id: str,
) -> None:
    start = (-36.0, -39.7)
    slot = get_map_slot(slot_id)
    target = (float(slot["position"][0]), float(slot["position"][2]))
    position = start

    for _ in range(120):
        if math.dist(position, target) <= 1.5:
            break
        next_position = _safe_hunter_step(*position, *target, 0.8, floor)
        assert has_clear_catch_line(position, next_position, floor)
        position = next_position

    assert math.dist(position, target) <= 1.5


@pytest.mark.parametrize(
    "slot_id",
    [
        "BASEMENT_DEVICE_VALVE",
        "BASEMENT_DEVICE_PANEL",
        "BASEMENT_DEVICE_GENERATOR",
        "BASEMENT_ESCAPE_GATE",
    ],
)
def test_basement_spine_reaches_every_device_and_escape_gate(slot_id: str) -> None:
    start_slot = get_map_slot("BASEMENT_FINAL_ENTRY")
    target_slot = get_map_slot(slot_id)
    position = (float(start_slot["position"][0]), float(start_slot["position"][2]))
    target_values = target_slot.get("interactionPosition") or target_slot["position"]
    target = (float(target_values[0]), float(target_values[2]))

    for _ in range(120):
        if math.dist(position, target) <= 1.5:
            break
        next_position = _safe_hunter_step(*position, *target, 0.8, "B1")
        assert has_clear_catch_line(position, next_position, "B1")
        assert next_position != position
        position = next_position

    assert math.dist(position, target) <= 1.5


@pytest.mark.parametrize(
    "slot_id",
    [
        "FIELD_FINAL_STATION_A",
        "FIELD_FINAL_STATION_B",
        "FIELD_FINAL_STATION_C",
        "FIELD_ESCAPE_GATE",
    ],
)
def test_field_ring_reaches_every_station_and_escape_gate(slot_id: str) -> None:
    start_slot = get_map_slot("FIELD_FINAL_ENTRY")
    target_slot = get_map_slot(slot_id)
    position = (float(start_slot["position"][0]), float(start_slot["position"][2]))
    target = (float(target_slot["position"][0]), float(target_slot["position"][2]))

    for _ in range(120):
        if math.dist(position, target) <= 1.5:
            break
        next_position = _safe_hunter_step(*position, *target, 0.8, "FIELD")
        assert has_clear_catch_line(position, next_position, "FIELD")
        assert next_position != position
        position = next_position

    assert math.dist(position, target) <= 1.5
