import contract from './gateContract.json'

export type GateSlot = { id: string; p: [number, number]; ry: number }

export const GATE_SLOTS: GateSlot[] = contract.gates.map((gate) => ({
  id: gate.id,
  p: [gate.position[0], gate.position[1]],
  ry: gate.rotationY,
}))

export const GATE_SENSOR_LOCAL_Z = {
  arrival: contract.arrivalSensorLocalZ,
  escape: contract.escapeSensorLocalZ,
} as const

export const GATE_LOCKED_BLOCKER_HALF_SIZE = contract.lockedBlockerHalfSize as [number, number, number]

/** 게이트 로컬 z축 오프셋을 월드 평면 좌표로 변환한다. */
export function gateLocalZToWorld(slot: GateSlot, localZ: number): [number, number] {
  return [
    slot.p[0] + Math.sin(slot.ry) * localZ,
    slot.p[1] + Math.cos(slot.ry) * localZ,
  ]
}
