"""온보딩 질문과 금기어가 다양하면서 T1 미션으로 완주 가능한지 검증한다."""

from unittest.mock import patch

from app.ai.mission import generate_round, load_prop_dict
from app.ai.onboarding import (
    FALLBACK_POOL,
    extract_forbidden_words,
    generate_forbidden_words,
    generate_onboarding_questions,
    supported_prop_words,
)
from app.ai.partner import match_partner_command


def test_supported_answer_words_are_kept_before_fallbacks() -> None:
    words = extract_forbidden_words([
        "주말에는 치킨을 먹고 책을 읽어요.",
        "책상에는 노트북과 지갑이 있어요.",
    ])

    assert words[:2] == ["책", "노트북"]
    assert len(words) == 3


def test_unsupported_answers_use_only_supported_fallbacks() -> None:
    words = extract_forbidden_words([
        "주말에 치킨과 피자를 먹고 축구를 해요.",
    ])

    assert words == FALLBACK_POOL[:3]
    assert set(words) <= supported_prop_words()


def test_every_selected_word_has_two_cue_partner_command() -> None:
    words = extract_forbidden_words([
        "치킨을 먹고 열쇠와 커피를 챙겨요.",
        "시계를 보며 산책해요.",
    ])
    prop_dict = load_prop_dict()
    round_data = generate_round(words)

    assert len(words) == 3
    assert len(round_data.missions) == 3
    assert sorted(mission.clue_order for mission in round_data.missions) == [1, 2, 3]
    assert round_data.spell_words == [
        mission.clue_word
        for mission in sorted(round_data.missions, key=lambda mission: mission.clue_order)
    ]
    for mission in round_data.missions:
        prop = prop_dict[mission.forbidden_word]
        descriptions = prop["descriptions"]
        utterance = f"{descriptions[0]} {descriptions[1]} 물건 확인해줘"
        assert match_partner_command(utterance, mission.real_prop).matched


def test_ai_questions_are_used_when_three_valid_questions_are_returned() -> None:
    generated = ["교실에서 어떤 물건을 찾고 싶나요?", "비 오는 날 무엇을 챙기나요?", "좋아하는 색은 무엇인가요?"]
    with patch("app.ai.onboarding._ollama_json", return_value={"questions": generated}):
        assert generate_onboarding_questions() == generated


def test_ai_forbidden_words_are_validated_against_supported_game_props() -> None:
    with patch(
        "app.ai.onboarding._ollama_json",
        return_value={"words": ["존재하지않음", "우산", "우산", "노트북", "파란"]},
    ):
        words = generate_forbidden_words(["비가 오면 노트북과 우산을 챙겨요"])
    assert words == ["우산", "노트북", "파란"]
    assert set(words) <= supported_prop_words()


def test_ai_failure_uses_three_unique_randomized_supported_words() -> None:
    with patch("app.ai.onboarding._ollama_json", return_value=None):
        words = generate_forbidden_words(["지원하지 않는 답변"])
    assert len(words) == 3
    assert len(set(words)) == 3
    assert set(words) <= supported_prop_words()
