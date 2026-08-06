import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import type { FloorKey } from './SchoolCampus'

type DoorSlot = { id: string; floor: FloorKey; x: number; y: number; z: number }

const DOORS: DoorSlot[] = [
  { id: 'f1-class', floor: 'F1', x: -30.5, y: 0, z: -28.63 },
  { id: 'f1-office', floor: 'F1', x: -23.5, y: 0, z: -28.63 },
  { id: 'f2-class-a', floor: 'F2', x: -30.5, y: 3.6, z: -28.63 },
  { id: 'f2-class-b', floor: 'F2', x: -23.5, y: 3.6, z: -28.63 },
  { id: 'f2-science', floor: 'F2', x: -9.5, y: 3.6, z: -28.63 },
  { id: 'f3-class', floor: 'F3', x: -30.5, y: 7.2, z: -28.63 },
  { id: 'f3-av', floor: 'F3', x: -23.5, y: 7.2, z: -28.63 },
  { id: 'f3-class-b', floor: 'F3', x: -9.5, y: 7.2, z: -28.63 },
]

const WIDTH = 1.5
const HEIGHT = 1.95
const OPEN_DISTANCE = 2.15

function Door({ slot, playerRef }: { slot: DoorSlot; playerRef: React.RefObject<THREE.Group | null> }) {
  const bodyRef = useRef<RapierRigidBody>(null)
  const angleRef = useRef(0)

  useFrame((_, delta) => {
    const player = playerRef.current
    const body = bodyRef.current
    if (!player || !body) return
    const sameFloor = Math.abs(player.position.y - slot.y) < 1.7
    const distance = Math.hypot(player.position.x - slot.x, player.position.z - slot.z)
    const target = sameFloor && distance < OPEN_DISTANCE ? -Math.PI * 0.48 : 0
    angleRef.current = THREE.MathUtils.damp(angleRef.current, target, 12, delta)
    const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angleRef.current)
    body.setNextKinematicRotation(rotation)
  })

  return (
    <group>
      <RigidBody
        ref={bodyRef}
        type="kinematicPosition"
        colliders={false}
        position={[slot.x - WIDTH / 2, slot.y, slot.z]}
      >
        <CuboidCollider args={[WIDTH / 2, HEIGHT / 2, 0.07]} position={[WIDTH / 2, HEIGHT / 2, 0]} />
        <mesh position={[WIDTH / 2, HEIGHT / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[WIDTH, HEIGHT, 0.14]} />
          <meshStandardMaterial color="#725033" roughness={0.72} />
        </mesh>
        <mesh position={[WIDTH - 0.18, 0.92, 0.1]} castShadow>
          <sphereGeometry args={[0.055, 10, 8]} />
          <meshStandardMaterial color="#d0b06a" metalness={0.7} roughness={0.28} />
        </mesh>
      </RigidBody>
      <mesh position={[slot.x, slot.y + 2.04, slot.z]} castShadow>
        <boxGeometry args={[1.72, 0.14, 0.28]} />
        <meshStandardMaterial color="#4b5660" roughness={0.85} />
      </mesh>
    </group>
  )
}

export default function InteractiveDoors({
  playerRef,
  visibleFloors,
}: {
  playerRef: React.RefObject<THREE.Group | null>
  visibleFloors?: FloorKey[]
}) {
  return DOORS
    .filter((slot) => !visibleFloors || visibleFloors.includes(slot.floor))
    .map((slot) => <Door key={slot.id} slot={slot} playerRef={playerRef} />)
}
