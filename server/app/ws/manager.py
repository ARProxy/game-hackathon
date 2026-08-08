from __future__ import annotations

import asyncio
import json
import logging
import math
import time
from dataclasses import dataclass, field

from fastapi import WebSocket, WebSocketException, status

from app.ai.mission import generate_round, round_to_dict
from app.ai.onboarding import generate_forbidden_words, generate_onboarding_questions
from app.ai.partner import compare_partner_candidates
from app.ai.companion import (
    CONTRACT as COMPANION_CONTRACT,
    advance_companion,
    command_companion,
    companion_snapshot,
    request_companion_rescue,
)
from app.ai.hunter import (
    CONTRACT as HUNTER_CONTRACT,
    advance_hunter,
    advance_secondary_hunter,
    hunter_snapshot,
    record_hunter_signal,
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
from app.game.progression import InvalidProgression, VerticalRoundPhase, WorldFloor
from app.game.state import GamePhase, Player, PlayerRole, PlayerStatus
from app.game.vertical_flow import (
    BROADCAST_MISSION_PROMPT,
    activate_final_station,
    complete_current_stage,
    evaluate_broadcast_phrase,
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
        self._freeze_tasks: dict[tuple[str, str], asyncio.Task[None]] = {}
        self._hunter_tasks: dict[str, asyncio.Task[None]] = {}
        self._companion_tasks: dict[str, asyncio.Task[None]] = {}

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
        elif msg_type == "onboarding_complete":
            await self._handle_onboarding(room_id, player_id, payload)
        elif msg_type == "request_onboarding_questions":
            questions = await asyncio.to_thread(generate_onboarding_questions, 3)
            await self.send_to(room_id, player_id, {
                "type": "onboarding_questions", "questions": questions,
            })
        elif msg_type == "spell":
            await self._handle_spell(room_id, player_id, payload)
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

        # 금기어 판정
        result = session.engine.check(transcript)

        if result.is_forbidden and player and player.role == PlayerRole.HUMAN:
            rage_policy = session.vertical_round.record_human_forbidden_word_violation()
            player.freeze()
            record_hunter_signal(
                session, player_id,
                {"x": player.position.x, "z": player.position.z}, "freeze",
            )
            await self.broadcast(room_id, {
                "type": "freeze",
                "player_id": player_id,
                "matched_word": result.matched_word,
                "matched_stage": result.matched_stage,
                "confidence": result.confidence,
                "elapsed_ms": result.elapsed_ms,
                "position": {
                    "x": player.position.x,
                    "z": player.position.z,
                },
                "forbidden_word_violations": session.vertical_round.forbidden_word_violations,
                "fw_rage_tier": rage_policy.tier.value,
            })
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
                        "prompt": BROADCAST_MISSION_PROMPT,
                    })
                    return
                session.broadcast_mission_actor_id = None
                event = complete_current_stage(session, player_id)
                await self.broadcast(room_id, {
                    "type": "vertical_stage_advanced", "actor_id": player_id, **event,
                })
                seeker = session.state.get_player("seeker")
                slot = get_map_slot("F2_TO_F1_STAIR_EAST")
                if seeker:
                    x, y, z = slot["position"]
                    seeker.position.x, seeker.position.y, seeker.position.z = x, y, z
                    seeker.position.floor = WorldFloor(slot["floor"])
                    seeker.position.zone = slot["zone"]
                    await self.broadcast(room_id, {
                        "type": "actor_floor_changed", "actor_id": seeker.player_id,
                        "route": "seeker_descend",
                        "position": {"x": x, "y": y, "z": z, "floor": slot["floor"], "zone": slot["zone"]},
                    })
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
                delivered = await self._broadcast_companion_speech(room_id, payload)
                if not delivered:
                    session.companion_command = None
                    session.companion_goal_started = None
                    return
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
            if session.vertical_round.phase == VerticalRoundPhase.FIELD_FINAL:
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
                        "type": "vertical_final_ready", "spell_words": session.spell_words,
                        "progression": session.vertical_round.to_dict(),
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
                await self.send_to(room_id, player_id, {
                    "type": "vertical_mission_started",
                    "mission": "floor_3_broadcast",
                    "prompt": BROADCAST_MISSION_PROMPT,
                })
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
            await self.broadcast(room_id, {
                "type": "vertical_stage_advanced",
                "actor_id": player_id,
                **event,
            })
            if event["completed_phase"] == "rooftop_intro":
                seeker = session.state.get_player("seeker")
                slot = seeker_reveal_slot()
                if seeker:
                    x, y, z = slot["position"]
                    seeker.position.x, seeker.position.y, seeker.position.z = x, y, z
                    seeker.position.floor = WorldFloor(slot["floor"])
                    seeker.position.zone = slot["zone"]
                    await self.broadcast(room_id, {
                        "type": "actor_floor_changed",
                        "actor_id": seeker.player_id,
                        "route": "seeker_reveal",
                        "position": {
                            "x": x, "y": y, "z": z,
                            "floor": slot["floor"], "zone": slot["zone"],
                        },
                    })
            elif event["next_phase"] in {"floor_2", "floor_1", "field_final"}:
                seeker = session.state.get_player("seeker")
                slot_id = {
                    "floor_2": "F2_TO_F1_STAIR_EAST",
                    "floor_1": "F1_STAIR_ARRIVAL_EAST",
                    "field_final": "FIELD_FINAL_ENTRY",
                }[event["next_phase"]]
                slot = get_map_slot(slot_id)
                if seeker:
                    x, y, z = slot["position"]
                    seeker.position.x, seeker.position.y, seeker.position.z = x, y, z
                    seeker.position.floor = WorldFloor(slot["floor"])
                    seeker.position.zone = slot["zone"]
                    await self.broadcast(room_id, {
                        "type": "actor_floor_changed",
                        "actor_id": seeker.player_id,
                        "route": "seeker_descend",
                        "position": {
                            "x": x, "y": y, "z": z,
                            "floor": slot["floor"], "zone": slot["zone"],
                        },
                    })
                if event["next_phase"] == "floor_1":
                    secondary = session.state.get_player("seeker-2")
                    secondary_slot = secondary_seeker_slot()
                    if secondary:
                        sx, sy, sz = secondary_slot["position"]
                        secondary.position.x, secondary.position.y, secondary.position.z = sx, sy, sz
                        secondary.position.floor = WorldFloor(secondary_slot["floor"])
                        secondary.position.zone = secondary_slot["zone"]
                        await self.broadcast(room_id, {
                            "type": "actor_floor_changed", "actor_id": secondary.player_id,
                            "route": "seeker_pincer_reveal",
                            "position": {"x": sx, "y": sy, "z": sz, "floor": secondary_slot["floor"], "zone": secondary_slot["zone"]},
                        })

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
                for index, companion_id in enumerate(DEFAULT_AI_PARTNER_IDS):
                    companion = session.state.get_player(companion_id)
                    if not companion or companion.status != PlayerStatus.ALIVE:
                        continue
                    position = event["position"]
                    companion.position.x = position["x"] + (index + 1) * 1.1
                    companion.position.y = position["y"]
                    companion.position.z = position["z"] + 0.7
                    companion.position.floor = WorldFloor(position["floor"])
                    companion.position.zone = position["zone"]
                    await self.broadcast(room_id, {
                        "type": "actor_floor_changed",
                        "actor_id": companion_id,
                        "route": event["route"],
                        "position": {
                            "x": companion.position.x,
                            "y": companion.position.y,
                            "z": companion.position.z,
                            "floor": position["floor"],
                            "zone": position["zone"],
                        },
                    })

        elif action_type == "vertical_escape":
            exit_slot = get_map_slot("FIELD_FINAL_ENTRY")
            exit_x, _, exit_z = exit_slot["position"]
            if (
                session.vertical_round.phase != VerticalRoundPhase.ESCAPE_OPEN
                or session.state.phase != GamePhase.ESCAPE
                or not player or player.status != PlayerStatus.ALIVE
                or player.position.floor != WorldFloor.FIELD
                or math.hypot(player.position.x - exit_x, player.position.z - exit_z) > 2.25
            ):
                await self.send_to(room_id, player_id, {
                    "type": "action_rejected", "action_type": action_type,
                    "reason": "escape_not_available",
                })
                return
            player.escape()
            session.escaped_player_ids.add(player_id)
            session.vertical_round.finish(VerticalRoundPhase.VICTORY)
            session.state.phase = GamePhase.RESULT
            self._cancel_room_freeze_timeouts(room_id)
            await self.broadcast(room_id, {
                "type": "game_won", "player_id": player_id,
                "reason": "vertical_school_escape",
                "escaped_player_ids": sorted(session.escaped_player_ids),
                "companion_statuses": {
                    actor_id: session.state.get_player(actor_id).status.value
                    for actor_id in DEFAULT_AI_PARTNER_IDS
                    if session.state.get_player(actor_id)
                },
                "progression": session.vertical_round.to_dict(),
            })

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
                and target and target.role == PlayerRole.AI_PARTNER and target.is_frozen
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
        team_defeated = (
            player.role == PlayerRole.HUMAN
            or (
                player.role == PlayerRole.AI_PARTNER
                and session.state.phase in {GamePhase.PLAYING, GamePhase.FINAL_SPELL}
            )
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
            })
        logger.info(
            "ELIMINATED: room=%s player=%s reason=caught_by_seeker",
            room_id, player_id,
        )

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

        session.state.phase = GamePhase.RESULT
        player.escape()
        session.escaped_player_ids.add(player_id)
        self._cancel_room_freeze_timeouts(room_id)
        partner = session.state.get_player("partner")
        companion_statuses = {
            companion_id: (
                session.state.get_player(companion_id).status.value
                if session.state.get_player(companion_id) else "missing"
            )
            for companion_id in DEFAULT_AI_PARTNER_IDS
        }
        await self.broadcast(room_id, {
            "type": "game_won",
            "player_id": player_id,
            "reason": "escaped",
            "gate_id": session.active_gate_id,
            "escaped_player_ids": sorted(session.escaped_player_ids),
            "partner_status": partner.status.value if partner else "missing",
            "companion_statuses": companion_statuses,
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

        # 현재 사전과제는 인간 1명 플레이이므로 조작 주체가 탈락하면 판을 종료한다.
        # AI 동료가 살아 있다는 이유로 입력할 인간이 없는 세션을 방치하지 않는다.
        if player.role == PlayerRole.HUMAN:
            session.state.phase = GamePhase.RESULT
            self._cancel_room_freeze_timeouts(room_id)
            await self.broadcast(room_id, {
                "type": "game_over",
                "reason": "human_eliminated",
            })
            return

        if session.state.all_non_seeker_frozen_or_eliminated():
            session.state.phase = GamePhase.RESULT
            await self.broadcast(room_id, {
                "type": "game_over",
                "reason": "all_frozen_or_eliminated",
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

    async def _handle_onboarding(
        self, room_id: str, player_id: str, payload: dict
    ) -> None:
        answers = payload.get("answers", [])
        forbidden_words = await asyncio.to_thread(generate_forbidden_words, answers, 3)

        # 금기어 채집 결과를 클라이언트에 전달
        await self.broadcast(room_id, {
            "type": "forbidden_words_ready",
            "forbidden_words": forbidden_words,
            "source_answers": answers,
        })

        # 라운드 데이터 생성 (프롭 배치, 미션)
        round_data = generate_round(forbidden_words)

        # 게임 시작
        session = session_manager.get_or_create(room_id)
        session.setup_game(forbidden_words)
        if not session.vertical_progression_enabled:
            session.setup_round(round_data)
        self._ensure_hunter_task(room_id)
        self._ensure_companion_task(room_id)
        await self.broadcast(room_id, {
            "type": "game_started",
            "state": session.state_payload(),
            "round": round_to_dict(round_data),
            "active_gate": session.active_gate_payload(),
            "active_traps": session.active_traps_payload(),
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
            and session.vertical_round.phase == VerticalRoundPhase.FIELD_FINAL
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
                "progression": session.vertical_round.to_dict() if vertical_final else None,
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

    async def _handle_start_game(
        self, room_id: str, player_id: str, payload: dict
    ) -> None:
        session = session_manager.get_or_create(room_id)
        requested_words = payload.get("forbidden_words")
        forbidden_words = requested_words or DEFAULT_FORBIDDEN_WORDS
        session.setup_game(forbidden_words)
        round_data = None
        if not requested_words:
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
        if action["type"] == "report":
            await self._broadcast_companion_speech(room_id, {
                "type": "companion_report", "companion_id": companion_id,
                "prop_id": action["prop_id"], "zone": action["zone"],
                "appearance": action["appearance"],
                "message": (
                    f"{action['zone']} 구역에서 {action['appearance'].get('color', '알 수 없는 색')} "
                    f"{action['appearance'].get('mesh', '물체')} 후보를 발견했어. 이 특징과 맞는지 말해줘."
                ),
            }, companion_id)
        elif action["type"] == "seeker_report":
            await self._broadcast_companion_speech(room_id, {
                "type": "companion_seeker_report", "companion_id": companion_id,
                "position": action["position"], "message": "술래를 봤어! 마지막 위치를 공유할게.",
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
            delivered = await self._broadcast_companion_speech(room_id, {
                "type": "companion_report", "companion_id": companion_id,
                "message": message, "phase": phase,
            }, companion_id)
            if delivered and phase != VerticalRoundPhase.FLOOR_3.value:
                await self._handle_action(
                    room_id, companion_id, {"action_type": "interact_stage_mission"},
                )

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
        """AI의 월드 발화도 금기어를 거치며 안전할 때만 팀에 전달한다."""
        session = session_manager.get_or_create(room_id)
        partner = session.state.get_player(companion_id)
        runtime = session.companion_states[companion_id]
        text = str(message.get("message") or message.get("reply") or "")
        result = session.engine.check(text)
        if result.is_forbidden and partner and partner.status == PlayerStatus.ALIVE:
            partner.freeze()
            record_hunter_signal(
                session, partner.player_id,
                {"x": partner.position.x, "z": partner.position.z}, "freeze",
            )
            await self.broadcast(room_id, {
                "type": "freeze", "player_id": partner.player_id,
                "matched_word": result.matched_word,
                "matched_stage": "ai_speech", "confidence": result.confidence,
                "position": {"x": partner.position.x, "z": partner.position.z},
                "remaining_seconds": session.state.freeze_timeout_sec,
                "danger": {"seeker_last_seen": runtime.last_seeker_seen},
            })
            self._schedule_freeze_timeout(room_id, partner.player_id)
            await self._finish_if_team_frozen(room_id)
            return False
        await self.broadcast(room_id, message)
        return True

    async def _finish_if_team_frozen(self, room_id: str) -> bool:
        session = session_manager.get_or_create(room_id)
        if not session.state.all_non_seeker_frozen_or_eliminated():
            return False
        session.state.phase = GamePhase.RESULT
        self._cancel_room_freeze_timeouts(room_id)
        await self.broadcast(room_id, {"type": "game_over", "reason": "all_frozen"})
        return True

    async def _complete_companion_escape(self, room_id: str, companion_id: str = "partner") -> None:
        session = session_manager.get_or_create(room_id)
        partner = session.state.get_player(companion_id)
        seeker = session.state.get_player("seeker")
        if (
            session.state.phase != GamePhase.ESCAPE or not partner
            or partner.status != PlayerStatus.ALIVE
        ):
            return
        escape_position = session.active_gate_escape_position()
        if math.hypot(
            partner.position.x - escape_position["x"],
            partner.position.z - escape_position["z"],
        ) > float(COMPANION_CONTRACT["arrivalDistance"]) + 0.15:
            return
        if (
            seeker and seeker.status == PlayerStatus.ALIVE
            and self._players_within(seeker, partner, 1.5)
            and has_clear_catch_line(
                (seeker.position.x, seeker.position.z),
                (partner.position.x, partner.position.z),
                seeker.position.floor.value,
            )
        ):
            await self._finish_seeker_catch(room_id, partner.player_id, partner)
            return
        partner.escape()
        session.escaped_player_ids.add(partner.player_id)
        await self.broadcast(room_id, {
            "type": "runner_escaped", "player_id": partner.player_id,
            "gate_id": session.active_gate_id,
        })

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
