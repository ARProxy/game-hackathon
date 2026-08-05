"""게임 세션 관리

Room별로 GameState와 ForbiddenWordEngine을 관리한다.
싱글 플레이도 room_id를 부여하여 멀티 확장에 대비한다.
"""

from __future__ import annotations

import logging
import random
import time

from app.ai.forbidden import ForbiddenWordEngine
from app.ai.mission import Mission, RoundData
from app.game.authority import MovementSample
from app.game.state import GamePhase, GameState, PlayerRole

logger = logging.getLogger(__name__)

# MVP 기본 금기어 (온보딩 미구현 시 폴백)
DEFAULT_FORBIDDEN_WORDS = ["열쇠", "커피", "빨간"]
DEFAULT_AI_PARTNER_ID = "partner"
DEFAULT_SEEKER_ID = "seeker"
GATE_POSITIONS: dict[str, dict[str, float]] = {
    "gate_back": {"x": -7.0, "z": 38.0},
    "gate_main": {"x": 38.5, "z": 27.5},
    "gate_gym": {"x": 38.0, "z": -22.5},
}
ROLE_SPAWNS: dict[PlayerRole, tuple[float, float]] = {
    PlayerRole.HUMAN: (-9.8, -22.0),
    PlayerRole.AI_PARTNER: (-16.0, -2.0),
    PlayerRole.SEEKER: (26.0, -27.0),
}


class GameSession:
    def __init__(self, room_id: str) -> None:
        self.state = GameState(room_id=room_id)
        self.engine = ForbiddenWordEngine(DEFAULT_FORBIDDEN_WORDS)
        self.spell_words: list[str] = []
        self.round_data: RoundData | None = None
        self.current_mission_index = 0
        self.inspected_prop_ids: set[str] = set()
        self.active_gate_id = ""
        self.gate_arrived_player_ids: set[str] = set()
        self.position_samples: dict[str, MovementSample] = {}
        self.hunter_signal: dict | None = None
        self.hunter_last_seen: dict | None = None
        self.hunter_forward = {"x": 0.0, "z": 1.0}
        self.hunter_last_tick = 0.0
        self.hunter_last_intent: dict | None = None

    def setup_game(self, forbidden_words: list[str] | None = None) -> None:
        """금기어를 설정하고 게임 준비."""
        words = forbidden_words or DEFAULT_FORBIDDEN_WORDS
        self.round_data = None
        self.spell_words = []
        self.current_mission_index = 0
        self.inspected_prop_ids.clear()
        self.active_gate_id = random.choice(tuple(GATE_POSITIONS))
        self.gate_arrived_player_ids.clear()
        self.hunter_signal = None
        self.hunter_last_seen = None
        self.hunter_forward = {"x": 0.0, "z": 1.0}
        self.hunter_last_tick = time.monotonic()
        self.hunter_last_intent = None
        # 싱글 플레이도 기획서의 최소 팀 구성을 서버 상태에 명시한다.
        # 화면에만 존재하는 동료를 서버가 모르면 인간 플레이어가 얼자마자
        # all_frozen으로 판정되므로, AI 동료와 술래를 결정적인 ID로 등록한다.
        if self.state.get_player(DEFAULT_AI_PARTNER_ID) is None:
            self.state.add_player(DEFAULT_AI_PARTNER_ID, PlayerRole.AI_PARTNER)
        if self.state.get_player(DEFAULT_SEEKER_ID) is None:
            self.state.add_player(DEFAULT_SEEKER_ID, PlayerRole.SEEKER)
        now = time.monotonic()
        for player in self.state.players.values():
            x, z = ROLE_SPAWNS[player.role]
            player.position.x = x
            player.position.z = z
            self.position_samples[player.player_id] = MovementSample(x, z, now)
        self.state.forbidden_words = words
        self.engine.update_words(words)
        self.state.phase = GamePhase.PLAYING
        logger.info(
            "game setup: room=%s words=%s", self.state.room_id, words
        )

    def setup_round(self, round_data: RoundData) -> None:
        """한 라운드의 서버 권위 미션 진행 상태를 초기화한다."""
        self.round_data = round_data
        self.spell_words = round_data.spell_words
        self.current_mission_index = 0
        self.inspected_prop_ids.clear()

    def current_mission(self) -> Mission | None:
        if (
            self.round_data is None
            or self.current_mission_index >= len(self.round_data.missions)
        ):
            return None
        return self.round_data.missions[self.current_mission_index]

    def active_gate_payload(self) -> dict:
        return {
            "gate_id": self.active_gate_id,
            "position": GATE_POSITIONS[self.active_gate_id],
        }

    def is_near_active_gate(self, player_id: str, radius: float = 2.75) -> bool:
        player = self.state.get_player(player_id)
        if not player or not self.active_gate_id:
            return False
        gate = GATE_POSITIONS[self.active_gate_id]
        return (
            (player.position.x - gate["x"]) ** 2
            + (player.position.z - gate["z"]) ** 2
        ) <= radius ** 2


class SessionManager:
    """전체 세션을 관리한다. 싱글톤으로 사용."""

    def __init__(self) -> None:
        self.sessions: dict[str, GameSession] = {}

    def get_or_create(self, room_id: str) -> GameSession:
        if room_id not in self.sessions:
            self.sessions[room_id] = GameSession(room_id)
            logger.info("session created: room=%s", room_id)
        return self.sessions[room_id]

    def remove(self, room_id: str) -> None:
        self.sessions.pop(room_id, None)
        logger.info("session removed: room=%s", room_id)


# 싱글톤
session_manager = SessionManager()
