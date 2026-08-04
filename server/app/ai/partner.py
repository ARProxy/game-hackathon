"""T1 AI 동료의 규칙 기반 우회 표현 이해기."""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.ai.mission import PropPlacement


@dataclass(frozen=True)
class PartnerCommandMatch:
    matched: bool
    score: float
    cues: tuple[str, ...]


_ENDING_RE = re.compile(
    r"(으로|로|에서|에게|에는|하는|있는|쓰는|되는|된|한|인|을|를|이|가|은|는|의)$"
)
_TOKEN_RE = re.compile(r"[0-9A-Za-z가-힣]+")


def _cue_tokens(text: str) -> set[str]:
    tokens: set[str] = set()
    for raw in _TOKEN_RE.findall(text.lower()):
        token = _ENDING_RE.sub("", raw)
        if len(token) >= 2:
            tokens.add(token)
        elif len(raw) >= 2:
            # "작은"처럼 어미 제거 뒤 한 글자만 남는 단서는 원형을 보존한다.
            tokens.add(raw)
    return tokens


def match_partner_command(
    utterance: str,
    prop: PropPlacement,
    threshold: float = 2.0,
) -> PartnerCommandMatch:
    """프롭 이름을 쓰지 않은 묘사가 충분히 구체적인지 점수화한다.

    descriptions의 한국어 핵심어와 tags의 정확 토큰을 각각 한 점으로 센다.
    서로 다른 단서 두 개가 있어야 명령으로 인정해 단일 형용사 오작동을 막는다.
    """
    utterance_tokens = _cue_tokens(utterance)
    description_tokens: set[str] = set()
    for description in prop.descriptions:
        description_tokens.update(_cue_tokens(description))

    matched_cues = utterance_tokens & description_tokens
    lowered = utterance.lower()
    matched_tags = {
        tag.lower() for tag in prop.tags
        if len(tag) >= 2 and re.search(
            rf"(?<![0-9A-Za-z]){re.escape(tag.lower())}(?![0-9A-Za-z])",
            lowered,
        )
    }
    cues = tuple(sorted(matched_cues | matched_tags))
    score = float(len(cues))
    return PartnerCommandMatch(score >= threshold, score, cues)
