"""서버 권위 AI 동료의 독립 목표, 기억, 이동 계약."""

from __future__ import annotations

import json
import math
import time
from pathlib import Path
from typing import Any

from app.ai.hunter import _safe_hunter_step
from app.game.authority import MovementSample, has_clear_catch_line
from app.game.state import GamePhase, PlayerRole, PlayerStatus

CONTRACT_PATH = Path(__file__).parents[3] / "client/src/game/companionContract.json"
with CONTRACT_PATH.open(encoding="utf-8") as contract_file:
    CONTRACT = json.load(contract_file)


def command_companion(session: Any, prop_id: str, position: dict, utterance: str) -> None:
    session.companion_command = {
        "prop_id": prop_id,
        "position": {"x": float(position["x"]), "z": float(position["z"])},
        "utterance": utterance,
        "timestamp": time.monotonic(),
    }
    session.companion_goal_changed_at = 0.0


def request_companion_rescue(session: Any, target_id: str) -> None:
    session.companion_rescue_request = target_id
    session.companion_goal_changed_at = 0.0


def decide_companion_intent(session: Any) -> dict:
    now = time.monotonic()
    partner = session.state.get_player("partner")
    seeker = session.state.get_player("seeker")
    if not partner or partner.status != PlayerStatus.ALIVE:
        return _intent("INCAPACITATED", None, partner, "partner_unavailable")

    if seeker and _distance(partner, seeker) <= CONTRACT["dangerDistance"] and has_clear_catch_line(
        (partner.position.x, partner.position.z), (seeker.position.x, seeker.position.z),
    ):
        previous_sighting = session.companion_last_seeker_seen
        session.companion_last_seeker_seen = {
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

    sighting = session.companion_last_seeker_seen
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
        if session.companion_rescue_request == target.player_id or waited >= CONTRACT["autoRescueDelaySeconds"]:
            return _intent("RESCUE_TEAMMATE", target.player_id, target, "assigned_rescue")

    if session.state.phase in {GamePhase.FINAL_SPELL, GamePhase.ESCAPE} and session.active_gate_id:
        state = "ESCAPE" if session.state.phase == GamePhase.ESCAPE else "MOVE_TO_GATE"
        return {
            "state": state, "target_id": None,
            "target": session.active_gate_payload()["position"],
            "reason": "team_objective",
        }

    command = session.companion_command
    if command:
        return {
            "state": "INSPECT_CANDIDATE", "target_id": command["prop_id"],
            "target": command["position"], "reason": "player_description",
        }

    mission = session.current_mission()
    if mission:
        candidates = [mission.real_prop, *mission.decoy_props]
        unexplored = [prop for prop in candidates if prop.prop_id not in session.companion_memory]
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
        return _intent("REPORT_FINDING", None, partner, "awaiting_player_description")

    return _intent("REGROUP", None, partner, "no_active_mission")


def advance_companion(session: Any) -> tuple[dict, dict | None]:
    now = time.monotonic()
    partner = session.state.get_player("partner")
    elapsed = now - session.companion_last_tick
    proposed = decide_companion_intent(session)
    previous = session.companion_last_intent
    urgent = proposed["state"] in {"AVOID_SEEKER", "RESCUE_TEAMMATE", "MOVE_TO_GATE", "ESCAPE"}
    if (
        previous and not urgent and session.companion_goal_changed_at
        and now - session.companion_goal_changed_at < CONTRACT["goalHoldSeconds"]
    ):
        intent = previous
    else:
        intent = proposed
        if not previous or (previous["state"], previous["target_id"]) != (intent["state"], intent["target_id"]):
            session.companion_goal_changed_at = now
    action = None
    if not partner:
        return intent, None

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
        )
        session.position_samples[partner.player_id] = MovementSample(partner.position.x, partner.position.z, now)

    arrived = math.hypot(
        intent["target"]["x"] - partner.position.x,
        intent["target"]["z"] - partner.position.z,
    ) <= CONTRACT["arrivalDistance"] + 0.05
    sighting = session.companion_last_seeker_seen
    if intent["state"] == "AVOID_SEEKER" and sighting and not sighting.get("reported"):
        sighting["reported"] = True
        action = {"type": "seeker_report", "position": sighting["position"]}
    elif intent["state"] == "EXPLORE_ZONE" and arrived and intent["target_id"] not in session.companion_memory:
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
        session.companion_memory[intent["target_id"]] = {
            "discovered_at": now, "position": intent["target"],
            "zone": action["zone"], "appearance": action["appearance"],
        }
    elif intent["state"] == "INSPECT_CANDIDATE" and arrived:
        if session.companion_goal_started is None:
            session.companion_goal_started = now
        elif now - session.companion_goal_started >= CONTRACT["inspectionDurationSeconds"]:
            action = {"type": "inspect", "prop_id": intent["target_id"]}
            session.companion_command = None
            session.companion_goal_started = None
    elif intent["state"] == "RESCUE_TEAMMATE" and distance <= CONTRACT["rescueDistance"]:
        action = {"type": "rescue", "target_id": intent["target_id"]}
        session.companion_rescue_request = None
    else:
        session.companion_goal_started = None

    session.companion_last_tick = now
    session.companion_last_intent = intent
    return {**intent, "partner_position": {"x": partner.position.x, "z": partner.position.z}}, action


def companion_snapshot(session: Any) -> dict:
    partner = session.state.get_player("partner")
    intent = session.companion_last_intent or decide_companion_intent(session)
    return {**intent, "partner_position": {"x": partner.position.x, "z": partner.position.z}}


def _distance(first: Any, second: Any) -> float:
    return math.hypot(first.position.x - second.position.x, first.position.z - second.position.z)


def _intent(state: str, target_id: str | None, target: Any, reason: str) -> dict:
    position = {"x": target.position.x, "z": target.position.z} if target else {"x": 0.0, "z": 0.0}
    return {"state": state, "target_id": target_id, "target": position, "reason": reason}
