import assert from 'node:assert/strict'

import { buildCampus } from '../src/game/campusV4Data.js'

const campus = buildCampus({ seed: 0 })

const expected = {
  solids: 2397,
  visuals: 6606,
  plates: 589,
  cyls: 1387,
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

console.log('Claude Design campus contract verified:', expected)
