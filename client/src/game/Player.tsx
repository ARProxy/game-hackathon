/**
 * 플레이어 캐릭터 — Rapier dynamic body + Characters.tsx 비주얼
 * - RigidBody(dynamic) + CapsuleCollider (Characters.tsx 규격)
 * - velocity로 이동 → rapier가 충돌 처리
 * - 회전 잠금, 중력 적용
 */

import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
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
const JUMP_FORCE = 6
const GROUND_THRESHOLD = 0.3
const MOVE_ACCELERATION = 12
const MOVE_DECELERATION = 20
const ROTATION_SPEED = 14
const FALL_RECOVERY_Y = -8
// 캐릭터 모델의 원점은 발바닥이다. 물리 바디 원점과 캡슐 하단의 차이를 보정한다.
const COLLIDER_BOTTOM_Y = COLLIDER.offsetY - COLLIDER.halfHeight - COLLIDER.radius
// useFrame 내에서 매 프레임 할당하지 않도록 재사용 벡터
const _forward = new THREE.Vector3()
const _right = new THREE.Vector3()
const _move = new THREE.Vector3()
const _up = new THREE.Vector3(0, 1, 0)

interface PlayerProps {
  position?: [number, number, number]
  characterId?: string
}

export interface PlayerHandle {
  getGroup: () => THREE.Group | null
  moveBy: (x: number, y: number, z: number) => void
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
  const lastAuthorityFloor = useRef<string | undefined>(undefined)
  const lastSafePosition = useRef(new THREE.Vector3(position[0], position[1] - COLLIDER_BOTTOM_Y, position[2]))
  const { camera } = useThree()
  const { playPlayerFootstep } = useSound()

  useImperativeHandle(ref, () => ({
    getGroup: () => visualRef.current,
    moveBy: (x, y, z) => {
      const body = rigidBodyRef.current
      if (!body) return
      const position = body.translation()
      body.setTranslation({ x: position.x + x, y: position.y + y, z: position.z + z }, true)
      body.setLinvel({ x: 0, y: 0, z: 0 }, true)
    },
  }))

  const playerId = useGameStore((s) => s.playerId)
  const authoritativeFloor = useGameStore((s) => s.players[playerId]?.position.floor)
  useEffect(() => {
    const authoritativePosition = useGameStore.getState().players[playerId]?.position
    if (
      !rigidBodyRef.current
      || !authoritativePosition?.floor
      || lastAuthorityFloor.current === authoritativePosition.floor
    ) return
    rigidBodyRef.current.setTranslation({
      x: authoritativePosition.x,
      y: (authoritativePosition.y ?? 0) - COLLIDER_BOTTOM_Y,
      z: authoritativePosition.z,
    }, true)
    rigidBodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true)
    lastAuthorityFloor.current = authoritativePosition.floor
  }, [authoritativeFloor, playerId])

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
      return
    }

    // 카메라 기준 forward/right 벡터 계산
    camera.getWorldDirection(_forward)
    _forward.y = 0
    _forward.normalize()
    _right.crossVectors(_forward, _up).normalize()

    // WASD 입력
    const pressed = keys.current
    _move.set(0, 0, 0)
    if (pressed.has('KeyW') || pressed.has('ArrowUp')) _move.add(_forward)
    if (pressed.has('KeyS') || pressed.has('ArrowDown')) _move.sub(_forward)
    if (pressed.has('KeyD') || pressed.has('ArrowRight')) _move.add(_right)
    if (pressed.has('KeyA') || pressed.has('ArrowLeft')) _move.sub(_right)

    if (_move.lengthSq() > 0) _move.normalize()
    isMoving.current = _move.lengthSq() > 0

    const moveX = _move.x
    const moveZ = _move.z

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
    // 위치 렌더링은 RigidBody 자식 계층에서 Rapier의 고정 틱 보간을 그대로 사용한다.
    const pos = rigidBodyRef.current.translation()
    if (pos.y < FALL_RECOVERY_Y) {
      rigidBodyRef.current.setTranslation(lastSafePosition.current, true)
      rigidBodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true)
      return
    }
    const movedDistance = Math.hypot(
      pos.x - lastMotionPosition.current.x,
      pos.z - lastMotionPosition.current.z,
    )
    const measuredSpeed = delta > 0 ? movedDistance / delta : 0
    movementRef.current = THREE.MathUtils.clamp(measuredSpeed / MOVE_SPEED, 0, 1)
    lastMotionPosition.current.set(pos.x, pos.y, pos.z)

    const grounded = Math.abs(velY) < GROUND_THRESHOLD
    if (grounded) lastSafePosition.current.set(pos.x, pos.y, pos.z)
    const footstepInterval = THREE.MathUtils.lerp(0.5, 0.34, movementRef.current)
    if (grounded && movementRef.current > 0.18 && clock.elapsedTime - lastFootstep.current >= footstepInterval) {
      rightFootstep.current = !rightFootstep.current
      playPlayerFootstep(rightFootstep.current, movementRef.current)
      lastFootstep.current = clock.elapsedTime
    }
    // 서버가 빙결 핑과 청각 이벤트에 실제 좌표를 사용하도록 10Hz로 동기화한다.
    const now = clock.elapsedTime
    if (now - lastPositionSync.current >= 0.1) {
      const authorityFloor = playerState?.position.floor
      const currentFloor = authorityFloor === 'B1' || authorityFloor === 'FIELD'
        ? authorityFloor
        : authorityFloor ?? (pos.y >= 10.2 ? 'ROOF' : pos.y >= 6.6 ? 'F3' : pos.y >= 3 ? 'F2' : 'F1')
      store.updatePlayer(playerId, {
        position: {
          ...playerState?.position,
          x: pos.x,
          y: pos.y + COLLIDER_BOTTOM_Y,
          z: pos.z,
        },
      })
      if (store.currentFloor !== currentFloor) store.setCurrentFloor(currentFloor)
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
        ccd
        mass={1}
        linearDamping={0.5}
        gravityScale={2.2}
      >
        <CapsuleCollider args={[COLLIDER.halfHeight, COLLIDER.radius]} position={[0, COLLIDER.offsetY, 0]} />
        {/* Rapier가 물리 고정 틱 사이를 보간한 transform을 비주얼과 카메라가 함께 사용한다. */}
        <group ref={visualRef} position={[0, COLLIDER_BOTTOM_Y, 0]}>
          <CharacterModel id={characterId} frozen={isFrozen} movementRef={movementRef} />
        </group>
      </RigidBody>
    </>
  )
})

export default Player
