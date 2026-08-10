import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { COMPACT_SCHOOL, FLOOR_Y } from '../src/game/compactSchoolData.js'

// 서버는 수직 높이보다 평면 점유가 중요한 장벽만 읽는다. 바닥·천장·계단
// 경사로는 Rapier 전용이고, 이 목록은 플레이어/AI의 벽 관통을 막는 정본이다.
const SERVER_BARRIER_ROLES = new Set([
  'wall',
  'window',
  'rail',
  'parapet',
  'equipmentCollider',
  'hvac',
  'furniture',
  'roofEquipment',
  'missionConsole',
  'entryPost',
  'fieldFence',
  'elevatorShaft',
])

const walls = COMPACT_SCHOOL.boxes
  .filter((item) => {
    if (!item.collider || !SERVER_BARRIER_ROLES.has(item.role)) return false
    const floorY = FLOOR_Y[item.f] ?? 0
    const bottom = item.p[1] - item.s[1] / 2 - floorY
    // 문 위 인방처럼 actor 머리보다 높은 벽 조각은 2D 서버 장벽이 아니다.
    return bottom < 1.8
  })
  .map((item) => ({
    floor: item.f,
    center: [item.p[0], item.p[2]],
    size: [item.s[0], item.s[2]],
    rotationY: item.rot?.[1] ?? 0,
    sourceId: item.id,
    role: item.role,
  }))

// 교실 문은 화면의 Rapier 충돌체뿐 아니라 술래의 시야·이동에도 같은 상태로
// 적용한다. 층간 진행용 방화문은 별도 진행 계약이 관리하므로 제외한다.
const dynamicDoors = COMPACT_SCHOOL.doors
  .filter((door) => door.kind === 'room' && !door.permanentlyLocked)
  .map((door) => ({
    id: door.id,
    floor: door.f,
    center: door.axis === 'x'
      ? [door.hinge[0] + door.w / 2, door.hinge[2]]
      : [door.hinge[0], door.hinge[2] + door.w / 2],
    size: door.axis === 'x' ? [door.w, door.t] : [door.t, door.w],
  }))

const output = {
  version: 3,
  source: 'compactSchoolData.js',
  walls,
  dynamicDoors,
  navigationNodes: COMPACT_SCHOOL.navNodes.map((node) => ({
    id: node.id,
    floor: node.floor,
    position: [node.p[0], node.p[2]],
    links: node.links,
  })),
}
const here = dirname(fileURLToPath(import.meta.url))
writeFileSync(resolve(here, '../src/game/serverCollisionContract.json'), `${JSON.stringify(output, null, 2)}\n`)
