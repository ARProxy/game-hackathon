"""클라이언트 맵 스폰과 서버 이동 권위의 정적 계약."""

import json
from pathlib import Path

import pytest

from app.game.session import ROLE_SPAWNS
from app.game.state import PlayerRole


CONTRACT_PATH = Path(__file__).parents[2] / "client/src/game/actorContract.json"


def test_client_actor_spawns_match_server_authority() -> None:
    contract = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))["spawns"]
    role_keys = {
        PlayerRole.HUMAN: "human",
        PlayerRole.AI_PARTNER: "partner",
        PlayerRole.SEEKER: "seeker",
    }

    for role, key in role_keys.items():
        assert contract[key] == pytest.approx(ROLE_SPAWNS[role])
