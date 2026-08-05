/** 서버가 선택한 독립 목표를 표현하는 AI 동료 캐릭터. */
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useGameStore, type CompanionState } from '../stores/gameStore'
import { CharacterModel } from './Characters'
import companion from './companionContract.json'
import { sendGameMessage } from '../hooks/useWebSocket'

interface PartnerProps {
  characterId?: string
  spawn: readonly [number, number]
}

const SPEEDS: Partial<Record<CompanionState, number>> = {
  EXPLORE_ZONE: companion.exploreSpeed,
  INSPECT_CANDIDATE: companion.missionSpeed,
  AVOID_SEEKER: companion.avoidSpeed,
  RESCUE_TEAMMATE: companion.rescueSpeed,
  MOVE_TO_GATE: companion.gateSpeed,
  ESCAPE: companion.gateSpeed,
}

export default function Partner({ characterId = 'R05', spawn }: PartnerProps) {
  const groupRef = useRef<THREE.Group>(null)
  const lastAuthorityPosition = useRef<{ x: number; z: number } | null>(null)
  const lastThink = useRef(-Infinity)

  useFrame(({ clock }, delta) => {
    const group = groupRef.current
    if (!group) return
    const store = useGameStore.getState()
    const gameActive = store.phase === 'playing' || store.phase === 'final_spell' || store.phase === 'escape'
    if (gameActive && clock.elapsedTime - lastThink.current >= companion.thinkIntervalSeconds) {
      sendGameMessage({ type: 'action', payload: { action_type: 'companion_think' } })
      lastThink.current = clock.elapsedTime
    }
    const partnerState = Object.values(store.players).find((player) => player.role === 'ai_partner')
    if (partnerState?.status === 'eliminated') {
      group.visible = false
      return
    }
    group.visible = true
    const intent = store.companionIntent
    if (!intent) return

    const authority = intent.partnerPosition
    const previous = lastAuthorityPosition.current
    if (!previous || previous.x !== authority.x || previous.z !== authority.z) {
      group.position.x = THREE.MathUtils.lerp(group.position.x, authority.x, 0.72)
      group.position.z = THREE.MathUtils.lerp(group.position.z, authority.z, 0.72)
      lastAuthorityPosition.current = authority
    }

    const dx = intent.target.x - group.position.x
    const dz = intent.target.z - group.position.z
    const distance = Math.hypot(dx, dz)
    const speed = SPEEDS[intent.state] ?? 0
    if (speed > 0 && distance > companion.arrivalDistance) {
      const step = Math.min(speed * delta, distance - companion.arrivalDistance)
      group.position.x += dx / distance * step
      group.position.z += dz / distance * step
    }
    if (distance > 0.05) {
      group.rotation.y = THREE.MathUtils.lerp(group.rotation.y, Math.atan2(dx, dz), 0.15)
    }
    const active = speed > 0 || intent.state === 'INSPECT_CANDIDATE'
    group.position.y = active ? Math.abs(Math.sin(clock.elapsedTime * 7)) * 0.08 : 0
  })

  return (
    <group ref={groupRef} position={[spawn[0], 0, spawn[1]]}>
      <CharacterModel id={characterId} />
    </group>
  )
}
