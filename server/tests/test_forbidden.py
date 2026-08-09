"""금기어 판정 엔진 테스트

테스트 케이스 분류:
1. 정확한 매칭 (1단계 정규식)
2. 조사 결합 매칭 (1단계 정규식)
3. 형태소 분석 매칭 (2단계 kiwipiepy)
4. 유사 발음 매칭 (3단계 자모+편집거리)
5. 안전한 발화 (오탐 방지)
6. 성능 (50ms 이내)
"""

import pytest

from app.ai.forbidden import ForbiddenWordEngine, JudgeResult


@pytest.fixture
def engine():
    return ForbiddenWordEngine(["열쇠", "커피", "빨간"])


class TestExactMatch:
    """1단계: 금기어가 그대로 들어있는 경우"""

    def test_exact_word(self, engine):
        r = engine.check("열쇠 가져와")
        assert r.is_forbidden
        assert r.matched_word == "열쇠"
        assert r.matched_stage == "exact"

    def test_exact_in_middle(self, engine):
        r = engine.check("저기 커피 있어")
        assert r.is_forbidden
        assert r.matched_word == "커피"

    def test_exact_at_end(self, engine):
        r = engine.check("저거 빨간")
        assert r.is_forbidden
        assert r.matched_word == "빨간"


class TestParticleMatch:
    """1단계: 금기어 + 조사 결합"""

    def test_subject_particle(self, engine):
        r = engine.check("열쇠가 필요해")
        assert r.is_forbidden
        assert r.matched_word == "열쇠"
        assert r.matched_stage == "exact"

    def test_object_particle(self, engine):
        r = engine.check("커피를 마시자")
        assert r.is_forbidden
        assert r.matched_word == "커피"

    def test_topic_particle(self, engine):
        r = engine.check("빨간은 안돼")
        assert r.is_forbidden
        assert r.matched_word == "빨간"

    def test_possessive(self, engine):
        r = engine.check("열쇠의 위치")
        assert r.is_forbidden

    def test_direction(self, engine):
        r = engine.check("커피로 가자")
        assert r.is_forbidden


class TestMorphMatch:
    """2단계: 형태소 분석으로 어근 추출 후 매칭"""

    def test_complex_sentence(self, engine):
        r = engine.check("그 빨간색 물건 좀 봐봐")
        # "빨간"이 형태소로 분리되어야 함
        assert r.is_forbidden
        assert r.matched_word == "빨간"

    def test_embedded_in_phrase(self, engine):
        r = engine.check("뜨거운 커피잔이 있어")
        assert r.is_forbidden
        assert r.matched_word == "커피"


class TestPhoneticMatch:
    """3단계: STT 오인식 대응 — 유사 발음 매칭"""

    def test_similar_sound(self, engine):
        # "열세" → "열쇠"와 유사
        r = engine.check("열세 가져와")
        assert not r.is_forbidden
        assert r.requires_confirmation
        assert r.matched_word == "열쇠"
        assert r.matched_stage == "phonetic"

    def test_similar_sound_coffee(self, engine):
        # "커피"의 오인식 가능성
        r = engine.check("커히 마시자")
        assert not r.is_forbidden
        assert r.requires_confirmation
        assert r.matched_word == "커피"
        assert r.matched_stage == "phonetic"


class TestSafeSpeech:
    """오탐 방지 — 금기어가 아닌 정상 발화"""

    def test_safe_sentence(self, engine):
        r = engine.check("저쪽에 있는 반짝이는 거 확인해줘")
        assert not r.is_forbidden

    def test_safe_similar_but_different(self, engine):
        r = engine.check("여기 열심히 찾아보자")
        assert not r.is_forbidden

    def test_empty_string(self, engine):
        r = engine.check("")
        assert not r.is_forbidden

    def test_whitespace_only(self, engine):
        r = engine.check("   ")
        assert not r.is_forbidden

    def test_unrelated_words(self, engine):
        r = engine.check("놀이터 구석으로 가자")
        assert not r.is_forbidden


class TestPerformance:
    """성능: 판정 로직 50ms 이내"""

    def test_fast_judgment(self, engine):
        r = engine.check("열쇠를 찾아서 가져와")
        assert r.elapsed_ms < 50

    def test_safe_speech_also_fast(self, engine):
        r = engine.check("저쪽 반짝이는 물건 확인해줘")
        assert r.elapsed_ms < 50


class TestUpdateWords:
    """금기어 교체"""

    def test_update_clears_old(self, engine):
        engine.update_words(["시계", "파란"])
        r = engine.check("열쇠 가져와")
        assert not r.is_forbidden

    def test_update_applies_new(self, engine):
        engine.update_words(["시계", "파란"])
        r = engine.check("시계가 있어")
        assert r.is_forbidden
        assert r.matched_word == "시계"


class TestEdgeCases:
    """경계 케이스"""

    def test_no_forbidden_words(self):
        engine = ForbiddenWordEngine([])
        r = engine.check("아무 말이나 해도 돼")
        assert not r.is_forbidden

    def test_single_char_forbidden(self):
        engine = ForbiddenWordEngine(["문"])
        r = engine.check("문을 열어")
        assert r.is_forbidden

    def test_result_has_transcript(self, engine):
        r = engine.check("테스트 문장")
        assert r.transcript == "테스트 문장"
