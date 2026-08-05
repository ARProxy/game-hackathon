import time

from app.game.session import GameSession
from app.game.state import GamePhase, PlayerRole


def test_pause_preserves_frozen_timeout_budget() -> None:
    session = GameSession("pause-room")
    player = session.state.add_player("human", PlayerRole.HUMAN)
    session.state.phase = GamePhase.PLAYING
    player.freeze()
    frozen_at = player.frozen_at

    assert session.pause()
    assert session.is_paused
    session.paused_at = time.time() - 4.0
    assert session.resume()
    assert not session.is_paused
    assert player.frozen_at is not None and frozen_at is not None
    assert player.frozen_at >= frozen_at + 3.9


def test_pause_only_applies_to_active_round() -> None:
    session = GameSession("lobby-room")
    assert not session.pause()
    session.state.phase = GamePhase.RESULT
    assert not session.pause()
