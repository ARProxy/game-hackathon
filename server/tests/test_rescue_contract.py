"""클라이언트 구조 선택 지연이 서버 30초 제한과 양립하는지 검증한다."""

import json
from pathlib import Path

from app.game.state import GameState


CONTRACT_PATH = Path(__file__).parents[2] / "client/src/game/rescueContract.json"


def test_rescue_choice_contract_leaves_timeout_margin() -> None:
    contract = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    delay_seconds = contract["autoDelayMs"] / 1000

    assert contract["requestCode"] == "KeyE"
    assert 2 <= delay_seconds <= 5
    assert delay_seconds < GameState("contract").freeze_timeout_sec / 3
