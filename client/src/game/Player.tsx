/**
 * 플레이어 캐릭터 — Rapier dynamic body
 * - RigidBody(dynamic) + CapsuleCollider
 * - velocity로 이동 → rapier가 충돌 처리
 * - 회전 잠금, 중력 적용
 */

import { useRef, forwardRef, useImperativeHandle } from 'react'
import { useFrame } from '@react-three/fiber'
import { RigidBody, CapsuleCollider } from '@react-three/rapier'
import type { RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import useKeyboard from '../hooks/useKeyboard'
import { useGameStore } from '../stores/gameStore'
import { useCameraStore } from '../stores/cameraStore'

const MOVE_SPEED = 5

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
  const visualRef = useRef<THREE.Group>(null)
  const rigidBodyRef = useRef<RapierRigidBody>(null)
  const bodyMeshRef = useRef<THREE.Mesh>(null)
  const headMeshRef = useRef<THREE.Mesh>(null)
  const keys = useKeyboard()
  const isMoving = useRef(false)

  // 외부에서 visual group 위치를 참조 (카메라 추종 등)
  useImperativeHandle(ref, () => ({
    getGroup: () => visualRef.current,
  }))

  useFrame(({ clock }) => {
    if (!rigidBodyRef.current || !visualRef.current) return

    const playerId = useGameStore.getState().playerId
    const playerState = useGameStore.getState().players[playerId]
    const isFrozen = playerState?.status === 'frozen'

    // 빙결 시 색 변경
    const targetColor = isFrozen ? COLOR_FROZEN : COLOR_NORMAL
    if (bodyMeshRef.current) {
      const mat = bodyMeshRef.current.material as THREE.MeshStandardMaterial
      mat.color.lerp(new THREE.Color(targetColor), 0.1)
    }
    if (headMeshRef.current) {
      const mat = headMeshRef.current.material as THREE.MeshStandardMaterial
      mat.color.lerp(new THREE.Color(targetColor), 0.1)
    }

    // 빙결 시 정지
    if (isFrozen) {
      rigidBodyRef.current.setLinvel({ x: 0, y: rigidBodyRef.current.linvel().y, z: 0 }, true)
      // visual 동기화
      const pos = rigidBodyRef.current.translation()
      visualRef.current.position.set(pos.x, 0, pos.z)
      return
    }

    // 이동 입력 (로컬 좌표)
    let inputX = 0
    let inputZ = 0
    const pressed = keys.current
    if (pressed.has('KeyW') || pressed.has('ArrowUp')) inputZ -= 1
    if (pressed.has('KeyS') || pressed.has('ArrowDown')) inputZ += 1
    if (pressed.has('KeyA') || pressed.has('ArrowLeft')) inputX -= 1
    if (pressed.has('KeyD') || pressed.has('ArrowRight')) inputX += 1

    const length = Math.sqrt(inputX * inputX + inputZ * inputZ)
    if (length > 0) {
      inputX /= length
      inputZ /= length
    }
    isMoving.current = length > 0

    // 카메라 yaw 기준으로 이동 방향 회전
    const cameraYaw = useCameraStore.getState().yaw
    const sin = Math.sin(cameraYaw)
    const cos = Math.cos(cameraYaw)
    const moveX = inputX * cos - inputZ * sin
    const moveZ = inputX * sin + inputZ * cos

    // velocity 설정 — y는 중력 유지
    const currentVelY = rigidBodyRef.current.linvel().y
    rigidBodyRef.current.setLinvel(
      { x: moveX * MOVE_SPEED, y: currentVelY, z: moveZ * MOVE_SPEED },
      true,
    )

    // visual을 rigid body 위치에 동기화
    const pos = rigidBodyRef.current.translation()
    visualRef.current.position.set(pos.x, 0, pos.z)

    // 이동 방향으로 회전
    if (length > 0) {
      const targetAngle = Math.atan2(moveX, moveZ)
      visualRef.current.rotation.y = THREE.MathUtils.lerp(
        visualRef.current.rotation.y,
        targetAngle,
        0.15,
      )
    }

    // 바운스 (visual만)
    const t = clock.getElapsedTime()
    const bounceAmount = isMoving.current ? 0.12 : 0.04
    const bounceSpeed = isMoving.current ? 8 : 2
    visualRef.current.position.y = Math.abs(Math.sin(t * bounceSpeed)) * bounceAmount
  })

  return (
    <>
      {/* 물리 바디 — 충돌 담당 */}
      <RigidBody
        ref={rigidBodyRef}
        type="dynamic"
        position={[position[0], 1, position[2]]}
        lockRotations
        colliders={false}
        mass={1}
        linearDamping={5}
      >
        <CapsuleCollider args={[0.4, 0.3]} />
      </RigidBody>

      {/* 비주얼 — rigid body 위치를 따라감 */}
      <group ref={visualRef} position={position}>
        <mesh ref={bodyMeshRef} position={[0, 0.6, 0]}>
          <capsuleGeometry args={[0.3, 0.6, 8, 16]} />
          <meshStandardMaterial color={COLOR_NORMAL} />
        </mesh>
        <mesh ref={headMeshRef} position={[0, 1.3, 0]}>
          <sphereGeometry args={[0.25, 16, 16]} />
          <meshStandardMaterial color={COLOR_NORMAL} />
        </mesh>
        <mesh position={[-0.1, 1.35, 0.22]}>
          <sphereGeometry args={[0.05, 8, 8]} />
          <meshBasicMaterial color="#07090D" />
        </mesh>
        <mesh position={[0.1, 1.35, 0.22]}>
          <sphereGeometry args={[0.05, 8, 8]} />
          <meshBasicMaterial color="#07090D" />
        </mesh>
      </group>
    </>
  )
})

export default Player
