/** 플레이어가 바라보는 방향을 비추는 손전등. */

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
interface PlayerLightProps {
  targetRef: React.RefObject<THREE.Group | null>
}

export default function PlayerLight({ targetRef }: PlayerLightProps) {
  const lightRef = useRef<THREE.SpotLight>(null)
  const fillRef = useRef<THREE.PointLight>(null)
  const aimRef = useRef<THREE.Object3D>(null)

  useFrame(() => {
    if (!targetRef.current || !lightRef.current || !fillRef.current || !aimRef.current) return
    const player = targetRef.current
    const pos = player.position
    const yaw = player.rotation.y
    const forwardX = Math.sin(yaw)
    const forwardZ = Math.cos(yaw)

    lightRef.current.position.set(
      pos.x + forwardX * 0.3,
      pos.y + 1.15,
      pos.z + forwardZ * 0.3,
    )
    aimRef.current.position.set(
      pos.x + forwardX * 12,
      pos.y + 0.55,
      pos.z + forwardZ * 12,
    )
    lightRef.current.target = aimRef.current
    fillRef.current.position.set(pos.x, pos.y + 1.0, pos.z)
  })

  return (
    <>
      <spotLight
        ref={lightRef}
        intensity={115}
        distance={26}
        angle={Math.PI / 5}
        penumbra={0.62}
        color="#d9ecff"
        decay={1.5}
      />
      <pointLight ref={fillRef} intensity={4.5} distance={5} decay={1.8} color="#a9c6d8" />
      <object3D ref={aimRef} />
    </>
  )
}
