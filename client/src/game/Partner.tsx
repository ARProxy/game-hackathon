/** 서버가 선택한 독립 목표를 표현하는 AI 동료 캐릭터. */
import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { useGameStore, type CompanionState } from '../stores/gameStore'
import { CharacterModel } from './Characters'
import companion from './companionContract.json'
import { sendGameMessage } from '../hooks/useWebSocket'
import { floorHeight } from './spawnContract'
import { useCollisionAwarePlanarMotion } from './useCollisionAwarePlanarMotion'
import { projectAuthorityPosition } from './aiNavigation'
import verticalMapContract from './verticalMapContract.json'

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
const _stairSample = new THREE.Vector3()
const _stairHeading = new THREE.Vector3()
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
const TRAVERSAL_PATHS = verticalMapContract.paths as Record<string, AuthoredTraversalPath>
const VERTICAL_SLOTS = verticalMapContract.slots as Record<string, { position?: number[] }>

type StairTraversal = {
  startedAt: number
  duration: number
  points: THREE.Vector3[]
  segmentLengths: number[]
  totalLength: number
}

function sampleStairPath(traversal: StairTraversal, progress: number, output: THREE.Vector3) {
  let remaining = THREE.MathUtils.clamp(progress, 0, 1) * traversal.totalLength
  for (let index = 0; index < traversal.segmentLengths.length; index += 1) {
    const segmentLength = traversal.segmentLengths[index]
    if (remaining <= segmentLength || index === traversal.segmentLengths.length - 1) {
      return output.lerpVectors(
        traversal.points[index],
        traversal.points[index + 1],
        segmentLength > 0 ? Math.min(1, remaining / segmentLength) : 1,
      )
    }
    remaining -= segmentLength
  }
  return output.copy(traversal.points[traversal.points.length - 1])
}

export default function Partner({
  playerRef,
  playerId = 'partner',
  characterId = 'R05',
  spawn,
  requestsThink = false,
}: PartnerProps) {
  const groupRef = useRef<THREE.Group>(null)
  const movementRef = useRef(0)
  const previousFloorRef = useRef<string | null>(null)
  const stairTraversalRef = useRef<StairTraversal | null>(null)
  const moveToward = useCollisionAwarePlanarMotion()
  const lastThink = useRef(-Infinity)
  const lastRescueAttempt = useRef(0)
  const partnerFrozen = useGameStore((state) => state.players[playerId]?.status === 'frozen')
  const guidanceActive = useGameStore((state) => (
    state.companionIntents[playerId]
      ?? (playerId === 'partner' ? state.companionIntent : null)
  )?.reason === 'rooftop_signal_guide')

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
    if (store.isPaused) {
      movementRef.current = 0
      return
    }
    const gameActive = store.phase === 'playing' || store.phase === 'final_spell' || store.phase === 'escape'
    if (requestsThink && gameActive && clock.elapsedTime - lastThink.current >= companion.thinkIntervalSeconds) {
      sendGameMessage({ type: 'action', payload: { action_type: 'companion_think' } })
      lastThink.current = clock.elapsedTime
    }
    const partnerState = store.players[playerId]
    if (partnerState?.status === 'eliminated' || partnerState?.status === 'escaped') {
      movementRef.current = 0
      group.visible = false
      return
    }
    group.visible = true
    const currentFloor = partnerState?.position.floor ?? null
    const previousFloor = previousFloorRef.current
    if (!previousFloor) previousFloorRef.current = currentFloor
    else if (currentFloor && currentFloor !== previousFloor) {
      const zone = partnerState?.position.zone
      const route = zone?.includes('southeast') ? 'east'
        : zone?.includes('northwest') || zone?.includes('basement') || zone?.startsWith('b1_') ? 'west'
        : zone?.startsWith('field_') || zone === 'f1_main_lobby' ? 'field'
        : null
      const selected = Object.values(TRAVERSAL_PATHS).find((path) => {
        const floorPairMatches = (
          (path.upperFloor === previousFloor && path.lowerFloor === currentFloor)
          || (path.upperFloor === currentFloor && path.lowerFloor === previousFloor)
          || (path.insideFloor === previousFloor && path.outsideFloor === currentFloor)
          || (path.insideFloor === currentFloor && path.outsideFloor === previousFloor)
        )
        return floorPairMatches && (!route || path.route === route || path.route === 'basement')
      })
      if (selected) {
        const direction = selected.upperFloor === previousFloor ? 'down'
          : selected.lowerFloor === previousFloor ? 'up'
          : selected.insideFloor === previousFloor ? 'out'
          : 'in'
        const lateralOffset = playerId === 'partner' ? -0.38 : 0.38
        const basePath = selected.down ?? selected.out ?? []
        const authored = direction === 'down' || direction === 'out'
          ? basePath
          : [...basePath].reverse()
        const points = authored.map(([x, y, z]) => new THREE.Vector3(x + lateralOffset, y, z))
        // 서버가 허용한 계단참 부근의 현재 표시 위치에서 자연스럽게 경사로로 잇는다.
        points[0].copy(group.position)
        const segmentLengths = points.slice(1).map((point, index) => point.distanceTo(points[index]))
        stairTraversalRef.current = {
          startedAt: clock.elapsedTime,
          duration: selected.durationSeconds,
          points,
          segmentLengths,
          totalLength: segmentLengths.reduce((sum, length) => sum + length, 0),
        }
      }
      previousFloorRef.current = currentFloor
    }

    const stairTraversal = stairTraversalRef.current
    if (stairTraversal) {
      const progress = (clock.elapsedTime - stairTraversal.startedAt) / stairTraversal.duration
      sampleStairPath(stairTraversal, progress, _stairSample)
      sampleStairPath(stairTraversal, Math.min(1, progress + 0.015), _stairHeading)
      group.position.copy(_stairSample)
      const dx = _stairHeading.x - _stairSample.x
      const dz = _stairHeading.z - _stairSample.z
      if (Math.hypot(dx, dz) > 0.001) group.rotation.y = Math.atan2(dx, dz)
      movementRef.current = 1
      if (progress >= 1) stairTraversalRef.current = null
      return
    }

    const actorBaseY = partnerState?.position.floor
      ? partnerState.position.y ?? floorHeight(partnerState.position.floor)
      : spawn[1]
    if (partnerState?.status === 'frozen') {
      movementRef.current = 0
      group.position.y = actorBaseY
      return
    }
    const intent = store.companionIntents[playerId] ?? (playerId === 'partner' ? store.companionIntent : null)
    if (!intent) {
      movementRef.current = 0
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
    const arrivalDistance = intent.arrivalDistance ?? companion.arrivalDistance
    const locomoting = displayDistance > 0.04 || distance > arrivalDistance + 0.05
    const active = partnerState?.status === 'alive'
      && locomoting
      && (speed > 0 || intent.state === 'INSPECT_CANDIDATE')
    if (!locomoting && intent.reason.startsWith('rooftop_signal_')) {
      const signalId = intent.targetId?.split('_').at(-1)
      const signalSlot = signalId
        ? VERTICAL_SLOTS[`ROOF_SIGNAL_${signalId.toUpperCase()}`]
        : null
      if (signalSlot?.position) {
        const faceX = signalSlot.position[0] - group.position.x
        const faceZ = signalSlot.position[2] - group.position.z
        group.rotation.y = THREE.MathUtils.lerp(group.rotation.y, Math.atan2(faceX, faceZ), 0.12)
      }
    }
    movementRef.current = active ? 1 : 0
    group.position.y = actorBaseY + (active ? Math.abs(Math.sin(clock.elapsedTime * 7)) * 0.08 : 0)
  })

  return (
    <group ref={groupRef} position={spawn}>
      <CharacterModel id={characterId} frozen={partnerFrozen} movementRef={movementRef} />
      {guidanceActive && (
        <Html position={[0, 2.35, 0]} center distanceFactor={9} style={{ pointerEvents: 'none' }}>
          <div style={{
            whiteSpace: 'nowrap', padding: '6px 10px', borderRadius: 999,
            border: '1px solid rgba(182,255,61,.78)', color: '#E9FFC2',
            background: 'rgba(7,20,17,.92)', fontSize: 11, fontWeight: 900,
            boxShadow: '0 0 16px rgba(182,255,61,.18)',
          }}>
            AI 안내 · 다음 신호는 여기
          </div>
        </Html>
      )}
    </group>
  )
}
