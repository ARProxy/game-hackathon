/** 서버가 선택한 독립 목표를 표현하는 AI 동료 캐릭터. */
import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useGameStore, type CompanionState } from '../stores/gameStore'
import { CharacterModel } from './Characters'
import companion from './companionContract.json'
import { sendGameMessage } from '../hooks/useWebSocket'
import { floorHeight } from './spawnContract'
import { useCollisionAwarePlanarMotion } from './useCollisionAwarePlanarMotion'
import { projectAuthorityPosition } from './aiNavigation'

interface PartnerProps {
  playerRef: React.RefObject<THREE.Group | null>
  playerId?: string
  characterId?: string
  spawn: readonly [number, number, number]
  requestsThink?: boolean
}

const SPEEDS: Partial<Record<CompanionState, number>> = {
  EXPLORE_ZONE: companion.exploreSpeed,
  INSPECT_CANDIDATE: companion.missionSpeed,
  AVOID_SEEKER: companion.avoidSpeed,
  RESCUE_TEAMMATE: companion.rescueSpeed,
  FOLLOW_TO_FLOOR: companion.exploreSpeed,
  MOVE_TO_GATE: companion.gateSpeed,
  ESCAPE: companion.gateSpeed,
}
const ACTOR_CORRECTION_SPEED = 7
const _partnerPosition = new THREE.Vector3()
const _playerPosition = new THREE.Vector3()
const _displayTarget = { x: 0, z: 0 }

export default function Partner({
  playerRef,
  playerId = 'partner',
  characterId = 'R05',
  spawn,
  requestsThink = false,
}: PartnerProps) {
  const groupRef = useRef<THREE.Group>(null)
  const moveToward = useCollisionAwarePlanarMotion()
  const lastThink = useRef(-Infinity)
  const lastRescueAttempt = useRef(0)
  const partnerFrozen = useGameStore((state) => state.players[playerId]?.status === 'frozen')

  useEffect(() => {
    const rescue = (event: KeyboardEvent) => {
      if (event.code !== 'KeyE' || event.repeat || !groupRef.current || !playerRef.current) return
      const store = useGameStore.getState()
      const partner = store.players[playerId]
      const human = store.players[store.playerId]
      if (partner?.status !== 'frozen' || human?.status !== 'alive') return
      groupRef.current.getWorldPosition(_partnerPosition)
      playerRef.current.getWorldPosition(_playerPosition)
      if (_partnerPosition.distanceTo(_playerPosition) > 2.0) return
      if (Date.now() - lastRescueAttempt.current < 500) return
      event.preventDefault()
      lastRescueAttempt.current = Date.now()
      sendGameMessage({
        type: 'action',
        payload: { action_type: 'rescue_teammate', target_id: partner.playerId },
      })
    }
    window.addEventListener('keydown', rescue)
    return () => window.removeEventListener('keydown', rescue)
  }, [playerId, playerRef])

  useFrame(({ clock }, delta) => {
    const group = groupRef.current
    if (!group) return
    const store = useGameStore.getState()
    if (store.isPaused) return
    const gameActive = store.phase === 'playing' || store.phase === 'final_spell' || store.phase === 'escape'
    if (requestsThink && gameActive && clock.elapsedTime - lastThink.current >= companion.thinkIntervalSeconds) {
      sendGameMessage({ type: 'action', payload: { action_type: 'companion_think' } })
      lastThink.current = clock.elapsedTime
    }
    const partnerState = store.players[playerId]
    if (partnerState?.status === 'eliminated' || partnerState?.status === 'escaped') {
      group.visible = false
      return
    }
    group.visible = true
    const actorBaseY = partnerState?.position.floor
      ? partnerState.position.y ?? floorHeight(partnerState.position.floor)
      : spawn[1]
    if (partnerState?.status === 'frozen') {
      group.position.y = actorBaseY
      return
    }
    const intent = store.companionIntents[playerId] ?? (playerId === 'partner' ? store.companionIntent : null)
    if (!intent) {
      group.position.y = actorBaseY
      return
    }

    const authority = intent.partnerPosition
    const speed = SPEEDS[intent.state] ?? 0
    const predictionDistance = projectAuthorityPosition(
      authority,
      intent.target,
      speed,
      companion.thinkIntervalSeconds,
      intent.arrivalDistance ?? companion.arrivalDistance,
      _displayTarget,
    )
    const displayDx = _displayTarget.x - group.position.x
    const displayDz = _displayTarget.z - group.position.z
    const displayDistance = Math.hypot(displayDx, displayDz)
    if (displayDistance > 0.001) {
      const synchronizing = displayDistance > Math.max(0.6, predictionDistance + 0.2)
      const displaySpeed = synchronizing || speed <= 0 ? ACTOR_CORRECTION_SPEED : speed
      moveToward(
        group.position,
        displayDx,
        displayDz,
        Math.min(displaySpeed * delta, displayDistance),
        actorBaseY,
      )
    }

    const dx = intent.target.x - group.position.x
    const dz = intent.target.z - group.position.z
    const distance = Math.hypot(dx, dz)
    if (distance > 0.05) {
      group.rotation.y = THREE.MathUtils.lerp(group.rotation.y, Math.atan2(dx, dz), 0.15)
    }
    const active = partnerState?.status === 'alive' && (speed > 0 || intent.state === 'INSPECT_CANDIDATE')
    group.position.y = actorBaseY + (active ? Math.abs(Math.sin(clock.elapsedTime * 7)) * 0.08 : 0)
  })

  return (
    <group ref={groupRef} position={spawn}>
      <CharacterModel id={characterId} frozen={partnerFrozen} />
    </group>
  )
}
