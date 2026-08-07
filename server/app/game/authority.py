"""서버 권위 이동 속도와 플레이 구역 주요 벽의 2D 시야 계약."""

from __future__ import annotations

import math
import time
from dataclasses import dataclass


HUMAN_MAX_SPEED = 7.0
ACTOR_MAX_SPEED = 7.0
POSITION_JITTER_ALLOWANCE = 0.65

# 벽 사각형 — 새 수직 맵의 LOS 데이터가 연결되기 전까지 빈 튜플.
# 빈 상태에서는 has_clear_catch_line()이 항상 True를 반환한다.
WALL_RECTS: tuple[tuple[float, float, float, float], ...] = ()


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
