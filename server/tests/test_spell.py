"""최종 주문의 관대한 2/3 판정 테스트."""

from app.ai.spell import check_spell


def test_one_of_three_clues_is_not_enough():
    result = check_spell("파란", ["파란", "하늘", "별"])
    assert not result["success"]
    assert result["matched"] == ["파란"]


def test_two_of_three_clues_succeeds():
    result = check_spell("파란 하늘", ["파란", "하늘", "별"])
    assert result["success"]
    assert result["matched"] == ["파란", "하늘"]


def test_single_clue_round_still_requires_one():
    assert check_spell("별", ["별"])["success"]


def test_empty_spell_never_succeeds():
    assert not check_spell("", ["파란", "하늘", "별"])["success"]
