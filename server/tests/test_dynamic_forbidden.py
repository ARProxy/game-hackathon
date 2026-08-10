from unittest.mock import patch

from app.ai.dynamic_forbidden import (
    DynamicForbiddenProfile,
    analyze_dynamic_forbidden_words,
    extract_observed_candidates,
)


def test_first_profile_waits_for_three_utterances() -> None:
    profile = DynamicForbiddenProfile()
    profile.record_human_utterance("방송실 문을 찾아보자")
    profile.record_human_utterance("복도 끝 장치를 확인해")
    assert not profile.should_refresh(now=10.0)
    profile.record_human_utterance("문 근처 장치를 다시 보자")
    assert profile.should_refresh(now=10.0)


def test_rotation_requires_both_five_utterances_and_45_seconds() -> None:
    profile = DynamicForbiddenProfile()
    profile.total_utterances = 3
    profile.apply(["마이크", "책상", "버튼"], analyzed_through=3, now=100.0, reason="initial")
    for _ in range(5):
        profile.record_human_utterance("복도 문 장치를 확인해")
    assert not profile.should_refresh(now=144.9)
    assert profile.should_refresh(now=145.0)


def test_periodic_analysis_retains_at_least_one_current_word() -> None:
    utterances = [
        "방송실 마이크를 확인해", "마이크 옆 책상을 봐", "책상 위 버튼을 눌러",
        "버튼 근처 마이크야", "방송실 책상으로 와",
    ]
    with patch("app.ai.dynamic_forbidden._ollama_json", return_value={"words": ["마이크", "책상", "버튼"]}):
        words, reason = analyze_dynamic_forbidden_words(utterances, ["복도", "문", "마이크"])
    assert "마이크" in words
    assert len(set(words) - {"복도", "문", "마이크"}) <= 2
    assert reason == "periodic_conversation_shift"


def test_model_cannot_invent_unobserved_word() -> None:
    with patch("app.ai.dynamic_forbidden._ollama_json", return_value={"words": ["비밀", "문", "복도"]}):
        words, _ = analyze_dynamic_forbidden_words(
            ["복도 문을 확인해", "문 옆 복도로 가", "복도 끝 문을 봐"],
            [],
    )
    assert "비밀" not in words
    assert set(words) <= {"복도", "확인"}


def test_public_state_never_contains_words() -> None:
    profile = DynamicForbiddenProfile()
    profile.apply(["마이크", "책상", "버튼"], analyzed_through=3, now=100.0, reason="initial")
    payload = profile.public_state(shifted=True)
    assert payload == {"status": "shifted"}
    assert "words" not in payload


def test_exact_answer_words_remain_protected_but_mission_nouns_can_be_risky() -> None:
    candidates = extract_observed_candidates([
        "빨간 삼각형 파란 네모를 보고 달빛 교정 탈출 순서로 외쳐",
        "주황 다이아몬드와 보라 십자를 다시 확인해",
        "직진 왼쪽 오른쪽으로 안내하고 배전반 밸브 발전기를 작동해",
        "은빛 금속 물건과 검은 원통 도구를 비교하고 출입구 쓰임을 교정해",
    ])
    words = {candidate["word"] for candidate in candidates}
    assert words.isdisjoint({
        "빨간", "삼각형", "파란", "네모", "달빛", "교정", "탈출",
        "주황", "다이아몬드", "보라", "십자",
        "직진", "왼쪽", "오른쪽", "배전반", "밸브", "발전기", "작동",
    })
    assert {"금속", "물건", "원통", "도구", "출입구", "쓰임"} <= words


def test_observed_mission_term_is_forced_into_profile() -> None:
    utterances = [
        "옥상 신호 순서를 확인해",
        "신호 다음 표시로 가자",
        "학교 아래 장치를 찾아보자",
    ]
    with patch("app.ai.dynamic_forbidden._ollama_json", return_value={"words": ["학교", "확인", "다음"]}):
        words, reason = analyze_dynamic_forbidden_words(
            utterances,
            [],
            ["옥상", "신호", "순서", "표시", "장치"],
        )
    assert words[0] == "신호"
    assert reason == "initial_mission_weighted_profile"
