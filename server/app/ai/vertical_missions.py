"""층별 고유 미션 메커니즘.

각 층은 다른 게임플레이를 요구한다:
- 옥상: 조작 튜토리얼 (신호 장치 가동)
- 3층: 방송 미션 (음성으로 의미 전달) -- 이미 vertical_flow.py에 구현됨
- 2층: 인터폰 협동 (AI가 기호를 읽고 플레이어가 입력)
- 1층: 동시 조작 (AI와 플레이어가 제한시간 내 동시 장치 작동)
- 파이널: 3명 스테이션 도달 + 주문 -- 이미 구현됨
"""

from __future__ import annotations

import random
import time
from dataclasses import dataclass, field

from app.ai.speech import avoid_forbidden_words


# ---------------------------------------------------------------------------
# 2층 인터폰 미션
# ---------------------------------------------------------------------------

SHAPE_POOL = ["삼각형", "원", "네모", "별", "다이아몬드", "십자"]
COLOR_POOL = ["빨간", "파란", "초록", "노란", "보라", "주황"]


@dataclass
class IntercomMission:
    """2층 인터폰 협동 미션.

    AI가 F2_INTERCOM_A 위치에서 도형+색 시퀀스를 '보고',
    금기어를 피해 플레이어에게 음성으로 설명한다.
    플레이어가 F2_INTERCOM_B에서 정답을 음성으로 입력한다.
    """

    sequence: list[dict] = field(default_factory=list)
    ai_position_slot: str = "F2_INTERCOM_A"
    human_position_slot: str = "F2_INTERCOM_B"
    ai_companion_id: str = "partner"
    started_at: float | None = None
    ai_arrived: bool = False
    attempts: int = 0
    max_attempts: int = 3
    completed: bool = False

    @staticmethod
    def generate_sequence(count: int = 3, seed: int | None = None) -> list[dict]:
        """도형+색 시퀀스를 생성한다."""
        rng = random.Random(seed)
        shapes = rng.sample(SHAPE_POOL, min(count, len(SHAPE_POOL)))
        colors = rng.sample(COLOR_POOL, min(count, len(COLOR_POOL)))
        return [
            {"shape": shapes[i], "color": colors[i]}
            for i in range(count)
        ]

    def describe_for_ai(self, forbidden_words: list[str]) -> str:
        """AI가 금기어를 피해 시퀀스를 설명하는 텍스트를 생성한다."""
        parts: list[str] = []
        for item in self.sequence:
            desc = f"{item['color']} {item['shape']}"
            desc, _ = avoid_forbidden_words(desc, forbidden_words)
            parts.append(desc)
        return ", ".join(parts)

    def check_answer(self, transcript: str) -> dict:
        """플레이어 음성 답변에서 시퀀스를 추출하여 판정한다."""
        self.attempts += 1
        normalized = transcript.strip().lower()
        matched_items: list[dict] = []
        for item in self.sequence:
            shape_found = item["shape"] in normalized
            color_found = item["color"] in normalized
            matched_items.append({
                "shape": item["shape"],
                "color": item["color"],
                "shape_matched": shape_found,
                "color_matched": color_found,
            })
        all_correct = all(
            m["shape_matched"] and m["color_matched"]
            for m in matched_items
        )
        if all_correct:
            self.completed = True
        return {
            "success": all_correct,
            "matched_items": matched_items,
            "attempts": self.attempts,
            "max_attempts": self.max_attempts,
            "exhausted": self.attempts >= self.max_attempts and not all_correct,
        }


# ---------------------------------------------------------------------------
# 1층 동시 조작 미션
# ---------------------------------------------------------------------------

@dataclass
class SimultaneousMission:
    """1층 동시 조작 미션.

    플레이어가 F1_DEVICE_A, AI가 F1_DEVICE_B를 time_window 이내에
    모두 작동시키면 성공한다.
    """

    device_a_slot: str = "F1_DEVICE_A"
    device_b_slot: str = "F1_DEVICE_B"
    time_window: float = 3.0
    device_a_activated_at: float | None = None
    device_b_activated_at: float | None = None
    ai_companion_id: str = "partner"
    ai_arrived: bool = False
    ai_ready: bool = False
    completed: bool = False
    attempts: int = 0

    def activate_device(self, device: str) -> dict:
        """장치 활성화. device는 'A' 또는 'B'."""
        now = time.time()
        self.attempts += 1

        if device == "A":
            self.device_a_activated_at = now
        elif device == "B":
            self.device_b_activated_at = now
        else:
            return {"success": False, "reason": "invalid_device"}

        if self.device_a_activated_at is None or self.device_b_activated_at is None:
            other = "B" if device == "A" else "A"
            return {
                "success": False,
                "reason": "waiting_for_other",
                "activated_device": device,
                "waiting_for": other,
            }

        gap = abs(self.device_a_activated_at - self.device_b_activated_at)
        if gap <= self.time_window:
            self.completed = True
            return {
                "success": True,
                "gap_seconds": round(gap, 2),
                "attempts": self.attempts,
            }

        # 시간 초과 -- 리셋
        self.device_a_activated_at = None
        self.device_b_activated_at = None
        return {
            "success": False,
            "reason": "timing_mismatch",
            "gap_seconds": round(gap, 2),
            "attempts": self.attempts,
        }


# ---------------------------------------------------------------------------
# 수직 미션 번들
# ---------------------------------------------------------------------------

@dataclass
class VerticalMissions:
    """층별 미션을 묶는 컨테이너."""

    intercom: IntercomMission = field(default_factory=IntercomMission)
    simultaneous: SimultaneousMission = field(default_factory=SimultaneousMission)


def create_vertical_missions(
    forbidden_words: list[str],
    seed: int | None = None,
) -> VerticalMissions:
    """금기어 목록과 시드로 2층/1층 미션을 초기화한다."""
    intercom = IntercomMission(
        sequence=IntercomMission.generate_sequence(3, seed=seed),
    )
    simultaneous = SimultaneousMission()
    return VerticalMissions(intercom=intercom, simultaneous=simultaneous)
