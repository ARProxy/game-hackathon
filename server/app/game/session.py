"""게임 세션 관리

Room별로 GameState와 ForbiddenWordEngine을 관리한다.
싱글 플레이도 room_id를 부여하여 멀티 확장에 대비한다.
"""

from __future__ import annotations

import logging

from app.ai.forbidden import ForbiddenWordEngine
from app.game.state import GamePhase, GameState, PlayerRole

logger = logging.getLogger(__name__)

# MVP 기본 금기어 (온보딩 미구현 시 폴백)
DEFAULT_FORBIDDEN_WORDS = ["열쇠", "커피", "빨간"]


class GameSession:
    def __init__(self, room_id: str) -> None:
        self.state = GameState(room_id=room_id)
        self.engine = ForbiddenWordEngine(DEFAULT_FORBIDDEN_WORDS)

    def setup_game(self, forbidden_words: list[str] | None = None) -> None:
        """금기어를 설정하고 게임 준비."""
        words = forbidden_words or DEFAULT_FORBIDDEN_WORDS
        self.state.forbidden_words = words
        self.engine.update_words(words)
        self.state.phase = GamePhase.PLAYING
        logger.info(
            "game setup: room=%s words=%s", self.state.room_id, words
        )


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
