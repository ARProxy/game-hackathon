"""AI 동료 백그라운드 루프의 장애 격리와 자동 복구 테스트."""

import asyncio
from unittest.mock import patch

from app.ai.companion import CONTRACT as COMPANION_CONTRACT
from app.game.session import session_manager
from app.game.state import GamePhase
from app.ws.manager import ConnectionManager, Room


def test_companion_loop_recovers_after_transient_tick_failure() -> None:
    asyncio.run(_assert_companion_loop_recovers())


async def _assert_companion_loop_recovers() -> None:
    manager = ConnectionManager()
    room_id = "companion-recovery"
    manager.rooms[room_id] = Room(room_id=room_id)
    session = session_manager.get_or_create(room_id)
    session.setup_game()
    calls = 0

    def flaky_advance(_session):
        nonlocal calls
        calls += 1
        if calls == 1:
            raise RuntimeError("transient companion failure")
        _session.state.phase = GamePhase.RESULT
        return {"type": "idle"}, None

    try:
        with (
            patch.dict(COMPANION_CONTRACT, {"thinkIntervalSeconds": 0.001}),
            patch("app.ws.manager.advance_companion", side_effect=flaky_advance),
        ):
            await asyncio.wait_for(manager._run_companion(room_id), timeout=0.1)
        assert calls == 2
    finally:
        manager.rooms.pop(room_id, None)
        session_manager.remove(room_id)


def test_ensure_companion_task_does_not_create_duplicate_loop() -> None:
    asyncio.run(_assert_single_companion_loop())


async def _assert_single_companion_loop() -> None:
    manager = ConnectionManager()
    room_id = "companion-singleton"
    manager.rooms[room_id] = Room(room_id=room_id)
    session_manager.get_or_create(room_id).setup_game()
    try:
        manager._ensure_companion_task(room_id)
        first = manager._companion_tasks[room_id]
        manager._ensure_companion_task(room_id)
        assert manager._companion_tasks[room_id] is first
    finally:
        task = manager._companion_tasks.pop(room_id, None)
        if task:
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
        manager.rooms.pop(room_id, None)
        session_manager.remove(room_id)
