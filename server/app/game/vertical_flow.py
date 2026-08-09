"""기획 4 층별 미션 상호작용의 서버 권위 판정."""

from __future__ import annotations

import math
import time
from typing import Any

from app.game.map_slots import elevator_slot, get_map_slot
from app.ai.vertical_missions import ROOFTOP_SIGNAL_SLOT_BY_ID
from app.game.progression import FinalRoute, InvalidProgression, VerticalRoundPhase, WorldFloor
from app.game.state import PlayerRole, PlayerStatus


# 클라이언트는 2.25m 안에서만 E 안내를 연다. 서버는 10Hz 위치 동기화와
# 왕복 지연 중 최대 약 0.5~0.7m의 좌표 차이가 생겨도 이미 표시된 상호작용을
# 거절하지 않도록 권위 판정에만 작은 여유를 둔다.
MISSION_INTERACTION_RADIUS = 3.0
FLOOR_CROSSING_RADIUS = 1.35
BROADCAST_MISSION_PROMPT = (
    "긴급 방송 원문: ‘열쇠로 잠긴 문을 열어라.’ 그대로 읽으면 비공개 금기어에 "
    "걸릴 수 있습니다. Q로 도구·잠긴 출입구·개방 행동의 뜻을 모두 다른 말로 전달하세요."
)
BROADCAST_TOOL_CUES = ("열쇠", "키", "금속", "도구", "쇠", "작은 물건")
BROADCAST_EXIT_CUES = ("문", "출입구", "입구", "통로", "잠긴 곳", "잠금")
BROADCAST_ACTION_CUES = ("열어", "여는", "열다", "열게", "열 수", "개방", "통과", "풀", "해제")
BROADCAST_MEANING_LABELS = {
    "tool": "문을 여는 도구",
    "exit": "잠긴 출입구",
    "action": "개방 행동",
}
VERTICAL_SPELL_WORDS = ("달빛", "교정", "탈출")
MISSION_SLOT_BY_PHASE = {
    VerticalRoundPhase.ROOFTOP_INTRO: "ROOF_INTRO_MISSION",
    VerticalRoundPhase.FLOOR_3: "F3_BROADCAST_CONSOLE",
    VerticalRoundPhase.FLOOR_2: "F2_INTERCOM_B",
    VerticalRoundPhase.FLOOR_1: "F1_DEVICE_A",
    VerticalRoundPhase.FIELD_FINAL: "FIELD_FINAL_STATION_B",
    VerticalRoundPhase.BASEMENT_FINAL: "BASEMENT_FINAL_DEVICE_POOL",
}
VERTICAL_CLUE_BY_PHASE = {
    VerticalRoundPhase.FLOOR_3: {
        "fragment_id": "moon_signal",
        "symbol": "☾",
        "riddle": "밤하늘의 달에서 퍼지는 빛 · 두 글자",
        "relation": "세로선의 맨 위에서 시작",
        "total": 3,
    },
    VerticalRoundPhase.FLOOR_2: {
        "fragment_id": "correction_signal",
        "symbol": "↺",
        "riddle": "틀린 답을 바르게 고치는 일 · 두 글자",
        "relation": "달 표식 다음, 출구 표식 이전",
        "total": 3,
    },
    VerticalRoundPhase.FLOOR_1: {
        "fragment_id": "escape_signal",
        "symbol": "⇥",
        "riddle": "갇힌 곳을 벗어나 밖으로 나감 · 두 글자",
        "relation": "세로선의 맨 아래에서 끝",
        "total": 3,
    },
}

TRANSITION_SLOTS_BY_PHASE = {
    VerticalRoundPhase.FLOOR_2: {
        "west": ("F3_F2_STAIR_WEST_TOP_CROSSING", "F3_F2_STAIR_WEST_BOTTOM_CROSSING"),
        "east": ("F3_F2_STAIR_EAST_TOP_CROSSING", "F3_F2_STAIR_EAST_BOTTOM_CROSSING"),
    },
    VerticalRoundPhase.FLOOR_1: {
        "west": ("F2_F1_STAIR_WEST_TOP_CROSSING", "F2_F1_STAIR_WEST_BOTTOM_CROSSING"),
        "east": ("F2_F1_STAIR_EAST_TOP_CROSSING", "F2_F1_STAIR_EAST_BOTTOM_CROSSING"),
    },
    VerticalRoundPhase.FIELD_FINAL: {
        "field": ("F1_FIELD_INSIDE_CROSSING", "F1_FIELD_OUTSIDE_CROSSING"),
    },
    VerticalRoundPhase.BASEMENT_FINAL: {
        "basement": ("F1_B1_STAIR_WEST_TOP_CROSSING", "F1_B1_STAIR_WEST_BOTTOM_CROSSING"),
    },
}
TRANSITION_PATH_BY_PHASE_ROUTE = {
    (VerticalRoundPhase.FLOOR_2, "west"): "F3_F2_STAIRS_WEST",
    (VerticalRoundPhase.FLOOR_2, "east"): "F3_F2_STAIRS_EAST",
    (VerticalRoundPhase.FLOOR_1, "west"): "F2_F1_STAIRS_WEST",
    (VerticalRoundPhase.FLOOR_1, "east"): "F2_F1_STAIRS_EAST",
    (VerticalRoundPhase.FIELD_FINAL, "field"): "F1_FIELD_DOOR",
    (VerticalRoundPhase.BASEMENT_FINAL, "basement"): "F1_B1_STAIRS_WEST",
}
FLOOR_CLOSED_AFTER_PHASE = {
    VerticalRoundPhase.FLOOR_3: WorldFloor.ROOF,
    VerticalRoundPhase.FLOOR_2: WorldFloor.F3,
    VerticalRoundPhase.FLOOR_1: WorldFloor.F2,
}
FINAL_STATION_SLOT_BY_ACTOR = {
    "partner": "FIELD_FINAL_STATION_A",
    "partner-2": "FIELD_FINAL_STATION_C",
}
def mission_interaction_position(phase: VerticalRoundPhase) -> tuple[float, float, float]:
    try:
        slot = get_map_slot(MISSION_SLOT_BY_PHASE[phase])
    except KeyError as error:
        raise InvalidProgression(f"{phase.value}에는 활성 미션 상호작용이 없다") from error
    position = slot.get("interactionPosition") or slot.get("position")
    if not position:
        raise InvalidProgression(f"{phase.value} 미션에 상호작용 좌표가 없다")
    return tuple(float(value) for value in position)


def final_station_position(actor_id: str) -> tuple[float, float, float]:
    slot_id = FINAL_STATION_SLOT_BY_ACTOR.get(actor_id, "FIELD_FINAL_STATION_B")
    return tuple(float(value) for value in get_map_slot(slot_id)["position"])


def final_escape_slot(session: Any) -> dict:
    slot_id = (
        "BASEMENT_ESCAPE_GATE"
        if session.vertical_round.final_route == FinalRoute.BASEMENT
        else "FIELD_ESCAPE_GATE"
    )
    return get_map_slot(slot_id)


def final_escape_position(session: Any) -> tuple[float, float, float]:
    return tuple(float(value) for value in final_escape_slot(session)["position"])


def activate_final_station(session: Any, actor_id: str) -> dict:
    if session.vertical_round.phase != VerticalRoundPhase.FIELD_FINAL:
        raise InvalidProgression("운동장 파이널 단계가 아니다")
    actor = session.state.get_player(actor_id)
    if not actor or actor.status != PlayerStatus.ALIVE or actor.role == PlayerRole.SEEKER:
        raise InvalidProgression("살아 있는 도망자만 파이널 장치를 맡을 수 있다")
    x, _, z = final_station_position(actor_id)
    if actor.position.floor != WorldFloor.FIELD:
        raise InvalidProgression("운동장에 도착해야 한다")
    if math.hypot(actor.position.x - x, actor.position.z - z) > MISSION_INTERACTION_RADIUS:
        raise InvalidProgression("자신의 파이널 장치와 거리가 너무 멀다")
    session.final_station_actor_ids.add(actor_id)
    alive_runners = {
        player.player_id for player in session.state.players.values()
        if player.role != PlayerRole.SEEKER and player.status == PlayerStatus.ALIVE
    }
    ready = alive_runners.issubset(session.final_station_actor_ids)
    return {"actor_id": actor_id, "ready_count": len(session.final_station_actor_ids), "required_count": len(alive_runners), "all_ready": ready}


def evaluate_broadcast_phrase(transcript: str) -> dict:
    """3층 방송 문구가 핵심 의미 세 가지를 모두 전달했는지 판정한다."""
    normalized = " ".join(transcript.strip().lower().split())
    matched = {
        "tool": any(cue in normalized for cue in BROADCAST_TOOL_CUES),
        "exit": any(cue in normalized for cue in BROADCAST_EXIT_CUES),
        "action": any(cue in normalized for cue in BROADCAST_ACTION_CUES),
    }
    return {
        "success": all(matched.values()),
        "matched": matched,
        "missing": [name for name, present in matched.items() if not present],
        "missing_labels": [
            BROADCAST_MEANING_LABELS[name]
            for name, present in matched.items() if not present
        ],
    }


def validate_current_stage_interaction(session: Any, actor_id: str) -> None:
    """진행 변경 없이 현재 미션 장치 상호작용 가능 여부만 검사한다."""
    if not session.vertical_progression_enabled:
        raise InvalidProgression("수직 진행이 아직 활성화되지 않았다")
    actor = session.state.get_player(actor_id)
    if (
        actor is None
        or actor.role not in {PlayerRole.HUMAN, PlayerRole.AI_PARTNER}
        or actor.status != PlayerStatus.ALIVE
    ):
        raise InvalidProgression("살아 있는 도망자만 층 미션을 완료할 수 있다")
    target_x, _, target_z = mission_interaction_position(session.vertical_round.phase)
    if actor.position.floor != session.vertical_round.policy.active_floor:
        raise InvalidProgression("현재 활성 층의 actor만 미션을 완료할 수 있다")
    if math.hypot(actor.position.x - target_x, actor.position.z - target_z) > MISSION_INTERACTION_RADIUS:
        raise InvalidProgression("미션 장치와 거리가 너무 멀다")


def activate_rooftop_signal(session: Any, actor_id: str, signal_id: str) -> dict:
    """서버 권위 좌표와 순서로 옥상 신호 콘솔 한 곳을 동기화한다."""
    if not session.vertical_progression_enabled:
        raise InvalidProgression("수직 진행이 아직 활성화되지 않았다")
    if session.vertical_round.phase != VerticalRoundPhase.ROOFTOP_INTRO:
        raise InvalidProgression("옥상 기억 신호 입력 단계가 아니다")
    actor = session.state.get_player(actor_id)
    if (
        actor is None
        or actor.role not in {PlayerRole.HUMAN, PlayerRole.AI_PARTNER}
        or actor.status != PlayerStatus.ALIVE
        or actor.position.floor != WorldFloor.ROOF
    ):
        raise InvalidProgression("옥상의 살아 있는 도망자만 신호를 동기화할 수 있다")
    if session.vertical_missions is None:
        raise InvalidProgression("옥상 신호 미션이 초기화되지 않았다")
    try:
        slot = get_map_slot(ROOFTOP_SIGNAL_SLOT_BY_ID[signal_id])
    except KeyError as error:
        raise InvalidProgression("존재하지 않는 옥상 신호 장치다") from error
    sx, _, sz = slot.get("interactionPosition", slot["position"])
    if math.hypot(actor.position.x - sx, actor.position.z - sz) > MISSION_INTERACTION_RADIUS:
        raise InvalidProgression("옥상 신호 장치와 거리가 너무 멀다")
    result = session.vertical_missions.rooftop.activate(signal_id)
    if not result.get("success"):
        expected_signal_id = str(result.get("expected_signal_id", ""))
        signal_labels = {"center": "중앙", "east": "동쪽", "west": "서쪽"}
        expected_label = signal_labels.get(expected_signal_id, "다음")
        if result.get("reason") == "already_active":
            active_label = signal_labels.get(signal_id, "현재")
            raise InvalidProgression(
                f"이미 입력한 {active_label} 신호다. 다음은 {expected_label} 신호다"
            )
        raise InvalidProgression(
            f"입력 순서가 다르다. 다음은 {expected_label} 신호다. R로 전체 순서를 다시 볼 수 있다"
        )
    return result


def complete_current_stage(session: Any, actor_id: str) -> dict:
    if not session.vertical_progression_enabled:
        raise InvalidProgression("수직 진행이 아직 활성화되지 않았다")
    phase = session.vertical_round.phase

    if phase in {VerticalRoundPhase.ROOFTOP_INTRO, VerticalRoundPhase.FLOOR_3}:
        actor = session.state.get_player(actor_id)
        if (
            actor is None
            or actor.role not in {PlayerRole.HUMAN, PlayerRole.AI_PARTNER}
            or actor.status != PlayerStatus.ALIVE
        ):
            raise InvalidProgression("살아 있는 도망자만 층 미션을 완료할 수 있다")
        if actor.position.floor != session.vertical_round.policy.active_floor:
            raise InvalidProgression("현재 활성 층의 actor만 미션을 완료할 수 있다")
        if (
            phase == VerticalRoundPhase.ROOFTOP_INTRO
            and (session.vertical_missions is None or not session.vertical_missions.rooftop.completed)
        ):
            raise InvalidProgression("옥상 신호 세 곳을 순서대로 동기화해야 한다")
        if (
            phase == VerticalRoundPhase.FLOOR_3
            and (session.vertical_missions is None or not session.vertical_missions.broadcast.completed)
        ):
            raise InvalidProgression("3층 AI 후보 확인을 먼저 완료해야 한다")
    else:
        validate_current_stage_interaction(session, actor_id)

    # 2층: 인터폰 미션 완료 여부 검사
    if phase == VerticalRoundPhase.FLOOR_2 and session.vertical_missions is not None:
        from app.ai.vertical_missions import VerticalMissions
        vm: VerticalMissions = session.vertical_missions
        if not vm.intercom.completed:
            raise InvalidProgression("2층 인터폰 미션을 먼저 완료해야 한다")

    # 1층: 동시 조작 미션 완료 여부 검사
    if phase == VerticalRoundPhase.FLOOR_1 and session.vertical_missions is not None:
        from app.ai.vertical_missions import VerticalMissions
        vm_f1: VerticalMissions = session.vertical_missions
        if not vm_f1.simultaneous.completed:
            raise InvalidProgression("1층 동시 조작 미션을 먼저 완료해야 한다")

    floor_to_close = FLOOR_CLOSED_AFTER_PHASE.get(phase)
    if floor_to_close is not None:
        stranded = sorted(
            player.player_id for player in session.state.players.values()
            if player.role != PlayerRole.SEEKER
            and player.status in {PlayerStatus.ALIVE, PlayerStatus.FROZEN}
            and player.position.floor == floor_to_close
        )
        if stranded:
            raise InvalidProgression(
                f"{floor_to_close.value}에 남은 팀원이 있어 다음 구역을 열 수 없다: "
                + ", ".join(stranded)
            )

    session.vertical_round.mark_mission_complete()
    next_phase = session.vertical_round.advance()
    if next_phase == VerticalRoundPhase.FINAL_ROUTE_REVEAL:
        route = getattr(session, "final_route_choice", FinalRoute.FIELD)
        next_phase = session.vertical_round.advance(final_route=route)
    return {
        "completed_phase": phase.value,
        "next_phase": next_phase.value,
        "progression": session.vertical_progression_payload(),
        "clue": VERTICAL_CLUE_BY_PHASE.get(phase),
    }


def start_intercom_mission(session: Any) -> dict:
    """2층 인터폰 미션을 시작한다. AI를 인터폰 위치로 보낸다."""
    if session.vertical_missions is None:
        raise InvalidProgression("수직 미션이 초기화되지 않았다")
    from app.ai.vertical_missions import VerticalMissions
    vm: VerticalMissions = session.vertical_missions
    intercom = vm.intercom
    if intercom.completed:
        raise InvalidProgression("인터폰 미션은 이미 완료되었다")
    import time as _time
    intercom.started_at = _time.time()
    ai_slot = get_map_slot(intercom.ai_position_slot)
    human_slot = get_map_slot(intercom.human_position_slot)
    return {
        "mission": "floor_2_intercom",
        "prompt": "AI 동료가 다른 교실의 기호를 읽으면, 들은 색과 도형을 순서대로 말하세요.",
        "ai_position": ai_slot["position"],
        "human_position": human_slot["position"],
        "ai_companion_id": intercom.ai_companion_id,
        "sequence_count": len(intercom.sequence),
    }


def submit_intercom_answer(session: Any, actor_id: str, transcript: str) -> dict:
    """플레이어 음성 답변을 판정한다."""
    if session.vertical_missions is None:
        raise InvalidProgression("수직 미션이 초기화되지 않았다")
    from app.ai.vertical_missions import VerticalMissions
    vm: VerticalMissions = session.vertical_missions
    intercom = vm.intercom
    if intercom.completed:
        raise InvalidProgression("인터폰 미션은 이미 완료되었다")
    if intercom.started_at is None:
        raise InvalidProgression("인터폰 장치를 먼저 활성화해야 한다")
    if not intercom.ai_arrived:
        raise InvalidProgression("AI 동료의 기호 보고를 먼저 들어야 한다")

    actor = session.state.get_player(actor_id)
    if actor is None or actor.status != PlayerStatus.ALIVE:
        raise InvalidProgression("살아 있는 도망자만 답변할 수 있다")

    human_slot = get_map_slot(intercom.human_position_slot)
    hx, _, hz = human_slot["position"]
    if math.hypot(actor.position.x - hx, actor.position.z - hz) > MISSION_INTERACTION_RADIUS:
        raise InvalidProgression("인터폰 장치와 거리가 너무 멀다")

    result = intercom.check_answer(transcript)
    return {
        "mission": "floor_2_intercom",
        "actor_id": actor_id,
        **result,
    }


def activate_simultaneous_device(session: Any, actor_id: str, device: str) -> dict:
    """동시 조작 장치를 활성화하고 동시성을 검증한다."""
    if session.vertical_missions is None:
        raise InvalidProgression("수직 미션이 초기화되지 않았다")
    from app.ai.vertical_missions import VerticalMissions
    vm: VerticalMissions = session.vertical_missions
    sim = vm.simultaneous
    if sim.completed:
        raise InvalidProgression("동시 조작 미션은 이미 완료되었다")

    actor = session.state.get_player(actor_id)
    if actor is None or actor.status != PlayerStatus.ALIVE:
        raise InvalidProgression("살아 있는 도망자만 장치를 작동할 수 있다")

    slot_id = sim.device_a_slot if device == "A" else sim.device_b_slot
    slot = get_map_slot(slot_id)
    sx, _, sz = slot["position"]
    if math.hypot(actor.position.x - sx, actor.position.z - sz) > MISSION_INTERACTION_RADIUS:
        raise InvalidProgression("장치와 거리가 너무 멀다")

    result = sim.activate_device(device)
    return {
        "mission": "floor_1_simultaneous",
        "actor_id": actor_id,
        "device": device,
        **result,
    }


def start_security_guidance(session: Any, actor_id: str) -> dict:
    """1층 경비실 CCTV 관제를 시작하고 첫 음성 방향 표식을 공개한다."""
    if session.vertical_round.phase != VerticalRoundPhase.FLOOR_1:
        raise InvalidProgression("1층 관제 미션 단계가 아니다")
    validate_current_stage_interaction(session, actor_id)
    if session.vertical_missions is None:
        raise InvalidProgression("수직 미션이 초기화되지 않았다")
    mission = session.vertical_missions.simultaneous
    state = mission.start_guidance(actor_id)
    return {
        "mission": "floor_1_security_guidance",
        "prompt": (
            "CCTV의 안전 표식을 보고 Q로 AI에게 방향을 알려 주세요. "
            f"첫 표식: {state['expected_command']}"
        ),
        **state,
    }


def submit_security_direction(session: Any, actor_id: str, transcript: str) -> dict:
    """경비실 앞 인간 발화로만 AI의 다음 관제 경로를 승인한다."""
    if session.vertical_round.phase != VerticalRoundPhase.FLOOR_1:
        raise InvalidProgression("1층 관제 미션 단계가 아니다")
    validate_current_stage_interaction(session, actor_id)
    if session.vertical_missions is None:
        raise InvalidProgression("수직 미션이 초기화되지 않았다")
    mission = session.vertical_missions.simultaneous
    if mission.guidance_actor_id != actor_id:
        raise InvalidProgression("관제 장치를 시작한 플레이어만 방향을 전달할 수 있다")
    return {
        "mission": "floor_1_security_guidance",
        "actor_id": actor_id,
        **mission.submit_direction(transcript),
    }


def use_open_floor_transition(session: Any, actor_id: str, route: str) -> dict:
    """실제 계단 또는 문 반대편 경계에 도착한 actor의 층 권위를 바꾼다."""
    if not session.vertical_progression_enabled:
        raise InvalidProgression("수직 진행이 아직 활성화되지 않았다")
    actor = session.state.get_player(actor_id)
    if actor is None or actor.status != PlayerStatus.ALIVE or actor.role == PlayerRole.SEEKER:
        raise InvalidProgression("살아 있는 도망자만 층을 이동할 수 있다")

    phase = session.vertical_round.phase
    routes = TRANSITION_SLOTS_BY_PHASE.get(phase, {})
    if route not in routes:
        raise InvalidProgression("현재 단계에서 사용할 수 없는 층 이동 경로다")
    first_id, second_id = routes[route]
    first = get_map_slot(first_id)
    second = get_map_slot(second_id)
    if actor.position.floor.value == first["floor"]:
        source, destination = first, second
    elif actor.position.floor.value == second["floor"]:
        source, destination = second, first
    else:
        raise InvalidProgression("출발 층이 일치하지 않는다")
    accessible_floors = session.vertical_round.accessible_floors
    if (
        WorldFloor(source["floor"]) not in accessible_floors
        or WorldFloor(destination["floor"]) not in accessible_floors
    ):
        raise InvalidProgression("닫혔거나 아직 열리지 않은 층 이동 경로다")
    # actor의 서버 floor는 계단을 걷는 동안 출발 층을 유지한다. 따라서
    # 승인 위치는 출발 문이 아니라 실제로 걸어 도착한 반대편 경계다.
    crossing_position = destination["position"]
    if math.hypot(
        actor.position.x - crossing_position[0], actor.position.z - crossing_position[2]
    ) > FLOOR_CROSSING_RADIUS:
        raise InvalidProgression("계단 또는 출입문 반대편 경계까지 직접 이동해야 한다")

    destination_floor = WorldFloor(destination["floor"])
    x, y, z = destination["position"]
    actor.position.x, actor.position.y, actor.position.z = x, y, z
    actor.position.floor = destination_floor
    actor.position.zone = destination["zone"]
    closed_floor = refresh_closing_floor(session)
    return {
        "actor_id": actor_id,
        "route": route,
        "traversal": "door" if route == "field" else "stairs",
        "path_id": TRANSITION_PATH_BY_PHASE_ROUTE[(phase, route)],
        "direction": (
            "down" if source["position"][1] > destination["position"][1]
            else "up" if source["position"][1] < destination["position"][1]
            else "out" if source["floor"] == WorldFloor.F1.value
            else "in"
        ),
        "position": {
            "x": x, "y": y, "z": z,
            "floor": destination_floor.value,
            "zone": destination["zone"],
        },
        "closed_floor": closed_floor.value if closed_floor else None,
        "progression": session.vertical_progression_payload(),
    }


def cross_rooftop_stair_boundary(
    session: Any, actor_id: str, direction: str,
) -> dict:
    """옥상과 3층 사이 실제 계단 끝에서만 층 권위를 전환한다."""
    if not session.vertical_progression_enabled:
        raise InvalidProgression("수직 진행이 아직 활성화되지 않았다")
    if session.vertical_round.phase != VerticalRoundPhase.FLOOR_3:
        raise InvalidProgression("옥상과 3층 계단을 이용할 수 있는 단계가 아니다")
    actor = session.state.get_player(actor_id)
    if actor is None or actor.status != PlayerStatus.ALIVE or actor.role == PlayerRole.SEEKER:
        raise InvalidProgression("살아 있는 도망자만 계단을 이용할 수 있다")

    boundary_by_direction = {
        "down": (
            WorldFloor.ROOF,
            WorldFloor.F3,
            get_map_slot("ROOF_TO_F3_STAIR_BOTTOM_CROSSING"),
        ),
        "up": (
            WorldFloor.F3,
            WorldFloor.ROOF,
            get_map_slot("F3_TO_ROOF_STAIR_TOP_CROSSING"),
        ),
    }
    try:
        source_floor, destination_floor, boundary = boundary_by_direction[direction]
    except KeyError as error:
        raise InvalidProgression("정의되지 않은 계단 이동 방향이다") from error
    if actor.position.floor != source_floor:
        raise InvalidProgression("계단 출발 층이 일치하지 않는다")
    accessible_floors = session.vertical_round.accessible_floors
    if source_floor not in accessible_floors or destination_floor not in accessible_floors:
        raise InvalidProgression("닫혔거나 아직 열리지 않은 계단이다")

    x, y, z = boundary["position"]
    if math.hypot(actor.position.x - x, actor.position.z - z) > 1.4:
        raise InvalidProgression("계단 끝 경계와 거리가 너무 멀다")
    actor.position.x, actor.position.y, actor.position.z = x, y, z
    actor.position.floor = destination_floor
    actor.position.zone = boundary["zone"]
    closed_floor = refresh_closing_floor(session)
    return {
        "actor_id": actor_id,
        "route": "roof_f3_stairs",
        "traversal": "stairs",
        "direction": direction,
        "position": {
            "x": x, "y": y, "z": z,
            "floor": destination_floor.value,
            "zone": boundary["zone"],
        },
        "closed_floor": closed_floor.value if closed_floor else None,
        "progression": session.vertical_progression_payload(),
    }


def refresh_closing_floor(session: Any) -> WorldFloor | None:
    """필수 actor가 모두 떠난 폐쇄 대기 층을 안전하게 닫는다."""
    pending = session.vertical_round.closing_pending_floor
    if pending is None:
        return None
    has_runner = any(
        player.role != PlayerRole.SEEKER
        and player.status in {PlayerStatus.ALIVE, PlayerStatus.FROZEN}
        and player.position.floor == pending
        for player in session.state.players.values()
    )
    if has_runner:
        return None
    return session.vertical_round.close_pending_floor()


# ---------------------------------------------------------------------------
# 지하 파이널 핸들러
# ---------------------------------------------------------------------------


def activate_basement_device(session: Any, actor_id: str, device_id: str) -> dict:
    """지하 파이널에서 장치를 활성화한다."""
    if session.vertical_round.phase != VerticalRoundPhase.BASEMENT_FINAL:
        raise InvalidProgression("지하 파이널 단계가 아니다")
    actor = session.state.get_player(actor_id)
    if not actor or actor.status != PlayerStatus.ALIVE:
        raise InvalidProgression("살아 있는 도망자만 장치를 활성화할 수 있다")
    if not session.vertical_missions:
        raise InvalidProgression("수직 미션이 초기화되지 않았다")

    bm = session.vertical_missions.basement
    device = next(
        (candidate for candidate in bm.devices if candidate.device_id == device_id),
        None,
    )
    if device is None:
        raise InvalidProgression("존재하지 않는 지하 장치다")
    slot = get_map_slot(device.slot_id)
    sx, _, sz = slot["position"]
    if actor.position.floor != WorldFloor.B1:
        raise InvalidProgression("지하 1층 장치 앞에 도착해야 한다")
    if math.hypot(actor.position.x - sx, actor.position.z - sz) > MISSION_INTERACTION_RADIUS:
        raise InvalidProgression("지하 장치와 거리가 너무 멀다")
    companion_owner = {"panel": "partner", "valve": "partner-2"}.get(device_id)
    if companion_owner is not None:
        if actor_id != companion_owner:
            return {
                "actor_id": actor_id,
                "device_id": device_id,
                "success": False,
                "reason": "companion_operated",
                "companion_id": companion_owner,
            }
        if device_id not in bm.commanded_device_ids:
            return {
                "actor_id": actor_id,
                "device_id": device_id,
                "success": False,
                "reason": "awaiting_command",
            }
    elif actor.role != PlayerRole.HUMAN:
        return {
            "actor_id": actor_id,
            "device_id": device_id,
            "success": False,
            "reason": "human_operated",
        }
    result = bm.activate_device(device_id, actor_id)
    return {"actor_id": actor_id, "device_id": device_id, **result}


def get_basement_device_status(session: Any, actor_id: str, device_id: str) -> dict:
    """장치 앞에 있는 actor만 장치 상태를 확인할 수 있다."""
    # 위치 검증은 호출 측에서 처리
    if not session.vertical_missions:
        raise InvalidProgression("수직 미션이 초기화되지 않았다")
    status = session.vertical_missions.basement.get_device_status(device_id)
    if not status:
        raise InvalidProgression("존재하지 않는 장치다")
    return status


BASEMENT_DEVICE_COMMAND_CUES = {
    "panel": ("배전반", "전기판", "전원판", "첫 장치"),
    "valve": ("밸브", "급수", "물 장치", "두 번째 장치"),
    "generator": ("발전기", "비상 전원", "마지막 장치"),
}
BASEMENT_ACTIVATION_CUES = ("작동", "켜", "올려", "돌려", "가동", "시작")


def parse_basement_device_command(transcript: str) -> str | None:
    normalized = " ".join(transcript.strip().lower().split())
    if not any(cue in normalized for cue in BASEMENT_ACTIVATION_CUES):
        return None
    return next((
        device_id
        for device_id, cues in BASEMENT_DEVICE_COMMAND_CUES.items()
        if any(cue in normalized for cue in cues)
    ), None)


def command_basement_device(session: Any, actor_id: str, transcript: str) -> dict:
    """AI 담당 지하 장치에 대한 인간의 음성 작동 지시를 검증한다."""
    if session.vertical_round.phase != VerticalRoundPhase.BASEMENT_FINAL:
        raise InvalidProgression("지하 파이널 단계가 아니다")
    actor = session.state.get_player(actor_id)
    if not actor or actor.status != PlayerStatus.ALIVE or actor.role != PlayerRole.HUMAN:
        raise InvalidProgression("살아 있는 인간 플레이어만 지하 장치를 지시할 수 있다")
    device_id = parse_basement_device_command(transcript)
    if device_id is None:
        raise InvalidProgression("작동할 지하 장치와 행동을 함께 설명해야 한다")
    if session.vertical_missions is None:
        raise InvalidProgression("수직 미션이 초기화되지 않았다")
    return session.vertical_missions.basement.command_device(device_id, actor_id)


ELEVATOR_SOUND_PING_RADIUS = 25.0  # A5: 엘리베이터 도착 소리 핑 반경
ELEVATOR_CALL_TTL_SECONDS = 30.0


def call_elevator(session: Any, actor_id: str, elevator_id: str, target_floor: str) -> dict:
    """빈 엘리베이터 호출을 등록해 임의 도착 핑 위조를 막는다."""
    actor = session.state.get_player(actor_id)
    if not session.vertical_progression_enabled or not actor or actor.status != PlayerStatus.ALIVE:
        raise InvalidProgression("엘리베이터를 호출할 수 없는 actor다")
    try:
        destination = WorldFloor(target_floor)
        slot = elevator_slot(elevator_id)
    except (ValueError, KeyError) as error:
        raise InvalidProgression("정의되지 않은 엘리베이터 또는 호출 층이다") from error
    served = {WorldFloor(floor) for floor in slot["servedFloors"]}
    if destination != actor.position.floor or destination not in served:
        raise InvalidProgression("현재 승강장에서만 엘리베이터를 호출할 수 있다")
    if destination not in session.vertical_round.accessible_floors:
        raise InvalidProgression("아직 열리지 않은 층에서는 호출할 수 없다")
    landing_x, _, landing_z = slot.get("landingPosition", slot["position"])
    if math.hypot(actor.position.x - landing_x, actor.position.z - landing_z) > 2.6:
        raise InvalidProgression("승강장 호출 버튼 가까이에서만 호출할 수 있다")
    session.elevator_calls[elevator_id] = {
        "requested_by": actor_id,
        "target_floor": destination.value,
        "expires_at": time.monotonic() + ELEVATOR_CALL_TTL_SECONDS,
    }
    return {"actor_id": actor_id, "elevator_id": elevator_id, "target_floor": destination.value}


def request_elevator_trip(session: Any, actor_id: str, elevator_id: str, target_floor: str) -> dict:
    """카 내부 층 선택을 승인하고 모든 클라이언트에 동일 운행을 시작시킨다."""
    actor = session.state.get_player(actor_id)
    if not session.vertical_progression_enabled or not actor or actor.status != PlayerStatus.ALIVE:
        raise InvalidProgression("엘리베이터를 이용할 수 없는 actor다")
    try:
        destination = WorldFloor(target_floor)
        slot = elevator_slot(elevator_id)
    except (ValueError, KeyError) as error:
        raise InvalidProgression("정의되지 않은 엘리베이터 또는 목적 층이다") from error
    served = {WorldFloor(floor) for floor in slot["servedFloors"]}
    if actor.position.floor not in served or destination not in served:
        raise InvalidProgression("이 엘리베이터가 운행하지 않는 층이다")
    if destination not in session.vertical_round.accessible_floors:
        raise InvalidProgression("아직 열리지 않은 층으로는 이동할 수 없다")
    x, _, z = slot["position"]
    if math.hypot(actor.position.x - x, actor.position.z - z) > 2.1:
        raise InvalidProgression("엘리베이터 카 안에서만 층을 선택할 수 있다")
    session.elevator_calls[elevator_id] = {
        "requested_by": actor_id,
        "target_floor": destination.value,
        "expires_at": time.monotonic() + ELEVATOR_CALL_TTL_SECONDS,
        "ride": True,
    }
    return {"actor_id": actor_id, "elevator_id": elevator_id, "target_floor": destination.value}


def announce_elevator_arrival(session: Any, actor_id: str, elevator_id: str, target_floor: str) -> dict:
    """등록된 빈 카 호출의 도착 소리만 발생시키고 actor는 이동하지 않는다."""
    call = session.elevator_calls.get(elevator_id)
    if (
        not call or call["requested_by"] != actor_id
        or call["target_floor"] != target_floor or call.get("ride")
        or call["expires_at"] < time.monotonic()
    ):
        raise InvalidProgression("유효한 엘리베이터 호출 기록이 없다")
    slot = elevator_slot(elevator_id)
    session.elevator_calls.pop(elevator_id, None)
    x, _, z = slot["position"]
    return {
        "actor_id": actor_id,
        "elevator_id": elevator_id,
        "floor": target_floor,
        "sound_ping": {
            "position": {"x": float(x), "z": float(z)},
            "radius": ELEVATOR_SOUND_PING_RADIUS,
            "floor": target_floor,
            "source": "empty_elevator_arrival",
        },
    }


def use_elevator(session: Any, actor_id: str, elevator_id: str, target_floor: str) -> dict:
    """열린 층 사이의 엘리베이터 이동을 서버가 최종 승인한다.

    A5: 도착 시 소리 핑 발생. 술래도 사용 가능.
    """
    actor = session.state.get_player(actor_id)
    if not session.vertical_progression_enabled or not actor or actor.status != PlayerStatus.ALIVE:
        raise InvalidProgression("엘리베이터를 사용할 수 없는 actor다")
    # A5: 술래도 엘리베이터 사용 가능 (역할 제한 제거)
    try:
        destination = WorldFloor(target_floor)
        slot = elevator_slot(elevator_id)
        elevator_x, _, elevator_z = slot["position"]
    except (ValueError, KeyError) as error:
        raise InvalidProgression("정의되지 않은 엘리베이터 또는 목적 층이다") from error
    served_floors = {WorldFloor(floor) for floor in slot["servedFloors"]}
    if actor.position.floor not in served_floors:
        raise InvalidProgression("이 층에는 해당 엘리베이터 승강장이 없다")
    if destination not in session.vertical_round.accessible_floors:
        raise InvalidProgression("아직 열리지 않은 층으로는 이동할 수 없다")
    if destination not in served_floors:
        raise InvalidProgression("이 엘리베이터가 운행하지 않는 층이다")
    if math.hypot(actor.position.x - elevator_x, actor.position.z - elevator_z) > 2.1:
        raise InvalidProgression("엘리베이터 카 안에서만 층을 선택할 수 있다")
    trip = session.elevator_calls.get(elevator_id)
    if (
        not trip or not trip.get("ride") or trip["requested_by"] != actor_id
        or trip["target_floor"] != destination.value
        or trip["expires_at"] < time.monotonic()
    ):
        raise InvalidProgression("서버가 승인한 엘리베이터 운행이 아니다")
    actor.position.x, actor.position.z = elevator_x, elevator_z
    actor.position.y = {
        WorldFloor.B1: -3.6, WorldFloor.F1: 0.0, WorldFloor.F2: 3.6,
        WorldFloor.F3: 7.2, WorldFloor.ROOF: 10.8,
    }[destination]
    actor.position.floor = destination
    actor.position.zone = f"{elevator_id}_{destination.value.lower()}"
    session.elevator_calls.pop(elevator_id, None)
    return {
        "actor_id": actor_id, "elevator_id": elevator_id,
        "position": {"x": elevator_x, "y": actor.position.y, "z": elevator_z, "floor": destination.value, "zone": actor.position.zone},
        # A5: 도착 층에 소리 핑 발생 — 술래가 감지 가능
        "sound_ping": {
            "position": {"x": elevator_x, "z": elevator_z},
            "radius": ELEVATOR_SOUND_PING_RADIUS,
            "floor": destination.value,
            "source": "elevator_arrival",
        },
    }
