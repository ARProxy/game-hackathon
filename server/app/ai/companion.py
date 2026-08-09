"""서버 권위 AI 동료의 독립 목표, 기억, 이동 계약.

S4: AI 발화 intent 구조화 + 금기어 회피
B2: 발화 중복 억제
B4: 행동-음성 일치 검증
"""

from __future__ import annotations

import json
import math
import time
from pathlib import Path
from typing import Any

from app.ai.hunter import _safe_hunter_step
from app.ai.speech import (
    SpeechEvent,
    SpeechHistory,
    SpeechIntent,
    SpeechMode,
    avoid_forbidden_words,
    build_speech_event,
    select_speech_mode,
)
from app.game.authority import MovementSample, has_clear_catch_line
from app.game.progression import FinalRoute, WorldFloor
from app.game.state import GamePhase, PlayerRole, PlayerStatus

CONTRACT_PATH = Path(__file__).parents[3] / "client/src/game/companionContract.json"
with CONTRACT_PATH.open(encoding="utf-8") as contract_file:
    CONTRACT = json.load(contract_file)
TRAP_CONTRACT_PATH = Path(__file__).parents[3] / "client/src/game/trapContract.json"
with TRAP_CONTRACT_PATH.open(encoding="utf-8") as trap_contract_file:
    TRAP_CONTRACT = json.load(trap_contract_file)


def command_companion(session: Any, prop_id: str, position: dict, utterance: str, companion_id: str = "partner") -> None:
    runtime = session.companion_states[companion_id]
    runtime.command = {
        "prop_id": prop_id,
        "position": {"x": float(position["x"]), "z": float(position["z"])},
        "utterance": utterance,
        "timestamp": time.monotonic(),
    }
    runtime.goal_changed_at = 0.0


def request_companion_rescue(session: Any, target_id: str, companion_id: str = "partner") -> None:
    runtime = session.companion_states[companion_id]
    runtime.rescue_request = target_id
    runtime.goal_changed_at = 0.0


def decide_companion_intent(session: Any, companion_id: str = "partner") -> dict:
    now = time.monotonic()
    runtime = session.companion_states[companion_id]
    partner = session.state.get_player(companion_id)
    seeker = session.state.get_player("seeker")
    if not partner or partner.status != PlayerStatus.ALIVE:
        return _intent("INCAPACITATED", None, partner, "partner_unavailable")

    if seeker and _distance(partner, seeker) <= CONTRACT["dangerDistance"] and has_clear_catch_line(
        (partner.position.x, partner.position.z), (seeker.position.x, seeker.position.z),
        partner.position.floor.value,
    ):
        previous_sighting = runtime.last_seeker_seen
        runtime.last_seeker_seen = {
            "position": {"x": seeker.position.x, "z": seeker.position.z},
            "seen_at": now,
            "reported": bool(previous_sighting and previous_sighting.get("reported")),
        }
        dx, dz = partner.position.x - seeker.position.x, partner.position.z - seeker.position.z
        length = max(0.01, math.hypot(dx, dz))
        return {
            "state": "AVOID_SEEKER", "target_id": None,
            "target": {"x": partner.position.x + dx / length * 8, "z": partner.position.z + dz / length * 8},
            "reason": "seeker_visible",
        }

    sighting = runtime.last_seeker_seen
    if sighting and now - sighting["seen_at"] <= CONTRACT["seekerMemorySeconds"]:
        dx = partner.position.x - sighting["position"]["x"]
        dz = partner.position.z - sighting["position"]["z"]
        length = max(0.01, math.hypot(dx, dz))
        return {
            "state": "AVOID_SEEKER", "target_id": None,
            "target": {"x": partner.position.x + dx / length * 6, "z": partner.position.z + dz / length * 6},
            "reason": "seeker_last_seen",
        }

    frozen = [
        player for player in session.state.players.values()
        if player.role != PlayerRole.SEEKER and player.player_id != partner.player_id
        and player.status == PlayerStatus.FROZEN
    ]
    if frozen:
        target = min(frozen, key=lambda player: _distance(partner, player))
        waited = max(0.0, time.time() - (target.frozen_at or time.time()))
        if runtime.rescue_request == target.player_id or waited >= CONTRACT["autoRescueDelaySeconds"]:
            return _intent("RESCUE_TEAMMATE", target.player_id, target, "assigned_rescue")

    # 플레이어가 다음 층으로 이동한 경우 — 독립 판단으로 따라갈지 결정
    floor_event = runtime.player_floor_changed
    if floor_event:
        from app.game.progression import WorldFloor as _WF
        player_floor = _WF(floor_event["floor"])
        current_floor = partner.position.floor

        if current_floor != player_floor:
            has_reason_to_stay = False

            # 이유 1: 빙결된 팀원이 현재 층에 있음
            frozen_on_floor = [
                p for p in session.state.players.values()
                if p.status == PlayerStatus.FROZEN and p.position.floor == current_floor
            ]
            if frozen_on_floor:
                has_reason_to_stay = True

            # 이유 2: 현재 층에서 미션 진행 중 (inspect 중)
            if (
                runtime.goal_started
                and runtime.last_intent
                and runtime.last_intent.get("state") == "INSPECT_CANDIDATE"
            ):
                has_reason_to_stay = True

            # 현재 활성 층의 협동 역할을 맡은 AI는 인간이 단서 회수나 우회를
            # 위해 직전 층으로 돌아가도 미션 위치를 버리고 따라가지 않는다.
            if (
                session.vertical_progression_enabled
                and current_floor == session.vertical_round.policy.active_floor
                and player_floor != current_floor
            ):
                has_reason_to_stay = True

            if not has_reason_to_stay:
                # 플레이어를 따라 이동 (자발적 판단)
                target_x = float(floor_event["position"]["x"])
                target_z = float(floor_event["position"]["z"])
                stair_direction = None
                lateral_offset = -0.38 if companion_id == "partner" else 0.38
                if current_floor == WorldFloor.ROOF and player_floor == WorldFloor.F3:
                    from app.game.map_slots import get_map_slot as _get_stair_slot
                    target_position = _get_stair_slot("F3_TO_ROOF_STAIR_TOP_CROSSING")["position"]
                    target_x, target_z = float(target_position[0]), float(target_position[2])
                    stair_direction = "down"
                return {
                    "state": "FOLLOW_TO_FLOOR",
                    "target_id": None,
                    "target": {
                        "x": target_x + (lateral_offset if stair_direction else 0),
                        "z": target_z,
                    },
                    "reason": "player_descended",
                    "_floor_event": floor_event,
                    "_stair_direction": stair_direction,
                    "arrival_distance": 0.42 if stair_direction else CONTRACT["arrivalDistance"],
                }
            # 이유가 있으면 현재 목표 유지 (독립 동선) — 이벤트는 유지
        else:
            # 이미 같은 층에 있으면 이벤트 소비
            runtime.player_floor_changed = None

    if (
        session.vertical_progression_enabled
        and session.round_data is None
        and session.state.phase == GamePhase.PLAYING
    ):
        active_floor = session.vertical_round.policy.active_floor
        if partner.position.floor != active_floor:
            return _intent("REGROUP", None, partner, "waiting_for_floor_transition")
        from app.game.progression import VerticalRoundPhase
        from app.game.vertical_flow import final_station_position, mission_interaction_position
        from app.game.map_slots import get_map_slot as _get_map_slot

        # 옥상에서는 현재 정답 신호의 담당 동료가 그 위치로 직접 안내한다.
        # 나머지 동료는 반대편 중계기를 정찰해 목표 변경에도 계속 움직인다.
        if session.vertical_round.phase == VerticalRoundPhase.ROOFTOP_INTRO:
            next_signal_id = (
                session.vertical_missions.rooftop.next_signal_id
                if session.vertical_missions is not None
                else "center"
            ) or "center"
            guide_companion_id = "partner-2" if next_signal_id == "west" else "partner"
            guiding = companion_id == guide_companion_id
            if guiding:
                signal_side = next_signal_id
            else:
                signal_side = "east" if companion_id == "partner" else "west"
            signal_slot = _get_map_slot(f"ROOF_SIGNAL_{signal_side.upper()}")
            sx, _, sz = signal_slot.get("approachPosition", signal_slot["position"])
            return {
                "state": "EXPLORE_ZONE",
                "target_id": f"roof_signal_{'guide' if guiding else 'scout'}_{signal_side}",
                "target": {"x": sx, "z": sz},
                "reason": "rooftop_signal_guide" if guiding else "rooftop_signal_scout",
                "arrival_distance": float(
                    signal_slot.get("approachRadius", CONTRACT["arrivalDistance"]),
                ),
            }

        # 두 번째 동료는 플레이어와 미션 담당 동료를 따라 겹치지 않고,
        # 다음 층으로 이어지는 안전 경로를 미리 확인한다.
        if companion_id == "partner-2" and session.vertical_round.phase in {
            VerticalRoundPhase.FLOOR_3,
            VerticalRoundPhase.FLOOR_2,
            VerticalRoundPhase.FLOOR_1,
        }:
            if session.vertical_round.phase == VerticalRoundPhase.FLOOR_3:
                route, slot_id = "east", "F3_TO_F2_STAIR_EAST"
            elif session.vertical_round.phase == VerticalRoundPhase.FLOOR_2:
                route, slot_id = "west", "F2_TO_F1_STAIR_WEST"
            elif session.vertical_round.final_route == FinalRoute.BASEMENT:
                route, slot_id = "basement", "F1_TO_BASEMENT_FIRE_DOOR"
            else:
                route, slot_id = "field", "F1_TO_FIELD_FIRE_DOOR"
            route_slot = _get_map_slot(slot_id)
            rx, _, rz = route_slot["position"]
            return {
                "state": "EXPLORE_ZONE",
                "target_id": f"{session.vertical_round.phase.value}_route_scout_{route}",
                "target": {"x": rx, "z": rz},
                "reason": "next_route_scout",
                "route": route,
            }

        # 2층 인터폰 미션: AI가 자신의 인터폰 위치로 이동
        if (
            session.vertical_round.phase == VerticalRoundPhase.FLOOR_2
            and session.vertical_missions is not None
        ):
            vm = session.vertical_missions
            intercom = vm.intercom
            if (
                not intercom.completed
                and intercom.ai_companion_id == companion_id
            ):
                ai_slot = _get_map_slot(intercom.ai_position_slot)
                ax, _, az = ai_slot["position"]
                arrived = math.hypot(partner.position.x - ax, partner.position.z - az) <= 1.5
                if arrived and not intercom.ai_arrived:
                    intercom.ai_arrived = True
                return {
                    "state": "EXPLORE_ZONE",
                    "target_id": "intercom_mission",
                    "target": {"x": ax, "z": az},
                    "reason": "intercom_ai_position",
                }

        # 1층 동시 조작 미션: AI가 자신의 장치 위치로 이동
        if (
            session.vertical_round.phase == VerticalRoundPhase.FLOOR_1
            and session.vertical_missions is not None
        ):
            vm = session.vertical_missions
            sim = vm.simultaneous
            if not sim.completed and sim.ai_companion_id == companion_id:
                ai_slot = _get_map_slot(sim.device_b_slot)
                bx, _, bz = ai_slot["position"]
                arrived = math.hypot(partner.position.x - bx, partner.position.z - bz) <= 1.5
                if arrived and not sim.ai_arrived:
                    sim.ai_arrived = True
                    sim.ai_ready = True
                return {
                    "state": "EXPLORE_ZONE",
                    "target_id": "simultaneous_mission",
                    "target": {"x": bx, "z": bz},
                    "reason": "simultaneous_ai_position",
                }

        # 지하 파이널 미션: AI가 배정된 장치 방으로 이동하여 상태를 보고
        if (
            session.vertical_round.phase == VerticalRoundPhase.BASEMENT_FINAL
            and session.vertical_missions is not None
        ):
            bm = session.vertical_missions.basement
            # 각 AI 동료를 장치에 배정 (partner → 첫 번째 장치, partner-2 → 두 번째)
            from app.game.session import DEFAULT_AI_PARTNER_IDS as _PARTNER_IDS
            companion_index = _PARTNER_IDS.index(companion_id) if companion_id in _PARTNER_IDS else 0
            if companion_index < len(bm.devices):
                device = bm.devices[companion_index]
                device_slot = _get_map_slot(device.slot_id)
                dx, _, dz = device_slot["position"]
                return {
                    "state": "EXPLORE_ZONE",
                    "target_id": f"basement_{device.device_id}",
                    "target": {"x": dx, "z": dz},
                    "reason": "basement_device_assignment",
                }

        x, _, z = (
            final_station_position(companion_id)
            if session.vertical_round.phase == VerticalRoundPhase.FIELD_FINAL
            else mission_interaction_position(session.vertical_round.phase)
        )
        return {
            "state": "EXPLORE_ZONE",
            "target_id": session.vertical_round.phase.value,
            "target": {"x": x, "z": z},
            "reason": "vertical_stage_objective",
        }

    if (
        session.vertical_progression_enabled
        and session.round_data is None
        and session.vertical_round.final_route in {FinalRoute.FIELD, FinalRoute.BASEMENT}
        and session.state.phase in {GamePhase.FINAL_SPELL, GamePhase.ESCAPE}
    ):
        from app.game.map_slots import get_map_slot as _get_map_slot
        from app.game.vertical_flow import final_escape_position, final_station_position

        if session.state.phase == GamePhase.ESCAPE:
            exit_x, _, exit_z = final_escape_position(session)
            return {
                "state": "ESCAPE",
                "target_id": f"vertical_{session.vertical_round.final_route.value}_exit",
                "target": {"x": exit_x, "z": exit_z},
                "reason": "vertical_escape_open",
        }
        if session.vertical_round.final_route == FinalRoute.BASEMENT:
            from app.game.session import DEFAULT_AI_PARTNER_IDS as _PARTNER_IDS
            companion_index = (
                _PARTNER_IDS.index(companion_id)
                if companion_id in _PARTNER_IDS else 0
            )
            device = session.vertical_missions.basement.devices[companion_index]
            station_x, _, station_z = _get_map_slot(device.slot_id)["position"]
        else:
            station_x, _, station_z = final_station_position(companion_id)
        return {
            "state": "MOVE_TO_GATE",
            "target_id": f"vertical_station_{companion_id}",
            "target": {"x": station_x, "z": station_z},
            "reason": "hold_final_station",
        }

    if session.state.phase in {GamePhase.FINAL_SPELL, GamePhase.ESCAPE} and session.active_gate_id:
        state = "ESCAPE" if session.state.phase == GamePhase.ESCAPE else "MOVE_TO_GATE"
        return {
            "state": state, "target_id": None,
            "target": (
                session.active_gate_escape_position()
                if state == "ESCAPE" else session.active_gate_payload()["position"]
            ),
            "reason": "team_objective",
        }

    command = runtime.command
    if command:
        return {
            "state": "INSPECT_CANDIDATE", "target_id": command["prop_id"],
            "target": command["position"], "reason": "player_description",
        }

    mission = session.current_mission()
    if mission:
        candidates = [mission.real_prop, *mission.decoy_props]
        unexplored = [prop for prop in candidates if prop.prop_id not in runtime.memory]
        if unexplored:
            target = min(
                unexplored,
                key=lambda prop: math.hypot(
                    prop.position["x"] - partner.position.x,
                    prop.position["z"] - partner.position.z,
                ),
            )
            return {
                "state": "EXPLORE_ZONE", "target_id": target.prop_id,
                "target": target.position, "reason": "unexplored_mission_zone",
            }

        # 발견 보고만 끝낸 채 영구 대기하지 않는다. 각 동료는 자신의 위치와
        # 기억을 기준으로 아직 서버 판정이 끝나지 않은 후보를 직접 조사한다.
        # 전역 목표 잠금이나 역할 배정은 두지 않아 같은 후보 선택도 허용한다.
        inspectable = [
            prop for prop in candidates
            if prop.prop_id not in session.inspected_prop_ids
        ]
        if inspectable:
            target = min(
                inspectable,
                key=lambda prop: math.hypot(
                    prop.position["x"] - partner.position.x,
                    prop.position["z"] - partner.position.z,
                ),
            )
            return {
                "state": "INSPECT_CANDIDATE", "target_id": target.prop_id,
                "target": target.position, "reason": "autonomous_hypothesis",
            }
        return _intent("REPORT_FINDING", None, partner, "mission_candidates_exhausted")

    return _intent("REGROUP", None, partner, "no_active_mission")


def advance_companion(session: Any, companion_id: str = "partner") -> tuple[dict, dict | None]:
    now = time.monotonic()
    runtime = session.companion_states[companion_id]
    partner = session.state.get_player(companion_id)
    elapsed = now - runtime.last_tick
    proposed = decide_companion_intent(session, companion_id)
    previous = runtime.last_intent
    urgent = proposed["state"] in {"AVOID_SEEKER", "RESCUE_TEAMMATE", "MOVE_TO_GATE", "ESCAPE", "FOLLOW_TO_FLOOR"}
    if (
        previous and not urgent and runtime.goal_changed_at
        and now - runtime.goal_changed_at < CONTRACT["goalHoldSeconds"]
    ):
        intent = previous
    else:
        intent = proposed
        if not previous or (previous["state"], previous["target_id"]) != (intent["state"], intent["target_id"]):
            runtime.goal_changed_at = now
    action = None
    if not partner:
        return intent, None
    if partner.status != PlayerStatus.ALIVE:
        runtime.last_tick = now
        runtime.last_intent = intent
        return {
            **intent,
            "partner_position": {"x": partner.position.x, "z": partner.position.z},
        }, None

    distance = math.hypot(intent["target"]["x"] - partner.position.x, intent["target"]["z"] - partner.position.z)
    arrival_distance = max(
        0.0,
        float(intent.get("arrival_distance", CONTRACT["arrivalDistance"])),
    )
    speed_key = {
        "EXPLORE_ZONE": "exploreSpeed", "INSPECT_CANDIDATE": "missionSpeed",
        "AVOID_SEEKER": "avoidSpeed", "RESCUE_TEAMMATE": "rescueSpeed",
        "MOVE_TO_GATE": "gateSpeed", "ESCAPE": "gateSpeed",
        "FOLLOW_TO_FLOOR": "gateSpeed",
    }.get(intent["state"])
    if speed_key and distance > arrival_distance:
        step = min(float(CONTRACT[speed_key]) * min(elapsed, 0.5), distance - arrival_distance)
        partner.position.x, partner.position.z = _safe_hunter_step(
            partner.position.x, partner.position.z, intent["target"]["x"], intent["target"]["z"], step,
            partner.position.floor.value, stop_distance=arrival_distance,
        )
        session.position_samples[partner.player_id] = MovementSample(partner.position.x, partner.position.z, now)

    arrived = math.hypot(
        intent["target"]["x"] - partner.position.x,
        intent["target"]["z"] - partner.position.z,
    ) <= arrival_distance + 0.05
    sighting = runtime.last_seeker_seen
    triggered_trap = next((
        trap for trap in TRAP_CONTRACT["traps"]
        if trap["id"] in session.active_trap_ids
        and trap["id"] not in session.triggered_trap_ids
        and math.hypot(partner.position.x - trap["x"], partner.position.z - trap["z"])
        <= TRAP_CONTRACT["triggerDistance"]
    ), None)
    if triggered_trap:
        session.triggered_trap_ids.add(triggered_trap["id"])
        action = {"type": "trap", "trap_id": triggered_trap["id"]}
    elif intent["state"] == "ESCAPE" and arrived:
        action = {"type": "escape"}
    elif intent["state"] == "FOLLOW_TO_FLOOR" and arrived:
        floor_event = intent.get("_floor_event")
        if floor_event:
            action = {"type": "floor_transition", "target_floor": floor_event["position"]}
            if intent.get("_stair_direction"):
                action.update({
                    "traversal": "stairs",
                    "direction": intent["_stair_direction"],
                })
    elif intent["state"] == "AVOID_SEEKER" and sighting and not sighting.get("reported"):
        sighting["reported"] = True
        action = {"type": "seeker_report", "position": sighting["position"]}
    elif (
        intent["state"] == "EXPLORE_ZONE"
        and arrived
        and str(intent["target_id"]).startswith(("roof_signal_scout_", "roof_signal_guide_"))
    ):
        target_id = str(intent["target_id"])
        guiding = target_id.startswith("roof_signal_guide_")
        signal_id = target_id.removeprefix(
            "roof_signal_guide_" if guiding else "roof_signal_scout_"
        )
        # 동료는 정답을 대신 입력하지 않지만 현재 순서의 위치까지 실제로
        # 이동해 플레이어가 멈추지 않도록 시각·음성으로 안내한다.
        if intent["target_id"] not in runtime.memory:
            runtime.memory[intent["target_id"]] = {
                "discovered_at": now,
                "position": intent["target"],
                "zone": session.vertical_round.phase.value,
            }
            action = {
                "type": "rooftop_signal_observed",
                "signal_id": signal_id,
                "guiding": guiding,
            }
    elif intent["state"] == "EXPLORE_ZONE" and arrived and intent["target_id"] == "intercom_mission":
        intercom = session.vertical_missions.intercom if session.vertical_missions is not None else None
        if (
            intercom is not None
            and intercom.started_at is not None
            and intent["target_id"] not in runtime.memory
        ):
            runtime.memory[intent["target_id"]] = {
                "discovered_at": now,
                "position": intent["target"],
                "zone": session.vertical_round.phase.value,
            }
            action = {
                "type": "intercom_report",
                "phase": session.vertical_round.phase.value,
                "sequence": intercom.sequence,
            }
    elif (
        intent["state"] == "EXPLORE_ZONE"
        and arrived
        and "_route_scout_" in str(intent["target_id"])
        and intent["target_id"] not in runtime.memory
    ):
        runtime.memory[intent["target_id"]] = {
            "discovered_at": now,
            "position": intent["target"],
            "zone": session.vertical_round.phase.value,
        }
        action = {
            "type": "route_scout_report",
            "phase": session.vertical_round.phase.value,
            "route": intent.get("route", "west"),
        }
    elif intent["state"] == "EXPLORE_ZONE" and arrived and intent["target_id"] not in runtime.memory:
        if session.vertical_progression_enabled and session.round_data is None:
            runtime.memory[intent["target_id"]] = {
                "discovered_at": now,
                "position": intent["target"],
                "zone": session.vertical_round.phase.value,
            }
            # 동시 조작 미션: AI가 도착하면 준비 완료 액션 발생
            if intent["target_id"] == "simultaneous_mission" and session.vertical_missions is not None:
                action = {
                    "type": "simultaneous_ready",
                    "phase": session.vertical_round.phase.value,
                }
            # 지하 파이널: AI가 장치에 도착하면 상태 보고
            elif (
                intent["target_id"] and intent["target_id"].startswith("basement_")
                and session.vertical_missions is not None
            ):
                device_id = intent["target_id"].removeprefix("basement_")
                status = session.vertical_missions.basement.get_device_status(device_id)
                action = {
                    "type": "basement_device_report",
                    "phase": session.vertical_round.phase.value,
                    "device_id": device_id,
                    "device_status": status,
                }
            else:
                action = {
                    "type": "vertical_objective",
                    "phase": session.vertical_round.phase.value,
                }
        else:
            mission = session.current_mission()
            prop = next(
                (item for item in [mission.real_prop, *mission.decoy_props] if item.prop_id == intent["target_id"]),
                None,
            )
            action = {
                "type": "report", "prop_id": intent["target_id"],
                "zone": prop.zone if prop else "unknown",
                "appearance": {"color": prop.color, "mesh": prop.mesh} if prop else {},
            }
            runtime.memory[intent["target_id"]] = {
                "discovered_at": now, "position": intent["target"],
                "zone": action["zone"], "appearance": action["appearance"],
            }
    elif intent["state"] == "INSPECT_CANDIDATE" and arrived:
        if runtime.goal_started is None:
            runtime.goal_started = now
        elif now - runtime.goal_started >= CONTRACT["inspectionDurationSeconds"]:
            action = {"type": "inspect", "prop_id": intent["target_id"]}
            runtime.command = None
            runtime.goal_started = None
    elif intent["state"] == "RESCUE_TEAMMATE" and distance <= CONTRACT["rescueDistance"]:
        action = {"type": "rescue", "target_id": intent["target_id"]}
        runtime.rescue_request = None
    else:
        runtime.goal_started = None

    runtime.last_tick = now
    runtime.last_intent = intent
    return {**intent, "partner_position": {"x": partner.position.x, "z": partner.position.z}}, action


def companion_snapshot(session: Any, companion_id: str = "partner") -> dict:
    partner = session.state.get_player(companion_id)
    runtime = session.companion_states[companion_id]
    intent = runtime.last_intent or decide_companion_intent(session, companion_id)
    return {
        **intent,
        "companion_id": companion_id,
        "partner_position": {
            "x": partner.position.x if partner else 0.0,
            "z": partner.position.z if partner else 0.0,
        },
    }


def _distance(first: Any, second: Any) -> float:
    if not first.shares_floor_with(second):
        return math.inf
    return math.hypot(first.position.x - second.position.x, first.position.z - second.position.z)


def _intent(state: str, target_id: str | None, target: Any, reason: str) -> dict:
    position = {"x": target.position.x, "z": target.position.z} if target else {"x": 0.0, "z": 0.0}
    return {"state": state, "target_id": target_id, "target": position, "reason": reason}


# ---------------------------------------------------------------------------
# S4: action에 speech_event를 생성 + B4: 행동-음성 일치
# ---------------------------------------------------------------------------

# action type → (speech intent, 메시지 템플릿)
_ACTION_SPEECH_MAP: dict[str, tuple[SpeechIntent, str]] = {
    "report": (SpeechIntent.REPORT_OBSERVATION, "{zone} 구역에서 {color} {mesh} 후보를 발견했어."),
    "seeker_report": (SpeechIntent.REPORT_OBSERVATION, "술래를 봤어! 조심해!"),
    "inspect": (SpeechIntent.DECLARE_ACTION, "이 후보를 조사할게."),
    "rescue": (SpeechIntent.DECLARE_ACTION, "내가 구조하러 갈게!"),
    "escape": (SpeechIntent.DECLARE_ACTION, "탈출구로 달려갈게!"),
    "trap": (SpeechIntent.REPORT_OBSERVATION, "트랩에 걸렸어!"),
    "vertical_objective": (SpeechIntent.REPORT_OBSERVATION, "장치를 찾았어."),
    "rooftop_signal_observed": (SpeechIntent.REPORT_OBSERVATION, "담당 중계기 위치를 확보했어. 입력은 네가 맡아!"),
    "route_scout_report": (SpeechIntent.REPORT_OBSERVATION, "다음 층으로 이어지는 경로를 확인했어."),
    "floor_transition": (SpeechIntent.DECLARE_ACTION, "다음 층으로 이동할게!"),
    "intercom_report": (SpeechIntent.REPORT_OBSERVATION, "인터폰에서 기호가 보여!"),
    "simultaneous_ready": (SpeechIntent.DECLARE_ACTION, "준비됐어! 동시에 작동하자!"),
    "basement_device_report": (SpeechIntent.REPORT_OBSERVATION, "장치 상태를 확인했어!"),
}


def create_action_speech(
    companion_id: str,
    action: dict,
    intent_state: str,
    seeker_distance: float | None,
    forbidden_words: list[str] | None = None,
) -> SpeechEvent | None:
    """B4: action에 대응하는 speech_event를 생성한다. 행동과 음성이 일치함을 보장."""
    action_type = action.get("type", "")
    mapping = _ACTION_SPEECH_MAP.get(action_type)
    if mapping is None:
        return None

    speech_intent, template = mapping

    # 메시지 구성
    if action_type == "report":
        appearance = action.get("appearance", {})
        text = template.format(
            zone=action.get("zone", "?"),
            color=appearance.get("color", "?"),
            mesh=appearance.get("mesh", "물체"),
        )
    else:
        text = template

    # S4: 금기어 회피 연출
    if forbidden_words:
        text, was_avoided = avoid_forbidden_words(text, forbidden_words)
        if was_avoided:
            speech_intent = SpeechIntent.FORBIDDEN_AVOIDANCE

    is_urgent = action_type in {"rescue", "trap", "seeker_report"}
    mode = select_speech_mode(intent_state, seeker_distance, is_urgent)

    return build_speech_event(
        speaker=companion_id,
        intent=speech_intent,
        text=text,
        mode=mode,
        intent_state=intent_state,
        seeker_distance=seeker_distance,
        facts={"action_type": action_type, "action": action},
    )
