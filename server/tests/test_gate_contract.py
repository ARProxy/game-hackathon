"""클라이언트 물리 게이트와 서버 권위 좌표의 정적 계약."""

from __future__ import annotations

import json
import math
from pathlib import Path

import pytest

from app.game.session import GATE_POSITIONS


CONTRACT_PATH = Path(__file__).parents[2] / "client/src/game/gateContract.json"


@pytest.fixture(scope="module")
def gate_contract() -> dict:
    return json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))


def test_client_gate_ids_and_positions_match_server(gate_contract: dict) -> None:
    client_gates = {gate["id"]: gate for gate in gate_contract["gates"]}
    assert set(client_gates) == set(GATE_POSITIONS)
    for gate_id, server_position in GATE_POSITIONS.items():
        assert client_gates[gate_id]["position"] == pytest.approx(
            [server_position["x"], server_position["z"]]
        )


def test_gate_sensors_cross_from_inside_to_outside(gate_contract: dict) -> None:
    arrival_z = gate_contract["arrivalSensorLocalZ"]
    escape_z = gate_contract["escapeSensorLocalZ"]
    assert arrival_z < 0 < escape_z

    for gate in gate_contract["gates"]:
        rotation = gate["rotationY"]
        outward = (math.sin(rotation), math.cos(rotation))
        crossing = (
            outward[0] * (escape_z - arrival_z),
            outward[1] * (escape_z - arrival_z),
        )
        assert crossing[0] * outward[0] + crossing[1] * outward[1] > 0


def test_locked_gate_has_full_height_blocker(gate_contract: dict) -> None:
    half_width, half_height, half_depth = gate_contract["lockedBlockerHalfSize"]
    assert half_width >= 1.15
    assert half_height >= 1.5
    assert 0.1 <= half_depth <= 0.25
