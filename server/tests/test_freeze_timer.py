"""서버 권위 빙결 제한시간 task 통합 테스트."""

import asyncio
import json
import unittest

from app.game.session import session_manager
from app.ws.manager import ConnectionManager


class FakeWebSocket:
    def __init__(self) -> None:
        self.accepted = False
        self.messages: list[dict] = []

    async def accept(self) -> None:
        self.accepted = True

    async def send_text(self, text: str) -> None:
        self.messages.append(json.loads(text))


class TestFreezeTimer(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.manager = ConnectionManager()
        self.room_id = f"timer-{id(self)}"
        self.player_id = "player1"
        self.websocket = FakeWebSocket()
        await self.manager.connect(
            self.room_id, self.player_id, self.websocket  # type: ignore[arg-type]
        )
        self.session = session_manager.get_or_create(self.room_id)
        self.session.setup_game(["열쇠"])
        self.session.state.freeze_timeout_sec = 0.02

    async def asyncTearDown(self) -> None:
        self.manager.disconnect(self.room_id, self.player_id)
        await asyncio.sleep(0)
        session_manager.remove(self.room_id)

    async def _freeze(self) -> None:
        await self.manager.handle_message(self.room_id, self.player_id, {
            "type": "speech",
            "payload": {"transcript": "열쇠", "is_final": True},
        })

    async def test_timeout_eliminates_and_broadcasts(self) -> None:
        await self._freeze()
        await asyncio.sleep(0.04)

        player = self.session.state.get_player(self.player_id)
        self.assertIsNotNone(player)
        self.assertEqual(player.status.value, "eliminated")  # type: ignore[union-attr]
        eliminated = [
            message for message in self.websocket.messages
            if message["type"] == "eliminated"
        ]
        self.assertEqual(len(eliminated), 1)
        self.assertEqual(eliminated[0]["reason"], "freeze_timeout")
        self.assertEqual(self.websocket.messages[-1], {
            "type": "game_over",
            "reason": "human_eliminated",
        })
        self.assertNotIn(
            (self.room_id, self.player_id), self.manager._freeze_tasks
        )

    async def test_timeout_ends_solo_run_even_if_partner_is_alive(self) -> None:
        partner = self.session.state.get_player("partner")
        self.assertIsNotNone(partner)

        await self._freeze()
        await asyncio.sleep(0.04)

        message_types = [message["type"] for message in self.websocket.messages]
        self.assertEqual(message_types[-2:], ["eliminated", "game_over"])
        self.assertEqual(
            self.websocket.messages[-1]["reason"],
            "human_eliminated",
        )
        self.assertEqual(partner.status.value, "alive")  # type: ignore[union-attr]

    async def test_rescue_cancels_timeout(self) -> None:
        await self._freeze()
        player = self.session.state.get_player(self.player_id)
        partner = self.session.state.get_player("partner")
        partner.position.x = player.position.x  # type: ignore[union-attr]
        partner.position.z = player.position.z  # type: ignore[union-attr]
        await self.manager.handle_message(self.room_id, self.player_id, {
            "type": "action",
            "payload": {
                "action_type": "rescue",
                "actor_id": "partner",
                "target_id": self.player_id,
            },
        })
        await asyncio.sleep(0.04)

        player = self.session.state.get_player(self.player_id)
        self.assertEqual(player.status.value, "alive")  # type: ignore[union-attr]
        self.assertFalse(any(
            message["type"] == "eliminated"
            for message in self.websocket.messages
        ))
        self.assertNotIn(
            (self.room_id, self.player_id), self.manager._freeze_tasks
        )

    async def test_disconnect_cancels_timeout_task(self) -> None:
        await self._freeze()
        key = (self.room_id, self.player_id)
        task = self.manager._freeze_tasks[key]

        self.manager.disconnect(self.room_id, self.player_id)
        await asyncio.sleep(0)

        self.assertTrue(task.cancelled())
        self.assertNotIn(key, self.manager._freeze_tasks)
        self.assertNotIn(self.room_id, session_manager.sessions)

    async def test_seeker_catch_cancels_pending_freeze_timeout(self) -> None:
        await self._freeze()
        key = (self.room_id, self.player_id)
        task = self.manager._freeze_tasks[key]
        player = self.session.state.get_player(self.player_id)
        seeker = self.session.state.get_player("seeker")
        seeker.position.x = player.position.x  # type: ignore[union-attr]
        seeker.position.z = player.position.z  # type: ignore[union-attr]

        await self.manager.handle_message(self.room_id, self.player_id, {
            "type": "action",
            "payload": {"action_type": "seeker_catch"},
        })
        await asyncio.sleep(0)

        player = self.session.state.get_player(self.player_id)
        self.assertEqual(player.status.value, "eliminated")  # type: ignore[union-attr]
        self.assertTrue(task.cancelled())
        self.assertNotIn(key, self.manager._freeze_tasks)
        self.assertEqual(self.websocket.messages[-2:], [
            {
                "type": "eliminated",
                "player_id": self.player_id,
                "reason": "caught_by_seeker",
            },
            {"type": "game_over", "reason": "caught_by_seeker"},
        ])
