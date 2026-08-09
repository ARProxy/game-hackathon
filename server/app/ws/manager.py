from __future__ import annotations

import asyncio
import json
import logging
import math
import time
from dataclasses import dataclass, field

from fastapi import WebSocket, WebSocketException, status

from app.ai.dynamic_forbidden import analyze_dynamic_forbidden_words
from app.ai.mission import generate_round, round_to_dict
from app.ai.partner import compare_partner_candidates
from app.ai.companion import (
    CONTRACT as COMPANION_CONTRACT,
    advance_companion,
    command_companion,
    companion_snapshot,
    create_action_speech,
    request_companion_rescue,
)
from app.ai.hunter import (
    CONTRACT as HUNTER_CONTRACT,
    SeekerRole,
    advance_hunter,
    advance_secondary_hunter,
    effective_seeker_threat,
    hunter_snapshot,
    record_hunter_signal,
    seeker_can_capture,
)
from app.ai.speech import (
    SpeechIntent,
    SpeechMode,
    VoiceCommand,
    avoid_forbidden_words,
    classify_voice_command,
)
from app.ai.spell import check_spell
from app.game.authority import (
    ACTOR_MAX_SPEED,
    HUMAN_MAX_SPEED,
    MovementSample,
    has_clear_catch_line,
    movement_is_plausible,
)
from app.game.session import (
    DEFAULT_AI_PARTNER_IDS,
    DEFAULT_FORBIDDEN_WORDS,
    RESERVED_ACTOR_ROLES,
    TRAP_CONTRACT,
    session_manager,
)
from app.game.map_slots import get_map_slot, secondary_seeker_slot, seeker_reveal_slot
from app.game.progression import FinalRoute, InvalidProgression, VerticalRoundPhase, WorldFloor
from app.game.state import GamePhase, Player, PlayerRole, PlayerStatus
from app.game.vertical_flow import (
    BROADCAST_MEANING_LABELS,
    BROADCAST_MISSION_PROMPT,
    activate_rooftop_signal,
    activate_basement_device,
    activate_final_station,
    activate_simultaneous_device,
    complete_current_stage,
    cross_rooftop_stair_boundary,
    evaluate_broadcast_phrase,
    final_escape_slot,
    refresh_closing_floor,
    start_intercom_mission,
    submit_intercom_answer,
    use_open_floor_transition,
    use_elevator,
    validate_current_stage_interaction,
)

logger = logging.getLogger(__name__)


@dataclass
class Room:
    room_id: str
    players: dict[str, WebSocket] = field(default_factory=dict)


class ConnectionManager:
    def __init__(self) -> None:
        self.rooms: dict[str, Room] = {}
        self.rooms_config: dict[str, "RoomConfig"] = {}  # 방 설정
        self._freeze_tasks: dict[tuple[str, str], asyncio.Task[None]] = {}
        self._hunter_tasks: dict[str, asyncio.Task[None]] = {}
        self._companion_tasks: dict[str, asyncio.Task[None]] = {}
        self._forbidden_tasks: dict[str, asyncio.Task[None]] = {}

    async def connect(
        self, room_id: str, player_id: str, websocket: WebSocket
    ) -> None:
        if player_id in RESERVED_ACTOR_ROLES:
            raise WebSocketException(
                code=status.WS_1008_POLICY_VIOLATION,
                reason="reserved_actor_id",
            )
        if room_id not in self.rooms:
            self.rooms[room_id] = Room(room_id=room_id)
        room = self.rooms[room_id]
        if player_id in room.players:
            raise WebSocketException(
                code=status.WS_1008_POLICY_VIOLATION,
                reason="duplicate_player_id",
            )

        # accept의 await 전에 ID 소유권을 예약해 동시 접속도 한 소켓만
        # 통과시킨다. 핸드셰이크 실패 시 예약을 원복한다.
        room.players[player_id] = websocket
        try:
            await websocket.accept()
        except BaseException:
            room.players.pop(player_id, None)
            if not room.players:
                self.rooms.pop(room_id, None)
            raise

        # 게임 세션에 플레이어 등록
        session = session_manager.get_or_create(room_id)
        if session.state.get_player(player_id) is None:
            session.state.add_player(player_id, PlayerRole.HUMAN)

        logger.info("connected: room=%s player=%s", room_id, player_id)

    def disconnect(self, room_id: str, player_id: str) -> None:
        self._cancel_freeze_timeout(room_id, player_id)
        room = self.rooms.get(room_id)
        if room:
            room.players.pop(player_id, None)
            if not room.players:
                self._cancel_room_freeze_timeouts(room_id)
                hunter_task = self._hunter_tasks.pop(room_id, None)
                if hunter_task:
                    hunter_task.cancel()
                companion_task = self._companion_tasks.pop(room_id, None)
                if companion_task:
                    companion_task.cancel()
                forbidden_task = self._forbidden_tasks.pop(room_id, None)
                if forbidden_task:
                    forbidden_task.cancel()
                del self.rooms[room_id]
                session_manager.remove(room_id)
        logger.info("disconnected: room=%s player=%s", room_id, player_id)

    async def handle_message(
        self, room_id: str, player_id: str, data: dict
    ) -> None:
        msg_type = data.get("type")
        payload = data.get("payload", {})

        if msg_type == "speech":
            await self._handle_speech(room_id, player_id, payload)
        elif msg_type == "action":
            await self._handle_action(room_id, player_id, payload)
        elif msg_type in {"onboarding_complete", "request_onboarding_questions"}:
            # v5에서는 사전 질문과 금기어 공개 프로토콜을 폐기했다.
            await self.send_to(room_id, player_id, {
                "type": "action_rejected",
                "action_type": msg_type,
                "reason": "hidden_dynamic_profile_required",
            })
        elif msg_type == "spell":
            await self._handle_spell(room_id, player_id, payload)
        elif msg_type == "create_room":
            await self._handle_create_room(room_id, player_id, payload)
        elif msg_type == "join_room":
            await self._handle_join_room(room_id, player_id, payload)
        elif msg_type == "select_character":
            await self._handle_select_character(room_id, player_id, payload)
        elif msg_type == "player_ready":
            await self._handle_player_ready(room_id, player_id, payload)
        elif msg_type == "start_game":
            await self._handle_start_game(room_id, player_id, payload)
        else:
            logger.warning(
                "unknown message type: room=%s player=%s type=%s",
                room_id, player_id, msg_type,
            )

    async def _handle_speech(
        self, room_id: str, player_id: str, payload: dict
    ) -> None:
        transcript = payload.get("transcript", "")
        is_final = payload.get("is_final", False)

        session = session_manager.get_or_create(room_id)
        player = session.state.get_player(player_id)

        if session.is_paused:
            await self.send_to(room_id, player_id, {
                "type": "action_rejected", "action_type": "speech", "reason": "game_paused",
            })
            return

        # 빙결된 플레이어의 발화는 무시
        if player and player.status != PlayerStatus.ALIVE:
            return

        # B1: 음성 명령 분류
        voice_cmd = VoiceCommand.NONE
        if is_final and transcript.strip():
            voice_cmd = classify_voice_command(transcript)
            if voice_cmd == VoiceCommand.SILENCE:
                for runtime in session.companion_states.values():
                    runtime.speech_history.silence(10.0)
                await self.broadcast(room_id, {
                    "type": "voice_command", "command": voice_cmd.value,
                    "player_id": player_id,
                })
            elif voice_cmd != VoiceCommand.NONE:
                await self.broadcast(room_id, {
                    "type": "voice_command", "command": voice_cmd.value,
                    "player_id": player_id,
                })

        # 확정된 정상 발화는 내용 판정에 앞서 위치 기반 청각 핑을 만든다.
        # 술래는 안전 발화와 금기어 발화를 동일한 순서로 감지할 수 있다.
        if player and is_final and transcript.strip():
            signal_position = {"x": player.position.x, "z": player.position.z}
            record_hunter_signal(session, player_id, signal_position, "speech")
            await self.broadcast(room_id, {
                "type": "sound_ping",
                "player_id": player_id,
                "position": signal_position,
            })

        # 동적 금기어는 인간의 확정 발화만 판정한다. 현재 발화를 먼저
        # 판정한 뒤 관찰 목록에 넣어 새 세대가 소급 적용되지 않게 한다.
        should_check = (
            not session.dynamic_forbidden_enabled
            or bool(
                is_final and transcript.strip() and player
                and player.role == PlayerRole.HUMAN
            )
        )
        result = session.engine.check(transcript if should_check else "")
        if (
            session.dynamic_forbidden_enabled
            and is_final and transcript.strip() and player
            and player.role == PlayerRole.HUMAN
        ):
            self._record_dynamic_forbidden_utterance(room_id, session, transcript)

        if result.is_forbidden and player and player.role == PlayerRole.HUMAN:
            rage_policy = session.vertical_round.record_human_forbidden_word_violation()
            player.freeze()
            record_hunter_signal(
                session, player_id,
                {"x": player.position.x, "z": player.position.z}, "freeze",
            )
            freeze_event = {
                "type": "freeze",
                "player_id": player_id,
                "position": {
                    "x": player.position.x,
                    "z": player.position.z,
                },
                "forbidden_word_violations": session.vertical_round.forbidden_word_violations,
                "fw_rage_tier": rage_policy.tier.value,
            }
            if not session.dynamic_forbidden_enabled:
                freeze_event.update({
                    "matched_word": result.matched_word,
                    "matched_stage": result.matched_stage,
                    "confidence": result.confidence,
                    "elapsed_ms": result.elapsed_ms,
                })
            await self.broadcast(room_id, freeze_event)
            self._schedule_freeze_timeout(room_id, player_id)
            logger.info(
                "FREEZE: room=%s player=%s word=%s",
                room_id, player_id, result.matched_word,
            )

            # 팀 전멸 체크
            if session.state.all_non_seeker_frozen_or_eliminated():
                session.state.phase = GamePhase.RESULT
                self._cancel_room_freeze_timeouts(room_id)
                await self.broadcast(room_id, {
                    "type": "game_over",
                    "reason": "all_frozen",
                    **session.result_payload(),
                })
        else:
            # 안전한 발화 — 전사 텍스트를 브로드캐스트 (자막 표시용)
            await self.broadcast(room_id, {
                "type": "speech_safe",
                "player_id": player_id,
                "transcript": transcript,
                "is_final": is_final,
            })
            if (
                is_final and transcript.strip()
                and session.broadcast_mission_actor_id == player_id
                and session.vertical_round.phase == VerticalRoundPhase.FLOOR_3
            ):
                verdict = evaluate_broadcast_phrase(transcript)
                if not verdict["success"]:
                    await self.send_to(room_id, player_id, {
                        "type": "vertical_mission_feedback",
                        "success": False,
                        "missing": verdict["missing"],
                        "missing_labels": verdict["missing_labels"],
                        "prompt": BROADCAST_MISSION_PROMPT,
                    })
                    return
                session.broadcast_mission_actor_id = None
                event = complete_current_stage(session, player_id)
                await self._publish_vertical_stage_advance(
                    room_id, player_id, event,
                )
                return
            if (
                is_final and transcript.strip()
                and session.intercom_mission_actor_id == player_id
                and session.vertical_round.phase == VerticalRoundPhase.FLOOR_2
            ):
                try:
                    result = submit_intercom_answer(session, player_id, transcript)
                except InvalidProgression as error:
                    await self.send_to(room_id, player_id, {
                        "type": "action_rejected",
                        "action_type": "intercom_submit",
                        "reason": str(error),
                    })
                    return
                await self.broadcast(room_id, {"type": "intercom_result", **result})
                if not result.get("success"):
                    return
                session.intercom_mission_actor_id = None
                event = complete_current_stage(session, player_id)
                await self._publish_vertical_stage_advance(
                    room_id, player_id, event,
                )
                return
            mission = session.current_mission()
            if mission and is_final and transcript.strip():
                decision = compare_partner_candidates(
                    transcript, [mission.real_prop, *mission.decoy_props]
                )
                payload = {
                    "type": "partner_decision",
                    "decision": decision.action,
                    "confidence": decision.confidence,
                    "reply": decision.reply,
                    "candidates": [
                        {
                            "prop_id": candidate.prop.prop_id,
                            "zone": candidate.prop.zone,
                            "score": candidate.score,
                            "cues": candidate.cues,
                        }
                        for candidate in decision.ranked
                    ],
                    "utterance": transcript,
                }
                candidate_memory = [
                    {
                        "prop_id": candidate.prop.prop_id,
                        "zone": candidate.prop.zone,
                        "confidence_score": candidate.score,
                        "matched_cues": candidate.cues,
                        "evaluated_at": time.monotonic(),
                    }
                    for candidate in decision.ranked
                ]
                for runtime in session.companion_states.values():
                    runtime.candidate_memory = [dict(item) for item in candidate_memory]
                if decision.target:
                    payload.update({
                        "target_prop_id": decision.target.prop_id,
                        "position": decision.target.position,
                    })
                else:
                    session.companion_command = None
                    session.companion_goal_started = None
                await self._broadcast_companion_speech(room_id, payload)
                if decision.target:
                    for companion_id in DEFAULT_AI_PARTNER_IDS:
                        command_companion(
                            session, decision.target.prop_id, decision.target.position, transcript,
                            companion_id,
                        )
                    await self.broadcast(room_id, {
                        "type": "partner_command",
                        "target_prop_id": decision.target.prop_id,
                        "position": decision.target.position,
                        "utterance": transcript,
                    })

    async def _publish_vertical_stage_advance(
        self,
        room_id: str,
        actor_id: str,
        event: dict,
    ) -> None:
        """단계 완료 방송과 술래 층 전환을 모든 미션에 동일하게 적용한다."""
        session = session_manager.get_or_create(room_id)
        await self.broadcast(room_id, {
            "type": "vertical_stage_advanced",
            "actor_id": actor_id,
            **event,
        })
        if event["next_phase"] in {"field_final", "basement_final"}:
            await self._lock_dynamic_forbidden(room_id, session)

        phase_event = {
            "floor_3": {
                "event": "first_reveal",
                "message": "3층 계단실의 붉은 실루엣이 모습을 드러냈습니다.",
                "audio_cue": "distant_metal_footsteps",
            },
            "floor_2": {
                "event": "full_hunt",
                "message": "사이렌이 가까워집니다. 술래의 완전 추격이 시작됐습니다.",
                "audio_cue": "seeker_siren_start",
            },
            "floor_1": {
                "event": "pincer_reveal",
                "message": "지하 방화문에서 충격음이 울립니다. 서로 다른 두 실루엣이 1층에 나타났습니다.",
                "audio_cue": "basement_fire_door_impact",
            },
            "field_final": {
                "event": "enraged_field",
                "message": "붉은 경광과 사이렌이 운동장을 뒤덮습니다. 두 술래가 광분했습니다.",
                "audio_cue": "final_enraged_siren",
            },
            "basement_final": {
                "event": "enraged_basement",
                "message": "기계실 조명이 붉게 점멸합니다. 두 술래가 비상 터널을 봉쇄합니다.",
                "audio_cue": "final_enraged_siren",
            },
        }.get(event["next_phase"])
        if phase_event:
            await self.broadcast(room_id, {
                "type": "seeker_phase_event",
                "phase": event["next_phase"],
                "seeker_threat": session.vertical_progression_payload()["seeker_threat"],
                **phase_event,
            })

        if event["completed_phase"] == VerticalRoundPhase.ROOFTOP_INTRO.value:
            seeker = session.state.get_player("seeker")
            slot = seeker_reveal_slot()
            if seeker:
                await self._move_actor_to_slot(
                    room_id, seeker, slot, route="seeker_reveal",
                )
            return

        if event["next_phase"] not in {
            "floor_2", "floor_1", "field_final", "basement_final",
        }:
            return
        seeker = session.state.get_player("seeker")
        slot_id = {
            "floor_2": "F2_TO_F1_STAIR_EAST",
            "floor_1": "F1_STAIR_ARRIVAL_EAST",
            "field_final": "FIELD_FINAL_ENTRY",
            "basement_final": "BASEMENT_FINAL_ENTRY",
        }[event["next_phase"]]
        if seeker:
            await self._move_actor_to_slot(
                room_id, seeker, get_map_slot(slot_id), route="seeker_descend",
            )
        secondary = session.state.get_player("seeker-2")
        if event["next_phase"] == "floor_1":
            if secondary:
                await self._move_actor_to_slot(
                    room_id,
                    secondary,
                    secondary_seeker_slot(),
                    route="seeker_pincer_reveal",
                )
        elif event["next_phase"] in {"field_final", "basement_final"}:
            blocker_slot_id = (
                "FIELD_ESCAPE_GATE"
                if event["next_phase"] == "field_final"
                else "BASEMENT_ESCAPE_GATE"
            )
            if secondary:
                authored_slot = get_map_slot(blocker_slot_id)
                blocker_slot = {
                    **authored_slot,
                    "position": [
                        authored_slot["position"][0],
                        authored_slot["position"][1],
                        authored_slot["position"][2] - 3.0,
                    ],
                }
                await self._move_actor_to_slot(
                    room_id,
                    secondary,
                    blocker_slot,
                    route="seeker_final_blockade",
                )

    async def _move_actor_to_slot(
        self,
        room_id: str,
        actor: Player,
        slot: dict,
        *,
        route: str,
    ) -> None:
        x, y, z = slot["position"]
        actor.position.x, actor.position.y, actor.position.z = x, y, z
        actor.position.floor = WorldFloor(slot["floor"])
        actor.position.zone = slot["zone"]
        await self.broadcast(room_id, {
            "type": "actor_floor_changed",
            "actor_id": actor.player_id,
            "route": route,
            "position": {
                "x": x, "y": y, "z": z,
                "floor": slot["floor"], "zone": slot["zone"],
            },
        })

    async def _handle_action(
        self, room_id: str, player_id: str, payload: dict
    ) -> None:
        session = session_manager.get_or_create(room_id)
        player = session.state.get_player(player_id)

        action_type = payload.get("action_type")
        actor_id = payload.get("actor_id")
        actor = session.state.get_player(actor_id) if actor_id else player

        if action_type == "pause_game" and player and player.role == PlayerRole.HUMAN:
            if session.pause():
                await self.broadcast(room_id, {"type": "game_paused", "player_id": player_id})
        elif action_type == "resume_game" and player and player.role == PlayerRole.HUMAN:
            if session.resume():
                await self.broadcast(room_id, {"type": "game_resumed", "player_id": player_id})
        elif session.is_paused:
            await self.send_to(room_id, player_id, {
                "type": "action_rejected", "action_type": action_type, "reason": "game_paused",
            })
        elif action_type == "move" and player and not player.is_frozen:
            if (
                session.state.phase not in {
                    GamePhase.PLAYING, GamePhase.FINAL_SPELL, GamePhase.ESCAPE,
                }
                or not self._accept_position_update(
                    session, player, payload.get("x"), payload.get("z"),
                    HUMAN_MAX_SPEED,
                )
            ):
                await self.send_to(room_id, player_id, {
                    "type": "action_rejected",
                    "action_type": "move",
                    "reason": "implausible_movement",
                })
                return
            await self.broadcast(room_id, {
                "type": "player_moved",
                "player_id": player_id,
                "position": {
                    "x": player.position.x,
                    "z": player.position.z,
                },
            }, exclude=player_id)

        elif action_type == "actor_move":
            await self.send_to(room_id, player_id, {
                "type": "action_rejected", "action_type": "actor_move",
                "reason": "invalid_actor_position",
            })

        elif action_type == "interact_stage_mission":
            if session.vertical_round.phase == VerticalRoundPhase.ROOFTOP_INTRO:
                try:
                    signal = activate_rooftop_signal(
                        session, player_id, str(payload.get("signal_id", "")),
                    )
                except InvalidProgression as error:
                    await self.send_to(room_id, player_id, {
                        "type": "action_rejected", "action_type": action_type,
                        "reason": str(error),
                    })
                    return
                await self.broadcast(room_id, {
                    "type": "rooftop_signal_progress",
                    "actor_id": player_id,
                    **signal,
                })
                if signal["completed"]:
                    event = complete_current_stage(session, player_id)
                    await self._publish_vertical_stage_advance(room_id, player_id, event)
                return
            if session.vertical_round.phase == VerticalRoundPhase.FIELD_FINAL:
                await self._lock_dynamic_forbidden(room_id, session)
                try:
                    station = activate_final_station(session, player_id)
                except InvalidProgression as error:
                    await self.send_to(room_id, player_id, {
                        "type": "action_rejected", "action_type": action_type,
                        "reason": str(error),
                    })
                    return
                await self.broadcast(room_id, {"type": "final_station_activated", **station})
                if station["all_ready"]:
                    session.spell_words = ["달빛", "교정", "탈출"]
                    session.state.phase = GamePhase.FINAL_SPELL
                    await self.broadcast(room_id, {
                        "type": "vertical_final_ready",
                        "required_clues": len(session.spell_words),
                        "progression": session.vertical_progression_payload(),
                    })
                return
            if session.vertical_round.phase == VerticalRoundPhase.FLOOR_3:
                try:
                    validate_current_stage_interaction(session, player_id)
                except InvalidProgression as error:
                    await self.send_to(room_id, player_id, {
                        "type": "action_rejected", "action_type": action_type,
                        "reason": str(error),
                    })
                    return
                session.broadcast_mission_actor_id = player_id
                session.hunter_last_intent = None
                await self.broadcast(room_id, {
                    "type": "vertical_threat_changed",
                    "seeker_threat": effective_seeker_threat(session).value,
                    "progression": session.vertical_progression_payload(),
                })
                await self.send_to(room_id, player_id, {
                    "type": "vertical_mission_started",
                    "mission": "floor_3_broadcast",
                    "prompt": BROADCAST_MISSION_PROMPT,
                    "required_meanings": list(BROADCAST_MEANING_LABELS.values()),
                    "voice_key": "Q",
                    "starts_limited_hunt": True,
                })
                return
            if session.vertical_round.phase == VerticalRoundPhase.FLOOR_2:
                try:
                    validate_current_stage_interaction(session, player_id)
                    mission_info = start_intercom_mission(session)
                except InvalidProgression as error:
                    await self.send_to(room_id, player_id, {
                        "type": "action_rejected", "action_type": action_type,
                        "reason": str(error),
                    })
                    return
                session.intercom_mission_actor_id = player_id
                await self.send_to(room_id, player_id, {
                    "type": "vertical_mission_started",
                    **mission_info,
                })
                return
            if session.vertical_round.phase == VerticalRoundPhase.FLOOR_1:
                await self._handle_action(
                    room_id,
                    player_id,
                    {"action_type": "activate_device", "device": "A"},
                )
                return
            try:
                event = complete_current_stage(session, player_id)
            except InvalidProgression as error:
                await self.send_to(room_id, player_id, {
                    "type": "action_rejected",
                    "action_type": "interact_stage_mission",
                    "reason": str(error),
                })
                return
            await self._publish_vertical_stage_advance(room_id, player_id, event)

        elif action_type == "use_floor_transition":
            try:
                event = use_open_floor_transition(
                    session, player_id, str(payload.get("route", "west")),
                )
            except InvalidProgression as error:
                await self.send_to(room_id, player_id, {
                    "type": "action_rejected",
                    "action_type": "use_floor_transition",
                    "reason": str(error),
                })
                return
            await self.broadcast(room_id, {"type": "actor_floor_changed", **event})
            if player and player.role == PlayerRole.HUMAN:
                # AI에게 플레이어 층 이동 이벤트 알림 (강제 이동 아님)
                # AI는 자신의 현재 목표에 따라 독립적으로 층 이동을 판단한다.
                for companion_id in DEFAULT_AI_PARTNER_IDS:
                    runtime = session.companion_states.get(companion_id)
                    if runtime:
                        runtime.player_floor_changed = {
                            "floor": event["position"]["floor"],
                            "position": event["position"],
                            "timestamp": time.monotonic(),
                        }

        elif action_type == "cross_rooftop_stair_boundary":
            try:
                event = cross_rooftop_stair_boundary(
                    session, player_id, str(payload.get("direction", "down")),
                )
            except InvalidProgression as error:
                await self.send_to(room_id, player_id, {
                    "type": "action_rejected",
                    "action_type": "cross_rooftop_stair_boundary",
                    "reason": str(error),
                })
                return
            await self.broadcast(room_id, {"type": "actor_floor_changed", **event})
            if player and player.role == PlayerRole.HUMAN:
                for companion_id in DEFAULT_AI_PARTNER_IDS:
                    runtime = session.companion_states.get(companion_id)
                    if runtime:
                        runtime.player_floor_changed = {
                            "floor": event["position"]["floor"],
                            "position": event["position"],
                            "timestamp": time.monotonic(),
                        }

        elif action_type == "vertical_escape":
            exit_slot = final_escape_slot(session)
            exit_x, _, exit_z = exit_slot["position"]
            if (
                session.vertical_round.phase != VerticalRoundPhase.ESCAPE_OPEN
                or session.state.phase != GamePhase.ESCAPE
                or not player or player.status != PlayerStatus.ALIVE
                or player.position.floor != WorldFloor(exit_slot["floor"])
                or math.hypot(player.position.x - exit_x, player.position.z - exit_z) > 2.25
            ):
                await self.send_to(room_id, player_id, {
                    "type": "action_rejected", "action_type": action_type,
                    "reason": "escape_not_available",
                })
                return
            for seeker_id in ("seeker", "seeker-2"):
                seeker = session.state.get_player(seeker_id)
                if (
                    seeker
                    and seeker.status == PlayerStatus.ALIVE
                    and seeker.shares_floor_with(player)
                    and self._players_within(seeker, player, 1.5)
                    and has_clear_catch_line(
                        (seeker.position.x, seeker.position.z),
                        (player.position.x, player.position.z),
                        seeker.position.floor.value,
                    )
                ):
                    await self._finish_seeker_catch(room_id, player_id, player)
                    return
            player.escape()
            session.escaped_player_ids.add(player_id)
            await self.broadcast(room_id, {
                "type": "runner_escaped",
                "player_id": player_id,
                "gate_id": f"{session.vertical_round.final_route.value}_final_exit",
            })
            await self._finish_vertical_escape_if_resolved(room_id, player_id)

        elif action_type == "use_elevator":
            try:
                event = use_elevator(
                    session, player_id, str(payload.get("elevator_id", "")),
                    str(payload.get("target_floor", "")),
                )
            except InvalidProgression as error:
                await self.send_to(room_id, player_id, {
                    "type": "action_rejected", "action_type": action_type,
                    "reason": str(error),
                })
                return
            await self.broadcast(room_id, {
                "type": "actor_floor_changed", "route": "elevator", **event,
            })
            # A5: 엘리베이터 도착 소리 핑 — 술래 감지
            if "sound_ping" in event:
                ping = event["sound_ping"]
                record_hunter_signal(
                    session, player_id, ping["position"], "elevator",
                )
                await self.broadcast(room_id, {
                    "type": "sound_ping",
                    "player_id": player_id,
                    "position": ping["position"],
                    "source": "elevator_arrival",
                    "radius": ping["radius"],
                })

        elif action_type == "intercom_submit":
            await self._handle_speech(room_id, player_id, {
                "transcript": str(payload.get("transcript", "")),
                "is_final": True,
            })

        elif action_type == "activate_device":
            device = str(payload.get("device", ""))
            # 플레이어가 A를 작동하면 AI가 준비되어 있을 때 자동으로 B도 작동
            if device == "A" and session.vertical_missions is not None:
                vm = session.vertical_missions
                if vm.simultaneous.ai_ready and not vm.simultaneous.completed:
                    ai_id = vm.simultaneous.ai_companion_id
                    ai_actor = session.state.get_player(ai_id)
                    if ai_actor and ai_actor.status == PlayerStatus.ALIVE:
                        try:
                            activate_simultaneous_device(session, ai_id, "B")
                        except InvalidProgression:
                            pass
            try:
                result = activate_simultaneous_device(session, player_id, device)
            except InvalidProgression as error:
                await self.send_to(room_id, player_id, {
                    "type": "action_rejected", "action_type": action_type,
                    "reason": str(error),
                })
                return
            await self.broadcast(room_id, {
                "type": "device_activated", **result,
            })
            if result.get("success"):
                event = complete_current_stage(session, player_id)
                await self._publish_vertical_stage_advance(
                    room_id, player_id, event,
                )

        elif action_type == "activate_basement_device":
            device_id = str(payload.get("device_id", ""))
            try:
                result = activate_basement_device(session, player_id, device_id)
            except InvalidProgression as error:
                await self.send_to(room_id, player_id, {
                    "type": "action_rejected", "action_type": action_type, "reason": str(error),
                })
                return
            await self.broadcast(room_id, {
                "type": "basement_device_activated", **result,
            })
            for runtime in session.companion_states.values():
                for target_id in tuple(runtime.memory):
                    if target_id.startswith("basement_"):
                        runtime.memory.pop(target_id, None)
            if result.get("reset"):
                # 잘못된 순서 → 소리 핑
                reset_position = {"x": player.position.x, "z": player.position.z}
                record_hunter_signal(
                    session, player_id, reset_position, "device_reset",
                )
                await self.broadcast(room_id, {
                    "type": "sound_ping",
                    "player_id": player_id,
                    "position": reset_position,
                    "source": "basement_device_reset",
                })
            if result.get("completed"):
                # 지하 미션 완료 → 주문 단계
                await self._lock_dynamic_forbidden(room_id, session)
                session.spell_words = ["달빛", "교정", "탈출"]
                session.final_station_actor_ids.add(player_id)
                session.state.phase = GamePhase.FINAL_SPELL
                await self.broadcast(room_id, {
                    "type": "vertical_final_ready",
                    "required_clues": len(session.spell_words),
                    "progression": session.vertical_progression_payload(),
                })

        elif action_type == "companion_think" and player and player.role == PlayerRole.HUMAN:
            for companion_id in DEFAULT_AI_PARTNER_IDS:
                await self.send_to(room_id, player_id, {
                    "type": "companion_intent", **companion_snapshot(session, companion_id),
                })

        elif action_type == "seeker_think":
            if (
                not player or player.role != PlayerRole.HUMAN
                or session.state.phase not in {GamePhase.PLAYING, GamePhase.FINAL_SPELL, GamePhase.ESCAPE}
            ):
                return
            intent = hunter_snapshot(session)
            secondary = advance_secondary_hunter(session, intent)
            await self.send_to(room_id, player_id, {
                "type": "seeker_intent", **intent, "secondary": secondary,
            })

        elif action_type == "rescue_request" and player and player.is_frozen:
            for companion_id in DEFAULT_AI_PARTNER_IDS:
                request_companion_rescue(session, player.player_id, companion_id)
            await self.broadcast(room_id, {
                "type": "companion_assignment", "state": "RESCUE_TEAMMATE",
                "target_id": player.player_id, "reason": "player_requested",
            })

        elif action_type == "rescue":
            await self.send_to(room_id, player_id, {
                "type": "action_rejected", "action_type": "rescue",
                "reason": "server_authoritative_actor",
            })

        elif action_type == "rescue_teammate":
            target_id = payload.get("target_id")
            target = session.state.get_player(target_id) if isinstance(target_id, str) else None
            valid = (
                session.state.phase in {
                    GamePhase.PLAYING, GamePhase.FINAL_SPELL, GamePhase.ESCAPE,
                }
                and player and player.status == PlayerStatus.ALIVE
                and target and target.role != PlayerRole.SEEKER and target.is_frozen
                and self._players_within(player, target, 2.0)
                and has_clear_catch_line(
                    (player.position.x, player.position.z),
                    (target.position.x, target.position.z),
                    player.position.floor.value,
                )
            )
            if not valid:
                await self.send_to(room_id, player_id, {
                    "type": "action_rejected", "action_type": "rescue_teammate",
                    "reason": "invalid_rescue",
                })
                return
            target.unfreeze()
            self._cancel_freeze_timeout(room_id, target.player_id)
            await self.broadcast(room_id, {
                "type": "rescued", "rescuer_id": player.player_id,
                "target_id": target.player_id,
            })

        elif action_type == "trap" and player and not player.is_frozen:
            if session.state.phase not in {
                GamePhase.PLAYING, GamePhase.FINAL_SPELL, GamePhase.ESCAPE,
            }:
                await self.send_to(room_id, player_id, {
                    "type": "action_rejected",
                    "action_type": "trap",
                    "reason": "wrong_phase",
                })
                return
            trap_id = payload.get("trap_id")
            trap = next((item for item in TRAP_CONTRACT["traps"] if item["id"] == trap_id), None)
            valid_trap = (
                trap and trap_id in session.active_trap_ids
                and trap_id not in session.triggered_trap_ids
                and math.hypot(player.position.x - trap["x"], player.position.z - trap["z"])
                <= TRAP_CONTRACT["triggerDistance"] + 0.35
            )
            if not valid_trap:
                await self.send_to(room_id, player_id, {
                    "type": "action_rejected", "action_type": "trap",
                    "reason": "invalid_trap_contact",
                })
                return
            session.triggered_trap_ids.add(trap_id)
            player.freeze()
            record_hunter_signal(
                session, player_id,
                {"x": player.position.x, "z": player.position.z}, "freeze",
            )
            await self.broadcast(room_id, {
                "type": "freeze",
                "player_id": player_id,
                "matched_word": "트랩",
                "matched_stage": "trap",
                "confidence": 1.0,
                "trap_id": trap_id,
                "position": {
                    "x": player.position.x,
                    "z": player.position.z,
                },
                "remaining_seconds": session.state.freeze_timeout_sec,
                "danger": {"seeker_last_seen": session.companion_last_seeker_seen},
            })
            self._schedule_freeze_timeout(room_id, player_id)
            await self._finish_if_team_frozen(room_id)

        elif action_type == "inspect_prop":
            await self.send_to(room_id, player_id, {
                "type": "action_rejected", "action_type": "inspect_prop",
                "reason": "server_authoritative_actor",
            })

        elif action_type == "gate_arrived":
            await self._handle_gate_arrived(room_id, player_id, player, payload)

        elif action_type == "seeker_catch":
            seeker_id = str(payload.get("seeker_id", "seeker"))
            seeker = session.state.get_player(seeker_id) if seeker_id in {"seeker", "seeker-2"} else None
            target_id = payload.get("target_id", player_id)
            target = session.state.get_player(target_id)
            valid_catch = (
                session.state.phase in {
                    GamePhase.PLAYING, GamePhase.FINAL_SPELL, GamePhase.ESCAPE,
                }
                and target
                and target.role != PlayerRole.SEEKER
                and target.status in {PlayerStatus.ALIVE, PlayerStatus.FROZEN}
                and seeker
                and seeker.role == PlayerRole.SEEKER
                and seeker.status == PlayerStatus.ALIVE
                and seeker_can_capture(session, seeker_id)
                and self._players_within(seeker, target, 1.5)
                and has_clear_catch_line(
                    (seeker.position.x, seeker.position.z),
                    (target.position.x, target.position.z),
                    seeker.position.floor.value,
                )
            )
            if not valid_catch:
                await self.send_to(room_id, player_id, {
                    "type": "action_rejected",
                    "action_type": "seeker_catch",
                    "reason": "invalid_seeker_contact",
                })
                return
            await self._finish_seeker_catch(room_id, target_id, target)

        elif action_type == "gate_escape":
            await self._handle_gate_escape(room_id, player_id, player, payload)

    @staticmethod
    def _players_within(first: Player, second: Player, radius: float) -> bool:
        return first.shares_floor_with(second) and (
            (first.position.x - second.position.x) ** 2
            + (first.position.z - second.position.z) ** 2
        ) <= radius ** 2

    @staticmethod
    def _accept_position_update(
        session,
        actor: Player,
        x,
        z,
        max_speed: float,
    ) -> bool:
        if (
            not isinstance(x, (int, float))
            or not isinstance(z, (int, float))
            or isinstance(x, bool)
            or isinstance(z, bool)
            or not math.isfinite(x)
            or not math.isfinite(z)
            or abs(x) > 64
            or abs(z) > 64
        ):
            return False
        checked_at = time.monotonic()
        previous = session.position_samples.get(actor.player_id)
        if previous and not movement_is_plausible(
            previous, float(x), float(z), max_speed, checked_at
        ):
            return False
        if previous and not has_clear_catch_line(
            (previous.x, previous.z),
            (float(x), float(z)),
            actor.position.floor.value,
        ):
            return False
        actor.position.x = float(x)
        actor.position.z = float(z)
        session.position_samples[actor.player_id] = MovementSample(
            float(x), float(z), checked_at
        )
        return True

    async def _finish_seeker_catch(
        self, room_id: str, player_id: str, player: Player
    ) -> None:
        session = session_manager.get_or_create(room_id)
        player.eliminate()

        vertical_escape = (
            session.vertical_progression_enabled
            and session.vertical_round.phase == VerticalRoundPhase.ESCAPE_OPEN
            and session.state.phase == GamePhase.ESCAPE
        )
        if vertical_escape:
            await self.broadcast(room_id, {
                "type": "eliminated",
                "player_id": player_id,
                "reason": "caught_by_seeker",
            })
            await self._finish_vertical_escape_if_resolved(room_id, player_id)
            logger.info(
                "ELIMINATED: room=%s player=%s reason=caught_by_seeker",
                room_id, player_id,
            )
            return

        # 멀티: 모든 인간이 행동 불능인지 확인
        all_humans_down = all(
            p.status in {PlayerStatus.FROZEN, PlayerStatus.ELIMINATED, PlayerStatus.ESCAPED}
            for p in session.state.players.values()
            if p.role == PlayerRole.HUMAN
        )
        team_defeated = (
            all_humans_down
            or session.state.all_non_seeker_frozen_or_eliminated()
        )
        if team_defeated:
            session.state.phase = GamePhase.RESULT
            self._cancel_room_freeze_timeouts(room_id)
        await self.broadcast(room_id, {
            "type": "eliminated",
            "player_id": player_id,
            "reason": "caught_by_seeker",
        })
        if team_defeated:
            await self.broadcast(room_id, {
                "type": "game_over",
                "reason": "caught_by_seeker",
                **session.result_payload(),
            })
        logger.info(
            "ELIMINATED: room=%s player=%s reason=caught_by_seeker",
            room_id, player_id,
        )

    async def _finish_vertical_escape_if_resolved(
        self,
        room_id: str,
        last_actor_id: str,
    ) -> bool:
        """선택된 파이널 출구에서 도망자의 개별 결과가 정해진 뒤 한 번만 정산한다."""
        session = session_manager.get_or_create(room_id)
        if (
            not session.vertical_progression_enabled
            or session.vertical_round.phase != VerticalRoundPhase.ESCAPE_OPEN
            or session.state.phase != GamePhase.ESCAPE
        ):
            return False
        runners = [
            player for player in session.state.players.values()
            if player.role != PlayerRole.SEEKER
        ]
        if any(
            player.status in {PlayerStatus.ALIVE, PlayerStatus.FROZEN}
            for player in runners
        ):
            return False

        escaped = [
            player for player in runners if player.status == PlayerStatus.ESCAPED
        ]
        human_escaped = any(
            player.role == PlayerRole.HUMAN for player in escaped
        )
        if not escaped:
            result_phase = VerticalRoundPhase.DEFEAT
            event_type = "game_over"
            reason = "vertical_team_eliminated"
        elif len(escaped) == len(runners):
            result_phase = VerticalRoundPhase.VICTORY
            event_type = "game_won" if human_escaped else "game_over"
            reason = "vertical_school_escape"
        else:
            result_phase = VerticalRoundPhase.PARTIAL_RESULT
            event_type = "game_won" if human_escaped else "game_over"
            reason = "vertical_partial_escape"

        session.vertical_round.finish(result_phase)
        session.state.phase = GamePhase.RESULT
        self._cancel_room_freeze_timeouts(room_id)
        await self.broadcast(room_id, {
            "type": event_type,
            "player_id": last_actor_id,
            "reason": reason,
            "gate_id": f"{session.vertical_round.final_route.value}_final_exit",
            "progression": session.vertical_progression_payload(),
            **session.result_payload(),
        })
        return True

    async def _handle_actor_move(
        self,
        room_id: str,
        player_id: str,
        sender: Player | None,
        actor: Player | None,
        payload: dict,
    ) -> None:
        session = session_manager.get_or_create(room_id)
        x = payload.get("x")
        z = payload.get("z")
        valid = (
            sender is not None
            and sender.role == PlayerRole.HUMAN
            and session.state.phase in {
                GamePhase.PLAYING, GamePhase.FINAL_SPELL, GamePhase.ESCAPE,
            }
            and actor is not None
            and actor.role == PlayerRole.AI_PARTNER
        )
        if not valid or not self._accept_position_update(
            session, actor, x, z, ACTOR_MAX_SPEED
        ):
            await self.send_to(room_id, player_id, {
                "type": "action_rejected",
                "action_type": "actor_move",
                "reason": "invalid_actor_position",
            })
            return

    async def _handle_gate_arrived(
        self,
        room_id: str,
        player_id: str,
        player: Player | None,
        payload: dict,
    ) -> None:
        session = session_manager.get_or_create(room_id)
        reason = None
        if session.state.phase != GamePhase.FINAL_SPELL:
            reason = "wrong_phase"
        elif not player or player.status != PlayerStatus.ALIVE:
            reason = "player_not_alive"
        elif payload.get("gate_id") != session.active_gate_id:
            reason = "wrong_gate"
        elif not session.is_near_active_gate(player_id):
            reason = "too_far"

        if reason:
            await self.send_to(room_id, player_id, {
                "type": "action_rejected",
                "action_type": "gate_arrived",
                "reason": reason,
            })
            return

        session.gate_arrived_player_ids.add(player_id)
        await self.broadcast(room_id, {
            "type": "gate_arrived",
            "player_id": player_id,
            "gate_id": session.active_gate_id,
        })

    async def _handle_gate_escape(
        self,
        room_id: str,
        player_id: str,
        player: Player | None,
        payload: dict,
    ) -> None:
        session = session_manager.get_or_create(room_id)
        reason = None
        if session.state.phase != GamePhase.ESCAPE:
            reason = "wrong_phase"
        elif not player or player.status != PlayerStatus.ALIVE:
            reason = "player_not_alive"
        elif payload.get("gate_id") != session.active_gate_id:
            reason = "wrong_gate"
        elif not session.is_near_active_gate(player_id):
            reason = "too_far"

        if reason:
            await self.send_to(room_id, player_id, {
                "type": "action_rejected",
                "action_type": "gate_escape",
                "reason": reason,
            })
            return

        # 탈출 센서와 포획 신고가 같은 프레임에 겹치면 술래 접촉을 우선한다.
        seeker = session.state.get_player("seeker")
        if (
            seeker
            and seeker.status == PlayerStatus.ALIVE
            and self._players_within(seeker, player, 1.5)
            and has_clear_catch_line(
                (seeker.position.x, seeker.position.z),
                (player.position.x, player.position.z),
                seeker.position.floor.value,
            )
        ):
            await self._finish_seeker_catch(room_id, player_id, player)
            return

        player.escape()
        session.escaped_player_ids.add(player_id)

        # 모든 인간이 탈출/행동불능이면 게임 종료 (AI가 남아도 인간 없으면 끝)
        all_humans_done = all(
            p.status in {PlayerStatus.ESCAPED, PlayerStatus.ELIMINATED, PlayerStatus.FROZEN}
            for p in session.state.players.values()
            if p.role == PlayerRole.HUMAN
        )
        all_runners_done = all(
            p.status in {PlayerStatus.ESCAPED, PlayerStatus.ELIMINATED, PlayerStatus.FROZEN}
            for p in session.state.players.values()
            if p.role != PlayerRole.SEEKER
        )
        if all_humans_done or all_runners_done:
            session.state.phase = GamePhase.RESULT
            self._cancel_room_freeze_timeouts(room_id)
            await self.broadcast(room_id, {
                "type": "game_won",
                "player_id": player_id,
                "reason": "escaped",
                "gate_id": session.active_gate_id,
                **session.result_payload(),  # A7
            })
        else:
            # 부분 탈출: 개별 탈출 알림만 발송
            await self.broadcast(room_id, {
                "type": "runner_escaped",
                "player_id": player_id,
                "gate_id": session.active_gate_id,
            })

    async def _handle_inspect_prop(
        self,
        room_id: str,
        player_id: str,
        actor: Player | None,
        payload: dict,
    ) -> None:
        session = session_manager.get_or_create(room_id)
        prop_id = payload.get("prop_id")

        if not actor or actor.role != PlayerRole.AI_PARTNER:
            await self.send_to(room_id, player_id, {
                "type": "action_rejected",
                "action_type": "inspect_prop",
                "reason": "ai_partner_only",
            })
            return
        if not isinstance(prop_id, str) or not prop_id:
            await self.send_to(room_id, player_id, {
                "type": "action_rejected",
                "action_type": "inspect_prop",
                "reason": "invalid_prop",
            })
            return
        if prop_id in session.inspected_prop_ids:
            await self.send_to(room_id, player_id, {
                "type": "action_rejected",
                "action_type": "inspect_prop",
                "reason": "already_inspected",
                "prop_id": prop_id,
            })
            return

        mission = session.current_mission()
        if not mission:
            await self.send_to(room_id, player_id, {
                "type": "action_rejected",
                "action_type": "inspect_prop",
                "reason": "no_active_mission",
            })
            return

        mission_props = [mission.real_prop, *mission.decoy_props]
        prop = next((item for item in mission_props if item.prop_id == prop_id), None)
        if prop is None:
            await self.send_to(room_id, player_id, {
                "type": "action_rejected",
                "action_type": "inspect_prop",
                "reason": "prop_not_in_current_mission",
                "prop_id": prop_id,
            })
            return

        session.inspected_prop_ids.add(prop_id)
        record_hunter_signal(
            session, actor.player_id,
            {"x": actor.position.x, "z": actor.position.z}, "ai_action",
        )
        completed_index = session.current_mission_index
        is_correct = prop.prop_id == mission.real_prop.prop_id
        clue = None
        if is_correct:
            clue = {
                "word": mission.clue_word,
                "order": mission.clue_order,
                "total": len(session.spell_words),
            }
            session.current_mission_index += 1
        all_complete = bool(
            session.round_data
            and session.current_mission_index >= len(session.round_data.missions)
        )
        if all_complete:
            session.state.phase = GamePhase.FINAL_SPELL
        await self.broadcast(room_id, {
            "type": "prop_inspected",
            "prop_id": prop_id,
            "is_correct": is_correct,
            "clue": clue,
            "mission_index": completed_index,
            "next_mission_index": session.current_mission_index,
            "all_complete": all_complete,
            "active_gate": session.active_gate_payload() if all_complete else None,
        })

    def _schedule_freeze_timeout(self, room_id: str, player_id: str) -> None:
        """현재 빙결 세대에 대응하는 제한시간 task를 하나만 유지한다."""
        session = session_manager.get_or_create(room_id)
        player = session.state.get_player(player_id)
        if not player or not player.is_frozen or player.frozen_at is None:
            return

        self._cancel_freeze_timeout(room_id, player_id)
        frozen_at = player.frozen_at
        task = asyncio.create_task(
            self._eliminate_after_freeze_timeout(room_id, player_id, frozen_at)
        )
        key = (room_id, player_id)
        self._freeze_tasks[key] = task
        task.add_done_callback(
            lambda completed, task_key=key: self._forget_freeze_task(
                task_key, completed
            )
        )

    async def _eliminate_after_freeze_timeout(
        self, room_id: str, player_id: str, frozen_at: float
    ) -> None:
        session = session_manager.sessions.get(room_id)
        if not session:
            return

        remaining = max(
            0.0,
            session.state.freeze_timeout_sec - (time.time() - frozen_at),
        )
        while remaining > 0:
            await asyncio.sleep(min(remaining, 0.1))
            session = session_manager.sessions.get(room_id)
            if not session:
                return
            player = session.state.get_player(player_id)
            if not player or not player.is_frozen:
                return
            if session.is_paused:
                continue
            remaining = max(0.0, session.state.freeze_timeout_sec - (time.time() - (player.frozen_at or frozen_at)))

        # 구조 후 재빙결되었거나 방이 종료된 오래된 task는 상태를 바꾸지 않는다.
        session = session_manager.sessions.get(room_id)
        if not session:
            return
        player = session.state.get_player(player_id)
        if (
            not player
            or not player.is_frozen
            or player.frozen_at != frozen_at
        ):
            return

        player.eliminate()
        await self.broadcast(room_id, {
            "type": "eliminated",
            "player_id": player_id,
            "reason": "freeze_timeout",
        })
        logger.info(
            "ELIMINATED: room=%s player=%s reason=freeze_timeout",
            room_id, player_id,
        )

        if (
            session.vertical_progression_enabled
            and session.vertical_round.phase == VerticalRoundPhase.ESCAPE_OPEN
            and session.state.phase == GamePhase.ESCAPE
        ):
            await self._finish_vertical_escape_if_resolved(room_id, player_id)
            return

        # 멀티: 모든 인간이 탈락/빙결/탈출이면 게임 종료
        if player.role == PlayerRole.HUMAN:
            all_humans_down = all(
                p.status in {PlayerStatus.FROZEN, PlayerStatus.ELIMINATED, PlayerStatus.ESCAPED}
                for p in session.state.players.values()
                if p.role == PlayerRole.HUMAN
            )
            if all_humans_down:
                session.state.phase = GamePhase.RESULT
                self._cancel_room_freeze_timeouts(room_id)
                await self.broadcast(room_id, {
                    "type": "game_over",
                    "reason": "all_humans_eliminated",
                    **session.result_payload(),
                })
                return

        if session.state.all_non_seeker_frozen_or_eliminated():
            session.state.phase = GamePhase.RESULT
            self._cancel_room_freeze_timeouts(room_id)
            await self.broadcast(room_id, {
                "type": "game_over",
                "reason": "all_frozen_or_eliminated",
                **session.result_payload(),
            })

    def _cancel_freeze_timeout(self, room_id: str, player_id: str) -> None:
        task = self._freeze_tasks.pop((room_id, player_id), None)
        if task and not task.done():
            task.cancel()

    def _cancel_room_freeze_timeouts(self, room_id: str) -> None:
        keys = [key for key in self._freeze_tasks if key[0] == room_id]
        for _, player_id in keys:
            self._cancel_freeze_timeout(room_id, player_id)

    def _forget_freeze_task(
        self,
        key: tuple[str, str],
        completed: asyncio.Task[None],
    ) -> None:
        if self._freeze_tasks.get(key) is completed:
            self._freeze_tasks.pop(key, None)

    def _record_dynamic_forbidden_utterance(
        self,
        room_id: str,
        session,
        transcript: str,
    ) -> None:
        """현재 판정이 끝난 인간 확정 발화를 비동기 분석 큐에 넣는다."""
        profile = session.dynamic_forbidden
        if profile.locked or session.state.phase != GamePhase.PLAYING:
            return
        if session.vertical_round.phase in {
            VerticalRoundPhase.FINAL_ROUTE_REVEAL,
            VerticalRoundPhase.FIELD_FINAL,
            VerticalRoundPhase.BASEMENT_FINAL,
            VerticalRoundPhase.ESCAPE_OPEN,
            VerticalRoundPhase.VICTORY,
            VerticalRoundPhase.PARTIAL_RESULT,
            VerticalRoundPhase.DEFEAT,
        }:
            profile.lock()
            return
        if not profile.record_human_utterance(transcript) or not profile.should_refresh():
            return

        profile.analysis_pending = True
        analyzed_through = profile.total_utterances
        utterances = list(profile.recent_utterances)
        current_words = list(profile.current_words)
        task = asyncio.create_task(self._refresh_dynamic_forbidden(
            room_id,
            session,
            profile,
            utterances,
            current_words,
            analyzed_through,
        ))
        self._forbidden_tasks[room_id] = task
        task.add_done_callback(
            lambda completed, target_room=room_id: self._forget_forbidden_task(
                target_room, completed,
            )
        )

    async def _refresh_dynamic_forbidden(
        self,
        room_id: str,
        session,
        profile,
        utterances: list[str],
        current_words: list[str],
        analyzed_through: int,
    ) -> None:
        try:
            words, reason = await asyncio.to_thread(
                analyze_dynamic_forbidden_words,
                utterances,
                current_words,
            )
            # 방이 닫히거나 새 게임이 시작된 동안 끝난 오래된 분석은 폐기한다.
            if (
                session_manager.sessions.get(room_id) is not session
                or session.dynamic_forbidden is not profile
                or not session.dynamic_forbidden_enabled
                or profile.locked
            ):
                return
            changed = profile.apply(
                words,
                analyzed_through=analyzed_through,
                reason=reason,
            )
            if not changed:
                return
            session.state.forbidden_words = list(profile.current_words)
            session.engine.update_words(profile.current_words)
            await self.broadcast(room_id, {
                "type": "forbidden_profile_shifted",
                "forbidden_profile": profile.public_state(shifted=True),
            })
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("dynamic forbidden analysis failed: room=%s", room_id)
        finally:
            profile.analysis_pending = False

    def _forget_forbidden_task(
        self,
        room_id: str,
        completed: asyncio.Task[None],
    ) -> None:
        if self._forbidden_tasks.get(room_id) is completed:
            self._forbidden_tasks.pop(room_id, None)
        if not completed.cancelled() and completed.exception():
            logger.error(
                "dynamic forbidden task failed: room=%s error=%s",
                room_id,
                completed.exception(),
            )

    async def _lock_dynamic_forbidden(self, room_id: str, session) -> None:
        if not session.dynamic_forbidden_enabled or session.dynamic_forbidden.locked:
            return
        session.dynamic_forbidden.lock()
        await self.broadcast(room_id, {
            "type": "forbidden_profile_locked",
            "forbidden_profile": session.dynamic_forbidden.public_state(),
        })

    async def _handle_spell(
        self, room_id: str, player_id: str, payload: dict
    ) -> None:
        spell_text = payload.get("spell_text", "")
        session = session_manager.get_or_create(room_id)
        if session.is_paused:
            await self.send_to(room_id, player_id, {
                "type": "action_rejected", "action_type": "spell", "reason": "game_paused",
            })
            return
        player = session.state.get_player(player_id)

        vertical_final = (
            session.vertical_progression_enabled
            and session.vertical_round.phase in {
                VerticalRoundPhase.FIELD_FINAL,
                VerticalRoundPhase.BASEMENT_FINAL,
            }
        )
        valid_position = (
            player_id in session.final_station_actor_ids
            if vertical_final else (
                player_id in session.gate_arrived_player_ids and session.is_near_active_gate(player_id)
            )
        )
        if (
            session.state.phase != GamePhase.FINAL_SPELL
            or not valid_position or not player or player.status != PlayerStatus.ALIVE
        ):
            await self.send_to(room_id, player_id, {
                "type": "spell_rejected",
                "reason": "gate_arrival_required",
            })
            return

        result = check_spell(spell_text, session.spell_words)

        if result["success"]:
            session.state.phase = GamePhase.ESCAPE
            if vertical_final:
                session.vertical_round.mark_mission_complete()
                session.vertical_round.advance()
            await self.broadcast(room_id, {
                "type": "spell_success",
                "player_id": player_id,
                "matched": result["matched"],
                "order_valid": result["order_valid"],
                "transcript": result["transcript"],
                "progression": session.vertical_progression_payload() if vertical_final else None,
            })
        else:
            # 틀린 주문도 큰 소리로 외친 행동이다. 무료 재시도가 되지 않도록
            # 술래와 팀에 현재 위치를 강한 청각 단서로 전달한다.
            failed_position = {"x": player.position.x, "z": player.position.z}
            record_hunter_signal(session, player_id, failed_position, "failed_spell")
            await self.broadcast(room_id, {
                "type": "sound_ping",
                "player_id": player_id,
                "position": failed_position,
                "source": "failed_spell",
            })
            await self.send_to(room_id, player_id, {
                "type": "spell_failed",
                "matched_count": len(result["matched"]),
                "required_count": result["required_count"],
                "order_valid": result["order_valid"],
                "failure_reason": (
                    "order" if len(result["matched"]) >= result["required_count"]
                    else "incomplete"
                ),
                "transcript": result["transcript"],
            })

    async def _handle_create_room(
        self, room_id: str, player_id: str, payload: dict
    ) -> None:
        from app.game.room import RoomError, create_room, room_to_dict

        try:
            config = create_room(player_id)
            self.rooms_config[room_id] = config
            await self.broadcast(room_id, {
                "type": "room_created",
                "room": room_to_dict(config),
            })
        except RoomError as error:
            await self.send_to(room_id, player_id, {
                "type": "room_error", "reason": str(error),
            })

    async def _handle_join_room(
        self, room_id: str, player_id: str, payload: dict
    ) -> None:
        from app.game.room import RoomError, join_room, room_to_dict

        config = self.rooms_config.get(room_id)
        if not config:
            await self.send_to(room_id, player_id, {
                "type": "room_error", "reason": "방을 찾을 수 없다",
            })
            return
        try:
            join_room(config, player_id)
            await self.broadcast(room_id, {
                "type": "room_joined",
                "player_id": player_id,
                "room": room_to_dict(config),
            })
        except RoomError as error:
            await self.send_to(room_id, player_id, {
                "type": "room_error", "reason": str(error),
            })

    async def _handle_select_character(
        self, room_id: str, player_id: str, payload: dict
    ) -> None:
        from app.game.room import RoomError, room_to_dict, select_character

        config = self.rooms_config.get(room_id)
        if not config:
            return
        try:
            select_character(config, player_id, str(payload.get("character_id", "")))
            await self.broadcast(room_id, {
                "type": "character_selected",
                "player_id": player_id,
                "character_id": payload.get("character_id"),
                "room": room_to_dict(config),
            })
        except RoomError as error:
            await self.send_to(room_id, player_id, {
                "type": "room_error", "reason": str(error),
            })

    async def _handle_player_ready(
        self, room_id: str, player_id: str, payload: dict
    ) -> None:
        from app.game.room import RoomError, room_to_dict, set_ready

        config = self.rooms_config.get(room_id)
        if not config:
            return
        try:
            set_ready(config, player_id, bool(payload.get("ready", True)))
            await self.broadcast(room_id, {
                "type": "player_ready_changed",
                "player_id": player_id,
                "ready": config.players[player_id].is_ready,
                "room": room_to_dict(config),
            })
        except RoomError as error:
            await self.send_to(room_id, player_id, {
                "type": "room_error", "reason": str(error),
            })

    async def _handle_start_game(
        self, room_id: str, player_id: str, payload: dict
    ) -> None:
        from app.game.room import RoomError, RoomPhase, start_game_from_room

        session = session_manager.get_or_create(room_id)
        config = self.rooms_config.get(room_id)

        # 방 시스템이 활성화된 경우 AI 충원 처리
        if config and config.phase not in {RoomPhase.ONBOARDING, RoomPhase.PLAYING}:
            try:
                game_info = start_game_from_room(config)
            except RoomError as error:
                await self.send_to(room_id, player_id, {
                    "type": "room_error", "reason": str(error),
                })
                return

            # AI 충원: 방 설정에 따라 AI 파트너 등록
            for ai_info in game_info["ai_partners"]:
                partner_id = ai_info["partner_id"]
                if session.state.get_player(partner_id) is None:
                    session.state.add_player(partner_id, PlayerRole.AI_PARTNER)

            await self.broadcast(room_id, {
                "type": "game_starting", **game_info,
            })

        # v5 클라이언트는 빈 비공개 프로필로 바로 시작한다. 명시적인
        # forbidden_words는 기존 테스트/개발 시나리오 호환 경로다.
        dynamic_forbidden = bool(payload.get("dynamic_forbidden", False))
        requested_words = payload.get("forbidden_words")
        forbidden_words = [] if dynamic_forbidden else (
            requested_words or DEFAULT_FORBIDDEN_WORDS
        )
        session.setup_game(
            forbidden_words,
            dynamic_forbidden=dynamic_forbidden,
        )
        round_data = None
        if not dynamic_forbidden and not requested_words:
            round_data = generate_round(forbidden_words)
            if not session.vertical_progression_enabled:
                session.setup_round(round_data)
        self._ensure_hunter_task(room_id)
        self._ensure_companion_task(room_id)
        await self.broadcast(room_id, {
            "type": "game_started",
            "state": session.state_payload(),
            **({"round": round_to_dict(round_data)} if round_data else {}),
            "active_gate": session.active_gate_payload(),
            "active_traps": session.active_traps_payload(),
        })

    def _ensure_hunter_task(self, room_id: str) -> None:
        existing = self._hunter_tasks.get(room_id)
        if existing and not existing.done():
            return
        task = asyncio.create_task(self._run_hunter(room_id))
        self._hunter_tasks[room_id] = task
        task.add_done_callback(
            lambda completed, target_room=room_id: self._forget_hunter_task(target_room, completed)
        )

    async def _run_hunter(self, room_id: str) -> None:
        interval = float(HUNTER_CONTRACT["thinkIntervalSeconds"])
        try:
            while room_id in self.rooms:
                session = session_manager.get_or_create(room_id)
                if session.state.phase == GamePhase.RESULT:
                    return
                if not session.is_paused and session.state.phase in {GamePhase.PLAYING, GamePhase.FINAL_SPELL, GamePhase.ESCAPE}:
                    advance_hunter(session)
                await asyncio.sleep(interval)
        except asyncio.CancelledError:
            raise

    def _forget_hunter_task(self, room_id: str, completed: asyncio.Task[None]) -> None:
        if self._hunter_tasks.get(room_id) is completed:
            self._hunter_tasks.pop(room_id, None)
        if not completed.cancelled() and completed.exception():
            logger.error("hunter task failed: room=%s error=%s", room_id, completed.exception())

    def _ensure_companion_task(self, room_id: str) -> None:
        existing = self._companion_tasks.get(room_id)
        if existing and not existing.done():
            return
        task = asyncio.create_task(self._run_companion(room_id))
        self._companion_tasks[room_id] = task
        task.add_done_callback(
            lambda completed, target_room=room_id: self._forget_companion_task(target_room, completed)
        )

    async def _run_companion(self, room_id: str) -> None:
        interval = float(COMPANION_CONTRACT["thinkIntervalSeconds"])
        consecutive_failures = 0
        try:
            while room_id in self.rooms:
                session = session_manager.get_or_create(room_id)
                if session.state.phase == GamePhase.RESULT:
                    return
                try:
                    if not session.is_paused and session.state.phase in {GamePhase.PLAYING, GamePhase.FINAL_SPELL, GamePhase.ESCAPE}:
                        for companion_id in DEFAULT_AI_PARTNER_IDS:
                            intent, action = advance_companion(session, companion_id)
                            if action:
                                await self._handle_companion_action(room_id, companion_id, action)
                    consecutive_failures = 0
                except Exception:
                    consecutive_failures += 1
                    retry_delay = min(interval * (2 ** min(consecutive_failures, 4)), 5.0)
                    logger.exception(
                        "companion tick failed; retrying: room=%s delay=%.2fs failures=%d",
                        room_id, retry_delay, consecutive_failures,
                    )
                    await asyncio.sleep(retry_delay)
                    continue
                await asyncio.sleep(interval)
        except asyncio.CancelledError:
            raise

    async def _handle_companion_action(self, room_id: str, companion_id: str, action: dict) -> None:
        session = session_manager.get_or_create(room_id)
        runtime = session.companion_states.get(companion_id)
        partner = session.state.get_player(companion_id)
        seeker = session.state.get_player("seeker")

        # S4+S5: 구조화된 발화 이벤트 생성
        seeker_dist = None
        if partner and seeker and partner.shares_floor_with(seeker):
            seeker_dist = math.hypot(
                partner.position.x - seeker.position.x,
                partner.position.z - seeker.position.z,
            )
        intent_state = runtime.last_intent["state"] if runtime and runtime.last_intent else ""
        speech_event = create_action_speech(
            companion_id, action, intent_state, seeker_dist,
            forbidden_words=session.state.forbidden_words,
        )

        # B2: 중복 억제
        if speech_event and runtime:
            if runtime.speech_history.should_suppress(speech_event.text, speech_event.intent):
                speech_event = None
            elif speech_event:
                runtime.speech_history.record(speech_event.text, speech_event.intent)

        # S5: AI 발화의 소리 핑
        if speech_event and partner and speech_event.ping_radius > 0:
            record_hunter_signal(
                session, companion_id,
                {"x": partner.position.x, "z": partner.position.z},
                "ai_speech",
                speech_mode=speech_event.mode,
            )

        if action["type"] == "report":
            message_text = speech_event.text if speech_event else (
                f"{action['zone']} 구역에서 {action['appearance'].get('color', '알 수 없는 색')} "
                f"{action['appearance'].get('mesh', '물체')} 후보를 발견했어."
            )
            await self._broadcast_companion_speech(room_id, {
                "type": "companion_report", "companion_id": companion_id,
                "prop_id": action["prop_id"], "zone": action["zone"],
                "appearance": action["appearance"],
                "message": message_text,
                **({"speech_intent": speech_event.intent.value, "speech_mode": speech_event.mode.value} if speech_event else {}),
            }, companion_id)
        elif action["type"] == "seeker_report":
            message_text = speech_event.text if speech_event else "술래를 봤어! 마지막 위치를 공유할게."
            await self._broadcast_companion_speech(room_id, {
                "type": "companion_seeker_report", "companion_id": companion_id,
                "position": action["position"], "message": message_text,
                **({"speech_intent": speech_event.intent.value, "speech_mode": speech_event.mode.value} if speech_event else {}),
            }, companion_id)
        elif action["type"] == "inspect":
            controller_id = next(iter(self.rooms[room_id].players), "")
            session = session_manager.get_or_create(room_id)
            await self._handle_inspect_prop(
                room_id, controller_id, session.state.get_player(companion_id),
                {"prop_id": action["prop_id"]},
            )
        elif action["type"] == "rescue":
            await self._complete_partner_rescue(room_id, action["target_id"], companion_id)
        elif action["type"] == "trap":
            await self._freeze_companion_from_trap(room_id, action["trap_id"], companion_id)
        elif action["type"] == "escape":
            await self._complete_companion_escape(room_id, companion_id)
        elif action["type"] == "floor_transition":
            # AI의 자율 층 이동
            target = action["target_floor"]
            uses_stairs = action.get("traversal") == "stairs"
            if uses_stairs:
                offset = -0.38 if companion_id == "partner" else 0.38
                z_offset = 0.0
            else:
                offset = (DEFAULT_AI_PARTNER_IDS.index(companion_id) + 1) * 1.1 if companion_id in DEFAULT_AI_PARTNER_IDS else 1.1
                z_offset = 0.7
            if partner:
                partner.position.x = target["x"] + offset
                partner.position.y = target["y"]
                partner.position.z = target["z"] + z_offset
                partner.position.floor = WorldFloor(target["floor"])
                partner.position.zone = target.get("zone", partner.position.zone)
                session.position_samples[partner.player_id] = MovementSample(
                    partner.position.x, partner.position.z, time.monotonic(),
                )
                closed_floor = refresh_closing_floor(session)
                await self.broadcast(room_id, {
                    "type": "actor_floor_changed",
                    "actor_id": companion_id,
                    "route": "companion_follow",
                    "traversal": action.get("traversal"),
                    "direction": action.get("direction"),
                    "position": {
                        "x": partner.position.x,
                        "y": partner.position.y,
                        "z": partner.position.z,
                        "floor": target["floor"],
                        "zone": partner.position.zone,
                    },
                    "closed_floor": closed_floor.value if closed_floor else None,
                    "progression": session.vertical_progression_payload(),
                })
        elif action["type"] == "rooftop_signal_activate":
            signal_id = str(action.get("signal_id", ""))
            signal_label = {"east": "동쪽", "west": "서쪽"}.get(signal_id, "담당")
            try:
                signal = activate_rooftop_signal(session, companion_id, signal_id)
            except InvalidProgression:
                # 같은 틱에 인간 입력이 먼저 반영되면 다음 목표 계산으로 넘긴다.
                return
            await self.broadcast(room_id, {
                "type": "rooftop_signal_progress",
                "actor_id": companion_id,
                **signal,
            })
            await self._broadcast_companion_speech(room_id, {
                "type": "companion_report",
                "companion_id": companion_id,
                "message": f"{signal_label} 신호 입력 완료! 다음 순서를 확인할게.",
                "phase": VerticalRoundPhase.ROOFTOP_INTRO.value,
                "speech_intent": SpeechIntent.DECLARE_ACTION.value,
                "speech_mode": (speech_event.mode.value if speech_event else SpeechMode.NORMAL.value),
            }, companion_id)
            if signal["completed"]:
                event = complete_current_stage(session, companion_id)
                await self._publish_vertical_stage_advance(room_id, companion_id, event)
        elif action["type"] == "rooftop_signal_observed":
            signal_id = str(action.get("signal_id", ""))
            signal_label = {"center": "중앙", "east": "동쪽", "west": "서쪽"}.get(signal_id, "담당")
            message = (
                f"다음 입력은 {signal_label} 신호야. 내 위치로 와서 E를 눌러!"
                if action.get("guiding")
                else speech_event.text if speech_event
                else f"{signal_label} 중계기 위치 확보. 입력은 네가 맡아!"
            )
            await self._broadcast_companion_speech(room_id, {
                "type": "companion_report",
                "companion_id": companion_id,
                "message": message,
                "phase": VerticalRoundPhase.ROOFTOP_INTRO.value,
                "speech_intent": SpeechIntent.REPORT_OBSERVATION.value,
                "speech_mode": (speech_event.mode.value if speech_event else SpeechMode.NORMAL.value),
            }, companion_id)
        elif action["type"] == "route_scout_report":
            route_label = {
                "east": "동쪽 계단",
                "west": "서쪽 계단",
                "field": "운동장 방화문",
                "basement": "지하 방화문",
            }.get(str(action.get("route", "")), "다음 이동 경로")
            message = f"{route_label}까지 먼저 확인했어. 현재 미션이 끝나면 이쪽으로 이동하자."
            await self._broadcast_companion_speech(room_id, {
                "type": "companion_report",
                "companion_id": companion_id,
                "message": message,
                "phase": action.get("phase", ""),
                "speech_intent": SpeechIntent.REPORT_OBSERVATION.value,
                "speech_mode": (speech_event.mode.value if speech_event else SpeechMode.NORMAL.value),
            }, companion_id)
        elif action["type"] == "vertical_objective":
            phase = action["phase"]
            if phase == VerticalRoundPhase.FLOOR_3.value:
                message = "3층 방송 장치를 찾았어. 이 장치는 사람의 목소리로 뜻을 전달해야 작동해."
            else:
                message = {
                    VerticalRoundPhase.ROOFTOP_INTRO.value: "옥상 신호 장치를 찾았어. 내가 가동해 볼게.",
                    VerticalRoundPhase.FLOOR_2.value: "2층 연결 장치를 찾았어. 지금 조작할게.",
                    VerticalRoundPhase.FLOOR_1.value: "1층 관제 장치를 찾았어. 출구 잠금을 해제할게.",
                }.get(phase, "활성 장치를 찾았어. 주변을 확인할게.")
            # S4: 금기어 회피 적용
            message, _ = avoid_forbidden_words(message, session.state.forbidden_words)
            await self._broadcast_companion_speech(room_id, {
                "type": "companion_report", "companion_id": companion_id,
                "message": message, "phase": phase,
                "speech_intent": SpeechIntent.DECLARE_ACTION.value,
                "speech_mode": (speech_event.mode.value if speech_event else SpeechMode.NORMAL.value),
            }, companion_id)
            if phase == VerticalRoundPhase.FIELD_FINAL.value:
                await self._handle_action(
                    room_id, companion_id, {"action_type": "interact_stage_mission"},
                )
        elif action["type"] == "intercom_report":
            # AI가 인터폰에서 시퀀스를 읽고 보고
            sequence = action.get("sequence", [])
            if session.vertical_missions is not None:
                vm = session.vertical_missions
                desc = vm.intercom.describe_for_ai(session.state.forbidden_words)
                message = f"인터폰에 기호가 보여! {desc}"
                message, _ = avoid_forbidden_words(message, session.state.forbidden_words)
            else:
                message = "인터폰에 기호가 보여!"
            await self._broadcast_companion_speech(room_id, {
                "type": "companion_report", "companion_id": companion_id,
                "message": message, "phase": action.get("phase", ""),
                "speech_intent": SpeechIntent.REPORT_OBSERVATION.value,
                "speech_mode": (speech_event.mode.value if speech_event else SpeechMode.NORMAL.value),
            }, companion_id)
        elif action["type"] == "simultaneous_ready":
            # AI가 동시 조작 장치에 도착하여 준비 완료 보고
            message = "준비됐어! 동시에 작동하자!"
            message, _ = avoid_forbidden_words(message, session.state.forbidden_words)
            await self._broadcast_companion_speech(room_id, {
                "type": "companion_report", "companion_id": companion_id,
                "message": message, "phase": action.get("phase", ""),
                "speech_intent": SpeechIntent.DECLARE_ACTION.value,
                "speech_mode": (speech_event.mode.value if speech_event else SpeechMode.NORMAL.value),
            }, companion_id)
            await self.broadcast(room_id, {
                "type": "simultaneous_ai_ready",
                "companion_id": companion_id,
            })
        elif action["type"] == "basement_device_report":
            # AI가 지하 장치에 도착하여 상태를 보고
            device_status = action.get("device_status", {})
            device_name = device_status.get("name", "장치") if device_status else "장치"
            device_state = device_status.get("state", "off") if device_status else "off"
            state_label = {"off": "꺼져 있어", "standby": "대기 중이야", "active": "작동 중이야"}.get(device_state, "알 수 없어")
            message = f"{device_name} 상태를 확인했어! 지금 {state_label}."
            message, _ = avoid_forbidden_words(message, session.state.forbidden_words)
            await self._broadcast_companion_speech(room_id, {
                "type": "companion_report", "companion_id": companion_id,
                "message": message, "phase": action.get("phase", ""),
                "device_id": action.get("device_id"),
                "device_status": device_status,
                "speech_intent": SpeechIntent.REPORT_OBSERVATION.value,
                "speech_mode": (speech_event.mode.value if speech_event else SpeechMode.NORMAL.value),
            }, companion_id)
            await self.broadcast(room_id, {
                "type": "basement_device_status",
                "companion_id": companion_id,
                "device_id": action.get("device_id"),
                "device_status": device_status,
            })

    async def _complete_partner_rescue(self, room_id: str, target_id: str, companion_id: str = "partner") -> None:
        session = session_manager.get_or_create(room_id)
        partner = session.state.get_player(companion_id)
        target = session.state.get_player(target_id)
        if not partner or partner.status != PlayerStatus.ALIVE or not target or not target.is_frozen:
            return
        if not self._players_within(partner, target, float(COMPANION_CONTRACT["rescueDistance"]) + 0.8):
            return
        if not has_clear_catch_line(
            (partner.position.x, partner.position.z),
            (target.position.x, target.position.z),
            partner.position.floor.value,
        ):
            return
        target.unfreeze()
        self._cancel_freeze_timeout(room_id, target_id)
        await self.broadcast(room_id, {"type": "rescued", "rescuer_id": partner.player_id, "target_id": target_id})

    async def _freeze_companion_from_trap(self, room_id: str, trap_id: str, companion_id: str = "partner") -> None:
        session = session_manager.get_or_create(room_id)
        partner = session.state.get_player(companion_id)
        runtime = session.companion_states[companion_id]
        trap = next((item for item in TRAP_CONTRACT["traps"] if item["id"] == trap_id), None)
        if (
            session.state.phase not in {GamePhase.PLAYING, GamePhase.FINAL_SPELL, GamePhase.ESCAPE}
            or not partner or partner.status != PlayerStatus.ALIVE
            or not trap or trap_id not in session.active_trap_ids
            or math.hypot(partner.position.x - trap["x"], partner.position.z - trap["z"])
            > TRAP_CONTRACT["triggerDistance"] + 0.05
        ):
            return
        partner.freeze()
        record_hunter_signal(
            session, partner.player_id,
            {"x": partner.position.x, "z": partner.position.z}, "freeze",
        )
        await self.broadcast(room_id, {
            "type": "freeze", "player_id": partner.player_id,
            "matched_word": "트랩", "matched_stage": "trap", "confidence": 1.0,
            "trap_id": trap_id,
            "position": {"x": partner.position.x, "z": partner.position.z},
            "remaining_seconds": session.state.freeze_timeout_sec,
            "danger": {"seeker_last_seen": runtime.last_seeker_seen},
        })
        self._schedule_freeze_timeout(room_id, partner.player_id)
        await self._finish_if_team_frozen(room_id)

    async def _broadcast_companion_speech(self, room_id: str, message: dict, companion_id: str = "partner") -> bool:
        """AI의 월드 발화도 금기어를 거치며 안전할 때만 팀에 전달한다.

        S4: 금기어 회피 연출 적용
        S5: 발화 모드에 따른 소리 핑
        """
        session = session_manager.get_or_create(room_id)
        partner = session.state.get_player(companion_id)
        text = str(message.get("message") or message.get("reply") or "")

        # S4: 금기어 회피 연출 — 금기어가 포함되어 있으면 회피 표현으로 교체
        text, was_avoided = avoid_forbidden_words(text, session.state.forbidden_words)
        if was_avoided:
            message = {**message, "message": text, "forbidden_avoidance": True}

        result = session.engine.check(text)
        if result.is_forbidden and partner and partner.status == PlayerStatus.ALIVE:
            # v5 정본: AI는 비공개 단어를 알고 피하는 조력자다. 회피 후에도
            # 위험 표현이 남으면 발화만 폐기하고 AI를 빙결시키거나 단어를 공개하지 않는다.
            logger.info(
                "suppressed unsafe companion speech: room=%s companion=%s",
                room_id,
                companion_id,
            )
            return False
        await self.broadcast(room_id, message)
        return True

    async def _finish_if_team_frozen(self, room_id: str) -> bool:
        session = session_manager.get_or_create(room_id)
        if (
            session.vertical_progression_enabled
            and session.vertical_round.phase == VerticalRoundPhase.ESCAPE_OPEN
            and session.state.phase == GamePhase.ESCAPE
        ):
            # 열린 출구 구간의 빙결자는 아직 구조 가능하다. 개별 타이머가
            # 탈락으로 확정된 뒤에만 부분 탈출 결과를 정산한다.
            return False
        if not session.state.all_non_seeker_frozen_or_eliminated():
            return False
        session.state.phase = GamePhase.RESULT
        self._cancel_room_freeze_timeouts(room_id)
        await self.broadcast(room_id, {
            "type": "game_over",
            "reason": "all_frozen",
            **session.result_payload(),
        })
        return True

    async def _complete_companion_escape(self, room_id: str, companion_id: str = "partner") -> None:
        session = session_manager.get_or_create(room_id)
        partner = session.state.get_player(companion_id)
        if (
            session.state.phase != GamePhase.ESCAPE or not partner
            or partner.status != PlayerStatus.ALIVE
        ):
            return
        vertical_escape = (
            session.vertical_progression_enabled
            and session.vertical_round.phase == VerticalRoundPhase.ESCAPE_OPEN
            and session.vertical_round.final_route in {
                FinalRoute.FIELD, FinalRoute.BASEMENT,
            }
        )
        if vertical_escape:
            escape_slot = final_escape_slot(session)
            exit_x, _, exit_z = escape_slot["position"]
            escape_position = {"x": exit_x, "z": exit_z}
            if partner.position.floor != WorldFloor(escape_slot["floor"]):
                return
        else:
            escape_position = session.active_gate_escape_position()
        if math.hypot(
            partner.position.x - escape_position["x"],
            partner.position.z - escape_position["z"],
        ) > float(COMPANION_CONTRACT["arrivalDistance"]) + 0.15:
            return
        for seeker_id in ("seeker", "seeker-2"):
            seeker = session.state.get_player(seeker_id)
            if (
                seeker and seeker.status == PlayerStatus.ALIVE
                and seeker.shares_floor_with(partner)
                and self._players_within(seeker, partner, 1.5)
                and has_clear_catch_line(
                    (seeker.position.x, seeker.position.z),
                    (partner.position.x, partner.position.z),
                    seeker.position.floor.value,
                )
            ):
                await self._finish_seeker_catch(
                    room_id, partner.player_id, partner,
                )
                return
        partner.escape()
        session.escaped_player_ids.add(partner.player_id)
        await self.broadcast(room_id, {
            "type": "runner_escaped", "player_id": partner.player_id,
            "gate_id": (
                f"{session.vertical_round.final_route.value}_final_exit"
                if vertical_escape else session.active_gate_id
            ),
        })
        if vertical_escape:
            await self._finish_vertical_escape_if_resolved(
                room_id, partner.player_id,
            )

    def _forget_companion_task(self, room_id: str, completed: asyncio.Task[None]) -> None:
        if self._companion_tasks.get(room_id) is completed:
            self._companion_tasks.pop(room_id, None)
        if not completed.cancelled() and completed.exception():
            logger.error("companion task failed: room=%s error=%s", room_id, completed.exception())

    async def broadcast(
        self, room_id: str, message: dict, exclude: str | None = None
    ) -> None:
        room = self.rooms.get(room_id)
        if not room:
            return
        text = json.dumps(message, ensure_ascii=False)
        for pid, ws in room.players.items():
            if pid != exclude:
                await ws.send_text(text)

    async def send_to(
        self, room_id: str, player_id: str, message: dict
    ) -> None:
        room = self.rooms.get(room_id)
        if room and player_id in room.players:
            text = json.dumps(message, ensure_ascii=False)
            await room.players[player_id].send_text(text)
