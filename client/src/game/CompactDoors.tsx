import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { COMPACT_SCHOOL, type CompactDoor, type CompactFloor } from './compactSchoolData.js'
import { useGameStore } from '../stores/gameStore'
import type { PlayerHandle } from './Player'
import { isStageDoor, stageDoorUnlocked } from './stageDoorAccess.js'
import { sendGameMessage } from '../hooks/useWebSocket'

const INTERACTION_DISTANCE = 1.75
const MOTION_EPSILON = 0.0005
const NO_ACCESSIBLE_FLOORS: string[] = []
const _playerPosition = new THREE.Vector3()

export default function CompactDoors({ visibleFloors, playerRef }: {
  visibleFloors?: CompactFloor[]
  playerRef: React.RefObject<PlayerHandle | null>
}) {
  const accessibleFloors = useGameStore((state) => state.verticalProgression?.accessible_floors ?? NO_ACCESSIBLE_FLOORS)
  const doorStates = useGameStore((state) => state.doorStates)
  const visible = useMemo(() => new Set(visibleFloors), [visibleFloors])
  const bodies = useRef(new Map<string, RapierRigidBody>())
  const openness = useRef(new Map<string, number>())
  const targets = useRef(new Map<string, boolean>())
  const activeDoorIds = useRef(new Set<string>())
  const nearbyRef = useRef<CompactDoor | null>(null)
  const [nearby, setNearby] = useState<CompactDoor | null>(null)

  const isUnlocked = useCallback((door: CompactDoor) => {
    if (door.permanentlyLocked) return false
    if (isStageDoor(door)) return stageDoorUnlocked(door, accessibleFloors)
    return true
  }, [accessibleFloors])

  useEffect(() => {
    for (const [doorId, open] of Object.entries(doorStates)) {
      if (targets.current.get(doorId) === open) continue
      targets.current.set(doorId, open)
      activeDoorIds.current.add(doorId)
    }
  }, [doorStates])

  useEffect(() => {
    for (const door of COMPACT_SCHOOL.doors) {
      if (!isStageDoor(door)) continue
      const next = isUnlocked(door)
      if (targets.current.get(door.id) === next) continue
      targets.current.set(door.id, next)
      activeDoorIds.current.add(door.id)
    }
  }, [isUnlocked])

  useEffect(() => {
    const toggle = (event: KeyboardEvent) => {
      const door = nearbyRef.current
      if (event.code !== 'KeyE' || event.repeat || !door || isStageDoor(door)) return
      if (!isUnlocked(door)) return
      event.preventDefault()
      sendGameMessage({
        type: 'action',
        payload: { action_type: 'door_interaction', door_id: door.id },
      })
    }
    window.addEventListener('keydown', toggle)
    return () => window.removeEventListener('keydown', toggle)
  }, [isUnlocked])

  useFrame((_, delta) => {
    const player = playerRef.current?.getGroup()
    let closest: CompactDoor | null = null
    let closestDistance = INTERACTION_DISTANCE
    if (player) {
      player.getWorldPosition(_playerPosition)
      for (const door of COMPACT_SCHOOL.doors) {
        const centerX = door.axis === 'x' ? door.hinge[0] + door.w / 2 : door.hinge[0]
        const centerZ = door.axis === 'x' ? door.hinge[2] : door.hinge[2] + door.w / 2
        const distance = Math.hypot(_playerPosition.x - centerX, _playerPosition.z - centerZ)
        if (Math.abs(_playerPosition.y - door.hinge[1]) < 1.35 && distance < closestDistance) {
          closest = door
          closestDistance = distance
        }
      }
    }
    if (closest?.id !== nearbyRef.current?.id) {
      nearbyRef.current = closest
      setNearby(closest)
    }

    for (const doorId of activeDoorIds.current) {
      const door = COMPACT_SCHOOL.doors.find((candidate) => candidate.id === doorId)
      const body = bodies.current.get(doorId)
      if (!door || !body) continue
      const current = openness.current.get(doorId) ?? 0
      const target = targets.current.get(doorId) ? 1 : 0
      const damped = THREE.MathUtils.damp(current, target, 7, delta)
      const next = Math.abs(target - damped) <= MOTION_EPSILON ? target : damped
      openness.current.set(doorId, next)
      const angle = next * door.swing * Math.PI * 0.48
      body.setNextKinematicRotation({ x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) })
      if (next === target) activeDoorIds.current.delete(doorId)
    }
  })

  const nearbyUnlocked = nearby ? isUnlocked(nearby) : false
  return <>
    {COMPACT_SCHOOL.doors.map((door) => (
      <DoorActor
        key={door.id}
        door={door}
        bodies={bodies}
        visualVisible={!visibleFloors || visible.has(door.f)}
      />
    ))}
    {nearby && (
      <Html position={[nearby.hinge[0], nearby.hinge[1] + 2.65, nearby.hinge[2]]} center distanceFactor={9} style={{ pointerEvents: 'none' }}>
        <div style={{
          whiteSpace: 'nowrap', padding: '6px 10px', borderRadius: 7,
          color: nearbyUnlocked ? '#E7F5FF' : '#FFD2D2',
          background: 'rgba(5,15,22,.92)',
          border: `1px solid ${nearbyUnlocked ? 'rgba(189,239,255,.55)' : 'rgba(255,96,96,.7)'}`,
          fontSize: 12, fontWeight: 800,
        }}>
          {isStageDoor(nearby)
            ? nearbyUnlocked ? '층간 이동 경로 개방' : '현재 미션 완료 전 잠김'
            : nearbyUnlocked ? `E · ${doorStates[nearby.id] ? '문 닫기' : '문 열기'}` : '잠긴 문'}
        </div>
      </Html>
    )}
  </>
}

function DoorActor({ door, bodies, visualVisible }: {
  door: CompactDoor
  bodies: React.RefObject<Map<string, RapierRigidBody>>
  visualVisible: boolean
}) {
  const alongX = door.axis === 'x'
  const extension = door.w / 2
  return (
    <RigidBody
      ref={(body) => { if (body) bodies.current.set(door.id, body); else bodies.current.delete(door.id) }}
      type="kinematicPosition"
      colliders={false}
      position={door.hinge}
    >
      <CuboidCollider
        args={[alongX ? door.w / 2 : door.t / 2, door.h / 2, alongX ? door.t / 2 : door.w / 2]}
        position={[alongX ? extension : 0, door.h / 2, alongX ? 0 : extension]}
      />
      <group visible={visualVisible}>
        <mesh
          position={[alongX ? extension : 0, door.h / 2, alongX ? 0 : extension]}
          scale={[alongX ? door.w : door.t, door.h, alongX ? door.t : door.w]}
          castShadow receiveShadow
        >
          <boxGeometry />
          <meshStandardMaterial color={door.c} roughness={0.62} metalness={door.kind === 'fire' ? 0.55 : 0.08} />
        </mesh>
        <mesh position={[alongX ? door.w - 0.13 : 0.07, 1.02, alongX ? 0.07 : door.w - 0.13]} rotation={alongX ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.032, 0.032, 0.14, 8]} />
          <meshStandardMaterial color="#c4cbcf" roughness={0.28} metalness={0.85} />
        </mesh>
      </group>
    </RigidBody>
  )
}
