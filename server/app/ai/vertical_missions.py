"""층별 고유 미션 메커니즘.

각 층은 다른 게임플레이를 요구한다:
- 옥상: 점멸 순서를 기억하고 직접 옥상을 횡단하는 신호 복원
- 3층: 세 물리 후보를 AI가 비교·확인하고 플레이어 교정으로 재평가하는 방송 추론
- 2층: 인터폰 협동 (AI가 기호를 읽고 플레이어가 입력)
- 1층: CCTV 음성 관제 (인간 방향 안내 → AI 실제 이동 → 원격 동시 해제)
- 파이널: 3명 스테이션 도달 + 주문 -- 이미 구현됨
- 지하: 배전반/급수 밸브/발전기 3개 장치를 올바른 순서로 활성화
"""

from __future__ import annotations

import random
import time
from dataclasses import dataclass, field

from app.ai.mission import PropPlacement
from app.ai.partner import PartnerDecision, compare_partner_candidates
from app.ai.speech import avoid_forbidden_words
from app.game.map_slots import get_map_slot


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
# 3층 방송 추론 미션
# ---------------------------------------------------------------------------

F3_INFERENCE_CANDIDATE_SLOTS = (
    "F3_INFERENCE_CANDIDATE_A",
    "F3_INFERENCE_CANDIDATE_B",
    "F3_INFERENCE_CANDIDATE_C",
)

F3_INFERENCE_LOCATIONS = (
    ("F3_INFERENCE_CANDIDATE_A", "방송실"),
    ("F3_INFERENCE_CANDIDATE_B", "서쪽 편집실"),
    ("F3_INFERENCE_CANDIDATE_C", "동쪽 서예실"),
)


def _f3_candidate(
    *,
    slot_id: str,
    prop_id: str,
    name: str,
    color: str,
    mesh: str,
    is_real: bool,
    zone: str,
    tags: list[str],
    descriptions: list[str],
) -> PropPlacement:
    slot = get_map_slot(slot_id)
    x, _, z = slot.get("aiApproachPosition", slot["position"])
    return PropPlacement(
        prop_id=prop_id,
        name=name,
        color=color,
        mesh=mesh,
        scale=0.35,
        position={"x": float(x), "z": float(z)},
        is_real=is_real,
        zone=zone,
        forbidden_word="열쇠",
        tags=tags,
        descriptions=descriptions,
    )


def create_broadcast_inference_mission(
    seed: int | None = None,
) -> "BroadcastInferenceMission":
    """세 후보의 증거대 위치를 시드로 섞어 매 판 탐색 동선을 바꾼다.

    후보의 의미와 정답은 검증된 템플릿에 남기고 위치만 바꾼다. 따라서
    LLM이 임의의 정답을 만들거나 도달 불가능한 장소를 선택할 수 없다.
    ``seed=None``은 단위 테스트와 레거시 호출의 기존 배치를 보존한다.
    """
    locations = list(F3_INFERENCE_LOCATIONS)
    if seed is not None:
        random.Random(seed ^ 0x46334252).shuffle(locations)

    candidate_specs = [
        dict(
            prop_id="vertical_f3_candidate_a",
            name="비상 해제 열쇠",
            color="#C8D2DC",
            mesh="key",
            is_real=True,
            tags=["shiny", "small", "metal", "long", "door-related"],
            descriptions=[
                "은빛 금속", "작고 길쭉한 물건", "잠긴 출입구를 여는 도구",
                "자물쇠에 넣어 돌리는 물건",
            ],
        ),
        dict(
            prop_id="vertical_f3_candidate_b",
            name="손전등",
            color="#20242A",
            mesh="cylinder",
            is_real=False,
            tags=["black", "long", "light", "tool"],
            descriptions=[
                "검은 원통", "길쭉한 손잡이", "어두운 곳에 빛을 비추는 도구",
            ],
        ),
        dict(
            prop_id="vertical_f3_candidate_c",
            name="방송 리모컨",
            color="#30343A",
            mesh="box",
            is_real=False,
            tags=["black", "rectangular", "electronic"],
            descriptions=[
                "검은 네모", "작은 버튼이 많은 장치", "기계를 멀리서 조작하는 도구",
            ],
        ),
    ]
    candidates = [
        _f3_candidate(slot_id=slot_id, zone=zone, **spec)
        for spec, (slot_id, zone) in zip(candidate_specs, locations)
    ]
    return BroadcastInferenceMission(candidates=candidates)


@dataclass
class BroadcastInferenceMission:
    """설명·오해·물리 확인·교정이 모두 필요한 3층 협동 추론."""

    candidates: list[PropPlacement] = field(default_factory=list)
    correct_candidate_id: str = "vertical_f3_candidate_a"
    attempted_candidate_ids: list[str] = field(default_factory=list)
    pending_candidate_id: str | None = None
    utterance_history: list[str] = field(default_factory=list)
    completed: bool = False

    @property
    def prompt(self) -> str:
        return (
            "방송 기록의 목표 물건은 ‘은빛 금속’, ‘작고 길쭉함’, "
            "‘잠긴 출입구를 여는 쓰임’입니다. 이름을 직접 말하지 말고 Q로 설명하세요. "
            "AI가 3층의 세 증거대를 비교해 실제 후보를 확인합니다."
        )

    def decide(self, transcript: str) -> PartnerDecision:
        self.utterance_history.append(transcript.strip())
        decision = compare_partner_candidates(transcript, self.candidates)
        self.pending_candidate_id = (
            decision.target.prop_id if decision.target is not None else None
        )
        return decision

    def inspect(self, candidate_id: str) -> dict:
        candidate = next(
            (item for item in self.candidates if item.prop_id == candidate_id),
            None,
        )
        if candidate is None:
            return {"success": False, "reason": "unknown_candidate"}
        if candidate_id not in self.attempted_candidate_ids:
            self.attempted_candidate_ids.append(candidate_id)
        correct = candidate_id == self.correct_candidate_id
        self.pending_candidate_id = None
        if correct:
            self.completed = True
        return {
            "success": correct,
            "completed": self.completed,
            "candidate_id": candidate_id,
            "zone": candidate.zone,
            "attempts": len(self.attempted_candidate_ids),
            "feedback": (
                "방송 기록의 재질·형태·쓰임이 모두 일치해. 이 후보가 맞아."
                if correct
                else "직접 확인해 보니 방송 기록의 재질이나 쓰임과 달라. 차이를 교정해 줘."
            ),
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
        first_mismatch_index = next((
            index for index, item in enumerate(matched_items)
            if not item["shape_matched"] or not item["color_matched"]
        ), None)
        if first_mismatch_index is None and not order_valid:
            first_mismatch_index = next((
                index for index in range(1, len(pair_positions))
                if pair_positions[index - 1] >= pair_positions[index]
            ), 0)
        return {
            "success": success,
            "matched_items": matched_items,
            "order_valid": order_valid,
            "attempts": self.attempts,
            "max_attempts": self.max_attempts,
            # 음성 인식이나 추격 때문에 세 번 실패해도 필수 진행을 잠그지 않는다.
            # 세 번은 AI 힌트가 가장 구체적으로 바뀌는 기준일 뿐 재시도 제한이 아니다.
            "hint_level": min(self.attempts, self.max_attempts),
            "retry_available": not success,
            "exhausted": False,
            "first_mismatch_index": first_mismatch_index,
        }


# ---------------------------------------------------------------------------
# 1층 동시 조작 미션
# ---------------------------------------------------------------------------

@dataclass
class SimultaneousMission:
    """1층 CCTV 음성 관제 뒤 동시 조작으로 마무리하는 미션.

    인간은 경비실 CCTV에서 보이는 안전 표식을 음성으로 전달하고, AI는
    세 체크포인트를 실제로 이동한다. 마지막 원격 장치에 도착한 뒤에만
    인간 A + AI B 동시 조작을 허용한다.
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
    started_at: float | None = None
    guidance_actor_id: str | None = None
    route_commands: list[str] = field(default_factory=lambda: ["직진", "왼쪽", "오른쪽"])
    route_slots: list[str] = field(default_factory=lambda: [
        "F1_CCTV_CHECKPOINT_1", "F1_CCTV_CHECKPOINT_2", "F1_DEVICE_B",
    ])
    accepted_commands: int = 0

    @property
    def route_completed(self) -> bool:
        return self.accepted_commands >= len(self.route_commands) and self.ai_ready

    @property
    def expected_command(self) -> str | None:
        if self.accepted_commands >= len(self.route_commands):
            return None
        return self.route_commands[self.accepted_commands]

    @property
    def current_target_slot(self) -> str | None:
        if self.accepted_commands <= 0:
            return None
        return self.route_slots[self.accepted_commands - 1]

    def start_guidance(self, actor_id: str) -> dict:
        if self.started_at is None:
            self.started_at = time.time()
            self.guidance_actor_id = actor_id
        return self.guidance_state(success=True)

    def submit_direction(self, transcript: str) -> dict:
        if self.started_at is None:
            return self.guidance_state(success=False, reason="not_started")
        expected = self.expected_command
        if expected is None:
            return self.guidance_state(success=False, reason="route_complete")
        normalized = " ".join(transcript.strip().lower().split())
        command_cues = {
            "직진": ("직진", "앞으로", "곧장", "복도 끝", "계속 가"),
            "왼쪽": ("왼쪽", "좌회전", "서쪽"),
            "오른쪽": ("오른쪽", "우회전", "북쪽"),
        }
        matched = any(cue in normalized for cue in command_cues[expected])
        if not matched:
            return self.guidance_state(success=False, reason="wrong_direction")
        self.accepted_commands += 1
        return self.guidance_state(success=True)

    def guidance_state(self, *, success: bool, reason: str | None = None) -> dict:
        return {
            "success": success,
            "reason": reason,
            "accepted_commands": self.accepted_commands,
            "total_commands": len(self.route_commands),
            "expected_command": self.expected_command,
            "target_slot": self.current_target_slot,
            "route_completed": self.route_completed,
        }

    def activate_device(self, device: str) -> dict:
        """장치 활성화. device는 'A' 또는 'B'."""
        if device not in {"A", "B"}:
            return {"success": False, "reason": "invalid_device"}
        if not self.route_completed:
            return {
                "success": False,
                "reason": "guidance_incomplete",
                "accepted_commands": self.accepted_commands,
                "total_commands": len(self.route_commands),
            }
        now = time.time()
        self.attempts += 1

        if device == "A":
            self.device_a_activated_at = now
        elif device == "B":
            self.device_b_activated_at = now

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
    commanded_device_ids: set[str] = field(default_factory=set)

    def command_device(self, device_id: str, actor_id: str) -> dict:
        device = next((d for d in self.devices if d.device_id == device_id), None)
        if not device:
            return {"success": False, "reason": "unknown_device"}
        owner_by_device = {"panel": "partner", "valve": "partner-2"}
        owner_id = owner_by_device.get(device_id)
        if owner_id is None:
            return {"success": False, "reason": "human_operated", "device_id": device_id}
        status = self.get_device_status(device_id)
        if status is None or status["state"] != "standby":
            return {
                "success": False,
                "reason": "not_standby",
                "device_id": device_id,
                "state": status["state"] if status else "unknown",
            }
        self.commanded_device_ids.add(device_id)
        return {
            "success": True,
            "device_id": device_id,
            "device_name": device.name,
            "commanded_by": actor_id,
            "companion_id": owner_id,
        }

    def activate_device(self, device_id: str, actor_id: str) -> dict:
        device = next((d for d in self.devices if d.device_id == device_id), None)
        if not device:
            return {"success": False, "reason": "unknown_device"}
        if device.state == "active":
            return {"success": False, "reason": "already_active"}

        device.state = "active"
        device.activated_by = actor_id
        self.commanded_device_ids.discard(device_id)
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
        self.commanded_device_ids.clear()
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
    broadcast: BroadcastInferenceMission = field(default_factory=create_broadcast_inference_mission)
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
    route_commands = ["직진", "왼쪽", "오른쪽"]
    random.Random(effective_seed ^ 0x46314354).shuffle(route_commands)
    simultaneous = SimultaneousMission(route_commands=route_commands)
    basement = create_basement_mission(seed=effective_seed)
    return VerticalMissions(
        rooftop=RooftopSignalMission(sequence=rooftop_sequence),
        broadcast=create_broadcast_inference_mission(seed=effective_seed),
        intercom=intercom,
        simultaneous=simultaneous,
        basement=basement,
    )
