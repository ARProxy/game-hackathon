"""서버 이동 속도와 벽 시야 계약 단위 테스트."""

from app.game.authority import (
    MovementSample,
    WALL_RECTS_BY_FLOOR,
    has_clear_catch_line,
    movement_is_plausible,
)


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
