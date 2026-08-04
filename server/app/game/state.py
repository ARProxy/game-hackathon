"""게임 세션 상태 모델

한 판의 게임에서 필요한 모든 상태를 메모리에서 관리한다.
DB 없이 Python dict/dataclass로 동작한다.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from enum import Enum


class PlayerRole(str, Enum):
    HUMAN = "human"
    AI_PARTNER = "ai_partner"
    SEEKER = "seeker"


class PlayerStatus(str, Enum):
    ALIVE = "alive"
    FROZEN = "frozen"
    ELIMINATED = "eliminated"


class GamePhase(str, Enum):
    LOBBY = "lobby"
    ONBOARDING = "onboarding"
    PLAYING = "playing"
    FINAL_SPELL = "final_spell"
    ESCAPE = "escape"
    RESULT = "result"


@dataclass
class Position:
    x: float = 0.0
    z: float = 0.0


@dataclass
class Player:
    player_id: str
    role: PlayerRole
    status: PlayerStatus = PlayerStatus.ALIVE
    position: Position = field(default_factory=Position)
    frozen_at: float | None = None  # timestamp when frozen

    @property
    def is_frozen(self) -> bool:
        return self.status == PlayerStatus.FROZEN

    def freeze(self) -> None:
        self.status = PlayerStatus.FROZEN
        self.frozen_at = time.time()

    def unfreeze(self) -> None:
        self.status = PlayerStatus.ALIVE
        self.frozen_at = None

    def eliminate(self) -> None:
        self.status = PlayerStatus.ELIMINATED
        self.frozen_at = None


@dataclass
class MissionClue:
    word: str
    acquired: bool = False


@dataclass
class GameState:
    room_id: str
    phase: GamePhase = GamePhase.LOBBY
    players: dict[str, Player] = field(default_factory=dict)
    forbidden_words: list[str] = field(default_factory=list)
    clues: list[MissionClue] = field(default_factory=list)
    freeze_timeout_sec: float = 30.0
    started_at: float | None = None

    def add_player(self, player_id: str, role: PlayerRole) -> Player:
        player = Player(player_id=player_id, role=role)
        self.players[player_id] = player
        return player

    def get_player(self, player_id: str) -> Player | None:
        return self.players.get(player_id)

    def alive_non_seeker_count(self) -> int:
        return sum(
            1 for p in self.players.values()
            if p.role != PlayerRole.SEEKER and p.status == PlayerStatus.ALIVE
        )

    def all_non_seeker_frozen_or_eliminated(self) -> bool:
        return all(
            p.status in (PlayerStatus.FROZEN, PlayerStatus.ELIMINATED)
            for p in self.players.values()
            if p.role != PlayerRole.SEEKER
        )

    def check_freeze_timeout(self) -> list[str]:
        """빙결 제한시간 초과한 플레이어 ID 목록 반환."""
        now = time.time()
        timed_out = []
        for p in self.players.values():
            if (
                p.is_frozen
                and p.frozen_at
                and now - p.frozen_at >= self.freeze_timeout_sec
            ):
                timed_out.append(p.player_id)
        return timed_out

    def to_dict(self) -> dict:
        return {
            "room_id": self.room_id,
            "phase": self.phase.value,
            "forbidden_words": self.forbidden_words,
            "clues": [
                {"word": c.word, "acquired": c.acquired} for c in self.clues
            ],
            "players": {
                pid: {
                    "role": p.role.value,
                    "status": p.status.value,
                    "position": {"x": p.position.x, "z": p.position.z},
                }
                for pid, p in self.players.items()
            },
        }
