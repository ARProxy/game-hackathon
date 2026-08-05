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
import { sendGameMessage } from '../hooks/useWebSocket'
import useSound from '../hooks/useSound'

const MOVE_SPEED = 5
const JUMP_FORCE = 5
const GROUND_THRESHOLD = 0.1
const MOVE_ACCELERATION = 18
const MOVE_DECELERATION = 26
const VISUAL_FOLLOW_SPEED = 30
const ROTATION_SPEED = 14
// 캐릭터 모델의 원점은 발바닥이다. 물리 바디 원점과 캡슐 하단의 차이를 보정한다.
const COLLIDER_BOTTOM_Y = COLLIDER.offsetY - COLLIDER.halfHeight - COLLIDER.radius

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
  const movementRef = useRef(0)
  const lastMotionPosition = useRef(new THREE.Vector3(position[0], position[1], position[2]))
  const lastFootstep = useRef(-Infinity)
  const rightFootstep = useRef(false)
  const lastPositionSync = useRef(0)
  const { camera } = useThree()
  const { playPlayerFootstep } = useSound()

  useImperativeHandle(ref, () => ({
    getGroup: () => visualRef.current,
  }))

  useFrame(({ clock }, delta) => {
    if (!rigidBodyRef.current || !visualRef.current) return

    const store = useGameStore.getState()
    const playerId = store.playerId
    const playerState = store.players[playerId]
    const isFrozen = playerState?.status === 'frozen'
    const controlsEnabled = !store.isPaused && (store.phase === 'playing'
      || store.phase === 'final_spell'
      || store.phase === 'escape')

    // 온보딩·결과 화면과 빙결 상태에서는 이동 및 위치 송신을 멈춘다.
    if (isFrozen || !controlsEnabled) {
      movementRef.current = 0
      rigidBodyRef.current.setLinvel({ x: 0, y: rigidBodyRef.current.linvel().y, z: 0 }, true)
      const pos = rigidBodyRef.current.translation()
      lastMotionPosition.current.set(pos.x, pos.y, pos.z)
      const follow = 1 - Math.exp(-VISUAL_FOLLOW_SPEED * delta)
      visualRef.current.position.lerp(
        new THREE.Vector3(pos.x, pos.y + COLLIDER_BOTTOM_Y, pos.z),
        follow,
      )
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

    const velocityResponse = isMoving.current ? MOVE_ACCELERATION : MOVE_DECELERATION
    const nextVelX = THREE.MathUtils.damp(currentVel.x, moveX * MOVE_SPEED, velocityResponse, delta)
    const nextVelZ = THREE.MathUtils.damp(currentVel.z, moveZ * MOVE_SPEED, velocityResponse, delta)
    rigidBodyRef.current.setLinvel({ x: nextVelX, y: velY, z: nextVelZ }, true)
    // visual을 rigid body 위치에 동기화
    const pos = rigidBodyRef.current.translation()
    const movedDistance = Math.hypot(
      pos.x - lastMotionPosition.current.x,
      pos.z - lastMotionPosition.current.z,
    )
    const measuredSpeed = delta > 0 ? movedDistance / delta : 0
    movementRef.current = THREE.MathUtils.clamp(measuredSpeed / MOVE_SPEED, 0, 1)
    lastMotionPosition.current.set(pos.x, pos.y, pos.z)

    const grounded = Math.abs(velY) < GROUND_THRESHOLD
    const footstepInterval = THREE.MathUtils.lerp(0.5, 0.34, movementRef.current)
    if (grounded && movementRef.current > 0.18 && clock.elapsedTime - lastFootstep.current >= footstepInterval) {
      rightFootstep.current = !rightFootstep.current
      playPlayerFootstep(rightFootstep.current, movementRef.current)
      lastFootstep.current = clock.elapsedTime
    }
    const follow = 1 - Math.exp(-VISUAL_FOLLOW_SPEED * delta)
    visualRef.current.position.lerp(
      new THREE.Vector3(pos.x, pos.y + COLLIDER_BOTTOM_Y, pos.z),
      follow,
    )

    // 서버가 빙결 핑과 청각 이벤트에 실제 좌표를 사용하도록 10Hz로 동기화한다.
    const now = clock.elapsedTime
    if (now - lastPositionSync.current >= 0.1) {
      sendGameMessage({
        type: 'action',
        payload: { action_type: 'move', x: pos.x, z: pos.z },
      })
      lastPositionSync.current = now
    }

    // 이동 방향으로 회전
    if (isMoving.current) {
      const targetAngle = Math.atan2(moveX, moveZ)
      const angleDelta = THREE.MathUtils.euclideanModulo(
        targetAngle - visualRef.current.rotation.y + Math.PI,
        Math.PI * 2,
      ) - Math.PI
      const turn = 1 - Math.exp(-ROTATION_SPEED * delta)
      visualRef.current.rotation.y += angleDelta * turn
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
        position={[position[0], position[1] - COLLIDER_BOTTOM_Y, position[2]]}
        lockRotations
        colliders={false}
        mass={1}
        linearDamping={5}
      >
        <CapsuleCollider args={[COLLIDER.halfHeight, COLLIDER.radius]} position={[0, COLLIDER.offsetY, 0]} />
      </RigidBody>

      {/* 비주얼 — CharacterModel */}
      <group ref={visualRef} position={position}>
        <CharacterModel id={characterId} frozen={isFrozen} movementRef={movementRef} />
      </group>
    </>
  )
})

export default Player
