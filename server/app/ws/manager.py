from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field

from fastapi import WebSocket

logger = logging.getLogger(__name__)


@dataclass
class Room:
    room_id: str
    players: dict[str, WebSocket] = field(default_factory=dict)


class ConnectionManager:
    def __init__(self) -> None:
        self.rooms: dict[str, Room] = {}

    async def connect(
        self, room_id: str, player_id: str, websocket: WebSocket
    ) -> None:
        await websocket.accept()
        if room_id not in self.rooms:
            self.rooms[room_id] = Room(room_id=room_id)
        self.rooms[room_id].players[player_id] = websocket
        logger.info("connected: room=%s player=%s", room_id, player_id)

    def disconnect(self, room_id: str, player_id: str) -> None:
        room = self.rooms.get(room_id)
        if room:
            room.players.pop(player_id, None)
            if not room.players:
                del self.rooms[room_id]
        logger.info("disconnected: room=%s player=%s", room_id, player_id)

    async def handle_message(
        self, room_id: str, player_id: str, data: dict
    ) -> None:
        msg_type = data.get("type")
        logger.info(
            "message: room=%s player=%s type=%s", room_id, player_id, msg_type
        )
        # TODO: 메시지 타입별 처리 (speech, action, interact, spell)
        # 지금은 에코로 연결 검증
        await self.broadcast(room_id, {
            "type": "echo",
            "player_id": player_id,
            "payload": data,
        })

    async def broadcast(
        self, room_id: str, message: dict, exclude: str | None = None
    ) -> None:
        room = self.rooms.get(room_id)
        if not room:
            return
        payload = json.dumps(message, ensure_ascii=False)
        for pid, ws in room.players.items():
            if pid != exclude:
                await ws.send_text(payload)

    async def send_to(
        self, room_id: str, player_id: str, message: dict
    ) -> None:
        room = self.rooms.get(room_id)
        if room and player_id in room.players:
            payload = json.dumps(message, ensure_ascii=False)
            await room.players[player_id].send_text(payload)
