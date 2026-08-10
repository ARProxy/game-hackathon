"""옥상부터 두 파이널 탈출 개방까지의 결정적 무교착 자동 플레이."""

from app.ai.companion import advance_companion, decide_companion_intent
from app.ai.spell import check_spell
from app.game.map_slots import get_map_slot
from app.game.progression import FinalRoute, VerticalRoundPhase, WorldFloor
from app.game.session import GameSession
from app.game.state import GamePhase, PlayerRole
from app.game.vertical_flow import (
    activate_basement_device,
    activate_final_station,
    activate_rooftop_signal,
    activate_simultaneous_device,
    complete_current_stage,
    command_basement_device,
    cross_rooftop_stair_boundary,
    evaluate_broadcast_phrase,
    final_station_position,
    mission_interaction_position,
    start_intercom_mission,
    start_security_guidance,
    submit_intercom_answer,
    submit_security_direction,
    use_open_floor_transition,
)


RUNNER_IDS = ("human", "partner", "partner-2")


def _place_actor_at_slot(session: GameSession, actor_id: str, slot_id: str) -> None:
    actor = session.state.get_player(actor_id)
    slot = get_map_slot(slot_id)
    actor.position.x, actor.position.y, actor.position.z = slot.get(
        "interactionPosition", slot["position"],
    )
    actor.position.floor = WorldFloor(slot["floor"])
    actor.position.zone = slot["zone"]


def _move_all_through(session: GameSession, source_slot_id: str, route: str) -> None:
    crossing_by_source = {
        "F3_TO_F2_STAIR_EAST": "F3_F2_STAIR_EAST_BOTTOM_CROSSING",
        "F2_TO_F1_STAIR_EAST": "F2_F1_STAIR_EAST_BOTTOM_CROSSING",
        "F1_TO_FIELD_FIRE_DOOR": "F1_FIELD_OUTSIDE_CROSSING",
        "F1_TO_BASEMENT_FIRE_DOOR": "F1_B1_STAIR_WEST_BOTTOM_CROSSING",
    }
    crossing = get_map_slot(crossing_by_source[source_slot_id])
    for actor_id in RUNNER_IDS:
        actor = session.state.get_player(actor_id)
        actor.position.x, actor.position.y, actor.position.z = crossing["position"]
        use_open_floor_transition(session, actor_id, route)


def _walk_all_from_roof_to_f3(session: GameSession) -> None:
    for actor_id in RUNNER_IDS:
        _place_actor_at_slot(session, actor_id, "ROOF_TO_F3_STAIR_BOTTOM_CROSSING")
        cross_rooftop_stair_boundary(session, actor_id, "down")


def _complete_rooftop_through_floor_one(
    session: GameSession,
    final_route: FinalRoute,
) -> None:
    session.final_route_choice = final_route
    slot_by_signal = {
        "center": "ROOF_SIGNAL_CENTER",
        "east": "ROOF_SIGNAL_EAST",
        "west": "ROOF_SIGNAL_WEST",
    }
    for signal_id in session.vertical_missions.rooftop.sequence:
        _place_actor_at_slot(session, "human", slot_by_signal[signal_id])
        assert activate_rooftop_signal(session, "human", signal_id)["success"]
    assert complete_current_stage(session, "human")["next_phase"] == "floor_3"
    _walk_all_from_roof_to_f3(session)
    assert session.vertical_round.to_dict()["accessible_floors"] == ["F3"]

    human = session.state.get_player("human")
    x, y, z = mission_interaction_position(VerticalRoundPhase.FLOOR_3)
    human.position.x, human.position.y, human.position.z = x, y, z
    human.position.floor = WorldFloor.F3
    session.broadcast_mission_actor_id = "human"
    decision = session.vertical_missions.broadcast.decide(
        "은빛 작은 금속이고 잠긴 출입구를 여는 도구",
    )
    assert decision.target is not None
    assert session.vertical_missions.broadcast.inspect(decision.target.prop_id)["success"]
    session.broadcast_mission_actor_id = None
    assert complete_current_stage(session, "human")["next_phase"] == "floor_2"
    _move_all_through(session, "F3_TO_F2_STAIR_EAST", "east")

    x, y, z = mission_interaction_position(VerticalRoundPhase.FLOOR_2)
    human.position.x, human.position.y, human.position.z = x, y, z
    human.position.floor = WorldFloor.F2
    _place_actor_at_slot(session, "partner", "F2_INTERCOM_A")
    start_intercom_mission(session)
    decide_companion_intent(session, "partner")
    assert session.vertical_missions.intercom.ai_arrived
    answer = ", ".join(
        f"{item['color']} {item['shape']}"
        for item in session.vertical_missions.intercom.expected_sequence
    )
    assert submit_intercom_answer(session, "human", answer)["success"]
    assert complete_current_stage(session, "human")["next_phase"] == "floor_1"
    _move_all_through(session, "F2_TO_F1_STAIR_EAST", "east")

    _place_actor_at_slot(session, "human", "F1_DEVICE_A")
    start_security_guidance(session, "human")
    for command in session.vertical_missions.simultaneous.route_commands:
        result = submit_security_direction(session, "human", command)
        assert result["success"]
        target_slot = session.vertical_missions.simultaneous.current_target_slot
        _place_actor_at_slot(session, "partner", target_slot)
        decide_companion_intent(session, "partner")
    assert session.vertical_missions.simultaneous.route_completed
    assert not activate_simultaneous_device(session, "partner", "B")["success"]
    assert activate_simultaneous_device(session, "human", "A")["success"]
    expected_final = "field_final" if final_route == FinalRoute.FIELD else "basement_final"
    assert complete_current_stage(session, "human")["next_phase"] == expected_final


def _new_vertical_session(room_id: str) -> GameSession:
    session = GameSession(room_id)
    session.state.add_player("human", PlayerRole.HUMAN)
    session.setup_game([], dynamic_forbidden=True)
    return session


def _open_escape_with_spell(session: GameSession) -> None:
    session.spell_words = ["달빛", "교정", "탈출"]
    session.state.phase = GamePhase.FINAL_SPELL
    assert check_spell("달빛 교정 탈출", session.spell_words)["success"]
    session.vertical_round.mark_mission_complete()
    assert session.vertical_round.advance() == VerticalRoundPhase.ESCAPE_OPEN


def test_rooftop_to_field_escape_open_has_no_mission_or_actor_deadlock() -> None:
    session = _new_vertical_session("field-vertical-autoplay")
    _complete_rooftop_through_floor_one(session, FinalRoute.FIELD)
    _move_all_through(session, "F1_TO_FIELD_FIRE_DOOR", "field")

    ready = None
    for actor_id in RUNNER_IDS:
        x, y, z = final_station_position(actor_id)
        actor = session.state.get_player(actor_id)
        actor.position.x, actor.position.y, actor.position.z = x, y, z
        actor.position.floor = WorldFloor.FIELD
        ready = activate_final_station(session, actor_id)
    assert ready and ready["all_ready"]

    _open_escape_with_spell(session)


def test_rooftop_to_basement_voice_delegation_reaches_escape_open() -> None:
    session = _new_vertical_session("basement-vertical-autoplay")
    _complete_rooftop_through_floor_one(session, FinalRoute.BASEMENT)
    _move_all_through(session, "F1_TO_BASEMENT_FIRE_DOOR", "basement")
    session.vertical_missions.basement.correct_order = ["panel", "valve", "generator"]
    session.state.get_player("seeker").position.floor = WorldFloor.ROOF

    owner_by_device = {"panel": "partner", "valve": "partner-2"}
    command_by_device = {"panel": "배전반 전원을 켜 줘", "valve": "급수 밸브를 돌려 줘"}
    for device_id in session.vertical_missions.basement.correct_order:
        device = next(
            item for item in session.vertical_missions.basement.devices
            if item.device_id == device_id
        )
        if device_id == "generator":
            actor_id = "human"
        else:
            actor_id = owner_by_device[device_id]
            command = command_basement_device(session, "human", command_by_device[device_id])
            assert command["success"]
        _place_actor_at_slot(session, actor_id, device.slot_id)
        if actor_id != "human":
            _, action = advance_companion(session, actor_id)
            assert action["type"] == "basement_device_activate"
        activated = activate_basement_device(session, actor_id, device_id)
        assert activated["success"]

    assert session.vertical_missions.basement.completed
    _open_escape_with_spell(session)
