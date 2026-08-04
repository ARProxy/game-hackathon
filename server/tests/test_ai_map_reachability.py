"""실제 클라이언트 맵 충돌체 기준 AI 주요 지점 도달성 회귀 테스트."""

from __future__ import annotations

from collections import deque
import math
from pathlib import Path
import re

import pytest

from app.game.session import GATE_POSITIONS


MAP_SOURCE = Path(__file__).parents[2] / "client/src/game/SchoolCampus.tsx"
GRID_STEP = 0.5
AI_RADIUS = 0.36
MAP_MIN = -40.0
MAP_MAX = 40.0
GROUND_PATROL = [
    (26.0, -27.0),
    (23.5, -19.0),
    (9.0, -1.5),
    (-20.5, -6.0),
    (-19.5, -3.5),
    (-10.5, -3.5),
    (-10.5, -22.5),
    (-9.8, -23.0),
    (-8.0, -27.2),
    (-25.1, -20.0),
    (-25.1, -11.0),
    (-25.1, -27.2),
    (-25.0, -27.0),
    (-2.5, -27.0),
    (-2.0, -27.2),
    (4.0, -27.2),
    (-8.5, -27.0),
    (-8.5, -24.5),
    (13.0, -24.5),
    (13.0, -17.5),
    (13.5, -17.5),
    (13.5, -17.0),
    (24.5, -17.0),
    (24.5, -19.0),
    (26.0, -20.0),
    (25.5, -20.0),
    (25.5, -19.5),
    (23.0, -19.5),
    (23.0, -18.5),
    (22.5, -18.5),
    (22.5, -17.0),
    (21.5, -17.0),
    (21.5, 19.5),
    (13.5, 19.5),
    (13.5, 22.0),
    (12.5, 22.0),
    (12.5, 23.0),
    (-1.0, 23.0),
    (-1.0, 30.5),
    (-2.5, 30.5),
    (-13.0, 30.5),
    (-13.0, 34.5),
    (-17.0, 34.5),
    (-17.0, 28.0),
    (-28.0, 8.0),
    (-17.0, 5.0),
    (24.5, 5.0),
    (24.5, -19.0),
    (26.0, -19.0),
    (26.0, -26.0),
]

BOX_PATTERN = re.compile(
    r"\{ f: '(?P<floor>[^']+)', p: \[(?P<x>-?[\d.]+), (?P<y>-?[\d.]+), (?P<z>-?[\d.]+)\], "
    r"s: \[(?P<sx>[\d.]+), (?P<sy>[\d.]+), (?P<sz>[\d.]+)\]"
    r"(?:, c: '[^']+')?(?:, rot: \[(?P<rx>-?[\d.]+), (?P<ry>-?[\d.]+), (?P<rz>-?[\d.]+)\])?"
)


def _ground_obstacles() -> list[tuple[float, float, float, float, float]]:
    source = MAP_SOURCE.read_text(encoding="utf-8")
    obstacles = []
    for match in BOX_PATTERN.finditer(source):
        values = match.groupdict()
        y = float(values["y"])
        sy = float(values["sy"])
        if values["floor"] not in {"OUT", "F1"} or not (y - sy / 2 <= 0.8 <= y + sy / 2):
            continue
        obstacles.append((
            float(values["x"]),
            float(values["z"]),
            float(values["sx"]),
            float(values["sz"]),
            float(values["ry"] or 0),
        ))
    assert len(obstacles) > 40, "맵 BOXES 파싱 범위가 예상보다 작습니다"
    return obstacles


def _blocked(x: float, z: float, obstacles: list[tuple[float, float, float, float, float]]) -> bool:
    for cx, cz, sx, sz, rotation in obstacles:
        dx, dz = x - cx, z - cz
        cos, sin = math.cos(rotation), math.sin(rotation)
        local_x = dx * cos - dz * sin
        local_z = dx * sin + dz * cos
        if abs(local_x) <= sx / 2 + AI_RADIUS and abs(local_z) <= sz / 2 + AI_RADIUS:
            return True
    return False


def _cell(point: tuple[float, float]) -> tuple[int, int]:
    return (round((point[0] - MAP_MIN) / GRID_STEP), round((point[1] - MAP_MIN) / GRID_STEP))


def _point(cell: tuple[int, int]) -> tuple[float, float]:
    return (MAP_MIN + cell[0] * GRID_STEP, MAP_MIN + cell[1] * GRID_STEP)


def _reachable(
    start: tuple[float, float],
    target: tuple[float, float],
    obstacles: list[tuple[float, float, float, float, float]],
    target_radius: float = 1.4,
) -> bool:
    start_cell = _cell(start)
    queue = deque([start_cell])
    visited = {start_cell}
    cell_limit = round((MAP_MAX - MAP_MIN) / GRID_STEP)
    while queue:
        current = queue.popleft()
        x, z = _point(current)
        if math.hypot(x - target[0], z - target[1]) <= target_radius:
            return True
        for next_cell in (
            (current[0] + 1, current[1]), (current[0] - 1, current[1]),
            (current[0], current[1] + 1), (current[0], current[1] - 1),
        ):
            if next_cell in visited or not (0 <= next_cell[0] <= cell_limit and 0 <= next_cell[1] <= cell_limit):
                continue
            nx, nz = _point(next_cell)
            if _blocked(nx, nz, obstacles):
                continue
            visited.add(next_cell)
            queue.append(next_cell)
    return False


def _locally_navigable(
    start: tuple[float, float],
    target: tuple[float, float],
    obstacles: list[tuple[float, float, float, float, float]],
    target_radius: float = 1.4,
) -> bool:
    """클라이언트 planAvoidedStep의 후보 순서를 재현해 실제 수렴을 확인한다."""
    x, z = start
    preferred_side = 1
    step = 0.25
    for _ in range(4000):
        dx, dz = target[0] - x, target[1] - z
        distance = math.hypot(dx, dz)
        if distance <= target_radius:
            return True
        forward_x, forward_z = dx / distance, dz / distance
        angles = (
            0,
            preferred_side * math.pi / 4,
            preferred_side * math.pi / 2,
            preferred_side * math.pi * 3 / 4,
            math.pi,
            -preferred_side * math.pi * 3 / 4,
            -preferred_side * math.pi / 2,
            -preferred_side * math.pi / 4,
        )
        moved = False
        for angle in angles:
            cos, sin = math.cos(angle), math.sin(angle)
            direction_x = forward_x * cos + forward_z * sin
            direction_z = -forward_x * sin + forward_z * cos
            next_x, next_z = x + direction_x * step, z + direction_z * step
            if not _blocked(next_x, next_z, obstacles):
                x, z = next_x, next_z
                moved = True
                break
        if not moved:
            preferred_side *= -1
    return False


@pytest.mark.parametrize("target", [
    (-8.1, -33.6),   # 과학실 미션 후보 1
    (-10.95, -31.0), # 과학실 미션 후보 2
    (-30.5, -33.7),  # 교실 미션 후보
    *[(gate["x"], gate["z"]) for gate in GATE_POSITIONS.values()],
])
def test_partner_spawn_can_reach_required_targets(target: tuple[float, float]) -> None:
    assert _reachable((-16.0, -2.0), target, _ground_obstacles())


@pytest.mark.parametrize("target", GROUND_PATROL[1:])
def test_seeker_spawn_can_reach_major_patrol_points(target: tuple[float, float]) -> None:
    assert _reachable((26.0, -27.0), target, _ground_obstacles())


@pytest.mark.parametrize(
    ("start", "target"),
    list(zip(GROUND_PATROL, GROUND_PATROL[1:] + GROUND_PATROL[:1])),
)
def test_seeker_local_avoidance_converges_on_major_patrol_points(
    start: tuple[float, float],
    target: tuple[float, float],
) -> None:
    assert _locally_navigable(start, target, _ground_obstacles())
