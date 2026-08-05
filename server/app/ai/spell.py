"""최종 주문 판정

단서 단어들이 표식 순서대로 발화됐는지 퍼지 매칭으로 판정한다.
- 모든 조각 포함 + 올바른 순서 → 통과
- 자모 분리 + 편집거리로 개별 단서의 유사 발음은 허용
"""

from __future__ import annotations

import logging

from jamo import h2j, j2hcj
from Levenshtein import ratio as levenshtein_ratio

logger = logging.getLogger(__name__)

MATCH_THRESHOLD = 0.7  # 자모 유사도 기준


def check_spell(
    transcript: str,
    spell_words: list[str],
) -> dict:
    """주문 판정 결과를 반환한다."""
    if not transcript or not spell_words:
        return {"success": False, "matched": [], "missing": spell_words, "order_valid": False, "required_count": len(spell_words)}

    transcript_lower = transcript.strip()
    matched: list[str] = []
    missing: list[str] = []

    positions: list[int] = []
    for word in spell_words:
        position = _match_position(transcript_lower, word)
        if position is not None:
            matched.append(word)
            positions.append(position)
        else:
            missing.append(word)

    required_count = len(spell_words)
    order_valid = all(left < right for left, right in zip(positions, positions[1:]))
    success = len(matched) >= required_count and order_valid

    logger.info(
        "spell check: transcript='%s' words=%s matched=%s missing=%s success=%s",
        transcript, spell_words, matched, missing, success,
    )

    return {
        "success": success,
        "matched": matched,
        "missing": missing,
        "order_valid": order_valid,
        "required_count": required_count,
        "transcript": transcript,
    }


def _is_match(transcript: str, word: str) -> bool:
    """transcript에 word가 포함되어 있는지 퍼지 매칭."""
    return _match_position(transcript, word) is not None


def _match_position(transcript: str, word: str) -> int | None:
    """일치한 단서의 문자 위치를 반환해 공백 유무와 무관하게 순서를 검증한다."""
    direct_position = transcript.find(word)
    if direct_position >= 0:
        return direct_position

    chunks = transcript.split()
    word_jamo = _to_jamo(word)
    cursor = 0
    for chunk in chunks:
        chunk_position = transcript.find(chunk, cursor)
        cursor = chunk_position + len(chunk)
        chunk_jamo = _to_jamo(chunk)
        score = levenshtein_ratio(word_jamo, chunk_jamo)
        if score >= MATCH_THRESHOLD:
            return chunk_position

    return None


def _to_jamo(text: str) -> str:
    try:
        return j2hcj(h2j(text))
    except Exception:
        return text
