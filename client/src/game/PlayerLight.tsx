/**
 * 플레이어 주변 시야 조명
 * - PointLight가 플레이어를 따라다님
 * - Fog와 함께 작동하여 시야 반경 5m만 밝게
 * - 시야 밖은 Fog가 완전히 가림
 */

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { VISION_RADIUS } from './Fog'

interface PlayerLightProps {
  targetRef: React.RefObject<THREE.Group | null>
}

export default function PlayerLight({ targetRef }: PlayerLightProps) {
  const lightRef = useRef<THREE.PointLight>(null)

  useFrame(() => {
    if (!targetRef.current || !lightRef.current) return
    const pos = targetRef.current.position
    lightRef.current.position.set(pos.x, 4, pos.z)
  })

  return (
    <pointLight
      ref={lightRef}
      intensity={8}
      distance={VISION_RADIUS * 1.5}
      color="#c0d8f0"
      decay={2}
    />
  )
}
