export type CampusFloor = 'OUT' | 'B1' | 'F1' | 'F2' | 'F3' | 'ROOF'
export type V2 = [number, number]
export type V3 = [number, number, number]
export type CampusRotation = V3 | { rot: V3 }

export interface CampusBox {
  f: CampusFloor
  p: V3
  s: V3
  c: string
  rot?: CampusRotation
  e?: number
  hide?: boolean
}

export interface CampusPlate {
  f: CampusFloor
  p: V3
  s: V2
  c: string
  rot?: V3 | null
  ceil?: boolean
}

export interface CampusCylinder {
  f: CampusFloor
  p: V3
  r: number
  h: number
  c: string
  rot?: CampusRotation
}

export interface CampusFixture {
  f: CampusFloor
  p: V3
  c: string
  tone: string
  dynamic: boolean
}

export interface CampusDoor {
  f: CampusFloor
  id: string
  axis: 'x' | 'z'
  fixed: number
  hinge: V3
  w: number
  h: number
  t: number
  swing: number
  kind: string
  c: string
}

export interface CampusData {
  solids: CampusBox[]
  visuals: CampusBox[]
  plates: CampusPlate[]
  cyls: CampusCylinder[]
  fixtures: CampusFixture[]
  doors: CampusDoor[]
  lamps: Array<{ p: V2; h: number; tone: string }>
  rooms: unknown[]
  seed: number
}

export const MAP_SIZE: number
export const FLOOR_HEIGHT: number
export const FLOOR_Y: Record<CampusFloor, number>
export const TONE: Record<string, string>
export const SPAWNS: {
  human: { p: V2; floor: CampusFloor; note: string }
  partners: Array<{ p: V2; floor: CampusFloor; note: string }>
  seeker: { p: V2; floor: CampusFloor; note: string }
}
export const TRAP_SLOTS: Array<{ id: string; p: V2; floor: CampusFloor; kind: string; risk: number }>
export const GATE_SLOTS: Array<{ id: string; name: string; p: V2; rotY: number; floor: CampusFloor }>
export function buildCampus(options?: { seed?: number }): CampusData
