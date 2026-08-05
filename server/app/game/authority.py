"""서버 권위 이동 속도와 플레이 구역 주요 벽의 2D 시야 계약."""

from __future__ import annotations

import math
import time
from dataclasses import dataclass


HUMAN_MAX_SPEED = 7.0
ACTOR_MAX_SPEED = 7.0
POSITION_JITTER_ALLOWANCE = 0.65

# SchoolCampus BOXES 중 F1에서 사람 키를 막는 구조 벽. (cx, cz, sx, sz)
INTERIOR_WALL_RECTS: tuple[tuple[float, float, float, float], ...] = (
    (-13, -35.7, 42, 0.4),
    (-30.45, -25.4, 7.1, 0.4), (-22.3, -25.4, 1.4, 0.4),
    (-15.95, -25.4, 8.9, 0.4), (0, -25.4, 16, 0.4),
    (-34, -30.55, 0.4, 10.3), (8, -33.35, 0.4, 4.7),
    (8, -26.7, 0.4, 2.6), (-34, -16.7, 0.4, 17.4),
    (-23, -22.7, 0.4, 5.4), (-23, -15.5, 0.4, 5),
    (-23, -9, 0.4, 2), (-30, -8, 8, 0.4),
    (-23.5, -8, 1, 0.4),
    (-33.3, -29, 1.4, 0.3), (-30.5, -29, 1.8, 0.3),
    (-27, -29, 2.8, 0.3), (-23.5, -29, 1.8, 0.3),
    (-19.55, -29, 3.7, 0.3), (-13.45, -29, 3.7, 0.3),
    (-6, -29, 2.8, 0.3), (-2.25, -29, 2.3, 0.3),
    (1.7, -29, 3.2, 0.3), (6.85, -29, 2.3, 0.3),
    (-27, -32.35, 0.3, 6.7), (-20, -32.35, 0.3, 6.7),
    (-13, -32.35, 0.3, 6.7), (-6, -32.35, 0.3, 6.7),
    (-2, -32.35, 0.3, 6.7), (1, -32.35, 0.3, 6.7),
    (-26.9, -24.45, 0.3, 1.9), (-26.9, -19.9, 0.3, 4.8),
    (-26.9, -14, 0.3, 4.6), (-26.9, -8.65, 0.3, 1.3),
    (-30.45, -19, 7.1, 0.3), (-30.45, -14.5, 7.1, 0.3),
    (-19, -10.5, 0.3, 5), (-21, -13, 4, 0.3),
    (-21, -22.4, 3, 0.3), (-22.5, -23.8, 0.3, 2.8),
    (-19.5, -23.8, 0.3, 2.8),
)

# 운동장·골목의 사람 키 이상 벽과 대형 장애물. 낮은 벤치·화분은
# 구조/포획 시야를 막지 않으며, 실제 통로를 나누는 구조만 포함한다.
OUTDOOR_WALL_RECTS: tuple[tuple[float, float, float, float], ...] = (
    (-16, -6, 6, 3.6),
    (8, 17, 26, 2.1),
    (-14, 22, 12, 0.4), (3.5, 22, 17, 0.4), (26.5, 22, 23, 0.4),
    (-14, 29, 0.35, 10), (-11, 28, 6, 0.35), (-4, 28, 4, 0.35),
    (-2, 28, 0.35, 4), (-2, 34, 0.35, 4), (-5, 32, 14, 0.35),
    (6, 32, 4, 0.35), (8, 28, 0.35, 8),
    (10.5, 26, 5, 0.35), (17.5, 26, 5, 0.35),
    (20, 28.5, 0.35, 5), (20, 34.5, 0.35, 3),
    (-8, 36, 8, 0.35), (-12, 34, 0.35, 4),
    (26, 27, 2.2, 4.4), (30, 27, 2.2, 4.4), (34, 27, 2.2, 4.4),
    (30, 33, 5, 3.4),
    (0, -40, 80.6, 0.6), (-24.65, 40, 31.3, 0.6),
    (17.65, 40, 45.3, 0.6), (-40, 0, 0.6, 80.6),
    (40, -32.4, 0.6, 15.8), (40, 2.5, 0.6, 46),
    (40, 34.9, 0.6, 10.8),
)

WALL_RECTS = INTERIOR_WALL_RECTS + OUTDOOR_WALL_RECTS


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
    start: tuple[float, float], end: tuple[float, float]
) -> bool:
    return not any(segment_intersects_rect(start, end, wall) for wall in WALL_RECTS)
