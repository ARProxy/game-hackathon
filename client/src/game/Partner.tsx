/**
 * AI 동료 캐릭터 — Characters.tsx 비주얼
 * - 플레이어 주변을 따라다님
 * - 빙결 시 달려가서 구조 ("땡")
 */

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useRapier } from '@react-three/rapier'
import * as THREE from 'three'
import { useGameStore } from '../stores/gameStore'
import { CharacterModel } from './Characters'
import { sendGameMessage } from '../hooks/useWebSocket'
import { planAvoidedStep } from './aiNavigation'
import rescueContract from './rescueContract.json'
import missionPacing from './missionPacingContract.json'

const RESCUE_SPEED = 5.0
const MISSION_SPEED = 4.2
const FOLLOW_DISTANCE = 2.5
const RESCUE_DISTANCE = 1.2
const INSPECT_DISTANCE = 0.8
const ORBIT_SPEED = 0.8
const RESCUE_RETRY_SECONDS = 0.5

interface PartnerProps {
  playerRef: React.RefObject<THREE.Group | null>
  characterId?: string
  spawn: readonly [number, number]
}

export default function Partner({ playerRef, characterId = 'R05', spawn }: PartnerProps) {
  const groupRef = useRef<THREE.Group>(null)
  const { world, rapier } = useRapier()
  const navigationShape = useMemo(() => new rapier.Ball(0.34), [rapier])
  const rescuing = useRef(false)
  const lastRescueRequestAt = useRef(-Infinity)
  const inspectRequestedFor = useRef<string | null>(null)
  const inspectionStartedFor = useRef<string | null>(null)
  const inspectionStartedAt = useRef(0)
  const lastPositionSync = useRef(0)
  const avoidanceSide = useRef(1)

  const moveToward = (pos: THREE.Vector3, dx: number, dz: number, maxStep: number) => {
    const filters = rapier.QueryFilterFlags.EXCLUDE_SENSORS | rapier.QueryFilterFlags.ONLY_FIXED
    const step = planAvoidedStep(dx, dz, maxStep, (direction, distance) => Boolean(world.castShape(
      { x: pos.x, y: 0.75, z: pos.z },
      { x: 0, y: 0, z: 0, w: 1 },
      { x: direction.x, y: 0, z: direction.z },
      navigationShape,
      0.02,
      distance + 0.08,
      false,
      filters,
    )), avoidanceSide.current)
    if (step.x === 0 && step.z === 0) avoidanceSide.current *= -1
    pos.x += step.x
    pos.z += step.z
  }

  useFrame(({ clock }, delta) => {
    if (!groupRef.current || !playerRef.current) return

    const pos = groupRef.current.position
    const playerPos = playerRef.current.position
    const store = useGameStore.getState()
    const playerId = store.playerId
    const playerState = store.players[playerId]
    const isFrozen = playerState?.status === 'frozen'
    const target = store.partnerTarget
    const freezeElapsedMs = store.lastFreezeEvent?.playerId === playerId
      ? Date.now() - store.lastFreezeEvent.timestamp
      : 0
    const shouldRescue = isFrozen && (
      store.rescueRequested || freezeElapsedMs >= rescueContract.autoDelayMs
    )
    const gameActive = store.phase === 'playing'
      || store.phase === 'final_spell'
      || store.phase === 'escape'

    if (!gameActive) {
      pos.y = 0
      return
    }

    const advanceMission = () => {
      if (!target) return false
      rescuing.current = false
      lastRescueRequestAt.current = -Infinity
      if (inspectRequestedFor.current !== target.propId) inspectRequestedFor.current = null

      const dx = target.position.x - pos.x
      const dz = target.position.z - pos.z
      const dist = Math.sqrt(dx * dx + dz * dz)
      if (dist <= INSPECT_DISTANCE) {
        if (store.inspectingPropId !== target.propId) store.setInspectingProp(target.propId)
        if (inspectionStartedFor.current !== target.propId) {
          inspectionStartedFor.current = target.propId
          inspectionStartedAt.current = Date.now()
        }
        if (inspectRequestedFor.current !== target.propId) {
          if (Date.now() - inspectionStartedAt.current < missionPacing.inspectionDurationMs) return true
          const sent = sendGameMessage({
            type: 'action',
            payload: { action_type: 'inspect_prop', actor_id: 'partner', prop_id: target.propId },
          })
          if (sent) {
            inspectRequestedFor.current = target.propId
          }
        }
      } else {
        inspectionStartedFor.current = null
        const step = Math.min(MISSION_SPEED * delta, dist - INSPECT_DISTANCE)
        moveToward(pos, dx, dz, step)
      }
      const angle = Math.atan2(dx, dz)
      groupRef.current!.rotation.y = THREE.MathUtils.lerp(groupRef.current!.rotation.y, angle, 0.15)
      pos.y = Math.abs(Math.sin(clock.getElapsedTime() * 7)) * 0.09
      return true
    }

    if (shouldRescue) {
      rescuing.current = true
      const dx = playerPos.x - pos.x
      const dz = playerPos.z - pos.z
      const dist = Math.sqrt(dx * dx + dz * dz)

      if (dist < RESCUE_DISTANCE) {
        if (clock.elapsedTime - lastRescueRequestAt.current >= RESCUE_RETRY_SECONDS) {
          const sent = sendGameMessage({
            type: 'action',
            payload: { action_type: 'rescue', actor_id: 'partner', target_id: playerId },
          })
          if (sent) lastRescueRequestAt.current = clock.elapsedTime
        }
      } else {
        moveToward(pos, dx, dz, RESCUE_SPEED * delta)
      }

      if (groupRef.current) {
        const angle = Math.atan2(dx, dz)
        groupRef.current.rotation.y = THREE.MathUtils.lerp(
          groupRef.current.rotation.y, angle, 0.15
        )
      }

      pos.y = Math.abs(Math.sin(clock.getElapsedTime() * 10)) * 0.15
    } else if (advanceMission()) {
      // 구조를 즉시 요청하지 않으면 최대 5초 동안 진행 중인 조사를 마칠 수 있다.
    } else if (isFrozen) {
      rescuing.current = false
      pos.y = Math.abs(Math.sin(clock.getElapsedTime() * 4)) * 0.04
    } else {
      rescuing.current = false
      lastRescueRequestAt.current = -Infinity
      inspectRequestedFor.current = null
      inspectionStartedFor.current = null
      const t = clock.getElapsedTime() * ORBIT_SPEED
      const targetX = playerPos.x + Math.cos(t) * FOLLOW_DISTANCE
      const targetZ = playerPos.z + Math.sin(t) * FOLLOW_DISTANCE

      moveToward(pos, targetX - pos.x, targetZ - pos.z,
        Math.hypot(targetX - pos.x, targetZ - pos.z) * 0.05)

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

    if (
      (store.phase === 'playing' || store.phase === 'final_spell' || store.phase === 'escape')
      && clock.elapsedTime - lastPositionSync.current >= 0.1
    ) {
      sendGameMessage({
        type: 'action',
        payload: { action_type: 'actor_move', actor_id: 'partner', x: pos.x, z: pos.z },
      })
      lastPositionSync.current = clock.elapsedTime
    }
  })

  return (
    <group ref={groupRef} position={[spawn[0], 0, spawn[1]]}>
      <CharacterModel id={characterId} />
    </group>
  )
}
