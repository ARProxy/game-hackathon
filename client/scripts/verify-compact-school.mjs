import assert from 'node:assert/strict'

import {
  BUILDING_BOUNDS,
  COMPACT_SCHOOL,
  CORRIDOR_WIDTH,
  COURTYARD_BOUNDS,
  FLOOR_HEIGHT,
  FLOOR_Y,
} from '../src/game/compactSchoolData.js'
import collisionContract from '../src/game/serverCollisionContract.json' with { type: 'json' }
import verticalMapContract from '../src/game/verticalMapContract.json' with { type: 'json' }

const EPSILON = 0.001
const CAPSULE_RADIUS = 0.36
const SERVER_BARRIER_ROLES = new Set([
  'wall', 'window', 'rail', 'parapet', 'equipmentCollider', 'hvac', 'furniture',
  'roofEquipment', 'missionConsole', 'entryPost',
  'fieldFence',
])
const isServerBarrier = (item) => {
  if (!item.collider || !SERVER_BARRIER_ROLES.has(item.role)) return false
  const floorY = FLOOR_Y[item.f] ?? 0
  return item.p[1] - item.s[1] / 2 - floorY < 1.8
}

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
assert.ok(COMPACT_SCHOOL.boxes.filter((item) => item.role === 'stairRamp').every((item) => item.s[0] >= 3), '계단 유효 폭은 3m 이상이어야 한다')
assert.equal(COMPACT_SCHOOL.boxes.filter((item) => item.role === 'stairMass').length, 96, '모든 계단 디딤판 아래가 실제 덩어리로 채워져야 한다')
assert.equal(COMPACT_SCHOOL.boxes.filter((item) => item.role === 'stairStringer').length, 24, '모든 계단 경사로 양쪽에 구조 거더가 필요하다')
assert.equal(COMPACT_SCHOOL.boxes.filter((item) => item.role === 'parapet').length, 8, '옥상 외곽과 중정에 연속 파라펫이 필요하다')
assert.equal(COMPACT_SCHOOL.boxes.filter((item) => item.role === 'roomFinish').length, 24, '모든 의미 공간은 용도별 바닥 마감이 필요하다')
assert.ok(
  COMPACT_SCHOOL.boxes.filter((item) => item.role === 'roomFinish').every((item) => (
    item.p[1] - item.s[1] / 2 - FLOOR_Y[item.f] >= 0.025
  )),
  '방 바닥 마감은 슬래브와 깊이 충돌하지 않도록 2.5cm 이상 분리해야 한다',
)
for (const door of COMPACT_SCHOOL.doors) {
  const frameParts = COMPACT_SCHOOL.boxes.filter((item) => item.id.startsWith(`${door.id}_frame_`))
  assert.equal(frameParts.length, 3, `${door.id} 문틀은 좌우 문선과 상부 인방 세 조각이어야 한다`)
  assert.ok(frameParts.every((item) => item.role === 'doorFrame' && !item.collider), `${door.id} 문틀의 렌더 계약이 잘못됐다`)
}
assert.ok(COMPACT_SCHOOL.boxes.filter((item) => item.role === 'furniture').length >= 100, '축소 맵에서 실내 구조 밀도가 다시 빠졌다')
assert.ok(COMPACT_SCHOOL.boxes.filter((item) => item.role === 'roofEquipment').length >= 11, '옥상이 비어 보이지 않도록 설비 구조가 필요하다')
for (const room of COMPACT_SCHOOL.rooms) {
  assert.ok(
    COMPACT_SCHOOL.boxes.some((item) => item.f === room.floor && item.role === 'furniture' && item.id.startsWith(`${room.id}_`)),
    `${room.name}에 용도를 읽을 수 있는 가구가 없다`,
  )
}
for (const floor of ['F1', 'F2', 'F3']) {
  for (const core of ['nw', 'se']) {
    for (const suffix of [
      'lower_outer_guard', 'lower_inner_guard', 'upper_inner_guard', 'upper_outer_guard',
      'mid_landing_guard', 'level_gap_guard',
    ]) {
      const guard = COMPACT_SCHOOL.boxes.find((item) => item.id === `stair_${core}_${floor}_${suffix}`)
      assert.ok(guard?.collider && guard.role === 'rail' && !guard.visible, `${core} ${floor} 계단의 ${suffix} 연속 난간이 없다`)
    }
  }
}

const doorById = Object.fromEntries(COMPACT_SCHOOL.doors.map((door) => [door.id, door]))
const slots = verticalMapContract.slots
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
const walkableSurfaceAt = (floor, x, z) => floor === 'FIELD'
  ? COMPACT_SCHOOL.boxes.some((item) => item.f === 'OUT' && item.role === 'fieldGround' && pointInsideBoxXZ(x, z, item))
  : slabAt(floor, x, z)

const SUPPORT_ROLES = new Set(['slab', 'landing', 'stairRamp'])
const supportsFootPoint = ([x, y, z], box) => {
  if (!box.collider || !SUPPORT_ROLES.has(box.role)) return false
  const angleX = box.rot?.[0] ?? 0
  const dx = x - box.p[0]
  const dy = y - box.p[1]
  const dz = z - box.p[2]
  const localY = Math.cos(angleX) * dy + Math.sin(angleX) * dz
  const localZ = -Math.sin(angleX) * dy + Math.cos(angleX) * dz
  return Math.abs(dx) <= box.s[0] / 2 + 0.025
    && Math.abs(localZ) <= box.s[2] / 2 + 0.025
    && Math.abs(localY - box.s[1] / 2) <= 0.045
}

const assertContinuouslySupported = (path, label) => {
  let sampleCount = 0
  for (let index = 1; index < path.length; index++) {
    const from = path[index - 1]
    const to = path[index]
    const distance = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2])
    const steps = Math.max(1, Math.ceil(distance / 0.12))
    for (let step = 0; step <= steps; step++) {
      const t = step / steps
      const point = from.map((value, axis) => value + (to[axis] - value) * t)
      const support = COMPACT_SCHOOL.boxes.find((box) => supportsFootPoint(point, box))
      assert.ok(support, `${label} ${index - 1}→${index} 구간의 [${point.map((value) => value.toFixed(2)).join(', ')}] 아래 지지 구조가 없다`)
      sampleCount += 1
    }
  }
  assert.ok(sampleCount >= 100, `${label} 연속 지지 검사가 지나치게 성겼다`)
}

const roofLevelLanding = COMPACT_SCHOOL.boxes.find((item) => item.id === 'stair_nw_F3_level_landing')
assert.ok(roofLevelLanding, '옥상 방화문과 북서 계단을 잇는 층계참이 없다')
assert.ok(pointInsideBoxXZ(-36, -40.4, roofLevelLanding), '옥상 층계참이 방화문 정면을 받치지 않는다')
assert.ok(pointInsideBoxXZ(-33.65, -40.4, roofLevelLanding), '옥상 층계참이 하강 레인까지 이어지지 않는다')
assert.equal(roofLevelLanding.p[1] + roofLevelLanding.s[1] / 2, FLOOR_Y.ROOF, '옥상 층계참 높이가 옥상 바닥과 어긋났다')
assertContinuouslySupported(
  verticalMapContract.paths.ROOF_F3_STAIRS.doorToDoorDown,
  '옥상 방화문→3층 방화문 실보행선',
)

for (const floor of ['F1', 'F2', 'F3', 'ROOF', 'B1', 'FIELD']) {
  for (const node of COMPACT_SCHOOL.navNodes.filter((item) => item.floor === floor)) {
    assert.ok(walkableSurfaceAt(floor, node.p[0], node.p[2]), `${node.id} 아래에 바닥이 없다`)
    const blocker = COMPACT_SCHOOL.boxes.find((item) => (
      item.f === floor && isServerBarrier(item)
      && pointInsideBoxXZ(node.p[0], node.p[2], item, CAPSULE_RADIUS)
    ))
    assert.equal(blocker, undefined, `${node.id}가 ${blocker?.id ?? '장벽'}의 캡슐 여유 폭을 침범한다`)
  }
}
for (const id of ['b1_partition_1', 'b1_partition_2', 'b1_partition_3']) {
  assert.ok(doorById[id], `지하 설비실을 연결하는 문 ${id}가 없다`)
}
for (const id of ['b1_device_valve', 'b1_device_panel', 'b1_device_generator']) {
  assert.ok(COMPACT_SCHOOL.boxes.some((item) => item.id === id), `지하 파이널 설비 ${id}가 없다`)
}
for (const [slotId, stationId] of [
  ['FIELD_FINAL_STATION_A', 'field_station_a'],
  ['FIELD_FINAL_STATION_B', 'field_station_b'],
  ['FIELD_FINAL_STATION_C', 'field_station_c'],
]) {
  const station = COMPACT_SCHOOL.boxes.find((item) => item.id === stationId)
  assert.deepEqual([station?.p[0], station?.p[2]], [slots[slotId].position[0], slots[slotId].position[2]], `${slotId}와 실제 운동장 장치가 어긋났다`)
}
for (const floor of ['F2', 'F3', 'ROOF']) {
  assert.equal(slabAt(floor, -36, -44), false, `${floor} 북서 계단 보이드가 슬래브에 막혔다`)
  assert.equal(slabAt(floor, -12, -12), false, `${floor} 남동 계단 보이드가 슬래브에 막혔다`)
}
assert.equal(slabAt('ROOF', -24, -28), false, 'ㅁ자 건물의 중앙 중정이 지붕으로 덮였다')

const missionConsole = COMPACT_SCHOOL.boxes.find((item) => item.id === 'roof_signal_center')
assert.ok(missionConsole, '옥상 중앙 신호 콘솔이 없다')
assert.deepEqual(
  [slots.ROOF_SIGNAL_CENTER.interactionPosition[0], slots.ROOF_SIGNAL_CENTER.interactionPosition[2]],
  [slots.ROOF_INTRO_MISSION.position[0], slots.ROOF_INTRO_MISSION.position[2]],
  '옥상 시작 미션 좌표와 중앙 콘솔 안전 조작 지점이 어긋났다',
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
  if (slots[slotId].approachPosition) {
    const [approachX, approachY, approachZ] = slots[slotId].approachPosition
    assert.equal(approachY, 10.8, `${slotId} AI 접근 지점이 옥상 바닥에서 떴다`)
    assert.ok(slabAt('ROOF', approachX, approachZ), `${slotId} AI 접근 지점 아래에 옥상 슬래브가 없다`)
    const blocker = COMPACT_SCHOOL.boxes.find((item) => (
      item.f === 'ROOF' && isServerBarrier(item)
      && pointInsideBoxXZ(approachX, approachZ, item, CAPSULE_RADIUS + 0.12)
    ))
    assert.equal(blocker, undefined, `${slotId} AI 접근 지점이 ${blocker?.id ?? '장벽'}과 겹친다`)
    assert.ok(
      Math.hypot(
        approachX - slots[slotId].interactionPosition[0],
        approachZ - slots[slotId].interactionPosition[2],
      ) <= 2.4,
      `${slotId} AI 접근 지점이 상호작용 반경을 벗어났다`,
    )
  }
}

const assertClearRoofRoute = (points, label) => {
  for (let index = 1; index < points.length; index++) {
    const [fromX, fromZ] = points[index - 1]
    const [toX, toZ] = points[index]
    const steps = Math.max(1, Math.ceil(Math.hypot(toX - fromX, toZ - fromZ) / 0.25))
    for (let step = 0; step <= steps; step++) {
      const t = step / steps
      const x = fromX + (toX - fromX) * t
      const z = fromZ + (toZ - fromZ) * t
      assert.ok(slabAt('ROOF', x, z), `${label} [${x.toFixed(2)}, ${z.toFixed(2)}] 아래 옥상 바닥이 없다`)
      const blocker = COMPACT_SCHOOL.boxes.find((item) => (
        item.f === 'ROOF' && isServerBarrier(item)
        && pointInsideBoxXZ(x, z, item, CAPSULE_RADIUS + 0.12)
      ))
      assert.equal(blocker, undefined, `${label}가 ${blocker?.id ?? '장벽'}에 막혔다`)
    }
  }
}

assertClearRoofRoute([[-24, -37.4], [-24, -37.75]], '중앙 스폰→중앙 신호')
assertClearRoofRoute([[-24, -37.75], [-38, -37.75], [-38, -27.8], [-41.1, -27.8]], '중앙→서쪽 신호')
assertClearRoofRoute([[-24, -37.75], [-10, -37.75], [-10, -27.8], [-6.9, -27.8]], '중앙→동쪽 신호')
assertClearRoofRoute([[-41.1, -27.8], [-38, -27.8], [-38, -37.75], [-36, -37.75], [-36, -39.7]], '서쪽 신호→옥상 계단문')
const broadcastConsole = COMPACT_SCHOOL.boxes.find((item) => item.id === 'f3_broadcast_console')
assert.ok(broadcastConsole, '3층 방송실 물리 콘솔이 없다')
assert.equal(broadcastConsole.role, 'missionConsole', '방송 콘솔이 서버 장벽 계약에서 빠졌다')
assert.deepEqual(
  [broadcastConsole.p[0], broadcastConsole.p[2]],
  [slots.F3_BROADCAST_CONSOLE.position[0], slots.F3_BROADCAST_CONSOLE.position[2]],
  '3층 방송 미션 좌표와 물리 콘솔이 어긋났다',
)
assert.ok(COMPACT_SCHOOL.boxes.some((item) => item.id === 'f3_broadcast_on_air' && item.emissive), '방송실 ON AIR 표지가 없다')
assert.ok(COMPACT_SCHOOL.cylinders.some((item) => item.id === 'f3_broadcast_microphone'), '방송실 마이크가 없다')
assert.equal(slots.F3_BROADCAST_CONSOLE.interactionPosition[1], 7.2, '방송 콘솔 상호작용 지점이 3층 바닥에서 떴다')
for (const suffix of ['A', 'B', 'C']) {
  const slot = slots[`ROOF_RUNNER_SPAWN_${suffix}`]
  assert.ok(slabAt('ROOF', slot.position[0], slot.position[2]), `${suffix} 스폰 아래에 옥상 슬래브가 없다`)
  const blocker = COMPACT_SCHOOL.boxes.find((item) => (
    item.f === 'ROOF' && isServerBarrier(item)
    && pointInsideBoxXZ(slot.position[0], slot.position[2], item, CAPSULE_RADIUS)
  ))
  assert.equal(blocker, undefined, `${suffix} 스폰이 ${blocker?.id ?? '옥상 장벽'}과 겹친다`)
}

const exportedWalls = COMPACT_SCHOOL.boxes
  .filter(isServerBarrier)
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
