/**
 * 플레이어 주변 시야 조명
 * - PointLight가 플레이어를 따라다님
 * - 전역 조명을 어둡게 하고 이 라이트만 밝게 → 시야 제한 효과
 */

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

interface PlayerLightProps {
  targetRef: React.RefObject<THREE.Group | null>
  radius?: number
  intensity?: number
}

export default function PlayerLight({
  targetRef,
  radius = 12,
  intensity = 5,
}: PlayerLightProps) {
  const lightRef = useRef<THREE.PointLight>(null)

  useFrame(() => {
    if (!targetRef.current || !lightRef.current) return
    const pos = targetRef.current.position
    lightRef.current.position.set(pos.x, 6, pos.z)
  })

  return (
    <pointLight
      ref={lightRef}
      intensity={intensity}
      distance={radius}
      color="#c0d8f0"
      castShadow={false}
    />
  )
}
