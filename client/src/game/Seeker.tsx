/**
 * 술래 캐릭터
 * - 크고 각진 형태, 마젠타색, 발광하는 눈
 * - FSM: PATROL → ALERT → CHASE
 * - 빙결 핑 감지 시 해당 위치로 추격
 * - AI 디렉터 긴장도에 따라 속도 조절
 */

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useGameStore } from '../stores/gameStore'

type SeekerState = 'patrol' | 'alert' | 'chase'

const COLOR_SEEKER = '#FF2F6E'
const PATROL_SPEED = 1.8
const CHASE_SPEED = 3.2
const ALERT_DURATION = 1.5 // 감지 후 대기 시간 (초)
const CHASE_ARRIVE_DIST = 1.5 // 목표 도달 판정 거리

// 순찰 웨이포인트 — 50x50 맵
const WAYPOINTS: [number, number][] = [
  [-18, -18],  // A구역 깊숙이
  [-8, -15],   // A구역 가장자리
  [0, -10],    // A-B 경계
  [15, -18],   // B구역 깊숙이
  [18, -8],    // B구역 가장자리
  [0, 0],      // 맵 중앙
  [-15, 10],   // C구역
  [-8, 18],    // C구역 가장자리
  [0, 12],     // C-D 경계
  [15, 15],    // D구역
  [18, 8],     // D구역 가장자리
  [5, 0],      // 중앙 부근
]

export default function Seeker() {
  const groupRef = useRef<THREE.Group>(null)
  const eyeLeftRef = useRef<THREE.Mesh>(null)
  const eyeRightRef = useRef<THREE.Mesh>(null)

  const state = useRef<SeekerState>('patrol')
  const waypointIndex = useRef(0)
  const alertTimer = useRef(0)
  const chaseTarget = useRef<{ x: number; z: number } | null>(null)
  const lastFreezeTimestamp = useRef(0)

  useFrame(({ clock }, delta) => {
    if (!groupRef.current) return

    const pos = groupRef.current.position
    const store = useGameStore.getState()
    const freezeEvent = store.lastFreezeEvent

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
      case 'patrol':
        patrol(pos, delta)
        break
      case 'alert':
        alert(pos, delta)
        break
      case 'chase':
        chase(pos, delta)
        break
    }

    // 눈이 항상 chaseTarget 또는 진행 방향을 바라봄
    updateEyes(pos)

    // 바운스 (순찰 시 느리게, 추격 시 빠르게)
    const bounceSpeed = state.current === 'chase' ? 6 : 3
    const bounceAmount = state.current === 'chase' ? 0.08 : 0.04
    pos.y = Math.abs(Math.sin(clock.getElapsedTime() * bounceSpeed)) * bounceAmount
  })

  function patrol(pos: THREE.Vector3, delta: number) {
    const target = WAYPOINTS[waypointIndex.current]
    const dx = target[0] - pos.x
    const dz = target[1] - pos.z
    const dist = Math.sqrt(dx * dx + dz * dz)

    if (dist < 0.5) {
      // 다음 웨이포인트
      waypointIndex.current = (waypointIndex.current + 1) % WAYPOINTS.length
      return
    }

    // 이동
    const speed = PATROL_SPEED * delta
    pos.x += (dx / dist) * speed
    pos.z += (dz / dist) * speed

    // 이동 방향으로 회전
    const angle = Math.atan2(dx, dz)
    if (groupRef.current) {
      groupRef.current.rotation.y = THREE.MathUtils.lerp(
        groupRef.current.rotation.y, angle, 0.08
      )
    }
  }

  function alert(pos: THREE.Vector3, delta: number) {
    // 감지 후 잠시 멈추고 목표 방향 주시
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
      // 도착 — 순찰로 복귀
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

  function updateEyes(pos: THREE.Vector3) {
    // 눈 발광 — 추격 시 더 밝게
    const intensity = state.current === 'chase' ? 1.0 : 0.6
    if (eyeLeftRef.current) {
      const mat = eyeLeftRef.current.material as THREE.MeshBasicMaterial
      mat.color.setHex(state.current === 'chase' ? 0xff0040 : 0xff2f6e)
    }
    if (eyeRightRef.current) {
      const mat = eyeRightRef.current.material as THREE.MeshBasicMaterial
      mat.color.setHex(state.current === 'chase' ? 0xff0040 : 0xff2f6e)
    }
  }

  return (
    <group ref={groupRef} position={[18, 0, -18]}>
      {/* 몸통 — 큰 박스 (각진 형태) */}
      <mesh position={[0, 0.8, 0]}>
        <boxGeometry args={[0.9, 1.4, 0.7]} />
        <meshStandardMaterial color="#2a0a18" />
      </mesh>

      {/* 머리 — 각진 박스 */}
      <mesh position={[0, 1.8, 0]}>
        <boxGeometry args={[0.7, 0.6, 0.6]} />
        <meshStandardMaterial color="#2a0a18" />
      </mesh>

      {/* 눈 — 발광 */}
      <mesh ref={eyeLeftRef} position={[-0.15, 1.85, 0.31]}>
        <sphereGeometry args={[0.07, 8, 8]} />
        <meshBasicMaterial color={COLOR_SEEKER} />
      </mesh>
      <mesh ref={eyeRightRef} position={[0.15, 1.85, 0.31]}>
        <sphereGeometry args={[0.07, 8, 8]} />
        <meshBasicMaterial color={COLOR_SEEKER} />
      </mesh>

      {/* 눈 발광 라이트 */}
      <pointLight position={[0, 1.85, 0.4]} intensity={2} distance={4} color={COLOR_SEEKER} />
    </group>
  )
}
