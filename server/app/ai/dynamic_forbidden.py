"""플레이 중 인간 대화로 비공개 금기어 프로필을 갱신한다.

LLM은 관찰된 후보의 순위를 추천할 뿐이며, 실제 적용 가능 단어와
세대 전환은 이 모듈의 결정론적 계약이 확정한다.
"""

from __future__ import annotations

import json
import time
from collections import Counter
from dataclasses import dataclass, field

from kiwipiepy import Kiwi

from app.ai.onboarding import _ollama_json


INITIAL_OBSERVATION_UTTERANCES = 3
ROTATION_UTTERANCES = 5
MIN_ROTATION_SECONDS = 45.0
MAX_RECENT_UTTERANCES = 20
MAX_WORDS = 3

PROTECTED_WORDS = {
    "얼음", "땡", "도망자", "동료", "술래", "구조", "탈출", "주문",
    "여기", "저기", "거기", "이거", "저거", "그거", "사람", "말",
    # 최종 주문과 인터폰의 고정 정답 문자열은 반드시 그대로 말할 수 있어야 한다.
    "달빛", "교정", "삼각형", "원", "네모", "별", "다이아몬드", "십자",
    "빨간", "파란", "초록", "노란", "보라", "주황",
    # 1층 CCTV는 화면에 표시된 방향을 음성으로 전달해야 한다. 동의어도
    # 판정 큐이므로 플레이어가 안전한 표현을 잃지 않게 전부 보호한다.
    "직진", "앞으로", "곧장", "복도", "왼쪽", "좌회전", "서쪽",
    "오른쪽", "우회전", "북쪽",
    # 지하 파이널은 장치명과 작동 행동을 함께 말해야 진행된다.
    "배전반", "전기판", "전원판", "밸브", "급수", "발전기", "비상",
    "전원", "장치", "작동", "가동", "시작",
    # AI 발화 모드를 제어하는 음성 명령도 게임 입력이므로 보호한다.
    "조용", "보고", "무전", "인터폰", "방송",
    # 3층은 세 물리 후보를 설명하고 교정하는 말 자체가 입력이다. 정답 후보뿐
    # 아니라 오답 후보의 구별 단서도 보호해야 플레이어가 안전하게 오해를
    # 설명하고 다시 교정할 수 있다.
    "은빛", "금속", "출입구", "자물쇠", "도구", "물건", "쓰임", "재질",
    "원통", "손잡이", "빛", "버튼", "기계", "조작",
}

_kiwi = Kiwi()


@dataclass
class DynamicForbiddenProfile:
    current_words: list[str] = field(default_factory=list)
    recent_utterances: list[str] = field(default_factory=list)
    total_utterances: int = 0
    applied_through_utterance: int = 0
    generation: int = 0
    last_rotated_at: float | None = None
    analysis_pending: bool = False
    locked: bool = False
    history: list[dict] = field(default_factory=list)

    def reset(self) -> None:
        self.current_words.clear()
        self.recent_utterances.clear()
        self.total_utterances = 0
        self.applied_through_utterance = 0
        self.generation = 0
        self.last_rotated_at = None
        self.analysis_pending = False
        self.locked = False
        self.history.clear()

    def record_human_utterance(self, transcript: str) -> bool:
        normalized = " ".join(transcript.strip().split())
        if len(normalized) < 2:
            return False
        self.recent_utterances.append(normalized)
        self.recent_utterances = self.recent_utterances[-MAX_RECENT_UTTERANCES:]
        self.total_utterances += 1
        return True

    def should_refresh(self, now: float | None = None) -> bool:
        if self.locked or self.analysis_pending:
            return False
        if not self.current_words:
            return self.total_utterances >= INITIAL_OBSERVATION_UTTERANCES
        checked_at = now if now is not None else time.monotonic()
        utterances_ready = (
            self.total_utterances - self.applied_through_utterance
            >= ROTATION_UTTERANCES
        )
        time_ready = (
            self.last_rotated_at is not None
            and checked_at - self.last_rotated_at >= MIN_ROTATION_SECONDS
        )
        return utterances_ready and time_ready

    def apply(
        self,
        words: list[str],
        *,
        analyzed_through: int,
        now: float | None = None,
        reason: str,
    ) -> bool:
        cleaned = _unique_valid_words(words)
        if not cleaned or cleaned == self.current_words:
            self.applied_through_utterance = max(
                self.applied_through_utterance, analyzed_through,
            )
            return False

        activated_at = now if now is not None else time.monotonic()
        if self.history and self.history[-1].get("retired_at") is None:
            self.history[-1]["retired_at"] = activated_at
        self.generation += 1
        self.current_words = cleaned[:MAX_WORDS]
        self.applied_through_utterance = analyzed_through
        self.last_rotated_at = activated_at
        self.history.append({
            "generation": self.generation,
            "activated_at": activated_at,
            "retired_at": None,
            "words": list(self.current_words),
            "reason": reason,
        })
        return True

    def lock(self) -> None:
        self.locked = True

    def public_state(self, *, shifted: bool = False) -> dict:
        status = "locked" if self.locked else (
            "observing" if not self.current_words else ("shifted" if shifted else "active")
        )
        return {"status": status}

    def result_history(self) -> list[dict]:
        result_at = time.monotonic()
        return [
            {
                "generation": entry["generation"],
                "activated_at": entry["activated_at"],
                "retired_at": entry["retired_at"],
                "words": list(entry["words"]),
                "reason": entry["reason"],
                "duration_seconds": max(
                    0.0,
                    float(entry["retired_at"] or result_at) - float(entry["activated_at"]),
                ),
            }
            for entry in self.history
        ]


def extract_observed_candidates(utterances: list[str]) -> list[dict]:
    """실제 인간 발화에서 서버가 허용할 명사 후보만 추출한다."""
    occurrences: list[str] = []
    last_seen: dict[str, int] = {}
    for utterance_index, utterance in enumerate(utterances):
        for token in _kiwi.tokenize(utterance):
            word = token.form.strip()
            if (
                token.tag not in {"NNG", "NNP"}
                or len(word) < 2
                or word in PROTECTED_WORDS
            ):
                continue
            occurrences.append(word)
            last_seen[word] = utterance_index

    frequency = Counter(occurrences)
    denominator = max(1, len(utterances) - 1)
    ranked = sorted(
        frequency,
        key=lambda word: (
            -(frequency[word] * 2.0 + last_seen[word] / denominator),
            word,
        ),
    )
    return [
        {
            "word": word,
            "frequency": frequency[word],
            "last_seen": last_seen[word],
        }
        for word in ranked
    ]


def analyze_dynamic_forbidden_words(
    utterances: list[str],
    current_words: list[str],
) -> tuple[list[str], str]:
    """Ollama 추천을 검증하고 실패하면 로컬 순위를 사용한다."""
    candidates = extract_observed_candidates(utterances)
    allowed = [item["word"] for item in candidates]
    if not allowed:
        return list(current_words), "insufficient_observed_candidates"

    prompt = f"""한국어 음성 협동 게임에서 플레이어가 실제로 자주 쓰며 다시 말할 가능성이 높은 표현을 골라라.
최근 인간 발화: {json.dumps(utterances[-12:], ensure_ascii=False)}
현재 비공개 금기어: {json.dumps(current_words, ensure_ascii=False)}
선택 가능한 관찰 후보: {json.dumps(candidates, ensure_ascii=False)}
관찰 후보 밖의 단어를 만들지 마라. 정확히 JSON만 반환: {{"words":["단어1","단어2","단어3"]}}"""
    generated = _ollama_json(prompt)
    proposed = generated.get("words", []) if isinstance(generated, dict) else []
    validated = _unique_valid_words([
        str(word).strip() for word in proposed if str(word).strip() in allowed
    ])
    ranked = validated + [word for word in allowed if word not in validated]

    if not current_words:
        return ranked[:MAX_WORDS], "initial_conversation_profile"

    # 전부 바뀌는 불공정성을 막기 위해 이전 세대에서 최소 한 단어를 유지한다.
    retained = next((word for word in current_words if word in allowed), current_words[0])
    replacements = [word for word in ranked if word != retained and word not in current_words]
    next_words = [retained, *replacements[: MAX_WORDS - 1]]
    if len(next_words) < MAX_WORDS:
        next_words.extend(
            word for word in current_words
            if word not in next_words
        )
    return next_words[:MAX_WORDS], "periodic_conversation_shift"


def _unique_valid_words(words: list[str]) -> list[str]:
    result: list[str] = []
    for word in words:
        normalized = word.strip()
        if (
            len(normalized) < 2
            or normalized in PROTECTED_WORDS
            or normalized in result
        ):
            continue
        result.append(normalized)
    return result
