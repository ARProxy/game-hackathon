import verticalMapContract from './verticalMapContract.json'

export type SpawnFloor = 'ROOF' | 'F3' | 'F2' | 'F1' | 'FIELD' | 'B1'

export interface ActorSpawn {
  position: [number, number, number]
  floor: SpawnFloor
  zone: string
}

type SpawnSlot = {
  kind: string
  position?: number[]
  floor?: string
  zone?: string
}

const slots = verticalMapContract.slots as Record<string, SpawnSlot>

function requireSpawn(slotId: string): ActorSpawn {
  const slot = slots[slotId]
  if (
    slot?.kind !== 'spawn'
    || slot.position?.length !== 3
    || !slot.position.every(Number.isFinite)
    || !slot.floor
    || !slot.zone
  ) {
    throw new Error(`Invalid actor spawn slot: ${slotId}`)
  }
  return {
    position: [...slot.position] as [number, number, number],
    floor: slot.floor as SpawnFloor,
    zone: slot.zone,
  }
}

/** 서버 map_slots.actor_spawn_slots와 같은 의미 슬롯을 사용하는 클라이언트 정본. */
export const ACTOR_SPAWNS = {
  human: requireSpawn('ROOF_RUNNER_SPAWN_A'),
  partner: requireSpawn('ROOF_RUNNER_SPAWN_B'),
  'partner-2': requireSpawn('ROOF_RUNNER_SPAWN_C'),
  seeker: requireSpawn('F3_SEEKER_REVEAL_ENTRY'),
  'seeker-2': requireSpawn('F1_BLOCKER_SPAWN_ENTRY'),
} as const

export function actorSpawnPosition(actorId: keyof typeof ACTOR_SPAWNS) {
  const spawn = ACTOR_SPAWNS[actorId]
  const [x, y, z] = spawn.position
  return { x, y, z, floor: spawn.floor, zone: spawn.zone }
}

export function floorHeight(floor: string | undefined): number {
  if (!floor) return 0
  return (verticalMapContract.floorY as Record<string, number>)[floor] ?? 0
}
