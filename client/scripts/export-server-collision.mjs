import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { COMPACT_SCHOOL } from '../src/game/compactSchoolData.js'

// 서버는 수직 높이보다 평면 점유가 중요한 장벽만 읽는다. 바닥·천장·계단
// 경사로는 Rapier 전용이고, 이 목록은 플레이어/AI의 벽 관통을 막는 정본이다.
const SERVER_BARRIER_ROLES = new Set([
  'wall',
  'window',
  'rail',
  'parapet',
  'equipmentCollider',
  'hvac',
  'missionConsole',
  'entryPost',
])

const walls = COMPACT_SCHOOL.boxes
  .filter((item) => item.collider && SERVER_BARRIER_ROLES.has(item.role))
  .map((item) => ({
    floor: item.f,
    center: [item.p[0], item.p[2]],
    size: [item.s[0], item.s[2]],
    rotationY: item.rot?.[1] ?? 0,
    sourceId: item.id,
    role: item.role,
  }))

const output = {
  version: 2,
  source: 'compactSchoolData.js',
  walls,
  navigationNodes: COMPACT_SCHOOL.navNodes.map((node) => ({
    id: node.id,
    floor: node.floor,
    position: [node.p[0], node.p[2]],
    links: node.links,
  })),
}
const here = dirname(fileURLToPath(import.meta.url))
writeFileSync(resolve(here, '../src/game/serverCollisionContract.json'), `${JSON.stringify(output, null, 2)}\n`)
