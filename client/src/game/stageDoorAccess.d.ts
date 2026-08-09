import type { CompactDoor } from './compactSchoolData.js'

export function stageDoorUnlocked(door: CompactDoor, accessibleFloors: readonly string[]): boolean
export function isStageDoor(door: CompactDoor): boolean
