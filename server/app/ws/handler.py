from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.ws.manager import ConnectionManager

router = APIRouter()
manager = ConnectionManager()


@router.websocket("/ws/{room_id}/{player_id}")
async def websocket_endpoint(
    websocket: WebSocket, room_id: str, player_id: str
):
    await manager.connect(room_id, player_id, websocket)
    try:
        while True:
            data = await websocket.receive_json()
            await manager.handle_message(room_id, player_id, data)
    except WebSocketDisconnect:
        manager.disconnect(room_id, player_id)
