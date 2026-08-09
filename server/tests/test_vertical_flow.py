"""층별 미션 상호작용 서버 권위 테스트."""

import pytest

from app.game.progression import FinalRoute, InvalidProgression, VerticalRoundPhase, WorldFloor
from app.game.session import GameSession
from app.game.state import PlayerRole
from app.game.vertical_flow import (
    BROADCAST_MISSION_PROMPT,
    announce_elevator_arrival,
    activate_rooftop_signal,
    activate_final_station,
    call_elevator,
    complete_current_stage,
    cross_rooftop_stair_boundary,
    evaluate_broadcast_phrase,
    final_escape_position,
    final_station_position,
    mission_interaction_position,
    request_elevator_trip,
    validate_current_stage_interaction,
    use_open_floor_transition,
    use_elevator,
)


def test_broadcast_prompt_never_reveals_the_private_forbidden_word() -> None:
    assert "열쇠" not in BROADCAST_MISSION_PROMPT
    assert "키" not in BROADCAST_MISSION_PROMPT


def test_broadcast_phrase_requires_tool_exit_and_action_meaning() -> None:
    assert evaluate_broadcast_phrase("작은 금속 도구로 잠긴 출입구를 개방한다")["success"]
    result = evaluate_broadcast_phrase("출입구 근처에 금속 도구가 있다")
    assert not result["success"]
    assert result["missing"] == ["action"]
    assert result["missing_labels"] == ["개방 행동"]
    key_only = evaluate_broadcast_phrase("열쇠가 잠긴 문 근처에 있다")
    assert not key_only["success"]
    assert key_only["missing"] == ["action"]


@pytest.mark.parametrize("phrase", [
    "쇠로 된 작은 물건으로 잠긴 입구를 통과할 수 있게 해",
    "키를 사용해 잠금장치를 풀어",
    "문을 여는 도구로 닫힌 통로를 개방해",
])
def test_broadcast_phrase_accepts_distinct_semantic_paraphrases(phrase: str) -> None:
    assert evaluate_broadcast_phrase(phrase)["success"]


def active_session() -> tuple[GameSession, object]:
    session = GameSession("vertical-flow")
    human = session.state.add_player("human", PlayerRole.HUMAN)
    session.setup_game(["열쇠"])
    session.vertical_progression_enabled = True
    session.final_route_choice = FinalRoute.FIELD
    return session, human


def place_at_current_mission(session: GameSession, actor) -> None:
    x, y, z = mission_interaction_position(session.vertical_round.phase)
    actor.position.x, actor.position.y, actor.position.z = x, y, z
    actor.position.floor = session.vertical_round.policy.active_floor
    for runner in session.state.players.values():
        if runner.role != PlayerRole.SEEKER:
            runner.position.floor = session.vertical_round.policy.active_floor


def test_server_accepts_visible_mission_prompt_during_position_sync_lag() -> None:
    session, human = active_session()
    session.vertical_round.phase = VerticalRoundPhase.FLOOR_3
    x, y, z = mission_interaction_position(VerticalRoundPhase.FLOOR_3)
    human.position.x, human.position.y, human.position.z = x + 2.8, y, z
    human.position.floor = WorldFloor.F3

    validate_current_stage_interaction(session, "human")

    human.position.x = x + 3.05
    with pytest.raises(InvalidProgression, match="거리가 너무 멀다"):
        validate_current_stage_interaction(session, "human")


def test_disabled_compatibility_game_cannot_advance_vertical_stage() -> None:
    session = GameSession("disabled-vertical-flow")
    session.vertical_progression_enabled = False
    session.state.add_player("human", PlayerRole.HUMAN)
    session.setup_game(["열쇠"])

    with pytest.raises(InvalidProgression, match="아직 활성화"):
        complete_current_stage(session, "human")


def test_rooftop_mission_advances_only_when_actor_is_near_device() -> None:
    from app.game.map_slots import get_map_slot

    session, human = active_session()
    human.position.floor = WorldFloor.ROOF

    with pytest.raises(InvalidProgression, match="거리가 너무 멀다"):
        activate_rooftop_signal(session, "human", "center")

    slot_by_signal = {
        "center": "ROOF_SIGNAL_CENTER",
        "east": "ROOF_SIGNAL_EAST",
        "west": "ROOF_SIGNAL_WEST",
    }
    for signal_id in session.vertical_missions.rooftop.sequence:
        slot_id = slot_by_signal[signal_id]
        slot = get_map_slot(slot_id)
        human.position.x, human.position.y, human.position.z = slot["interactionPosition"]
        progress = activate_rooftop_signal(session, "human", signal_id)
    assert progress["completed"]
    result = complete_current_stage(session, "human")

    assert result["completed_phase"] == "rooftop_intro"
    assert result["next_phase"] == "floor_3"
    assert result["clue"] is None
    assert result["progression"]["accessible_floors"] == ["ROOF", "F3"]


def test_rooftop_wrong_input_names_the_next_signal_for_recovery() -> None:
    from app.game.map_slots import get_map_slot

    session, human = active_session()
    human.position.floor = WorldFloor.ROOF
    expected = session.vertical_missions.rooftop.next_signal_id
    wrong = next(signal_id for signal_id in ("center", "east", "west") if signal_id != expected)
    slot = get_map_slot({
        "center": "ROOF_SIGNAL_CENTER",
        "east": "ROOF_SIGNAL_EAST",
        "west": "ROOF_SIGNAL_WEST",
    }[wrong])
    human.position.x, human.position.y, human.position.z = slot["interactionPosition"]
    expected_label = {"center": "중앙", "east": "동쪽", "west": "서쪽"}[expected]

    with pytest.raises(InvalidProgression, match=f"다음은 {expected_label} 신호"):
        activate_rooftop_signal(session, "human", wrong)

    expected_slot = get_map_slot({
        "center": "ROOF_SIGNAL_CENTER",
        "east": "ROOF_SIGNAL_EAST",
        "west": "ROOF_SIGNAL_WEST",
    }[expected])
    human.position.x, human.position.y, human.position.z = expected_slot["interactionPosition"]
    activate_rooftop_signal(session, "human", expected)
    next_label = {
        "center": "중앙", "east": "동쪽", "west": "서쪽",
    }[session.vertical_missions.rooftop.next_signal_id]

    with pytest.raises(InvalidProgression, match=f"이미 입력한 {expected_label}.*다음은 {next_label}"):
        activate_rooftop_signal(session, "human", expected)


def test_actor_on_wrong_floor_cannot_complete_current_mission() -> None:
    session, human = active_session()
    x, y, z = mission_interaction_position(VerticalRoundPhase.ROOFTOP_INTRO)
    human.position.x, human.position.y, human.position.z = x, y, z
    human.position.floor = WorldFloor.F3

    with pytest.raises(InvalidProgression, match="현재 활성 층"):
        complete_current_stage(session, "human")


def _mark_vertical_missions_done(session: GameSession) -> None:
    """직접 stage advance를 검증할 때 각 전용 미션을 완료 상태로 둔다."""
    if session.vertical_missions is not None:
        session.vertical_missions.rooftop.completed = True
        session.vertical_missions.broadcast.completed = True
        session.vertical_missions.intercom.completed = True
        session.vertical_missions.simultaneous.completed = True


def test_each_floor_uses_its_own_semantic_mission_position() -> None:
    session, human = active_session()
    _mark_vertical_missions_done(session)

    expected = [
        VerticalRoundPhase.FLOOR_3,
        VerticalRoundPhase.FLOOR_2,
        VerticalRoundPhase.FLOOR_1,
        VerticalRoundPhase.FIELD_FINAL,
    ]
    for next_phase in expected:
        place_at_current_mission(session, human)
        result = complete_current_stage(session, "human")
        assert result["next_phase"] == next_phase.value


def test_three_internal_floors_award_ordered_spell_clues() -> None:
    session, human = active_session()
    _mark_vertical_missions_done(session)
    clues = []
    for _ in range(4):
        place_at_current_mission(session, human)
        event = complete_current_stage(session, "human")
        if event["clue"]:
            clues.append(event["clue"])
    assert clues == [
        {
            "fragment_id": "moon_signal", "symbol": "☾",
            "riddle": "밤하늘의 달에서 퍼지는 빛 · 두 글자",
            "relation": "세로선의 맨 위에서 시작", "total": 3,
        },
        {
            "fragment_id": "correction_signal", "symbol": "↺",
            "riddle": "틀린 답을 바르게 고치는 일 · 두 글자",
            "relation": "달 표식 다음, 출구 표식 이전", "total": 3,
        },
        {
            "fragment_id": "escape_signal", "symbol": "⇥",
            "riddle": "갇힌 곳을 벗어나 밖으로 나감 · 두 글자",
            "relation": "세로선의 맨 아래에서 끝", "total": 3,
        },
    ]
    assert all("word" not in clue and "order" not in clue for clue in clues)
    assert "달빛" not in str(clues)
    assert "교정" not in str(clues)
    assert "탈출" not in str(clues)


def test_frozen_actor_cannot_complete_stage() -> None:
    session, human = active_session()
    place_at_current_mission(session, human)
    human.freeze()

    with pytest.raises(InvalidProgression, match="살아 있는 도망자"):
        complete_current_stage(session, "human")


def test_physical_stair_boundary_changes_actor_from_rooftop_to_third_floor() -> None:
    from app.game.map_slots import get_map_slot

    session, human = active_session()
    _mark_vertical_missions_done(session)
    place_at_current_mission(session, human)
    complete_current_stage(session, "human")
    human.position.x, human.position.y, human.position.z = get_map_slot(
        "ROOF_TO_F3_STAIR_BOTTOM_CROSSING"
    )["position"]
    human.position.floor = WorldFloor.ROOF

    event = cross_rooftop_stair_boundary(session, "human", "down")

    assert event["traversal"] == "stairs"
    assert event["position"]["floor"] == "F3"
    assert human.position.floor == WorldFloor.F3
    assert human.position.y == pytest.approx(7.2)


def test_physical_stair_boundary_rejects_wrong_floor_and_remote_use() -> None:
    session, human = active_session()
    _mark_vertical_missions_done(session)
    place_at_current_mission(session, human)
    complete_current_stage(session, "human")

    human.position.floor = WorldFloor.F2
    with pytest.raises(InvalidProgression, match="출발 층"):
        cross_rooftop_stair_boundary(session, "human", "down")

    human.position.floor = WorldFloor.ROOF
    with pytest.raises(InvalidProgression, match="경계와 거리가 너무 멀다"):
        cross_rooftop_stair_boundary(session, "human", "down")


def test_rooftop_closes_only_after_every_runner_descends() -> None:
    from app.game.map_slots import get_map_slot

    session, human = active_session()
    _mark_vertical_missions_done(session)
    place_at_current_mission(session, human)
    complete_current_stage(session, "human")
    stair_bottom = get_map_slot("ROOF_TO_F3_STAIR_BOTTOM_CROSSING")
    stair_top = get_map_slot("F3_TO_ROOF_STAIR_TOP_CROSSING")

    for actor_id in ("human", "partner", "partner-2"):
        actor = session.state.get_player(actor_id)
        actor.position.x, actor.position.y, actor.position.z = stair_bottom["position"]
        actor.position.floor = WorldFloor.ROOF
        event = cross_rooftop_stair_boundary(session, actor_id, "down")

    assert event["closed_floor"] == "ROOF"
    assert event["progression"]["accessible_floors"] == ["F3"]
    assert event["progression"]["closing_pending_floor"] is None

    human.position.x, human.position.y, human.position.z = stair_top["position"]
    human.position.floor = WorldFloor.F3
    with pytest.raises(InvalidProgression, match="닫혔거나"):
        cross_rooftop_stair_boundary(session, "human", "up")


def test_rooftop_stair_is_bidirectional_before_roof_closes() -> None:
    from app.game.map_slots import get_map_slot

    session, human = active_session()
    _mark_vertical_missions_done(session)
    place_at_current_mission(session, human)
    complete_current_stage(session, "human")
    bottom = get_map_slot("ROOF_TO_F3_STAIR_BOTTOM_CROSSING")
    top = get_map_slot("F3_TO_ROOF_STAIR_TOP_CROSSING")
    human.position.x, human.position.y, human.position.z = bottom["position"]
    human.position.floor = WorldFloor.ROOF
    cross_rooftop_stair_boundary(session, "human", "down")
    human.position.x, human.position.y, human.position.z = top["position"]

    event = cross_rooftop_stair_boundary(session, "human", "up")

    assert event["position"]["floor"] == "ROOF"
    assert event["position"]["y"] == pytest.approx(10.8)


def test_current_and_previous_floor_transition_is_bidirectional() -> None:
    from app.game.map_slots import get_map_slot

    session, human = active_session()
    _mark_vertical_missions_done(session)
    place_at_current_mission(session, human)
    complete_current_stage(session, "human")
    place_at_current_mission(session, human)
    complete_current_stage(session, "human")

    f3_stair = get_map_slot("F3_F2_STAIR_EAST_BOTTOM_CROSSING")
    f2_stair = get_map_slot("F3_F2_STAIR_EAST_TOP_CROSSING")
    human.position.x, human.position.y, human.position.z = f3_stair["position"]
    human.position.floor = WorldFloor.F3
    assert use_open_floor_transition(session, "human", "east")["position"]["floor"] == "F2"

    human.position.x, human.position.y, human.position.z = f2_stair["position"]
    human.position.floor = WorldFloor.F2
    assert use_open_floor_transition(session, "human", "east")["position"]["floor"] == "F3"


def test_floor_transition_rejects_doorway_teleport_before_physical_crossing() -> None:
    from app.game.map_slots import get_map_slot

    session, human = active_session()
    _mark_vertical_missions_done(session)
    place_at_current_mission(session, human)
    complete_current_stage(session, "human")
    place_at_current_mission(session, human)
    complete_current_stage(session, "human")
    doorway = get_map_slot("F3_TO_F2_STAIR_EAST")
    human.position.x, human.position.y, human.position.z = doorway["position"]
    human.position.floor = WorldFloor.F3

    with pytest.raises(InvalidProgression, match="직접 이동"):
        use_open_floor_transition(session, "human", "east")


def test_stage_advance_waits_for_runner_on_floor_that_will_close() -> None:
    session, human = active_session()
    _mark_vertical_missions_done(session)
    place_at_current_mission(session, human)
    complete_current_stage(session, "human")
    place_at_current_mission(session, human)
    session.state.get_player("partner-2").position.floor = WorldFloor.ROOF

    with pytest.raises(InvalidProgression, match="ROOF에 남은 팀원"):
        complete_current_stage(session, "human")


def test_east_and_west_routes_open_after_third_floor_completion() -> None:
    from app.game.map_slots import get_map_slot

    session, human = active_session()
    _mark_vertical_missions_done(session)
    place_at_current_mission(session, human)
    complete_current_stage(session, "human")
    human.position.x, human.position.y, human.position.z = get_map_slot(
        "ROOF_TO_F3_STAIR_BOTTOM_CROSSING"
    )["position"]
    human.position.floor = WorldFloor.ROOF
    cross_rooftop_stair_boundary(session, "human", "down")
    place_at_current_mission(session, human)
    complete_current_stage(session, "human")

    human.position.x, human.position.y, human.position.z = get_map_slot(
        "F3_F2_STAIR_EAST_BOTTOM_CROSSING"
    )["position"]
    human.position.floor = WorldFloor.F3
    event = use_open_floor_transition(session, "human", "east")

    assert event["position"]["floor"] == "F2"
    assert event["position"]["zone"] == "f2_southeast_stair_bottom"


def test_first_floor_completion_opens_field_transition() -> None:
    from app.game.map_slots import get_map_slot

    session, human = active_session()
    _mark_vertical_missions_done(session)
    for _ in range(4):
        place_at_current_mission(session, human)
        result = complete_current_stage(session, "human")
    assert result["next_phase"] == "field_final"
    assert session.vertical_round.final_route.value == "field"
    human.position.x, human.position.y, human.position.z = get_map_slot(
        "F1_FIELD_OUTSIDE_CROSSING"
    )["position"]
    human.position.floor = WorldFloor.F1
    event = use_open_floor_transition(session, "human", "field")
    assert event["position"]["floor"] == "FIELD"


def test_first_floor_completion_can_open_basement_transition() -> None:
    from app.game.map_slots import get_map_slot

    session, human = active_session()
    session.final_route_choice = FinalRoute.BASEMENT
    _mark_vertical_missions_done(session)
    for _ in range(4):
        place_at_current_mission(session, human)
        result = complete_current_stage(session, "human")
    assert result["next_phase"] == "basement_final"
    assert session.vertical_round.final_route == FinalRoute.BASEMENT

    human.position.x, human.position.y, human.position.z = get_map_slot(
        "F1_B1_STAIR_WEST_BOTTOM_CROSSING"
    )["position"]
    human.position.floor = WorldFloor.F1
    event = use_open_floor_transition(session, "human", "basement")
    assert event["position"]["floor"] == "B1"
    assert final_escape_position(session) == tuple(
        float(value) for value in get_map_slot("BASEMENT_ESCAPE_GATE")["position"]
    )


def test_field_final_requires_every_alive_runner_at_their_station() -> None:
    session, human = active_session()
    session.vertical_round.phase = VerticalRoundPhase.FIELD_FINAL
    actors = [human, session.state.get_player("partner"), session.state.get_player("partner-2")]
    for actor in actors:
        x, y, z = final_station_position(actor.player_id)
        actor.position.x, actor.position.y, actor.position.z = x, y, z
        actor.position.floor = WorldFloor.FIELD

    first = activate_final_station(session, human.player_id)
    second = activate_final_station(session, "partner")
    final = activate_final_station(session, "partner-2")

    assert not first["all_ready"]
    assert not second["all_ready"]
    assert final == {
        "actor_id": "partner-2", "ready_count": 3,
        "required_count": 3, "all_ready": True,
    }


def test_elevator_only_serves_accessible_floors_from_inside_car() -> None:
    session, human = active_session()
    session.vertical_round.phase = VerticalRoundPhase.FLOOR_2
    human.position.x, human.position.z = -12.0, -41.7
    human.position.floor = WorldFloor.F3

    request_elevator_trip(session, human.player_id, "evp", "F2")
    event = use_elevator(session, human.player_id, "evp", "F2")
    assert event["position"]["floor"] == "F2"
    assert human.position.y == pytest.approx(3.6)

    with pytest.raises(InvalidProgression, match="열리지 않은"):
        use_elevator(session, human.player_id, "evp", "F1")


def test_passenger_elevator_reaches_roof_but_cargo_does_not() -> None:
    session, human = active_session()
    session.vertical_round.phase = VerticalRoundPhase.ROOFTOP_INTRO
    human.position.x, human.position.z = -12.0, -41.7
    human.position.floor = WorldFloor.F3

    request_elevator_trip(session, human.player_id, "evp", "ROOF")
    event = use_elevator(session, human.player_id, "evp", "ROOF")
    assert event["position"]["floor"] == "ROOF"
    assert human.position.y == pytest.approx(10.8)

    human.position.x, human.position.z = -20.0, -41.75
    human.position.floor = WorldFloor.F3
    with pytest.raises(InvalidProgression, match="운행하지 않는"):
        use_elevator(session, human.player_id, "evc", "ROOF")


def test_empty_elevator_call_creates_one_authorized_arrival_ping() -> None:
    session, human = active_session()
    session.vertical_round.phase = VerticalRoundPhase.FLOOR_2
    human.position.floor = WorldFloor.F2
    human.position.x, human.position.z = -12.0, -39.25

    called = call_elevator(session, human.player_id, "evp", "F2")
    assert called["target_floor"] == "F2"
    arrival = announce_elevator_arrival(session, human.player_id, "evp", "F2")
    assert arrival["sound_ping"]["source"] == "empty_elevator_arrival"
    assert arrival["sound_ping"]["floor"] == "F2"
    assert human.position.floor == WorldFloor.F2

    with pytest.raises(InvalidProgression, match="호출 기록"):
        announce_elevator_arrival(session, human.player_id, "evp", "F2")


def test_empty_elevator_call_requires_real_landing_proximity() -> None:
    session, human = active_session()
    session.vertical_round.phase = VerticalRoundPhase.FLOOR_2
    human.position.floor = WorldFloor.F2
    human.position.x, human.position.z = 20.0, 20.0

    with pytest.raises(InvalidProgression, match="호출 버튼"):
        call_elevator(session, human.player_id, "evp", "F2")


def test_elevator_trip_request_is_authoritative_and_targets_open_floor() -> None:
    session, human = active_session()
    session.vertical_round.phase = VerticalRoundPhase.FLOOR_2
    human.position.floor = WorldFloor.F3
    human.position.x, human.position.z = -12.0, -41.7

    trip = request_elevator_trip(session, human.player_id, "evp", "F2")
    assert trip["target_floor"] == "F2"
    assert session.elevator_calls["evp"]["ride"] is True

    with pytest.raises(InvalidProgression, match="열리지 않은"):
        request_elevator_trip(session, human.player_id, "evp", "F1")
