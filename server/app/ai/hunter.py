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
    blocking_closed_door,
    has_clear_catch_line,
    has_clear_hunter_line,
    next_navigation_waypoint,
    segment_intersects_rect,
)
from app.game.state import GamePhase, PlayerRole, PlayerStatus
from app.game.progression import SeekerThreat, VerticalRoundPhase, WorldFloor
from app.game.map_slots import VERTICAL_MAP_CONTRACT


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
    VerticalRoundPhase.FINAL_ROUTE_REVEAL: 1.2,
    VerticalRoundPhase.FIELD_FINAL: 1.3,
    VerticalRoundPhase.BASEMENT_FINAL: 1.3,
    VerticalRoundPhase.ESCAPE_OPEN: 1.3,
}


def _hunter_floor_transition_plan(session: Any, seeker: Any) -> dict | None:
    """현재 층에서 목표 층까지의 첫 실제 계단·출입문 경로를 고른다."""
    desired_floor = session.vertical_round.policy.active_floor
    signal = session.hunter_signal if seeker.player_id == "seeker" else getattr(
        session, "secondary_hunter_signal", None,
    )
    if (
        signal and signal.get("floor")
        and time.monotonic() - signal.get("timestamp", 0) <= CONTRACT["memorySeconds"]
    ):
        try:
            signaled_floor = WorldFloor(signal["floor"])
        except ValueError:
            signaled_floor = None
        if signaled_floor in session.vertical_round.accessible_floors:
            desired_floor = signaled_floor
    if desired_floor is None or desired_floor == seeker.position.floor:
        return None

    edges: list[dict] = []
    for path_id, path in VERTICAL_MAP_CONTRACT.get("paths", {}).items():
        if path.get("kind") == "stair_path" and path.get("upperFloor") and path.get("lowerFloor"):
            first_floor, second_floor = path["upperFloor"], path["lowerFloor"]
            points = path.get("down", [])
        elif path.get("kind") == "door_path" and path.get("insideFloor") and path.get("outsideFloor"):
            first_floor, second_floor = path["insideFloor"], path["outsideFloor"]
            points = path.get("out", [])
        else:
            continue
        if len(points) < 2:
            continue
        edges.append({
            "path_id": path_id, "path": path,
            "first": first_floor, "second": second_floor, "points": points,
        })

    start, goal = seeker.position.floor.value, desired_floor.value
    # 같은 두 층을 잇는 서·동 계단이 있으면 현재 위치에서 가까운 입구를
    # 먼저 탐색한다. JSON 선언 순서 때문에 먼 계단으로 횡단하지 않게 한다.
    edges.sort(key=lambda edge: (
        math.hypot(
            seeker.position.x - float(
                edge["points"][0][0] if edge["first"] == start else edge["points"][-1][0]
            ),
            seeker.position.z - float(
                edge["points"][0][2] if edge["first"] == start else edge["points"][-1][2]
            ),
        )
        if start in {edge["first"], edge["second"]} else float("inf")
    ))
    queue: list[tuple[str, list[dict]]] = [(start, [])]
    visited = {start}
    selected_route: list[dict] | None = None
    while queue:
        floor, route = queue.pop(0)
        if floor == goal:
            selected_route = route
            break
        for edge in edges:
            neighbor = edge["second"] if edge["first"] == floor else (
                edge["first"] if edge["second"] == floor else None
            )
            if neighbor is None or neighbor in visited:
                continue
            visited.add(neighbor)
            queue.append((neighbor, [*route, edge]))
    candidates: list[dict] = []
    if selected_route:
        edge = selected_route[0]
        forward = edge["first"] == start
        authored = edge["points"] if forward else list(reversed(edge["points"]))
        destination_floor = edge["second"] if forward else edge["first"]
        first_y, last_y = float(authored[0][1]), float(authored[-1][1])
        direction = (
            "down" if first_y > last_y else "up" if first_y < last_y
            else "out" if forward else "in"
        )
        candidates.append({
            "path_id": edge["path_id"],
            "route": edge["path"].get("route", "west"),
            "traversal": "stairs" if edge["path"].get("kind") == "stair_path" else "door",
            "direction": direction,
            "duration": float(edge["path"].get("durationSeconds", 0.8)),
            "destination_floor": destination_floor,
            "entry": {"x": float(authored[0][0]), "y": first_y, "z": float(authored[0][2])},
            "exit": {"x": float(authored[-1][0]), "y": last_y, "z": float(authored[-1][2])},
        })

    floor_y = VERTICAL_MAP_CONTRACT.get("floorY", {})
    for slot in VERTICAL_MAP_CONTRACT.get("slots", {}).values():
        if slot.get("kind") != "elevator":
            continue
        served = set(slot.get("servedFloors", []))
        if start not in served or goal not in served:
            continue
        elevator_id = str(slot["elevatorId"])
        x, _, z = slot["position"]
        start_y, goal_y = float(floor_y[start]), float(floor_y[goal])
        duration = 1.2 + abs(goal_y - start_y) / 2.2
        candidates.append({
            "path_id": f"ELEVATOR_{elevator_id.upper()}",
            "route": "elevator",
            "traversal": "elevator",
            "elevator_id": elevator_id,
            "direction": "down" if start_y > goal_y else "up",
            "duration": round(duration, 3),
            "destination_floor": goal,
            "entry": {"x": float(x), "y": start_y, "z": float(z)},
            "exit": {"x": float(x), "y": goal_y, "z": float(z)},
        })
    if not candidates:
        return None
    return min(candidates, key=lambda plan: (
        math.hypot(
            seeker.position.x - plan["entry"]["x"],
            seeker.position.z - plan["entry"]["z"],
        ) + plan["duration"] * float(CONTRACT["huntSpeed"])
    ))


def effective_seeker_threat(session: Any) -> SeekerThreat:
    """진행 단계와 명확한 미션 사건을 합쳐 현재 실제 위협을 반환한다."""
    if not session.vertical_progression_enabled:
        return SeekerThreat.FULL_HUNT
    if session.vertical_round.phase == VerticalRoundPhase.FLOOR_3:
        return (
            SeekerThreat.LIMITED_HUNT
            if session.broadcast_mission_actor_id is not None
            else SeekerThreat.OMEN
        )
    return session.vertical_round.policy.seeker_threat


def seeker_can_capture(session: Any, seeker_id: str) -> bool:
    """활성 수와 위협 단계가 실제 포획을 허용하는지 서버에서 판정한다."""
    transit_until = getattr(session, "hunter_transit_until", {}).get(seeker_id, 0.0)
    if transit_until > time.monotonic():
        return False
    threat = effective_seeker_threat(session)
    if (
        threat == SeekerThreat.LIMITED_HUNT
        and getattr(session, "broadcast_hunt_grace_until", 0.0) > time.monotonic()
    ):
        return False
    if threat not in {
        SeekerThreat.LIMITED_HUNT,
        SeekerThreat.FULL_HUNT,
        SeekerThreat.PINCER,
        SeekerThreat.ENRAGED,
    }:
        return False
    required_count = 2 if seeker_id == "seeker-2" else 1
    return session.vertical_round.policy.seeker_count >= required_count


def vertical_threat_snapshot(session: Any, now: float | None = None) -> dict[str, float]:
    """층 진행·경과 시간·금기어 누적을 실제 술래 감각과 속도에 합성한다."""
    if not session.vertical_progression_enabled:
        return {"stage_speed_multiplier": 1.0, "hearing_multiplier": 1.0, "vision_multiplier": 1.0}
    checked_at = time.time() if now is None else now
    started_at = session.state.started_at or checked_at
    time_tier = session.vertical_round.time_escalation_tier(checked_at - started_at)
    rage = session.vertical_round.forbidden_rage_policy
    active_event = getattr(session, "active_world_event", None)
    blackout_active = bool(
        active_event
        and active_event.get("event_type") == "local_blackout"
        and float(active_event.get("ends_at", 0.0)) > time.monotonic()
    )
    return {
        "stage_speed_multiplier": round(
            VERTICAL_PHASE_SPEED.get(session.vertical_round.phase, 1.0)
            * (1.0 + time_tier * 0.08) * rage.speed_multiplier,
            4,
        ),
        "hearing_multiplier": (1.25 if rage.hearing_expanded else 1.0) * (1.3 if blackout_active else 1.0),
        "vision_multiplier": (1.2 if rage.vision_expanded else 1.0) * (0.62 if blackout_active else 1.0),
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
    floor_override: str | None = None,
) -> bool:
    """소리 핑을 술래에게 전달한다. speech_mode가 주어지면 모드별 반경을 사용한다."""
    # S5: 발화 모드별 반경 결정
    if speech_mode == SpeechMode.SILENT:
        return False  # 침묵 모드는 소리 핑 없음
    if effective_seeker_threat(session) in {SeekerThreat.INACTIVE, SeekerThreat.OMEN}:
        return False

    source = session.state.get_player(player_id)
    signal_timestamp = time.monotonic()
    if effective_seeker_threat(session) == SeekerThreat.LIMITED_HUNT:
        # 첫 방송을 유예 시간 안에 말해도 소리가 사라지지 않게 한다. 술래는
        # 안전 여유가 끝난 직후 그 발화 위치를 조사해 기획된 첫 추격을 만든다.
        signal_timestamp = max(
            signal_timestamp,
            getattr(session, "broadcast_hunt_grace_until", 0.0),
        )

    # 모든 술래(주 + 협공)에게 신호를 전달한다
    delivered = False
    for seeker in session.state.players.values():
        if seeker.role != PlayerRole.SEEKER or seeker.status != PlayerStatus.ALIVE:
            continue
        if seeker.player_id == "seeker-2" and session.vertical_round.policy.seeker_count < 2:
            continue
        if seeker.player_id == "seeker" and session.vertical_round.policy.seeker_count < 1:
            continue

        if (
            strength in {"speech", "ai_action", "ai_speech", "door"}
            and source is not None
            and not source.shares_floor_with(seeker)
        ):
            continue

        if strength in {"speech", "ai_action", "ai_speech", "door"}:
            distance = math.hypot(
                float(position["x"]) - seeker.position.x,
                float(position["z"]) - seeker.position.z,
            )
            # S5: speech_mode가 있으면 모드별 반경, 없으면 기본 청각 반경
            if speech_mode is not None:
                effective_radius = SPEECH_MODE_RADIUS[speech_mode]
            elif strength == "door":
                effective_radius = CONTRACT["doorHearingDistance"]
            else:
                effective_radius = CONTRACT["hearingDistance"]
            if effective_seeker_threat(session) == SeekerThreat.LIMITED_HUNT:
                effective_radius = min(
                    effective_radius,
                    float(CONTRACT["limitedHunt"]["hearingDistance"]),
                )
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
                "floor": floor_override or (source.position.floor.value if source is not None else seeker.position.floor.value),
                "speech_mode": speech_mode.value if speech_mode else None,
                "timestamp": signal_timestamp,
            }
        elif seeker.player_id == "seeker-2":
            session.secondary_hunter_signal = {
                "player_id": player_id,
                "position": {"x": float(position["x"]), "z": float(position["z"])},
                "strength": strength,
                "floor": floor_override or (source.position.floor.value if source is not None else seeker.position.floor.value),
                "timestamp": signal_timestamp,
            }

    return delivered


def decide_hunter_intent(session: Any) -> dict:
    seeker = next(
        (player for player in session.state.players.values() if player.role == PlayerRole.SEEKER),
        None,
    )
    if seeker is None:
        return {"state": "HUNT", "target_id": None, "target": {"x": 0.0, "z": 0.0}, "reason": "no_seeker"}

    threat = effective_seeker_threat(session)
    now = time.monotonic()
    if threat == SeekerThreat.INACTIVE:
        return {
            "state": "HUNT",
            "target_id": None,
            "target": {"x": seeker.position.x, "z": seeker.position.z},
            "reason": "inactive",
        }
    transit_until = session.hunter_transit_until.get(seeker.player_id, 0.0)
    if transit_until > now:
        return {
            "state": "TRANSIT",
            "target_id": None,
            "target": {"x": seeker.position.x, "z": seeker.position.z},
            "reason": "physical_traversal_in_progress",
            "transit_remaining": round(transit_until - now, 3),
        }
    session.hunter_transit_until.pop(seeker.player_id, None)
    transition = _hunter_floor_transition_plan(session, seeker)
    if transition is not None:
        return {
            "state": "TRANSIT",
            "target_id": None,
            "target": transition["entry"],
            "reason": f"physical_{transition['traversal']}_to_{transition['destination_floor']}",
            "floor_transition": transition,
        }
    if threat == SeekerThreat.OMEN:
        return {
            "state": "HUNT",
            "target_id": None,
            "target": _timed_hunter_patrol_target(
                seeker.position.floor.value,
                seeker.position.x,
                seeker.position.z,
                now,
                focus=(-24.0, -38.0),
            ),
            "reason": "omen_patrol",
        }

    if (
        threat == SeekerThreat.LIMITED_HUNT
        and getattr(session, "broadcast_hunt_grace_until", 0.0) > now
    ):
        intro_target = CONTRACT["limitedHunt"]["introPatrolTarget"]
        return {
            "state": "HUNT",
            "target_id": None,
            "target": {
                "x": float(intro_target["x"]),
                "z": float(intro_target["z"]),
            },
            "reason": "limited_intro_reposition",
            "grace_remaining": round(session.broadcast_hunt_grace_until - now, 3),
        }

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

    limited_contract = CONTRACT["limitedHunt"] if threat == SeekerThreat.LIMITED_HUNT else None
    vision_distance = float(
        limited_contract["visionDistance"] if limited_contract else CONTRACT["visionDistance"]
    ) * vertical_threat_snapshot(session)["vision_multiplier"]
    proximity_distance = float(
        limited_contract["proximityDetectionDistance"]
        if limited_contract else CONTRACT["proximityDetectionDistance"]
    )
    memory_seconds = float(
        limited_contract["memorySeconds"] if limited_contract else CONTRACT["memorySeconds"]
    )
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
        if not has_clear_hunter_line(
            (seeker.position.x, seeker.position.z),
            (runner.position.x, runner.position.z),
            seeker.position.floor.value,
            session.door_open_states,
        ):
            continue
        dot = (dx / distance) * forward_x + (dz / distance) * forward_z
        in_cone = dot >= math.cos(math.radians(CONTRACT["visionAngleDegrees"] / 2))
        if distance <= proximity_distance or in_cone:
            frozen_bonus = 3.0 if runner.status == PlayerStatus.FROZEN else 0.0
            signal_bonus = 2.0 if (
                session.hunter_signal
                and now - session.hunter_signal["timestamp"] <= memory_seconds
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
    if signal and now - signal["timestamp"] <= memory_seconds:
        return {
            "state": "INVESTIGATE",
            "target_id": signal["player_id"],
            "target": signal["position"],
            "reason": signal["strength"],
        }

    last_seen = session.hunter_last_seen
    if last_seen and now - last_seen["timestamp"] <= memory_seconds:
        return {
            "state": "SEARCH",
            "target_id": last_seen["player_id"],
            "target": last_seen["position"],
            "reason": "lost_visual",
        }

    if threat == SeekerThreat.LIMITED_HUNT:
        return {
            "state": "HUNT",
            "target_id": None,
            "target": _limited_hunt_patrol_target(
                seeker.position.floor.value,
                seeker.position.x,
                seeker.position.z,
                now,
            ),
            "reason": "limited_patrol",
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
        "seeker_threat": effective_seeker_threat(session).value,
    }
    # 닫힌 교실 문은 짧은 피난처다. 술래는 문 앞에서 난동을 부리지만,
    # 플레이어가 조용하면 기존 기억 시간이 끝난 뒤 순찰로 복귀한다.
    target_line_end = (float(intent["target"]["x"]), float(intent["target"]["z"]))
    blocking_door = blocking_closed_door(
        (seeker.position.x, seeker.position.z), target_line_end,
        seeker.position.floor.value, session.door_open_states,
    )
    pressure = session.hunter_door_pressure
    target_is_human = bool(intent.get("target_id")) and intent["state"] in {
        "CHASE", "INVESTIGATE", "SEARCH",
    }
    if not target_is_human:
        session.hunter_door_pressure = None
    elif blocking_door is not None:
        door_x, door_z = map(float, blocking_door["center"])
        door_distance = math.hypot(door_x - seeker.position.x, door_z - seeker.position.z)
        if door_distance <= float(CONTRACT["doorPressure"]["approachDistance"]):
            door_id = str(blocking_door["id"])
            if not pressure or pressure.get("door_id") != door_id:
                pressure = {
                    "door_id": door_id,
                    "target_id": intent.get("target_id"),
                    "started_at": now,
                }
                session.hunter_door_pressure = pressure
            signal = session.hunter_signal
            fresh_noise = bool(
                signal
                and signal.get("player_id") == pressure.get("target_id")
                and float(signal.get("timestamp", 0)) > float(pressure["started_at"]) + 0.05
            )
            warning = float(CONTRACT["doorPressure"]["warningSeconds"])
            can_breach = (
                fresh_noise
                and (seeker.position.floor.value != "F3" or CONTRACT["doorPressure"]["floor3CanBreach"])
                and now - float(pressure["started_at"]) >= warning
            )
            if can_breach:
                session.door_open_states[door_id] = True
                session.hunter_door_pressure = None
                intent.update({
                    "reason": "door_breached",
                    "door_opened": door_id,
                    "mutation_phase": "LUNGE",
                })
            else:
                intent.update({
                    "state": "SEARCH",
                    "target": {"x": door_x, "z": door_z},
                    "reason": "door_pressure",
                    "door_id": door_id,
                    "door_pressure_seconds": round(now - float(pressure["started_at"]), 3),
                    "mutation_phase": "POUND",
                })
    dx = intent["target"]["x"] - seeker.position.x
    dz = intent["target"]["z"] - seeker.position.z
    distance = math.hypot(dx, dz)
    speed_key = {
        "HUNT": "huntSpeed", "INVESTIGATE": "investigateSpeed",
        "DETECTED": None, "CHASE": "chaseSpeed", "SEARCH": "huntSpeed",
        "RUSH_GATE": "rushSpeed", "TRANSIT": "huntSpeed",
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
                door_open_states=session.door_open_states,
            )
            seeker.position.x, seeker.position.z = next_x, next_z
            session.position_samples[seeker.player_id] = MovementSample(seeker.position.x, seeker.position.z, now)
    floor_transition = None
    transition = intent.get("floor_transition")
    if transition and math.hypot(
        seeker.position.x - transition["entry"]["x"],
        seeker.position.z - transition["entry"]["z"],
    ) <= 0.62:
        exit_position = transition["exit"]
        seeker.position.x = exit_position["x"]
        seeker.position.y = exit_position["y"]
        seeker.position.z = exit_position["z"]
        seeker.position.floor = WorldFloor(transition["destination_floor"])
        seeker.position.zone = f"hunter_{transition['path_id'].lower()}_exit"
        session.hunter_transit_until[seeker.player_id] = now + transition["duration"]
        session.position_samples[seeker.player_id] = MovementSample(
            seeker.position.x, seeker.position.z, now,
        )
        floor_transition = {
            "actor_id": seeker.player_id,
            "route": transition["route"],
            "traversal": transition["traversal"],
            "path_id": transition["path_id"],
            "direction": transition["direction"],
            "duration": transition["duration"],
            **({"elevator_id": transition["elevator_id"]} if transition.get("elevator_id") else {}),
            "position": {
                "x": seeker.position.x, "y": seeker.position.y, "z": seeker.position.z,
                "floor": seeker.position.floor.value, "zone": seeker.position.zone,
            },
        }
    session.hunter_last_tick = now
    session.hunter_last_intent = None if floor_transition else intent
    return {
        **intent,
        "role": SeekerRole.CHASER.value,
        "seeker_position": {"x": seeker.position.x, "z": seeker.position.z},
        **({"actor_floor_changed": floor_transition} if floor_transition else {}),
    }


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
    transit_until = session.hunter_transit_until.get(seeker.player_id, 0.0)
    if transit_until > now:
        return {
            "state": "TRANSIT", "target_id": None,
            "target": {"x": seeker.position.x, "z": seeker.position.z},
            "reason": "physical_traversal_in_progress",
            "role": SeekerRole.BLOCKER.value,
            "transit_remaining": round(transit_until - now, 3),
        }
    session.hunter_transit_until.pop(seeker.player_id, None)
    transition = _hunter_floor_transition_plan(session, seeker)
    if transition is not None:
        return {
            "state": "TRANSIT", "target_id": None,
            "target": transition["entry"],
            "reason": f"physical_{transition['traversal']}_to_{transition['destination_floor']}",
            "role": SeekerRole.BLOCKER.value,
            "floor_transition": transition,
        }
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
        if not has_clear_hunter_line(
            (seeker.position.x, seeker.position.z),
            (runner.position.x, runner.position.z),
            seeker.position.floor.value,
            session.door_open_states,
        ):
            continue
        dot = (dx / dist) * fwd_x + (dz / dist) * fwd_z
        if dot >= math.cos(math.radians(blocker_vision_angle / 2)):
            frozen_bonus = 4.0 if runner.status == PlayerStatus.FROZEN else 0.0
            spotted.append((-frozen_bonus - (12.0 - dist), runner))

    if spotted:
        _, target = min(spotted, key=lambda c: c[0])
        shared_position = _nearest_navigation_position(
            target.position.floor.value,
            target.position.x,
            target.position.z,
        )
        # S3: 차단자가 발견하면 추격자에게 구역 수준 정보 공유
        session.blocker_zone_share = {
            "player_id": target.player_id,
            "zone": target.position.zone,
            "floor": target.position.floor.value,
            "position": shared_position,
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
            desired_flank_x = target.position.x + (cx / cl) * 3.0
            desired_flank_z = target.position.z + (cz / cl) * 3.0
        else:
            desired_flank_x, desired_flank_z = target.position.x, target.position.z
        flank = _nearest_navigation_position(
            seeker.position.floor.value, desired_flank_x, desired_flank_z,
        )
        return {
            "state": "BLOCK",
            "target_id": target.player_id,
            "target": flank,
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
        if getattr(session, "blocker_guard_target_id", None) != closest.player_id:
            session.blocker_guard_target_id = closest.player_id
            session.blocker_guard_start = now
        guard_start = session.blocker_guard_start
        if now - guard_start < 8.0:
            guard_target = _nearest_navigation_position(
                seeker.position.floor.value,
                closest.position.x + 2.0,
                closest.position.z,
            )
            return {
                "state": "GUARD",
                "target_id": closest.player_id,
                "target": guard_target,
                "reason": "frozen_guard",
                "role": SeekerRole.BLOCKER.value,
            }
    else:
        session.blocker_guard_target_id = None
        session.blocker_guard_start = None

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
    floor_nodes = NAVIGATION_NODES_BY_FLOOR.get(seeker.position.floor.value, ())
    patrol_nodes = [node for node in floor_nodes if "_ring_" in str(node["id"])] or list(floor_nodes)
    patrol_nodes.sort(
        key=lambda node: math.hypot(
            float(node["position"][0]) - float(primary_target["x"]),
            float(node["position"][1]) - float(primary_target["z"]),
        ),
        reverse=True,
    )
    if patrol_nodes:
        patrol_node = patrol_nodes[int(now / 8.0) % min(3, len(patrol_nodes))]
        patrol_target = {
            "x": float(patrol_node["position"][0]),
            "z": float(patrol_node["position"][1]),
        }
    else:
        patrol_target = {"x": seeker.position.x, "z": seeker.position.z}
    return {
        "state": "PATROL",
        "target_id": None,
        "target": patrol_target,
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
        session.blocker_guard_start = None
    if not hasattr(session, "blocker_guard_target_id"):
        session.blocker_guard_target_id = None

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
            door_open_states=session.door_open_states,
        )
        session.position_samples[seeker.player_id] = MovementSample(
            seeker.position.x, seeker.position.z, now,
        )

    floor_transition = None
    transition = intent.get("floor_transition")
    if transition and math.hypot(
        seeker.position.x - transition["entry"]["x"],
        seeker.position.z - transition["entry"]["z"],
    ) <= 0.62:
        exit_position = transition["exit"]
        seeker.position.x = exit_position["x"]
        seeker.position.y = exit_position["y"]
        seeker.position.z = exit_position["z"]
        seeker.position.floor = WorldFloor(transition["destination_floor"])
        seeker.position.zone = f"hunter_{transition['path_id'].lower()}_exit"
        session.hunter_transit_until[seeker.player_id] = now + transition["duration"]
        session.position_samples[seeker.player_id] = MovementSample(
            seeker.position.x, seeker.position.z, now,
        )
        floor_transition = {
            "actor_id": seeker.player_id,
            "route": transition["route"], "traversal": transition["traversal"],
            "path_id": transition["path_id"], "direction": transition["direction"],
            "duration": transition["duration"],
            **({"elevator_id": transition["elevator_id"]} if transition.get("elevator_id") else {}),
            "position": {
                "x": seeker.position.x, "y": seeker.position.y, "z": seeker.position.z,
                "floor": seeker.position.floor.value, "zone": seeker.position.zone,
            },
        }

    # S3: 차단자가 구역 정보를 공유했으면 추격자 신호에 반영
    zone_share = getattr(session, "blocker_zone_share", None)
    if zone_share and now - zone_share.get("shared_at", 0) < 5.0:
        # 추격자에게 구역 수준(정확한 좌표 아님) 힌트 전달
        if session.hunter_signal is None or (
            now - session.hunter_signal.get("timestamp", 0) > 3.0
        ):
            session.hunter_signal = {
                "player_id": zone_share["player_id"],
                "position": zone_share["position"],
                "strength": "blocker_share",
                "timestamp": now,
            }

    return {
        **intent,
        "seeker_position": {"x": seeker.position.x, "z": seeker.position.z},
        "speed_multiplier": speed_mult,
        "stage_speed_multiplier": stage_mult,
        **({"actor_floor_changed": floor_transition} if floor_transition else {}),
    }


def hunter_snapshot(session: Any) -> dict:
    seeker = session.state.get_player("seeker")
    current_threat = effective_seeker_threat(session).value
    cached_intent = session.hunter_last_intent
    intent = cached_intent if cached_intent and cached_intent.get("seeker_threat") == current_threat else {
        **decide_hunter_intent(session), **director_snapshot(session),
        **vertical_threat_snapshot(session),
        "seeker_threat": current_threat,
    }
    return {**intent, "role": SeekerRole.CHASER.value, "seeker_position": {"x": seeker.position.x, "z": seeker.position.z}}


def _nearest_navigation_position(floor: str, x: float, z: float) -> dict[str, float]:
    """정밀 actor 좌표를 노출하지 않도록 가장 가까운 공용 경로점으로 양자화한다."""
    nodes = NAVIGATION_NODES_BY_FLOOR.get(floor, ())
    ring_nodes = [node for node in nodes if "_ring_" in str(node["id"])]
    public_nodes = [node for node in nodes if not str(node["id"]).endswith("_nav_room")]
    candidates = ring_nodes or public_nodes or list(nodes)
    if not candidates:
        return {"x": float(x), "z": float(z)}
    node = min(
        candidates,
        key=lambda candidate: math.hypot(
            float(candidate["position"][0]) - x,
            float(candidate["position"][1]) - z,
        ),
    )
    return {
        "x": float(node["position"][0]),
        "z": float(node["position"][1]),
    }


def _timed_hunter_patrol_target(
    floor: str,
    x: float,
    z: float,
    now: float,
    *,
    focus: tuple[float, float] | None = None,
) -> dict[str, float]:
    """문 앞 정지 없이 해당 층의 복도 그래프를 따라 다음 순찰점을 고른다."""
    nodes = [
        node for node in NAVIGATION_NODES_BY_FLOOR.get(floor, ())
        if "_ring_" in str(node["id"])
    ]
    if focus is not None:
        nodes.sort(key=lambda node: math.hypot(
            float(node["position"][0]) - focus[0],
            float(node["position"][1]) - focus[1],
        ))
        nodes = nodes[:4]
    if not nodes:
        return {"x": float(x), "z": float(z)}
    patrol_index = int(now / 6.0) % len(nodes)
    node = nodes[patrol_index]
    for offset in range(len(nodes)):
        candidate = nodes[(patrol_index + offset) % len(nodes)]
        if math.hypot(
            float(candidate["position"][0]) - x,
            float(candidate["position"][1]) - z,
        ) > 1.5:
            node = candidate
            break
    return {
        "x": float(node["position"][0]),
        "z": float(node["position"][1]),
    }


def _limited_hunt_patrol_target(
    floor: str, x: float, z: float, now: float,
) -> dict[str, float]:
    """3층 방송실 출입구를 순찰 루프에서 제외해 문 앞 캠핑을 막는다."""
    limited = CONTRACT["limitedHunt"]
    center = limited["antiCampCenter"]
    radius = float(limited["antiCampRadius"])
    nodes = [
        node for node in NAVIGATION_NODES_BY_FLOOR.get(floor, ())
        if "_ring_" in str(node["id"])
        and math.hypot(
            float(node["position"][0]) - float(center["x"]),
            float(node["position"][1]) - float(center["z"]),
        ) >= radius
    ]
    if not nodes:
        return _timed_hunter_patrol_target(floor, x, z, now)
    patrol_index = int(now / 6.0) % len(nodes)
    node = nodes[patrol_index]
    for offset in range(len(nodes)):
        candidate = nodes[(patrol_index + offset) % len(nodes)]
        if math.hypot(
            float(candidate["position"][0]) - x,
            float(candidate["position"][1]) - z,
        ) > 1.5:
            node = candidate
            break
    return {
        "x": float(node["position"][0]),
        "z": float(node["position"][1]),
    }


def _safe_hunter_step(
    x: float, z: float, target_x: float, target_z: float, step: float, floor: str = "F1",
    stop_distance: float = 0.0,
    door_open_states: dict[str, bool] | None = None,
) -> tuple[float, float]:
    """서버 벽 계약을 넘지 않으며 목표 쪽 또는 벽의 측면으로 한 걸음 이동한다."""
    target_x, target_z = next_navigation_waypoint(
        (x, z), (target_x, target_z), floor, stop_distance=stop_distance,
    )
    distance = math.hypot(target_x - x, target_z - z)
    if distance <= 0 or step <= 0:
        return x, z
    nx, nz = (target_x - x) / distance, (target_z - z) / distance
    direct = (x + nx * step, z + nz * step)
    if has_clear_hunter_line((x, z), direct, floor, door_open_states):
        return direct

    # 닫힌 문은 벽처럼 우회하지 않고 바로 앞에서 멈춰 압박 상태로 이어진다.
    if blocking_closed_door((x, z), direct, floor, door_open_states) is not None:
        return x, z

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
