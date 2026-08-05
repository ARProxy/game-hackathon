"""서버 권위 AI actor의 예약 ID 선점 방지 회귀 테스트."""

import asyncio

import pytest
from fastapi import WebSocketException
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.game.session import GameSession, session_manager
from app.game.state import PlayerRole, PlayerStatus
from app.main import app
from app.ws.manager import ConnectionManager


class FakeWebSocket:
    def __init__(self) -> None:
        self.accepted = False

    async def accept(self) -> None:
        self.accepted = True


@pytest.mark.parametrize("actor_id", ["partner", "seeker"])
def test_websocket_rejects_reserved_actor_id(actor_id: str) -> None:
    client = TestClient(app)

    with pytest.raises(WebSocketDisconnect) as rejected:
        with client.websocket_connect(f"/ws/reserved-actor/{actor_id}"):
            pass

    assert rejected.value.code == 1008


@pytest.mark.parametrize(
    ("actor_id", "required_role"),
    [
        ("partner", PlayerRole.AI_PARTNER),
        ("seeker", PlayerRole.SEEKER),
    ],
)
def test_setup_game_repairs_reserved_actor_role(
    actor_id: str, required_role: PlayerRole
) -> None:
    session = GameSession(f"repair-{actor_id}")
    session.state.add_player(actor_id, PlayerRole.HUMAN)

    session.setup_game()

    actor = session.state.get_player(actor_id)
    assert actor is not None
    assert actor.role == required_role


def test_duplicate_connection_is_rejected_without_resetting_state() -> None:
    asyncio.run(_assert_duplicate_connection_is_rejected())


async def _assert_duplicate_connection_is_rejected() -> None:
    manager = ConnectionManager()
    room_id = "duplicate-owner"
    player_id = "player1"
    first = FakeWebSocket()
    second = FakeWebSocket()
    await manager.connect(room_id, player_id, first)  # type: ignore[arg-type]
    player = session_manager.get_or_create(room_id).state.get_player(player_id)
    assert player is not None
    player.freeze()

    with pytest.raises(WebSocketException) as rejected:
        await manager.connect(room_id, player_id, second)  # type: ignore[arg-type]

    assert getattr(rejected.value, "code", None) == 1008
    assert manager.rooms[room_id].players[player_id] is first
    assert player.status == PlayerStatus.FROZEN
    assert player.frozen_at is not None
    manager.disconnect(room_id, player_id)
