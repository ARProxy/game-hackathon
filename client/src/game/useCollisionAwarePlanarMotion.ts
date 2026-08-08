import { useCallback, useMemo, useRef } from 'react'
import { useRapier } from '@react-three/rapier'
import * as THREE from 'three'
import { planAvoidedStep } from './aiNavigation'

const ACTOR_CAST_HEIGHT = 0.78
const CAST_SKIN = 0.08

/**
 * 서버 권위 캐릭터가 벽을 통과하지 않도록 한 프레임의 평면 이동을 계산한다.
 * 동료와 술래가 동일한 충돌 반경·우회 규칙을 사용하게 해 이동 코드 중복을 없앤다.
 */
export function useCollisionAwarePlanarMotion(radius = 0.36) {
  const { world, rapier } = useRapier()
  const navigationShape = useMemo(() => new rapier.Ball(radius), [rapier, radius])
  const avoidanceSide = useRef(1)
  const solidFilters = rapier.QueryFilterFlags.EXCLUDE_SENSORS
    | rapier.QueryFilterFlags.EXCLUDE_DYNAMIC

  return useCallback((
    position: THREE.Vector3,
    dx: number,
    dz: number,
    maxStep: number,
    floorY: number,
  ) => {
    const step = planAvoidedStep(dx, dz, maxStep, (direction, distance) => Boolean(world.castShape(
      { x: position.x, y: floorY + ACTOR_CAST_HEIGHT, z: position.z },
      { x: 0, y: 0, z: 0, w: 1 },
      { x: direction.x, y: 0, z: direction.z },
      navigationShape,
      0.02,
      distance + CAST_SKIN,
      false,
      solidFilters,
    )), avoidanceSide.current)
    if (step.x === 0 && step.z === 0) avoidanceSide.current *= -1
    position.x += step.x
    position.z += step.z
  }, [navigationShape, solidFilters, world])
}

