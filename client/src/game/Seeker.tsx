/** 서버가 선택한 의도를 수행하는 능동 술래 캐릭터. */
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useRapier } from '@react-three/rapier'
import * as THREE from 'three'
import { useGameStore, type HunterState } from '../stores/gameStore'
import { sendGameMessage } from '../hooks/useWebSocket'
import useSound from '../hooks/useSound'
import { CharacterModel } from './Characters'
import { planAvoidedStep } from './aiNavigation'
import hunter from './hunterContract.json'

const CATCH_RETRY_SECONDS = 0.35
const PROXIMITY_SOUND_RANGE = 18

interface SeekerProps {
  playerRef: React.RefObject<THREE.Group | null>
  spawn: readonly [number, number, number]
  seekerId?: 'seeker' | 'seeker-2'
  requestsThink?: boolean
}

const SPEEDS: Record<HunterState, number> = {
  HUNT: hunter.huntSpeed,
  INVESTIGATE: hunter.investigateSpeed,
  DETECTED: 0,
  CHASE: hunter.chaseSpeed,
  SEARCH: hunter.huntSpeed,
  RUSH_GATE: hunter.rushSpeed,
}

export default function Seeker({ playerRef, spawn, seekerId = 'seeker', requestsThink = true }: SeekerProps) {
  const groupRef = useRef<THREE.Group>(null)
  const { world, rapier } = useRapier()
  const navigationShape = useMemo(() => new rapier.Ball(0.36), [rapier])
  const { playSeekerProximity, playSeekerDetected, playSeekerFootstep, playSeekerSiren } = useSound()
  // 이동 좌표는 useFrame에서 읽고, React 렌더는 경광등 상태 전환만 구독한다.
  const dangerLightActive = useGameStore((store) => (
    store.hunterIntent?.state === 'DETECTED' || store.hunterIntent?.state === 'CHASE'
  ))
  const redLightRef = useRef<THREE.PointLight>(null)
  const previousState = useRef<HunterState | null>(null)
  const lastThink = useRef(-Infinity)
  const lastAuthorityPosition = useRef<{ x: number; z: number } | null>(null)
  const lastCatchAttempt = useRef(-Infinity)
  const lastProximitySound = useRef(-Infinity)
  const lastFootstepSound = useRef(-Infinity)
  const lastSirenSound = useRef(-Infinity)
  const baseY = spawn[1]
  const lastPos = useRef(new THREE.Vector3(...spawn))
  const avoidanceSide = useRef(1)
  const fixedSolidFilters = rapier.QueryFilterFlags.EXCLUDE_SENSORS
    | rapier.QueryFilterFlags.ONLY_FIXED

  const moveToward = (pos: THREE.Vector3, dx: number, dz: number, maxStep: number) => {
    const step = planAvoidedStep(dx, dz, maxStep, (direction, distance) => Boolean(world.castShape(
      { x: pos.x, y: 0.78, z: pos.z },
      { x: 0, y: 0, z: 0, w: 1 },
      { x: direction.x, y: 0, z: direction.z },
      navigationShape, 0.02, distance + 0.08, false, fixedSolidFilters,
    )), avoidanceSide.current)
    if (step.x === 0 && step.z === 0) avoidanceSide.current *= -1
    pos.x += step.x
    pos.z += step.z
  }

  useFrame(({ clock }, delta) => {
    const group = groupRef.current
    if (!group) return
    const store = useGameStore.getState()
    if (store.isPaused) return
    const active = store.phase === 'playing' || store.phase === 'final_spell' || store.phase === 'escape'
    if (!active) { group.position.y = baseY; return }

    const pos = group.position
    if (requestsThink && clock.elapsedTime - lastThink.current >= hunter.thinkIntervalSeconds) {
      sendGameMessage({ type: 'action', payload: { action_type: 'seeker_think' } })
      lastThink.current = clock.elapsedTime
    }

    const intent = seekerId === 'seeker' ? store.hunterIntent : store.secondaryHunterIntent
    if (intent) {
      if ((intent.state === 'DETECTED' || intent.state === 'CHASE')
        && previousState.current !== 'DETECTED' && previousState.current !== 'CHASE') {
        playSeekerDetected()
      }
      previousState.current = intent.state
      if (lastAuthorityPosition.current !== intent.seekerPosition) {
        pos.x = intent.seekerPosition.x
        pos.z = intent.seekerPosition.z
        lastAuthorityPosition.current = intent.seekerPosition
      }
      const dx = intent.target.x - pos.x
      const dz = intent.target.z - pos.z
      const distance = Math.hypot(dx, dz)
      if (distance > 0.15) {
        group.rotation.y = THREE.MathUtils.lerp(group.rotation.y, Math.atan2(dx, dz), 0.16)
        const stopDistance = intent.state === 'RUSH_GATE' ? 1.4 : 0.5
        if (intent.state !== 'DETECTED' && distance > stopDistance) {
          moveToward(pos, dx, dz, Math.min(
            SPEEDS[intent.state] * intent.speedMultiplier * intent.stageSpeedMultiplier * delta,
            distance - stopDistance,
          ))
        }
      }

      if (
        intent.targetId && distance <= hunter.catchDistance
        && clock.elapsedTime - lastCatchAttempt.current >= CATCH_RETRY_SECONDS
      ) {
        if (sendGameMessage({ type: 'action', payload: { action_type: 'seeker_catch', seeker_id: seekerId, target_id: intent.targetId } })) {
          lastCatchAttempt.current = clock.elapsedTime
        }
      }
    }

    const playerPos = playerRef.current?.position
    if (playerPos) {
      const threatX = pos.x - playerPos.x
      const threatZ = pos.z - playerPos.z
      const threatDistance = Math.hypot(threatX, threatZ)
      const proximity = THREE.MathUtils.clamp(1 - threatDistance / PROXIMITY_SOUND_RANGE, 0, 1)
      const interval = THREE.MathUtils.lerp(1.55, 0.38, proximity)
      if (proximity > 0 && clock.elapsedTime - lastProximitySound.current >= interval) {
        const rightX = Math.cos(playerRef.current?.rotation.y ?? 0)
        const rightZ = -Math.sin(playerRef.current?.rotation.y ?? 0)
        const pan = threatDistance > 0.001
          ? THREE.MathUtils.clamp((threatX * rightX + threatZ * rightZ) / threatDistance, -1, 1)
          : 0
        playSeekerProximity(proximity, pan)
        lastProximitySound.current = clock.elapsedTime
      }

      const detected = intent?.state === 'DETECTED' || intent?.state === 'CHASE'
      if (detected && clock.elapsedTime - lastSirenSound.current >= 1.15) {
        const rightX = Math.cos(playerRef.current?.rotation.y ?? 0)
        const rightZ = -Math.sin(playerRef.current?.rotation.y ?? 0)
        const pan = threatDistance > 0.001
          ? THREE.MathUtils.clamp((threatX * rightX + threatZ * rightZ) / threatDistance, -1, 1)
          : 0
        playSeekerSiren(Math.max(0.35, proximity), pan)
        lastSirenSound.current = clock.elapsedTime
      }
    }

    const moved = pos.distanceTo(lastPos.current) > 0.01
    lastPos.current.copy(pos)
    const running = intent?.state === 'CHASE' || intent?.state === 'RUSH_GATE'
    if (moved && playerPos) {
      const threatX = pos.x - playerPos.x
      const threatZ = pos.z - playerPos.z
      const distance = Math.hypot(threatX, threatZ)
      const proximity = THREE.MathUtils.clamp(1 - distance / PROXIMITY_SOUND_RANGE, 0, 1)
      const stepInterval = running ? 0.28 : 0.52
      if (proximity > 0 && clock.elapsedTime - lastFootstepSound.current >= stepInterval) {
        const rightX = Math.cos(playerRef.current?.rotation.y ?? 0)
        const rightZ = -Math.sin(playerRef.current?.rotation.y ?? 0)
        const pan = distance > 0.001
          ? THREE.MathUtils.clamp((threatX * rightX + threatZ * rightZ) / distance, -1, 1)
          : 0
        playSeekerFootstep(proximity, pan, running)
        lastFootstepSound.current = clock.elapsedTime
      }
    }
    pos.y = baseY + (moved ? Math.abs(Math.sin(clock.elapsedTime * (running ? 6 : 3))) * (running ? 0.08 : 0.04) : 0)
    if (redLightRef.current) {
      redLightRef.current.intensity = 32 + Math.sin(clock.elapsedTime * 12) * 22
    }
  })

  return (
    <group ref={groupRef} position={spawn}>
      <CharacterModel id="R00" camo={false} />
      {dangerLightActive && (
        <pointLight ref={redLightRef} position={[0, 1.5, 0]} color="#FF163D" intensity={45} distance={10} decay={2} />
      )}
    </group>
  )
}
