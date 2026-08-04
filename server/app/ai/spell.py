"""최종 주문 판정

단서 단어들이 발화에 포함되어 있는지 퍼지 매칭으로 판정한다.
- 2/3 이상 포함 → 통과 (관대 판정)
- 자모 분리 + 편집거리로 유사 발음도 허용
"""

from __future__ import annotations

import logging
import math

from jamo import h2j, j2hcj
from Levenshtein import ratio as levenshtein_ratio

logger = logging.getLogger(__name__)

MATCH_THRESHOLD = 0.7  # 자모 유사도 기준


def check_spell(
    transcript: str,
    spell_words: list[str],
    required_ratio: float = 0.6,  # 전체 단서 중 몇 비율 이상 매칭돼야 통과
) -> dict:
    """주문 판정 결과를 반환한다."""
    if not transcript or not spell_words:
        return {"success": False, "matched": [], "missing": spell_words}

    transcript_lower = transcript.strip()
    matched: list[str] = []
    missing: list[str] = []

    for word in spell_words:
        if _is_match(transcript_lower, word):
            matched.append(word)
        else:
            missing.append(word)

    # 3개 단서의 60%는 1.8이므로 반드시 2개가 필요하다.
    # int() 내림을 사용하면 단서 하나만으로 성공하는 치명적인 허점이 생긴다.
    required_count = max(1, math.ceil(len(spell_words) * required_ratio))
    success = len(matched) >= required_count

    logger.info(
        "spell check: transcript='%s' words=%s matched=%s missing=%s success=%s",
        transcript, spell_words, matched, missing, success,
    )

    return {
        "success": success,
        "matched": matched,
        "missing": missing,
        "transcript": transcript,
    }


def _is_match(transcript: str, word: str) -> bool:
    """transcript에 word가 포함되어 있는지 퍼지 매칭."""
    # 1단계: 직접 포함
    if word in transcript:
        return True

    # 2단계: 어절별 자모 유사도
    chunks = transcript.split()
    word_jamo = _to_jamo(word)

    for chunk in chunks:
        chunk_jamo = _to_jamo(chunk)
        score = levenshtein_ratio(word_jamo, chunk_jamo)
        if score >= MATCH_THRESHOLD:
            return True

    return False


def _to_jamo(text: str) -> str:
    try:
        return j2hcj(h2j(text))
    except Exception:
        return text
