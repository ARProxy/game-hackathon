import assert from 'node:assert/strict'

import {
  BUILDING_BOUNDS,
  COMPACT_SCHOOL,
  CORRIDOR_WIDTH,
  COURTYARD_BOUNDS,
  FLOOR_HEIGHT,
} from '../src/game/compactSchoolData.js'
import collisionContract from '../src/game/serverCollisionContract.json' with { type: 'json' }
import verticalMapContract from '../src/game/verticalMapContract.json' with { type: 'json' }

const EPSILON = 0.001
const CAPSULE_RADIUS = 0.36
const SERVER_BARRIER_ROLES = new Set([
  'wall', 'window', 'rail', 'parapet', 'equipmentCollider', 'hvac', 'missionConsole', 'entryPost',
])

assert.equal(FLOOR_HEIGHT, 3.6, '층고 계약은 3.6m여야 한다')
assert.equal(CORRIDOR_WIDTH, 4.2, '순환 복도 유효 폭은 4.2m여야 한다')
assert.deepEqual(BUILDING_BOUNDS, { x0: -48, x1: 0, z0: -48, z1: -8 })
assert.deepEqual(COURTYARD_BOUNDS, { x0: -35.8, x1: -12.2, z0: -35.8, z1: -20.2 })
assert.equal(COMPACT_SCHOOL.rooms.length, 24, '3개 실내층에 8개씩 의미 공간이 필요하다')

const allAuthored = [...COMPACT_SCHOOL.boxes, ...COMPACT_SCHOOL.cylinders, ...COMPACT_SCHOOL.doors]
assert.equal(new Set(allAuthored.map((item) => item.id)).size, allAuthored.length, '구조물 ID가 중복되었다')
assert.ok(COMPACT_SCHOOL.boxes.every((item) => typeof item.collider === 'boolean'), '모든 박스가 충돌 여부를 명시해야 한다')
assert.ok(COMPACT_SCHOOL.boxes.filter((item) => item.role === 'rail').every((item) => item.collider && !item.visible), '계단·보이드 난간의 연속 충돌 장벽이 사라졌다')
assert.ok(COMPACT_SCHOOL.boxes.filter((item) => item.role === 'railVisual').every((item) => !item.collider && item.visible), '난간 장식과 충돌 프록시가 섞였다')
assert.equal(COMPACT_SCHOOL.boxes.filter((item) => item.role === 'stairRamp').length, 12, '두 코어 × 세 층 × 두 경사로가 필요하다')
assert.equal(COMPACT_SCHOOL.boxes.filter((item) => item.role === 'parapet').length, 8, '옥상 외곽과 중정에 연속 파라펫이 필요하다')

const doorById = Object.fromEntries(COMPACT_SCHOOL.doors.map((door) => [door.id, door]))
for (const id of ['roof_to_f3', 'roof_se_locked', 'stair_nw_F3', 'stair_se_F3', 'stair_nw_F2', 'stair_se_F2', 'main_entry']) {
  assert.ok(doorById[id], `수직 동선 문 ${id}가 없다`)
}
assert.equal(doorById.roof_to_f3.unlockFloor, 'F3', '옥상 방화문은 3층 단계가 열릴 때만 개방되어야 한다')
assert.equal(doorById.roof_se_locked.permanentlyLocked, true, '옥상 보조 코어는 첫 수직 슬라이스에서 우회로가 되면 안 된다')
assert.ok(COMPACT_SCHOOL.doors.every((door) => door.w >= 0.97), '캐릭터 캡슐보다 좁은 문이 있다')

const pointInsideBoxXZ = (x, z, box, padding = 0) => {
  const yaw = box.rot?.[1] ?? 0
  const halfX = (Math.abs(Math.cos(yaw)) * box.s[0] + Math.abs(Math.sin(yaw)) * box.s[2]) / 2 + padding
  const halfZ = (Math.abs(Math.sin(yaw)) * box.s[0] + Math.abs(Math.cos(yaw)) * box.s[2]) / 2 + padding
  return Math.abs(x - box.p[0]) < halfX - EPSILON && Math.abs(z - box.p[2]) < halfZ - EPSILON
}

const slabAt = (floor, x, z) => COMPACT_SCHOOL.boxes.some((item) => (
  item.f === floor && item.role === 'slab' && pointInsideBoxXZ(x, z, item)
))
for (const floor of ['F1', 'F2', 'F3', 'ROOF']) {
  for (const node of COMPACT_SCHOOL.navNodes.filter((item) => item.floor === floor)) {
    assert.ok(slabAt(floor, node.p[0], node.p[2]), `${node.id} 아래에 바닥이 없다`)
    const blocker = COMPACT_SCHOOL.boxes.find((item) => (
      item.f === floor && item.collider && SERVER_BARRIER_ROLES.has(item.role)
      && pointInsideBoxXZ(node.p[0], node.p[2], item, CAPSULE_RADIUS)
    ))
    assert.equal(blocker, undefined, `${node.id}가 ${blocker?.id ?? '장벽'}의 캡슐 여유 폭을 침범한다`)
  }
}
for (const floor of ['F2', 'F3', 'ROOF']) {
  assert.equal(slabAt(floor, -36, -44), false, `${floor} 북서 계단 보이드가 슬래브에 막혔다`)
  assert.equal(slabAt(floor, -12, -12), false, `${floor} 남동 계단 보이드가 슬래브에 막혔다`)
}
assert.equal(slabAt('ROOF', -24, -28), false, 'ㅁ자 건물의 중앙 중정이 지붕으로 덮였다')

const slots = verticalMapContract.slots
const missionConsole = COMPACT_SCHOOL.boxes.find((item) => item.id === 'roof_signal_center')
assert.ok(missionConsole, '옥상 중앙 신호 콘솔이 없다')
assert.deepEqual(
  [missionConsole.p[0], missionConsole.p[2]],
  [slots.ROOF_INTRO_MISSION.position[0], slots.ROOF_INTRO_MISSION.position[2]],
  '옥상 미션 좌표와 실제 콘솔이 어긋났다',
)
for (const [slotId, consoleId] of [
  ['ROOF_SIGNAL_CENTER', 'roof_signal_center'],
  ['ROOF_SIGNAL_EAST', 'roof_signal_east'],
  ['ROOF_SIGNAL_WEST', 'roof_signal_west'],
]) {
  const console = COMPACT_SCHOOL.boxes.find((item) => item.id === consoleId)
  assert.ok(
    console?.p.every((value, index) => Math.abs(value - slots[slotId].position[index]) <= EPSILON),
    `${slotId} 장치 좌표와 실제 콘솔이 어긋났다`,
  )
  assert.equal(slots[slotId].interactionPosition[1], 10.8, `${slotId} 상호작용 지점이 옥상 바닥에서 떴다`)
}
for (const suffix of ['A', 'B', 'C']) {
  const slot = slots[`ROOF_RUNNER_SPAWN_${suffix}`]
  assert.ok(slabAt('ROOF', slot.position[0], slot.position[2]), `${suffix} 스폰 아래에 옥상 슬래브가 없다`)
  const blocker = COMPACT_SCHOOL.boxes.find((item) => (
    item.f === 'ROOF' && item.collider && SERVER_BARRIER_ROLES.has(item.role)
    && pointInsideBoxXZ(slot.position[0], slot.position[2], item, CAPSULE_RADIUS)
  ))
  assert.equal(blocker, undefined, `${suffix} 스폰이 ${blocker?.id ?? '옥상 장벽'}과 겹친다`)
}

const exportedWalls = COMPACT_SCHOOL.boxes
  .filter((item) => item.collider && SERVER_BARRIER_ROLES.has(item.role))
  .map((item) => ({
    floor: item.f,
    center: [item.p[0], item.p[2]],
    size: [item.s[0], item.s[2]],
    rotationY: item.rot?.[1] ?? 0,
    sourceId: item.id,
    role: item.role,
  }))
assert.equal(collisionContract.source, 'compactSchoolData.js')
assert.deepEqual(collisionContract.walls, exportedWalls, '서버 충돌 계약이 클라이언트 골조와 다르다')
assert.equal(new Set(collisionContract.walls.map((wall) => wall.sourceId)).size, collisionContract.walls.length, '서버 장벽 ID가 중복되었다')
assert.deepEqual(
  collisionContract.navigationNodes,
  COMPACT_SCHOOL.navNodes.map((node) => ({
    id: node.id,
    floor: node.floor,
    position: [node.p[0], node.p[2]],
    links: node.links,
  })),
  '서버 AI 순찰 노드가 렌더러의 순환 복도와 다르다',
)

console.log('Compact school contract verified:', {
  boxes: COMPACT_SCHOOL.boxes.length,
  cylinders: COMPACT_SCHOOL.cylinders.length,
  doors: COMPACT_SCHOOL.doors.length,
  rooms: COMPACT_SCHOOL.rooms.length,
  navigationNodes: COMPACT_SCHOOL.navNodes.length,
  serverWalls: collisionContract.walls.length,
})
