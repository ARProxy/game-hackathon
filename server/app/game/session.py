"""게임 세션 관리

Room별로 GameState와 ForbiddenWordEngine을 관리한다.
싱글 플레이도 room_id를 부여하여 멀티 확장에 대비한다.
"""

from __future__ import annotations

import logging

from app.ai.forbidden import ForbiddenWordEngine
from app.ai.mission import Mission, RoundData
from app.game.state import GamePhase, GameState, PlayerRole

logger = logging.getLogger(__name__)

# MVP 기본 금기어 (온보딩 미구현 시 폴백)
DEFAULT_FORBIDDEN_WORDS = ["열쇠", "커피", "빨간"]
DEFAULT_AI_PARTNER_ID = "partner"
DEFAULT_SEEKER_ID = "seeker"


class GameSession:
    def __init__(self, room_id: str) -> None:
        self.state = GameState(room_id=room_id)
        self.engine = ForbiddenWordEngine(DEFAULT_FORBIDDEN_WORDS)
        self.spell_words: list[str] = []
        self.round_data: RoundData | None = None
        self.current_mission_index = 0
        self.inspected_prop_ids: set[str] = set()

    def setup_game(self, forbidden_words: list[str] | None = None) -> None:
        """금기어를 설정하고 게임 준비."""
        words = forbidden_words or DEFAULT_FORBIDDEN_WORDS
        self.round_data = None
        self.spell_words = []
        self.current_mission_index = 0
        self.inspected_prop_ids.clear()
        # 싱글 플레이도 기획서의 최소 팀 구성을 서버 상태에 명시한다.
        # 화면에만 존재하는 동료를 서버가 모르면 인간 플레이어가 얼자마자
        # all_frozen으로 판정되므로, AI 동료와 술래를 결정적인 ID로 등록한다.
        if self.state.get_player(DEFAULT_AI_PARTNER_ID) is None:
            self.state.add_player(DEFAULT_AI_PARTNER_ID, PlayerRole.AI_PARTNER)
        if self.state.get_player(DEFAULT_SEEKER_ID) is None:
            self.state.add_player(DEFAULT_SEEKER_ID, PlayerRole.SEEKER)
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
