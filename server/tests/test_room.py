"""멀티플레이 방 시스템 테스트."""

import pytest

from app.game.room import (
    RUNNER_CHARACTERS,
    RoomConfig,
    RoomError,
    RoomPhase,
    create_room,
    join_room,
    leave_room,
    room_to_dict,
    select_character,
    set_ready,
    start_game_from_room,
)


def test_create_room():
    room = create_room("host1")
    assert room.host_id == "host1"
    assert room.player_count == 1
    assert room.phase == RoomPhase.WAITING
    assert "host1" in room.players
    assert len(room.room_id) == 6


def test_join_room():
    room = create_room("host1")
    join_room(room, "player2")
    assert room.player_count == 2
    assert "player2" in room.players


def test_join_room_full():
    room = create_room("host1")
    join_room(room, "p2")
    join_room(room, "p3")
    join_room(room, "p4")
    assert room.is_full
    with pytest.raises(RoomError, match="가득"):
        join_room(room, "p5")


def test_join_room_duplicate():
    room = create_room("host1")
    with pytest.raises(RoomError, match="이미"):
        join_room(room, "host1")


def test_join_room_wrong_phase():
    room = create_room("host1")
    room.phase = RoomPhase.PLAYING
    with pytest.raises(RoomError, match="대기"):
        join_room(room, "p2")


def test_leave_room_host_transfer():
    room = create_room("host1")
    join_room(room, "p2")
    empty = leave_room(room, "host1")
    assert not empty
    assert room.host_id == "p2"


def test_leave_room_empty():
    room = create_room("host1")
    empty = leave_room(room, "host1")
    assert empty


def test_select_character():
    room = create_room("host1")
    select_character(room, "host1", "R01")
    assert room.players["host1"].character_id == "R01"
    assert "R01" in room.selected_characters
    assert "R01" not in room.available_characters


def test_select_character_duplicate():
    room = create_room("host1")
    join_room(room, "p2")
    select_character(room, "host1", "R01")
    with pytest.raises(RoomError, match="이미 선택"):
        select_character(room, "p2", "R01")


def test_select_character_invalid():
    room = create_room("host1")
    with pytest.raises(RoomError, match="존재하지 않는"):
        select_character(room, "host1", "R00")  # 술래는 선택 불가


def test_ready_without_character():
    room = create_room("host1")
    with pytest.raises(RoomError, match="캐릭터"):
        set_ready(room, "host1")


def test_ready_and_start():
    room = create_room("host1")
    join_room(room, "p2")
    select_character(room, "host1", "R01")
    select_character(room, "p2", "R02")
    set_ready(room, "host1")
    set_ready(room, "p2")
    assert room.all_ready

    result = start_game_from_room(room)
    assert room.phase == RoomPhase.ONBOARDING
    assert len(result["human_players"]) == 2
    # 4슬롯 - 2인간 = AI 2명
    assert len(result["ai_partners"]) == 2
    assert result["seeker_character_id"] == "R00"


def test_start_not_ready():
    room = create_room("host1")
    select_character(room, "host1", "R01")
    with pytest.raises(RoomError, match="준비"):
        start_game_from_room(room)


def test_solo_ai_fill():
    room = create_room("solo")
    select_character(room, "solo", "R01")
    set_ready(room, "solo")
    result = start_game_from_room(room)
    # 4슬롯 - 1인간 = AI 3명
    assert len(result["ai_partners"]) == 3


def test_four_players_no_ai():
    room = create_room("p1")
    join_room(room, "p2")
    join_room(room, "p3")
    join_room(room, "p4")
    chars = ["R01", "R02", "R03", "R04"]
    for pid, cid in zip(["p1", "p2", "p3", "p4"], chars):
        select_character(room, pid, cid)
        set_ready(room, pid)
    result = start_game_from_room(room)
    assert len(result["ai_partners"]) == 0


def test_room_to_dict():
    room = create_room("host1")
    join_room(room, "p2")
    select_character(room, "host1", "R01")
    d = room_to_dict(room)
    assert d["room_id"] == room.room_id
    assert d["host_id"] == "host1"
    assert len(d["players"]) == 2
    assert d["runner_slots"] == 4
    host_data = next(p for p in d["players"] if p["player_id"] == "host1")
    assert host_data["is_host"] is True
    assert host_data["character_id"] == "R01"
    assert len(d["available_characters"]) == len(RUNNER_CHARACTERS) - 1
