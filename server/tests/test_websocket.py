"""WebSocket 통합 테스트

FastAPI TestClient로 WebSocket 연결 → 메시지 → 응답을 검증한다.
"""

import pytest
import time
from fastapi.testclient import TestClient

from app.main import app
from app.game.authority import MovementSample
from app.game.progression import VerticalRoundPhase


def allow_elapsed_movement(session, player_id: str, seconds: float = 20.0) -> None:
    sample = session.position_samples[player_id]
    session.position_samples[player_id] = MovementSample(
        sample.x, sample.z, sample.timestamp - seconds
    )
from app.game.state import GamePhase


@pytest.fixture
def client():
    return TestClient(app)


class TestWebSocketConnection:
    def test_quick_start_uses_default_words_and_creates_round(self, client):
        with client.websocket_connect("/ws/quick-start/player1") as ws:
            ws.send_json({"type": "start_game", "payload": {}})
            data = ws.receive_json()

            assert data["type"] == "game_started"
            assert data["state"]["forbidden_words"] == ["열쇠", "커피", "빨간"]
            assert len(data["round"]["missions"]) == 3
            assert data["round"]["total_clues"] == 3

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
            assert data["state"]["vertical_progression"] == {
                "enabled": True,
                "phase": "rooftop_intro",
                "mission_complete": False,
                "final_route": None,
                "active_floor": "ROOF",
                "accessible_floors": ["ROOF"],
                "seeker_count": 0,
                "seeker_threat": "inactive",
                "time_escalation_enabled": True,
                "forbidden_word_violations": 0,
                "fw_rage_tier": "calm",
                "fw_speed_multiplier": 1.0,
            }
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
            assert ping["position"] == {"x": -27, "z": -52}
            assert data["type"] == "speech_safe"
            assert data["transcript"] == "반짝이는 물건 확인해줘"


class TestVerticalStageInteraction:
    def _start_game(self, ws):
        ws.send_json({
            "type": "start_game",
            "payload": {"forbidden_words": ["열쇠", "커피", "빨간"]},
        })
        ws.receive_json()

    def test_disabled_game_rejects_vertical_stage_action(self, client):
        from app.game.session import session_manager
        with client.websocket_connect("/ws/vertical-disabled/player1") as ws:
            ws.send_json({"type": "start_game", "payload": {"forbidden_words": ["열쇠"]}})
            ws.receive_json()
            session_manager.get_or_create("vertical-disabled").vertical_progression_enabled = False
            ws.send_json({
                "type": "action",
                "payload": {"action_type": "interact_stage_mission"},
            })

            rejected = ws.receive_json()
            assert rejected["type"] == "action_rejected"
            assert rejected["action_type"] == "interact_stage_mission"
            assert "아직 활성화" in rejected["reason"]

    def test_server_advances_rooftop_stage_from_authoritative_position(self, client):
        from app.game.progression import WorldFloor
        from app.game.session import session_manager
        from app.game.vertical_flow import mission_interaction_position

        with client.websocket_connect("/ws/vertical-enabled/player1") as ws:
            ws.send_json({"type": "start_game", "payload": {"forbidden_words": ["열쇠"]}})
            ws.receive_json()
            session = session_manager.get_or_create("vertical-enabled")
            session.vertical_progression_enabled = True
            player = session.state.get_player("player1")
            x, y, z = mission_interaction_position(session.vertical_round.phase)
            player.position.x, player.position.y, player.position.z = x, y, z
            player.position.floor = WorldFloor.ROOF

            ws.send_json({
                "type": "action",
                "payload": {"action_type": "interact_stage_mission"},
            })
            advanced = ws.receive_json()

            assert advanced["type"] == "vertical_stage_advanced"
            assert advanced["completed_phase"] == "rooftop_intro"
            assert advanced["next_phase"] == "floor_3"
            assert advanced["progression"]["active_floor"] == "F3"

    def test_sound_ping_precedes_judgment_at_latest_position(self, client):
        with client.websocket_connect("/ws/room11/player1") as ws:
            self._start_game(ws)
            ws.send_json({
                "type": "action",
                "payload": {"action_type": "move", "x": -26.8, "z": -51.8},
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
                "position": {"x": -26.8, "z": -51.8},
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
                "payload": {"action_type": "move", "x": -9.3, "z": -21.8},
            })
            # 단일 플레이어는 exclude 되므로 broadcast 안 옴
            # 위치가 서버에 반영됐는지는 다른 플레이어가 확인해야 함
            # 여기서는 에러 없이 처리되는지만 확인

    def test_move_rejects_instant_teleport_and_keeps_server_position(self, client):
        from app.game.session import session_manager

        with client.websocket_connect("/ws/move-speed/player1") as ws:
            self._start_game(ws)
            session = session_manager.get_or_create("move-speed")
            player = session.state.get_player("player1")
            assert player is not None

            ws.send_json({
                "type": "action",
                "payload": {"action_type": "move", "x": 40.0, "z": 40.0},
            })
            assert ws.receive_json() == {
                "type": "action_rejected",
                "action_type": "move",
                "reason": "implausible_movement",
            }
            assert (player.position.x, player.position.z) == (-27, -52)

    def test_ai_partner_can_rescue_human(self, client):
        from app.game.session import session_manager

        with client.websocket_connect("/ws/room8/player1") as ws:
            self._start_game(ws)
            session = session_manager.get_or_create("room8")
            player = session.state.get_player("player1")
            partner = session.state.get_player("partner")
            assert player is not None and partner is not None
            partner.position.x = player.position.x
            partner.position.z = player.position.z
            ws.send_json({
                "type": "speech",
                "payload": {"transcript": "열쇠", "is_final": True},
            })
            assert ws.receive_json()["type"] == "sound_ping"
            assert ws.receive_json()["type"] == "freeze"

            ws.send_json({"type": "action", "payload": {"action_type": "rescue_request"}})
            assert ws.receive_json()["type"] == "companion_assignment"
            rescued = ws.receive_json()
            assert rescued["type"] == "rescued"
            assert rescued["rescuer_id"] == "partner"
            assert rescued["target_id"] == "player1"

    def test_rescue_rejects_spoofed_role_and_far_partner(self, client):
        from app.game.session import session_manager

        with client.websocket_connect("/ws/rescue-authority/player1") as ws:
            self._start_game(ws)
            session = session_manager.get_or_create("rescue-authority")
            player = session.state.get_player("player1")
            assert player is not None
            player.freeze()

            # 술래 actor_id로 구조를 위조해도 인간 상태는 바뀌지 않는다.
            ws.send_json({
                "type": "action",
                "payload": {
                    "action_type": "rescue",
                    "actor_id": "seeker",
                    "target_id": "player1",
                },
            })
            assert ws.receive_json() == {
                "type": "action_rejected",
                "action_type": "rescue",
                "reason": "server_authoritative_actor",
            }
            assert player.is_frozen

            # 실제 AI 동료라도 서버 위치가 멀면 구조할 수 없다.
            ws.send_json({
                "type": "action",
                "payload": {
                    "action_type": "rescue",
                    "actor_id": "partner",
                    "target_id": "player1",
                },
            })
            assert ws.receive_json() == {
                "type": "action_rejected",
                "action_type": "rescue",
                "reason": "server_authoritative_actor",
            }
            assert player.is_frozen

            # 다음 위치 동기화 뒤 같은 구조 요청을 재시도하면 정상 복구된다.
            partner = session.state.get_player("partner")
            assert partner is not None
            partner.position.x = player.position.x
            partner.position.z = player.position.z
            ws.send_json({"type": "action", "payload": {"action_type": "rescue_request"}})
            assert ws.receive_json()["type"] == "companion_assignment"
            assert ws.receive_json()["type"] == "rescued"
            assert player.status.value == "alive"

    def test_trap_freezes_at_reported_position(self, client):
        from app.game.authority import MovementSample
        from app.game.session import session_manager

        with client.websocket_connect("/ws/room9/player1") as ws:
            self._start_game(ws)
            session = session_manager.get_or_create("room9")
            player = session.state.get_player("player1")
            assert player is not None
            session.active_trap_ids.add("trap_field_diag")
            player.position.x = 2.0
            player.position.z = 6.0
            session.position_samples["player1"] = MovementSample(
                2.0, 6.0, session.position_samples["player1"].timestamp
            )
            ws.send_json({
                "type": "action",
                "payload": {
                    "action_type": "trap",
                    "trap_id": "trap_field_diag",
                    "x": 2.0,
                    "z": 6.0,
                },
            })
            frozen = ws.receive_json()
            assert frozen["type"] == "freeze"
            assert frozen["matched_stage"] == "trap"
            assert frozen["trap_id"] == "trap_field_diag"
            assert frozen["position"] == {"x": 2.0, "z": 6.0}

    def test_seeker_catch_eliminates_human_and_ends_game(self, client):
        from app.game.session import session_manager

        with client.websocket_connect("/ws/room10/player1") as ws:
            self._start_game(ws)
            session = session_manager.get_or_create("room10")
            player = session.state.get_player("player1")
            seeker = session.state.get_player("seeker")
            assert player is not None and seeker is not None
            seeker.position.x = player.position.x
            seeker.position.z = player.position.z
            seeker.position.floor = player.position.floor
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
            state = session_manager.get_or_create("room10").state
            assert state.get_player("player1").status.value == "eliminated"
            assert state.phase.value == "result"

    def test_seeker_catch_rejects_far_server_position(self, client):
        from app.game.session import session_manager

        with client.websocket_connect("/ws/catch-authority/player1") as ws:
            self._start_game(ws)
            ws.send_json({
                "type": "action",
                "payload": {"action_type": "seeker_catch"},
            })
            rejected = ws.receive_json()
            assert rejected == {
                "type": "action_rejected",
                "action_type": "seeker_catch",
                "reason": "invalid_seeker_contact",
            }
            player = session_manager.get_or_create("catch-authority").state.get_player("player1")
            assert player is not None
            assert player.status.value == "alive"

    def test_seeker_catch_rejects_contact_through_wall(self, client):
        from app.game.session import session_manager

        with client.websocket_connect("/ws/catch-wall/player1") as ws:
            self._start_game(ws)
            session = session_manager.get_or_create("catch-wall")
            player = session.state.get_player("player1")
            seeker = session.state.get_player("seeker")
            assert player is not None and seeker is not None
            player.position.x, player.position.z = 0.0, -24.9
            seeker.position.x, seeker.position.z = 0.0, -25.9

            ws.send_json({
                "type": "action",
                "payload": {"action_type": "seeker_catch"},
            })
            assert ws.receive_json() == {
                "type": "action_rejected",
                "action_type": "seeker_catch",
                "reason": "invalid_seeker_contact",
            }
            assert player.status.value == "alive"

    def test_actor_move_rejects_human_role_spoof(self, client):
        with client.websocket_connect("/ws/actor-spoof/player1") as ws:
            self._start_game(ws)
            ws.send_json({
                "type": "action",
                "payload": {
                    "action_type": "actor_move",
                    "actor_id": "player1",
                    "x": 4.0,
                    "z": 4.0,
                },
            })
            assert ws.receive_json() == {
                "type": "action_rejected",
                "action_type": "actor_move",
                "reason": "invalid_actor_position",
            }

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
            assert freeze_msg["forbidden_word_violations"] == 1
            assert freeze_msg["fw_rage_tier"] == "calm"

            # 서버 상태에 AI 동료와 술래가 등록됐는지 새 연결의 시작 응답으로 확인한다.
            # 추가 game_over 메시지가 없어야 하므로 블로킹 receive 대신 세션 상태를 검사한다.
            from app.game.session import session_manager

            state = session_manager.get_or_create("room7").state
            vertical_round = session_manager.get_or_create("room7").vertical_round
            assert vertical_round.forbidden_word_violations == 1
            assert state.get_player("partner").role.value == "ai_partner"
            assert state.get_player("partner").status.value == "alive"
            assert state.get_player("seeker").role.value == "seeker"
            assert not state.all_non_seeker_frozen_or_eliminated()


class TestActiveHunterFlow:
    def test_human_client_requests_server_authoritative_intent(self, client):
        with client.websocket_connect("/ws/hunter-intent/player1") as ws:
            ws.send_json({"type": "start_game", "payload": {"forbidden_words": ["열쇠"]}})
            ws.receive_json()
            ws.send_json({
                "type": "action",
                "payload": {"action_type": "seeker_think", "forward_x": -999.0, "forward_z": 999.0},
            })
            intent = ws.receive_json()
            assert intent["type"] == "seeker_intent"
            assert intent["state"] in {"HUNT", "INVESTIGATE", "DETECTED", "CHASE", "SEARCH", "RUSH_GATE"}
            assert set(intent["target"]) == {"x", "z"}

    def test_seeker_eliminating_required_ai_ends_mission_run(self, client):
        from app.game.session import session_manager

        with client.websocket_connect("/ws/hunter-ai-catch/player1") as ws:
            ws.send_json({"type": "start_game", "payload": {"forbidden_words": ["열쇠"]}})
            ws.receive_json()
            session = session_manager.get_or_create("hunter-ai-catch")
            seeker = session.state.get_player("seeker")
            partner = session.state.get_player("partner")
            assert seeker and partner
            seeker.position.x = partner.position.x
            seeker.position.z = partner.position.z
            seeker.position.floor = partner.position.floor
            ws.send_json({
                "type": "action",
                "payload": {"action_type": "seeker_catch", "target_id": "partner"},
            })
            eliminated = ws.receive_json()
            assert eliminated == {
                "type": "eliminated",
                "player_id": "partner",
                "reason": "caught_by_seeker",
            }
            assert partner.status.value == "eliminated"
            game_over = ws.receive_json()
            assert game_over == {"type": "game_over", "reason": "caught_by_seeker"}
            assert session.state.phase.value == "result"

    def test_client_cannot_move_seeker_or_accelerate_server_tick(self, client):
        from app.game.session import session_manager

        with client.websocket_connect("/ws/hunter-authority/player1") as ws:
            ws.send_json({"type": "start_game", "payload": {"forbidden_words": ["열쇠"]}})
            ws.receive_json()
            session = session_manager.get_or_create("hunter-authority")
            seeker = session.state.get_player("seeker")
            player = session.state.get_player("player1")
            assert seeker
            session.vertical_round.phase = VerticalRoundPhase.FLOOR_3
            player.position.floor = seeker.position.floor
            start = (seeker.position.x, seeker.position.z)

            ws.send_json({
                "type": "action",
                "payload": {"action_type": "actor_move", "actor_id": "seeker", "x": -30, "z": 30},
            })
            assert ws.receive_json()["reason"] == "invalid_actor_position"
            assert (seeker.position.x, seeker.position.z) == start

            for _ in range(5):
                ws.send_json({"type": "action", "payload": {"action_type": "seeker_think"}})
                ws.receive_json()
            assert ((seeker.position.x - start[0]) ** 2 + (seeker.position.z - start[1]) ** 2) ** 0.5 < 0.2
            before_idle = (seeker.position.x, seeker.position.z)
            time.sleep(0.35)
            assert (seeker.position.x, seeker.position.z) != before_idle


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
            allow_elapsed_movement(session, "player1")

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
                "payload": {"spell_text": "별 하늘 파란"},
            })
            failed_ping = ws.receive_json()
            failed = ws.receive_json()
            assert failed_ping["type"] == "sound_ping"
            assert failed_ping["source"] == "failed_spell"
            assert failed_ping["position"] == gate["position"]
            assert failed["type"] == "spell_failed"
            assert failed["failure_reason"] == "order"
            assert failed["matched_count"] == 3
            assert "missing" not in failed
            assert "matched" not in failed
            assert session.state.phase.value == "final_spell"

            ws.send_json({
                "type": "spell",
                "payload": {"spell_text": "파란 하늘 별"},
            })
            spell = ws.receive_json()
            assert spell["type"] == "spell_success"
            assert session.state.phase.value == "escape"

            ws.send_json({
                "type": "action",
                "payload": {"action_type": "gate_escape", "gate_id": gate["gate_id"]},
            })
            won = ws.receive_json()
            assert won["type"] == "game_won"
            assert won["player_id"] == "player1"
            assert won["reason"] == "escaped"
            assert won["gate_id"] == gate["gate_id"]
            assert won["escaped_player_ids"] == ["player1"]
            assert won["companion_statuses"] == {"partner": "alive", "partner-2": "alive"}
            # A7: 결과에 금기어 누적→광분 인과관계 포함
            assert "fw_rage_tier" in won
            assert "rage_history" in won
            assert session.state.phase.value == "result"

    def test_seeker_contact_wins_gate_escape_race(self, client):
        from app.game.session import session_manager

        with client.websocket_connect("/ws/escape-catch-priority/player1") as ws:
            ws.send_json({
                "type": "start_game",
                "payload": {"forbidden_words": ["열쇠"]},
            })
            ws.receive_json()
            session = session_manager.get_or_create("escape-catch-priority")
            gate = session.active_gate_payload()
            player = session.state.get_player("player1")
            seeker = session.state.get_player("seeker")
            assert player is not None and seeker is not None
            player.position.x = gate["position"]["x"]
            player.position.z = gate["position"]["z"]
            seeker.position.x = player.position.x
            seeker.position.z = player.position.z
            seeker.position.floor = player.position.floor
            session.state.phase = GamePhase.ESCAPE

            ws.send_json({
                "type": "action",
                "payload": {
                    "action_type": "gate_escape",
                    "gate_id": gate["gate_id"],
                },
            })
            assert ws.receive_json() == {
                "type": "eliminated",
                "player_id": "player1",
                "reason": "caught_by_seeker",
            }
            assert ws.receive_json() == {
                "type": "game_over",
                "reason": "caught_by_seeker",
            }
            assert player.status.value == "eliminated"
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
            allow_elapsed_movement(session, "player1")

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
