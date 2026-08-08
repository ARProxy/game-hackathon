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
    urgent = proposed["state"] in {"AVOID_SEEKER", "RESCUE_TEAMMATE", "MOVE_TO_GATE", "ESCAPE"}
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
    speed_key = {
        "EXPLORE_ZONE": "exploreSpeed", "INSPECT_CANDIDATE": "missionSpeed",
        "AVOID_SEEKER": "avoidSpeed", "RESCUE_TEAMMATE": "rescueSpeed",
        "MOVE_TO_GATE": "gateSpeed", "ESCAPE": "gateSpeed",
    }.get(intent["state"])
    if speed_key and distance > CONTRACT["arrivalDistance"]:
        step = min(float(CONTRACT[speed_key]) * min(elapsed, 0.5), distance - CONTRACT["arrivalDistance"])
        partner.position.x, partner.position.z = _safe_hunter_step(
            partner.position.x, partner.position.z, intent["target"]["x"], intent["target"]["z"], step,
            partner.position.floor.value,
        )
        session.position_samples[partner.player_id] = MovementSample(partner.position.x, partner.position.z, now)

    arrived = math.hypot(
        intent["target"]["x"] - partner.position.x,
        intent["target"]["z"] - partner.position.z,
    ) <= CONTRACT["arrivalDistance"] + 0.05
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
    elif intent["state"] == "AVOID_SEEKER" and sighting and not sighting.get("reported"):
        sighting["reported"] = True
        action = {"type": "seeker_report", "position": sighting["position"]}
    elif intent["state"] == "EXPLORE_ZONE" and arrived and intent["target_id"] not in runtime.memory:
        if session.vertical_progression_enabled and session.round_data is None:
            runtime.memory[intent["target_id"]] = {
                "discovered_at": now,
                "position": intent["target"],
                "zone": session.vertical_round.phase.value,
            }
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
        "partner_position": {"x": partner.position.x, "z": partner.position.z},
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
