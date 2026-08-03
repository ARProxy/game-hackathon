/**
 * 플레이어 캐릭터
 * - 캡슐(몸통) + 구(머리) 조합
 * - 시안색 (#52E5FF)
 * - WASD/방향키로 이동
 * - 쿼터뷰 기준으로 이동 방향 보정
 * - 이동 시 바운스 강해짐, 이동 방향으로 회전
 */

import { useRef, forwardRef, useImperativeHandle } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import useKeyboard from '../hooks/useKeyboard'

const MOVE_SPEED = 5
const MAP_EXTENT = 12.5 // 맵 경계 (25/2)

interface PlayerProps {
  position?: [number, number, number]
  color?: string
}

export interface PlayerHandle {
  getGroup: () => THREE.Group | null
}

const Player = forwardRef<PlayerHandle, PlayerProps>(function Player({
  position = [0, 0, 0],
  color = '#52E5FF',
}: PlayerProps, ref) {
  const groupRef = useRef<THREE.Group>(null)
  const keys = useKeyboard()
  const isMoving = useRef(false)

  useImperativeHandle(ref, () => ({
    getGroup: () => groupRef.current,
  }))

  useFrame(({ clock }, delta) => {
    if (!groupRef.current) return

    // 이동 입력 수집
    let moveX = 0
    let moveZ = 0

    const pressed = keys.current
    if (pressed.has('KeyW') || pressed.has('ArrowUp')) moveZ -= 1
    if (pressed.has('KeyS') || pressed.has('ArrowDown')) moveZ += 1
    if (pressed.has('KeyA') || pressed.has('ArrowLeft')) moveX -= 1
    if (pressed.has('KeyD') || pressed.has('ArrowRight')) moveX += 1

    // 대각선 이동 정규화
    const length = Math.sqrt(moveX * moveX + moveZ * moveZ)
    if (length > 0) {
      moveX /= length
      moveZ /= length
    }

    isMoving.current = length > 0

    // 위치 업데이트
    const pos = groupRef.current.position
    pos.x += moveX * MOVE_SPEED * delta
    pos.z += moveZ * MOVE_SPEED * delta

    // 맵 경계 클램프
    pos.x = THREE.MathUtils.clamp(pos.x, -MAP_EXTENT, MAP_EXTENT)
    pos.z = THREE.MathUtils.clamp(pos.z, -MAP_EXTENT, MAP_EXTENT)

    // 이동 방향으로 회전
    if (length > 0) {
      const targetAngle = Math.atan2(moveX, moveZ)
      const current = groupRef.current.rotation.y
      groupRef.current.rotation.y = THREE.MathUtils.lerp(
        current,
        targetAngle,
        0.15,
      )
    }

    // 바운스 애니메이션 — 이동 중에는 더 크게
    const t = clock.getElapsedTime()
    const bounceAmount = isMoving.current ? 0.12 : 0.04
    const bounceSpeed = isMoving.current ? 8 : 2
    pos.y = Math.abs(Math.sin(t * bounceSpeed)) * bounceAmount
  })

  return (
    <group ref={groupRef} position={position}>
      {/* 몸통 — 캡슐 */}
      <mesh position={[0, 0.6, 0]}>
        <capsuleGeometry args={[0.3, 0.6, 8, 16]} />
        <meshStandardMaterial color={color} />
      </mesh>

      {/* 머리 — 구 */}
      <mesh position={[0, 1.3, 0]}>
        <sphereGeometry args={[0.25, 16, 16]} />
        <meshStandardMaterial color={color} />
      </mesh>

      {/* 눈 — 왼쪽 */}
      <mesh position={[-0.1, 1.35, 0.22]}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshBasicMaterial color="#07090D" />
      </mesh>

      {/* 눈 — 오른쪽 */}
      <mesh position={[0.1, 1.35, 0.22]}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshBasicMaterial color="#07090D" />
      </mesh>
    </group>
  )
})

export default Player
