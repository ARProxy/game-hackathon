"""미션 생성 엔진

금기어 → 프롭 매핑 → 맵 슬롯 배치 → T1 미션 x3 생성
LLM 없이 템플릿 + 데이터 기반으로 동작한다.
"""

from __future__ import annotations

import json
import random
import logging
from pathlib import Path
from dataclasses import dataclass

logger = logging.getLogger(__name__)

PROP_DICT_PATH = Path(__file__).parent.parent / "data" / "prop_dict.json"

# 맵 슬롯 — 프롭을 배치할 수 있는 위치 (구역별 분산)
MAP_SLOTS = [
    # A구역 (놀이기구)
    {"zone": "A", "position": {"x": -9, "z": -5}},
    {"zone": "A", "position": {"x": -5, "z": -9}},
    {"zone": "A", "position": {"x": -4, "z": -4}},
    # B구역 (창고)
    {"zone": "B", "position": {"x": 5, "z": -9}},
    {"zone": "B", "position": {"x": 9, "z": -5}},
    {"zone": "B", "position": {"x": 6, "z": -6}},
    # C구역 (중앙)
    {"zone": "C", "position": {"x": -9, "z": 5}},
    {"zone": "C", "position": {"x": -5, "z": 9}},
    {"zone": "C", "position": {"x": -6, "z": 6}},
    # D구역 (골목출구)
    {"zone": "D", "position": {"x": 5, "z": 9}},
    {"zone": "D", "position": {"x": 9, "z": 5}},
    {"zone": "D", "position": {"x": 6, "z": 6}},
]

# 단서 단어 풀
CLUE_WORDS = ["파란", "하늘", "아래", "셋", "별", "달", "바람", "불꽃", "새벽", "숲"]


@dataclass
class PropPlacement:
    prop_id: str
    name: str
    color: str
    mesh: str
    scale: float
    position: dict  # {"x": float, "z": float}
    is_real: bool   # 진짜(미션 대상) vs 가짜(디코이)
    zone: str
    forbidden_word: str  # 대응하는 금기어
    tags: list[str]
    descriptions: list[str]


@dataclass
class Mission:
    mission_id: int
    forbidden_word: str
    clue_word: str       # 클리어 시 획득하는 단서
    real_prop: PropPlacement
    decoy_props: list[PropPlacement]


@dataclass
class RoundData:
    missions: list[Mission]
    all_props: list[PropPlacement]
    spell_words: list[str]  # 최종 주문에 필요한 단서 단어들


def load_prop_dict() -> dict:
    with open(PROP_DICT_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def generate_round(forbidden_words: list[str]) -> RoundData:
    """금기어 목록으로 라운드 데이터를 생성한다."""
    prop_dict = load_prop_dict()
    available_slots = list(MAP_SLOTS)
    random.shuffle(available_slots)

    clues = random.sample(CLUE_WORDS, min(len(forbidden_words), len(CLUE_WORDS)))
    missions: list[Mission] = []
    all_props: list[PropPlacement] = []
    slot_index = 0

    for i, word in enumerate(forbidden_words):
        prop_data = prop_dict.get(word)

        if not prop_data:
            # 프롭 사전에 없는 금기어 → 기본 구 형태
            prop_data = {
                "id": f"generic_{i}",
                "name": f"{word} 관련 물건",
                "tags": ["unknown"],
                "descriptions": [word],
                "mesh": "sphere",
                "color": "#FFD700",
                "scale": 0.4,
                "decoys": [
                    {"id": f"decoy_{i}_a", "name": "비슷한 물건 A", "tags": [], "color": "#C0C0C0", "mesh": "sphere", "scale": 0.35},
                    {"id": f"decoy_{i}_b", "name": "비슷한 물건 B", "tags": [], "color": "#A0A0A0", "mesh": "sphere", "scale": 0.35},
                ],
            }

        # 진짜 프롭 배치
        if slot_index >= len(available_slots):
            break

        real_slot = available_slots[slot_index]
        slot_index += 1

        real_prop = PropPlacement(
            prop_id=prop_data["id"],
            name=prop_data["name"],
            color=prop_data["color"],
            mesh=prop_data["mesh"],
            scale=prop_data["scale"],
            position=real_slot["position"],
            is_real=True,
            zone=real_slot["zone"],
            forbidden_word=word,
            tags=prop_data.get("tags", []),
            descriptions=prop_data.get("descriptions", []),
        )

        # 디코이 프롭 배치 (다른 구역에)
        decoy_props: list[PropPlacement] = []
        for decoy_data in prop_data.get("decoys", [])[:2]:
            if slot_index >= len(available_slots):
                break
            decoy_slot = available_slots[slot_index]
            slot_index += 1

            decoy = PropPlacement(
                prop_id=decoy_data["id"],
                name=decoy_data["name"],
                color=decoy_data["color"],
                mesh=decoy_data.get("mesh", "sphere"),
                scale=decoy_data.get("scale", 0.35),
                position=decoy_slot["position"],
                is_real=False,
                zone=decoy_slot["zone"],
                forbidden_word=word,
                tags=decoy_data.get("tags", []),
                descriptions=[],
            )
            decoy_props.append(decoy)

        clue_word = clues[i] if i < len(clues) else "빛"
        mission = Mission(
            mission_id=i,
            forbidden_word=word,
            clue_word=clue_word,
            real_prop=real_prop,
            decoy_props=decoy_props,
        )
        missions.append(mission)
        all_props.append(real_prop)
        all_props.extend(decoy_props)

    spell_words = [m.clue_word for m in missions]

    logger.info(
        "round generated: words=%s, missions=%d, props=%d, spell=%s",
        forbidden_words, len(missions), len(all_props), spell_words,
    )

    return RoundData(missions=missions, all_props=all_props, spell_words=spell_words)


def round_to_dict(rd: RoundData) -> dict:
    """클라이언트에 전송할 수 있는 dict로 변환."""
    return {
        "missions": [
            {
                "mission_id": m.mission_id,
                "forbidden_word": m.forbidden_word,
                "clue_word": m.clue_word,
            }
            for m in rd.missions
        ],
        "props": [
            {
                "prop_id": p.prop_id,
                "name": p.name,
                "color": p.color,
                "mesh": p.mesh,
                "scale": p.scale,
                "position": p.position,
                "is_real": p.is_real,
                "zone": p.zone,
                "forbidden_word": p.forbidden_word,
                "tags": p.tags,
                "descriptions": p.descriptions,
            }
            for p in rd.all_props
        ],
        "spell_words": rd.spell_words,
    }
