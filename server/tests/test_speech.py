from app.ai.speech import avoid_forbidden_words


def test_ai_avoidance_does_not_reveal_first_letter_length_or_synonym() -> None:
    text, avoided = avoid_forbidden_words("빨간 열쇠를 가져갈게", ["열쇠"])

    assert avoided
    assert text == "빨간 잠깐, 표현을 바꿀게. 그 물체를 가져갈게"
    assert "열쇠" not in text
    assert "열..." not in text
    assert "금속" not in text
