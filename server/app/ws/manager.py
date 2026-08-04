from __future__ import annotations

import asyncio
import json
import logging
import math
import time
from dataclasses import dataclass, field

from fastapi import WebSocket

from app.ai.mission import generate_round, round_to_dict
from app.ai.onboarding import extract_forbidden_words
from app.ai.partner import match_partner_command
from app.ai.spell import check_spell
from app.game.authority import (
    ACTOR_MAX_SPEED,
    HUMAN_MAX_SPEED,
    MovementSample,
    has_clear_catch_line,
    movement_is_plausible,
)
from app.game.session import session_manager
from app.game.state import GamePhase, Player, PlayerRole, PlayerStatus

logger = logging.getLogger(__name__)


@dataclass
class Room:
    room_id: str
    players: dict[str, WebSocket] = field(default_factory=dict)


class ConnectionManager:
    def __init__(self) -> None:
        self.rooms: dict[str, Room] = {}
        self._freeze_tasks: dict[tuple[str, str], asyncio.Task[None]] = {}

    async def connect(
        self, room_id: str, player_id: str, websocket: WebSocket
    ) -> None:
        await websocket.accept()
        if room_id not in self.rooms:
            self.rooms[room_id] = Room(room_id=room_id)
        self.rooms[room_id].players[player_id] = websocket

        # 게임 세션에 플레이어 등록
        session = session_manager.get_or_create(room_id)
        session.state.add_player(player_id, PlayerRole.HUMAN)

        logger.info("connected: room=%s player=%s", room_id, player_id)

    def disconnect(self, room_id: str, player_id: str) -> None:
        self._cancel_freeze_timeout(room_id, player_id)
        room = self.rooms.get(room_id)
        if room:
            room.players.pop(player_id, None)
            if not room.players:
                self._cancel_room_freeze_timeouts(room_id)
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

        # 빙결된 플레이어의 발화는 무시
        if player and player.status != PlayerStatus.ALIVE:
            return

        # 확정된 정상 발화는 내용 판정에 앞서 위치 기반 청각 핑을 만든다.
        # 술래는 안전 발화와 금기어 발화를 동일한 순서로 감지할 수 있다.
        if player and is_final and transcript.strip():
            await self.broadcast(room_id, {
                "type": "sound_ping",
                "player_id": player_id,
                "position": {
                    "x": player.position.x,
                    "z": player.position.z,
                },
            })

        # 금기어 판정
        result = session.engine.check(transcript)

        if result.is_forbidden and player:
            player.freeze()
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
            mission = session.current_mission()
            if mission and is_final and transcript.strip():
                command = match_partner_command(transcript, mission.real_prop)
                if command.matched:
                    await self.broadcast(room_id, {
                        "type": "partner_command",
                        "target_prop_id": mission.real_prop.prop_id,
                        "position": mission.real_prop.position,
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

        if action_type == "move" and player and not player.is_frozen:
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
            await self._handle_actor_move(room_id, player_id, player, actor, payload)

        elif action_type == "rescue":
            target_id = payload.get("target_id")
            target = session.state.get_player(target_id) if target_id else None
            valid_rescue = (
                session.state.phase != GamePhase.RESULT
                and actor
                and actor.role == PlayerRole.AI_PARTNER
                and actor.status == PlayerStatus.ALIVE
                and target
                and target.role == PlayerRole.HUMAN
                and target.is_frozen
                and self._players_within(actor, target, 2.0)
            )
            if valid_rescue:
                target.unfreeze()
                self._cancel_freeze_timeout(room_id, target_id)
                await self.broadcast(room_id, {
                    "type": "rescued",
                    "rescuer_id": actor.player_id,
                    "target_id": target_id,
                })
                logger.info(
                    "RESCUE: room=%s rescuer=%s target=%s",
                    room_id, actor.player_id, target_id,
                )
            else:
                await self.send_to(room_id, player_id, {
                    "type": "action_rejected",
                    "action_type": "rescue",
                    "reason": "invalid_rescue",
                })

        elif action_type == "trap" and player and not player.is_frozen:
            if not self._accept_position_update(
                session, player, payload.get("x"), payload.get("z"),
                HUMAN_MAX_SPEED,
            ):
                await self.send_to(room_id, player_id, {
                    "type": "action_rejected",
                    "action_type": "trap",
                    "reason": "implausible_movement",
                })
                return
            player.freeze()
            await self.broadcast(room_id, {
                "type": "freeze",
                "player_id": player_id,
                "matched_word": "트랩",
                "matched_stage": "trap",
                "confidence": 1.0,
                "trap_id": payload.get("trap_id"),
                "position": {
                    "x": player.position.x,
                    "z": player.position.z,
                },
            })
            self._schedule_freeze_timeout(room_id, player_id)

        elif action_type == "inspect_prop":
            await self._handle_inspect_prop(
                room_id, player_id, actor, payload
            )

        elif action_type == "gate_arrived":
            await self._handle_gate_arrived(room_id, player_id, player, payload)

        elif action_type == "seeker_catch":
            seeker = session.state.get_player("seeker")
            valid_catch = (
                session.state.phase in {
                    GamePhase.PLAYING, GamePhase.FINAL_SPELL, GamePhase.ESCAPE,
                }
                and player
                and player.role == PlayerRole.HUMAN
                and player.status != PlayerStatus.ELIMINATED
                and seeker
                and seeker.role == PlayerRole.SEEKER
                and seeker.status == PlayerStatus.ALIVE
                and self._players_within(seeker, player, 1.5)
                and has_clear_catch_line(
                    (seeker.position.x, seeker.position.z),
                    (player.position.x, player.position.z),
                )
            )
            if not valid_catch:
                await self.send_to(room_id, player_id, {
                    "type": "action_rejected",
                    "action_type": "seeker_catch",
                    "reason": "invalid_seeker_contact",
                })
                return
            await self._finish_seeker_catch(room_id, player_id, player)

        elif action_type == "gate_escape":
            await self._handle_gate_escape(room_id, player_id, player, payload)

    @staticmethod
    def _players_within(first: Player, second: Player, radius: float) -> bool:
        return (
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
        session.state.phase = GamePhase.RESULT
        self._cancel_room_freeze_timeouts(room_id)
        await self.broadcast(room_id, {
            "type": "eliminated",
            "player_id": player_id,
            "reason": "caught_by_seeker",
        })
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
            and actor.role in {PlayerRole.AI_PARTNER, PlayerRole.SEEKER}
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
            )
        ):
            await self._finish_seeker_catch(room_id, player_id, player)
            return

        session.state.phase = GamePhase.RESULT
        self._cancel_room_freeze_timeouts(room_id)
        await self.broadcast(room_id, {
            "type": "game_won",
            "player_id": player_id,
            "reason": "escaped",
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
        completed_index = session.current_mission_index
        is_correct = prop.prop_id == mission.real_prop.prop_id
        clue = None
        if is_correct:
            clue = mission.clue_word
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
        await asyncio.sleep(remaining)

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
        forbidden_words = extract_forbidden_words(answers, count=3)

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
        session.setup_round(round_data)
        await self.broadcast(room_id, {
            "type": "game_started",
            "state": session.state.to_dict(),
            "round": round_to_dict(round_data),
            "active_gate": session.active_gate_payload(),
        })

    async def _handle_spell(
        self, room_id: str, player_id: str, payload: dict
    ) -> None:
        spell_text = payload.get("spell_text", "")
        session = session_manager.get_or_create(room_id)
        player = session.state.get_player(player_id)

        if (
            session.state.phase != GamePhase.FINAL_SPELL
            or player_id not in session.gate_arrived_player_ids
            or not player
            or player.status != PlayerStatus.ALIVE
            or not session.is_near_active_gate(player_id)
        ):
            await self.send_to(room_id, player_id, {
                "type": "spell_rejected",
                "reason": "gate_arrival_required",
            })
            return

        result = check_spell(spell_text, session.spell_words)

        if result["success"]:
            session.state.phase = GamePhase.ESCAPE
            await self.broadcast(room_id, {
                "type": "spell_success",
                "player_id": player_id,
                "matched": result["matched"],
                "transcript": result["transcript"],
            })
        else:
            await self.send_to(room_id, player_id, {
                "type": "spell_failed",
                "matched": result["matched"],
                "missing": result["missing"],
                "transcript": result["transcript"],
            })

    async def _handle_start_game(
        self, room_id: str, player_id: str, payload: dict
    ) -> None:
        session = session_manager.get_or_create(room_id)
        forbidden_words = payload.get("forbidden_words")
        session.setup_game(forbidden_words)
        await self.broadcast(room_id, {
            "type": "game_started",
            "state": session.state.to_dict(),
            "active_gate": session.active_gate_payload(),
        })

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
