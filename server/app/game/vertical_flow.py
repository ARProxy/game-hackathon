"""기획 4 층별 미션 상호작용의 서버 권위 판정."""

from __future__ import annotations

import math
from typing import Any

from app.game.map_slots import get_map_slot
from app.game.progression import InvalidProgression, VerticalRoundPhase
from app.game.state import PlayerRole, PlayerStatus


MISSION_INTERACTION_RADIUS = 2.25
MISSION_SLOT_BY_PHASE = {
    VerticalRoundPhase.ROOFTOP_INTRO: "ROOF_INTRO_MISSION",
    VerticalRoundPhase.FLOOR_3: "F3_MISSION_ROOM_POOL",
    VerticalRoundPhase.FLOOR_2: "F2_MISSION_ROOM_POOL",
    VerticalRoundPhase.FLOOR_1: "F1_MISSION_ROOM_POOL",
    VerticalRoundPhase.FIELD_FINAL: "FIELD_FINAL_STATION_B",
    VerticalRoundPhase.BASEMENT_FINAL: "BASEMENT_FINAL_DEVICE_POOL",
}

TRANSITION_SLOTS_BY_PHASE = {
    VerticalRoundPhase.FLOOR_3: {
        "west": ("ROOF_TO_F3_FIRE_DOOR", "F3_TO_F2_STAIR_WEST"),
    },
    VerticalRoundPhase.FLOOR_2: {
        "west": ("F3_TO_F2_STAIR_WEST", "F2_TO_F1_STAIR_WEST"),
        "east": ("F3_TO_F2_STAIR_EAST", "F2_TO_F1_STAIR_EAST"),
    },
    VerticalRoundPhase.FLOOR_1: {
        "west": ("F2_TO_F1_STAIR_WEST", "F1_STAIR_ARRIVAL_WEST"),
        "east": ("F2_TO_F1_STAIR_EAST", "F1_STAIR_ARRIVAL_EAST"),
    },
}


def mission_interaction_position(phase: VerticalRoundPhase) -> tuple[float, float, float]:
    try:
        slot = get_map_slot(MISSION_SLOT_BY_PHASE[phase])
    except KeyError as error:
        raise InvalidProgression(f"{phase.value}에는 활성 미션 상호작용이 없다") from error
    position = slot.get("position") or slot.get("interactionPosition")
    if not position:
        raise InvalidProgression(f"{phase.value} 미션에 상호작용 좌표가 없다")
    return tuple(float(value) for value in position)


def complete_current_stage(session: Any, actor_id: str) -> dict:
    if not session.vertical_progression_enabled:
        raise InvalidProgression("수직 진행이 아직 활성화되지 않았다")
    actor = session.state.get_player(actor_id)
    if (
        actor is None
        or actor.role not in {PlayerRole.HUMAN, PlayerRole.AI_PARTNER}
        or actor.status != PlayerStatus.ALIVE
    ):
        raise InvalidProgression("살아 있는 도망자만 층 미션을 완료할 수 있다")

    phase = session.vertical_round.phase
    target_x, _, target_z = mission_interaction_position(phase)
    if actor.position.floor != session.vertical_round.policy.active_floor:
        raise InvalidProgression("현재 활성 층의 actor만 미션을 완료할 수 있다")
    if math.hypot(actor.position.x - target_x, actor.position.z - target_z) > MISSION_INTERACTION_RADIUS:
        raise InvalidProgression("미션 장치와 거리가 너무 멀다")

    session.vertical_round.mark_mission_complete()
    next_phase = session.vertical_round.advance()
    return {
        "completed_phase": phase.value,
        "next_phase": next_phase.value,
        "progression": session.vertical_round.to_dict(),
    }


def use_open_floor_transition(session: Any, actor_id: str, route: str) -> dict:
    if not session.vertical_progression_enabled:
        raise InvalidProgression("수직 진행이 아직 활성화되지 않았다")
    actor = session.state.get_player(actor_id)
    if actor is None or actor.status != PlayerStatus.ALIVE or actor.role == PlayerRole.SEEKER:
        raise InvalidProgression("살아 있는 도망자만 층을 이동할 수 있다")

    phase = session.vertical_round.phase
    routes = TRANSITION_SLOTS_BY_PHASE.get(phase, {})
    if route not in routes:
        raise InvalidProgression("현재 단계에서 사용할 수 없는 층 이동 경로다")
    source_id, destination_id = routes[route]
    source = get_map_slot(source_id)
    destination = get_map_slot(destination_id)
    source_position = source["position"]
    if actor.position.floor.value != source["floor"]:
        raise InvalidProgression("출발 층이 일치하지 않는다")
    if math.hypot(
        actor.position.x - source_position[0], actor.position.z - source_position[2]
    ) > MISSION_INTERACTION_RADIUS:
        raise InvalidProgression("열린 층 이동 경로와 거리가 너무 멀다")

    destination_floor = session.vertical_round.policy.active_floor
    if destination["floor"] != destination_floor.value:
        raise InvalidProgression("목적지가 현재 활성 층과 일치하지 않는다")
    x, y, z = destination["position"]
    actor.position.x, actor.position.y, actor.position.z = x, y, z
    actor.position.floor = destination_floor
    actor.position.zone = destination["zone"]
    return {
        "actor_id": actor_id,
        "route": route,
        "position": {
            "x": x, "y": y, "z": z,
            "floor": destination_floor.value,
            "zone": destination["zone"],
        },
    }
