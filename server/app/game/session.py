"""게임 세션 관리

Room별로 GameState와 ForbiddenWordEngine을 관리한다.
싱글 플레이도 room_id를 부여하여 멀티 확장에 대비한다.
"""

from __future__ import annotations

import logging
import json
import math
import random
import time
from dataclasses import dataclass, field
from pathlib import Path

from app.ai.forbidden import ForbiddenWordEngine
from app.ai.mission import Mission, RoundData
from app.game.authority import MovementSample
from app.game.map_slots import VERTICAL_MAP_CONTRACT, actor_spawn_slots
from app.game.progression import VerticalRoundState, WorldFloor
from app.game.state import GamePhase, GameState, PlayerRole

logger = logging.getLogger(__name__)

# MVP 기본 금기어 (온보딩 미구현 시 폴백)
DEFAULT_FORBIDDEN_WORDS = ["열쇠", "커피", "빨간"]
DEFAULT_AI_PARTNER_ID = "partner"
DEFAULT_AI_PARTNER_IDS = ("partner", "partner-2")
DEFAULT_SEEKER_ID = "seeker"
SECONDARY_SEEKER_ID = "seeker-2"
RESERVED_ACTOR_ROLES: dict[str, PlayerRole] = {
    **{actor_id: PlayerRole.AI_PARTNER for actor_id in DEFAULT_AI_PARTNER_IDS},
    DEFAULT_SEEKER_ID: PlayerRole.SEEKER,
    SECONDARY_SEEKER_ID: PlayerRole.SEEKER,
}
GATE_CONTRACT_PATH = Path(__file__).parents[3] / "client/src/game/gateContract.json"
with GATE_CONTRACT_PATH.open(encoding="utf-8") as gate_contract_file:
    GATE_CONTRACT = json.load(gate_contract_file)
GATE_POSITIONS: dict[str, dict[str, float]] = {
    gate["id"]: {"x": gate["position"][0], "z": gate["position"][1]}
    for gate in GATE_CONTRACT["gates"]
}
# v3 레거시 스폰 좌표 제거됨 — 수직 맵 계약(actor_spawn_slots)을 사용.
# 계약에 슬롯이 없을 경우 (0, 0, 0) 폴백.
TRAP_CONTRACT_PATH = Path(__file__).parents[3] / "client/src/game/trapContract.json"
with TRAP_CONTRACT_PATH.open(encoding="utf-8") as trap_contract_file:
    TRAP_CONTRACT = json.load(trap_contract_file)


@dataclass
class CompanionRuntime:
    memory: dict[str, dict] = field(default_factory=dict)
    command: dict | None = None
    rescue_request: str | None = None
    goal_started: float | None = None
    last_tick: float = 0.0
    last_intent: dict | None = None
    goal_changed_at: float = 0.0
    last_seeker_seen: dict | None = None
    candidate_memory: list[dict] = field(default_factory=list)

    def reset(self, now: float) -> None:
        self.memory.clear()
        self.command = None
        self.rescue_request = None
        self.goal_started = None
        self.last_tick = now
        self.last_intent = None
        self.goal_changed_at = 0.0
        self.last_seeker_seen = None
        self.candidate_memory = []


class GameSession:
    def __init__(self, room_id: str) -> None:
        self.state = GameState(room_id=room_id)
        self.vertical_round = VerticalRoundState()
        self.vertical_progression_enabled = bool(VERTICAL_MAP_CONTRACT["enabled"])
        self.broadcast_mission_actor_id: str | None = None
        self.final_station_actor_ids: set[str] = set()
        self.engine = ForbiddenWordEngine(DEFAULT_FORBIDDEN_WORDS)
        self.spell_words: list[str] = []
        self.round_data: RoundData | None = None
        self.current_mission_index = 0
        self.inspected_prop_ids: set[str] = set()
        self.active_gate_id = ""
        self.gate_arrived_player_ids: set[str] = set()
        self.position_samples: dict[str, MovementSample] = {}
        self.hunter_signal: dict | None = None
        self.hunter_last_seen: dict | None = None
        self.hunter_forward = {"x": 0.0, "z": 1.0}
        self.hunter_last_tick = 0.0
        self.hunter_last_intent: dict | None = None
        self.companion_states = {
            actor_id: CompanionRuntime() for actor_id in DEFAULT_AI_PARTNER_IDS
        }
        self.active_trap_ids: set[str] = set()
        self.triggered_trap_ids: set[str] = set()
        self.escaped_player_ids: set[str] = set()
        self.paused_at: float | None = None

    @property
    def is_paused(self) -> bool:
        return self.paused_at is not None

    def pause(self) -> bool:
        if self.is_paused or self.state.phase not in {
            GamePhase.PLAYING, GamePhase.FINAL_SPELL, GamePhase.ESCAPE,
        }:
            return False
        self.paused_at = time.time()
        return True

    def resume(self) -> bool:
        if self.paused_at is None:
            return False
        paused_for = max(0.0, time.time() - self.paused_at)
        for player in self.state.players.values():
            if player.frozen_at is not None:
                player.frozen_at += paused_for
        self.paused_at = None
        now = time.monotonic()
        self.hunter_last_tick = now
        for runtime in self.companion_states.values():
            runtime.last_tick = now
        return True

    def setup_game(self, forbidden_words: list[str] | None = None) -> None:
        """금기어를 설정하고 게임 준비."""
        words = forbidden_words or DEFAULT_FORBIDDEN_WORDS
        self.vertical_round = VerticalRoundState()
        self.broadcast_mission_actor_id = None
        self.final_station_actor_ids.clear()
        self.round_data = None
        self.spell_words = []
        self.current_mission_index = 0
        self.inspected_prop_ids.clear()
        self.active_gate_id = random.choice(tuple(GATE_POSITIONS))
        self.gate_arrived_player_ids.clear()
        self.hunter_signal = None
        self.hunter_last_seen = None
        self.hunter_forward = {"x": 0.0, "z": 1.0}
        self.hunter_last_tick = time.monotonic()
        self.hunter_last_intent = None
        companion_now = time.monotonic()
        for runtime in self.companion_states.values():
            runtime.reset(companion_now)
        reachable_traps = [
            trap["id"] for trap in TRAP_CONTRACT["traps"]
            if trap["floor"] in {"OUT", "F1"}
        ]
        self.active_trap_ids = set(random.sample(
            reachable_traps,
            min(int(TRAP_CONTRACT["activeCount"]), len(reachable_traps)),
        ))
        self.triggered_trap_ids.clear()
        self.escaped_player_ids.clear()
        self.paused_at = None
        # 싱글 플레이도 기획서의 최소 팀 구성을 서버 상태에 명시한다.
        # 화면에만 존재하는 동료를 서버가 모르면 인간 플레이어가 얼자마자
        # all_frozen으로 판정되므로, AI 동료와 술래를 결정적인 ID로 등록한다.
        for actor_id, required_role in RESERVED_ACTOR_ROLES.items():
            actor = self.state.get_player(actor_id)
            if actor is None or actor.role != required_role:
                # 연결 검사를 우회하거나 오래된 상태를 복원하더라도 예약
                # actor ID의 서버 권위 역할은 매 판 시작 시 복구한다.
                self.state.add_player(actor_id, required_role)
        now = time.monotonic()
        vertical_spawns = actor_spawn_slots() if self.vertical_progression_enabled else {}
        for player in self.state.players.values():
            slot = vertical_spawns.get(
                "human" if player.role == PlayerRole.HUMAN else player.player_id
            )
            if slot:
                x, y, z = slot["position"]
                floor = WorldFloor(slot["floor"])
                zone = slot["zone"]
            else:
                logger.warning(
                    "no vertical map slot for actor=%s role=%s — using (0,0,0) fallback",
                    player.player_id, player.role.value,
                )
                x, y, z = 0.0, 0.0, 0.0
                floor, zone = WorldFloor.F1, "unknown"
            player.position.x = x
            player.position.y = y
            player.position.z = z
            player.position.floor = floor
            player.position.zone = zone
            self.position_samples[player.player_id] = MovementSample(x, z, now)
        self.state.forbidden_words = words
        self.engine.update_words(words)
        self.state.phase = GamePhase.PLAYING
        self.state.started_at = time.time()
        logger.info(
            "game setup: room=%s words=%s", self.state.room_id, words
        )

    def state_payload(self) -> dict:
        """기존 상태와 기획 4 진행 계약을 함께 내보내는 호환 페이로드."""
        return {
            **self.state.to_dict(),
            "vertical_progression": {
                # actor 층 좌표와 문 계약이 연결되기 전에는 클라이언트가 이
                # 상태만 보고 옥상 스폰이나 층 잠금을 적용하지 않는다.
                "enabled": self.vertical_progression_enabled,
                **self.vertical_round.to_dict(),
            },
        }

    # 기존 단일 동료 테스트와 호출부가 점진적으로 이행할 수 있는 호환 프로퍼티.
    @property
    def companion_memory(self) -> dict[str, dict]:
        return self.companion_states[DEFAULT_AI_PARTNER_ID].memory

    @property
    def companion_command(self) -> dict | None:
        return self.companion_states[DEFAULT_AI_PARTNER_ID].command

    @companion_command.setter
    def companion_command(self, value: dict | None) -> None:
        self.companion_states[DEFAULT_AI_PARTNER_ID].command = value

    @property
    def companion_rescue_request(self) -> str | None:
        return self.companion_states[DEFAULT_AI_PARTNER_ID].rescue_request

    @companion_rescue_request.setter
    def companion_rescue_request(self, value: str | None) -> None:
        self.companion_states[DEFAULT_AI_PARTNER_ID].rescue_request = value

    @property
    def companion_goal_started(self) -> float | None:
        return self.companion_states[DEFAULT_AI_PARTNER_ID].goal_started

    @companion_goal_started.setter
    def companion_goal_started(self, value: float | None) -> None:
        self.companion_states[DEFAULT_AI_PARTNER_ID].goal_started = value

    @property
    def companion_last_tick(self) -> float:
        return self.companion_states[DEFAULT_AI_PARTNER_ID].last_tick

    @companion_last_tick.setter
    def companion_last_tick(self, value: float) -> None:
        self.companion_states[DEFAULT_AI_PARTNER_ID].last_tick = value

    @property
    def companion_last_intent(self) -> dict | None:
        return self.companion_states[DEFAULT_AI_PARTNER_ID].last_intent

    @companion_last_intent.setter
    def companion_last_intent(self, value: dict | None) -> None:
        self.companion_states[DEFAULT_AI_PARTNER_ID].last_intent = value

    @property
    def companion_goal_changed_at(self) -> float:
        return self.companion_states[DEFAULT_AI_PARTNER_ID].goal_changed_at

    @companion_goal_changed_at.setter
    def companion_goal_changed_at(self, value: float) -> None:
        self.companion_states[DEFAULT_AI_PARTNER_ID].goal_changed_at = value

    @property
    def companion_last_seeker_seen(self) -> dict | None:
        return self.companion_states[DEFAULT_AI_PARTNER_ID].last_seeker_seen

    @companion_last_seeker_seen.setter
    def companion_last_seeker_seen(self, value: dict | None) -> None:
        self.companion_states[DEFAULT_AI_PARTNER_ID].last_seeker_seen = value

    @property
    def companion_candidate_memory(self) -> list[dict]:
        return self.companion_states[DEFAULT_AI_PARTNER_ID].candidate_memory

    @companion_candidate_memory.setter
    def companion_candidate_memory(self, value: list[dict]) -> None:
        self.companion_states[DEFAULT_AI_PARTNER_ID].candidate_memory = value

    def setup_round(self, round_data: RoundData) -> None:
        """한 라운드의 서버 권위 미션 진행 상태를 초기화한다."""
        self.round_data = round_data
        self.spell_words = round_data.spell_words
        self.current_mission_index = 0
        self.inspected_prop_ids.clear()

    def current_mission(self) -> Mission | None:
        if (
            self.round_data is None
            or self.current_mission_index >= len(self.round_data.missions)
        ):
            return None
        return self.round_data.missions[self.current_mission_index]

    def active_gate_payload(self) -> dict:
        return {
            "gate_id": self.active_gate_id,
            "position": GATE_POSITIONS[self.active_gate_id],
        }

    def active_traps_payload(self) -> list[str]:
        return sorted(self.active_trap_ids)

    def active_gate_escape_position(self) -> dict[str, float]:
        gate = next(item for item in GATE_CONTRACT["gates"] if item["id"] == self.active_gate_id)
        local_z = float(GATE_CONTRACT["escapeSensorLocalZ"])
        return {
            "x": gate["position"][0] + math.sin(gate["rotationY"]) * local_z,
            "z": gate["position"][1] + math.cos(gate["rotationY"]) * local_z,
        }

    def is_near_active_gate(self, player_id: str, radius: float = 2.75) -> bool:
        player = self.state.get_player(player_id)
        if not player or not self.active_gate_id:
            return False
        gate = GATE_POSITIONS[self.active_gate_id]
        return (
            (player.position.x - gate["x"]) ** 2
            + (player.position.z - gate["z"]) ** 2
        ) <= radius ** 2


class SessionManager:
    """전체 세션을 관리한다. 싱글톤으로 사용."""

    def __init__(self) -> None:
        self.sessions: dict[str, GameSession] = {}

    def get_or_create(self, room_id: str) -> GameSession:
        if room_id not in self.sessions:
            self.sessions[room_id] = GameSession(room_id)
            logger.info("session created: room=%s", room_id)
        return self.sessions[room_id]

    def remove(self, room_id: str) -> None:
        self.sessions.pop(room_id, None)
        logger.info("session removed: room=%s", room_id)


# 싱글톤
session_manager = SessionManager()
