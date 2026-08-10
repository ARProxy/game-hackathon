"""층 진입 환경 사건의 서버 권위와 중복 방지 계약."""

import unittest
from unittest.mock import AsyncMock

from app.game.session import GameSession
from app.ws.manager import ConnectionManager


class TestFloorEntryWorldEvents(unittest.IsolatedAsyncioTestCase):
    async def test_floor_two_starts_one_local_blackout(self) -> None:
        manager = ConnectionManager()
        manager.broadcast = AsyncMock()
        session = GameSession("world-event-f2")
        transition = {"position": {"floor": "F2"}}

        await manager._publish_floor_entry_event(
            session.state.room_id, session, transition,
        )
        await manager._publish_floor_entry_event(
            session.state.room_id, session, transition,
        )

        manager.broadcast.assert_awaited_once()
        event = manager.broadcast.await_args.args[1]
        self.assertEqual(event["type"], "world_event_started")
        self.assertEqual(event["event_type"], "local_blackout")
        self.assertEqual(event["duration_seconds"], 14.0)
        self.assertEqual(session.public_world_event()["event_id"], "f2_local_blackout")

    async def test_floor_one_introduces_second_hunter_role(self) -> None:
        manager = ConnectionManager()
        manager.broadcast = AsyncMock()
        session = GameSession("world-event-f1")

        await manager._publish_floor_entry_event(
            session.state.room_id, session, {"position": {"floor": "F1"}},
        )

        event = manager.broadcast.await_args.args[1]
        self.assertEqual(event["event_type"], "dual_hunter_breach")
        self.assertIn("탐조등", event["message"])
