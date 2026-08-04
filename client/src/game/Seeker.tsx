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
import { CharacterModel } from './Characters'

type SeekerState = 'patrol' | 'alert' | 'chase' | 'rush' | 'guard'

const PATROL_SPEED = 1.8
const CHASE_SPEED = 3.2
const RUSH_SPEED = 5.2
const ALERT_DURATION = 1.5
const CHASE_ARRIVE_DIST = 1.5
const RUSH_ARRIVE_DIST = 1.4

// 순찰 웨이포인트
const WAYPOINTS: [number, number][] = [
  [-18, -18], [-8, -15], [0, -10], [15, -18], [18, -8],
  [0, 0], [-15, 10], [-8, 18], [0, 12], [15, 15], [18, 8], [5, 0],
]

export default function Seeker({ rushTarget }: { rushTarget?: [number, number] }) {
  const groupRef = useRef<THREE.Group>(null)

  const state = useRef<SeekerState>('patrol')
  const waypointIndex = useRef(0)
  const alertTimer = useRef(0)
  const chaseTarget = useRef<{ x: number; z: number } | null>(null)
  const lastFreezeTimestamp = useRef(0)
  const camoActive = useRef(false)
  const stillTimer = useRef(0)
  const lastPos = useRef(new THREE.Vector3(18, 0, -18))

  useFrame(({ clock }, delta) => {
    if (!groupRef.current) return

    const pos = groupRef.current.position
    const store = useGameStore.getState()
    const freezeEvent = store.lastFreezeEvent

    // 주문 성공 시 기존 행동을 중단하고 선택된 탈출구부터 선점한다.
    if (store.phase === 'escape' && rushTarget && state.current !== 'rush' && state.current !== 'guard') {
      state.current = 'rush'
      chaseTarget.current = null
    } else if (store.phase === 'playing' && state.current === 'guard') {
      // 새 라운드가 같은 씬에서 시작되더라도 경비 상태가 남지 않게 한다.
      state.current = 'patrol'
    }

    // 빙결 이벤트 감지 → ALERT 전환
    if (
      freezeEvent &&
      freezeEvent.timestamp > lastFreezeTimestamp.current &&
      state.current === 'patrol'
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
