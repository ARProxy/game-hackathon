"""옥상부터 운동장 파이널 탈출 개방까지의 결정적 무교착 자동 플레이."""

from app.ai.companion import decide_companion_intent
from app.ai.spell import check_spell
from app.game.map_slots import get_map_slot
from app.game.progression import FinalRoute, VerticalRoundPhase, WorldFloor
from app.game.session import GameSession
from app.game.state import GamePhase, PlayerRole
from app.game.vertical_flow import (
    activate_final_station,
    activate_rooftop_signal,
    activate_simultaneous_device,
    complete_current_stage,
    evaluate_broadcast_phrase,
    final_station_position,
    mission_interaction_position,
    start_intercom_mission,
    submit_intercom_answer,
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
    for actor_id in RUNNER_IDS:
        _place_actor_at_slot(session, actor_id, source_slot_id)
        use_open_floor_transition(session, actor_id, route)


def test_rooftop_to_field_escape_open_has_no_mission_or_actor_deadlock() -> None:
    session = GameSession("vertical-autoplay")
    session.state.add_player("human", PlayerRole.HUMAN)
    session.setup_game([], dynamic_forbidden=True)
    session.final_route_choice = FinalRoute.FIELD

    for actor_id, signal_id, slot_id in (
        ("human", "center", "ROOF_SIGNAL_CENTER"),
        ("partner", "east", "ROOF_SIGNAL_EAST"),
        ("partner-2", "west", "ROOF_SIGNAL_WEST"),
    ):
        _place_actor_at_slot(session, actor_id, slot_id)
        assert activate_rooftop_signal(session, actor_id, signal_id)["success"]
    assert complete_current_stage(session, "partner-2")["next_phase"] == "floor_3"
    _move_all_through(session, "ROOF_TO_F3_FIRE_DOOR", "west")
    assert session.vertical_round.to_dict()["accessible_floors"] == ["F3"]

    human = session.state.get_player("human")
    x, y, z = mission_interaction_position(VerticalRoundPhase.FLOOR_3)
    human.position.x, human.position.y, human.position.z = x, y, z
    human.position.floor = WorldFloor.F3
    session.broadcast_mission_actor_id = "human"
    assert evaluate_broadcast_phrase("작은 금속 도구로 잠긴 출입구를 개방한다")["success"]
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
        for item in session.vertical_missions.intercom.sequence
    )
    assert submit_intercom_answer(session, "human", answer)["success"]
    assert complete_current_stage(session, "human")["next_phase"] == "floor_1"
    _move_all_through(session, "F2_TO_F1_STAIR_EAST", "east")

    _place_actor_at_slot(session, "partner", "F1_DEVICE_B")
    _place_actor_at_slot(session, "human", "F1_DEVICE_A")
    assert not activate_simultaneous_device(session, "partner", "B")["success"]
    assert activate_simultaneous_device(session, "human", "A")["success"]
    assert complete_current_stage(session, "human")["next_phase"] == "field_final"
    _move_all_through(session, "F1_TO_FIELD_FIRE_DOOR", "field")

    ready = None
    for actor_id in RUNNER_IDS:
        x, y, z = final_station_position(actor_id)
        actor = session.state.get_player(actor_id)
        actor.position.x, actor.position.y, actor.position.z = x, y, z
        actor.position.floor = WorldFloor.FIELD
        ready = activate_final_station(session, actor_id)
    assert ready and ready["all_ready"]

    session.spell_words = ["달빛", "교정", "탈출"]
    session.state.phase = GamePhase.FINAL_SPELL
    assert check_spell("달빛 교정 탈출", session.spell_words)["success"]
    session.vertical_round.mark_mission_complete()
    assert session.vertical_round.advance() == VerticalRoundPhase.ESCAPE_OPEN
