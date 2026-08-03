/**
 * 카메라가 플레이어를 부드럽게 추종하는 컴포넌트
 * - 쿼터뷰 오프셋(20,20,20)을 유지하면서 플레이어 위치를 따라감
 * - lerp로 부드러운 추종
 */

import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

const OFFSET = new THREE.Vector3(20, 20, 20)
const LERP_SPEED = 0.08

interface CameraFollowProps {
  targetRef: React.RefObject<THREE.Group | null>
}

export default function CameraFollow({ targetRef }: CameraFollowProps) {
  const { camera } = useThree()

  useFrame(() => {
    if (!targetRef.current) return

    const targetPos = targetRef.current.position
    const desiredPos = new THREE.Vector3().copy(targetPos).add(OFFSET)

    camera.position.lerp(desiredPos, LERP_SPEED)
    camera.lookAt(targetPos.x, 0, targetPos.z)
    camera.updateProjectionMatrix()
  })

  return null
}
