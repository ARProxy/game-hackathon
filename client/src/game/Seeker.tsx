/** 서버가 선택한 의도를 수행하는 능동 술래 캐릭터. */
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useGameStore, type HunterState } from '../stores/gameStore'
import { sendGameMessage } from '../hooks/useWebSocket'
import useSound from '../hooks/useSound'
import { CharacterModel } from './Characters'
import { floorHeight } from './spawnContract'
import { useCollisionAwarePlanarMotion } from './useCollisionAwarePlanarMotion'
import { projectAuthorityPosition } from './aiNavigation'
import hunter from './hunterContract.json'

const CATCH_RETRY_SECONDS = 0.35
const PROXIMITY_SOUND_RANGE = 18
const ACTOR_CORRECTION_SPEED = 7
const _playerPosition = new THREE.Vector3()
const _displayTarget = { x: 0, z: 0 }

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
  BLOCK: hunter.chaseSpeed * 0.85,
  GUARD: hunter.chaseSpeed * 0.85,
  PATROL: hunter.huntSpeed * 0.85,
}

export default function Seeker({ playerRef, spawn, seekerId = 'seeker', requestsThink = true }: SeekerProps) {
  const groupRef = useRef<THREE.Group>(null)
  const moveToward = useCollisionAwarePlanarMotion()
  const { playSeekerProximity, playSeekerDetected, playSeekerFootstep, playSeekerSiren } = useSound()
  // 이동 좌표는 useFrame에서 읽고, React 렌더는 경광등 상태 전환만 구독한다.
  const dangerLightActive = useGameStore((store) => {
    const intent = seekerId === 'seeker' ? store.hunterIntent : store.secondaryHunterIntent
    return intent?.state === 'DETECTED' || intent?.state === 'CHASE'
  })
  const redLightRef = useRef<THREE.PointLight>(null)
  const blockerLightRef = useRef<THREE.SpotLight>(null)
  const blockerAimRef = useRef<THREE.Object3D>(null)
  const previousState = useRef<HunterState | null>(null)
  const lastThink = useRef(-Infinity)
  const lastCatchAttempt = useRef(-Infinity)
  const lastProximitySound = useRef(-Infinity)
  const lastFootstepSound = useRef(-Infinity)
  const lastSirenSound = useRef(-Infinity)
  const lastPos = useRef(new THREE.Vector3(...spawn))

  useFrame(({ clock }, delta) => {
    const group = groupRef.current
    if (!group) return
    const store = useGameStore.getState()
    if (store.isPaused) return
    const active = store.phase === 'playing' || store.phase === 'final_spell' || store.phase === 'escape'
    const seekerState = store.players[seekerId]
    const actorBaseY = seekerState?.position.floor
      ? seekerState.position.y ?? floorHeight(seekerState.position.floor)
      : spawn[1]
    if (!active) { group.position.y = actorBaseY; return }

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
      const dx = intent.target.x - pos.x
      const dz = intent.target.z - pos.z
      const distance = Math.hypot(dx, dz)
      const stopDistance = intent.state === 'RUSH_GATE' ? 1.4 : 0.5
      const speed = intent.state === 'DETECTED'
        ? 0
        : SPEEDS[intent.state] * intent.speedMultiplier * intent.stageSpeedMultiplier
      const predictionDistance = projectAuthorityPosition(
        intent.seekerPosition,
        intent.target,
        speed,
        hunter.thinkIntervalSeconds,
        stopDistance,
        _displayTarget,
      )
      const displayDx = _displayTarget.x - pos.x
      const displayDz = _displayTarget.z - pos.z
      const displayDistance = Math.hypot(displayDx, displayDz)
      if (displayDistance > 0.001) {
        const synchronizing = displayDistance > Math.max(0.6, predictionDistance + 0.2)
        const displaySpeed = synchronizing || speed <= 0 ? ACTOR_CORRECTION_SPEED : speed
        moveToward(
          pos,
          displayDx,
          displayDz,
          Math.min(displaySpeed * delta, displayDistance),
          actorBaseY,
        )
      }
      if (distance > 0.15) {
        group.rotation.y = THREE.MathUtils.lerp(group.rotation.y, Math.atan2(dx, dz), 0.16)
      }

      if (
        intent.targetId && ['DETECTED', 'CHASE'].includes(intent.state)
        && distance <= hunter.catchDistance
        && clock.elapsedTime - lastCatchAttempt.current >= CATCH_RETRY_SECONDS
      ) {
        if (sendGameMessage({ type: 'action', payload: { action_type: 'seeker_catch', seeker_id: seekerId, target_id: intent.targetId } })) {
          lastCatchAttempt.current = clock.elapsedTime
        }
      }
    }

    const playerPos = playerRef.current?.getWorldPosition(_playerPosition)
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

    const moved = Math.hypot(pos.x - lastPos.current.x, pos.z - lastPos.current.z) > 0.01
    lastPos.current.set(pos.x, actorBaseY, pos.z)
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
    pos.y = actorBaseY + (moved ? Math.abs(Math.sin(clock.elapsedTime * (running ? 6 : 3))) * (running ? 0.08 : 0.04) : 0)
    if (redLightRef.current) {
      redLightRef.current.intensity = 32 + Math.sin(clock.elapsedTime * 12) * 22
    }
    if (blockerLightRef.current && blockerAimRef.current) {
      blockerLightRef.current.target = blockerAimRef.current
    }
  })

  return (
    <group ref={groupRef} position={spawn}>
      <CharacterModel id={seekerId === 'seeker-2' ? 'S02' : 'R00'} camo={false} />
      {dangerLightActive && (
        <pointLight ref={redLightRef} position={[0, 1.5, 0]} color="#FF163D" intensity={45} distance={10} decay={2} />
      )}
      {seekerId === 'seeker-2' && (
        <>
          <spotLight
            ref={blockerLightRef}
            position={[0, 1.35, 0.35]}
            color="#E7F4FF"
            intensity={72}
            distance={16}
            angle={Math.PI / 7}
            penumbra={0.5}
            decay={1.7}
          />
          <pointLight position={[0, 1.25, 0.25]} color="#DCEEFF" intensity={8} distance={3.5} decay={2} />
          <object3D ref={blockerAimRef} position={[0, 0.75, 10]} />
        </>
      )}
    </group>
  )
}
