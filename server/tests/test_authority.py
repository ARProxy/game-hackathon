"""서버 이동 속도와 벽 시야 계약 단위 테스트."""

from app.game.authority import (
    MovementSample,
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
    # 본관 복도 남벽 z=-25.4, x=0 양쪽은 포획 반경 안이어도 차단된다.
    assert not has_clear_catch_line((0.0, -25.9), (0.0, -24.9))
    assert has_clear_catch_line((12.0, 0.0), (12.8, 0.0))

