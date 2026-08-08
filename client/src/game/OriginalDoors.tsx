/** ZIP Canvas.dc.html의 buildDoors를 R3F/Rapier 액터로 옮긴 전체 학교 문 시스템. */
import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { buildCampus, type CampusDoor, type CampusFloor } from './campusV4Data.js'
import type { PlayerHandle } from './Player'

const CAMPUS_DOORS = buildCampus({ seed: 0 }).doors
const INTERACTION_DISTANCE = 1.8

export default function OriginalDoors({ visibleFloors, playerRef }: {
  visibleFloors?: CampusFloor[]
  playerRef: React.RefObject<PlayerHandle | null>
}) {
  const visible = useMemo(() => new Set(visibleFloors), [visibleFloors])
  const doors = useMemo(
    () => CAMPUS_DOORS.filter((door) => !visibleFloors || visible.has(door.f)),
    [visible, visibleFloors],
  )
  const bodies = useRef(new Map<string, RapierRigidBody>())
  const openness = useRef(new Map<string, number>())
  const targets = useRef(new Map<string, boolean>())
  const nearbyRef = useRef<CampusDoor | null>(null)
  const [nearby, setNearby] = useState<CampusDoor | null>(null)

  useEffect(() => {
    const toggle = (event: KeyboardEvent) => {
      const door = nearbyRef.current
      if (event.code !== 'KeyE' || event.repeat || !door) return
      event.preventDefault()
      targets.current.set(door.id, !targets.current.get(door.id))
    }
    window.addEventListener('keydown', toggle)
    return () => window.removeEventListener('keydown', toggle)
  }, [])

  useFrame((_, delta) => {
    const player = playerRef.current?.getGroup()
    let closest: CampusDoor | null = null
    let closestDistance = INTERACTION_DISTANCE
    if (player) {
      for (const door of doors) {
        const distance = Math.hypot(player.position.x - door.hinge[0], player.position.z - door.hinge[2])
        if (Math.abs(player.position.y - door.hinge[1]) < 1.4 && distance < closestDistance) {
          closest = door
          closestDistance = distance
        }
      }
    }
    if (closest?.id !== nearbyRef.current?.id) {
      nearbyRef.current = closest
      setNearby(closest)
    }
    for (const door of doors) {
      const body = bodies.current.get(door.id)
      if (!body) continue
      const current = openness.current.get(door.id) ?? 0
      const next = THREE.MathUtils.damp(current, targets.current.get(door.id) ? 1 : 0, 7, delta)
      openness.current.set(door.id, next)
      const angle = next * door.swing * Math.PI * 0.48
      body.setNextKinematicRotation({ x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) })
    }
  })

  return <>
    {doors.map((door) => <DoorActor key={door.id} door={door} bodies={bodies} />)}
    {nearby && (
      <Html position={[nearby.hinge[0], nearby.hinge[1] + 2.55, nearby.hinge[2]]} center distanceFactor={9} style={{ pointerEvents: 'none' }}>
        <div style={{ whiteSpace: 'nowrap', padding: '6px 10px', borderRadius: 7, color: '#E7F5FF', background: 'rgba(5,15,22,.92)', border: '1px solid rgba(189,239,255,.55)', fontSize: 12, fontWeight: 800 }}>
          E · {nearby.kind === 'fire' ? '방화문' : '교실 문'} {targets.current.get(nearby.id) ? '닫기' : '열기'}
        </div>
      </Html>
    )}
  </>
}

function DoorActor({ door, bodies }: {
  door: CampusDoor
  bodies: React.RefObject<Map<string, RapierRigidBody>>
}) {
  const alongX = door.axis === 'x'
  const extension = door.flip ? -door.w / 2 : door.w / 2
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
      <mesh
        position={[alongX ? extension : 0, door.h / 2, alongX ? 0 : extension]}
        scale={[alongX ? door.w : door.t, door.h, alongX ? door.t : door.w]}
        castShadow receiveShadow
      >
        <boxGeometry />
        <meshStandardMaterial color={door.c} roughness={0.62} metalness={door.kind === 'fire' ? 0.5 : 0.05} />
      </mesh>
      <mesh position={[alongX ? (door.flip ? -door.w + 0.12 : door.w - 0.12) : 0.07, 1.02, alongX ? 0.07 : (door.flip ? -door.w + 0.12 : door.w - 0.12)]} rotation={alongX ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.032, 0.032, 0.13, 8]} />
        <meshStandardMaterial color="#b9c0c4" roughness={0.3} metalness={0.8} />
      </mesh>
    </RigidBody>
  )
}
