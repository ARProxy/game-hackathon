"""멀티플레이 방 시스템.

방 생성/참가/준비/방장, 캐릭터 선택, AI 충원을 관리한다.
싱글 플레이도 1인 방으로 동일한 구조를 사용한다.
"""

from __future__ import annotations

import random
import string
import time
from dataclasses import dataclass, field
from enum import Enum


class RoomPhase(str, Enum):
    WAITING = "waiting"
    CHARACTER_SELECT = "character_select"
    ONBOARDING = "onboarding"
    PLAYING = "playing"
    RESULT = "result"


# 선택 가능한 도망자 캐릭터 (R00=술래, 선택 불가)
RUNNER_CHARACTERS: dict[str, dict] = {
    "R01": {"name": "캡", "color": "#FF8C00", "accessory": "야구모자"},
    "R02": {"name": "고글", "color": "#4169E1", "accessory": "스키 고글"},
    "R03": {"name": "리본", "color": "#FF69B4", "accessory": "머리 리본"},
    "R04": {"name": "탑햇", "color": "#8B00FF", "accessory": "실크햇"},
    "R05": {"name": "헤드셋", "color": "#7CFC00", "accessory": "헤드셋"},
}

MAX_RUNNER_SLOTS = 4  # 도망자 슬롯 (인간 + AI 합산, 술래 제외)
MAX_HUMAN_PLAYERS = 4


@dataclass
class RoomPlayer:
    player_id: str
    character_id: str | None = None
    is_ready: bool = False
    joined_at: float = 0.0


@dataclass
class RoomConfig:
    room_id: str
    host_id: str
    phase: RoomPhase = RoomPhase.WAITING
    players: dict[str, RoomPlayer] = field(default_factory=dict)
    runner_slots: int = MAX_RUNNER_SLOTS
    created_at: float = 0.0

    @property
    def player_count(self) -> int:
        return len(self.players)

    @property
    def is_full(self) -> bool:
        return self.player_count >= MAX_HUMAN_PLAYERS

    @property
    def all_ready(self) -> bool:
        return bool(self.players) and all(p.is_ready for p in self.players.values())

    @property
    def selected_characters(self) -> set[str]:
        return {p.character_id for p in self.players.values() if p.character_id}

    @property
    def available_characters(self) -> list[str]:
        selected = self.selected_characters
        return [cid for cid in RUNNER_CHARACTERS if cid not in selected]

    def ai_slots_needed(self) -> int:
        """인간 플레이어 수에 따라 AI 동료 충원 수를 계산한다."""
        return max(0, self.runner_slots - self.player_count)

    def ai_character_ids(self) -> list[str]:
        """AI에게 배정할 캐릭터 ID 목록."""
        available = self.available_characters
        needed = self.ai_slots_needed()
        return available[:needed]


class RoomError(ValueError):
    """방 관련 오류."""


def generate_room_id() -> str:
    """6자리 방 코드 생성."""
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=6))


def create_room(host_id: str) -> RoomConfig:
    """새 방을 생성하고 방장을 참가시킨다."""
    room = RoomConfig(
        room_id=generate_room_id(),
        host_id=host_id,
        created_at=time.time(),
    )
    room.players[host_id] = RoomPlayer(
        player_id=host_id,
        joined_at=time.time(),
    )
    return room


def join_room(room: RoomConfig, player_id: str) -> None:
    """기존 방에 참가한다."""
    if room.phase != RoomPhase.WAITING:
        raise RoomError("대기 중인 방에만 참가할 수 있다")
    if room.is_full:
        raise RoomError("방이 가득 찼다")
    if player_id in room.players:
        raise RoomError("이미 참가한 플레이어다")
    room.players[player_id] = RoomPlayer(
        player_id=player_id,
        joined_at=time.time(),
    )


def leave_room(room: RoomConfig, player_id: str) -> bool:
    """방에서 퇴장한다. 방장이 나가면 방장이 이전된다. 빈 방이면 True 반환."""
    room.players.pop(player_id, None)
    if not room.players:
        return True  # 빈 방
    if player_id == room.host_id:
        # 방장 이전: 가장 먼저 참가한 플레이어
        next_host = min(room.players.values(), key=lambda p: p.joined_at)
        room.host_id = next_host.player_id
    return False


def select_character(room: RoomConfig, player_id: str, character_id: str) -> None:
    """캐릭터를 선택한다. 중복 불가."""
    if player_id not in room.players:
        raise RoomError("방에 참가하지 않은 플레이어다")
    if character_id not in RUNNER_CHARACTERS:
        raise RoomError("존재하지 않는 캐릭터다")
    if character_id in room.selected_characters:
        other = next(
            p for p in room.players.values()
            if p.character_id == character_id
        )
        if other.player_id != player_id:
            raise RoomError("다른 플레이어가 이미 선택한 캐릭터다")
    room.players[player_id].character_id = character_id


def set_ready(room: RoomConfig, player_id: str, ready: bool = True) -> None:
    """준비 상태를 변경한다."""
    if player_id not in room.players:
        raise RoomError("방에 참가하지 않은 플레이어다")
    player = room.players[player_id]
    if not player.character_id:
        raise RoomError("캐릭터를 먼저 선택해야 한다")
    player.is_ready = ready


def start_game_from_room(room: RoomConfig) -> dict:
    """방장이 게임을 시작한다. AI 충원 정보를 반환한다."""
    if room.phase != RoomPhase.WAITING:
        raise RoomError("대기 중인 방에서만 게임을 시작할 수 있다")
    if not room.all_ready:
        raise RoomError("모든 플레이어가 준비되어야 한다")

    ai_characters = room.ai_character_ids()
    room.phase = RoomPhase.ONBOARDING

    return {
        "human_players": {
            pid: {"character_id": p.character_id}
            for pid, p in room.players.items()
        },
        "ai_partners": [
            {"partner_id": f"partner-{i}", "character_id": cid}
            for i, cid in enumerate(ai_characters)
        ],
        "seeker_character_id": "R00",
    }


def room_to_dict(room: RoomConfig) -> dict:
    """클라이언트 전송용 방 상태."""
    return {
        "room_id": room.room_id,
        "host_id": room.host_id,
        "phase": room.phase.value,
        "players": [
            {
                "player_id": p.player_id,
                "character_id": p.character_id,
                "is_ready": p.is_ready,
                "is_host": p.player_id == room.host_id,
            }
            for p in room.players.values()
        ],
        "available_characters": room.available_characters,
        "runner_slots": room.runner_slots,
        "ai_slots_needed": room.ai_slots_needed(),
    }
