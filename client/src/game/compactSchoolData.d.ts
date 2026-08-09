export type CompactFloor = 'OUT' | 'FIELD' | 'B1' | 'F1' | 'F2' | 'F3' | 'ROOF'
export type V3 = [number, number, number]

export interface CompactBox {
  id: string
  f: CompactFloor
  p: V3
  s: V3
  material: string
  c: string
  role: string
  collider: boolean
  visible: boolean
  rot?: V3
  emissive?: boolean
}

export interface CompactCylinder {
  id: string
  f: CompactFloor
  p: V3
  r: number
  h: number
  material: string
  c: string
  role: string
  collider: boolean
  visible: boolean
  rot?: V3
}

export interface CompactDoor {
  id: string
  f: CompactFloor
  axis: 'x' | 'z'
  fixed: number
  hinge: V3
  w: number
  h: number
  t: number
  swing: number
  kind: string
  unlockFloor?: string
  unlockFloors?: string[]
  permanentlyLocked: boolean
  material: string
  c: string
}

export interface CompactFixture {
  id: string
  f: CompactFloor
  p: V3
  c: string
  tone: string
}

export interface CompactSchoolData {
  boxes: CompactBox[]
  cylinders: CompactCylinder[]
  doors: CompactDoor[]
  fixtures: CompactFixture[]
  rooms: Array<{ id: string; name: string; floor: CompactFloor; x0: number; z0: number; x1: number; z1: number; cx: number; cz: number }>
  navNodes: Array<{ id: string; floor: CompactFloor; p: V3; links: string[] }>
  bounds: { x0: number; x1: number; z0: number; z1: number }
  courtyard: { x0: number; x1: number; z0: number; z1: number }
  floorY: Record<CompactFloor, number>
  elevators: CompactElevator[]
}

export interface CompactElevator {
  id: 'evp' | 'evc'
  name: string
  x: [number, number]
  z: [number, number]
  roof: boolean
  servedFloors: CompactFloor[]
}

export const FLOOR_HEIGHT: number
export const FLOOR_Y: Record<CompactFloor, number>
export const FLOOR_ORDER: CompactFloor[]
export const BUILDING_BOUNDS: { x0: number; x1: number; z0: number; z1: number }
export const COURTYARD_BOUNDS: { x0: number; x1: number; z0: number; z1: number }
export const CORRIDOR_WIDTH: number
export const WALL_HEIGHT: number
export const WALL_THICKNESS: number
export const SLAB_THICKNESS: number
export const COMPACT_ELEVATORS: CompactElevator[]
export const COMPACT_PALETTE: Record<string, string>
export const COMPACT_SCHOOL: CompactSchoolData
export function buildCompactSchool(): CompactSchoolData
