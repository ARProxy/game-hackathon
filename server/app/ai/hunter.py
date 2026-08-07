"""서버 권위 능동 술래의 감지, 기억, 목표 선택."""

from __future__ import annotations

import json
import math
import time
from pathlib import Path
from typing import Any

from app.game.authority import WALL_RECTS_BY_FLOOR, has_clear_catch_line, segment_intersects_rect
from app.game.state import GamePhase, PlayerRole, PlayerStatus
from app.game.progression import VerticalRoundPhase

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


def record_hunter_signal(session: Any, player_id: str, position: dict, strength: str) -> bool:
    seeker = next(
        (player for player in session.state.players.values() if player.role == PlayerRole.SEEKER),
        None,
    )
    source = session.state.get_player(player_id)
    if (
        strength in {"speech", "ai_action"}
        and seeker is not None
        and source is not None
        and not source.shares_floor_with(seeker)
    ):
        return False
    if strength in {"speech", "ai_action"} and seeker is not None:
        distance = math.hypot(
            float(position["x"]) - seeker.position.x,
            float(position["z"]) - seeker.position.z,
        )
        hearing_distance = CONTRACT["hearingDistance"] * vertical_threat_snapshot(session)["hearing_multiplier"]
        if distance > hearing_distance:
            return False
    session.hunter_signal = {
        "player_id": player_id,
        "position": {"x": float(position["x"]), "z": float(position["z"])},
        "strength": strength,
        "timestamp": time.monotonic(),
    }
    return True


def decide_hunter_intent(session: Any) -> dict:
    seeker = next(
        (player for player in session.state.players.values() if player.role == PlayerRole.SEEKER),
        None,
    )
    if seeker is None:
        return {"state": "HUNT", "target_id": None, "target": {"x": 0.0, "z": 0.0}, "reason": "no_seeker"}

    if session.state.phase == GamePhase.ESCAPE and session.active_gate_id:
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
        hunt_targets = [
            {"x": -9.0, "z": -5.0}, {"x": 6.0, "z": -6.0},
            {"x": -6.0, "z": 6.0}, {"x": 6.0, "z": 6.0},
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
    return {**intent, "seeker_position": {"x": seeker.position.x, "z": seeker.position.z}}


def advance_secondary_hunter(session: Any, primary_intent: dict) -> dict | None:
    """1층부터 반대 각도로 목표를 압박하는 두 번째 서버 권위 술래."""
    if session.vertical_round.policy.seeker_count < 2:
        return None
    from app.game.authority import MovementSample

    seeker = session.state.get_player("seeker-2")
    if seeker is None:
        return None
    now = time.monotonic()
    elapsed = float(CONTRACT["thinkIntervalSeconds"])
    target = primary_intent["target"]
    # 같은 점으로 포개지지 않고 목표의 반대 측면을 조이는 협공 오프셋.
    flank = {"x": target["x"] - 2.4, "z": target["z"] + 2.4}
    dx, dz = flank["x"] - seeker.position.x, flank["z"] - seeker.position.z
    distance = math.hypot(dx, dz)
    if distance > 0.5:
        step = min(
            CONTRACT["chaseSpeed"] * primary_intent["speed_multiplier"]
            * primary_intent["stage_speed_multiplier"] * elapsed,
            distance - 0.5,
        )
        seeker.position.x, seeker.position.z = _safe_hunter_step(
            seeker.position.x, seeker.position.z, flank["x"], flank["z"], step,
            seeker.position.floor.value,
        )
        session.position_samples[seeker.player_id] = MovementSample(
            seeker.position.x, seeker.position.z, now,
        )
    return {
        "state": "CHASE" if primary_intent.get("target_id") else "HUNT",
        "target_id": primary_intent.get("target_id"),
        "target": flank,
        "seeker_position": {"x": seeker.position.x, "z": seeker.position.z},
        "reason": "pincer_flank",
        "speed_multiplier": primary_intent["speed_multiplier"],
        "stage_speed_multiplier": primary_intent["stage_speed_multiplier"],
    }


def hunter_snapshot(session: Any) -> dict:
    seeker = session.state.get_player("seeker")
    intent = session.hunter_last_intent or {
        **decide_hunter_intent(session), **director_snapshot(session),
        **vertical_threat_snapshot(session),
    }
    return {**intent, "seeker_position": {"x": seeker.position.x, "z": seeker.position.z}}


def _safe_hunter_step(
    x: float, z: float, target_x: float, target_z: float, step: float, floor: str = "F1",
) -> tuple[float, float]:
    """서버 벽 계약을 넘지 않으며 목표 쪽 또는 벽의 측면으로 한 걸음 이동한다."""
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
