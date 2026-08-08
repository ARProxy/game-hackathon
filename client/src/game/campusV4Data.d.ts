export type CampusFloor = 'OUT' | 'B1' | 'F1' | 'F2' | 'F3' | 'ROOF'
export type V2 = [number, number]
export type V3 = [number, number, number]
export type CampusRotation = V3 | { rot: V3 }

export const PAL: Record<string, string>

export interface CampusBox {
  f: CampusFloor
  p: V3
  s: V3
  c: string
  rot?: CampusRotation
  e?: number
  hide?: boolean
  ramp?: boolean
  forceCollider?: boolean
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
  back?: boolean
  flip?: boolean
}

export interface CampusDevice {
  kind: string
  id: string
  room: string
  floor: CampusFloor
  p: V2
  y: number
  note: string
}

export interface CampusCell {
  id: string
  floor: CampusFloor
  box: [number, number, number, number, number, number]
  links: string[]
}

export type ClassroomLayout = 'rows' | 'pods' | 'exam' | 'horseshoe' | 'project'

export interface CampusRoom {
  id: string
  name: string
  kind: string
  floor: CampusFloor
  wing: string
  cond?: string
  layoutId?: ClassroomLayout
  x0: number
  z0: number
  x1: number
  z1: number
  cx: number
  cz: number
  tone: string
}

export interface CampusSlot {
  id: string
  p: V2
  floor: CampusFloor
  room?: string
  roomName?: string
  surfaceY?: number
  [key: string]: unknown
}

export interface CampusData {
  solids: CampusBox[]
  visuals: CampusBox[]
  plates: CampusPlate[]
  cyls: CampusCylinder[]
  fixtures: CampusFixture[]
  doors: CampusDoor[]
  lamps: Array<{ p: V2; h: number; tone: string }>
  rooms: CampusRoom[]
  devices: CampusDevice[]
  cells: CampusCell[]
  slots: {
    props: CampusSlot[]
    missions: CampusSlot[]
    traps: CampusSlot[]
    gates: CampusSlot[]
  }
  EVS: Array<{ id: string; name: string; x: V2; z: V2; roof: boolean }>
  seed: number
}

export const MAP_SIZE: number
export const FLOOR_HEIGHT: number
export const FLOOR_Y: Record<CampusFloor, number>
export const EVS: Array<{ id: string; name: string; x: V2; z: V2; roof: boolean }>
export const TONE: Record<string, string>
export const CLASSROOM_LAYOUTS: Record<string, ClassroomLayout>
export const PROP_SLOTS: CampusSlot[]
export const MISSION_SLOTS: CampusSlot[]
export const SPAWNS: {
  human: { p: V2; floor: CampusFloor; note: string }
  partners: Array<{ p: V2; floor: CampusFloor; note: string }>
  seeker: { p: V2; floor: CampusFloor; note: string }
}
export const TRAP_SLOTS: Array<{ id: string; p: V2; floor: CampusFloor; kind: string; risk: number }>
export const GATE_SLOTS: Array<{ id: string; name: string; p: V2; rotY: number; floor: CampusFloor }>
export function buildCampus(options?: { seed?: number }): CampusData
