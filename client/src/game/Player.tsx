/**
 * 플레이어 캐릭터 — Rapier dynamic body + Characters.tsx 비주얼
 * - RigidBody(dynamic) + CapsuleCollider (Characters.tsx 규격)
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
import { CharacterModel, COLLIDER } from './Characters'

const MOVE_SPEED = 5
const JUMP_FORCE = 5
const GROUND_THRESHOLD = 0.1

interface PlayerProps {
  position?: [number, number, number]
  characterId?: string
}

export interface PlayerHandle {
  getGroup: () => THREE.Group | null
}

const Player = forwardRef<PlayerHandle, PlayerProps>(function Player({
  position = [0, 0, 0],
  characterId = 'R01',
}: PlayerProps, ref) {
  const visualRef = useRef<THREE.Group>(null)
  const rigidBodyRef = useRef<RapierRigidBody>(null)
  const keys = useKeyboard()
  const isMoving = useRef(false)
  const { camera } = useThree()

  useImperativeHandle(ref, () => ({
    getGroup: () => visualRef.current,
  }))

  useFrame(({ clock }) => {
    if (!rigidBodyRef.current || !visualRef.current) return

    const playerId = useGameStore.getState().playerId
    const playerState = useGameStore.getState().players[playerId]
    const isFrozen = playerState?.status === 'frozen'

    // 빙결 시 정지
    if (isFrozen) {
      rigidBodyRef.current.setLinvel({ x: 0, y: rigidBodyRef.current.linvel().y, z: 0 }, true)
      const pos = rigidBodyRef.current.translation()
      visualRef.current.position.set(pos.x, pos.y - COLLIDER.offsetY, pos.z)
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

    // 점프
    const currentVel = rigidBodyRef.current.linvel()
    let velY = currentVel.y
    const isGrounded = Math.abs(velY) < GROUND_THRESHOLD
    if (pressed.has('Space') && isGrounded) {
      velY = JUMP_FORCE
    }

    rigidBodyRef.current.setLinvel(
      { x: moveX * MOVE_SPEED, y: velY, z: moveZ * MOVE_SPEED },
      true,
    )

    // visual을 rigid body 위치에 동기화
    const pos = rigidBodyRef.current.translation()
    visualRef.current.position.set(pos.x, pos.y - COLLIDER.offsetY, pos.z)

    // 이동 방향으로 회전
    if (isMoving.current) {
      const targetAngle = Math.atan2(moveX, moveZ)
      visualRef.current.rotation.y = THREE.MathUtils.lerp(
        visualRef.current.rotation.y,
        targetAngle,
        0.15,
      )
    }

    // 바운스
    if (isGrounded) {
      const t = clock.getElapsedTime()
      const bounceAmount = isMoving.current ? 0.08 : 0.03
      const bounceSpeed = isMoving.current ? 8 : 2
      visualRef.current.position.y += Math.abs(Math.sin(t * bounceSpeed)) * bounceAmount
    }
  })

  const playerId = useGameStore((s) => s.playerId)
  const isFrozen = useGameStore((s) => s.players[playerId]?.status === 'frozen')

  return (
    <>
      {/* 물리 바디 */}
      <RigidBody
        ref={rigidBodyRef}
        type="dynamic"
        position={[position[0], 1, position[2]]}
        lockRotations
        colliders={false}
        mass={1}
        linearDamping={5}
      >
        <CapsuleCollider args={[COLLIDER.halfHeight, COLLIDER.radius]} position={[0, COLLIDER.offsetY, 0]} />
      </RigidBody>

      {/* 비주얼 — CharacterModel */}
      <group ref={visualRef} position={position}>
        <CharacterModel id={characterId} frozen={isFrozen} />
      </group>
    </>
  )
})

export default Player
