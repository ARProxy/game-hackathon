"""T1 AI 동료의 규칙 기반 우회 표현 이해기."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal, Sequence

from app.ai.mission import PropPlacement


@dataclass(frozen=True)
class PartnerCommandMatch:
    matched: bool
    score: float
    cues: tuple[str, ...]


@dataclass(frozen=True)
class CandidateScore:
    prop: PropPlacement
    score: float
    cues: tuple[str, ...]


@dataclass(frozen=True)
class PartnerDecision:
    action: Literal["act", "clarify", "uncertain"]
    ranked: tuple[CandidateScore, ...]
    target: PropPlacement | None
    confidence: float
    reply: str


_ENDING_RE = re.compile(
    r"(으로|로|에서|에게|에는|하는|있는|쓰는|되는|된|한|인|을|를|이|가|은|는|의)$"
)
_TOKEN_RE = re.compile(r"[0-9A-Za-z가-힣]+")

# 프롭 사전의 영문 태그를 플레이어가 실제로 말하는 한국어 감각 단서와 연결한다.
_TAG_CUES: dict[str, tuple[str, ...]] = {
    "shiny": ("반짝이", "빛나"), "small": ("작은", "조그만"),
    "metal": ("금속", "쇠"), "round": ("둥근", "동그란"),
    "door-related": ("자물쇠", "돌리"),
    "thin": ("얇은", "가느다란"), "brown": ("갈색",),
    "warm": ("따뜻한",), "drink": ("마시", "음료"), "cup": ("컵", "잔"),
    "tall": ("긴", "높은"), "red": ("빨간", "붉은"),
    "orange": ("주황",), "pink": ("분홍",), "blue": ("파란", "하늘"),
    "green": ("초록",), "purple": ("보라",), "bright": ("밝은", "눈에 띄"),
    "flat": ("납작한",), "rectangular": ("네모난", "사각"),
    "paper": ("종이",), "readable": ("읽",), "screen": ("화면",),
    "electronic": ("전자기기", "전자"), "foldable": ("접을", "접는"),
    "long": ("긴",), "rain": ("비",), "pointy": ("뾰족",),
    "time": ("시간",), "ticking": ("째깍",), "numbered": ("숫자",),
    "wall": ("벽",), "reflective": ("비추", "거울"),
}


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


def _candidate_cues(prop: PropPlacement) -> set[str]:
    cues: set[str] = set()
    for description in prop.descriptions:
        cues.update(_cue_tokens(description))
    for tag in prop.tags:
        cues.update(_TAG_CUES.get(tag.lower(), ()))
    return cues


def compare_partner_candidates(
    utterance: str,
    candidates: Sequence[PropPlacement],
) -> PartnerDecision:
    """모든 후보를 같은 입력으로 평가해 행동·질문·대기를 결정한다."""
    utterance_tokens = _cue_tokens(utterance)
    lowered = utterance.lower()
    ranked: list[CandidateScore] = []
    for prop in candidates:
        semantic_cues = _candidate_cues(prop)
        matched = {
            cue for cue in semantic_cues
            if cue in utterance_tokens or (len(cue) >= 2 and cue in lowered)
        }
        ranked.append(CandidateScore(prop, float(len(matched)), tuple(sorted(matched))))
    ranked.sort(key=lambda item: (-item.score, item.prop.prop_id))
    ordered = tuple(ranked)
    if not ordered or ordered[0].score < 1:
        return PartnerDecision(
            "uncertain", ordered, None, 0.0,
            "아직 어느 후보인지 모르겠어. 색, 모양, 쓰임새 중 하나를 더 알려줘.",
        )

    best = ordered[0]
    second_score = ordered[1].score if len(ordered) > 1 else 0.0
    margin = best.score - second_score
    confidence = min(1.0, (best.score / 4.0) + (margin * 0.2))
    if best.score >= 2 and margin >= 1:
        return PartnerDecision(
            "act", ordered, best.prop, confidence,
            f"{best.prop.zone}구역 후보가 가장 가까워 보여. 직접 확인할게.",
        )

    tied_zones = "과 ".join(
        f"{item.prop.zone}구역 {index + 1}번 후보"
        for index, item in enumerate(ordered[:2])
    )
    return PartnerDecision(
        "clarify", ordered, None, confidence,
        f"{tied_zones}가 비슷해. 색이나 쓰임새를 하나 더 설명해줘.",
    )
