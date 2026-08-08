"""서버 권위 이동 속도와 플레이 구역 주요 벽의 2D 시야 계약."""

from __future__ import annotations

import math
import json
import time
from dataclasses import dataclass
from pathlib import Path


HUMAN_MAX_SPEED = 7.0
ACTOR_MAX_SPEED = 7.0
POSITION_JITTER_ALLOWANCE = 0.65

COLLISION_CONTRACT_PATH = (
    Path(__file__).parents[3] / "client/src/game/serverCollisionContract.json"
)
with COLLISION_CONTRACT_PATH.open(encoding="utf-8") as collision_file:
    COLLISION_CONTRACT = json.load(collision_file)


def _wall_aabb(wall: dict) -> tuple[float, float, float, float]:
    """회전된 박스도 서버 2D 판정에서 빠지지 않도록 보수적 AABB로 변환한다."""
    x, z = wall["center"]
    sx, sz = wall["size"]
    angle = float(wall.get("rotationY", 0))
    return (
        float(x), float(z),
        abs(math.cos(angle)) * float(sx) + abs(math.sin(angle)) * float(sz),
        abs(math.sin(angle)) * float(sx) + abs(math.cos(angle)) * float(sz),
    )


WALL_RECTS_BY_FLOOR: dict[str, tuple[tuple[float, float, float, float], ...]] = {
    floor: tuple(_wall_aabb(wall) for wall in COLLISION_CONTRACT["walls"] if wall["floor"] == floor)
    for floor in {wall["floor"] for wall in COLLISION_CONTRACT["walls"]}
}
# 기존 순수 함수·테스트 호환용 F1 벽 집합.
WALL_RECTS = WALL_RECTS_BY_FLOOR.get("F1", ())
NAVIGATION_NODES_BY_FLOOR: dict[str, tuple[dict, ...]] = {
    floor: tuple(
        node for node in COLLISION_CONTRACT.get("navigationNodes", ())
        if node["floor"] == floor
    )
    for floor in {
        node["floor"] for node in COLLISION_CONTRACT.get("navigationNodes", ())
    }
}


def next_navigation_waypoint(
    start: tuple[float, float],
    end: tuple[float, float],
    floor: str,
) -> tuple[float, float]:
    """공유 맵 그래프에서 목표로 가는 다음 가시 waypoint를 반환한다.

    시작·목표가 직접 보이면 그래프를 사용하지 않는다. 방 안 목표처럼 목표가
    벽 AABB와 맞닿아 가시 노드가 없을 때는 가장 가까운 노드를 종점으로 삼고,
    마지막 접근은 기존 벽 회피 이동에 맡긴다.
    """
    if math.dist(start, end) <= 6.0 and has_clear_catch_line(start, end, floor):
        return end
    nodes = NAVIGATION_NODES_BY_FLOOR.get(floor, ())
    if not nodes:
        return end
    by_id = {node["id"]: node for node in nodes}

    def node_position(node: dict) -> tuple[float, float]:
        return float(node["position"][0]), float(node["position"][1])

    start_nodes = [
        node for node in nodes
        if not str(node["id"]).endswith("_nav_room")
        or math.dist(start, node_position(node)) <= 3.0
        if has_clear_catch_line(start, node_position(node), floor)
    ]
    goal_nodes = [
        node for node in nodes
        if has_clear_catch_line(node_position(node), end, floor)
    ]
    if not start_nodes:
        start_nodes = sorted(nodes, key=lambda node: math.dist(start, node_position(node)))[:1]
    if not goal_nodes:
        goal_nodes = sorted(nodes, key=lambda node: math.dist(end, node_position(node)))[:1]

    distances = {node_id: math.inf for node_id in by_id}
    previous: dict[str, str | None] = {node_id: None for node_id in by_id}
    pending: set[str] = set(by_id)
    for node in start_nodes:
        node_id = str(node["id"])
        distances[node_id] = math.dist(start, node_position(node))

    while pending:
        current_id = min(pending, key=lambda node_id: distances[node_id])
        if not math.isfinite(distances[current_id]):
            break
        pending.remove(current_id)
        current = by_id[current_id]
        current_position = node_position(current)
        for neighbor_id in current.get("links", ()):
            if neighbor_id not in pending or neighbor_id not in by_id:
                continue
            neighbor_position = node_position(by_id[neighbor_id])
            candidate = distances[current_id] + math.dist(current_position, neighbor_position)
            if candidate < distances[neighbor_id]:
                distances[neighbor_id] = candidate
                previous[neighbor_id] = current_id

    reachable_goals = [node for node in goal_nodes if math.isfinite(distances[str(node["id"])])]
    if not reachable_goals:
        return end
    goal = min(
        reachable_goals,
        key=lambda node: distances[str(node["id"])] + math.dist(node_position(node), end),
    )
    path_ids = [str(goal["id"])]
    while previous[path_ids[-1]] is not None:
        parent_id = previous[path_ids[-1]]
        if parent_id is None:
            break
        path_ids.append(parent_id)
    path_ids.reverse()
    waypoint_reached_radius = 1.25
    for waypoint_id in path_ids:
        waypoint = node_position(by_id[waypoint_id])
        if math.dist(start, waypoint) > waypoint_reached_radius:
            return waypoint
    return end


@dataclass(frozen=True)
class MovementSample:
    x: float
    z: float
    timestamp: float


def movement_is_plausible(
    previous: MovementSample,
    x: float,
    z: float,
    max_speed: float,
    now: float | None = None,
) -> bool:
    checked_at = time.monotonic() if now is None else now
    elapsed = max(0.0, checked_at - previous.timestamp)
    allowed = POSITION_JITTER_ALLOWANCE + max_speed * elapsed
    return math.hypot(x - previous.x, z - previous.z) <= allowed


def segment_intersects_rect(
    start: tuple[float, float],
    end: tuple[float, float],
    rect: tuple[float, float, float, float],
) -> bool:
    """Liang–Barsky 방식으로 선분과 axis-aligned 벽 사각형을 검사한다."""
    cx, cz, sx, sz = rect
    min_x, max_x = cx - sx / 2, cx + sx / 2
    min_z, max_z = cz - sz / 2, cz + sz / 2
    dx, dz = end[0] - start[0], end[1] - start[1]
    t_min, t_max = 0.0, 1.0
    for origin, delta, lower, upper in (
        (start[0], dx, min_x, max_x),
        (start[1], dz, min_z, max_z),
    ):
        if abs(delta) < 1e-9:
            if origin < lower or origin > upper:
                return False
            continue
        near = (lower - origin) / delta
        far = (upper - origin) / delta
        if near > far:
            near, far = far, near
        t_min = max(t_min, near)
        t_max = min(t_max, far)
        if t_min > t_max:
            return False
    return True


def has_clear_catch_line(
    start: tuple[float, float], end: tuple[float, float], floor: str = "F1",
) -> bool:
    walls = WALL_RECTS_BY_FLOOR.get(floor, ())
    return not any(segment_intersects_rect(start, end, wall) for wall in walls)
