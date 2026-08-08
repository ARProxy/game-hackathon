"""AI 발화 모드, 소리 핑 반경, 음성 명령 분류, 중복 억제."""

from __future__ import annotations

import re
import time
from dataclasses import dataclass, field
from enum import Enum


# ---------------------------------------------------------------------------
# S5: AI 발화 모드와 소리 핑 반경
# ---------------------------------------------------------------------------

class SpeechMode(str, Enum):
    """AI 동료의 발화 모드. 모드에 따라 술래에게 감지되는 반경이 달라진다."""
    SHORT_REACT = "short_react"   # "응", "큰 거?", 확인
    NORMAL = "normal"             # 안전하거나 일반 보고
    WHISPER = "whisper"           # 술래가 가까운 상황
    SHOUT = "shout"               # 구조·술래 발견·즉시 위험
    INTERCOM = "intercom"         # 미션 중 인터폰·방송실 사용
    RADIO = "radio"               # 서로 다른 층·폐쇄 구역
    SILENT = "silent"             # 정보 가치가 낮고 위험이 큼


SPEECH_MODE_RADIUS: dict[SpeechMode, float] = {
    SpeechMode.SHORT_REACT: 8.0,
    SpeechMode.NORMAL: 18.0,
    SpeechMode.WHISPER: 8.0,
    SpeechMode.SHOUT: 22.0,
    SpeechMode.INTERCOM: 999.0,  # 해당 층 전체
    SpeechMode.RADIO: 3.0,       # 매우 작음
    SpeechMode.SILENT: 0.0,      # 없음
}


def select_speech_mode(
    intent_state: str,
    seeker_distance: float | None,
    is_urgent: bool = False,
) -> SpeechMode:
    """AI 상태와 술래 거리에 따라 최적 발화 모드를 자동 선택한다."""
    if intent_state == "AVOID_SEEKER":
        return SpeechMode.WHISPER
    if is_urgent or intent_state == "RESCUE_TEAMMATE":
        return SpeechMode.SHOUT if (seeker_distance is None or seeker_distance > 12) else SpeechMode.WHISPER
    if seeker_distance is not None and seeker_distance <= 10:
        return SpeechMode.WHISPER
    if intent_state in {"EXPLORE_ZONE", "INSPECT_CANDIDATE", "REPORT_FINDING"}:
        return SpeechMode.NORMAL
    return SpeechMode.SHORT_REACT


# ---------------------------------------------------------------------------
# S4: AI 발화 의도 (4역할)
# ---------------------------------------------------------------------------

class SpeechIntent(str, Enum):
    """AI 발화의 4가지 역할."""
    REPORT_OBSERVATION = "report_observation"     # 관찰 보고
    EXPLAIN_DECISION = "explain_decision"         # 판단 설명
    ASK_CLARIFICATION = "ask_clarification"       # 확인 질문
    DECLARE_ACTION = "declare_action"             # 행동 선언
    FORBIDDEN_AVOIDANCE = "forbidden_avoidance"   # 금기어 회피 연출


@dataclass(frozen=True)
class SpeechEvent:
    """AI가 발화할 때 생성되는 구조화된 이벤트."""
    speaker: str
    intent: SpeechIntent
    mode: SpeechMode
    text: str
    ping_radius: float
    facts: dict = field(default_factory=dict)


def build_speech_event(
    speaker: str,
    intent: SpeechIntent,
    text: str,
    mode: SpeechMode | None = None,
    intent_state: str = "",
    seeker_distance: float | None = None,
    facts: dict | None = None,
) -> SpeechEvent:
    """발화 이벤트를 구성한다. mode가 None이면 자동 선택."""
    if mode is None:
        is_urgent = intent in {SpeechIntent.DECLARE_ACTION} and intent_state == "RESCUE_TEAMMATE"
        mode = select_speech_mode(intent_state, seeker_distance, is_urgent)
    radius = SPEECH_MODE_RADIUS[mode]
    return SpeechEvent(
        speaker=speaker,
        intent=intent,
        mode=mode,
        text=text,
        ping_radius=radius,
        facts=facts or {},
    )


# ---------------------------------------------------------------------------
# S4: 금기어 회피 연출
# ---------------------------------------------------------------------------

def avoid_forbidden_words(text: str, forbidden_words: list[str]) -> tuple[str, bool]:
    """텍스트에서 금기어를 회피 연출로 교체한다. (변경 여부도 반환)

    "열쇠" → "열... 아, 그 금속 물건"
    """
    modified = False
    result = text
    for word in forbidden_words:
        if word in result:
            # 첫 글자만 남기고 회피 연출
            replacement = f"{word[0]}... 아, 그거 있잖아"
            result = result.replace(word, replacement, 1)
            modified = True
    return result, modified


# ---------------------------------------------------------------------------
# B1: 플레이어 음성 명령 의도 분류
# ---------------------------------------------------------------------------

class VoiceCommand(str, Enum):
    SILENCE = "silence"       # "조용히 해"
    REPORT = "report"         # "보고해"
    RADIO = "radio"           # "무전으로 말해"
    BROADCAST = "broadcast"   # "크게 알려줘"
    NONE = "none"             # 일반 발화 (명령 아님)


_VOICE_COMMAND_PATTERNS: list[tuple[VoiceCommand, re.Pattern[str]]] = [
    (VoiceCommand.SILENCE, re.compile(r"(조용|쉿|말\s*하지\s*마|입\s*다물)")),
    (VoiceCommand.REPORT, re.compile(r"(보고|알려\s*줘|뭐\s*봤|상황|어디)")),
    (VoiceCommand.RADIO, re.compile(r"(무전|라디오|채널)")),
    (VoiceCommand.BROADCAST, re.compile(r"(크게|외쳐|소리\s*질러|방송)")),
]


def classify_voice_command(transcript: str) -> VoiceCommand:
    """플레이어의 음성 발화에서 AI 동료에 대한 명령 의도를 분류한다."""
    normalized = transcript.strip().lower()
    if len(normalized) < 2:
        return VoiceCommand.NONE
    for command, pattern in _VOICE_COMMAND_PATTERNS:
        if pattern.search(normalized):
            return command
    return VoiceCommand.NONE


# ---------------------------------------------------------------------------
# B2: AI 발화 중복 억제 + 긴급 우선 큐
# ---------------------------------------------------------------------------

_URGENCY_ORDER: dict[SpeechIntent, int] = {
    SpeechIntent.DECLARE_ACTION: 0,       # 가장 긴급
    SpeechIntent.REPORT_OBSERVATION: 1,
    SpeechIntent.EXPLAIN_DECISION: 2,
    SpeechIntent.ASK_CLARIFICATION: 3,
    SpeechIntent.FORBIDDEN_AVOIDANCE: 4,
}


@dataclass
class SpeechHistory:
    """AI 동료별 발화 이력. 중복을 억제하고 긴급 발화를 우선한다."""
    recent: list[tuple[float, str, SpeechIntent]] = field(default_factory=list)
    suppression_window: float = 15.0  # 같은 내용 반복 금지 시간(초)
    max_history: int = 10
    silenced_until: float = 0.0       # SILENCE 명령 시 발화 보류 시각

    def should_suppress(self, text: str, intent: SpeechIntent, now: float | None = None) -> bool:
        """같은 정보를 최근에 이미 보고했으면 True."""
        checked_at = now or time.monotonic()
        # SILENCE 명령으로 보류 중이면 긴급 외에는 억제
        if checked_at < self.silenced_until and intent not in {
            SpeechIntent.DECLARE_ACTION,
        }:
            return True
        # 같은 텍스트를 최근에 말했으면 억제
        cutoff = checked_at - self.suppression_window
        for timestamp, prev_text, _ in reversed(self.recent):
            if timestamp < cutoff:
                break
            if prev_text == text:
                return True
        return False

    def record(self, text: str, intent: SpeechIntent, now: float | None = None) -> None:
        checked_at = now or time.monotonic()
        self.recent.append((checked_at, text, intent))
        if len(self.recent) > self.max_history:
            self.recent = self.recent[-self.max_history:]

    def silence(self, duration: float = 10.0, now: float | None = None) -> None:
        """SILENCE 명령 처리. duration 초 동안 비긴급 발화를 보류한다."""
        checked_at = now or time.monotonic()
        self.silenced_until = checked_at + duration

    def prioritize(self, events: list[SpeechEvent]) -> list[SpeechEvent]:
        """여러 발화가 동시에 대기 중이면 긴급한 것을 먼저 정렬한다."""
        return sorted(events, key=lambda e: _URGENCY_ORDER.get(e.intent, 99))

    def reset(self) -> None:
        self.recent.clear()
        self.silenced_until = 0.0
