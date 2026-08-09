/**
 * compactSchoolData.js — 수직 하강형 게임을 위한 단일 건물 구조 계약.
 *
 * 좌표, 시각물, Rapier 충돌과 서버 collision export가 모두 이 데이터에서
 * 파생된다. 구조 역할을 크기로 추측하지 않는다.
 */
import { PAL, TONE } from './campusV4Data.js'

export const FLOOR_HEIGHT = 3.6
export const FLOOR_Y = { OUT: 0, FIELD: 0, B1: -3.6, F1: 0, F2: 3.6, F3: 7.2, ROOF: 10.8 }
export const FLOOR_ORDER = ['B1', 'F1', 'F2', 'F3', 'ROOF']

export const BUILDING_BOUNDS = { x0: -48, x1: 0, z0: -48, z1: -8 }
export const COURTYARD_BOUNDS = { x0: -35.8, x1: -12.2, z0: -35.8, z1: -20.2 }
export const CORRIDOR_WIDTH = 4.2
export const WALL_HEIGHT = 3.2
export const WALL_THICKNESS = 0.22
export const SLAB_THICKNESS = 0.3

// 현재 compact 학교의 북측 복도에 직접 열린 실제 승강로. 이 좌표는
// 렌더·충돌·서버 권위·AI 경로가 함께 사용하는 단일 계약이다.
export const COMPACT_ELEVATORS = [
  { id: 'evp', name: '승객용 승강기', x: [-13.2, -10.8], z: [-43.15, -40.25], roof: true, servedFloors: ['B1', 'F1', 'F2', 'F3', 'ROOF'] },
  { id: 'evc', name: '화물용 승강기', x: [-21.25, -18.75], z: [-43.25, -40.25], roof: false, servedFloors: ['B1', 'F1', 'F2', 'F3'] },
]

export const COMPACT_PALETTE = {
  ...PAL,
  roofMembrane: '#737b80',
  roofJoint: '#5f686e',
  stairTread: '#737b80',
  stairRiser: '#5b646a',
  safetyGreen: '#6dcf92',
  safetyRed: '#d04d4d',
  courtyardTile: '#777f79',
  darkGlass: '#5f8190',
  signBlue: '#3f607d',
  concreteLight: '#a7a39a',
}

const FY = FLOOR_Y
const B = BUILDING_BOUNDS
const C = COURTYARD_BOUNDS
const boxes = []
const cylinders = []
const doors = []
const fixtures = []
const rooms = []
const navNodes = []

let serial = 0
const nextId = (prefix) => `${prefix}_${serial++}`

function addBox({ id = nextId('box'), floor, p, s, material, role, collider = true, visible = true, rot }) {
  boxes.push({ id, f: floor, p, s, material, c: COMPACT_PALETTE[material] || material, role, collider, visible, rot })
}

function addCylinder({ id = nextId('cyl'), floor, p, r, h, material, role, collider = false, visible = true, rot }) {
  cylinders.push({ id, f: floor, p, r, h, material, c: COMPACT_PALETTE[material] || material, role, collider, visible, rot })
}

function addFixture(floor, p, tone = 'cool') {
  fixtures.push({ id: nextId('fixture'), f: floor, p, c: TONE[tone], tone })
}

function addWallSlice(floor, axis, fixed, start, end, bottom, height, material, role = 'wall', thickness = WALL_THICKNESS) {
  if (end - start < 0.03 || height < 0.03) return
  const y = FY[floor] + bottom + height / 2
  addBox({
    floor,
    p: axis === 'x' ? [(start + end) / 2, y, fixed] : [fixed, y, (start + end) / 2],
    s: axis === 'x' ? [end - start, height, thickness] : [thickness, height, end - start],
    material,
    role,
  })
}

function addFullWallSegment(floor, axis, fixed, start, end, opt = {}) {
  const baseHeight = opt.baseHeight ?? 0.9
  const height = opt.height ?? WALL_HEIGHT
  addWallSlice(floor, axis, fixed, start, end, 0, Math.min(baseHeight, height), opt.lower ?? 'corrBase', opt.role ?? 'wall', opt.thickness)
  if (height > baseHeight) addWallSlice(floor, axis, fixed, start, end, baseHeight, height - baseHeight, opt.upper ?? 'corrWall', opt.role ?? 'wall', opt.thickness)
}

/** opening: { center, width, type:'door'|'window', sill?, head?, id?, kind?, unlockFloor?, unlockFloors? } */
function addWallRun(floor, axis, fixed, start, end, openings = [], opt = {}) {
  const sorted = openings.slice().sort((a, b) => a.center - b.center)
  let cursor = start
  for (const opening of sorted) {
    const o0 = opening.center - opening.width / 2
    const o1 = opening.center + opening.width / 2
    addFullWallSegment(floor, axis, fixed, cursor, o0, opt)
    const head = opening.head ?? (opening.type === 'window' ? 2.55 : 2.25)
    const sill = opening.sill ?? (opening.type === 'window' ? 0.9 : 0)
    if (sill > 0) addWallSlice(floor, axis, fixed, o0, o1, 0, sill, opt.lower ?? 'corrBase', 'wall', opt.thickness)
    if (head < (opt.height ?? WALL_HEIGHT)) {
      addWallSlice(floor, axis, fixed, o0, o1, head, (opt.height ?? WALL_HEIGHT) - head, opt.upper ?? 'corrWall', 'wall', opt.thickness)
    }
    if (opening.type === 'window') {
      const glassThickness = 0.08
      addWallSlice(floor, axis, fixed, o0 + 0.08, o1 - 0.08, sill + 0.05, head - sill - 0.1, opt.glass ?? 'darkGlass', 'window', glassThickness)
      const frameMaterial = opt.frame ?? 'mullion'
      for (const edge of [o0, o1]) {
        addWallSlice(floor, axis, fixed, edge - 0.035, edge + 0.035, sill, head - sill, frameMaterial, 'trim', (opt.thickness ?? WALL_THICKNESS) + 0.04)
        boxes[boxes.length - 1].collider = false
      }
      const mid = (o0 + o1) / 2
      addWallSlice(floor, axis, fixed, mid - 0.025, mid + 0.025, sill, head - sill, frameMaterial, 'trim', (opt.thickness ?? WALL_THICKNESS) + 0.04)
      boxes[boxes.length - 1].collider = false
    } else if (opening.kind !== 'elevator') {
      addDoor({
        id: opening.id,
        floor,
        axis,
        fixed,
        center: opening.center,
        width: opening.width - 0.08,
        height: head - 0.04,
        kind: opening.kind ?? 'room',
        unlockFloor: opening.unlockFloor,
        unlockFloors: opening.unlockFloors,
        permanentlyLocked: opening.permanentlyLocked,
        swing: opening.swing ?? 1,
        material: opening.material,
      })
    }
    cursor = o1
  }
  addFullWallSegment(floor, axis, fixed, cursor, end, opt)
}

function addDoor({ id = nextId('door'), floor, axis, fixed, center, width = 1.05, height = 2.18, kind = 'room', unlockFloor, unlockFloors, permanentlyLocked = false, swing = 1, material = 'door' }) {
  const hinge = axis === 'x'
    ? [center - width / 2, FY[floor], fixed]
    : [fixed, FY[floor], center - width / 2]
  doors.push({
    id,
    f: floor,
    axis,
    fixed,
    hinge,
    w: width,
    h: height,
    t: kind === 'fire' ? 0.12 : 0.08,
    swing,
    kind,
    unlockFloor,
    unlockFloors,
    permanentlyLocked,
    material,
    c: COMPACT_PALETTE[material] || material,
  })
  // 문틀은 출입구 전체를 덮는 회색 판이 아니라 좌우 문선과 상부 인방으로
  // 구성한다. 하나의 큰 박스는 문짝과 같은 평면을 점유해 깜빡임을 만들고
  // 열린 문 너머도 회색 면으로 가리는 잘못된 구조였다.
  const frameDepth = kind === 'fire' ? 0.16 : 0.12
  const jambWidth = 0.1
  const jambOffset = width / 2 + jambWidth / 2
  const jambY = FY[floor] + height / 2
  const headerY = FY[floor] + height + 0.07
  for (const [suffix, offset] of [['left', -jambOffset], ['right', jambOffset]]) {
    addBox({
      id: `${id}_frame_${suffix}`, floor,
      p: axis === 'x' ? [center + offset, jambY, fixed] : [fixed, jambY, center + offset],
      s: axis === 'x' ? [jambWidth, height + 0.14, frameDepth] : [frameDepth, height + 0.14, jambWidth],
      material: 'doorFrame', role: 'doorFrame', collider: false,
    })
  }
  addBox({
    id: `${id}_frame_header`, floor,
    p: axis === 'x' ? [center, headerY, fixed] : [fixed, headerY, center],
    s: axis === 'x' ? [width + jambWidth * 2, 0.14, frameDepth] : [frameDepth, 0.14, width + jambWidth * 2],
    material: 'doorFrame', role: 'doorFrame', collider: false,
  })
}

function subtractRect(rect, holes) {
  let parts = [rect]
  for (const h of holes) {
    const next = []
    for (const p of parts) {
      const x0 = Math.max(p.x0, h.x0), x1 = Math.min(p.x1, h.x1)
      const z0 = Math.max(p.z0, h.z0), z1 = Math.min(p.z1, h.z1)
      if (x0 >= x1 || z0 >= z1) { next.push(p); continue }
      if (p.z0 < z0) next.push({ x0: p.x0, z0: p.z0, x1: p.x1, z1: z0 })
      if (z1 < p.z1) next.push({ x0: p.x0, z0: z1, x1: p.x1, z1: p.z1 })
      if (p.x0 < x0) next.push({ x0: p.x0, z0, x1: x0, z1 })
      if (x1 < p.x1) next.push({ x0: x1, z0, x1: p.x1, z1 })
    }
    parts = next
  }
  return parts
}

const NW_WELL = { x0: -39.5, x1: -32.5, z0: -47.6, z1: -40.35 }
const SE_WELL = { x0: -15.5, x1: -8.5, z0: -15.65, z1: -8.4 }

function addSlabRect(floor, rect, material) {
  addBox({
    floor,
    p: [(rect.x0 + rect.x1) / 2, FY[floor] - SLAB_THICKNESS / 2, (rect.z0 + rect.z1) / 2],
    s: [rect.x1 - rect.x0, SLAB_THICKNESS, rect.z1 - rect.z0],
    material,
    role: 'slab',
  })
}

function addRingSlab(floor) {
  // 1층 북서 코어도 지하까지 실제로 이어진다. 남동 코어만 1층에서
  // 끝나므로 F1은 북서 보이드 하나를 남긴다.
  const holes = [
    ...(floor === 'F1' ? [NW_WELL] : [NW_WELL, SE_WELL]),
    ...COMPACT_ELEVATORS
      .filter((elevator) => elevator.servedFloors.includes(floor))
      .map((elevator) => ({ x0: elevator.x[0], x1: elevator.x[1], z0: elevator.z[0], z1: elevator.z[1] })),
  ]
  const bands = [
    { x0: B.x0, x1: B.x1, z0: B.z0, z1: C.z0 },
    { x0: B.x0, x1: B.x1, z0: C.z1, z1: B.z1 },
    { x0: B.x0, x1: C.x0, z0: C.z0, z1: C.z1 },
    { x0: C.x1, x1: B.x1, z0: C.z0, z1: C.z1 },
  ]
  for (const band of bands) {
    for (const part of subtractRect(band, holes)) addSlabRect(floor, part, floor === 'ROOF' ? 'roofMembrane' : 'corrFloor')
  }
}

const WINDOW_CENTERS_X = [-44, -36, -28, -20, -12, -4]
const WINDOW_CENTERS_Z = [-44, -36, -28, -20, -12]

function facadeOpenings(floor, side) {
  const centers = side === 'north' || side === 'south' ? WINDOW_CENTERS_X : WINDOW_CENTERS_Z
  return centers.map((center) => ({
    center,
    width: (center === -36 && side === 'north') || (center === -12 && side === 'south') ? 1.5 : 3.6,
    type: 'window',
    sill: floor === 'F1' ? 1.0 : 0.9,
    head: 2.55,
  }))
}

function corridorWindowOpenings(axis) {
  const centers = axis === 'x' ? [-32, -24, -16] : [-32, -28, -24]
  return centers.map((center) => ({ center, width: axis === 'x' ? 4.8 : 2.8, type: 'window', sill: 0.95, head: 2.5 }))
}

const FLOOR_PROGRAM = {
  F1: ['경비·방재실', '행정실', '보건실', '교무실', '급식실', '조리실', '상담실', '인쇄실'],
  F2: ['도서실', '음악실', '과학실', '컴퓨터실', '2-1 교실', '2-2 교실', '영어전용실', '시청각실'],
  F3: ['방송실', '무용실', '미술실', '동아리실', '3-1 교실', '3-2 교실', '지구과학실', '서예실'],
}

function addRoomMetadata(floor) {
  const names = FLOOR_PROGRAM[floor]
  const footprints = [
    [-32, -48, -24, -40], [-24, -48, -16, -40],
    [-16, -48, -8, -40], [-40, -16, -32, -8],
    [-32, -16, -24, -8], [-24, -16, -16, -8],
    [-48, -36, -40, -28], [-8, -36, 0, -28],
  ]
  footprints.forEach(([x0, z0, x1, z1], index) => rooms.push({
    id: `${floor.toLowerCase()}_room_${index + 1}`,
    name: names[index], floor, x0, z0, x1, z1,
    cx: (x0 + x1) / 2, cz: (z0 + z1) / 2,
  }))
}

function addFloorShell(floor) {
  addRingSlab(floor)
  addRoomMetadata(floor)
  const y = FY[floor]

  // 외벽. F1 남측 중앙만 현관 개구부로 교체한다.
  addWallRun(floor, 'x', B.z0, B.x0, B.x1, facadeOpenings(floor, 'north'), { lower: 'wallOutBase', upper: 'extStucco', glass: 'darkGlass' })
  const south = facadeOpenings(floor, 'south')
  if (floor === 'F1') {
    const filtered = south.filter((opening) => Math.abs(opening.center + 24) > 3)
    filtered.push({ center: -24, width: 2.8, type: 'door', id: 'main_entry', kind: 'fire', permanentlyLocked: true, head: 2.45 })
    addWallRun(floor, 'x', B.z1, B.x0, B.x1, filtered, { lower: 'wallOutBase', upper: 'extStucco', glass: 'darkGlass' })
  } else addWallRun(floor, 'x', B.z1, B.x0, B.x1, south, { lower: 'wallOutBase', upper: 'extStucco', glass: 'darkGlass' })
  addWallRun(floor, 'z', B.x0, B.z0, B.z1, facadeOpenings(floor, 'west'), { lower: 'wallOutBase', upper: 'extStucco', glass: 'darkGlass' })
  addWallRun(floor, 'z', B.x1, B.z0, B.z1, facadeOpenings(floor, 'east'), { lower: 'wallOutBase', upper: 'extStucco', glass: 'darkGlass' })

  // 중정 면. 유리와 하부 벽 모두 실제 충돌을 가진다.
  addWallRun(floor, 'x', C.z0, C.x0, C.x1, corridorWindowOpenings('x'), { lower: 'corrBase', upper: 'corrWall', glass: 'glass' })
  addWallRun(floor, 'x', C.z1, C.x0, C.x1, corridorWindowOpenings('x'), { lower: 'corrBase', upper: 'corrWall', glass: 'glass' })
  addWallRun(floor, 'z', C.x0, C.z0, C.z1, corridorWindowOpenings('z'), { lower: 'corrBase', upper: 'corrWall', glass: 'glass' })
  addWallRun(floor, 'z', C.x1, C.z0, C.z1, corridorWindowOpenings('z'), { lower: 'corrBase', upper: 'corrWall', glass: 'glass' })

  const stairUnlockFloors = {
    F3: { nw: ['ROOF', 'F3', 'F2'], se: ['F3', 'F2'] },
    F2: { nw: ['F3', 'F2', 'F1'], se: ['F3', 'F2', 'F1'] },
    F1: { nw: ['F2', 'F1', 'B1'], se: ['F2', 'F1'] },
  }[floor]
  const northDoors = [-36, -28, -20, -12].map((center, index) => ({
    center, width: index === 0 ? 1.8 : index >= 2 ? 1.5 : 1.05, type: 'door',
    id: index === 0 ? `stair_nw_${floor}` : index === 2 ? `evc_${floor}` : index === 3 ? `evp_${floor}` : `north_room_${floor}_${index}`,
    kind: index === 0 ? 'fire' : index >= 2 ? 'elevator' : 'room',
    unlockFloors: index === 0 ? stairUnlockFloors.nw : undefined,
    permanentlyLocked: false,
    swing: index === 0 ? -1 : 1,
    head: index === 0 ? 2.35 : 2.2,
  }))
  addWallRun(floor, 'x', -40, -40, -8, northDoors, { lower: 'corrBase', upper: 'corrWall' })

  const southDoors = [-36, -28, -20, -12].map((center, index) => ({
    center, width: index === 3 ? 1.8 : 1.05, type: 'door',
    id: index === 3 ? `stair_se_${floor}` : `south_room_${floor}_${index}`,
    kind: index === 3 ? 'fire' : 'room',
    unlockFloors: index === 3 ? stairUnlockFloors.se : undefined,
    permanentlyLocked: floor === 'F1' && index === 0,
    head: index === 3 ? 2.35 : 2.2,
  }))
  addWallRun(floor, 'x', -16, -40, -8, southDoors, { lower: 'corrBase', upper: 'corrWall' })

  addWallRun(floor, 'z', -40, -35.8, -20.2, [-32, -24].map((center, i) => ({ center, width: 1.05, type: 'door', id: `west_room_${floor}_${i}`, kind: 'room' })), { lower: 'corrBase', upper: 'corrWall' })
  addWallRun(floor, 'z', -8, -35.8, -20.2, [-32, -24].map((center, i) => ({ center, width: 1.05, type: 'door', id: `east_room_${floor}_${i}`, kind: 'room' })), { lower: 'corrBase', upper: 'corrWall' })

  // 방 베이 칸막이. 문과 복도 앞 1.5m 완충영역은 침범하지 않는다.
  for (const x of [-32, -24, -16]) {
    addFullWallSegment(floor, 'z', x, B.z0, -40, { lower: 'classBase', upper: 'classWall' })
    addFullWallSegment(floor, 'z', x, -16, B.z1, { lower: 'classBase', upper: 'classWall' })
  }
  addFullWallSegment(floor, 'x', -28, B.x0, -40, { lower: 'classBase', upper: 'classWall' })
  addFullWallSegment(floor, 'x', -28, -8, B.x1, { lower: 'classBase', upper: 'classWall' })

  // 복도 유도선과 조명 리듬.
  const corridorRuns = [
    { axis: 'x', fixed: -37.9, start: -38, end: -10 },
    { axis: 'x', fixed: -18.1, start: -38, end: -10 },
    { axis: 'z', fixed: -37.9, start: -34, end: -22 },
    { axis: 'z', fixed: -10.1, start: -34, end: -22 },
  ]
  for (const run of corridorRuns) {
    const len = run.end - run.start
    addBox({
      floor,
      p: run.axis === 'x' ? [(run.start + run.end) / 2, y + 0.025, run.fixed] : [run.fixed, y + 0.025, (run.start + run.end) / 2],
      s: run.axis === 'x' ? [len, 0.025, 0.08] : [0.08, 0.025, len],
      material: 'corrLine', role: 'floorMarking', collider: false,
    })
    const count = Math.max(2, Math.floor(len / 5.5))
    for (let i = 0; i < count; i++) {
      const t = run.start + (i + 0.5) * len / count
      const p = run.axis === 'x' ? [t, y + 3.05, run.fixed] : [run.fixed, y + 3.05, t]
      addBox({ floor, p, s: run.axis === 'x' ? [1.4, 0.08, 0.24] : [0.24, 0.08, 1.4], material: 'white', role: 'lightFixture', collider: false })
      addBox({ floor, p: [p[0], p[1] - 0.05, p[2]], s: run.axis === 'x' ? [1.2, 0.025, 0.18] : [0.18, 0.025, 1.2], material: TONE.cool, role: 'emissive', collider: false })
      boxes[boxes.length - 1].emissive = true
      addFixture(floor, [p[0], y + 2.8, p[2]], 'cool')
    }
  }

  // 외관 층선과 계단 코어 세로 프레임.
  for (const side of ['north', 'south']) {
    addBox({ floor, p: [-24, y + 0.15, side === 'north' ? B.z0 - 0.08 : B.z1 + 0.08], s: [48.3, 0.22, 0.12], material: 'extBand', role: 'facadeBand', collider: false })
  }
  for (const [x, z, sx, sz] of [[-36, B.z0 - 0.14, 8.2, 0.08], [-12, B.z1 + 0.14, 8.2, 0.08]]) {
    addBox({ floor, p: [x, y + 1.6, z], s: [sx, 3.2, sz], material: 'extFrame', role: 'coreFrame', collider: false })
  }
}

function roomAxes(room) {
  if (room.z0 === B.z0) return {
    point: (lateral, depth) => [room.cx + lateral, room.z1 - depth],
    size: (lateral, height, depth) => [lateral, height, depth],
    yaw: 0,
  }
  if (room.z1 === B.z1) return {
    point: (lateral, depth) => [room.cx + lateral, room.z0 + depth],
    size: (lateral, height, depth) => [lateral, height, depth],
    yaw: Math.PI,
  }
  if (room.x0 === B.x0) return {
    point: (lateral, depth) => [room.x1 - depth, room.cz + lateral],
    size: (lateral, height, depth) => [lateral, height, depth],
    yaw: Math.PI / 2,
  }
  return {
    point: (lateral, depth) => [room.x0 + depth, room.cz + lateral],
    size: (lateral, height, depth) => [lateral, height, depth],
    yaw: -Math.PI / 2,
  }
}

function roomKind(name) {
  if (/도서/.test(name)) return 'library'
  if (/과학|컴퓨터|지구/.test(name)) return 'lab'
  if (/방송|시청각/.test(name)) return 'control'
  if (/급식|조리/.test(name)) return 'food'
  if (/보건/.test(name)) return 'health'
  if (/경비|방재|행정|교무|상담|인쇄/.test(name)) return 'office'
  if (/음악|무용|미술|서예|동아리/.test(name)) return 'studio'
  return 'classroom'
}

const ROOM_FLOOR_MATERIAL = {
  classroom: 'classFloor', library: 'wood', lab: 'labFloor', control: 'storeFloor',
  food: 'foodFloor', health: 'healthFloor', office: 'adminFloor', studio: 'wood',
}

function addDesk(room, axes, index, lateral, depth, material = 'desk') {
  const floor = room.floor
  const y = FY[floor]
  const [x, z] = axes.point(lateral, depth)
  addBox({
    id: `${room.id}_desk_${index}`, floor, p: [x, y + 0.72, z],
    s: axes.size(1.24, 0.1, 0.68), rot: [0, axes.yaw, 0],
    material, role: 'furniture', collider: true,
  })
  for (const [legIndex, dl, dd] of [[1, -0.5, -0.23], [2, 0.5, -0.23], [3, -0.5, 0.23], [4, 0.5, 0.23]]) {
    const [legX, legZ] = axes.point(lateral + dl, depth + dd)
    addBox({
      id: `${room.id}_desk_${index}_leg_${legIndex}`, floor, p: [legX, y + 0.35, legZ],
      s: [0.055, 0.7, 0.055], material: 'deskLeg', role: 'furnitureDetail', collider: false,
    })
  }
  const [chairX, chairZ] = axes.point(lateral, depth - 0.72)
  addBox({
    id: `${room.id}_chair_${index}`, floor, p: [chairX, y + 0.42, chairZ],
    s: axes.size(0.48, 0.84, 0.48), rot: [0, axes.yaw, 0],
    material: 'chair', role: 'furnitureDetail', collider: false,
  })
}

function addShelf(room, axes, index, lateral, depth, width = 1.45) {
  const floor = room.floor
  const y = FY[floor]
  const [x, z] = axes.point(lateral, depth)
  addBox({
    id: `${room.id}_shelf_${index}`, floor, p: [x, y + 1.05, z],
    s: axes.size(width, 2.1, 0.48), rot: [0, axes.yaw, 0],
    material: 'locker', role: 'furniture', collider: true,
  })
  for (let shelf = 1; shelf <= 3; shelf++) addBox({
    id: `${room.id}_shelf_${index}_line_${shelf}`, floor,
    p: [x, y + shelf * 0.52, z], s: axes.size(width + 0.04, 0.045, 0.53), rot: [0, axes.yaw, 0],
    material: 'paper', role: 'furnitureDetail', collider: false,
  })
}

function addRoomDensity(room) {
  const floor = room.floor
  const y = FY[floor]
  const axes = roomAxes(room)
  const kind = roomKind(room.name)
  addBox({
    id: `${room.id}_finish`, floor,
    p: [room.cx, y + 0.038, room.cz],
    s: [room.x1 - room.x0 - 0.38, 0.02, room.z1 - room.z0 - 0.38],
    material: ROOM_FLOOR_MATERIAL[kind], role: 'roomFinish', collider: false,
  })

  if (kind === 'library') {
    for (const [index, lateral] of [-2.15, 0, 2.15].entries()) addShelf(room, axes, index + 1, lateral, 5.8, 1.55)
    addDesk(room, axes, 1, -1.25, 3.15, 'wood')
    addDesk(room, axes, 2, 1.25, 3.15, 'wood')
  } else if (kind === 'lab' || kind === 'control') {
    for (const [index, depth] of [3.0, 5.2].entries()) {
      const [x, z] = axes.point(0, depth)
      addBox({
        id: `${room.id}_workbench_${index + 1}`, floor, p: [x, y + 0.78, z],
        s: axes.size(4.7, 0.92, 0.86), rot: [0, axes.yaw, 0],
        material: kind === 'control' ? 'extSteelDark' : 'desk', role: 'furniture', collider: true,
      })
      for (const lateral of [-1.65, 0, 1.65]) {
        const [screenX, screenZ] = axes.point(lateral, depth - 0.18)
        addBox({
          id: `${room.id}_screen_${index + 1}_${lateral}`, floor, p: [screenX, y + 1.18, screenZ],
          s: axes.size(0.72, 0.42, 0.055), rot: [0, axes.yaw, 0],
          material: index % 2 ? 'safetyGreen' : 'signBlue', role: 'emissive', collider: false,
        })
        boxes[boxes.length - 1].emissive = true
      }
    }
  } else if (kind === 'food') {
    for (const [index, lateral] of [-1.65, 0, 1.65].entries()) addDesk(room, axes, index + 1, lateral, 3.5, 'wood')
    const [counterX, counterZ] = axes.point(0, 6.25)
    addBox({
      id: `${room.id}_counter`, floor, p: [counterX, y + 0.52, counterZ],
      s: axes.size(5.5, 1.04, 0.72), rot: [0, axes.yaw, 0],
      material: 'kitchenBase', role: 'furniture', collider: true,
    })
  } else if (kind === 'health') {
    for (const [index, lateral] of [-1.65, 1.65].entries()) {
      const [bedX, bedZ] = axes.point(lateral, 4.55)
      addBox({
        id: `${room.id}_bed_${index + 1}`, floor, p: [bedX, y + 0.48, bedZ],
        s: axes.size(1.15, 0.54, 2.25), rot: [0, axes.yaw, 0],
        material: 'white', role: 'furniture', collider: true,
      })
      const [headX, headZ] = axes.point(lateral, 5.55)
      addBox({
        id: `${room.id}_bed_head_${index + 1}`, floor, p: [headX, y + 0.82, headZ],
        s: axes.size(1.18, 0.72, 0.08), rot: [0, axes.yaw, 0],
        material: 'healthBase', role: 'furnitureDetail', collider: false,
      })
    }
    addShelf(room, axes, 1, 2.9, 6.1, 0.9)
  } else if (kind === 'office') {
    addDesk(room, axes, 1, -1.55, 3.25)
    addDesk(room, axes, 2, 1.55, 4.6)
    addShelf(room, axes, 1, -2.35, 6.25, 1.2)
    addShelf(room, axes, 2, 0, 6.25, 1.2)
    addShelf(room, axes, 3, 2.35, 6.25, 1.2)
  } else if (kind === 'studio') {
    const [platformX, platformZ] = axes.point(0, 6.05)
    addBox({
      id: `${room.id}_studio_platform`, floor, p: [platformX, y + 0.16, platformZ],
      s: axes.size(5.6, 0.32, 1.6), rot: [0, axes.yaw, 0],
      material: 'wood', role: 'furniture', collider: true,
    })
    for (const lateral of [-2.4, -0.8, 0.8, 2.4]) {
      const [panelX, panelZ] = axes.point(lateral, 6.88)
      addBox({
        id: `${room.id}_studio_panel_${lateral}`, floor, p: [panelX, y + 1.45, panelZ],
        s: axes.size(1.35, 1.85, 0.055), rot: [0, axes.yaw, 0],
        material: 'darkGlass', role: 'furnitureDetail', collider: false,
      })
    }
  } else {
    let deskIndex = 1
    for (const depth of [3.15, 4.75]) for (const lateral of [-1.7, 0, 1.7]) {
      addDesk(room, axes, deskIndex++, lateral, depth)
    }
    const [boardX, boardZ] = axes.point(0, 6.92)
    addBox({
      id: `${room.id}_board`, floor, p: [boardX, y + 1.55, boardZ],
      s: axes.size(5.0, 1.1, 0.09), rot: [0, axes.yaw, 0],
      material: 'chalk', role: 'furnitureDetail', collider: false,
    })
  }
}

function addInteriorDensity() {
  for (const room of rooms) {
    const starts = { boxes: boxes.length, cylinders: cylinders.length, fixtures: fixtures.length }
    addRoomDensity(room)
    const shafts = COMPACT_ELEVATORS.filter((elevator) => (
      elevator.servedFloors.includes(room.floor)
      && elevator.x[0] < room.x1 && elevator.x[1] > room.x0
      && elevator.z[0] < room.z1 && elevator.z[1] > room.z0
    ))
    if (shafts.length === 0) continue
    const outsideShaft = (item) => shafts.every((shaft) => !(
      item.p[0] > shaft.x[0] - 0.35 && item.p[0] < shaft.x[1] + 0.35
      && item.p[2] > shaft.z[0] - 0.35 && item.p[2] < shaft.z[1] + 0.35
    ))
    boxes.splice(starts.boxes, boxes.length - starts.boxes, ...boxes.slice(starts.boxes).filter(outsideShaft))
    cylinders.splice(starts.cylinders, cylinders.length - starts.cylinders, ...cylinders.slice(starts.cylinders).filter(outsideShaft))
    fixtures.splice(starts.fixtures, fixtures.length - starts.fixtures, ...fixtures.slice(starts.fixtures).filter(outsideShaft))
  }
  for (const floor of ['F1', 'F2', 'F3']) {
    const y = FY[floor]
    for (const [side, z] of [['north', -39.56], ['south', -16.44]]) {
      for (const x of [-32, -24, -16]) addBox({
        id: `${floor}_${side}_locker_${x}`, floor, p: [x, y + 0.95, z], s: [2.25, 1.9, 0.44],
        material: 'locker', role: 'furniture', collider: true,
      })
    }
    for (const [side, x] of [['west', -39.56], ['east', -8.44]]) addBox({
      id: `${floor}_${side}_corridor_bench`, floor, p: [x, y + 0.4, -28], s: [0.48, 0.8, 2.05],
      material: 'wood', role: 'furniture', collider: true,
    })
  }
}

function addElevatorShafts() {
  for (const elevator of COMPACT_ELEVATORS) {
    for (const floor of elevator.servedFloors) {
      const y = FY[floor]
      const x0 = elevator.x[0], x1 = elevator.x[1]
      const z0 = elevator.z[0], z1 = elevator.z[1]
      addBox({ id: `${elevator.id}_${floor}_shaft_back`, floor, p: [(x0 + x1) / 2, y + 1.6, z0], s: [x1 - x0, 3.2, 0.18], material: 'extConcrete', role: 'elevatorShaft' })
      addBox({ id: `${elevator.id}_${floor}_shaft_left`, floor, p: [x0, y + 1.6, (z0 + z1) / 2], s: [0.18, 3.2, z1 - z0], material: 'extConcrete', role: 'elevatorShaft' })
      addBox({ id: `${elevator.id}_${floor}_shaft_right`, floor, p: [x1, y + 1.6, (z0 + z1) / 2], s: [0.18, 3.2, z1 - z0], material: 'extConcrete', role: 'elevatorShaft' })
    }
  }
}

function addRailBarrier(floor, p, s, rot, id) {
  addBox({ id, floor, p, s, rot, material: 'rail', role: 'rail', collider: true, visible: false })
}

function addVisualRail(floor, p, s, rot, id) {
  addBox({ id, floor, p, s, rot, material: 'rail', role: 'railVisual', collider: false })
}

function addSwitchbackStair(floor, core, dir, coreId) {
  const y = FY[floor]
  const laneWidth = 3.0
  const coreWidth = core.x1 - core.x0
  const landingWidth = coreWidth - 0.3
  const landingX = (core.x0 + core.x1) / 2
  const leftX = core.x0 + 1.65
  const rightX = core.x1 - 1.65
  const entryZ = dir < 0 ? core.z1 : core.z0
  const tread = 0.45
  const riser = 0.225
  const steps = 8
  const run = tread * steps
  const rise = riser * steps
  const farZ = entryZ + dir * (0.8 + run)
  const angle = Math.atan2(rise, run)
  const length = Math.hypot(run, rise)

  for (let i = 0; i < steps; i++) {
    const z1 = entryZ + dir * (0.8 + (i + 0.5) * tread)
    const top1 = y + (i + 1) * riser
    const massHeight1 = top1 - y
    addBox({
      id: `stair_${coreId}_${floor}_lower_mass_${i + 1}`,
      floor, p: [leftX, y + massHeight1 / 2, z1], s: [laneWidth, massHeight1, tread + 0.02],
      material: 'stairRiser', role: 'stairMass', collider: false,
    })
    addBox({ floor, p: [leftX, top1 - 0.055, z1], s: [laneWidth, 0.11, tread + 0.02], material: 'stairTread', role: 'stairTread', collider: false })
    addBox({ floor, p: [leftX, top1 - riser / 2, z1 - dir * tread / 2], s: [laneWidth, riser, 0.07], material: 'stairRiser', role: 'stairRiser', collider: false })

    const z2 = farZ - dir * ((i + 0.5) * tread)
    const top2 = y + rise + (i + 1) * riser
    const massHeight2 = top2 - (y + rise)
    addBox({
      id: `stair_${coreId}_${floor}_upper_mass_${i + 1}`,
      floor, p: [rightX, y + rise + massHeight2 / 2, z2], s: [laneWidth, massHeight2, tread + 0.02],
      material: 'stairRiser', role: 'stairMass', collider: false,
    })
    addBox({ floor, p: [rightX, top2 - 0.055, z2], s: [laneWidth, 0.11, tread + 0.02], material: 'stairTread', role: 'stairTread', collider: false })
    addBox({ floor, p: [rightX, top2 - riser / 2, z2 + dir * tread / 2], s: [laneWidth, riser, 0.07], material: 'stairRiser', role: 'stairRiser', collider: false })
  }

  const center1 = entryZ + dir * (0.8 + run / 2)
  const center2 = farZ - dir * run / 2
  addBox({ id: `stair_${coreId}_${floor}_lower_ramp`, floor, p: [leftX, y + rise / 2 - 0.08, center1], s: [laneWidth, 0.18, length + 0.08], rot: [-dir * angle, 0, 0], material: 'stairTread', role: 'stairRamp', collider: true, visible: false })
  addBox({ id: `stair_${coreId}_${floor}_upper_ramp`, floor, p: [rightX, y + rise + rise / 2 - 0.08, center2], s: [laneWidth, 0.18, length + 0.08], rot: [dir * angle, 0, 0], material: 'stairTread', role: 'stairRamp', collider: true, visible: false })
  for (const [id, x, center, rampY, rotation] of [
    ['lower', leftX, center1, y + rise / 2 - 0.22, [-dir * angle, 0, 0]],
    ['upper', rightX, center2, y + rise + rise / 2 - 0.22, [dir * angle, 0, 0]],
  ]) {
    for (const side of [-1, 1]) addBox({
      id: `stair_${coreId}_${floor}_${id}_stringer_${side < 0 ? 'left' : 'right'}`,
      floor, p: [x + side * (laneWidth / 2 - 0.11), rampY, center],
      s: [0.22, 0.36, length + 0.12], rot: rotation,
      material: 'extConcrete', role: 'stairStringer', collider: false,
    })
  }

  const farLandingZ = farZ + dir * 0.55
  addBox({ id: `stair_${coreId}_${floor}_mid_landing`, floor, p: [landingX, y + rise - 0.14, farLandingZ], s: [landingWidth, 0.28, 1.25], material: 'stairTread', role: 'landing' })

  // 층 출입문은 두 레인의 중앙에 있다. 한쪽 레인만 덮으면 문을 정면으로
  // 통과한 캡슐이 수직 보이드로 떨어지므로, 상부 층계참은 문 폭부터 두
  // 레인의 첫 디딤판까지 하나의 연속된 구조체로 잇는다. 이 층계참은 바로
  // 위 계단의 하부 출발참도 겸해 각 층에서 실제 U자 동선을 만든다.
  const upperLandingDepth = 1.4
  const upperLandingZ = entryZ + dir * 0.4
  addBox({
    id: `stair_${coreId}_${floor}_level_landing`,
    floor,
    p: [landingX, y + FLOOR_HEIGHT - 0.14, upperLandingZ],
    s: [landingWidth, 0.28, upperLandingDepth],
    material: 'stairTread', role: 'landing',
  })

  // 두 경사로의 안쪽과 바깥쪽 모두 연속 충돌 난간을 둔다. 보이는
  // 손스침과 실제 장벽은 같은 축을 공유해 외형과 물리가 어긋나지 않는다.
  const flightRails = [
    ['lower_outer', leftX - laneWidth / 2, center1, [-dir * angle, 0, 0], y + rise / 2 + 0.58],
    ['lower_inner', leftX + laneWidth / 2, center1, [-dir * angle, 0, 0], y + rise / 2 + 0.58],
    ['upper_inner', rightX - laneWidth / 2, center2, [dir * angle, 0, 0], y + rise + rise / 2 + 0.58],
    ['upper_outer', rightX + laneWidth / 2, center2, [dir * angle, 0, 0], y + rise + rise / 2 + 0.58],
  ]
  for (const [railId, x, z, rot, yMid] of flightRails) {
    addRailBarrier(floor, [x, yMid, z], [0.14, 1.02, length + 0.2], rot, `stair_${coreId}_${floor}_${railId}_guard`)
    addVisualRail(floor, [x, yMid + 0.52, z], [0.08, 0.08, length + 0.26], rot)
  }
  for (let i = 0; i <= steps; i += 2) {
    const z = entryZ + dir * (0.8 + i * tread)
    for (const side of [-1, 1]) addVisualRail(floor, [leftX + side * laneWidth / 2, y + i * riser + 0.5, z], [0.06, 1.0, 0.06])
    const zBack = farZ - dir * (i * tread)
    for (const side of [-1, 1]) addVisualRail(floor, [rightX + side * laneWidth / 2, y + rise + i * riser + 0.5, zBack], [0.06, 1.0, 0.06])
  }

  // U턴 중간참의 먼 가장자리와 층계참 중앙 보이드를 막는다. 레인 입구는
  // 비워 실제 보행선은 유지하면서도 어느 방향으로 틀어도 추락하지 않는다.
  const farGuardZ = farLandingZ + dir * 0.625
  addRailBarrier(floor, [landingX, y + rise + 0.58, farGuardZ], [landingWidth, 1.16, 0.12], undefined, `stair_${coreId}_${floor}_mid_landing_guard`)
  addVisualRail(floor, [landingX, y + rise + 1.12, farGuardZ], [landingWidth, 0.08, 0.08])
  for (let i = 0; i <= 6; i++) {
    const x = landingX - landingWidth / 2 + landingWidth * i / 6
    addVisualRail(floor, [x, y + rise + 0.56, farGuardZ], [0.055, 1.05, 0.055])
  }

  const gapStart = leftX + laneWidth / 2
  const gapEnd = rightX - laneWidth / 2
  const upperGapZ = upperLandingZ + dir * upperLandingDepth / 2
  addRailBarrier(floor, [(gapStart + gapEnd) / 2, y + FLOOR_HEIGHT + 0.58, upperGapZ], [gapEnd - gapStart, 1.16, 0.12], undefined, `stair_${coreId}_${floor}_level_gap_guard`)
  addVisualRail(floor, [(gapStart + gapEnd) / 2, y + FLOOR_HEIGHT + 1.12, upperGapZ], [gapEnd - gapStart, 0.08, 0.08])
  for (let i = 0; i <= 2; i++) {
    const x = gapStart + (gapEnd - gapStart) * i / 2
    addVisualRail(floor, [x, y + FLOOR_HEIGHT + 0.56, upperGapZ], [0.055, 1.05, 0.055])
  }
}

function addWellRails(floor, well, openSide) {
  const y = FY[floor]
  const edges = [
    ['x', well.z0, well.x0, well.x1, 'N'], ['x', well.z1, well.x0, well.x1, 'S'],
    ['z', well.x0, well.z0, well.z1, 'W'], ['z', well.x1, well.z0, well.z1, 'E'],
  ]
  for (const [axis, fixed, start, end, side] of edges) {
    if (side === openSide) continue
    const p = axis === 'x' ? [(start + end) / 2, y + 0.58, fixed] : [fixed, y + 0.58, (start + end) / 2]
    const s = axis === 'x' ? [end - start, 1.16, 0.12] : [0.12, 1.16, end - start]
    addRailBarrier(floor, p, s)
    const topP = [p[0], y + 1.12, p[2]]
    addVisualRail(floor, topP, axis === 'x' ? [end - start, 0.08, 0.08] : [0.08, 0.08, end - start])
    const count = Math.max(2, Math.floor((end - start) / 1.2))
    for (let i = 0; i <= count; i++) {
      const t = start + (end - start) * i / count
      addVisualRail(floor, axis === 'x' ? [t, y + 0.56, fixed] : [fixed, y + 0.56, t], [0.055, 1.05, 0.055])
    }
  }
}

function addStairs() {
  // 지하→1층 북서 코어. B1은 좁은 기계실이라 남동 코어를 두지 않는다.
  addSwitchbackStair('B1', { x0: -40, x1: -32, z0: -48, z1: -40 }, -1, 'nw')
  for (const floor of ['F1', 'F2', 'F3']) {
    // 두 코어의 빠져 있던 측벽을 복구해 계단이 방 안에 노출된 발판이 아니라
    // 방화문·내화벽으로 닫힌 실제 계단실로 읽히게 한다.
    addFullWallSegment(floor, 'z', -40, -48, -40, { lower: 'corrBase', upper: 'corrWall' })
    addFullWallSegment(floor, 'z', -8, -16, -8, { lower: 'corrBase', upper: 'corrWall' })
    addSwitchbackStair(floor, { x0: -40, x1: -32, z0: -48, z1: -40 }, -1, 'nw')
    addSwitchbackStair(floor, { x0: -16, x1: -8, z0: -16, z1: -8 }, 1, 'se')
  }
  for (const floor of ['F2', 'F3', 'ROOF']) {
    addWellRails(floor, NW_WELL, 'S')
    addWellRails(floor, SE_WELL, 'N')
  }
  addWellRails('F1', NW_WELL, 'S')
}

function addParapet(floor, axis, fixed, start, end, material = 'extConcrete') {
  const y = FY[floor]
  addBox({
    floor,
    p: axis === 'x' ? [(start + end) / 2, y + 0.65, fixed] : [fixed, y + 0.65, (start + end) / 2],
    s: axis === 'x' ? [end - start, 1.3, 0.32] : [0.32, 1.3, end - start],
    material,
    role: 'parapet',
  })
  addBox({
    floor,
    p: axis === 'x' ? [(start + end) / 2, y + 1.34, fixed] : [fixed, y + 1.34, (start + end) / 2],
    s: axis === 'x' ? [end - start + 0.15, 0.08, 0.46] : [0.46, 0.08, end - start + 0.15],
    material: 'mullion', role: 'parapetCap', collider: false,
  })
}

function addPenthouse(id, rect, doorSide, doorCenter, unlockFloor, locked = false) {
  const floor = 'ROOF'
  const y = FY.ROOF
  const openings = [{ center: doorCenter, width: 1.8, type: 'door', id, kind: 'fire', unlockFloor, permanentlyLocked: locked, head: 2.35 }]
  addWallRun(floor, 'x', rect.z0, rect.x0, rect.x1, doorSide === 'north' ? openings : [], { lower: 'corrBase', upper: 'corrWall', height: 2.9 })
  addWallRun(floor, 'x', rect.z1, rect.x0, rect.x1, doorSide === 'south' ? openings : [], { lower: 'corrBase', upper: 'corrWall', height: 2.9 })
  addFullWallSegment(floor, 'z', rect.x0, rect.z0, rect.z1, { lower: 'corrBase', upper: 'corrWall', height: 2.9 })
  addFullWallSegment(floor, 'z', rect.x1, rect.z0, rect.z1, { lower: 'corrBase', upper: 'corrWall', height: 2.9 })
  addBox({ floor, p: [(rect.x0 + rect.x1) / 2, y + 3.0, (rect.z0 + rect.z1) / 2], s: [rect.x1 - rect.x0 + 0.45, 0.22, rect.z1 - rect.z0 + 0.45], material: 'extSteelDark', role: 'roofCap' })
  addBox({ floor, p: [doorCenter, y + 2.52, doorSide === 'south' ? rect.z1 + 0.08 : rect.z0 - 0.08], s: [0.72, 0.22, 0.08], material: unlockFloor ? 'safetyRed' : 'white', role: 'exitSign', collider: false })
  boxes[boxes.length - 1].emissive = true
}

function addRoof() {
  addRingSlab('ROOF')
  const y = FY.ROOF
  addParapet('ROOF', 'x', B.z0, B.x0, B.x1)
  addParapet('ROOF', 'x', B.z1, B.x0, B.x1)
  addParapet('ROOF', 'z', B.x0, B.z0, B.z1)
  addParapet('ROOF', 'z', B.x1, B.z0, B.z1)
  addParapet('ROOF', 'x', C.z0, C.x0, C.x1)
  addParapet('ROOF', 'x', C.z1, C.x0, C.x1)
  addParapet('ROOF', 'z', C.x0, C.z0, C.z1)
  addParapet('ROOF', 'z', C.x1, C.z0, C.z1)

  addPenthouse('roof_to_f3', { x0: -40.35, x1: -31.65, z0: -48.15, z1: -39.62 }, 'south', -36, 'F3')
  addPenthouse('roof_se_locked', { x0: -16.35, x1: -7.65, z0: -16.38, z1: -7.85 }, 'north', -12, undefined, true)

  // 북측 물탱크 군 — 설비 사이 1.4m 이상의 통로를 유지한다.
  for (const x of [-28, -22]) {
    addCylinder({ floor: 'ROOF', p: [x, y + 1.35, -44], r: 1.45, h: 2.7, material: 'extBand', role: 'waterTank' })
    addBox({ floor: 'ROOF', p: [x, y + 1.35, -44], s: [2.9, 2.7, 2.9], material: 'extBand', role: 'equipmentCollider', collider: true, visible: false })
    for (const dx of [-1.1, 1.1]) for (const dz of [-1.1, 1.1]) {
      addCylinder({ floor: 'ROOF', p: [x + dx, y + 0.48, -44 + dz], r: 0.08, h: 0.96, material: 'extSteel', role: 'tankLeg' })
    }
  }

  // 서측 HVAC와 동측 안테나는 세 미션 지점을 시각적으로 구분한다.
  for (let i = 0; i < 4; i++) {
    const z = -33 + i * 3.2
    // 세 번째 설비는 서쪽 신호기와 겹치던 위치에서 외벽 쪽으로 물린다.
    // 구조 밀도는 유지하되 콘솔 앞 캡슐 회전 반경과 남북 통로를 확보한다.
    const x = i === 2 ? -45.2 : -43.2
    addBox({ floor: 'ROOF', p: [x, y + 0.65, z], s: [2.2, 1.3, 1.9], material: 'extSteel', role: 'hvac' })
    addBox({ floor: 'ROOF', p: [x, y + 0.72, z - 0.98], s: [1.5, 0.78, 0.08], material: 'extSteelDark', role: 'hvacGrille', collider: false })
  }
  addCylinder({ floor: 'ROOF', p: [-4.8, y + 3.5, -28], r: 0.11, h: 7, material: 'steel', role: 'antennaMast', collider: true })
  for (let i = 0; i < 4; i++) addCylinder({ floor: 'ROOF', p: [-4.8, y + 2.2 + i * 0.7, -28], r: 0.42, h: 0.045, material: 'rail', role: 'antennaRing', rot: [Math.PI / 2, 0, 0] })
  addBox({ floor: 'ROOF', p: [-4.8, y + 7.08, -28], s: [0.18, 0.18, 0.18], material: 'safetyRed', role: 'warningLight', collider: false })
  boxes[boxes.length - 1].emissive = true

  // 축소된 옥상도 실제 학교 설비층의 밀도를 유지한다. 중앙 미션 동선과
  // 스폰은 비우고 남·북 설비대와 서측 서비스 구역에만 큰 장비를 묶는다.
  for (const [index, x] of [-42, -34, -26, -20].entries()) {
    addBox({
      id: `roof_air_handler_${index + 1}`, floor: 'ROOF', p: [x, y + 0.72, -11.6],
      s: [2.5, 1.44, 1.55], material: 'extSteel', role: 'roofEquipment', collider: true,
    })
    addBox({
      id: `roof_air_handler_${index + 1}_grille`, floor: 'ROOF', p: [x, y + 0.78, -12.39],
      s: [1.65, 0.7, 0.055], material: 'extSteelDark', role: 'roofEquipmentDetail', collider: false,
    })
    for (const dx of [-0.72, 0, 0.72]) addBox({
      id: `roof_air_handler_${index + 1}_grille_bar_${dx}`, floor: 'ROOF', p: [x + dx, y + 0.78, -12.43],
      s: [0.035, 0.62, 0.035], material: 'mullion', role: 'roofEquipmentDetail', collider: false,
    })
  }

  for (const [index, x] of [-18, -14, -10].entries()) {
    addCylinder({
      id: `roof_exhaust_${index + 1}`, floor: 'ROOF', p: [x, y + 0.62, -44],
      r: 0.48, h: 1.24, material: 'extSteelDark', role: 'roofEquipmentDetail', collider: false,
    })
    addCylinder({
      id: `roof_exhaust_${index + 1}_cap`, floor: 'ROOF', p: [x, y + 1.31, -44],
      r: 0.67, h: 0.14, material: 'extSteel', role: 'roofEquipmentDetail', collider: false,
    })
    addBox({
      id: `roof_exhaust_${index + 1}_collider`, floor: 'ROOF', p: [x, y + 0.62, -44],
      s: [1.0, 1.24, 1.0], material: 'extSteelDark', role: 'roofEquipment', collider: true, visible: false,
    })
  }

  for (const [index, z] of [-44.2, -41.4].entries()) {
    addBox({
      id: `roof_west_chiller_${index + 1}`, floor: 'ROOF', p: [-44.2, y + 0.88, z],
      s: [2.6, 1.76, 1.55], material: 'extFrame', role: 'roofEquipment', collider: true,
    })
    addBox({
      id: `roof_west_chiller_${index + 1}_panel`, floor: 'ROOF', p: [-42.87, y + 0.9, z],
      s: [0.05, 1.12, 0.9], material: 'extSteelDark', role: 'roofEquipmentDetail', collider: false,
    })
  }

  // 배관·케이블 트레이는 장비 군을 시각적으로 하나의 설비 시스템으로 묶는다.
  for (const [index, z] of [-13.35, -13.7].entries()) addCylinder({
    id: `roof_south_pipe_${index + 1}`, floor: 'ROOF', p: [-31, y + 0.48 + index * 0.18, z],
    r: 0.085, h: 24, material: index ? 'safetyRed' : 'extSteel', role: 'roofPipe', collider: false,
    rot: [0, 0, Math.PI / 2],
  })
  for (const [index, x] of [-38, -30, -22].entries()) addBox({
    id: `roof_cable_tray_${index + 1}`, floor: 'ROOF', p: [x, y + 0.16, -42.1],
    s: [5.4, 0.16, 0.52], material: 'extSteelDark', role: 'roofEquipmentDetail', collider: false,
  })
  for (const [index, x] of [-30.6, -17.2].entries()) addBox({
    id: `roof_electrical_cabinet_${index + 1}`, floor: 'ROOF', p: [x, y + 0.92, -46.6],
    s: [1.2, 1.84, 0.64], material: 'extSteelDark', role: 'roofEquipment', collider: true,
  })

  // 장비 점검 발판과 황색 가장자리는 빈 회색 면을 작업 공간으로 분절한다.
  for (const [index, x] of [-42, -34, -26, -20].entries()) {
    addBox({
      id: `roof_service_pad_${index + 1}`, floor: 'ROOF', p: [x, y + 0.035, -11.6],
      s: [3.15, 0.035, 2.15], material: 'extConcrete', role: 'servicePad', collider: false,
    })
    addBox({
      id: `roof_service_pad_${index + 1}_mark`, floor: 'ROOF', p: [x, y + 0.06, -10.48],
      s: [3.18, 0.025, 0.08], material: 'safetyYellow', role: 'safetyMarking', collider: false,
    })
  }

  // 삼점 신호 미션의 물리적 장치. 현재는 골조/랜드마크이며 로직은 다음 패스에서 연결한다.
  const consoles = [
    { id: 'roof_signal_west', p: [-42.5, -27.8], color: 'safetyGreen' },
    { id: 'roof_signal_center', p: [-24, -39.1], color: 'safetyYellow' },
    { id: 'roof_signal_east', p: [-5.5, -27.8], color: 'signBlue' },
  ]
  for (const console of consoles) {
    addBox({ id: console.id, floor: 'ROOF', p: [console.p[0], y + 0.72, console.p[1]], s: [1.25, 1.44, 0.72], material: 'extFrame', role: 'missionConsole' })
    addBox({ floor: 'ROOF', p: [console.p[0], y + 1.18, console.p[1] - 0.38], s: [0.72, 0.38, 0.05], material: console.color, role: 'emissive', collider: false })
    boxes[boxes.length - 1].emissive = true
    addFixture('ROOF', [console.p[0], y + 1.4, console.p[1]], 'amber')
  }

  // 방수 시트 이음매와 안전 구획선.
  for (let x = -45.6; x <= -2.4; x += 2.4) {
    const segments = x > C.x0 && x < C.x1
      ? [[B.z0 + 0.5, C.z0 - 0.4], [C.z1 + 0.4, B.z1 - 0.5]]
      : [[B.z0 + 0.5, B.z1 - 0.5]]
    for (const [z0, z1] of segments) addBox({ floor: 'ROOF', p: [x, y + 0.018, (z0 + z1) / 2], s: [0.045, 0.018, z1 - z0], material: 'roofJoint', role: 'roofJoint', collider: false })
  }
  for (const z of [-37.2, -18.8]) addBox({ floor: 'ROOF', p: [-24, y + 0.035, z], s: [18, 0.02, 0.1], material: 'safetyYellow', role: 'safetyMarking', collider: false })
}

function addBasementShell() {
  const floor = 'B1', y = FY.B1
  addBox({ floor, p: [-24, y - 0.15, -44], s: [32, 0.3, 8], material: 'machFloor', role: 'slab' })
  // 기존 지하 본체는 z=-40에서 끝난다. 승강기 문 앞에 밀폐된 로비를
  // 증축해 카에서 내린 뒤 연결문을 통해 기계실로 들어가게 한다.
  addBox({ id: 'b1_elevator_lobby_slab', floor, p: [-15.5, y - 0.15, -38.4], s: [15, 0.3, 3.2], material: 'machFloor', role: 'slab' })
  addFullWallSegment(floor, 'x', -48, -40, -8, { lower: 'machBase', upper: 'machWall' })
  addWallRun(floor, 'x', -40, -40, -8, [
    ...COMPACT_ELEVATORS.map((elevator) => ({
      center: (elevator.x[0] + elevator.x[1]) / 2,
      width: 1.5,
      type: 'door',
      id: `${elevator.id}_B1`,
      kind: 'elevator',
      head: 2.35,
    })),
    { center: -15, width: 1.5, type: 'door', id: 'b1_elevator_lobby_link', kind: 'room', head: 2.35 },
  ], { lower: 'machBase', upper: 'machWall' })
  addFullWallSegment(floor, 'x', -36.8, -23, -8, { lower: 'machBase', upper: 'machWall' })
  addFullWallSegment(floor, 'z', -23, -40, -36.8, { lower: 'machBase', upper: 'machWall' })
  addFullWallSegment(floor, 'z', -8, -40, -36.8, { lower: 'machBase', upper: 'machWall' })
  addFullWallSegment(floor, 'z', -40, -48, -40, { lower: 'machBase', upper: 'machWall' })
  addFullWallSegment(floor, 'z', -8, -48, -40, { lower: 'machBase', upper: 'machWall' })
  for (const [index, x] of [-32, -24, -16].entries()) {
    addWallRun(floor, 'z', x, -48, -40, [{
      center: -44.2,
      width: 1.45,
      type: 'door',
      id: `b1_partition_${index + 1}`,
      kind: 'room',
      head: 2.35,
      material: 'extSteelDark',
    }], { lower: 'machBase', upper: 'machWall' })
  }

  // 지하 파이널의 세 설비는 의미 슬롯 바로 뒤에 배치한다. 상호작용 지점은
  // 통로에 남겨 플레이어와 서버 길찾기 actor가 장치 안으로 파고들지 않는다.
  const devices = [
    { id: 'b1_device_valve', x: -30, material: 'signBlue', width: 1.75 },
    { id: 'b1_device_panel', x: -18, material: 'safetyYellow', width: 1.8 },
    { id: 'b1_device_generator', x: -12, material: 'safetyRed', width: 2.1 },
  ]
  for (const device of devices) {
    addBox({ id: device.id, floor, p: [device.x, y + 0.92, -45.55], s: [device.width, 1.84, 0.72], material: 'extSteelDark', role: 'equipmentCollider' })
    addBox({ id: `${device.id}_display`, floor, p: [device.x, y + 1.15, -45.16], s: [device.width * 0.58, 0.45, 0.045], material: device.material, role: 'emissive', collider: false })
    boxes[boxes.length - 1].emissive = true
  }
  addCylinder({ id: 'b1_device_valve_wheel', floor, p: [-30, y + 1.15, -45.08], r: 0.34, h: 0.12, material: 'safetyRed', role: 'valveWheel', rot: [Math.PI / 2, 0, 0] })
  for (let i = 0; i < 6; i++) {
    const x = -38 + i * 5.6
    addBox({ floor, p: [x, y + 2.9, -44], s: [1.1, 0.1, 0.25], material: TONE.dim, role: 'emissive', collider: false })
    boxes[boxes.length - 1].emissive = true
    addFixture(floor, [x, y + 2.7, -44], 'dim')
  }
}

function addBroadcastRoom() {
  const floor = 'F3', y = FY.F3

  // 3층 대표 미션은 복도 표식이 아니라 실제 방송실 안의 물리 콘솔에서 진행한다.
  addBox({ id: 'f3_broadcast_console', floor, p: [-28, y + 0.78, -46.35], s: [4.6, 1.56, 1.0], material: 'extSteelDark', role: 'missionConsole' })
  for (const [index, x, material] of [
    [1, -29.35, 'signBlue'],
    [2, -28, 'safetyRed'],
    [3, -26.65, 'safetyYellow'],
  ]) {
    addBox({ id: `f3_broadcast_screen_${index}`, floor, p: [x, y + 1.12, -45.83], s: [1.02, 0.48, 0.045], material, role: 'emissive', collider: false })
    boxes[boxes.length - 1].emissive = true
  }
  addBox({ id: 'f3_broadcast_on_air', floor, p: [-28, y + 2.42, -47.84], s: [1.7, 0.48, 0.045], material: 'safetyRed', role: 'emissive', collider: false })
  boxes[boxes.length - 1].emissive = true

  // 마이크, 스피커, 장비 랙과 흡음 패널로 문을 들어서는 순간 방송실로 읽히게 한다.
  addCylinder({ id: 'f3_broadcast_mic_stand', floor, p: [-28, y + 0.63, -44.95], r: 0.035, h: 1.26, material: 'extSteel', role: 'microphoneStand' })
  addCylinder({ id: 'f3_broadcast_microphone', floor, p: [-28, y + 1.25, -44.92], r: 0.11, h: 0.34, material: 'extSteelDark', role: 'microphone', rot: [Math.PI / 2, 0, 0] })
  for (const x of [-30.3, -25.7]) {
    addBox({ floor, p: [x, y + 1.62, -47.65], s: [0.72, 1.15, 0.5], material: 'extFrame', role: 'speaker', collider: false })
    addCylinder({ floor, p: [x, y + 1.72, -47.37], r: 0.19, h: 0.06, material: 'extSteelDark', role: 'speakerCone', rot: [Math.PI / 2, 0, 0] })
  }
  addBox({ id: 'f3_broadcast_rack', floor, p: [-31.15, y + 1.1, -45.95], s: [0.7, 2.2, 1.25], material: 'extFrame', role: 'equipmentRack', collider: false })
  for (const x of [-31.55, -30.85, -25.15, -24.45]) {
    addBox({ floor, p: [x, y + 1.65, -43.8], s: [0.06, 1.45, 1.1], material: 'signBlue', role: 'acousticPanel', collider: false })
  }
  addFixture(floor, [-28, y + 2.65, -44.8], 'dim')
}

function addFieldFence(id, axis, fixed, start, end) {
  const floor = 'FIELD'
  const length = end - start
  const center = (start + end) / 2
  addBox({
    id: `${id}_collider`,
    floor,
    p: axis === 'x' ? [center, 0.8, fixed] : [fixed, 0.8, center],
    s: axis === 'x' ? [length, 1.6, 0.12] : [0.12, 1.6, length],
    material: 'extSteelDark', role: 'fieldFence', visible: false,
  })
  for (const [index, height] of [0.45, 0.95, 1.45].entries()) addBox({
    id: `${id}_rail_${index + 1}`,
    floor,
    p: axis === 'x' ? [center, height, fixed] : [fixed, height, center],
    s: axis === 'x' ? [length, 0.055, 0.055] : [0.055, 0.055, length],
    material: 'extSteel', role: 'fenceRail', collider: false,
  })
  const count = Math.max(1, Math.floor(length / 4))
  for (let index = 0; index <= count; index++) {
    const offset = start + (length * index) / count
    addBox({
      id: `${id}_post_${index}`,
      floor,
      p: axis === 'x' ? [offset, 0.8, fixed] : [fixed, 0.8, offset],
      s: [0.09, 1.6, 0.09], material: 'extSteel', role: 'fencePost', collider: false,
    })
  }
}

function addGrounds() {
  addBox({ floor: 'OUT', p: [-24, -0.22, -20], s: [72, 0.44, 80], material: 'asphalt', role: 'ground' })
  addBox({ floor: 'OUT', p: [-24, -0.08, -28], s: [C.x1 - C.x0, 0.16, C.z1 - C.z0], material: 'courtyardTile', role: 'courtyardGround' })
  addBox({ floor: 'OUT', p: [-24, -0.05, 12], s: [48, 0.1, 32], material: 'grass', role: 'fieldGround' })
  // 운동장 파이널은 입구와 탈출구만 비운 안전 펜스 안에서 진행한다.
  addFieldFence('field_fence_west', 'z', -48, -4, 28)
  addFieldFence('field_fence_east', 'z', 0, -4, 28)
  for (const [side, start, end] of [['west', -48, -27], ['east', -21, 0]]) {
    addFieldFence(`field_fence_north_${side}`, 'x', -4, start, end)
    addFieldFence(`field_fence_south_${side}`, 'x', 28, start, end)
  }
  for (const [index, inset] of [0, 1.2, 2.4].entries()) {
    addBox({ id: `field_lane_${index + 1}`, floor: 'FIELD', p: [-24, 0.015 + inset * 0.001, 12], s: [48 - inset * 2, 0.025, 32 - inset * 2], material: 'white', role: 'fieldLine', collider: false })
    addBox({ id: `field_lane_inlay_${index + 1}`, floor: 'FIELD', p: [-24, 0.025 + inset * 0.001, 12], s: [47.82 - inset * 2, 0.03, 31.82 - inset * 2], material: 'grass', role: 'fieldInlay', collider: false })
  }
  for (const [id, x, z, material] of [
    ['field_station_a', -38, 8, 'safetyGreen'],
    ['field_station_b', -24, 14, 'safetyYellow'],
    ['field_station_c', -10, 8, 'signBlue'],
  ]) {
    addBox({ id, floor: 'FIELD', p: [x, 0.48, z], s: [1.25, 0.96, 0.72], material: 'extSteelDark', role: 'missionStation', collider: false })
    addBox({ id: `${id}_display`, floor: 'FIELD', p: [x, 0.77, z - 0.38], s: [0.72, 0.3, 0.04], material, role: 'emissive', collider: false })
    boxes[boxes.length - 1].emissive = true
  }
  // 남측 현관 캐노피와 학교 이름 띠.
  addBox({ floor: 'OUT', p: [-24, 2.75, B.z1 + 1.4], s: [8.4, 0.24, 3.1], material: 'extConcrete', role: 'entryCanopy' })
  for (const x of [-27.2, -20.8]) addBox({ floor: 'OUT', p: [x, 1.35, B.z1 + 2.5], s: [0.24, 2.7, 0.24], material: 'extFrame', role: 'entryPost' })
  addBox({ floor: 'OUT', p: [-24, 8.8, B.z1 + 0.14], s: [9.8, 0.82, 0.12], material: 'signBlue', role: 'schoolSign', collider: false })
}

function addNavigation() {
  const floors = ['F1', 'F2', 'F3', 'ROOF']
  for (const floor of floors) {
    const y = FY[floor]
    const ring = [
      [-38, -38], [-24, -38], [-10, -38], [-10, -28],
      [-10, -18], [-24, -18], [-38, -18], [-38, -28],
    ]
    ring.forEach(([x, z], index) => navNodes.push({ id: `${floor}_ring_${index}`, floor, p: [x, y, z], links: [`${floor}_ring_${(index + 7) % 8}`, `${floor}_ring_${(index + 1) % 8}`] }))
  }

  // 교실 안 목표와 복도 링을 실제 문 개구부로 연결한다. 잠긴 문에는
  // 포털을 만들지 않아 AI가 벽을 통과하는 경로를 선택할 수 없다.
  for (const door of doors) {
    if (door.kind !== 'room' || door.permanentlyLocked || !floors.includes(door.f)) continue
    const center = door.axis === 'x'
      ? [door.hinge[0] + door.w / 2, door.fixed]
      : [door.fixed, door.hinge[2] + door.w / 2]
    const corridorSign = door.fixed === -40 ? 1 : -1
    const corridor = door.axis === 'x'
      ? [center[0], center[1] + corridorSign * 1.05]
      : [center[0] + corridorSign * 1.05, center[1]]
    const room = door.axis === 'x'
      ? [center[0], center[1] - corridorSign * 1.05]
      : [center[0] - corridorSign * 1.05, center[1]]
    const corridorId = `${door.id}_nav_corridor`
    const roomId = `${door.id}_nav_room`
    const corridorNode = {
      id: corridorId, floor: door.f, p: [corridor[0], FY[door.f], corridor[1]], links: [roomId],
    }
    const roomNode = {
      id: roomId, floor: door.f, p: [room[0], FY[door.f], room[1]], links: [corridorId],
    }
    const nearestRingNodes = navNodes
      .filter((node) => node.floor === door.f && node.id.includes('_ring_'))
      .sort((left, right) => (
        Math.hypot(left.p[0] - corridor[0], left.p[2] - corridor[1])
        - Math.hypot(right.p[0] - corridor[0], right.p[2] - corridor[1])
      ))
      .slice(0, 2)
    for (const ringNode of nearestRingNodes) {
      corridorNode.links.push(ringNode.id)
      ringNode.links.push(corridorId)
    }
    navNodes.push(corridorNode, roomNode)
  }

  const basementSpine = [[-36, -44.2], [-28, -44.2], [-20, -44.2], [-12, -44.2], [-9.5, -44.2]]
  basementSpine.forEach(([x, z], index) => navNodes.push({
    id: `B1_ring_${index}`, floor: 'B1', p: [x, FY.B1, z],
    links: [index > 0 ? `B1_ring_${index - 1}` : null, index + 1 < basementSpine.length ? `B1_ring_${index + 1}` : null].filter(Boolean),
  }))

  const fieldRing = [
    [-42, 0], [-24, 0], [-6, 0], [-6, 14],
    [-6, 24], [-24, 24], [-42, 24], [-42, 14],
  ]
  fieldRing.forEach(([x, z], index) => navNodes.push({
    id: `FIELD_ring_${index}`, floor: 'FIELD', p: [x, FY.FIELD, z],
    links: [`FIELD_ring_${(index + fieldRing.length - 1) % fieldRing.length}`, `FIELD_ring_${(index + 1) % fieldRing.length}`],
  }))

  const basementLobbyNodes = [
    { id: 'B1_elevator_lobby_hub', p: [-15, FY.B1, -39.1], links: ['B1_elevator_lobby_inner'] },
    { id: 'B1_elevator_lobby_inner', p: [-15, FY.B1, -40.8], links: ['B1_elevator_lobby_hub', 'B1_elevator_lobby_spine'] },
    { id: 'B1_elevator_lobby_spine', p: [-15, FY.B1, -44.2], links: ['B1_elevator_lobby_inner', 'B1_ring_3'] },
  ]
  navNodes.find((node) => node.id === 'B1_ring_3')?.links.push('B1_elevator_lobby_spine')
  navNodes.push(...basementLobbyNodes.map((node) => ({ ...node, floor: 'B1' })))

  for (const elevator of COMPACT_ELEVATORS) {
    for (const floor of elevator.servedFloors) {
      const x = (elevator.x[0] + elevator.x[1]) / 2
      const z = elevator.z[1] + 1.0
      const elevatorNode = {
        id: `${floor}_${elevator.id}_landing`, floor, p: [x, FY[floor], z], links: [],
      }
      const nearest = floor === 'B1'
        ? navNodes.find((node) => node.id === 'B1_elevator_lobby_hub')
        : navNodes
          .filter((node) => node.floor === floor && node.id.includes('_ring_'))
          .sort((left, right) => Math.hypot(left.p[0] - x, left.p[2] - z) - Math.hypot(right.p[0] - x, right.p[2] - z))[0]
      if (nearest) {
        elevatorNode.links.push(nearest.id)
        nearest.links.push(elevatorNode.id)
      }
      navNodes.push(elevatorNode)
    }
  }
}

addGrounds()
for (const floor of ['F1', 'F2', 'F3']) addFloorShell(floor)
addInteriorDensity()
addElevatorShafts()
addStairs()
addRoof()
addBasementShell()
addBroadcastRoom()
addNavigation()

export const COMPACT_SCHOOL = Object.freeze({
  boxes,
  cylinders,
  doors,
  fixtures,
  rooms,
  navNodes,
  bounds: BUILDING_BOUNDS,
  courtyard: COURTYARD_BOUNDS,
  floorY: FLOOR_Y,
  elevators: COMPACT_ELEVATORS,
})

export function buildCompactSchool() {
  return COMPACT_SCHOOL
}
