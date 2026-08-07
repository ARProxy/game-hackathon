import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { buildCampus } from '../src/game/campusV4Data.js'

const structural = (item) => {
  const [x, y, z] = item.s
  if (item.hide && item.ramp) return true
  return (y <= 0.75 && x >= 2 && z >= 2) || (y >= 1.75 && (x >= 1.5 || z >= 1.5))
}

const campus = buildCampus({ seed: 0 })
const walls = campus.solids
  .filter(structural)
  .filter((item) => item.s[1] >= 1.75)
  .map((item) => ({
    floor: item.f,
    center: [item.p[0], item.p[2]],
    size: [item.s[0], item.s[2]],
    rotationY: Array.isArray(item.rot) ? (item.rot[1] ?? 0) : (item.rot?.rot?.[1] ?? 0),
  }))

const output = {
  version: 1,
  source: 'campusV4Data.js',
  sourceSeed: 0,
  walls,
}
const here = dirname(fileURLToPath(import.meta.url))
writeFileSync(resolve(here, '../src/game/serverCollisionContract.json'), `${JSON.stringify(output, null, 2)}\n`)
