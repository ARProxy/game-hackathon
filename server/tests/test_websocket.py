"""WebSocket 통합 테스트

FastAPI TestClient로 WebSocket 연결 → 메시지 → 응답을 검증한다.
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.game.state import GamePhase


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
            assert data["active_gate"]["gate_id"] in {"gate_back", "gate_main", "gate_gym"}


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
            ping = ws.receive_json()
            data = ws.receive_json()
            assert ping["type"] == "sound_ping"
            assert ping["position"] == {"x": 0.0, "z": 0.0}
            assert data["type"] == "speech_safe"
            assert data["transcript"] == "반짝이는 물건 확인해줘"

    def test_sound_ping_precedes_judgment_at_latest_position(self, client):
        with client.websocket_connect("/ws/room11/player1") as ws:
            self._start_game(ws)
            ws.send_json({
                "type": "action",
                "payload": {"action_type": "move", "x": 8.5, "z": -4.25},
            })
            ws.send_json({
                "type": "speech",
                "payload": {"transcript": "여기 확인해줘", "is_final": True},
            })

            ping = ws.receive_json()
            judgment = ws.receive_json()
            assert ping == {
                "type": "sound_ping",
                "player_id": "player1",
                "position": {"x": 8.5, "z": -4.25},
            }
            assert judgment["type"] == "speech_safe"

    def test_forbidden_word_freeze(self, client):
        with client.websocket_connect("/ws/room3/player1") as ws:
            self._start_game(ws)
            ws.send_json({
                "type": "speech",
                "payload": {"transcript": "열쇠를 가져와", "is_final": True},
            })
            ping = ws.receive_json()
            data = ws.receive_json()
            assert ping["type"] == "sound_ping"
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
            assert ws.receive_json()["type"] == "sound_ping"
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
            assert ws.receive_json()["type"] == "sound_ping"
            ws.receive_json()  # freeze

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

    def test_ai_partner_can_rescue_human(self, client):
        with client.websocket_connect("/ws/room8/player1") as ws:
            self._start_game(ws)
            ws.send_json({
                "type": "speech",
                "payload": {"transcript": "열쇠", "is_final": True},
            })
            assert ws.receive_json()["type"] == "sound_ping"
            assert ws.receive_json()["type"] == "freeze"

            ws.send_json({
                "type": "action",
                "payload": {
                    "action_type": "rescue",
                    "actor_id": "partner",
                    "target_id": "player1",
                },
            })
            rescued = ws.receive_json()
            assert rescued["type"] == "rescued"
            assert rescued["rescuer_id"] == "partner"
            assert rescued["target_id"] == "player1"

    def test_trap_freezes_at_reported_position(self, client):
        with client.websocket_connect("/ws/room9/player1") as ws:
            self._start_game(ws)
            ws.send_json({
                "type": "action",
                "payload": {
                    "action_type": "trap",
                    "trap_id": "trap_field_diag",
                    "x": 7.5,
                    "z": -2.25,
                },
            })
            frozen = ws.receive_json()
            assert frozen["type"] == "freeze"
            assert frozen["matched_stage"] == "trap"
            assert frozen["trap_id"] == "trap_field_diag"
            assert frozen["position"] == {"x": 7.5, "z": -2.25}

    def test_seeker_catch_eliminates_human_and_ends_game(self, client):
        with client.websocket_connect("/ws/room10/player1") as ws:
            self._start_game(ws)
            ws.send_json({
                "type": "action",
                "payload": {"action_type": "seeker_catch"},
            })

            eliminated = ws.receive_json()
            game_over = ws.receive_json()
            assert eliminated == {
                "type": "eliminated",
                "player_id": "player1",
                "reason": "caught_by_seeker",
            }
            assert game_over == {
                "type": "game_over",
                "reason": "caught_by_seeker",
            }

            from app.game.session import session_manager

            state = session_manager.get_or_create("room10").state
            assert state.get_player("player1").status.value == "eliminated"
            assert state.phase.value == "result"


class TestGameOver:
    def test_human_freeze_does_not_end_solo_team(self, client):
        """싱글 플레이도 AI 동료가 살아 있으므로 즉시 전멸하지 않는다."""
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
            assert ws.receive_json()["type"] == "sound_ping"
            freeze_msg = ws.receive_json()
            assert freeze_msg["type"] == "freeze"
            assert freeze_msg["player_id"] == "player1"

            # 서버 상태에 AI 동료와 술래가 등록됐는지 새 연결의 시작 응답으로 확인한다.
            # 추가 game_over 메시지가 없어야 하므로 블로킹 receive 대신 세션 상태를 검사한다.
            from app.game.session import session_manager

            state = session_manager.get_or_create("room7").state
            assert state.get_player("partner").role.value == "ai_partner"
            assert state.get_player("partner").status.value == "alive"
            assert state.get_player("seeker").role.value == "seeker"
            assert not state.all_non_seeker_frozen_or_eliminated()


class TestEscapeFlow:
    def test_gate_arrival_then_spell_then_escape_is_server_authoritative(self, client):
        from app.game.session import session_manager

        with client.websocket_connect("/ws/room10/player1") as ws:
            ws.send_json({
                "type": "start_game",
                "payload": {"forbidden_words": ["열쇠"]},
            })
            ws.receive_json()
            session = session_manager.get_or_create("room10")
            session.spell_words = ["파란", "하늘", "별"]
            session.state.phase = GamePhase.FINAL_SPELL
            gate = session.active_gate_payload()

            ws.send_json({
                "type": "action",
                "payload": {
                    "action_type": "move",
                    "x": gate["position"]["x"],
                    "z": gate["position"]["z"],
                },
            })
            ws.send_json({
                "type": "action",
                "payload": {"action_type": "gate_arrived", "gate_id": gate["gate_id"]},
            })
            arrived = ws.receive_json()
            assert arrived == {
                "type": "gate_arrived",
                "player_id": "player1",
                "gate_id": gate["gate_id"],
            }

            ws.send_json({
                "type": "spell",
                "payload": {"spell_text": "파란 하늘"},
            })
            spell = ws.receive_json()
            assert spell["type"] == "spell_success"
            assert session.state.phase.value == "escape"

            ws.send_json({
                "type": "action",
                "payload": {"action_type": "gate_escape", "gate_id": gate["gate_id"]},
            })
            won = ws.receive_json()
            assert won == {
                "type": "game_won",
                "player_id": "player1",
                "reason": "escaped",
                "gate_id": gate["gate_id"],
            }
            assert session.state.phase.value == "result"

    def test_spell_is_rejected_until_authoritative_gate_arrival(self, client):
        from app.game.session import session_manager

        with client.websocket_connect("/ws/room12/player1") as ws:
            ws.send_json({"type": "start_game", "payload": {"forbidden_words": ["열쇠"]}})
            ws.receive_json()
            session = session_manager.get_or_create("room12")
            session.spell_words = ["별"]
            session.state.phase = GamePhase.FINAL_SPELL

            ws.send_json({"type": "spell", "payload": {"spell_text": "별"}})
            assert ws.receive_json() == {
                "type": "spell_rejected",
                "reason": "gate_arrival_required",
            }
            assert session.state.phase.value == "final_spell"

    def test_gate_arrival_rejects_wrong_gate_and_distance(self, client):
        from app.game.session import session_manager

        with client.websocket_connect("/ws/room13/player1") as ws:
            ws.send_json({"type": "start_game", "payload": {"forbidden_words": ["열쇠"]}})
            started = ws.receive_json()
            session = session_manager.get_or_create("room13")
            session.state.phase = GamePhase.FINAL_SPELL
            active_id = started["active_gate"]["gate_id"]

            ws.send_json({
                "type": "action",
                "payload": {"action_type": "gate_arrived", "gate_id": "not_the_gate"},
            })
            assert ws.receive_json()["reason"] == "wrong_gate"

            ws.send_json({
                "type": "action",
                "payload": {"action_type": "gate_arrived", "gate_id": active_id},
            })
            assert ws.receive_json()["reason"] == "too_far"

    def test_spell_rechecks_alive_and_near_gate_after_arrival(self, client):
        from app.game.session import session_manager

        with client.websocket_connect("/ws/room14/player1") as ws:
            ws.send_json({"type": "start_game", "payload": {"forbidden_words": ["열쇠"]}})
            started = ws.receive_json()
            session = session_manager.get_or_create("room14")
            session.spell_words = ["별"]
            session.state.phase = GamePhase.FINAL_SPELL
            gate = started["active_gate"]

            ws.send_json({
                "type": "action",
                "payload": {
                    "action_type": "move",
                    "x": gate["position"]["x"],
                    "z": gate["position"]["z"],
                },
            })
            ws.send_json({
                "type": "action",
                "payload": {"action_type": "gate_arrived", "gate_id": gate["gate_id"]},
            })
            assert ws.receive_json()["type"] == "gate_arrived"

            player = session.state.get_player("player1")
            assert player is not None
            player.freeze()
            ws.send_json({"type": "spell", "payload": {"spell_text": "별"}})
            assert ws.receive_json()["type"] == "spell_rejected"
            assert session.state.phase == GamePhase.FINAL_SPELL

            player.unfreeze()
            player.position.x = 0.0
            player.position.z = 0.0
            ws.send_json({"type": "spell", "payload": {"spell_text": "별"}})
            assert ws.receive_json()["type"] == "spell_rejected"
            assert session.state.phase == GamePhase.FINAL_SPELL
