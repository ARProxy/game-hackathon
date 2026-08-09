"""층별 고유 미션 메커니즘.

각 층은 다른 게임플레이를 요구한다:
- 옥상: 점멸 순서를 기억하고 직접 옥상을 횡단하는 신호 복원
- 3층: 방송 미션 (음성으로 의미 전달) -- 이미 vertical_flow.py에 구현됨
- 2층: 인터폰 협동 (AI가 기호를 읽고 플레이어가 입력)
- 1층: 동시 조작 (AI와 플레이어가 제한시간 내 동시 장치 작동)
- 파이널: 3명 스테이션 도달 + 주문 -- 이미 구현됨
- 지하: 배전반/급수 밸브/발전기 3개 장치를 올바른 순서로 활성화
"""

from __future__ import annotations

import random
import time
from dataclasses import dataclass, field

from app.ai.speech import avoid_forbidden_words


# ---------------------------------------------------------------------------
# 옥상 기억 신호 미션
# ---------------------------------------------------------------------------

ROOFTOP_SIGNAL_SLOT_BY_ID = {
    "center": "ROOF_SIGNAL_CENTER",
    "east": "ROOF_SIGNAL_EAST",
    "west": "ROOF_SIGNAL_WEST",
}


@dataclass
class RooftopSignalMission:
    """점멸 순서를 기억한 플레이어가 옥상을 횡단하는 기억·이동 미션."""

    sequence: list[str] = field(default_factory=lambda: ["center", "east", "west"])
    activated_signal_ids: list[str] = field(default_factory=list)
    completed: bool = False

    @property
    def next_signal_id(self) -> str | None:
        if len(self.activated_signal_ids) >= len(self.sequence):
            return None
        return self.sequence[len(self.activated_signal_ids)]

    def activate(self, signal_id: str) -> dict:
        if self.completed:
            return self.public_state()
        expected = self.next_signal_id
        if signal_id != expected:
            return {
                **self.public_state(),
                "success": False,
                "reason": "already_active" if signal_id in self.activated_signal_ids else "wrong_order",
                "expected_signal_id": expected,
            }
        self.activated_signal_ids.append(signal_id)
        self.completed = len(self.activated_signal_ids) == len(self.sequence)
        return {**self.public_state(), "success": True, "signal_id": signal_id}

    def public_state(self) -> dict:
        return {
            "signal_sequence": list(self.sequence),
            "activated_signal_ids": list(self.activated_signal_ids),
            "next_signal_id": self.next_signal_id,
            "progress": len(self.activated_signal_ids),
            "total": len(self.sequence),
            "completed": self.completed,
        }


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
    def generate_sequence(
        count: int = 3,
        seed: int | None = None,
        forbidden_words: list[str] | None = None,
    ) -> list[dict]:
        """현재 금기어와 충돌하지 않는 도형+색 시퀀스를 생성한다."""
        rng = random.Random(seed)
        forbidden = set(forbidden_words or ())
        safe_shapes = [shape for shape in SHAPE_POOL if shape not in forbidden]
        safe_colors = [color for color in COLOR_POOL if color not in forbidden]
        if len(safe_shapes) < count or len(safe_colors) < count:
            raise ValueError("인터폰 정답 어휘를 금기어와 겹치지 않게 구성할 수 없다")
        shapes = rng.sample(safe_shapes, count)
        colors = rng.sample(safe_colors, count)
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
        pair_positions: list[int] = []
        for item in self.sequence:
            shape_position = normalized.find(item["shape"])
            color_position = normalized.find(item["color"])
            shape_found = shape_position >= 0
            color_found = color_position >= 0
            pair_position = min(shape_position, color_position) if shape_found and color_found else -1
            pair_positions.append(pair_position)
            matched_items.append({
                "shape": item["shape"],
                "color": item["color"],
                "shape_matched": shape_found,
                "color_matched": color_found,
            })
        all_present = all(
            m["shape_matched"] and m["color_matched"]
            for m in matched_items
        )
        order_valid = all_present and all(
            previous < current
            for previous, current in zip(pair_positions, pair_positions[1:])
        )
        success = all_present and order_valid
        if success:
            self.completed = True
        return {
            "success": success,
            "matched_items": matched_items,
            "order_valid": order_valid,
            "attempts": self.attempts,
            "max_attempts": self.max_attempts,
            "exhausted": self.attempts >= self.max_attempts and not success,
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
# 지하 파이널 미션
# ---------------------------------------------------------------------------

@dataclass
class BasementDevice:
    """지하 파이널의 개별 장치."""

    device_id: str        # "panel", "valve", "generator"
    name: str             # "배전반", "급수 밸브", "발전기"
    slot_id: str          # 맵 슬롯 ID
    state: str = "off"    # "off" | "standby" | "active"
    activated_by: str | None = None


@dataclass
class BasementFinalMission:
    """지하 파이널 미션.

    배전반, 급수 밸브, 발전기 3개 장치를 올바른 순서로 활성화해야 한다.
    각 장치의 상태는 해당 장치 앞에 있는 actor만 확인 가능하고,
    잘못된 순서로 활성화하면 전체 리셋 + 술래에게 소리 핑이 발생한다.
    """

    devices: list[BasementDevice] = field(default_factory=list)
    correct_order: list[str] = field(default_factory=list)
    activated_order: list[str] = field(default_factory=list)
    completed: bool = False
    reset_count: int = 0

    def activate_device(self, device_id: str, actor_id: str) -> dict:
        device = next((d for d in self.devices if d.device_id == device_id), None)
        if not device:
            return {"success": False, "reason": "unknown_device"}
        if device.state == "active":
            return {"success": False, "reason": "already_active"}

        device.state = "active"
        device.activated_by = actor_id
        self.activated_order.append(device_id)

        # 순서 검증
        expected_so_far = self.correct_order[:len(self.activated_order)]
        if self.activated_order != expected_so_far:
            # 잘못된 순서 → 전체 리셋
            self._reset_all()
            return {"success": False, "reason": "wrong_order", "reset": True}

        if len(self.activated_order) == len(self.correct_order):
            self.completed = True
            return {"success": True, "completed": True}

        return {"success": True, "completed": False, "progress": len(self.activated_order)}

    def _reset_all(self) -> None:
        for d in self.devices:
            d.state = "off"
            d.activated_by = None
        self.activated_order.clear()
        self.reset_count += 1

    def get_device_status(self, device_id: str) -> dict | None:
        device = next((d for d in self.devices if d.device_id == device_id), None)
        if not device:
            return None
        next_device_id = (
            self.correct_order[len(self.activated_order)]
            if len(self.activated_order) < len(self.correct_order)
            else None
        )
        visible_state = (
            "active" if device.state == "active"
            else "standby" if device.device_id == next_device_id
            else "off"
        )
        return {
            "device_id": device.device_id,
            "name": device.name,
            "state": visible_state,
        }


def create_basement_mission(seed: int = 0) -> BasementFinalMission:
    """시드를 기반으로 지하 파이널 미션을 생성한다."""
    rng = random.Random(seed)
    devices = [
        BasementDevice("panel", "배전반", "BASEMENT_DEVICE_PANEL"),
        BasementDevice("valve", "급수 밸브", "BASEMENT_DEVICE_VALVE"),
        BasementDevice("generator", "발전기", "BASEMENT_DEVICE_GENERATOR"),
    ]
    order = [d.device_id for d in devices]
    rng.shuffle(order)
    return BasementFinalMission(devices=devices, correct_order=order)


# ---------------------------------------------------------------------------
# 수직 미션 번들
# ---------------------------------------------------------------------------

@dataclass
class VerticalMissions:
    """층별 미션을 묶는 컨테이너."""

    rooftop: RooftopSignalMission = field(default_factory=RooftopSignalMission)
    intercom: IntercomMission = field(default_factory=IntercomMission)
    simultaneous: SimultaneousMission = field(default_factory=SimultaneousMission)
    basement: BasementFinalMission = field(default_factory=BasementFinalMission)


def create_vertical_missions(
    forbidden_words: list[str],
    seed: int | None = None,
) -> VerticalMissions:
    """금기어 목록과 시드로 2층/1층/지하 미션을 초기화한다."""
    effective_seed = seed if seed is not None else 0
    rooftop_sequence = list(ROOFTOP_SIGNAL_SLOT_BY_ID)
    random.Random(effective_seed ^ 0x524F4F46).shuffle(rooftop_sequence)
    intercom = IntercomMission(
        sequence=IntercomMission.generate_sequence(
            3, seed=seed, forbidden_words=forbidden_words,
        ),
    )
    simultaneous = SimultaneousMission()
    basement = create_basement_mission(seed=effective_seed)
    return VerticalMissions(
        rooftop=RooftopSignalMission(sequence=rooftop_sequence),
        intercom=intercom,
        simultaneous=simultaneous,
        basement=basement,
    )
