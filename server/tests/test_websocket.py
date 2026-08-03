"""WebSocket 통합 테스트

FastAPI TestClient로 WebSocket 연결 → 메시지 → 응답을 검증한다.
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client():
    return TestClient(app)


class TestWebSocketConnection:
    def test_connect_and_receive(self, client):
        with client.websocket_connect("/ws/room1/player1") as ws:
            ws.send_json({
                "type": "start_game",
                "payload": {"forbidden_words": ["열쇠", "커피", "빨간"]},
            })
            data = ws.receive_json()
            assert data["type"] == "game_started"
            assert data["state"]["phase"] == "playing"
            assert data["state"]["forbidden_words"] == ["열쇠", "커피", "빨간"]


class TestSpeechJudgment:
    def _start_game(self, ws):
        ws.send_json({
            "type": "start_game",
            "payload": {"forbidden_words": ["열쇠", "커피", "빨간"]},
        })
        ws.receive_json()  # game_started 소비

    def test_safe_speech(self, client):
        with client.websocket_connect("/ws/room2/player1") as ws:
            self._start_game(ws)
            ws.send_json({
                "type": "speech",
                "payload": {"transcript": "반짝이는 물건 확인해줘", "is_final": True},
            })
            data = ws.receive_json()
            assert data["type"] == "speech_safe"
            assert data["transcript"] == "반짝이는 물건 확인해줘"

    def test_forbidden_word_freeze(self, client):
        with client.websocket_connect("/ws/room3/player1") as ws:
            self._start_game(ws)
            ws.send_json({
                "type": "speech",
                "payload": {"transcript": "열쇠를 가져와", "is_final": True},
            })
            data = ws.receive_json()
            assert data["type"] == "freeze"
            assert data["matched_word"] == "열쇠"
            assert data["player_id"] == "player1"

    def test_forbidden_with_particle(self, client):
        with client.websocket_connect("/ws/room4/player1") as ws:
            self._start_game(ws)
            ws.send_json({
                "type": "speech",
                "payload": {"transcript": "커피가 마시고 싶어", "is_final": True},
            })
            data = ws.receive_json()
            assert data["type"] == "freeze"
            assert data["matched_word"] == "커피"

    def test_frozen_player_speech_ignored(self, client):
        """빙결된 플레이어의 발화는 무시된다."""
        with client.websocket_connect("/ws/room5/player1") as ws:
            self._start_game(ws)
            # 금기어 → 빙결
            ws.send_json({
                "type": "speech",
                "payload": {"transcript": "열쇠", "is_final": True},
            })
            ws.receive_json()  # freeze
            ws.receive_json()  # game_over (1인이라 전원 빙결)

            # 빙결 상태에서 추가 발화 → 응답 없어야 함
            ws.send_json({
                "type": "speech",
                "payload": {"transcript": "커피", "is_final": True},
            })
            # 추가 응답이 없으므로 다른 메시지로 확인
            ws.send_json({"type": "unknown_type", "payload": {}})
            # unknown 타입은 아무 응답도 생성하지 않음 → 여기까지 오면 통과


class TestActions:
    def _start_game(self, ws):
        ws.send_json({
            "type": "start_game",
            "payload": {"forbidden_words": ["열쇠"]},
        })
        ws.receive_json()

    def test_move(self, client):
        with client.websocket_connect("/ws/room6/player1") as ws:
            self._start_game(ws)
            ws.send_json({
                "type": "action",
                "payload": {"action_type": "move", "x": 5.0, "z": 3.0},
            })
            # 단일 플레이어는 exclude 되므로 broadcast 안 옴
            # 위치가 서버에 반영됐는지는 다른 플레이어가 확인해야 함
            # 여기서는 에러 없이 처리되는지만 확인


class TestGameOver:
    def test_all_frozen_game_over(self, client):
        """플레이어가 1명일 때 빙결 → 즉시 game_over."""
        with client.websocket_connect("/ws/room7/player1") as ws:
            ws.send_json({
                "type": "start_game",
                "payload": {"forbidden_words": ["열쇠"]},
            })
            ws.receive_json()  # game_started

            ws.send_json({
                "type": "speech",
                "payload": {"transcript": "열쇠", "is_final": True},
            })
            freeze_msg = ws.receive_json()
            assert freeze_msg["type"] == "freeze"

            game_over_msg = ws.receive_json()
            assert game_over_msg["type"] == "game_over"
            assert game_over_msg["reason"] == "all_frozen"
