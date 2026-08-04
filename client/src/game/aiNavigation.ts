export type PlanarStep = { x: number; z: number }

/**
 * 목표 방향과 양옆 우회 후보를 순서대로 검사해 한 프레임의 안전한 이동량을 구한다.
 * 물리 엔진 의존성은 isBlocked 콜백에 격리해 순수하게 검증할 수 있다.
 */
export function planAvoidedStep(
  dx: number,
  dz: number,
  maxStep: number,
  isBlocked: (direction: PlanarStep, distance: number) => boolean,
  preferredSide = 1,
): PlanarStep {
  const distance = Math.hypot(dx, dz)
  if (distance <= 0 || maxStep <= 0) return { x: 0, z: 0 }

  const step = Math.min(maxStep, distance)
  const forward = { x: dx / distance, z: dz / distance }
  const angles = [
    0,
    preferredSide * Math.PI / 4,
    preferredSide * Math.PI / 2,
    preferredSide * Math.PI * 3 / 4,
    Math.PI,
    -preferredSide * Math.PI * 3 / 4,
    -preferredSide * Math.PI / 2,
    -preferredSide * Math.PI / 4,
  ]

  for (const angle of angles) {
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    const direction = {
      x: forward.x * cos + forward.z * sin,
      z: -forward.x * sin + forward.z * cos,
    }
    if (!isBlocked(direction, step)) return { x: direction.x * step, z: direction.z * step }
  }
  return { x: 0, z: 0 }
}
