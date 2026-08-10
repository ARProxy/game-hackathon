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
import verticalMapContract from './verticalMapContract.json'

const CATCH_RETRY_SECONDS = 0.35
const PROXIMITY_SOUND_RANGE = 10
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
  TRANSIT: hunter.huntSpeed,
}

type AuthoredTraversalPath = {
  kind: 'stair_path' | 'door_path'
  route?: string
  upperFloor?: string
  lowerFloor?: string
  insideFloor?: string
  outsideFloor?: string
  durationSeconds: number
  down?: number[][]
  out?: number[][]
}
type HunterTraversal = {
  startedAt: number
  duration: number
  points: THREE.Vector3[]
  lengths: number[]
  total: number
}
const TRAVERSAL_PATHS = verticalMapContract.paths as Record<string, AuthoredTraversalPath>
const _traversalPoint = new THREE.Vector3()
const _traversalHeading = new THREE.Vector3()

function sampleTraversal(path: HunterTraversal, progress: number, output: THREE.Vector3) {
  let remaining = THREE.MathUtils.clamp(progress, 0, 1) * path.total
  for (let index = 0; index < path.lengths.length; index += 1) {
    const length = path.lengths[index]
    if (remaining <= length || index === path.lengths.length - 1) {
      return output.lerpVectors(path.points[index], path.points[index + 1], length > 0 ? remaining / length : 1)
    }
    remaining -= length
  }
  return output.copy(path.points.at(-1)!)
}

export default function Seeker({ playerRef, spawn, seekerId = 'seeker', requestsThink = true }: SeekerProps) {
  const groupRef = useRef<THREE.Group>(null)
  const moveToward = useCollisionAwarePlanarMotion()
  const {
    playSeekerProximity, playSeekerDetected, playSeekerFootstep, playSeekerSiren,
    playSeekerLunge, playSeekerDoorPound,
  } = useSound()
  // 이동 좌표는 useFrame에서 읽고, React 렌더는 경광등 상태 전환만 구독한다.
  const dangerLightActive = useGameStore((store) => {
    const intent = seekerId === 'seeker' ? store.hunterIntent : store.secondaryHunterIntent
    const detected = intent?.state === 'DETECTED' || intent?.state === 'CHASE'
    const finalPhase = store.verticalProgression?.phase === 'field_final'
      || store.verticalProgression?.phase === 'basement_final'
      || store.verticalProgression?.phase === 'escape_open'
    return detected && (seekerId === 'seeker' || finalPhase)
  })
  const redLightRef = useRef<THREE.PointLight>(null)
  const presenceRef = useRef<THREE.Group>(null)
  const mutationRef = useRef<THREE.Group>(null)
  const headJerkRef = useRef<THREE.Group>(null)
  const leftArmRef = useRef<THREE.Mesh>(null)
  const rightArmRef = useRef<THREE.Mesh>(null)
  const blockerLightRef = useRef<THREE.SpotLight>(null)
  const blockerAimRef = useRef<THREE.Object3D>(null)
  const previousState = useRef<HunterState | null>(null)
  const previousMutationPhase = useRef<string | null>(null)
  const lastThink = useRef(-Infinity)
  const lastCatchAttempt = useRef(-Infinity)
  const lastProximitySound = useRef(-Infinity)
  const lastFootstepSound = useRef(-Infinity)
  const lastSirenSound = useRef(-Infinity)
  const lastPoundSound = useRef(-Infinity)
  const lastPos = useRef(new THREE.Vector3(...spawn))
  const movementRef = useRef(0)
  const previousFloorRef = useRef<string | null>(null)
  const traversalRef = useRef<HunterTraversal | null>(null)

  useFrame(({ clock }, delta) => {
    const group = groupRef.current
    if (!group) return
    const store = useGameStore.getState()
    if (store.isPaused) return
    const active = store.phase === 'playing' || store.phase === 'final_spell' || store.phase === 'escape'
    const seekerState = store.players[seekerId]
    const humanState = store.players[store.playerId]
    const currentFloor = seekerState?.position.floor ?? null
    const sharesHumanFloor = Boolean(currentFloor && currentFloor === humanState?.position.floor)
    const previousFloor = previousFloorRef.current
    if (!previousFloor) previousFloorRef.current = currentFloor
    else if (currentFloor && currentFloor !== previousFloor) {
      const zone = seekerState?.position.zone
      if (zone?.includes('hunter_elevator_')) {
        const targetY = floorHeight(currentFloor)
        const targetX = seekerState?.position.x ?? group.position.x
        const targetZ = seekerState?.position.z ?? group.position.z
        const points = [group.position.clone(), new THREE.Vector3(targetX, targetY, targetZ)]
        const lengths = [points[0].distanceTo(points[1])]
        traversalRef.current = {
          startedAt: clock.elapsedTime,
          duration: 1.2 + Math.abs(targetY - floorHeight(previousFloor)) / 2.2,
          points,
          lengths,
          total: lengths[0],
        }
      }
      const route = zone?.includes('east') ? 'east'
        : zone?.includes('field') || zone === 'f1_main_lobby' ? 'field'
        : 'west'
      const selected = zone?.includes('hunter_elevator_') ? undefined : Object.values(TRAVERSAL_PATHS).find((path) => {
        const matches = (
          (path.upperFloor === previousFloor && path.lowerFloor === currentFloor)
          || (path.upperFloor === currentFloor && path.lowerFloor === previousFloor)
          || (path.insideFloor === previousFloor && path.outsideFloor === currentFloor)
          || (path.insideFloor === currentFloor && path.outsideFloor === previousFloor)
        )
        return matches && (path.route === route || path.route === 'basement')
      })
      if (selected) {
        const forward = selected.upperFloor === previousFloor || selected.insideFloor === previousFloor
        const base = selected.down ?? selected.out ?? []
        const authored = forward ? base : [...base].reverse()
        const laneOffset = seekerId === 'seeker-2' ? 0.42 : 0
        const points = authored.map(([x, y, z]) => new THREE.Vector3(x + laneOffset, y, z))
        points[0].copy(group.position)
        const lengths = points.slice(1).map((point, index) => point.distanceTo(points[index]))
        traversalRef.current = {
          startedAt: clock.elapsedTime, duration: selected.durationSeconds,
          points, lengths, total: lengths.reduce((sum, length) => sum + length, 0),
        }
      }
      previousFloorRef.current = currentFloor
    }

    const traversal = traversalRef.current
    if (traversal) {
      const progress = (clock.elapsedTime - traversal.startedAt) / traversal.duration
      sampleTraversal(traversal, progress, _traversalPoint)
      sampleTraversal(traversal, Math.min(1, progress + 0.015), _traversalHeading)
      group.position.copy(_traversalPoint)
      const dx = _traversalHeading.x - _traversalPoint.x
      const dz = _traversalHeading.z - _traversalPoint.z
      if (Math.hypot(dx, dz) > 0.001) group.rotation.y = Math.atan2(dx, dz)
      movementRef.current = 1
      if (progress >= 1) traversalRef.current = null
      return
    }
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
      if (sharesHumanFloor && intent.targetId === store.playerId
        && (intent.state === 'DETECTED' || intent.state === 'CHASE')
        && previousState.current !== 'DETECTED' && previousState.current !== 'CHASE') {
        playSeekerDetected(seekerId === 'seeker-2' ? 'blocker' : 'chaser')
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
    if (playerPos && sharesHumanFloor) {
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
        playSeekerProximity(proximity, pan, seekerId === 'seeker-2' ? 'blocker' : 'chaser')
        lastProximitySound.current = clock.elapsedTime
      }

      const detected = (
        (intent?.state === 'DETECTED' || intent?.state === 'CHASE')
        && intent.targetId === store.playerId
      )
      // 차단자는 손전등과 정적으로 발견을 알린다. 일반 구간에서 추격자와
      // 같은 사이렌을 울리면 두 역할의 대응법이 사라진다.
      if (seekerId === 'seeker' && detected && clock.elapsedTime - lastSirenSound.current >= 1.15) {
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
    movementRef.current = THREE.MathUtils.damp(movementRef.current, moved ? 1 : 0, moved ? 9 : 14, delta)
    lastPos.current.set(pos.x, actorBaseY, pos.z)
    const running = intent?.state === 'CHASE' || intent?.state === 'RUSH_GATE'
    if (moved && playerPos && sharesHumanFloor) {
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
        playSeekerFootstep(proximity, pan, running, seekerId === 'seeker-2' ? 'blocker' : 'chaser')
        lastFootstepSound.current = clock.elapsedTime
      }
    }
    pos.y = actorBaseY + (moved ? Math.abs(Math.sin(clock.elapsedTime * (running ? 6 : 3))) * (running ? 0.08 : 0.04) : 0)
    if (redLightRef.current) {
      redLightRef.current.intensity = 32 + Math.sin(clock.elapsedTime * 12) * 22
    }
    if (presenceRef.current) {
      const pulse = 1 + Math.sin(clock.elapsedTime * 2.1 + (seekerId === 'seeker-2' ? 1.4 : 0)) * 0.09
      presenceRef.current.scale.set(pulse, 1 + (pulse - 1) * 1.7, pulse)
      presenceRef.current.rotation.y = Math.sin(clock.elapsedTime * 0.73) * 0.08
    }
    const mutation = mutationRef.current
    const head = headJerkRef.current
    const leftArm = leftArmRef.current
    const rightArm = rightArmRef.current
    if (mutation && head && leftArm && rightArm) {
      const pounding = intent?.reason === 'door_pressure'
      const transformed = pounding || intent?.state === 'DETECTED'
        || intent?.state === 'CHASE' || intent?.state === 'RUSH_GATE'
      const chaseClock = clock.elapsedTime * (pounding ? 9.5 : 6.8)
      const snap = Math.sin(Math.floor(clock.elapsedTime * 7.5) * 2.31)
      const chaseCycle = clock.elapsedTime % 2.15
      const fakeStop = intent?.state === 'CHASE' && chaseCycle > 1.52 && chaseCycle < 1.72
      const lunge = intent?.mutationPhase === 'LUNGE'
        || (intent?.state === 'CHASE' && chaseCycle >= 1.72)
      const sideways = transformed ? Math.sin(chaseClock * 0.71) * (pounding ? 0.05 : 0.13) : 0
      const forwardJolt = pounding
        ? Math.max(0, Math.sin(chaseClock)) * 0.22
        : lunge ? 0.18 : fakeStop ? -0.1 : 0
      mutation.position.x = THREE.MathUtils.damp(mutation.position.x, sideways, 13, delta)
      mutation.position.z = THREE.MathUtils.damp(mutation.position.z, forwardJolt, 16, delta)
      mutation.position.y = THREE.MathUtils.damp(
        mutation.position.y,
        transformed ? -0.07 + Math.abs(Math.sin(chaseClock * 0.5)) * 0.06 : 0,
        12, delta,
      )
      mutation.rotation.x = THREE.MathUtils.damp(
        mutation.rotation.x, transformed ? (pounding ? -0.22 : -0.13) : 0, 11, delta,
      )
      mutation.rotation.z = THREE.MathUtils.damp(
        mutation.rotation.z, transformed ? snap * 0.09 + Math.sin(chaseClock) * 0.055 : 0, 16, delta,
      )
      mutation.scale.x = THREE.MathUtils.damp(mutation.scale.x, transformed ? 0.91 : 1, 9, delta)
      mutation.scale.y = THREE.MathUtils.damp(mutation.scale.y, transformed ? 1.09 : 1, 9, delta)
      mutation.scale.z = THREE.MathUtils.damp(mutation.scale.z, transformed ? 0.94 : 1, 9, delta)
      head.rotation.z = THREE.MathUtils.damp(head.rotation.z, transformed ? snap * 0.34 : 0, 18, delta)
      head.rotation.y = THREE.MathUtils.damp(
        head.rotation.y, transformed ? Math.sin(Math.floor(clock.elapsedTime * 4.2) * 1.9) * 0.5 : 0, 18, delta,
      )
      leftArm.rotation.x = transformed ? Math.sin(chaseClock) * 0.72 - 0.22 : 0
      rightArm.rotation.x = transformed ? Math.sin(chaseClock + 2.1) * 1.05 - 0.35 : 0
      leftArm.rotation.z = transformed ? -0.2 - Math.abs(snap) * 0.22 : -0.08
      rightArm.rotation.z = transformed ? 0.28 + Math.abs(snap) * 0.18 : 0.08

      if (sharesHumanFloor && lunge && previousMutationPhase.current !== 'LUNGE') {
        playSeekerLunge(0.9, snap, seekerId === 'seeker-2' ? 'blocker' : 'chaser')
      }
      previousMutationPhase.current = lunge ? 'LUNGE' : intent?.mutationPhase ?? null

      if (pounding && sharesHumanFloor && clock.elapsedTime - lastPoundSound.current >= 0.52) {
        playSeekerDoorPound(snap)
        lastPoundSound.current = clock.elapsedTime
      }
    }
    if (blockerLightRef.current && blockerAimRef.current) {
      blockerLightRef.current.target = blockerAimRef.current
    }
  })

  return (
    <group ref={groupRef} position={spawn}>
      <group ref={presenceRef}>
        <mesh position={[0, 0.035, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.25, seekerId === 'seeker-2' ? 1.05 : 1.3, 24]} />
          <meshBasicMaterial color="#09020B" transparent opacity={0.42} depthWrite={false} />
        </mesh>
        <mesh position={[0, 1.22, -0.2]} scale={[0.68, 1.35, 0.42]}>
          <sphereGeometry args={[0.72, 10, 8]} />
          <meshBasicMaterial color="#050108" transparent opacity={0.28} depthWrite={false} />
        </mesh>
        <mesh position={[-0.14, 1.58, 0.43]}>
          <sphereGeometry args={[0.035, 8, 6]} />
          <meshBasicMaterial color={seekerId === 'seeker-2' ? '#D9F1FF' : '#FF123D'} toneMapped={false} />
        </mesh>
        <mesh position={[0.14, 1.58, 0.43]}>
          <sphereGeometry args={[0.035, 8, 6]} />
          <meshBasicMaterial color={seekerId === 'seeker-2' ? '#D9F1FF' : '#FF123D'} toneMapped={false} />
        </mesh>
      </group>
      <group ref={mutationRef}>
        <CharacterModel id={seekerId === 'seeker-2' ? 'S02' : 'R00'} camo={false} movementRef={movementRef} />
        <group ref={headJerkRef} position={[0, 1.62, 0.02]}>
          <mesh scale={[0.44, 0.56, 0.42]}>
            <sphereGeometry args={[0.34, 10, 8]} />
            <meshStandardMaterial color="#100A10" roughness={0.9} transparent opacity={0.38} />
          </mesh>
        </group>
        <mesh ref={leftArmRef} position={[-0.43, 1.0, 0.02]} scale={[0.11, 0.78, 0.11]}>
          <capsuleGeometry args={[0.5, 1, 4, 7]} />
          <meshStandardMaterial color="#110810" roughness={0.95} transparent opacity={0.62} />
        </mesh>
        <mesh ref={rightArmRef} position={[0.43, 0.92, 0.05]} scale={[0.1, 0.91, 0.1]}>
          <capsuleGeometry args={[0.5, 1, 4, 7]} />
          <meshStandardMaterial color="#0B060C" roughness={0.95} transparent opacity={0.62} />
        </mesh>
      </group>
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
