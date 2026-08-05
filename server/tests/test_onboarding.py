"""온보딩 금기어가 T1 협동 미션으로 완주 가능한지 검증한다."""

from app.ai.mission import generate_round, load_prop_dict
from app.ai.onboarding import FALLBACK_POOL, extract_forbidden_words, supported_prop_words
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
