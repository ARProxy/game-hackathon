"""최종 주문은 모든 조각과 표식 순서를 요구한다."""

from app.ai.spell import check_spell


def test_one_of_three_clues_is_not_enough():
    result = check_spell("파란", ["파란", "하늘", "별"])
    assert not result["success"]
    assert result["matched"] == ["파란"]


def test_two_of_three_clues_is_not_enough():
    result = check_spell("파란 하늘", ["파란", "하늘", "별"])
    assert not result["success"]
    assert result["matched"] == ["파란", "하늘"]


def test_all_clues_in_order_succeeds():
    result = check_spell("파란 하늘 별", ["파란", "하늘", "별"])
    assert result["success"]
    assert result["order_valid"]


def test_all_clues_in_wrong_order_fails():
    result = check_spell("별 파란 하늘", ["파란", "하늘", "별"])
    assert not result["success"]
    assert not result["order_valid"]


def test_reverse_order_without_spaces_still_fails():
    result = check_spell("별하늘파란", ["파란", "하늘", "별"])
    assert not result["success"]
    assert not result["order_valid"]


def test_single_clue_round_still_requires_one():
    assert check_spell("별", ["별"])["success"]


def test_empty_spell_never_succeeds():
    assert not check_spell("", ["파란", "하늘", "별"])["success"]
