"""온보딩부터 게이트 탈출까지 한 연결로 완주하는 WebSocket 회귀 테스트."""

import time

from fastapi.testclient import TestClient

from app.ai.mission import load_prop_dict
from app.game.session import session_manager
from app.game.authority import MovementSample
from app.main import app


def _safe_indirect_command(forbidden_word: str) -> str:
    """금기어 자체를 포함하지 않는 외형 단서 두 개로 동료 명령을 만든다."""
    curated = {
        "열쇠": "자물쇠에 넣어 돌리는 반짝이는 작은 물건 확인해줘",
        "커피": "갈색이고 따뜻하고 컵에 담긴 마시는 것 확인해줘",
        "빨간": "소방차 색이고 눈에 띄는 강렬한 색 물건 확인해줘",
    }
    if forbidden_word in curated:
        return curated[forbidden_word]
    descriptions = [
        description
        for description in load_prop_dict()[forbidden_word]["descriptions"]
        if forbidden_word not in description
    ]
    assert len(descriptions) >= 2
    return f"{' '.join(descriptions)} 물건 확인해줘"


def test_onboarding_to_authoritative_gate_escape_full_flow() -> None:
    client = TestClient(app)
    room_id = "full-flow-room"
    player_id = "player1"

    with client.websocket_connect(f"/ws/{room_id}/{player_id}") as ws:
        # 지원되지 않는 답변은 T1 식별 단서가 보장된 기본 금기어 3개로 보충된다.
        ws.send_json({
            "type": "onboarding_complete",
            "payload": {"answers": ["주말에는 축구를 하고 치킨과 피자를 먹어요."]},
        })

        forbidden_ready = ws.receive_json()
        assert forbidden_ready["type"] == "forbidden_words_ready"
        assert len(forbidden_ready["forbidden_words"]) == 3

        started = ws.receive_json()
        assert started["type"] == "game_started"
        assert started["state"]["phase"] == "playing"
        assert started["state"]["forbidden_words"] == forbidden_ready["forbidden_words"]
        assert len(started["round"]["missions"]) == 3
        assert started["round"]["total_clues"] == 3
        assert "spell_words" not in started["round"]
        assert all("clue_word" not in mission for mission in started["round"]["missions"])
        active_gate = started["active_gate"]
        assert active_gate["gate_id"] in {"gate_back", "gate_main", "gate_gym"}

        # 각 T1은 안전한 우회 발화 → AI 명령 → AI 전용 조사 순서를 지킨다.
        collected_clues = []
        for mission_index, mission in enumerate(started["round"]["missions"]):
            utterance = _safe_indirect_command(mission["forbidden_word"])
            assert mission["forbidden_word"] not in utterance
            ws.send_json({
                "type": "speech",
                "payload": {"transcript": utterance, "is_final": True},
            })

            sound_ping = ws.receive_json()
            speech_safe = ws.receive_json()
            partner_decision = ws.receive_json()
            partner_command = ws.receive_json()
            assert sound_ping["type"] == "sound_ping"
            assert speech_safe == {
                "type": "speech_safe",
                "player_id": player_id,
                "transcript": utterance,
                "is_final": True,
            }
            assert partner_decision["type"] == "partner_decision"
            assert partner_decision["decision"] == "act"
            assert len(partner_decision["candidates"]) == 3
            assert partner_command["type"] == "partner_command"
            assert partner_command["utterance"] == utterance

            session = session_manager.get_or_create(room_id)
            partner = session.state.get_player("partner")
            partner.position.x = partner_command["position"]["x"]
            partner.position.z = partner_command["position"]["z"]
            session.companion_goal_started = time.monotonic() - 4.0
            inspected = ws.receive_json()
            assert inspected["type"] == "prop_inspected"
            assert inspected["is_correct"] is True
            assert inspected["mission_index"] == mission_index
            assert inspected["next_mission_index"] == mission_index + 1
            assert set(inspected["clue"]) == {"word", "order", "total"}
            collected_clues.append(inspected["clue"])
            assert inspected["all_complete"] is (mission_index == 2)

        session = session_manager.get_or_create(room_id)
        assert session.state.phase.value == "final_spell"
        assert inspected["active_gate"] == active_gate

        sample = session.position_samples[player_id]
        session.position_samples[player_id] = MovementSample(
            sample.x, sample.z, sample.timestamp - 20.0
        )

        # 잠긴 활성 게이트 근처로 이동한 뒤 서버 도착 승인을 받는다.
        ws.send_json({
            "type": "action",
            "payload": {
                "action_type": "move",
                "x": active_gate["position"]["x"],
                "z": active_gate["position"]["z"],
            },
        })
        ws.send_json({
            "type": "action",
            "payload": {
                "action_type": "gate_arrived",
                "gate_id": active_gate["gate_id"],
            },
        })
        assert ws.receive_json() == {
            "type": "gate_arrived",
            "player_id": player_id,
            "gate_id": active_gate["gate_id"],
        }

        # 획득 순서와 별개인 표식을 보고 세 조각을 직접 재배열한다.
        spell_text = " ".join(
            clue["word"] for clue in sorted(collected_clues, key=lambda clue: clue["order"])
        )
        ws.send_json({"type": "spell", "payload": {"spell_text": spell_text}})
        spell_success = ws.receive_json()
        assert spell_success["type"] == "spell_success"
        assert len(spell_success["matched"]) == 3
        assert spell_success["order_valid"] is True
        assert session.state.phase.value == "escape"

        # 열린 동일 게이트를 통과해야 서버가 최종 승리를 확정한다.
        ws.send_json({
            "type": "action",
            "payload": {
                "action_type": "gate_escape",
                "gate_id": active_gate["gate_id"],
            },
        })
        assert ws.receive_json() == {
            "type": "game_won",
            "player_id": player_id,
            "reason": "escaped",
            "gate_id": active_gate["gate_id"],
        }
        assert session.state.phase.value == "result"
