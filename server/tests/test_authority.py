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


def test_outdoor_wall_blocks_short_rescue_or_catch_line() -> None:
    # 운동장 북쪽 구역 경계벽 z=22도 2m 이내 상호작용을 차단한다.
    assert not has_clear_catch_line((-14.0, 21.5), (-14.0, 22.5))


def test_low_outdoor_props_do_not_block_open_line() -> None:
    # 낮은 벤치와 화분은 시야 계약에 넣지 않아 열린 구조선으로 취급한다.
    assert has_clear_catch_line((-17.0, 29.5), (-17.0, 30.5))
