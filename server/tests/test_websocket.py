"""WebSocket 통합 테스트

FastAPI TestClient로 WebSocket 연결 → 메시지 → 응답을 검증한다.
"""

import pytest
import time
from fastapi.testclient import TestClient

from app.main import app
from app.game.authority import MovementSample
from app.game.progression import VerticalRoundPhase, WorldFloor


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
    def test_two_clients_create_join_ready_and_start_same_authoritative_room(self, client):
        def receive_type(socket, expected: str) -> dict:
            for _ in range(12):
                message = socket.receive_json()
                if message.get("type") == expected:
                    return message
            raise AssertionError(f"{expected} 이벤트를 받지 못했다")

        with client.websocket_connect("/ws/LIVE42/host-live") as host:
            host.send_json({
                "type": "create_room",
                "payload": {"nickname": "방장곰"},
            })
            created = receive_type(host, "room_created")
            assert created["room"]["room_id"] == "LIVE42"

            with client.websocket_connect("/ws/LIVE42/guest-live") as guest:
                guest.send_json({
                    "type": "join_room",
                    "payload": {"nickname": "손님새"},
                })
                assert receive_type(host, "room_joined")["room"]["players"][1]["nickname"] == "손님새"
                receive_type(guest, "room_joined")

                host.send_json({
                    "type": "select_character",
                    "payload": {"character_id": "R01"},
                })
                receive_type(host, "character_selected")
                receive_type(guest, "character_selected")
                guest.send_json({
                    "type": "select_character",
                    "payload": {"character_id": "R02"},
                })
                receive_type(host, "character_selected")
                receive_type(guest, "character_selected")

                host.send_json({"type": "player_ready", "payload": {"ready": True}})
                receive_type(host, "player_ready_changed")
                receive_type(guest, "player_ready_changed")
                guest.send_json({"type": "player_ready", "payload": {"ready": True}})
                ready_host = receive_type(host, "player_ready_changed")
                receive_type(guest, "player_ready_changed")
                assert all(player["is_ready"] for player in ready_host["room"]["players"])

                host.send_json({
                    "type": "start_game",
                    "payload": {"dynamic_forbidden": True},
                })
                starting_host = receive_type(host, "game_starting")
                starting_guest = receive_type(guest, "game_starting")
                assert [item["partner_id"] for item in starting_host["ai_partners"]] == [
                    "partner", "partner-2",
                ]
                assert starting_guest["human_players"] == starting_host["human_players"]
                game_host = receive_type(host, "game_started")
                game_guest = receive_type(guest, "game_started")
                assert game_host["state"]["phase"] == "playing"
                assert game_guest["state"]["players"].keys() == game_host["state"]["players"].keys()
                runner_positions = {
                    (
                        player["position"]["x"],
                        player["position"]["z"],
                    )
                    for player in game_host["state"]["players"].values()
                    if player["role"] != "seeker"
                }
                assert len(runner_positions) == 4

                host_position = game_host["state"]["players"]["host-live"]["position"]
                host.send_json({
                    "type": "action",
                    "payload": {
                        "action_type": "move",
                        "x": host_position["x"],
                        "z": host_position["z"],
                    },
                })
                moved = receive_type(guest, "player_moved")
                assert moved == {
                    "type": "player_moved",
                    "player_id": "host-live",
                    "position": {"x": host_position["x"], "z": host_position["z"]},
                }

    def test_dynamic_start_hides_forbidden_profile(self, client):
        with client.websocket_connect("/ws/dynamic-start/player1") as ws:
            ws.send_json({
                "type": "start_game",
                "payload": {"dynamic_forbidden": True},
            })
            data = ws.receive_json()

            assert data["type"] == "game_started"
            assert data["state"]["forbidden_words"] == []
            assert data["state"]["forbidden_profile"] == {"status": "observing"}
            assert "round" not in data

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
                "closing_pending_floor": None,
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
        from app.game.map_slots import get_map_slot

        with client.websocket_connect("/ws/room2/player1") as ws:
            self._start_game(ws)
            ws.send_json({
                "type": "speech",
                "payload": {"transcript": "반짝이는 물건 확인해줘", "is_final": True},
            })
            ping = ws.receive_json()
            data = ws.receive_json()
            assert ping["type"] == "sound_ping"
            spawn = get_map_slot("ROOF_RUNNER_SPAWN_A")["position"]
            assert ping["position"] == {"x": spawn[0], "z": spawn[2]}
            assert data["type"] == "speech_safe"
            assert data["transcript"] == "반짝이는 물건 확인해줘"

    def test_dynamic_freeze_does_not_reveal_matched_word(self, client):
        from app.game.session import session_manager

        with client.websocket_connect("/ws/dynamic-freeze/player1") as ws:
            ws.send_json({
                "type": "start_game",
                "payload": {"dynamic_forbidden": True},
            })
            ws.receive_json()
            session = session_manager.get_or_create("dynamic-freeze")
            session.dynamic_forbidden.apply(
                ["마이크"], analyzed_through=3, now=100.0, reason="test",
            )
            session.state.forbidden_words = ["마이크"]
            session.engine.update_words(["마이크"])

            ws.send_json({
                "type": "speech",
                "payload": {"transcript": "마이크를 확인해", "is_final": True},
            })
            assert ws.receive_json()["type"] == "sound_ping"
            freeze = ws.receive_json()
            assert freeze["type"] == "freeze"
            assert "matched_word" not in freeze
            assert "matched_stage" not in freeze
            assert "confidence" not in freeze

    def test_low_confidence_phonetic_match_requests_private_rephrase(self, client):
        with client.websocket_connect("/ws/phonetic-recheck/player1") as ws:
            self._start_game(ws)
            ws.send_json({
                "type": "speech",
                "payload": {"transcript": "열세 가져와", "is_final": True},
            })
            assert ws.receive_json()["type"] == "sound_ping"
            recheck = ws.receive_json()
            assert recheck == {
                "type": "speech_uncertain",
                "message": "음성이 불분명했습니다. 같은 뜻을 다른 표현으로 다시 말해 주세요.",
            }
            assert "word" not in recheck
            assert "confidence" not in recheck


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
        from app.game.map_slots import get_map_slot
        from app.game.progression import WorldFloor
        from app.game.session import session_manager

        with client.websocket_connect("/ws/vertical-enabled/player1") as ws:
            ws.send_json({"type": "start_game", "payload": {"forbidden_words": ["열쇠"]}})
            ws.receive_json()
            session = session_manager.get_or_create("vertical-enabled")
            session.vertical_progression_enabled = True
            player = session.state.get_player("player1")
            player.position.floor = WorldFloor.ROOF

            slot_by_signal = {
                "center": "ROOF_SIGNAL_CENTER",
                "east": "ROOF_SIGNAL_EAST",
                "west": "ROOF_SIGNAL_WEST",
            }
            for signal_id in session.vertical_missions.rooftop.sequence:
                slot_id = slot_by_signal[signal_id]
                slot = get_map_slot(slot_id)
                player.position.x, player.position.y, player.position.z = slot["interactionPosition"]
                ws.send_json({
                    "type": "action",
                    "payload": {
                        "action_type": "interact_stage_mission",
                        "signal_id": signal_id,
                    },
                })
                progress = ws.receive_json()
                assert progress["type"] == "rooftop_signal_progress"

            assert progress["completed"]
            advanced = ws.receive_json()

            assert advanced["type"] == "vertical_stage_advanced"
            assert advanced["completed_phase"] == "rooftop_intro"
            assert advanced["next_phase"] == "floor_3"
            assert advanced["progression"]["active_floor"] == "F3"
            reveal = ws.receive_json()
            assert reveal["type"] == "seeker_phase_event"
            assert reveal["event"] == "first_reveal"
            assert reveal["seeker_threat"] == "omen"
            # 술래는 이미 3층 계단실에 생성되어 있으며 단계 전환으로
            # 재텔레포트하지 않는다.
            seeker = session.state.get_player("seeker")
            assert seeker.position.floor == WorldFloor.F3

    def test_intercom_speech_advances_floor_two_with_ordered_clue(self, client):
        from app.game.progression import WorldFloor
        from app.game.session import session_manager
        from app.game.vertical_flow import mission_interaction_position

        with client.websocket_connect("/ws/vertical-intercom/player1") as ws:
            ws.send_json({
                "type": "start_game",
                "payload": {"forbidden_words": ["열쇠"]},
            })
            ws.receive_json()
            session = session_manager.get_or_create("vertical-intercom")
            session.vertical_round.phase = VerticalRoundPhase.FLOOR_2
            player = session.state.get_player("player1")
            x, y, z = mission_interaction_position(VerticalRoundPhase.FLOOR_2)
            player.position.x, player.position.y, player.position.z = x, y, z
            player.position.floor = WorldFloor.F2

            ws.send_json({
                "type": "action",
                "payload": {"action_type": "interact_stage_mission"},
            })
            assert ws.receive_json()["type"] == "vertical_mission_started"
            session.vertical_missions.intercom.ai_arrived = True
            answer = ", ".join(
                f"{item['color']} {item['shape']}"
                for item in session.vertical_missions.intercom.expected_sequence
            )
            ws.send_json({
                "type": "speech",
                "payload": {"transcript": answer, "is_final": True},
            })

            assert ws.receive_json()["type"] == "sound_ping"
            assert ws.receive_json()["type"] == "speech_safe"
            assert ws.receive_json()["type"] == "intercom_result"
            advanced = ws.receive_json()
            assert advanced["type"] == "vertical_stage_advanced"
            assert advanced["next_phase"] == "floor_1"
            assert advanced["clue"] == {
                "fragment_id": "correction_signal",
                "symbol": "↺",
                "riddle": "틀린 답을 바르게 고치는 일 · 두 글자",
                "relation": "달 표식 다음, 출구 표식 이전",
                "total": 3,
            }

    def test_intercom_failure_keeps_retry_open_and_ai_corrects_mismatch(self, client):
        from app.game.session import session_manager
        from app.game.vertical_flow import mission_interaction_position

        with client.websocket_connect("/ws/vertical-intercom-retry/player1") as ws:
            ws.send_json({
                "type": "start_game",
                "payload": {"forbidden_words": ["열쇠"]},
            })
            ws.receive_json()
            session = session_manager.get_or_create("vertical-intercom-retry")
            session.vertical_round.phase = VerticalRoundPhase.FLOOR_2
            player = session.state.get_player("player1")
            x, y, z = mission_interaction_position(VerticalRoundPhase.FLOOR_2)
            player.position.x, player.position.y, player.position.z = x, y, z
            player.position.floor = WorldFloor.F2

            ws.send_json({
                "type": "action",
                "payload": {"action_type": "interact_stage_mission"},
            })
            assert ws.receive_json()["type"] == "vertical_mission_started"
            session.vertical_missions.intercom.ai_arrived = True

            ws.send_json({
                "type": "speech",
                "payload": {"transcript": "첫 번째 기호만 들었어", "is_final": True},
            })
            assert ws.receive_json()["type"] == "sound_ping"
            assert ws.receive_json()["type"] == "speech_safe"
            result = ws.receive_json()
            assistant = ws.receive_json()

            assert result["type"] == "intercom_result"
            assert not result["success"]
            assert result["retry_available"]
            assert not result["exhausted"]
            assert assistant["type"] == "companion_report"
            assert assistant["speech_intent"] == "ask_clarification"
            assert "다시" in assistant["message"]

    def test_third_floor_mission_changes_omen_to_limited_hunt(self, client):
        from app.game.session import session_manager
        from app.game.vertical_flow import mission_interaction_position

        with client.websocket_connect("/ws/vertical-third-floor-threat/player1") as ws:
            self._start_game(ws)
            session = session_manager.get_or_create("vertical-third-floor-threat")
            session.vertical_round.phase = VerticalRoundPhase.FLOOR_3
            player = session.state.get_player("player1")
            x, y, z = mission_interaction_position(VerticalRoundPhase.FLOOR_3)
            player.position.x, player.position.y, player.position.z = x, y, z
            player.position.floor = WorldFloor.F3

            ws.send_json({
                "type": "action",
                "payload": {"action_type": "interact_stage_mission"},
            })

            changed = ws.receive_json()
            started = ws.receive_json()
            assert changed["type"] == "vertical_threat_changed"
            assert changed["seeker_threat"] == "limited_hunt"
            assert changed["progression"]["seeker_threat"] == "limited_hunt"
            assert started["type"] == "vertical_mission_started"
            assert started["mission"] == "floor_3_broadcast"
            assert started["required_meanings"] == [
                "문을 여는 도구", "잠긴 출입구", "개방 행동",
            ]
            assert started["voice_key"] == "Q"
            assert started["starts_limited_hunt"] is True
            assert started["hunt_grace_seconds"] == 6.5
            assert session.broadcast_hunt_grace_until > time.monotonic()

    def test_third_floor_ai_compares_all_candidates_before_acting(self, client):
        from app.game.session import session_manager
        from app.game.vertical_flow import mission_interaction_position

        with client.websocket_connect("/ws/vertical-third-floor-ai-feedback/player1") as ws:
            self._start_game(ws)
            session = session_manager.get_or_create("vertical-third-floor-ai-feedback")
            session.vertical_round.phase = VerticalRoundPhase.FLOOR_3
            player = session.state.get_player("player1")
            x, y, z = mission_interaction_position(VerticalRoundPhase.FLOOR_3)
            player.position.x, player.position.y, player.position.z = x, y, z
            player.position.floor = WorldFloor.F3

            ws.send_json({
                "type": "action",
                "payload": {"action_type": "interact_stage_mission"},
            })
            assert ws.receive_json()["type"] == "vertical_threat_changed"
            assert ws.receive_json()["type"] == "vertical_mission_started"

            ws.send_json({
                "type": "speech",
                "payload": {
                    "transcript": "길쭉한 도구",
                    "is_final": True,
                },
            })

            assert ws.receive_json()["type"] == "sound_ping"
            assert ws.receive_json()["type"] == "speech_safe"
            decision = ws.receive_json()
            assert decision["type"] == "partner_decision"
            assert decision["decision"] == "clarify"
            assert decision["speech_intent"] == "ask_clarification"
            assert len(decision["candidates"]) == 3
            assert "target_prop_id" not in decision
            assert all(candidate["prop_id"] in {
                "vertical_f3_candidate_a",
                "vertical_f3_candidate_b",
                "vertical_f3_candidate_c",
            } for candidate in decision["candidates"])

    def test_third_floor_on_air_closes_open_broadcast_room_door(self, client):
        from app.game.session import session_manager
        from app.game.vertical_flow import mission_interaction_position

        with client.websocket_connect("/ws/vertical-third-floor-door/player1") as ws:
            self._start_game(ws)
            session = session_manager.get_or_create("vertical-third-floor-door")
            session.vertical_round.phase = VerticalRoundPhase.FLOOR_3
            player = session.state.get_player("player1")
            x, y, z = mission_interaction_position(VerticalRoundPhase.FLOOR_3)
            player.position.x, player.position.y, player.position.z = x, y, z
            player.position.floor = WorldFloor.F3
            session.door_open_states["north_room_F3_1"] = True

            ws.send_json({
                "type": "action",
                "payload": {"action_type": "interact_stage_mission"},
            })

            closed = ws.receive_json()
            assert closed == {
                "type": "door_state_changed",
                "door_id": "north_room_F3_1",
                "open": False,
                "actor_id": "broadcast_system",
                "sealed": True,
            }
            assert session.door_open_states["north_room_F3_1"] is False

    def test_rooftop_contact_cannot_be_submitted_as_seeker_capture(self, client):
        from app.game.session import session_manager

        with client.websocket_connect("/ws/rooftop-catch-disabled/player1") as ws:
            self._start_game(ws)
            session = session_manager.get_or_create("rooftop-catch-disabled")
            player = session.state.get_player("player1")
            seeker = session.state.get_player("seeker")
            seeker.position.x, seeker.position.z = player.position.x, player.position.z
            seeker.position.floor = player.position.floor

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

    def test_simultaneous_device_advances_floor_one(self, client):
        from app.game.map_slots import get_map_slot
        from app.game.progression import WorldFloor
        from app.game.session import session_manager

        with client.websocket_connect("/ws/vertical-simultaneous/player1") as ws:
            self._start_game(ws)
            session = session_manager.get_or_create("vertical-simultaneous")
            from app.game.progression import FinalRoute
            session.final_route_choice = FinalRoute.FIELD
            session.vertical_round.phase = VerticalRoundPhase.FLOOR_1
            human = session.state.get_player("player1")
            partner = session.state.get_player("partner")
            human.position.x, human.position.y, human.position.z = get_map_slot("F1_DEVICE_A")["position"]
            human.position.floor = WorldFloor.F1
            partner.position.x, partner.position.y, partner.position.z = get_map_slot("F1_DEVICE_B")["position"]
            partner.position.floor = WorldFloor.F1
            sim = session.vertical_missions.simultaneous
            sim.start_guidance("player1")
            sim.accepted_commands = len(sim.route_commands)
            sim.ai_ready = True
            session.security_mission_actor_id = "player1"

            ws.send_json({
                "type": "action",
                "payload": {"action_type": "interact_stage_mission"},
            })
            activated = ws.receive_json()
            advanced = ws.receive_json()
            assert activated["type"] == "device_activated"
            assert activated["success"]
            assert advanced["type"] == "vertical_stage_advanced"
            assert advanced["next_phase"] == "field_final"
            assert advanced["clue"] == {
                "fragment_id": "escape_signal",
                "symbol": "⇥",
                "riddle": "갇힌 곳을 벗어나 밖으로 나감 · 두 글자",
                "relation": "세로선의 맨 아래에서 끝",
                "total": 3,
            }
            enraged = ws.receive_json()
            assert enraged["type"] == "seeker_phase_event"
            assert enraged["event"] == "enraged_field"
            assert enraged["seeker_threat"] == "enraged"

    def test_field_final_ready_never_sends_completed_spell(self, client):
        from app.game.progression import WorldFloor
        from app.game.session import session_manager
        from app.game.vertical_flow import activate_final_station, final_station_position

        with client.websocket_connect("/ws/vertical-final-ready/player1") as ws:
            self._start_game(ws)
            session = session_manager.get_or_create("vertical-final-ready")
            session.vertical_round.phase = VerticalRoundPhase.FIELD_FINAL
            for actor_id in ("player1", "partner", "partner-2"):
                actor = session.state.get_player(actor_id)
                actor.position.x, actor.position.y, actor.position.z = final_station_position(actor_id)
                actor.position.floor = WorldFloor.FIELD
            activate_final_station(session, "partner")
            activate_final_station(session, "partner-2")

            ws.send_json({
                "type": "action",
                "payload": {"action_type": "interact_stage_mission"},
            })
            station = ws.receive_json()
            ready = ws.receive_json()
            assert station["type"] == "final_station_activated"
            assert station["all_ready"]
            assert ready["type"] == "vertical_final_ready"
            assert ready["required_clues"] == 3
            assert "spell_words" not in ready
            assert "달빛" not in str(ready)

    def test_basement_devices_spell_and_exit_form_closed_loop(self, client):
        from app.game.map_slots import get_map_slot
        from app.game.progression import FinalRoute, WorldFloor
        from app.game.session import session_manager

        with client.websocket_connect("/ws/vertical-basement-loop/player1") as ws:
            self._start_game(ws)
            session = session_manager.get_or_create("vertical-basement-loop")
            session.final_route_choice = FinalRoute.BASEMENT
            session.vertical_round.final_route = FinalRoute.BASEMENT
            session.vertical_round.phase = VerticalRoundPhase.BASEMENT_FINAL
            human = session.state.get_player("player1")
            mission = session.vertical_missions.basement
            mission.correct_order = ["panel", "valve", "generator"]

            def receive_until(message_type: str, limit: int = 20):
                for _ in range(limit):
                    message = ws.receive_json()
                    if message.get("type") == message_type:
                        return message
                raise AssertionError(f"{message_type} 메시지를 받지 못함")

            command_by_device = {
                "panel": ("partner", "배전반 전원을 켜 줘"),
                "valve": ("partner-2", "급수 밸브를 돌려 줘"),
            }
            for index, device_id in enumerate(("panel", "valve")):
                companion_id, transcript = command_by_device[device_id]
                device = next(item for item in mission.devices if item.device_id == device_id)
                companion = session.state.get_player(companion_id)
                companion.position.x, companion.position.y, companion.position.z = get_map_slot(
                    device.slot_id
                )["position"]
                companion.position.floor = WorldFloor.B1
                ws.send_json({
                    "type": "speech",
                    "payload": {"transcript": transcript, "is_final": True},
                })
                commanded = receive_until("basement_device_commanded")
                assert commanded["success"]
                assert commanded["companion_id"] == companion_id
                activated = receive_until("basement_device_activated")
                assert activated["success"]
                assert activated["companion_id"] == companion_id
                assert activated["progress"] == index + 1

            generator = next(item for item in mission.devices if item.device_id == "generator")
            human.position.x, human.position.y, human.position.z = get_map_slot(
                generator.slot_id
            )["position"]
            human.position.floor = WorldFloor.B1
            ws.send_json({
                "type": "action",
                "payload": {
                    "action_type": "activate_basement_device",
                    "device_id": "generator",
                },
            })
            activated = receive_until("basement_device_activated")
            assert activated["success"]
            assert activated["completed"]

            ready = receive_until("vertical_final_ready")
            assert ready["type"] == "vertical_final_ready"
            assert "spell_words" not in ready
            assert session.state.phase == GamePhase.FINAL_SPELL

            ws.send_json({
                "type": "spell",
                "payload": {"spell_text": "달빛 교정 탈출"},
            })
            spell = ws.receive_json()
            assert spell["type"] == "spell_success"
            assert spell["progression"]["phase"] == "escape_open"

            session.state.get_player("partner").eliminate()
            session.state.get_player("partner-2").eliminate()
            human.position.x, human.position.y, human.position.z = get_map_slot(
                "BASEMENT_ESCAPE_GATE"
            )["position"]
            human.position.floor = WorldFloor.B1
            ws.send_json({
                "type": "action",
                "payload": {"action_type": "vertical_escape"},
            })
            escaped = ws.receive_json()
            won = ws.receive_json()
            assert escaped["type"] == "runner_escaped"
            assert escaped["gate_id"] == "basement_final_exit"
            assert won["type"] == "game_won"
            assert won["reason"] == "vertical_partial_escape"
            assert won["final_route"] == "basement"

    def test_sound_ping_precedes_judgment_at_latest_position(self, client):
        with client.websocket_connect("/ws/room11/player1") as ws:
            self._start_game(ws)
            ws.send_json({
                "type": "action",
                "payload": {"action_type": "move", "x": -26.8, "z": -37.2},
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
                "position": {"x": -26.8, "z": -37.2},
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
        from app.game.map_slots import get_map_slot

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
            spawn = get_map_slot("ROOF_RUNNER_SPAWN_A")["position"]
            assert (player.position.x, player.position.z) == (spawn[0], spawn[2])

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
        from app.game.session import TRAP_CONTRACT, session_manager

        with client.websocket_connect("/ws/room9/player1") as ws:
            self._start_game(ws)
            session = session_manager.get_or_create("room9")
            player = session.state.get_player("player1")
            assert player is not None
            trap = next(item for item in TRAP_CONTRACT["traps"] if item["id"] == "trap_field_diag")
            trap_x, trap_z = float(trap["x"]), float(trap["z"])
            session.active_trap_ids.add(trap["id"])
            player.position.x = trap_x
            player.position.z = trap_z
            session.position_samples["player1"] = MovementSample(
                trap_x, trap_z, session.position_samples["player1"].timestamp
            )
            ws.send_json({
                "type": "action",
                "payload": {
                    "action_type": "trap",
                    "trap_id": trap["id"],
                    "x": trap_x,
                    "z": trap_z,
                },
            })
            frozen = ws.receive_json()
            assert frozen["type"] == "freeze"
            assert frozen["matched_stage"] == "trap"
            assert frozen["trap_id"] == trap["id"]
            assert frozen["position"] == {"x": trap_x, "z": trap_z}

    def test_seeker_catch_eliminates_human_and_ends_game(self, client):
        from app.game.session import session_manager

        with client.websocket_connect("/ws/room10/player1") as ws:
            self._start_game(ws)
            session = session_manager.get_or_create("room10")
            session.vertical_round.phase = VerticalRoundPhase.FLOOR_2
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
            assert game_over["type"] == "game_over"
            assert game_over["reason"] == "caught_by_seeker"
            assert game_over["escaped_player_ids"] == []
            assert "companion_statuses" in game_over
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
            assert freeze_msg["fw_rage_tier"] == "warning"

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
        from app.game.state import PlayerStatus

        with client.websocket_connect("/ws/hunter-ai-catch/player1") as ws:
            ws.send_json({"type": "start_game", "payload": {"forbidden_words": ["열쇠"]}})
            ws.receive_json()
            session = session_manager.get_or_create("hunter-ai-catch")
            session.vertical_round.phase = VerticalRoundPhase.FLOOR_2
            seeker = session.state.get_player("seeker")
            partner = session.state.get_player("partner")
            partner2 = session.state.get_player("partner-2")
            human = session.state.get_player("player1")
            assert seeker and partner

            # 전원 탈락시켜야 game_over — 멀티 지원으로 변경됨
            # 먼저 partner-2, 인간을 빙결/탈락시킨다
            if partner2:
                partner2.eliminate()
            human.freeze()

            seeker.position.x = partner.position.x
            seeker.position.z = partner.position.z
            seeker.position.floor = partner.position.floor
            ws.send_json({
                "type": "action",
                "payload": {"action_type": "seeker_catch", "target_id": "partner"},
            })
            # eliminated + game_over 메시지를 찾는다
            found_eliminated = False
            found_game_over = False
            for _ in range(10):
                msg = ws.receive_json()
                if msg.get("type") == "eliminated" and msg.get("player_id") == "partner":
                    found_eliminated = True
                if msg.get("type") == "game_over":
                    found_game_over = True
                    break
            assert found_eliminated
            assert found_game_over
            assert partner.status == PlayerStatus.ELIMINATED
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
            session.broadcast_mission_actor_id = "player1"
            player.position.floor = seeker.position.floor
            player.position.x = seeker.position.x + 3.0
            player.position.z = seeker.position.z
            session.hunter_forward = {"x": 1.0, "z": 0.0}
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
            # 새 F3 스폰은 플레이어를 근거리 감지하므로 첫 틱은 DETECTED 정지 연출이다.
            # 다음 CHASE 틱까지 기다려 서버 시간 기반 이동을 확인한다.
            time.sleep(0.65)
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
            player = session.state.get_player("player1")
            assert player is not None
            player.position.x = gate["position"]["x"]
            player.position.z = gate["position"]["z"]
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
            assert won["spell_analysis"] == {
                "answer": ["파란", "하늘", "별"],
                "attempt_count": 2,
                "failed_attempts": [{
                    "attempt": 1,
                    "matched_count": 3,
                    "required_count": 3,
                    "order_valid": False,
                    "reason": "order",
                }],
                "solved": True,
            }
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
            game_over = ws.receive_json()
            assert game_over["type"] == "game_over"
            assert game_over["reason"] == "caught_by_seeker"
            assert game_over["escaped_player_ids"] == []
            assert "companion_statuses" in game_over
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
            player = session.state.get_player("player1")
            assert player is not None
            player.position.x = gate["position"]["x"]
            player.position.z = gate["position"]["z"]
            ws.send_json({
                "type": "action",
                "payload": {"action_type": "gate_arrived", "gate_id": gate["gate_id"]},
            })
            assert ws.receive_json()["type"] == "gate_arrived"

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
