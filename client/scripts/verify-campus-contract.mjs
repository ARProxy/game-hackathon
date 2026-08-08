import assert from 'node:assert/strict'

import {
  buildCampus,
  buildContracts,
  CLASSROOM_LAYOUTS,
  DELTA_SLOTS,
  FLOOR_Y,
  GATE_SLOTS,
  MAP_SIZE,
  MISSION_SLOTS,
  PROP_SLOTS,
  REQUIRED_SUITE_EDGES,
  TRAP_SLOTS,
} from '../src/game/campusV4Data.js'
import collisionContract from '../src/game/serverCollisionContract.json' with { type: 'json' }
import gameplayTrapContract from '../src/game/trapContract.json' with { type: 'json' }
import gameplayGateContract from '../src/game/gateContract.json' with { type: 'json' }
import verticalMapContract from '../src/game/verticalMapContract.json' with { type: 'json' }

const campus = buildCampus({ seed: 0 })
const alternate = buildCampus({ seed: 1 })

const expected = {
  solids: 2422,
  visuals: 5675,
  plates: 543,
  cyls: 1331,
  fixtures: 150,
  rooms: 80,
  doors: 127,
}

for (const [key, count] of Object.entries(expected)) {
  assert.equal(
    campus[key].length,
    count,
    `Claude Design seed 0 ${key} count changed`,
  )
}

assert.equal(campus.EVS.length, 2, 'Both Claude Design elevators must remain present')
assert.ok(campus.visuals.some((item) => item.e), 'Interior emissive fixtures are missing')
assert.ok(campus.solids.some((item) => item.ramp), 'Stair ramp geometry is missing')
assert.ok(campus.doors.some((item) => item.kind === 'room'), 'Room doors are missing')

const classrooms = campus.rooms.filter((room) => room.kind === 'classroom')
assert.equal(classrooms.length, 10, 'The school must keep ten standard classrooms')
assert.deepEqual(
  new Set(classrooms.map((room) => room.layoutId)),
  new Set(['rows', 'pods', 'exam', 'horseshoe', 'project']),
  'Five classroom circulation signatures must remain present',
)
for (const layout of new Set(Object.values(CLASSROOM_LAYOUTS))) {
  assert.equal(classrooms.filter((room) => room.layoutId === layout).length, 2, `${layout} must appear once per grade band`)
}
assert.ok(
  classrooms.every((room) => !['collapse', 'breach', 'stacked', 'stripped'].includes(room.cond)),
  'Destructive overlays must not erase classroom layout signatures',
)
assert.ok(classrooms.every((room) => room.cond === 'intact'), 'Classroom baseline QA requires intact rooms')

const roomById = Object.fromEntries(campus.rooms.map((room) => [room.id, room]))
const localVisuals = campus.visuals.filter((item) => item.roomId && item.local)
const localCylinders = campus.cyls.filter((item) => item.roomId && item.local)
const localSolids = campus.solids.filter((item) => item.roomId && item.local)
const localPrimitives = [...localVisuals, ...localCylinders, ...localSolids]
const localToWorld = (room, u, v) => {
  if (room.wing === 'N') return [room.cx - u, room.z1 - v]
  if (room.wing === 'S') return [room.cx + u, room.z0 + v]
  if (room.wing === 'W') return [room.x1 - v, room.cz + u]
  return [room.x0 + v, room.cz - u]
}
const localMetrics = (room, item) => {
  const localWidth = ['N', 'S'].includes(room.wing) ? room.x1 - room.x0 : room.z1 - room.z0
  const localDepth = ['N', 'S'].includes(room.wing) ? room.z1 - room.z0 : room.x1 - room.x0
  if (item.r != null) return { localWidth, localDepth, turn: 0, extentU: item.r, extentV: item.r }
  const baseYaw = room.wing === 'N' ? Math.PI : room.wing === 'S' ? 0 : room.wing === 'W' ? -Math.PI / 2 : Math.PI / 2
  const turn = (item.rot?.[1] ?? 0) - baseYaw
  const extentU = Math.abs(Math.cos(turn)) * item.s[0] / 2 + Math.abs(Math.sin(turn)) * item.s[2] / 2
  const extentV = Math.abs(Math.sin(turn)) * item.s[0] / 2 + Math.abs(Math.cos(turn)) * item.s[2] / 2
  return { localWidth, localDepth, turn, extentU, extentV }
}
for (const item of localPrimitives) {
  const room = roomById[item.roomId]
  assert.ok(room, `Tagged prop references missing room ${item.roomId}`)
  const { localWidth, localDepth, extentU, extentV } = localMetrics(room, item)
  const [expectedX, expectedZ] = localToWorld(room, item.local[0], item.local[1])
  assert.ok(Math.abs(item.p[0] - expectedX) <= 0.001 && Math.abs(item.p[2] - expectedZ) <= 0.001, `${room.id} prop local/world coordinates diverged`)
  if (!item.boundaryCollider) assert.ok(Math.abs(item.local[0]) + extentU <= localWidth / 2 + 0.02, `${room.id} prop escaped room width`)
  assert.ok(item.local[1] - extentV >= -0.02 && item.local[1] + extentV <= localDepth + 0.02, `${room.id} prop escaped room depth`)
  const primitiveHeight = item.s?.[1] ?? item.h
  const floorBottom = item.p[1] - primitiveHeight / 2 - FLOOR_Y[room.floor]
  const floorTop = item.p[1] + primitiveHeight / 2 - FLOOR_Y[room.floor]
  if (item.navRole === 'floor-decal') assert.ok(floorTop <= 0.1, `${room.id} floor-decal is tall enough to block movement`)
  if (item.navRole === 'ceiling-mounted') assert.ok(floorBottom >= 1.8, `${room.id} ceiling-mounted prop hangs into player volume`)
  if (item.navRole === 'wall-mounted') {
    const boundaryGap = Math.min(
      Math.abs(item.local[0] - extentU + localWidth / 2),
      Math.abs(item.local[0] + extentU - localWidth / 2),
      Math.abs(item.local[1] - extentV),
      Math.abs(item.local[1] + extentV - localDepth),
    )
    assert.ok(boundaryGap <= 0.25, `${room.id} wall-mounted prop is not attached to a wall`)
  }
}

const anchorById = Object.fromEntries([...PROP_SLOTS, ...MISSION_SLOTS, ...DELTA_SLOTS]
  .filter((anchor) => anchor.id)
  .map((anchor) => [anchor.id, anchor]))
const anchoredPrimitives = localPrimitives.filter((item) => item.anchorIds)
for (const item of anchoredPrimitives) {
  for (const anchorId of item.anchorIds) {
    const anchor = anchorById[anchorId]
    assert.ok(anchor, `${item.landmarkRole} references missing anchor ${anchorId}`)
    assert.ok(
      Math.abs(anchor.p[0] - item.p[0]) <= 0.001 && Math.abs(anchor.p[1] - item.p[2]) <= 0.001,
      `${anchorId} drifted from ${item.landmarkRole}`,
    )
    if (anchor.surfaceY != null) {
      const top = item.p[1] + item.s[1] / 2
      assert.ok(Math.abs(anchor.surfaceY - top) <= 0.001, `${anchorId} surface height drifted from ${item.landmarkRole}`)
    }
  }
}
const boothGlass = localVisuals.filter((item) => item.roomId === 'f3_broadcast' && ['booth-glass', 'booth-glass-stub'].includes(item.landmarkRole))
const boothColliders = localSolids.filter((item) => item.roomId === 'f3_broadcast' && item.landmarkRole?.includes('booth-glass'))
assert.equal(boothGlass.length, 2, 'Broadcast booth must have a two-piece visual partition')
assert.equal(boothColliders.length, 2, 'Broadcast booth visuals and physical occupancy diverged')
const [leftPanel, rightPanel] = boothGlass.sort((a, b) => a.local[0] - b.local[0])
const boothOpening = (rightPanel.local[0] - rightPanel.s[0] / 2) - (leftPanel.local[0] + leftPanel.s[0] / 2)
assert.ok(Math.abs(boothOpening - 1.1) <= 0.001, `Broadcast booth opening must be 1.10m, got ${boothOpening}`)
const [leftCollider, rightCollider] = boothColliders.sort((a, b) => a.local[0] - b.local[0])
const physicalBoothOpening = (rightCollider.local[0] - rightCollider.s[0] / 2) - (leftCollider.local[0] + leftCollider.s[0] / 2)
assert.ok(Math.abs(physicalBoothOpening - boothOpening) <= 0.001, `Broadcast visual/physical openings diverged: ${boothOpening} vs ${physicalBoothOpening}`)

const doorById = Object.fromEntries(campus.doors.map((door) => [door.id, door]))
const worldToLocal = (room, x, z) => {
  if (room.wing === 'N') return [room.cx - x, room.z1 - z]
  if (room.wing === 'S') return [x - room.cx, z - room.z0]
  if (room.wing === 'W') return [z - room.cz, room.x1 - x]
  return [room.cz - z, x - room.x0]
}
for (const room of campus.rooms.filter((item) => localPrimitives.some((visual) => visual.roomId === item.id))) {
  const cell = campus.cells.find((item) => item.id === room.id)
  assert.ok(cell, `${room.id} cell is missing`)
  const owned = localPrimitives.filter((item) => item.roomId === room.id)
  for (const doorId of cell.links) {
    const door = doorById[doorId]
    assert.ok(door, `${room.id} references missing door ${doorId}`)
    const direction = door.flip ? -1 : 1
    const centerX = door.axis === 'x' ? door.hinge[0] + direction * door.w / 2 : door.fixed
    const centerZ = door.axis === 'x' ? door.fixed : door.hinge[2] + direction * door.w / 2
    const [doorU, doorV] = worldToLocal(room, centerX, centerZ)
    const { localWidth, localDepth } = localMetrics(room, owned[0])
    const sides = [
      { key: 'front', distance: Math.abs(doorV), tangent: doorU, normal: doorV, tangentAxis: 'u' },
      { key: 'back', distance: Math.abs(localDepth - doorV), tangent: doorU, normal: localDepth - doorV, tangentAxis: 'u' },
      { key: 'left', distance: Math.abs(doorU + localWidth / 2), tangent: doorV, normal: doorU + localWidth / 2, tangentAxis: 'v' },
      { key: 'right', distance: Math.abs(localWidth / 2 - doorU), tangent: doorV, normal: localWidth / 2 - doorU, tangentAxis: 'v' },
    ].sort((a, b) => a.distance - b.distance)
    const side = sides[0]
    assert.ok(side.distance <= 0.35, `${doorId} is not on ${room.id} boundary`)
    for (const item of owned) {
      if (item.navRole === 'wall-mounted' || item.navRole === 'ceiling-mounted' || item.navRole === 'floor-decal') continue
      const { extentU, extentV } = localMetrics(room, item)
      const primitiveHeight = item.s?.[1] ?? item.h
      const bottom = item.p[1] - primitiveHeight / 2 - FLOOR_Y[room.floor]
      const top = item.p[1] + primitiveHeight / 2 - FLOOR_Y[room.floor]
      if (bottom > 1.8 || top < 0.05) continue
      const u0 = item.local[0] - extentU, u1 = item.local[0] + extentU
      const v0 = item.local[1] - extentV, v1 = item.local[1] + extentV
      const tangentHalf = door.w / 2 + 0.4
      const tangentOverlaps = side.tangentAxis === 'u'
        ? u1 > side.tangent - tangentHalf && u0 < side.tangent + tangentHalf
        : v1 > side.tangent - tangentHalf && v0 < side.tangent + tangentHalf
      const approachDepth = 1.5 + 0.4
      const inwardOverlaps = side.key === 'front' ? v1 > 0 && v0 < approachDepth
        : side.key === 'back' ? v0 < localDepth && v1 > localDepth - approachDepth
          : side.key === 'left' ? u1 > -localWidth / 2 && u0 < -localWidth / 2 + approachDepth
            : u0 < localWidth / 2 && u1 > localWidth / 2 - approachDepth
      assert.equal(
        tangentOverlaps && inwardOverlaps,
        false,
        `${room.id} prop ${JSON.stringify({ local: item.local, size: item.s ?? [item.r * 2, item.h, item.r * 2], navRole: item.navRole })} blocks actual door approach ${doorId}`,
      )
    }
  }
}

const layoutSignatures = new Map()
for (const room of classrooms) {
  const footprint = localVisuals.filter((item) => item.roomId === room.id).map((item) => {
    const { localWidth, turn, extentU } = localMetrics(room, item)
    const localHeight = item.p[1] - FLOOR_Y[room.floor]
    const entersDoorZone = localHeight < 1.2 && item.local[1] < 1.7 && Math.abs(item.local[0]) + extentU > localWidth / 2 - 1.5
    assert.equal(entersDoorZone, false, `${room.id} low prop intrudes into a door approach`)
    return [item.local.map((value) => +value.toFixed(2)), item.s.map((value) => +value.toFixed(2)), +turn.toFixed(2)]
  }).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  if (!layoutSignatures.has(room.layoutId)) layoutSignatures.set(room.layoutId, JSON.stringify(footprint))
}
assert.equal(new Set(layoutSignatures.values()).size, 5, 'Classroom layout footprints collapsed into duplicate silhouettes')

const conditionCounts = Object.values(campus.conditions).reduce((counts, condition) => {
  counts[condition] = (counts[condition] ?? 0) + 1
  return counts
}, {})
const normalRate = (conditionCounts.intact ?? 0) / Object.keys(campus.conditions).length
assert.ok(normalRate >= 0.7 && normalRate <= 0.8, `Normal school baseline must stay at 70-80%, got ${normalRate}`)
const generatedContracts = buildContracts({ seed: 0 })
const expectedQuota = Object.fromEntries(Object.entries(conditionCounts).filter(([condition]) => condition !== 'intact'))
assert.deepEqual(generatedContracts['terrainContract.json'].quota, expectedQuota, 'Exported terrain quota is stale')
assert.deepEqual(generatedContracts['trapContract.json'].perRound, [4, 5], 'Trap round count drifted from the game rule')

for (const [mainId, prepId] of REQUIRED_SUITE_EDGES) {
  const main = roomById[mainId]
  const prep = roomById[prepId]
  assert.ok(main && prep, `${mainId}/${prepId} suite is missing`)
  assert.equal(main.floor, prep.floor, `${mainId}/${prepId} must stay on the same floor`)
  const xGap = Math.max(0, main.x0 - prep.x1, prep.x0 - main.x1)
  const zGap = Math.max(0, main.z0 - prep.z1, prep.z0 - main.z1)
  assert.ok(Math.max(xGap, zGap) <= 0.25, `${mainId}/${prepId} suite does not share a boundary`)
  const mainLinks = new Set(campus.cells.find((cell) => cell.id === mainId)?.links)
  const prepLinks = new Set(campus.cells.find((cell) => cell.id === prepId)?.links)
  const sharedDoors = [...mainLinks].filter((id) => prepLinks.has(id)).map((id) => doorById[id])
  assert.ok(sharedDoors.some((door) => door?.kind === 'suite' && door.w >= 0.9), `${mainId}/${prepId} lacks a shared suite door`)
}

const alternateById = Object.fromEntries(alternate.rooms.map((room) => [room.id, room]))
for (const room of campus.rooms.filter((item) => ['F2', 'F3'].includes(item.floor))) {
  const other = alternateById[room.id]
  assert.deepEqual([other?.floor, other?.cx, other?.cz], [room.floor, room.cx, room.cz], `${room.id} architecture moved with seed`)
}
const protectedSuiteIds = new Set(REQUIRED_SUITE_EDGES.flat())
for (let seed = 0; seed < 200; seed++) {
  const sample = buildCampus({ seed })
  for (const roomId of protectedSuiteIds) assert.equal(sample.conditions[roomId], 'intact', `${roomId} lost suite grammar at seed ${seed}`)
  const sampleCounts = Object.values(sample.conditions).reduce((counts, condition) => {
    counts[condition] = (counts[condition] ?? 0) + 1
    return counts
  }, {})
  assert.deepEqual(
    Object.fromEntries(Object.entries(sampleCounts).filter(([condition]) => condition !== 'intact')),
    expectedQuota,
    `Seed ${seed} failed the fixed damage quota`,
  )
  assert.notEqual(sample.conditions.f1_staff, 'collapse', `Seed ${seed} removed the required staff phone assembly`)
  assert.notEqual(sample.conditions.f1_admin, 'collapse', `Seed ${seed} removed the required admin cabinet assembly`)
  assert.equal(sample.conditions.f1_principal, 'collapse', `Seed ${seed} moved the authored principal-room collapse`)
  for (const anchorId of ['p_f1_staff_desk', 'p_f1_admin_cab', 'p_f1_counsel_sofa', 'm_f1_admin']) {
    const survives = [...sample.visuals, ...sample.cyls, ...sample.solids]
      .some((item) => item.anchorIds?.includes(anchorId))
    assert.equal(survives, true, `Seed ${seed} deleted essential anchor assembly ${anchorId}`)
  }
}

const structural = (item) => {
  const [x, y, z] = item.s
  if (item.forceCollider) return true
  if (item.hide && item.ramp) return true
  return (y <= 0.75 && x >= 2 && z >= 2) || (y >= 1.75 && (x >= 1.5 || z >= 1.5))
}
const exportedWalls = campus.solids.filter(structural).filter((item) => item.s[1] >= 1.75 || item.forceCollider).map((item) => ({
  floor: item.f,
  center: [item.p[0], item.p[2]],
  size: [item.s[0], item.s[2]],
  rotationY: Array.isArray(item.rot) ? (item.rot[1] ?? 0) : (item.rot?.rot?.[1] ?? 0),
}))
assert.deepEqual(collisionContract.walls, exportedWalls, 'Server collision export is stale')
const utilityRequirements = {
  b1_tank: { roles: ['water-tank', 'tank-manifold'], proxies: { 'water-tank-collider': 2 } },
  b1_mach: { roles: ['pump-skid', 'machine-control'], proxies: { 'pump-skid-collider': 4 } },
  b1_elec: { roles: ['switchgear', 'ups-bank', 'high-voltage'], proxies: { 'switchgear-collider': 4, 'ups-bank-collider': 2 } },
}
const seenUtilityRoles = new Set()
for (const [roomId, requirement] of Object.entries(utilityRequirements)) {
  const owned = localPrimitives.filter((item) => item.roomId === roomId)
  for (const role of requirement.roles) {
    assert.ok(owned.some((item) => item.landmarkRole === role), `${roomId} lost landmark ${role}`)
    assert.equal(seenUtilityRoles.has(role), false, `${role} was reused across the B1 utility triad`)
    seenUtilityRoles.add(role)
  }
  for (const [role, count] of Object.entries(requirement.proxies)) {
    const proxies = localSolids.filter((item) => item.roomId === roomId && item.landmarkRole === role)
    assert.equal(proxies.length, count, `${roomId} proxy count drifted for ${role}`)
    assert.ok(proxies.every(structural), `${roomId} contains a proxy that Rapier would drop`)
  }
  const corridorBlockers = localSolids.filter((item) => item.roomId === roomId && structural(item)).filter((item) => {
    const room = roomById[roomId]
    const { extentU, extentV } = localMetrics(room, item)
    return item.local[0] + extentU > -0.7 && item.local[0] - extentU < 0.7
      && item.local[1] + extentV > 1.9 && item.local[1] - extentV < 6.5
  })
  assert.deepEqual(corridorBlockers, [], `${roomId} blocked the 1.40m central service aisle`)
}
const parityPairs = [
  ['b1_tank', 'water-tank', 'water-tank-collider'],
  ['b1_mach', 'pump-skid', 'pump-skid-collider'],
  ['b1_elec', 'switchgear', 'switchgear-collider'],
  ['b1_elec', 'ups-bank', 'ups-bank-collider'],
]
for (const [roomId, visualRole, colliderRole] of parityPairs) {
  const visualLocations = localPrimitives.filter((item) => item.roomId === roomId && item.landmarkRole === visualRole)
    .map((item) => item.local).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  const colliderLocations = localSolids.filter((item) => item.roomId === roomId && item.landmarkRole === colliderRole)
    .map((item) => item.local).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  assert.deepEqual(colliderLocations, visualLocations, `${roomId} ${visualRole} visual/proxy locations diverged`)
}
const adminRequirements = {
  f1_staff: {
    landmarks: ['staff-phone-desk', 'teacher-pod', 'attendance-board', 'staff-pigeonholes'],
    proxies: { 'staff-phone-desk-collider': 1, 'teacher-pod-collider': 3, 'staff-pigeonholes-collider': 1, 'staff-copier-collider': 1 },
  },
  f1_admin: {
    landmarks: ['admin-service-counter', 'records-cabinet-anchor', 'approval-stamp'],
    proxies: { 'admin-service-counter-collider': 1, 'records-cabinet-collider': 2, 'admin-copier-collider': 1 },
  },
  f1_principal: {
    landmarks: ['principal-desk', 'principal-keybox', 'principal-portrait'],
    proxies: { 'principal-desk-collider': 1 },
  },
  f1_counsel: {
    landmarks: ['counsel-sofa', 'counsel-chair', 'emotion-card-table', 'feeling-board'],
    proxies: { 'counsel-sofa-collider': 1, 'counsel-chair-collider': 1, 'emotion-card-table-collider': 1, 'counsel-books-collider': 1 },
  },
}
for (const [roomId, requirement] of Object.entries(adminRequirements)) {
  const owned = localPrimitives.filter((item) => item.roomId === roomId)
  for (const landmarkRole of requirement.landmarks) {
    assert.ok(owned.some((item) => item.landmarkRole === landmarkRole), `${roomId} lost authored landmark ${landmarkRole}`)
  }
  for (const [colliderRole, count] of Object.entries(requirement.proxies)) {
    const proxies = localSolids.filter((item) => item.roomId === roomId && item.landmarkRole === colliderRole)
    assert.equal(proxies.length, count, `${roomId} collider count drifted for ${colliderRole}`)
    assert.ok(proxies.every((item) => item.forceCollider && structural(item)), `${roomId} ${colliderRole} is not a forced Rapier collider`)
  }
}
const adminParity = [
  ['f1_staff', 'staff-phone-desk', 'staff-phone-desk-collider'],
  ['f1_staff', 'teacher-pod', 'teacher-pod-collider'],
  ['f1_staff', 'staff-pigeonholes', 'staff-pigeonholes-collider'],
  ['f1_staff', 'staff-copier', 'staff-copier-collider'],
  ['f1_admin', 'admin-service-counter', 'admin-service-counter-collider'],
  ['f1_principal', 'principal-desk', 'principal-desk-collider'],
  ['f1_counsel', 'counsel-sofa', 'counsel-sofa-collider'],
  ['f1_counsel', 'counsel-chair', 'counsel-chair-collider'],
  ['f1_counsel', 'emotion-card-table', 'emotion-card-table-collider'],
  ['f1_counsel', 'counsel-books', 'counsel-books-collider'],
]
for (const [roomId, visualRole, colliderRole] of adminParity) {
  const visualLocations = localPrimitives.filter((item) => item.roomId === roomId && item.landmarkRole === visualRole)
    .map((item) => item.local).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  const colliderLocations = localSolids.filter((item) => item.roomId === roomId && item.landmarkRole === colliderRole)
    .map((item) => item.local).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  assert.deepEqual(colliderLocations, visualLocations, `${roomId} ${visualRole} visual/collider centers diverged`)
}
const principalHole = campus.holes.find((hole) => hole.room === 'f1_principal')
const principalDeskCollider = localSolids.find((item) => item.roomId === 'f1_principal' && item.landmarkRole === 'principal-desk-collider')
assert.ok(principalHole && principalDeskCollider, 'Principal collapse safety contract is incomplete')
const deskYaw = principalDeskCollider.rot?.[1] ?? 0
const deskHalfX = (Math.abs(Math.cos(deskYaw)) * principalDeskCollider.s[0] + Math.abs(Math.sin(deskYaw)) * principalDeskCollider.s[2]) / 2
const deskHalfZ = (Math.abs(Math.sin(deskYaw)) * principalDeskCollider.s[0] + Math.abs(Math.cos(deskYaw)) * principalDeskCollider.s[2]) / 2
const deskOverlapsBufferedHole = principalDeskCollider.p[0] + deskHalfX > principalHole.x0 - 0.4
  && principalDeskCollider.p[0] - deskHalfX < principalHole.x1 + 0.4
  && principalDeskCollider.p[2] + deskHalfZ > principalHole.z0 - 0.4
  && principalDeskCollider.p[2] - deskHalfZ < principalHole.z1 + 0.4
assert.equal(deskOverlapsBufferedHole, false, 'Principal desk creates a bridge across the collapse safety buffer')
const staffBreach = campus.leaks.find((leak) => leak.id === 'leak_f1_staff')
assert.ok(staffBreach, 'Seed 0 staff breach portal disappeared')
const staffRoom = roomById.f1_staff
const breachU = staffRoom.cx - staffBreach.p[0]
const breachV = staffRoom.z1 - staffBreach.p[1]
const staffPortalBlockers = localSolids.filter((item) => item.roomId === 'f1_staff' && item.forceCollider).filter((item) => {
  const { extentU, extentV } = localMetrics(staffRoom, item)
  return item.local[0] + extentU > breachU - 0.7 && item.local[0] - extentU < breachU + 0.7
    && item.local[1] + extentV > breachV && item.local[1] - extentV < breachV + 1.9
})
assert.deepEqual(staffPortalBlockers, [], 'Staff furniture blocks the authored breach approach apron')
assert.equal(gameplayTrapContract.activeCount, 5, 'Runtime trap activation count must remain within the 4-5 rule')
assert.equal(new Set(gameplayTrapContract.traps.map((trap) => trap.id)).size, gameplayTrapContract.traps.length, 'Runtime trap ids must be unique')
assert.equal(TRAP_SLOTS.length, gameplayTrapContract.traps.length, 'Generated and runtime trap candidate counts diverged')
assert.deepEqual(
  TRAP_SLOTS.map(({ id, floor, p, kind, risk, note }) => ({ id, floor, x: p[0], z: p[1], kind, risk, note })),
  gameplayTrapContract.traps,
  'Generated and runtime traps no longer share one complete contract',
)
const trapPoints = [
  ...gameplayTrapContract.traps,
  ...generatedContracts['trapContract.json'].traps,
]
for (const trap of trapPoints) {
  assert.ok(Math.abs(trap.x) <= MAP_SIZE / 2 && Math.abs(trap.z) <= MAP_SIZE / 2, `${trap.id} escaped the v4 map`)
  const embedded = collisionContract.walls.some((wall) => wall.floor === trap.floor
    && Math.abs(trap.x - wall.center[0]) < wall.size[0] / 2
    && Math.abs(trap.z - wall.center[1]) < wall.size[1] / 2)
  assert.equal(embedded, false, `${trap.id} is embedded in a v4 structural wall`)
}
assert.deepEqual(generatedContracts['gateContract.json'], gameplayGateContract, 'Generated and runtime gates no longer share one contract')
assert.deepEqual(
  GATE_SLOTS.map(({ id, name, floor, p, rotY }) => ({ id, name, floor, position: p, rotationY: rotY })),
  gameplayGateContract.gates,
  'Rendered and runtime gate slots diverged',
)
for (const gate of gameplayGateContract.gates) {
  const [x, z] = gate.position
  assert.ok(Math.abs(x) <= MAP_SIZE / 2 && Math.abs(z) <= MAP_SIZE / 2, `${gate.id} escaped the v4 map`)
  const embedded = collisionContract.walls.some((wall) => wall.floor === gate.floor
    && Math.abs(x - wall.center[0]) < wall.size[0] / 2
    && Math.abs(z - wall.center[1]) < wall.size[1] / 2)
  assert.equal(embedded, false, `${gate.id} is embedded in a v4 structural wall`)
}
const generatedDeviceById = Object.fromEntries(campus.devices.map((device) => [device.id, device]))
for (const [slotId, slot] of Object.entries(verticalMapContract.slots).filter(([, item]) => item.kind === 'device')) {
  const device = generatedDeviceById[slot.deviceId]
  assert.ok(device, `${slotId} references missing generated device ${slot.deviceId}`)
  assert.equal(slot.anchorRoom, device.room, `${slotId} anchor room diverged from ${slot.deviceId}`)
  assert.equal(slot.floor, device.floor, `${slotId} floor diverged from ${slot.deviceId}`)
  const expectedPosition = [device.p[0], device.y, device.p[1]]
  assert.ok(slot.position.every((value, index) => Math.abs(value - expectedPosition[index]) <= 0.001), `${slotId} position drifted from ${slot.deviceId}`)
}
assert.deepEqual(campus.slots.props.map((slot) => slot.p), PROP_SLOTS.map((slot) => slot.p), 'Prop anchors were moved from their surfaces')
assert.deepEqual(campus.slots.missions.map((slot) => slot.p), MISSION_SLOTS.map((slot) => slot.p), 'Mission anchors were moved from their fixtures')

console.log('Campus architecture contract verified:', { ...expected, normalRate, layouts: classrooms.map((room) => room.layoutId) })
