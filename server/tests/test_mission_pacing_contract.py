"""AI 조사 피드백이 무반응처럼 보이지 않는 범위인지 검증한다."""

import json
from pathlib import Path


CONTRACT_PATH = Path(__file__).parents[2] / "client/src/game/missionPacingContract.json"


def test_inspection_feedback_has_a_visible_but_short_duration() -> None:
    contract = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))

    assert 1_000 <= contract["inspectionDurationMs"] <= 3_000
