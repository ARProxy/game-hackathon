import type * as THREE from 'three'

export function elevatorMaterials(three: typeof THREE): Record<string, THREE.Material>
export function buildElevatorRig(three: typeof THREE, options: {
  EV: { id: string; name: string; x: [number, number]; z: [number, number]; roof: boolean }
  mat: Record<string, THREE.Material>
  FY: Record<string, number>
  order: string[]
  label: Record<string, string>
  onFloor?: (floor: string, object: THREE.Object3D) => void
  onSolid?: (mesh: THREE.Mesh) => void
  picks?: THREE.Object3D[]
}): {
  root: THREE.Group
  shaft: THREE.Group
  car: THREE.Group
  carDoors: Array<{ m: THREE.Mesh; sd: number; home: number }>
  landing: Record<string, Array<THREE.Mesh & { userData: { home: number; sd: number } }>>
  hallInd: Record<string, THREE.Object3D>
  hallLantern: Record<string, { up: THREE.Mesh; dn: THREE.Mesh }>
  hallBtns: Record<string, Record<string, THREE.Mesh>>
  copBtns: Record<string, THREE.Mesh>
  copInd: THREE.Object3D
  PANEL_W: number
  DOOR_W: number
  DOOR_H: number
  CAR_H: number
}
