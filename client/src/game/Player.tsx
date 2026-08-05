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

const MOVE_SPEED = 5
const JUMP_FORCE = 5
const GROUND_THRESHOLD = 0.1
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
  const lastPositionSync = useRef(0)
  const { camera } = useThree()

  useImperativeHandle(ref, () => ({
    getGroup: () => visualRef.current,
  }))

  useFrame(({ clock }) => {
    if (!rigidBodyRef.current || !visualRef.current) return

    const store = useGameStore.getState()
    const playerId = store.playerId
    const playerState = store.players[playerId]
    const isFrozen = playerState?.status === 'frozen'
    const controlsEnabled = store.phase === 'playing'
      || store.phase === 'final_spell'
      || store.phase === 'escape'

    // 온보딩·결과 화면과 빙결 상태에서는 이동 및 위치 송신을 멈춘다.
    if (isFrozen || !controlsEnabled) {
      rigidBodyRef.current.setLinvel({ x: 0, y: rigidBodyRef.current.linvel().y, z: 0 }, true)
      const pos = rigidBodyRef.current.translation()
      visualRef.current.position.set(pos.x, pos.y + COLLIDER_BOTTOM_Y, pos.z)
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
    visualRef.current.position.set(pos.x, pos.y + COLLIDER_BOTTOM_Y, pos.z)

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
      visualRef.current.rotation.y = THREE.MathUtils.lerp(
        visualRef.current.rotation.y,
        targetAngle,
        0.15,
      )
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
        <CharacterModel id={characterId} frozen={isFrozen} />
      </group>
    </>
  )
})

export default Player
