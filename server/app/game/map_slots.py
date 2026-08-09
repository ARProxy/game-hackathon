"""최신 학교 맵의 기획 4 의미 슬롯을 읽는 서버 공통 계약."""

from __future__ import annotations

import json
from pathlib import Path


CONTRACT_PATH = (
    Path(__file__).parents[3] / "client/src/game/verticalMapContract.json"
)


def load_vertical_map_contract() -> dict:
    with CONTRACT_PATH.open(encoding="utf-8") as contract_file:
        return json.load(contract_file)


VERTICAL_MAP_CONTRACT = load_vertical_map_contract()


def get_map_slot(slot_id: str) -> dict:
    try:
        return VERTICAL_MAP_CONTRACT["slots"][slot_id]
    except KeyError as error:
        raise KeyError(f"정의되지 않은 수직 맵 슬롯: {slot_id}") from error


def elevator_slot(elevator_id: str) -> dict:
    """compact 맵의 승강기 ID를 실제 승강로 슬롯으로 해석한다."""
    for slot in VERTICAL_MAP_CONTRACT["slots"].values():
        if slot.get("kind") == "elevator" and slot.get("elevatorId") == elevator_id:
            return slot
    raise KeyError(f"정의되지 않은 엘리베이터: {elevator_id}")


def actor_spawn_slots() -> dict[str, dict]:
    """기획 4 솔로 팀의 결정적 옥상 스폰을 actor ID별로 반환한다."""
    return {
        "human": get_map_slot("ROOF_RUNNER_SPAWN_A"),
        "partner": get_map_slot("ROOF_RUNNER_SPAWN_B"),
        "partner-2": get_map_slot("ROOF_RUNNER_SPAWN_C"),
        "seeker": get_map_slot("F3_SEEKER_REVEAL_ENTRY"),
        "seeker-2": get_map_slot("F1_BLOCKER_SPAWN_ENTRY"),
    }


def runner_spawn_slots() -> list[dict]:
    """인간을 먼저, 남은 자리에 AI를 배치하는 최대 4인 옥상 슬롯."""
    return [get_map_slot(f"ROOF_RUNNER_SPAWN_{suffix}") for suffix in "ABCD"]


def seeker_reveal_slot() -> dict:
    return get_map_slot("F3_SEEKER_REVEAL_ENTRY")


def secondary_seeker_slot() -> dict:
    """1층 협공 술래가 반대편 계단에서 등장하는 슬롯."""
    return get_map_slot("F1_BLOCKER_SPAWN_ENTRY")
