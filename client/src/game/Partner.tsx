/**
 * AI 동료 캐릭터 — Characters.tsx 비주얼
 * - 플레이어 주변을 따라다님
 * - 빙결 시 달려가서 구조 ("땡")
 */

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useGameStore } from '../stores/gameStore'
import { CharacterModel } from './Characters'
import { sendGameMessage } from '../hooks/useWebSocket'

const RESCUE_SPEED = 5.0
const MISSION_SPEED = 4.2
const FOLLOW_DISTANCE = 2.5
const RESCUE_DISTANCE = 1.2
const INSPECT_DISTANCE = 0.8
const ORBIT_SPEED = 0.8

interface PartnerProps {
  playerRef: React.RefObject<THREE.Group | null>
  characterId?: string
}

export default function Partner({ playerRef, characterId = 'R05' }: PartnerProps) {
  const groupRef = useRef<THREE.Group>(null)
  const rescuing = useRef(false)
  const rescueRequested = useRef(false)
  const inspectRequestedFor = useRef<string | null>(null)

  useFrame(({ clock }, delta) => {
    if (!groupRef.current || !playerRef.current) return

    const pos = groupRef.current.position
    const playerPos = playerRef.current.position
    const store = useGameStore.getState()
    const playerId = store.playerId
    const playerState = store.players[playerId]
    const isFrozen = playerState?.status === 'frozen'
    const target = store.partnerTarget

    if (isFrozen) {
      rescuing.current = true
      const dx = playerPos.x - pos.x
      const dz = playerPos.z - pos.z
      const dist = Math.sqrt(dx * dx + dz * dz)

      if (dist < RESCUE_DISTANCE) {
        if (!rescueRequested.current) {
          rescueRequested.current = sendGameMessage({
            type: 'action',
            payload: { action_type: 'rescue', actor_id: 'partner', target_id: playerId },
          })
        }
      } else {
        const speed = RESCUE_SPEED * delta
        pos.x += (dx / dist) * speed
        pos.z += (dz / dist) * speed
      }

      if (groupRef.current) {
        const angle = Math.atan2(dx, dz)
        groupRef.current.rotation.y = THREE.MathUtils.lerp(
          groupRef.current.rotation.y, angle, 0.15
        )
      }

      pos.y = Math.abs(Math.sin(clock.getElapsedTime() * 10)) * 0.15
    } else if (target) {
      rescuing.current = false
      rescueRequested.current = false
      if (inspectRequestedFor.current !== target.propId) inspectRequestedFor.current = null

      const dx = target.position.x - pos.x
      const dz = target.position.z - pos.z
      const dist = Math.sqrt(dx * dx + dz * dz)

      if (dist <= INSPECT_DISTANCE) {
        if (inspectRequestedFor.current !== target.propId) {
          const sent = sendGameMessage({
            type: 'action',
            payload: {
              action_type: 'inspect_prop',
              actor_id: 'partner',
              prop_id: target.propId,
            },
          })
          if (sent) {
            inspectRequestedFor.current = target.propId
            store.setInspectingProp(target.propId)
          }
        }
      } else {
        const step = Math.min(MISSION_SPEED * delta, dist - INSPECT_DISTANCE)
        pos.x += (dx / dist) * step
        pos.z += (dz / dist) * step
      }

      const angle = Math.atan2(dx, dz)
      groupRef.current.rotation.y = THREE.MathUtils.lerp(
        groupRef.current.rotation.y, angle, 0.15
      )
      pos.y = Math.abs(Math.sin(clock.getElapsedTime() * 7)) * 0.09
    } else {
      rescuing.current = false
      rescueRequested.current = false
      inspectRequestedFor.current = null
      const t = clock.getElapsedTime() * ORBIT_SPEED
      const targetX = playerPos.x + Math.cos(t) * FOLLOW_DISTANCE
      const targetZ = playerPos.z + Math.sin(t) * FOLLOW_DISTANCE

      pos.x = THREE.MathUtils.lerp(pos.x, targetX, 0.05)
      pos.z = THREE.MathUtils.lerp(pos.z, targetZ, 0.05)

      const dx = playerPos.x - pos.x
      const dz = playerPos.z - pos.z
      if (groupRef.current) {
        const angle = Math.atan2(dx, dz)
        groupRef.current.rotation.y = THREE.MathUtils.lerp(
          groupRef.current.rotation.y, angle, 0.08
        )
      }

      pos.y = Math.abs(Math.sin(clock.getElapsedTime() * 3)) * 0.05
    }
  })

  return (
    <group ref={groupRef} position={[2, 0, 2]}>
      <CharacterModel id={characterId} />
    </group>
  )
}
