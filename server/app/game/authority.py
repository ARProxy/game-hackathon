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
