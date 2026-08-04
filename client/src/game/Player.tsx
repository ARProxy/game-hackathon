/**
 * 플레이어 캐릭터 — Rapier dynamic body
 * - RigidBody(dynamic) + CapsuleCollider
 * - velocity로 이동 → rapier가 충돌 처리
 * - 회전 잠금, 중력 적용
 */

import { useRef, forwardRef, useImperativeHandle } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { RigidBody, CapsuleCollider } from '@react-three/rapier'
import type { RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import useKeyboard from '../hooks/useKeyboard'
import { useGameStore } from '../stores/gameStore'

const MOVE_SPEED = 5
const JUMP_FORCE = 5
const GROUND_THRESHOLD = 0.1 // 바닥 판정 y 속도 임계값

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
  const { camera } = useThree()

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

    // 카메라 기준 forward/right 벡터 계산
    const forward = new THREE.Vector3()
    camera.getWorldDirection(forward)
    forward.y = 0
    forward.normalize()

    const right = new THREE.Vector3()
    right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize()

    // WASD 입력
    const pressed = keys.current
    const move = new THREE.Vector3(0, 0, 0)
    if (pressed.has('KeyW') || pressed.has('ArrowUp')) move.add(forward)
    if (pressed.has('KeyS') || pressed.has('ArrowDown')) move.sub(forward)
    if (pressed.has('KeyD') || pressed.has('ArrowRight')) move.add(right)
    if (pressed.has('KeyA') || pressed.has('ArrowLeft')) move.sub(right)

    if (move.lengthSq() > 0) move.normalize()
    isMoving.current = move.lengthSq() > 0

    const moveX = move.x
    const moveZ = move.z

    // 점프 — Space키, 바닥에 있을 때만
    const currentVel = rigidBodyRef.current.linvel()
    let velY = currentVel.y
    const isGrounded = Math.abs(velY) < GROUND_THRESHOLD
    if (pressed.has('Space') && isGrounded) {
      velY = JUMP_FORCE
    }

    // velocity 설정
    rigidBodyRef.current.setLinvel(
      { x: moveX * MOVE_SPEED, y: velY, z: moveZ * MOVE_SPEED },
      true,
    )

    // visual을 rigid body 위치에 동기화 (y도 포함 — 점프/낙하)
    const pos = rigidBodyRef.current.translation()
    visualRef.current.position.set(pos.x, pos.y - 0.6, pos.z)

    // 이동 방향으로 회전
    if (isMoving.current) {
      const targetAngle = Math.atan2(moveX, moveZ)
      visualRef.current.rotation.y = THREE.MathUtils.lerp(
        visualRef.current.rotation.y,
        targetAngle,
        0.15,
      )
    }

    // 바운스 — 바닥에 있을 때만 (점프/낙하 중에는 꺼짐)
    if (isGrounded) {
      const t = clock.getElapsedTime()
      const bounceAmount = isMoving.current ? 0.08 : 0.03
      const bounceSpeed = isMoving.current ? 8 : 2
      visualRef.current.position.y += Math.abs(Math.sin(t * bounceSpeed)) * bounceAmount
    }
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
