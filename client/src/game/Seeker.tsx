/**
 * 술래 캐릭터 — Characters.tsx 비주얼
 * - FSM: PATROL → ALERT → CHASE / RUSH → GUARD
 * - 빙결 핑 감지 시 해당 위치로 추격
 * - 탈출 페이즈가 시작되면 활성 게이트를 선점해 경비
 */

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useGameStore } from '../stores/gameStore'
import { sendGameMessage } from '../hooks/useWebSocket'
import useSound from '../hooks/useSound'
import { CharacterModel } from './Characters'

type SeekerState = 'patrol' | 'alert' | 'chase' | 'rush' | 'guard'

const PATROL_SPEED = 1.8
const CHASE_SPEED = 3.2
const RUSH_SPEED = 5.2
const ALERT_DURATION = 1.5
const CHASE_ARRIVE_DIST = 1.5
const RUSH_ARRIVE_DIST = 1.4
const CATCH_DISTANCE = 1.1
const PROXIMITY_SOUND_RANGE = 18
const PROXIMITY_SOUND_MIN_INTERVAL = 0.38
const PROXIMITY_SOUND_MAX_INTERVAL = 1.55

// 순찰 웨이포인트
const WAYPOINTS: [number, number][] = [
  [-18, -18], [-8, -15], [0, -10], [15, -18], [18, -8],
  [0, 0], [-15, 10], [-8, 18], [0, 12], [15, 15], [18, 8], [5, 0],
]

interface SeekerProps {
  playerRef: React.RefObject<THREE.Group | null>
  rushTarget?: [number, number]
}

export default function Seeker({ playerRef, rushTarget }: SeekerProps) {
  const groupRef = useRef<THREE.Group>(null)
  const { playSeekerProximity } = useSound()

  const state = useRef<SeekerState>('patrol')
  const waypointIndex = useRef(0)
  const alertTimer = useRef(0)
  const chaseTarget = useRef<{ x: number; z: number } | null>(null)
  const lastFreezeTimestamp = useRef(0)
  const lastSoundTimestamp = useRef(0)
  const catchSent = useRef(false)
  const camoActive = useRef(false)
  const stillTimer = useRef(0)
  const lastPos = useRef(new THREE.Vector3(18, 0, -18))
  const lastPositionSync = useRef(0)
  const lastProximitySound = useRef(-Infinity)

  useFrame(({ clock }, delta) => {
    if (!groupRef.current) return

    const pos = groupRef.current.position
    const store = useGameStore.getState()
    const freezeEvent = store.lastFreezeEvent
    const soundEvent = store.lastSoundEvent
    const gameActive = store.phase === 'playing'
      || store.phase === 'final_spell'
      || store.phase === 'escape'

    if (!gameActive) {
      lastProximitySound.current = -Infinity
      pos.y = 0
      return
    }

    // 주문 성공 시 기존 행동을 중단하고 선택된 탈출구부터 선점한다.
    if (store.phase === 'escape' && rushTarget && state.current !== 'rush' && state.current !== 'guard') {
      state.current = 'rush'
      chaseTarget.current = null
    } else if (store.phase === 'playing' && state.current === 'guard') {
      // 새 라운드가 같은 씬에서 시작되더라도 경비 상태가 남지 않게 한다.
      state.current = 'patrol'
    }

    // 일반 발화도 위치 노출로 취급한다. RUSH/GUARD 중에는 탈출구 선점이 우선이다.
    if (
      soundEvent &&
      soundEvent.timestamp > lastSoundTimestamp.current &&
      state.current !== 'rush' &&
      state.current !== 'guard'
    ) {
      lastSoundTimestamp.current = soundEvent.timestamp
      chaseTarget.current = { ...soundEvent.position }
      state.current = 'alert'
      alertTimer.current = ALERT_DURATION
    }

    // 빙결 핑은 일반 발화보다 강한 단서이므로 진행 중 추격도 덮어쓴다.
    if (
      freezeEvent &&
      freezeEvent.timestamp > lastFreezeTimestamp.current &&
      state.current !== 'rush' &&
      state.current !== 'guard'
    ) {
      lastFreezeTimestamp.current = freezeEvent.timestamp
      chaseTarget.current = { ...freezeEvent.position }
      state.current = 'alert'
      alertTimer.current = ALERT_DURATION
    }

    // FSM
    switch (state.current) {
      case 'patrol': patrol(pos, delta); break
      case 'alert': alert(pos, delta); break
      case 'chase': chase(pos, delta); break
      case 'rush': rush(pos, delta); break
      case 'guard': break
    }

    // 포획 판정 전에 최신 술래 위치를 서버에 전달한다.
    if (
      (store.phase === 'playing' || store.phase === 'final_spell' || store.phase === 'escape')
      && clock.elapsedTime - lastPositionSync.current >= 0.1
    ) {
      sendGameMessage({
        type: 'action',
        payload: { action_type: 'actor_move', actor_id: 'seeker', x: pos.x, z: pos.z },
      })
      lastPositionSync.current = clock.elapsedTime
    }

    // 접촉 판정은 서버에 한 번만 신고하고 결과 판정은 game_over 응답에 맡긴다.
    const playerPos = playerRef.current?.position
    const playerState = store.players[store.playerId]
    const seekerState = Object.values(store.players).find((player) => player.role === 'seeker')
    const actorsAreActive = (!playerState || playerState.status === 'alive')
      && (!seekerState || seekerState.status === 'alive')
    if (playerPos && actorsAreActive) {
      const distance = Math.hypot(playerPos.x - pos.x, playerPos.z - pos.z)
      const proximity = THREE.MathUtils.clamp(1 - distance / PROXIMITY_SOUND_RANGE, 0, 1)
      const pulseInterval = THREE.MathUtils.lerp(
        PROXIMITY_SOUND_MAX_INTERVAL,
        PROXIMITY_SOUND_MIN_INTERVAL,
        proximity,
      )
      if (proximity > 0 && clock.elapsedTime - lastProximitySound.current >= pulseInterval) {
        playSeekerProximity(proximity)
        lastProximitySound.current = clock.elapsedTime
      }
    }

    if (
      !catchSent.current &&
      playerPos &&
      (store.phase === 'playing' || store.phase === 'final_spell' || store.phase === 'escape') &&
      Math.hypot(playerPos.x - pos.x, playerPos.z - pos.z) <= CATCH_DISTANCE
    ) {
      catchSent.current = sendGameMessage({
        type: 'action',
        payload: { action_type: 'seeker_catch' },
      })
    }

    // 위장 판정 — 정지 3초 후 발동, 이동 시 해제
    const moved = pos.distanceTo(lastPos.current) > 0.01
    lastPos.current.copy(pos)
    if (moved) {
      stillTimer.current = 0
      camoActive.current = false
    } else {
      stillTimer.current += delta
      if (stillTimer.current >= 3) camoActive.current = true
    }

    // 바운스
    const isRunning = state.current === 'chase' || state.current === 'rush'
    const bounceSpeed = isRunning ? 6 : 3
    const bounceAmount = isRunning ? 0.08 : 0.04
    pos.y = Math.abs(Math.sin(clock.getElapsedTime() * bounceSpeed)) * bounceAmount
  })

  function patrol(pos: THREE.Vector3, delta: number) {
    const target = WAYPOINTS[waypointIndex.current]
    const dx = target[0] - pos.x
    const dz = target[1] - pos.z
    const dist = Math.sqrt(dx * dx + dz * dz)

    if (dist < 0.5) {
      waypointIndex.current = (waypointIndex.current + 1) % WAYPOINTS.length
      return
    }

    const speed = PATROL_SPEED * delta
    pos.x += (dx / dist) * speed
    pos.z += (dz / dist) * speed

    const angle = Math.atan2(dx, dz)
    if (groupRef.current) {
      groupRef.current.rotation.y = THREE.MathUtils.lerp(
        groupRef.current.rotation.y, angle, 0.08
      )
    }
  }

  function alert(pos: THREE.Vector3, delta: number) {
    alertTimer.current -= delta

    if (chaseTarget.current && groupRef.current) {
      const dx = chaseTarget.current.x - pos.x
      const dz = chaseTarget.current.z - pos.z
      const angle = Math.atan2(dx, dz)
      groupRef.current.rotation.y = THREE.MathUtils.lerp(
        groupRef.current.rotation.y, angle, 0.15
      )
    }

    if (alertTimer.current <= 0) {
      state.current = 'chase'
    }
  }

  function chase(pos: THREE.Vector3, delta: number) {
    if (!chaseTarget.current) {
      state.current = 'patrol'
      return
    }

    const dx = chaseTarget.current.x - pos.x
    const dz = chaseTarget.current.z - pos.z
    const dist = Math.sqrt(dx * dx + dz * dz)

    if (dist < CHASE_ARRIVE_DIST) {
      chaseTarget.current = null
      state.current = 'patrol'
      return
    }

    const speed = CHASE_SPEED * delta
    pos.x += (dx / dist) * speed
    pos.z += (dz / dist) * speed

    if (groupRef.current) {
      const angle = Math.atan2(dx, dz)
      groupRef.current.rotation.y = THREE.MathUtils.lerp(
        groupRef.current.rotation.y, angle, 0.12
      )
    }
  }

  function rush(pos: THREE.Vector3, delta: number) {
    if (!rushTarget) {
      state.current = 'patrol'
      return
    }

    const dx = rushTarget[0] - pos.x
    const dz = rushTarget[1] - pos.z
    const dist = Math.sqrt(dx * dx + dz * dz)

    if (dist <= RUSH_ARRIVE_DIST) {
      state.current = 'guard'
      return
    }

    const step = Math.min(RUSH_SPEED * delta, dist - RUSH_ARRIVE_DIST)
    pos.x += (dx / dist) * step
    pos.z += (dz / dist) * step

    if (groupRef.current) {
      const angle = Math.atan2(dx, dz)
      groupRef.current.rotation.y = THREE.MathUtils.lerp(
        groupRef.current.rotation.y, angle, 0.18
      )
    }
  }

  return (
    <group ref={groupRef} position={[18, 0, -18]}>
      <CharacterModel id="R00" camo={camoActive.current} />
    </group>
  )
}
