/** 서버가 선택한 독립 목표를 표현하는 AI 동료 캐릭터. */
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useRapier } from '@react-three/rapier'
import * as THREE from 'three'
import { useGameStore, type CompanionState } from '../stores/gameStore'
import { CharacterModel } from './Characters'
import companion from './companionContract.json'
import { sendGameMessage } from '../hooks/useWebSocket'
import { planAvoidedStep } from './aiNavigation'

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
  MOVE_TO_GATE: companion.gateSpeed,
  ESCAPE: companion.gateSpeed,
}
const ACTOR_CORRECTION_SPEED = 7

export default function Partner({
  playerRef,
  playerId = 'partner',
  characterId = 'R05',
  spawn,
  requestsThink = false,
}: PartnerProps) {
  const groupRef = useRef<THREE.Group>(null)
  const { world, rapier } = useRapier()
  const navigationShape = useMemo(() => new rapier.Ball(0.36), [rapier])
  const baseY = spawn[1]
  const lastAuthorityPosition = useRef<{ x: number; z: number } | null>(null)
  const lastThink = useRef(-Infinity)
  const lastRescueAttempt = useRef(0)
  const avoidanceSide = useRef(1)
  const partnerFrozen = useGameStore((state) => state.players[playerId]?.status === 'frozen')
  const solidFilters = rapier.QueryFilterFlags.EXCLUDE_SENSORS
    | rapier.QueryFilterFlags.EXCLUDE_DYNAMIC

  const moveToward = (pos: THREE.Vector3, dx: number, dz: number, maxStep: number) => {
    const step = planAvoidedStep(dx, dz, maxStep, (direction, distance) => Boolean(world.castShape(
      { x: pos.x, y: baseY + 0.78, z: pos.z },
      { x: 0, y: 0, z: 0, w: 1 },
      { x: direction.x, y: 0, z: direction.z },
      navigationShape, 0.02, distance + 0.08, false, solidFilters,
    )), avoidanceSide.current)
    if (step.x === 0 && step.z === 0) avoidanceSide.current *= -1
    pos.x += step.x
    pos.z += step.z
  }

  useEffect(() => {
    const rescue = (event: KeyboardEvent) => {
      if (event.code !== 'KeyE' || event.repeat || !groupRef.current || !playerRef.current) return
      const store = useGameStore.getState()
      const partner = store.players[playerId]
      const human = store.players[store.playerId]
      if (partner?.status !== 'frozen' || human?.status !== 'alive') return
      if (groupRef.current.position.distanceTo(playerRef.current.position) > 2.0) return
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
    const intent = store.companionIntents[playerId] ?? (playerId === 'partner' ? store.companionIntent : null)
    if (!intent) return

    const authority = intent.partnerPosition
    const authorityDx = authority.x - group.position.x
    const authorityDz = authority.z - group.position.z
    const authorityDistance = Math.hypot(authorityDx, authorityDz)
    const correctingAuthority = authorityDistance > 0.12
    if (correctingAuthority) {
      moveToward(group.position, authorityDx, authorityDz, Math.min(ACTOR_CORRECTION_SPEED * delta, authorityDistance))
    }
    lastAuthorityPosition.current = authority

    const dx = intent.target.x - group.position.x
    const dz = intent.target.z - group.position.z
    const distance = Math.hypot(dx, dz)
    const speed = SPEEDS[intent.state] ?? 0
    if (!correctingAuthority && speed > 0 && distance > companion.arrivalDistance) {
      const step = Math.min(speed * delta, distance - companion.arrivalDistance)
      moveToward(group.position, dx, dz, step)
    }
    if (distance > 0.05) {
      group.rotation.y = THREE.MathUtils.lerp(group.rotation.y, Math.atan2(dx, dz), 0.15)
    }
    const active = partnerState?.status === 'alive' && (speed > 0 || intent.state === 'INSPECT_CANDIDATE')
    group.position.y = baseY + (active ? Math.abs(Math.sin(clock.elapsedTime * 7)) * 0.08 : 0)
  })

  return (
    <group ref={groupRef} position={spawn}>
      <CharacterModel id={characterId} frozen={partnerFrozen} />
    </group>
  )
}
