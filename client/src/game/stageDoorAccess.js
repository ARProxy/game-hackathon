/** 서버가 공개한 접근 가능 층과 실제 층계참 문의 인접 층을 대조한다. */
export function stageDoorUnlocked(door, accessibleFloors) {
  const adjacentFloors = door.unlockFloors ?? (door.unlockFloor ? [door.unlockFloor] : [])
  if (adjacentFloors.length === 0) return false
  const accessible = new Set(accessibleFloors)
  return accessible.has(door.f) && adjacentFloors.some((floor) => accessible.has(floor))
}

export function isStageDoor(door) {
  return Boolean(door.unlockFloor || door.unlockFloors?.length)
}
