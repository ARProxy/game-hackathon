"""서버 권위 능동 술래의 감지, 기억, 목표 선택.

S3: 추격자(청각 특화) / 차단자(시야 특화) 역할 분화
S5: AI 발화 모드별 소리 핑 반경
"""

from __future__ import annotations

import json
import math
import time
from enum import Enum
from pathlib import Path
from typing import Any

from app.ai.speech import SPEECH_MODE_RADIUS, SpeechMode
from app.game.authority import (
    NAVIGATION_NODES_BY_FLOOR,
    WALL_RECTS_BY_FLOOR,
    has_clear_catch_line,
    next_navigation_waypoint,
    segment_intersects_rect,
)
from app.game.state import GamePhase, PlayerRole, PlayerStatus
from app.game.progression import VerticalRoundPhase


# ---------------------------------------------------------------------------
# S3: 술래 역할 (추격자 vs 차단자)
# ---------------------------------------------------------------------------

class SeekerRole(str, Enum):
    CHASER = "chaser"    # 청각 특화 — 소리 추적, 직접 추격
    BLOCKER = "blocker"  # 시야 특화 — 경로 차단, 발견→추격자에게 구역 공유

CONTRACT_PATH = Path(__file__).parents[3] / "client/src/game/hunterContract.json"
with CONTRACT_PATH.open(encoding="utf-8") as contract_file:
    CONTRACT = json.load(contract_file)

VERTICAL_PHASE_SPEED = {
    VerticalRoundPhase.ROOFTOP_INTRO: 0.0,
    VerticalRoundPhase.FLOOR_3: 0.9,
    VerticalRoundPhase.FLOOR_2: 1.05,
    VerticalRoundPhase.FLOOR_1: 1.2,
    VerticalRoundPhase.FIELD_FINAL: 1.3,
    VerticalRoundPhase.BASEMENT_FINAL: 1.3,
}


def vertical_threat_snapshot(session: Any, now: float | None = None) -> dict[str, float]:
    """층 진행·경과 시간·금기어 누적을 실제 술래 감각과 속도에 합성한다."""
    if not session.vertical_progression_enabled:
        return {"stage_speed_multiplier": 1.0, "hearing_multiplier": 1.0, "vision_multiplier": 1.0}
    checked_at = time.time() if now is None else now
    started_at = session.state.started_at or checked_at
    time_tier = session.vertical_round.time_escalation_tier(checked_at - started_at)
    rage = session.vertical_round.forbidden_rage_policy
    return {
        "stage_speed_multiplier": round(
            VERTICAL_PHASE_SPEED.get(session.vertical_round.phase, 1.0)
            * (1.0 + time_tier * 0.08) * rage.speed_multiplier,
            4,
        ),
        "hearing_multiplier": 1.25 if rage.hearing_expanded else 1.0,
        "vision_multiplier": 1.2 if rage.vision_expanded else 1.0,
    }


def director_snapshot(session: Any, now: float | None = None) -> dict[str, float]:
    """진행도와 위기 상태로 공정한 범위 안의 술래 압박을 계산한다."""
    director = CONTRACT["director"]
    checked_at = time.time() if now is None else now
    started_at = session.state.started_at or checked_at
    elapsed_factor = min(1.0, max(0.0, checked_at - started_at) / director["targetRoundSeconds"])
    mission_total = len(session.round_data.missions) if session.round_data else 3
    progress_factor = min(1.0, session.current_mission_index / max(1, mission_total))
    phase_pressure = 0.3 if session.state.phase == GamePhase.ESCAPE else (
        0.12 if session.state.phase == GamePhase.FINAL_SPELL else 0.0
    )
    frozen_count = sum(
        player.status == PlayerStatus.FROZEN
        for player in session.state.players.values()
        if player.role != PlayerRole.SEEKER
    )
    tension = min(1.0, max(
        0.05,
        0.12 + elapsed_factor * 0.28 + progress_factor * 0.32
        + phase_pressure - frozen_count * director["frozenRelief"],
    ))
    multiplier = director["minSpeedMultiplier"] + (
        director["maxSpeedMultiplier"] - director["minSpeedMultiplier"]
    ) * tension
    return {
        "director_tension": round(tension, 4),
        "speed_multiplier": round(multiplier, 4),
    }


def record_hunter_signal(
    session: Any,
    player_id: str,
    position: dict,
    strength: str,
    speech_mode: SpeechMode | None = None,
) -> bool:
    """소리 핑을 술래에게 전달한다. speech_mode가 주어지면 모드별 반경을 사용한다."""
    # S5: 발화 모드별 반경 결정
    if speech_mode == SpeechMode.SILENT:
        return False  # 침묵 모드는 소리 핑 없음

    source = session.state.get_player(player_id)

    # 모든 술래(주 + 협공)에게 신호를 전달한다
    delivered = False
    for seeker in session.state.players.values():
        if seeker.role != PlayerRole.SEEKER or seeker.status != PlayerStatus.ALIVE:
            continue

        if (
            strength in {"speech", "ai_action", "ai_speech"}
            and source is not None
            and not source.shares_floor_with(seeker)
        ):
            continue

        if strength in {"speech", "ai_action", "ai_speech"}:
            distance = math.hypot(
                float(position["x"]) - seeker.position.x,
                float(position["z"]) - seeker.position.z,
            )
            # S5: speech_mode가 있으면 모드별 반경, 없으면 기본 청각 반경
            if speech_mode is not None:
                effective_radius = SPEECH_MODE_RADIUS[speech_mode]
            else:
                effective_radius = CONTRACT["hearingDistance"]
            effective_radius *= vertical_threat_snapshot(session)["hearing_multiplier"]
            if distance > effective_radius:
                continue

        delivered = True
        # S3: 차단자가 발견하면 추격자에게 구역 수준 정보 공유
        # (hunter_signal은 주 술래 기준, secondary는 별도 처리)
        if seeker.player_id == "seeker":
            session.hunter_signal = {
                "player_id": player_id,
                "position": {"x": float(position["x"]), "z": float(position["z"])},
                "strength": strength,
                "speech_mode": speech_mode.value if speech_mode else None,
                "timestamp": time.monotonic(),
            }
        elif seeker.player_id == "seeker-2":
            session.secondary_hunter_signal = {
                "player_id": player_id,
                "position": {"x": float(position["x"]), "z": float(position["z"])},
                "strength": strength,
                "timestamp": time.monotonic(),
            }

    return delivered


def decide_hunter_intent(session: Any) -> dict:
    seeker = next(
        (player for player in session.state.players.values() if player.role == PlayerRole.SEEKER),
        None,
    )
    if seeker is None:
        return {"state": "HUNT", "target_id": None, "target": {"x": 0.0, "z": 0.0}, "reason": "no_seeker"}

    if session.state.phase == GamePhase.ESCAPE and session.active_gate_id:
        if (
            session.vertical_progression_enabled
            and session.vertical_round.phase == VerticalRoundPhase.ESCAPE_OPEN
        ):
            from app.game.vertical_flow import final_escape_position
            gate_x, _, gate_z = final_escape_position(session)
            gate = {"x": gate_x, "z": gate_z}
        else:
            gate = session.active_gate_payload()["position"]
        return {"state": "RUSH_GATE", "target_id": None, "target": gate, "reason": "gate_open"}

    forward_x = session.hunter_forward["x"]
    forward_z = session.hunter_forward["z"]
    forward_length = math.hypot(forward_x, forward_z)
    if forward_length < 0.01:
        forward_x, forward_z = 0.0, 1.0
    else:
        forward_x, forward_z = forward_x / forward_length, forward_z / forward_length

    now = time.monotonic()
    vision_distance = CONTRACT["visionDistance"] * vertical_threat_snapshot(session)["vision_multiplier"]
    visible: list[tuple[float, Any]] = []
    for runner in session.state.players.values():
        if runner.role == PlayerRole.SEEKER or runner.status in {
            PlayerStatus.ELIMINATED, PlayerStatus.ESCAPED,
        }:
            continue
        if not runner.shares_floor_with(seeker):
            continue
        dx = runner.position.x - seeker.position.x
        dz = runner.position.z - seeker.position.z
        distance = math.hypot(dx, dz)
        if distance > vision_distance or distance <= 0:
            continue
        if not has_clear_catch_line(
            (seeker.position.x, seeker.position.z),
            (runner.position.x, runner.position.z),
            seeker.position.floor.value,
        ):
            continue
        dot = (dx / distance) * forward_x + (dz / distance) * forward_z
        in_cone = dot >= math.cos(math.radians(CONTRACT["visionAngleDegrees"] / 2))
        if distance <= CONTRACT["proximityDetectionDistance"] or in_cone:
            frozen_bonus = 3.0 if runner.status == PlayerStatus.FROZEN else 0.0
            signal_bonus = 2.0 if (
                session.hunter_signal
                and now - session.hunter_signal["timestamp"] <= CONTRACT["memorySeconds"]
                and session.hunter_signal["player_id"] == runner.player_id
            ) else 0.0
            gate_bonus = 0.0
            if session.active_gate_id:
                gate = session.active_gate_payload()["position"]
                gate_bonus = max(0.0, 2.0 - math.hypot(runner.position.x - gate["x"], runner.position.z - gate["z"]) / 10.0)
            teammates = [candidate for candidate in session.state.players.values() if candidate.role != PlayerRole.SEEKER and candidate.player_id != runner.player_id and candidate.status == PlayerStatus.ALIVE]
            isolation_bonus = min(2.0, min((math.hypot(runner.position.x - mate.position.x, runner.position.z - mate.position.z) for mate in teammates), default=20.0) / 10.0)
            threat = 12.0 - distance + frozen_bonus + signal_bonus + gate_bonus + isolation_bonus
            visible.append((-threat, runner))

    if visible:
        _, target = min(visible, key=lambda candidate: candidate[0])
        previous_id = session.hunter_last_seen.get("player_id") if session.hunter_last_seen else None
        session.hunter_last_seen = {
            "player_id": target.player_id,
            "position": {"x": target.position.x, "z": target.position.z},
            "timestamp": now,
        }
        return {
            "state": "CHASE" if previous_id == target.player_id else "DETECTED",
            "target_id": target.player_id,
            "target": {"x": target.position.x, "z": target.position.z},
            "reason": "visual",
        }

    signal = session.hunter_signal
    if signal and now - signal["timestamp"] <= CONTRACT["memorySeconds"]:
        return {
            "state": "INVESTIGATE",
            "target_id": signal["player_id"],
            "target": signal["position"],
            "reason": signal["strength"],
        }

    last_seen = session.hunter_last_seen
    if last_seen and now - last_seen["timestamp"] <= CONTRACT["memorySeconds"]:
        return {
            "state": "SEARCH",
            "target_id": last_seen["player_id"],
            "target": last_seen["position"],
            "reason": "lost_visual",
        }

    hunt_targets = []
    mission = session.current_mission()
    if mission:
        hunt_targets = [prop.position for prop in [mission.real_prop, *mission.decoy_props]]
    if not hunt_targets:
        floor_nodes = NAVIGATION_NODES_BY_FLOOR.get(seeker.position.floor.value, ())
        hunt_targets = [
            {"x": node["position"][0], "z": node["position"][1]}
            for node in floor_nodes
        ] or [
            {"x": -38.0, "z": -38.0}, {"x": -24.0, "z": -38.0},
            {"x": -10.0, "z": -28.0}, {"x": -24.0, "z": -18.0},
        ]
    index = int(now / 8.0) % len(hunt_targets)
    return {
        "state": "HUNT",
        "target_id": None,
        "target": hunt_targets[index],
        "reason": "probable_mission_zone",
    }


def advance_hunter(session: Any) -> dict:
    """서버 시간과 의도만으로 술래 위치를 전진시킨다."""
    from app.game.authority import MovementSample

    now = time.monotonic()
    elapsed = now - session.hunter_last_tick
    minimum_interval = float(CONTRACT["thinkIntervalSeconds"]) * 0.6
    seeker = session.state.get_player("seeker")
    if elapsed < minimum_interval and session.hunter_last_intent:
        return {**session.hunter_last_intent, "seeker_position": {"x": seeker.position.x, "z": seeker.position.z}}

    intent = {
        **decide_hunter_intent(session),
        **director_snapshot(session),
        **vertical_threat_snapshot(session),
    }
    dx = intent["target"]["x"] - seeker.position.x
    dz = intent["target"]["z"] - seeker.position.z
    distance = math.hypot(dx, dz)
    speed_key = {
        "HUNT": "huntSpeed", "INVESTIGATE": "investigateSpeed",
        "DETECTED": None, "CHASE": "chaseSpeed", "SEARCH": "huntSpeed",
        "RUSH_GATE": "rushSpeed",
    }[intent["state"]]
    if distance > 0.01:
        session.hunter_forward = {"x": dx / distance, "z": dz / distance}
        if speed_key:
            step = min(
                float(CONTRACT[speed_key]) * intent["speed_multiplier"]
                * intent["stage_speed_multiplier"] * min(elapsed, 0.5),
                max(0.0, distance - 0.5),
            )
            next_x, next_z = _safe_hunter_step(
                seeker.position.x, seeker.position.z,
                intent["target"]["x"], intent["target"]["z"], step,
                seeker.position.floor.value,
            )
            seeker.position.x, seeker.position.z = next_x, next_z
            session.position_samples[seeker.player_id] = MovementSample(seeker.position.x, seeker.position.z, now)
    session.hunter_last_tick = now
    session.hunter_last_intent = intent
    return {**intent, "role": SeekerRole.CHASER.value, "seeker_position": {"x": seeker.position.x, "z": seeker.position.z}}


def _decide_blocker_intent(session: Any, primary_intent: dict) -> dict:
    """S3: 차단자(시야 특화) 목표 선택.

    - 시야 감지 우선: 넓은 시야각(140도)으로 순찰하며 시각 발견
    - 발견 시 추격자에게 구역 수준 정보 공유 (직접 좌표 아님)
    - 직접 추격보다 계단·미션실·구조 경로의 퇴로 차단
    - 얼어 있는 도망자 주변을 제한 시간 동안 경계
    """
    seeker = session.state.get_player("seeker-2")
    if not seeker:
        return {"state": "HUNT", "target_id": None, "target": {"x": 0, "z": 0}, "reason": "no_blocker"}

    now = time.monotonic()
    threat = vertical_threat_snapshot(session)
    vision_distance = CONTRACT["visionDistance"] * threat["vision_multiplier"] * 1.15  # 차단자 시야 보너스
    blocker_vision_angle = 140  # 추격자(100도)보다 넓은 시야

    # 차단자의 전방 벡터 (별도 관리)
    fwd = getattr(session, "blocker_forward", {"x": 0.0, "z": -1.0})
    fwd_len = math.hypot(fwd["x"], fwd["z"])
    if fwd_len < 0.01:
        fwd = {"x": 0.0, "z": -1.0}
        fwd_len = 1.0
    fwd_x, fwd_z = fwd["x"] / fwd_len, fwd["z"] / fwd_len

    # 시야로 발견한 도망자
    spotted: list[tuple[float, Any]] = []
    for runner in session.state.players.values():
        if runner.role == PlayerRole.SEEKER or runner.status in {
            PlayerStatus.ELIMINATED, PlayerStatus.ESCAPED,
        }:
            continue
        if not runner.shares_floor_with(seeker):
            continue
        dx = runner.position.x - seeker.position.x
        dz = runner.position.z - seeker.position.z
        dist = math.hypot(dx, dz)
        if dist > vision_distance or dist <= 0:
            continue
        if not has_clear_catch_line(
            (seeker.position.x, seeker.position.z),
            (runner.position.x, runner.position.z),
            seeker.position.floor.value,
        ):
            continue
        dot = (dx / dist) * fwd_x + (dz / dist) * fwd_z
        if dot >= math.cos(math.radians(blocker_vision_angle / 2)):
            frozen_bonus = 4.0 if runner.status == PlayerStatus.FROZEN else 0.0
            spotted.append((-frozen_bonus - (12.0 - dist), runner))

    if spotted:
        _, target = min(spotted, key=lambda c: c[0])
        # S3: 차단자가 발견하면 추격자에게 구역 수준 정보 공유
        session.blocker_zone_share = {
            "player_id": target.player_id,
            "zone": target.position.zone,
            "floor": target.position.floor.value,
            "shared_at": now,
        }
        # 차단자는 직접 추격 대신 퇴로를 차단한다
        # 목표의 반대편(추격자 기준)으로 이동해 협공
        chaser = session.state.get_player("seeker")
        if chaser and chaser.status == PlayerStatus.ALIVE:
            # 목표에서 추격자 반대 방향으로 오프셋
            cx = target.position.x - chaser.position.x
            cz = target.position.z - chaser.position.z
            cl = max(0.01, math.hypot(cx, cz))
            flank_x = target.position.x + (cx / cl) * 3.0
            flank_z = target.position.z + (cz / cl) * 3.0
        else:
            flank_x, flank_z = target.position.x, target.position.z
        return {
            "state": "BLOCK",
            "target_id": target.player_id,
            "target": {"x": flank_x, "z": flank_z},
            "reason": "visual_block",
            "role": SeekerRole.BLOCKER.value,
        }

    # 빙결된 도망자 근처 경계 (캠핑 방지: 최대 8초)
    frozen_runners = [
        p for p in session.state.players.values()
        if p.role != PlayerRole.SEEKER and p.status == PlayerStatus.FROZEN
        and p.shares_floor_with(seeker)
    ]
    if frozen_runners:
        closest = min(frozen_runners, key=lambda p: math.hypot(
            p.position.x - seeker.position.x, p.position.z - seeker.position.z
        ))
        guard_start = getattr(session, "blocker_guard_start", 0.0)
        if now - guard_start < 8.0:
            return {
                "state": "GUARD",
                "target_id": closest.player_id,
                "target": {"x": closest.position.x + 2.0, "z": closest.position.z},
                "reason": "frozen_guard",
                "role": SeekerRole.BLOCKER.value,
            }

    if (
        session.state.phase == GamePhase.ESCAPE
        and session.vertical_progression_enabled
        and session.vertical_round.phase == VerticalRoundPhase.ESCAPE_OPEN
    ):
        from app.game.vertical_flow import final_escape_position
        gate_x, _, gate_z = final_escape_position(session)
        return {
            "state": "BLOCK",
            "target_id": None,
            "target": {"x": gate_x, "z": gate_z - 3.0},
            "reason": "final_exit_blockade",
            "role": SeekerRole.BLOCKER.value,
        }

    # 추격자와 같은 목표를 추격하지 않도록 다른 구역 순찰
    primary_target = primary_intent.get("target", {"x": 0, "z": 0})
    # 추격자 목표의 반대편 구역 순찰
    patrol_x = -primary_target["x"] * 0.5
    patrol_z = -primary_target["z"] * 0.5
    return {
        "state": "PATROL",
        "target_id": None,
        "target": {"x": patrol_x, "z": patrol_z},
        "reason": "area_patrol",
        "role": SeekerRole.BLOCKER.value,
    }


def advance_secondary_hunter(session: Any, primary_intent: dict) -> dict | None:
    """S3: 1층부터 활성화되는 차단자(시야 특화) 술래."""
    if session.vertical_round.policy.seeker_count < 2:
        return None
    from app.game.authority import MovementSample

    seeker = session.state.get_player("seeker-2")
    if seeker is None:
        return None

    # secondary_hunter_signal 초기화
    if not hasattr(session, "secondary_hunter_signal"):
        session.secondary_hunter_signal = None
    if not hasattr(session, "blocker_forward"):
        session.blocker_forward = {"x": 0.0, "z": -1.0}
    if not hasattr(session, "blocker_zone_share"):
        session.blocker_zone_share = None
    if not hasattr(session, "blocker_guard_start"):
        session.blocker_guard_start = 0.0

    now = time.monotonic()
    elapsed = float(CONTRACT["thinkIntervalSeconds"])
    intent = _decide_blocker_intent(session, primary_intent)

    # 차단자는 추격자보다 느리다 (0.85배)
    speed_mult = primary_intent.get("speed_multiplier", 1.0)
    stage_mult = primary_intent.get("stage_speed_multiplier", 1.0)
    blocker_speed_factor = 0.85

    dx = intent["target"]["x"] - seeker.position.x
    dz = intent["target"]["z"] - seeker.position.z
    distance = math.hypot(dx, dz)
    if distance > 0.5:
        session.blocker_forward = {"x": dx / distance, "z": dz / distance}
        speed_key = "chaseSpeed" if intent["state"] in {"BLOCK", "GUARD"} else "huntSpeed"
        step = min(
            CONTRACT[speed_key] * speed_mult * stage_mult * blocker_speed_factor * elapsed,
            distance - 0.5,
        )
        seeker.position.x, seeker.position.z = _safe_hunter_step(
            seeker.position.x, seeker.position.z,
            intent["target"]["x"], intent["target"]["z"], step,
            seeker.position.floor.value,
        )
        session.position_samples[seeker.player_id] = MovementSample(
            seeker.position.x, seeker.position.z, now,
        )

    # S3: 차단자가 구역 정보를 공유했으면 추격자 신호에 반영
    zone_share = getattr(session, "blocker_zone_share", None)
    if zone_share and now - zone_share.get("shared_at", 0) < 5.0:
        # 추격자에게 구역 수준(정확한 좌표 아님) 힌트 전달
        if session.hunter_signal is None or (
            now - session.hunter_signal.get("timestamp", 0) > 3.0
        ):
            session.hunter_signal = {
                "player_id": zone_share["player_id"],
                "position": intent["target"],  # 구역 중심점 (정확한 좌표 아님)
                "strength": "blocker_share",
                "timestamp": now,
            }

    return {
        **intent,
        "seeker_position": {"x": seeker.position.x, "z": seeker.position.z},
        "speed_multiplier": speed_mult,
        "stage_speed_multiplier": stage_mult,
    }


def hunter_snapshot(session: Any) -> dict:
    seeker = session.state.get_player("seeker")
    intent = session.hunter_last_intent or {
        **decide_hunter_intent(session), **director_snapshot(session),
        **vertical_threat_snapshot(session),
    }
    return {**intent, "role": SeekerRole.CHASER.value, "seeker_position": {"x": seeker.position.x, "z": seeker.position.z}}


def _safe_hunter_step(
    x: float, z: float, target_x: float, target_z: float, step: float, floor: str = "F1",
) -> tuple[float, float]:
    """서버 벽 계약을 넘지 않으며 목표 쪽 또는 벽의 측면으로 한 걸음 이동한다."""
    target_x, target_z = next_navigation_waypoint(
        (x, z), (target_x, target_z), floor,
    )
    distance = math.hypot(target_x - x, target_z - z)
    if distance <= 0 or step <= 0:
        return x, z
    nx, nz = (target_x - x) / distance, (target_z - z) / distance
    direct = (x + nx * step, z + nz * step)
    if has_clear_catch_line((x, z), direct, floor):
        return direct

    # 목표 벡터의 단순 수직 방향은 목표 주위를 원으로 돌 수 있다. 충돌한 벽의
    # 긴 축을 따라 가까운 끝점으로 이동해야 여러 틱 뒤 실제로 우회할 수 있다.
    blocking_wall = next(
        (wall for wall in WALL_RECTS_BY_FLOOR.get(floor, ()) if segment_intersects_rect((x, z), direct, wall)),
        None,
    )
    if blocking_wall is None:
        return x, z
    cx, cz, sx, sz = blocking_wall
    if sx >= sz:
        preferred = (x - step, z) if x <= cx else (x + step, z)
        candidates = [preferred, (2 * x - preferred[0], z)]
    else:
        preferred = (x, z - step) if z <= cz else (x, z + step)
        candidates = [preferred, (x, 2 * z - preferred[1])]
    valid = [
        candidate for candidate in candidates
        if math.hypot(candidate[0] - x, candidate[1] - z) > 1e-6
        and has_clear_catch_line((x, z), candidate, floor)
    ]
    if not valid:
        return x, z
    return next((candidate for candidate in candidates if candidate in valid), valid[0])
