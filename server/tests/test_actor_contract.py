"""클라이언트 맵 스폰과 서버 이동 권위의 정적 계약.

v3 레거시 ROLE_SPAWNS가 제거되었으므로, 수직 맵 계약의 actor_spawn_slots를
사용하여 스폰 위치가 유효한지 검증한다.
"""

from app.game.map_slots import actor_spawn_slots


def test_vertical_map_actor_spawns_are_defined() -> None:
    spawns = actor_spawn_slots()
    for actor_id in ("human", "partner", "partner-2"):
        slot = spawns[actor_id]
        assert "position" in slot
        assert len(slot["position"]) == 3
        assert "floor" in slot
