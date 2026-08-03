"""금기어 판정 엔진

3단계 파이프라인으로 판정한다:
1. 정규식 직접 매칭 (~0ms)
2. 형태소 분석 후 어근 매칭 (~20ms)
3. 유사 발음 매칭 - 자모 분리 + 편집거리 (~10ms)

LLM을 사용하지 않는다. 전체 판정은 50ms 이내를 목표로 한다.
"""

from __future__ import annotations

import re
import time
import logging
from dataclasses import dataclass

from jamo import h2j, j2hcj
from Levenshtein import ratio as levenshtein_ratio
from kiwipiepy import Kiwi

logger = logging.getLogger(__name__)

_kiwi = Kiwi()


@dataclass
class JudgeResult:
    is_forbidden: bool
    matched_word: str | None = None
    matched_stage: str | None = None  # "exact" | "morph" | "phonetic"
    confidence: float = 0.0
    elapsed_ms: float = 0.0
    transcript: str = ""


class ForbiddenWordEngine:
    def __init__(
        self,
        forbidden_words: list[str],
        phonetic_threshold: float = 0.75,
    ) -> None:
        self.forbidden_words = [w.strip() for w in forbidden_words if w.strip()]
        self.phonetic_threshold = phonetic_threshold

        # 정규식 패턴 사전 컴파일 (조사 결합 대응)
        self._patterns = {
            word: re.compile(rf"{re.escape(word)}(?:[은는이가을를의와과에서로도만까지])?")
            for word in self.forbidden_words
        }

    def check(self, transcript: str) -> JudgeResult:
        start = time.perf_counter()
        transcript = transcript.strip()

        if not transcript or not self.forbidden_words:
            return self._result(False, start, transcript)

        # 1단계: 정규식 직접 매칭
        for word, pattern in self._patterns.items():
            if pattern.search(transcript):
                return self._result(
                    True, start, transcript, word, "exact", 1.0
                )

        # 2단계: 형태소 분석 후 어근 매칭
        morph_match = self._morph_check(transcript)
        if morph_match:
            return self._result(
                True, start, transcript, morph_match, "morph", 0.95
            )

        # 3단계: 유사 발음 매칭
        phonetic_match, score = self._phonetic_check(transcript)
        if phonetic_match:
            return self._result(
                True, start, transcript, phonetic_match, "phonetic", score
            )

        return self._result(False, start, transcript)

    def _morph_check(self, transcript: str) -> str | None:
        """kiwipiepy로 형태소 분석 후 어근에서 금기어 매칭."""
        tokens = _kiwi.tokenize(transcript)
        # 명사(NNG, NNP), 어근(XR) 태그의 형태소만 추출
        morphs = [
            token.form
            for token in tokens
            if token.tag in ("NNG", "NNP", "XR")
        ]
        for word in self.forbidden_words:
            if word in morphs:
                return word
        return None

    def _phonetic_check(self, transcript: str) -> tuple[str | None, float]:
        """자모 분리 후 편집거리로 유사 발음 매칭."""
        transcript_jamo = self._to_jamo(transcript)
        # 전사 텍스트의 각 어절과 금기어를 비교
        chunks = transcript.split()

        best_word = None
        best_score = 0.0

        for word in self.forbidden_words:
            word_jamo = self._to_jamo(word)
            for chunk in chunks:
                chunk_jamo = self._to_jamo(chunk)
                # 조사 제거된 앞부분과도 비교
                score = levenshtein_ratio(word_jamo, chunk_jamo)
                if score > best_score:
                    best_score = score
                    best_word = word

        if best_score >= self.phonetic_threshold:
            return best_word, best_score
        return None, 0.0

    @staticmethod
    def _to_jamo(text: str) -> str:
        """한글을 자모 시퀀스로 분리. 비한글 문자는 그대로 유지."""
        try:
            return j2hcj(h2j(text))
        except Exception:
            return text

    @staticmethod
    def _result(
        is_forbidden: bool,
        start: float,
        transcript: str,
        matched_word: str | None = None,
        matched_stage: str | None = None,
        confidence: float = 0.0,
    ) -> JudgeResult:
        elapsed = (time.perf_counter() - start) * 1000
        result = JudgeResult(
            is_forbidden=is_forbidden,
            matched_word=matched_word,
            matched_stage=matched_stage,
            confidence=confidence,
            elapsed_ms=round(elapsed, 2),
            transcript=transcript,
        )
        if is_forbidden:
            logger.warning(
                "FREEZE: word=%s stage=%s conf=%.2f elapsed=%.1fms transcript='%s'",
                matched_word, matched_stage, confidence, elapsed, transcript,
            )
        return result

    def update_words(self, new_words: list[str]) -> None:
        """금기어 목록을 교체한다 (라운드 시작 시)."""
        self.forbidden_words = [w.strip() for w in new_words if w.strip()]
        self._patterns = {
            word: re.compile(rf"{re.escape(word)}(?:[은는이가을를의와과에서로도만까지])?")
            for word in self.forbidden_words
        }
