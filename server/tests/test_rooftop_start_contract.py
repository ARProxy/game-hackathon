from app.game.map_slots import actor_spawn_slots, get_map_slot
from app.game.progression import WorldFloor
from app.game.session import GameSession
from app.game.state import PlayerRole


def test_round_starts_all_runners_on_rooftop_contract() -> None:
    session = GameSession("roof-start")
    session.state.add_player("human", PlayerRole.HUMAN)

    session.setup_game(["열쇠", "커피", "빨간"])

    for actor_id in ("human", "partner", "partner-2"):
        actor = session.state.get_player(actor_id)
        slot = actor_spawn_slots()[actor_id]
        assert actor is not None
        assert actor.position.floor == WorldFloor.ROOF
        assert [actor.position.x, actor.position.y, actor.position.z] == slot["position"]


def test_secondary_seeker_uses_dedicated_blocker_spawn() -> None:
    assert actor_spawn_slots()["seeker-2"] is get_map_slot("F1_BLOCKER_SPAWN_ENTRY")
