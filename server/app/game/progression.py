"""기획 4의 수직 라운드 진행과 술래 난도에 대한 순수 상태 계약.

아직 기존 ``GamePhase`` 흐름에 연결하지 않는다. 맵과 actor가 층 좌표를 갖기 전에도
전이 규칙을 독립적으로 검증하고, 이후 ``GameSession``이 이 계약을 소유하도록 한다.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class VerticalRoundPhase(str, Enum):
    ROOFTOP_INTRO = "rooftop_intro"
    FLOOR_3 = "floor_3"
    FLOOR_2 = "floor_2"
    FLOOR_1 = "floor_1"
    FINAL_ROUTE_REVEAL = "final_route_reveal"
    FIELD_FINAL = "field_final"
    BASEMENT_FINAL = "basement_final"
    ESCAPE_OPEN = "escape_open"
    VICTORY = "victory"
    PARTIAL_RESULT = "partial_result"
    DEFEAT = "defeat"


class WorldFloor(str, Enum):
    ROOF = "ROOF"
    F3 = "F3"
    F2 = "F2"
    F1 = "F1"
    FIELD = "FIELD"
    B1 = "B1"


class FinalRoute(str, Enum):
    FIELD = "field"
    BASEMENT = "basement"


class SeekerThreat(str, Enum):
    INACTIVE = "inactive"
    OMEN = "omen"
    LIMITED_HUNT = "limited_hunt"
    FULL_HUNT = "full_hunt"
    PINCER = "pincer"
    ENRAGED = "enraged"


class ForbiddenRageTier(str, Enum):
    CALM = "calm"
    WARNING = "warning"
    ENRAGED = "enraged"
    EXTREME = "extreme"


@dataclass(frozen=True)
class ForbiddenRagePolicy:
    tier: ForbiddenRageTier
    minimum_violations: int
    speed_multiplier: float
    hearing_expanded: bool = False
    vision_expanded: bool = False
    recent_position_sense: bool = False


FORBIDDEN_RAGE_POLICIES: tuple[ForbiddenRagePolicy, ...] = (
    ForbiddenRagePolicy(ForbiddenRageTier.CALM, 0, 1.0),
    ForbiddenRagePolicy(ForbiddenRageTier.WARNING, 3, 1.1),
    ForbiddenRagePolicy(
        ForbiddenRageTier.ENRAGED, 5, 1.25, hearing_expanded=True,
    ),
    ForbiddenRagePolicy(
        ForbiddenRageTier.EXTREME,
        7,
        1.35,
        hearing_expanded=True,
        vision_expanded=True,
        recent_position_sense=True,
    ),
)


@dataclass(frozen=True)
class PhasePolicy:
    active_floor: WorldFloor | None
    accessible_floors: tuple[WorldFloor, ...]
    seeker_count: int
    seeker_threat: SeekerThreat
    time_escalation_enabled: bool
    mission_required_to_advance: bool


PHASE_POLICIES: dict[VerticalRoundPhase, PhasePolicy] = {
    VerticalRoundPhase.ROOFTOP_INTRO: PhasePolicy(
        WorldFloor.ROOF, (WorldFloor.ROOF,), 0, SeekerThreat.INACTIVE, True, True,
    ),
    VerticalRoundPhase.FLOOR_3: PhasePolicy(
        WorldFloor.F3, (WorldFloor.ROOF, WorldFloor.F3), 1, SeekerThreat.OMEN, True, True,
    ),
    VerticalRoundPhase.FLOOR_2: PhasePolicy(
        WorldFloor.F2, (WorldFloor.F3, WorldFloor.F2), 1, SeekerThreat.FULL_HUNT, True, True,
    ),
    VerticalRoundPhase.FLOOR_1: PhasePolicy(
        WorldFloor.F1, (WorldFloor.F2, WorldFloor.F1), 2, SeekerThreat.PINCER, True, True,
    ),
    VerticalRoundPhase.FINAL_ROUTE_REVEAL: PhasePolicy(
        WorldFloor.F1, (WorldFloor.F1,), 2, SeekerThreat.PINCER, True, False,
    ),
    VerticalRoundPhase.FIELD_FINAL: PhasePolicy(
        WorldFloor.FIELD, (WorldFloor.F1, WorldFloor.FIELD), 2, SeekerThreat.ENRAGED, False, True,
    ),
    VerticalRoundPhase.BASEMENT_FINAL: PhasePolicy(
        WorldFloor.B1, (WorldFloor.F1, WorldFloor.B1), 2, SeekerThreat.ENRAGED, False, True,
    ),
    VerticalRoundPhase.ESCAPE_OPEN: PhasePolicy(
        None, (), 2, SeekerThreat.ENRAGED, False, False,
    ),
    VerticalRoundPhase.VICTORY: PhasePolicy(None, (), 0, SeekerThreat.INACTIVE, False, False),
    VerticalRoundPhase.PARTIAL_RESULT: PhasePolicy(None, (), 0, SeekerThreat.INACTIVE, False, False),
    VerticalRoundPhase.DEFEAT: PhasePolicy(None, (), 0, SeekerThreat.INACTIVE, False, False),
}


class InvalidProgression(ValueError):
    """서버가 허용하지 않는 라운드 전이를 요청했을 때 발생한다."""


@dataclass
class VerticalRoundState:
    phase: VerticalRoundPhase = VerticalRoundPhase.ROOFTOP_INTRO
    mission_complete: bool = False
    final_route: FinalRoute | None = None
    forbidden_word_violations: int = 0
    final_rage_policy: ForbiddenRagePolicy | None = None
    closing_pending_floor: WorldFloor | None = None
    closed_floors: set[WorldFloor] = field(default_factory=set)

    @property
    def policy(self) -> PhasePolicy:
        return PHASE_POLICIES[self.phase]

    @property
    def accessible_floors(self) -> tuple[WorldFloor, ...]:
        """현재 정책에서 안전 검사가 끝나 실제로 열려 있는 층만 반환한다."""
        return tuple(
            floor for floor in self.policy.accessible_floors
            if floor not in self.closed_floors
        )

    def close_pending_floor(self) -> WorldFloor | None:
        """폐쇄 대기 중인 층을 닫고, 실제로 닫힌 층을 반환한다."""
        floor = self.closing_pending_floor
        if floor is None:
            return None
        self.closed_floors.add(floor)
        self.closing_pending_floor = None
        return floor

    def mark_mission_complete(self) -> None:
        if not self.policy.mission_required_to_advance:
            raise InvalidProgression(f"{self.phase.value}에는 완료할 필수 미션이 없다")
        self.mission_complete = True

    @property
    def forbidden_rage_policy(self) -> ForbiddenRagePolicy:
        if self.final_rage_policy is not None:
            return self.final_rage_policy
        return next(
            policy
            for policy in reversed(FORBIDDEN_RAGE_POLICIES)
            if self.forbidden_word_violations >= policy.minimum_violations
        )

    def record_human_forbidden_word_violation(self) -> ForbiddenRagePolicy:
        """인간의 금기어 위반만 누적한다. 파이널에서는 난도만 고정한다."""
        self.forbidden_word_violations += 1
        return self.forbidden_rage_policy

    def advance(self, *, final_route: FinalRoute | None = None) -> VerticalRoundPhase:
        if self.policy.mission_required_to_advance and not self.mission_complete:
            raise InvalidProgression("현재 구간의 필수 미션을 먼저 완료해야 한다")

        if self.phase == VerticalRoundPhase.ROOFTOP_INTRO:
            next_phase = VerticalRoundPhase.FLOOR_3
        elif self.phase == VerticalRoundPhase.FLOOR_3:
            next_phase = VerticalRoundPhase.FLOOR_2
        elif self.phase == VerticalRoundPhase.FLOOR_2:
            next_phase = VerticalRoundPhase.FLOOR_1
        elif self.phase == VerticalRoundPhase.FLOOR_1:
            next_phase = VerticalRoundPhase.FINAL_ROUTE_REVEAL
        elif self.phase == VerticalRoundPhase.FINAL_ROUTE_REVEAL:
            if final_route is None:
                raise InvalidProgression("파이널 경로를 선택해야 한다")
            self.final_route = final_route
            self.final_rage_policy = self.forbidden_rage_policy
            next_phase = (
                VerticalRoundPhase.FIELD_FINAL
                if final_route == FinalRoute.FIELD
                else VerticalRoundPhase.BASEMENT_FINAL
            )
        elif self.phase in {VerticalRoundPhase.FIELD_FINAL, VerticalRoundPhase.BASEMENT_FINAL}:
            next_phase = VerticalRoundPhase.ESCAPE_OPEN
        elif self.phase == VerticalRoundPhase.ESCAPE_OPEN:
            next_phase = VerticalRoundPhase.VICTORY
        else:
            raise InvalidProgression(f"종료 상태 {self.phase.value}에서는 진행할 수 없다")

        if self.closing_pending_floor not in PHASE_POLICIES[next_phase].accessible_floors:
            self.close_pending_floor()
        self.phase = next_phase
        if self.phase == VerticalRoundPhase.FLOOR_3 and WorldFloor.ROOF not in self.closed_floors:
            self.closing_pending_floor = WorldFloor.ROOF
        self.mission_complete = False
        return self.phase

    def finish(self, result: VerticalRoundPhase) -> None:
        if result not in {
            VerticalRoundPhase.VICTORY,
            VerticalRoundPhase.PARTIAL_RESULT,
            VerticalRoundPhase.DEFEAT,
        }:
            raise InvalidProgression("결과 상태만 지정할 수 있다")
        self.phase = result
        self.mission_complete = False

    def time_escalation_tier(self, elapsed_seconds: float) -> int:
        """4분 간격의 임시 강화 단계. 파이널에서는 진입 시점 난도로 고정한다."""
        if not self.policy.time_escalation_enabled:
            return 0
        return min(3, max(0, int(elapsed_seconds // 240)))

    def to_dict(self) -> dict:
        policy = self.policy
        return {
            "phase": self.phase.value,
            "mission_complete": self.mission_complete,
            "final_route": self.final_route.value if self.final_route else None,
            "active_floor": policy.active_floor.value if policy.active_floor else None,
            "accessible_floors": [floor.value for floor in self.accessible_floors],
            "closing_pending_floor": (
                self.closing_pending_floor.value if self.closing_pending_floor else None
            ),
            "seeker_count": policy.seeker_count,
            "seeker_threat": policy.seeker_threat.value,
            "time_escalation_enabled": policy.time_escalation_enabled,
            "forbidden_word_violations": self.forbidden_word_violations,
            "fw_rage_tier": self.forbidden_rage_policy.tier.value,
            "fw_speed_multiplier": self.forbidden_rage_policy.speed_multiplier,
        }
