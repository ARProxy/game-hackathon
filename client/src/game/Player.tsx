/**
 * 플레이어 캐릭터
 * - 캡슐(몸통) + 구(머리) 조합
 * - WASD/방향키로 이동
 * - 빙결 시: 이동 불가, 색 변화, 바운스 정지
 */

import { useRef, forwardRef, useImperativeHandle } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import useKeyboard from '../hooks/useKeyboard'
import { useGameStore } from '../stores/gameStore'

const MOVE_SPEED = 5
const MAP_EXTENT = 12.5

const COLOR_NORMAL = '#52E5FF'
const COLOR_FROZEN = '#8090a0'

interface PlayerProps {
  position?: [number, number, number]
}

export interface PlayerHandle {
  getGroup: () => THREE.Group | null
}

const Player = forwardRef<PlayerHandle, PlayerProps>(function Player({
  position = [0, 0, 0],
}: PlayerProps, ref) {
  const groupRef = useRef<THREE.Group>(null)
  const bodyRef = useRef<THREE.Mesh>(null)
  const headRef = useRef<THREE.Mesh>(null)
  const keys = useKeyboard()
  const isMoving = useRef(false)

  useImperativeHandle(ref, () => ({
    getGroup: () => groupRef.current,
  }))

  useFrame(({ clock }, delta) => {
    if (!groupRef.current) return

    const playerId = useGameStore.getState().playerId
    const playerState = useGameStore.getState().players[playerId]
    const isFrozen = playerState?.status === 'frozen'

    // 빙결 시 색 변경
    const targetColor = isFrozen ? COLOR_FROZEN : COLOR_NORMAL
    if (bodyRef.current) {
      const mat = bodyRef.current.material as THREE.MeshStandardMaterial
      mat.color.lerp(new THREE.Color(targetColor), 0.1)
    }
    if (headRef.current) {
      const mat = headRef.current.material as THREE.MeshStandardMaterial
      mat.color.lerp(new THREE.Color(targetColor), 0.1)
    }

    // 빙결 시 이동 불가
    if (isFrozen) {
      // 바운스 정지 — 현재 y 위치를 0으로 수렴
      const pos = groupRef.current.position
      pos.y = THREE.MathUtils.lerp(pos.y, 0, 0.15)
      return
    }

    // 이동 입력 수집
    let moveX = 0
    let moveZ = 0

    const pressed = keys.current
    if (pressed.has('KeyW') || pressed.has('ArrowUp')) moveZ -= 1
    if (pressed.has('KeyS') || pressed.has('ArrowDown')) moveZ += 1
    if (pressed.has('KeyA') || pressed.has('ArrowLeft')) moveX -= 1
    if (pressed.has('KeyD') || pressed.has('ArrowRight')) moveX += 1

    const length = Math.sqrt(moveX * moveX + moveZ * moveZ)
    if (length > 0) {
      moveX /= length
      moveZ /= length
    }

    isMoving.current = length > 0

    const pos = groupRef.current.position
    pos.x += moveX * MOVE_SPEED * delta
    pos.z += moveZ * MOVE_SPEED * delta

    pos.x = THREE.MathUtils.clamp(pos.x, -MAP_EXTENT, MAP_EXTENT)
    pos.z = THREE.MathUtils.clamp(pos.z, -MAP_EXTENT, MAP_EXTENT)

    // 이동 방향으로 회전
    if (length > 0) {
      const targetAngle = Math.atan2(moveX, moveZ)
      groupRef.current.rotation.y = THREE.MathUtils.lerp(
        groupRef.current.rotation.y,
        targetAngle,
        0.15,
      )
    }

    // 바운스
    const t = clock.getElapsedTime()
    const bounceAmount = isMoving.current ? 0.12 : 0.04
    const bounceSpeed = isMoving.current ? 8 : 2
    pos.y = Math.abs(Math.sin(t * bounceSpeed)) * bounceAmount
  })

  return (
    <group ref={groupRef} position={position}>
      {/* 몸통 */}
      <mesh ref={bodyRef} position={[0, 0.6, 0]}>
        <capsuleGeometry args={[0.3, 0.6, 8, 16]} />
        <meshStandardMaterial color={COLOR_NORMAL} />
      </mesh>

      {/* 머리 */}
      <mesh ref={headRef} position={[0, 1.3, 0]}>
        <sphereGeometry args={[0.25, 16, 16]} />
        <meshStandardMaterial color={COLOR_NORMAL} />
      </mesh>

      {/* 눈 */}
      <mesh position={[-0.1, 1.35, 0.22]}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshBasicMaterial color="#07090D" />
      </mesh>
      <mesh position={[0.1, 1.35, 0.22]}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshBasicMaterial color="#07090D" />
      </mesh>
    </group>
  )
})

export default Player
