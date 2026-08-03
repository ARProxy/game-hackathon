/**
 * AI 동료 캐릭터
 * - 작고 둥근 형태, 라임색
 * - 평소: 플레이어 주변을 따라다님
 * - 플레이어 빙결 시: 달려가서 구조 ("땡")
 * - 구조 범위에 도달하면 자동으로 빙결 해제
 */

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useGameStore } from '../stores/gameStore'

const COLOR_PARTNER = '#B6FF3D'
const FOLLOW_SPEED = 3.5
const RESCUE_SPEED = 5.0
const FOLLOW_DISTANCE = 2.5  // 플레이어와 유지할 거리
const RESCUE_DISTANCE = 1.2  // 구조 판정 거리
const ORBIT_SPEED = 0.8      // 플레이어 주변 공전 속도

interface PartnerProps {
  playerRef: React.RefObject<THREE.Group | null>
}

export default function Partner({ playerRef }: PartnerProps) {
  const groupRef = useRef<THREE.Group>(null)
  const rescuing = useRef(false)

  useFrame(({ clock }, delta) => {
    if (!groupRef.current || !playerRef.current) return

    const pos = groupRef.current.position
    const playerPos = playerRef.current.position
    const store = useGameStore.getState()
    const playerId = store.playerId
    const playerState = store.players[playerId]
    const isFrozen = playerState?.status === 'frozen'

    if (isFrozen) {
      // 구조 모드 — 빙결된 플레이어에게 달려감
      rescuing.current = true
      const dx = playerPos.x - pos.x
      const dz = playerPos.z - pos.z
      const dist = Math.sqrt(dx * dx + dz * dz)

      if (dist < RESCUE_DISTANCE) {
        // 구조 성공!
        store.unfreezePlayer(playerId)
        rescuing.current = false
      } else {
        // 달려가기
        const speed = RESCUE_SPEED * delta
        pos.x += (dx / dist) * speed
        pos.z += (dz / dist) * speed
      }

      // 플레이어 방향으로 회전
      if (groupRef.current) {
        const angle = Math.atan2(dx, dz)
        groupRef.current.rotation.y = THREE.MathUtils.lerp(
          groupRef.current.rotation.y, angle, 0.15
        )
      }

      // 구조 중 빠른 바운스
      pos.y = Math.abs(Math.sin(clock.getElapsedTime() * 10)) * 0.15
    } else {
      // 따라다니기 — 플레이어 주변 공전
      rescuing.current = false
      const t = clock.getElapsedTime() * ORBIT_SPEED
      const targetX = playerPos.x + Math.cos(t) * FOLLOW_DISTANCE
      const targetZ = playerPos.z + Math.sin(t) * FOLLOW_DISTANCE

      pos.x = THREE.MathUtils.lerp(pos.x, targetX, 0.05)
      pos.z = THREE.MathUtils.lerp(pos.z, targetZ, 0.05)

      // 플레이어 방향으로 회전
      const dx = playerPos.x - pos.x
      const dz = playerPos.z - pos.z
      if (groupRef.current) {
        const angle = Math.atan2(dx, dz)
        groupRef.current.rotation.y = THREE.MathUtils.lerp(
          groupRef.current.rotation.y, angle, 0.08
        )
      }

      // idle 바운스
      pos.y = Math.abs(Math.sin(clock.getElapsedTime() * 3)) * 0.05
    }
  })

  return (
    <group ref={groupRef} position={[2, 0, 2]}>
      {/* 몸통 — 작은 구 */}
      <mesh position={[0, 0.4, 0]}>
        <sphereGeometry args={[0.3, 16, 16]} />
        <meshStandardMaterial color={COLOR_PARTNER} />
      </mesh>

      {/* 머리 — 더 작은 구 */}
      <mesh position={[0, 0.85, 0]}>
        <sphereGeometry args={[0.2, 16, 16]} />
        <meshStandardMaterial color={COLOR_PARTNER} />
      </mesh>

      {/* 눈 */}
      <mesh position={[-0.07, 0.9, 0.18]}>
        <sphereGeometry args={[0.04, 8, 8]} />
        <meshBasicMaterial color="#07090D" />
      </mesh>
      <mesh position={[0.07, 0.9, 0.18]}>
        <sphereGeometry args={[0.04, 8, 8]} />
        <meshBasicMaterial color="#07090D" />
      </mesh>

      {/* 작은 발광 — 동료 위치 식별 */}
      <pointLight position={[0, 0.8, 0]} intensity={1} distance={3} color={COLOR_PARTNER} />
    </group>
  )
}
