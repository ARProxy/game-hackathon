"""게임 상태 모델 테스트"""

import time

import pytest

from app.game.state import (
    GamePhase,
    GameState,
    MissionClue,
    Player,
    PlayerRole,
    PlayerStatus,
    Position,
)


class TestPlayer:
    def test_initial_state(self):
        p = Player(player_id="p1", role=PlayerRole.HUMAN)
        assert p.status == PlayerStatus.ALIVE
        assert not p.is_frozen
        assert p.frozen_at is None

    def test_freeze(self):
        p = Player(player_id="p1", role=PlayerRole.HUMAN)
        p.freeze()
        assert p.is_frozen
        assert p.status == PlayerStatus.FROZEN
        assert p.frozen_at is not None

    def test_unfreeze(self):
        p = Player(player_id="p1", role=PlayerRole.HUMAN)
        p.freeze()
        p.unfreeze()
        assert not p.is_frozen
        assert p.status == PlayerStatus.ALIVE
        assert p.frozen_at is None

    def test_eliminate(self):
        p = Player(player_id="p1", role=PlayerRole.HUMAN)
        p.eliminate()
        assert p.status == PlayerStatus.ELIMINATED
        assert not p.is_frozen

    def test_escape_is_a_distinct_terminal_runner_status(self):
        p = Player(player_id="p1", role=PlayerRole.AI_PARTNER)
        p.freeze()
        p.escape()
        assert p.status == PlayerStatus.ESCAPED
        assert p.frozen_at is None


class TestGameState:
    @pytest.fixture
    def state(self):
        s = GameState(room_id="test")
        s.add_player("human1", PlayerRole.HUMAN)
        s.add_player("ai1", PlayerRole.AI_PARTNER)
        s.add_player("seeker1", PlayerRole.SEEKER)
        return s

    def test_add_player(self, state):
        assert len(state.players) == 3
        assert state.get_player("human1").role == PlayerRole.HUMAN
        assert state.get_player("seeker1").role == PlayerRole.SEEKER

    def test_get_nonexistent_player(self, state):
        assert state.get_player("nobody") is None

    def test_alive_non_seeker_count(self, state):
        assert state.alive_non_seeker_count() == 2  # human1 + ai1

    def test_alive_count_after_freeze(self, state):
        state.get_player("human1").freeze()
        assert state.alive_non_seeker_count() == 1  # ai1만

    def test_all_frozen_false(self, state):
        assert not state.all_non_seeker_frozen_or_eliminated()

    def test_all_frozen_true(self, state):
        state.get_player("human1").freeze()
        state.get_player("ai1").freeze()
        assert state.all_non_seeker_frozen_or_eliminated()

    def test_all_eliminated_also_counts(self, state):
        state.get_player("human1").eliminate()
        state.get_player("ai1").eliminate()
        assert state.all_non_seeker_frozen_or_eliminated()

    def test_mixed_frozen_eliminated(self, state):
        state.get_player("human1").freeze()
        state.get_player("ai1").eliminate()
        assert state.all_non_seeker_frozen_or_eliminated()

    def test_freeze_timeout_none_expired(self, state):
        state.get_player("human1").freeze()
        assert state.check_freeze_timeout() == []

    def test_freeze_timeout_expired(self, state):
        p = state.get_player("human1")
        p.freeze()
        p.frozen_at = time.time() - 31  # 31초 전에 빙결
        timed_out = state.check_freeze_timeout()
        assert "human1" in timed_out

    def test_to_dict(self, state):
        state.forbidden_words = ["열쇠", "커피"]
        state.phase = GamePhase.PLAYING
        d = state.to_dict()
        assert d["room_id"] == "test"
        assert d["phase"] == "playing"
        assert d["forbidden_words"] == ["열쇠", "커피"]
        assert "human1" in d["players"]
        assert d["players"]["human1"]["role"] == "human"
        assert d["players"]["human1"]["position"] == {
            "x": 0.0,
            "y": 0.0,
            "z": 0.0,
            "floor": "F1",
            "zone": "unknown",
        }

    def test_players_on_different_floors_do_not_share_contact_space(self, state):
        from app.game.progression import WorldFloor

        human = state.get_player("human1")
        ai = state.get_player("ai1")
        human.position.floor = WorldFloor.F2
        ai.position.floor = WorldFloor.F1

        assert not human.shares_floor_with(ai)

    def test_initial_phase_is_lobby(self):
        s = GameState(room_id="new")
        assert s.phase == GamePhase.LOBBY


class TestGameSessionTeamComposition:
    def test_setup_game_adds_required_ai_roles(self):
        from app.game.session import GameSession

        session = GameSession("solo")
        session.state.add_player("human1", PlayerRole.HUMAN)
        session.setup_game(["열쇠"])

        assert session.state.get_player("partner").role == PlayerRole.AI_PARTNER
        assert session.state.get_player("partner-2").role == PlayerRole.AI_PARTNER
        assert session.state.get_player("seeker").role == PlayerRole.SEEKER
        assert session.state.alive_non_seeker_count() == 3
        assert session.state.get_player("partner").position != session.state.get_player("partner-2").position
        assert session.state.get_player("human1").position.z < -25.4
        assert session.state.get_player("partner").position.z < -25.4
        assert session.state.get_player("partner-2").position.z == pytest.approx(-19.7)

    def test_setup_game_is_idempotent_for_ai_roles(self):
        from app.game.session import GameSession

        session = GameSession("solo")
        session.setup_game(["열쇠"])
        session.setup_game(["커피"])

        assert set(session.state.players) == {"partner", "partner-2", "seeker"}

    def test_setup_game_resets_vertical_progression_and_exposes_compatibility_state(self):
        from app.game.session import GameSession

        session = GameSession("solo")
        session.vertical_round.record_human_forbidden_word_violation()
        session.setup_game(["열쇠"])

        progression = session.state_payload()["vertical_progression"]
        assert progression["enabled"] is session.vertical_progression_enabled
        assert progression["phase"] == "rooftop_intro"
        assert progression["active_floor"] == "ROOF"
        assert progression["forbidden_word_violations"] == 0
