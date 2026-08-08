import assert from 'node:assert/strict'

import { buildCampus, CLASSROOM_LAYOUTS, FLOOR_Y } from '../src/game/campusV4Data.js'
import collisionContract from '../src/game/serverCollisionContract.json' with { type: 'json' }

const campus = buildCampus({ seed: 0 })
const alternate = buildCampus({ seed: 1 })

const expected = {
  solids: 2377,
  visuals: 5784,
  plates: 550,
  cyls: 1355,
  fixtures: 150,
  rooms: 80,
  doors: 122,
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

const classroomVisuals = campus.visuals.filter((item) => item.roomId && item.local)
const layoutSignatures = new Map()
for (const room of classrooms) {
  const localWidth = ['N', 'S'].includes(room.wing) ? room.x1 - room.x0 : room.z1 - room.z0
  const localDepth = ['N', 'S'].includes(room.wing) ? room.z1 - room.z0 : room.x1 - room.x0
  const baseYaw = room.wing === 'N' ? Math.PI : room.wing === 'S' ? 0 : room.wing === 'W' ? -Math.PI / 2 : Math.PI / 2
  const footprint = classroomVisuals.filter((item) => item.roomId === room.id).map((item) => {
    const turn = (item.rot?.[1] ?? 0) - baseYaw
    const extentU = Math.abs(Math.cos(turn)) * item.s[0] / 2 + Math.abs(Math.sin(turn)) * item.s[2] / 2
    const extentV = Math.abs(Math.sin(turn)) * item.s[0] / 2 + Math.abs(Math.cos(turn)) * item.s[2] / 2
    assert.ok(Math.abs(item.local[0]) + extentU <= localWidth / 2 + 0.02, `${room.id} prop escaped room width`)
    assert.ok(item.local[1] - extentV >= -0.02 && item.local[1] + extentV <= localDepth + 0.02, `${room.id} prop escaped room depth`)
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

const roomById = Object.fromEntries(campus.rooms.map((room) => [room.id, room]))
for (const [mainId, prepId] of [
  ['f2_science', 'f2_sciprep'],
  ['f2_music', 'f2_musicprep'],
  ['f3_broadcast', 'f3_bcprep'],
]) {
  const main = roomById[mainId]
  const prep = roomById[prepId]
  assert.ok(main && prep, `${mainId}/${prepId} suite is missing`)
  assert.equal(main.floor, prep.floor, `${mainId}/${prepId} must stay on the same floor`)
  assert.ok(Math.hypot(main.cx - prep.cx, main.cz - prep.cz) <= 12, `${mainId}/${prepId} suite is too far apart`)
}

const alternateById = Object.fromEntries(alternate.rooms.map((room) => [room.id, room]))
for (const room of campus.rooms.filter((item) => ['F2', 'F3'].includes(item.floor))) {
  const other = alternateById[room.id]
  assert.deepEqual([other?.floor, other?.cx, other?.cz], [room.floor, room.cx, room.cz], `${room.id} architecture moved with seed`)
}

const structural = (item) => {
  const [x, y, z] = item.s
  if (item.hide && item.ramp) return true
  return (y <= 0.75 && x >= 2 && z >= 2) || (y >= 1.75 && (x >= 1.5 || z >= 1.5))
}
const exportedWalls = campus.solids.filter(structural).filter((item) => item.s[1] >= 1.75).map((item) => ({
  floor: item.f,
  center: [item.p[0], item.p[2]],
  size: [item.s[0], item.s[2]],
  rotationY: Array.isArray(item.rot) ? (item.rot[1] ?? 0) : (item.rot?.rot?.[1] ?? 0),
}))
assert.deepEqual(collisionContract.walls, exportedWalls, 'Server collision export is stale')

console.log('Campus architecture contract verified:', { ...expected, normalRate, layouts: classrooms.map((room) => room.layoutId) })
