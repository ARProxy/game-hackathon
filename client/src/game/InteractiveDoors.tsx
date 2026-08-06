import { useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { CuboidCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import type { FloorKey } from './SchoolCampus'

type DoorSlot = { id: string; floor: FloorKey; x: number; y: number; z: number; label: string }

const DOORS: DoorSlot[] = [
  { id: 'f1-class', floor: 'F1', x: -30.5, y: 0, z: -28.63, label: '교실 1-1' },
  { id: 'f1-office', floor: 'F1', x: -23.5, y: 0, z: -28.63, label: '행정실' },
  { id: 'f2-class-a', floor: 'F2', x: -30.5, y: 3.6, z: -28.63, label: '교실 2-1' },
  { id: 'f2-class-b', floor: 'F2', x: -23.5, y: 3.6, z: -28.63, label: '교실 2-2' },
  { id: 'f2-science', floor: 'F2', x: -9.5, y: 3.6, z: -28.63, label: '과학실' },
  { id: 'f3-class', floor: 'F3', x: -30.5, y: 7.2, z: -28.63, label: '교실 3-1' },
  { id: 'f3-av', floor: 'F3', x: -23.5, y: 7.2, z: -28.63, label: '시청각실' },
  { id: 'f3-class-b', floor: 'F3', x: -9.5, y: 7.2, z: -28.63, label: '교실 3-2' },
]

const WIDTH = 1.42
const HEIGHT = 2.08
const INTERACTION_DISTANCE = 1.65
const SLIDE_DISTANCE = 1.34

/** 한국 학교 교실에서 익숙한 수동 미닫이문. E를 눌러 열고 닫는다. */
function Door({ slot, playerRef }: { slot: DoorSlot; playerRef: React.RefObject<THREE.Group | null> }) {
  const bodyRef = useRef<RapierRigidBody>(null)
  const slideRef = useRef(0)
  const nearbyRef = useRef(false)
  const [open, setOpen] = useState(false)
  const [nearby, setNearby] = useState(false)

  useEffect(() => {
    const toggle = (event: KeyboardEvent) => {
      if (event.code !== 'KeyE' || event.repeat || !nearbyRef.current) return
      event.preventDefault()
      setOpen((value) => !value)
    }
    window.addEventListener('keydown', toggle)
    return () => window.removeEventListener('keydown', toggle)
  }, [])

  useFrame((_, delta) => {
    const player = playerRef.current
    const body = bodyRef.current
    if (!player || !body) return
    const sameFloor = Math.abs(player.position.y - slot.y) < 1.35
    const distance = Math.hypot(player.position.x - slot.x, player.position.z - slot.z)
    const nextNearby = sameFloor && distance < INTERACTION_DISTANCE
    if (nextNearby !== nearbyRef.current) {
      nearbyRef.current = nextNearby
      setNearby(nextNearby)
    }

    slideRef.current = THREE.MathUtils.damp(slideRef.current, open ? -SLIDE_DISTANCE : 0, 7, delta)
    body.setNextKinematicTranslation({
      x: slot.x - WIDTH / 2 + slideRef.current,
      y: slot.y,
      z: slot.z,
    })
  })

  return (
    <group>
      {/* 문틀과 레일은 벽에 고정되어 문짝이 열려도 출입구의 구조가 유지된다. */}
      {[-0.82, 0.82].map((offset) => (
        <mesh key={offset} position={[slot.x + offset, slot.y + 1.1, slot.z]} castShadow receiveShadow>
          <boxGeometry args={[0.12, 2.2, 0.24]} />
          <meshStandardMaterial color="#87939b" metalness={0.32} roughness={0.58} />
        </mesh>
      ))}
      <mesh position={[slot.x, slot.y + 2.18, slot.z]} castShadow receiveShadow>
        <boxGeometry args={[1.76, 0.16, 0.28]} />
        <meshStandardMaterial color="#7c8992" metalness={0.3} roughness={0.6} />
      </mesh>
      <mesh position={[slot.x, slot.y + 2.38, slot.z - 0.02]}>
        <boxGeometry args={[1.45, 0.22, 0.08]} />
        <meshStandardMaterial color="#e6dfcb" roughness={0.85} />
      </mesh>

      <RigidBody
        ref={bodyRef}
        type="kinematicPosition"
        colliders={false}
        position={[slot.x - WIDTH / 2, slot.y, slot.z]}
      >
        <CuboidCollider args={[WIDTH / 2, HEIGHT / 2, 0.055]} position={[WIDTH / 2, HEIGHT / 2, 0]} />
        <mesh position={[WIDTH / 2, HEIGHT / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[WIDTH, HEIGHT, 0.11]} />
          <meshStandardMaterial color="#a8875f" roughness={0.74} />
        </mesh>
        <mesh position={[WIDTH / 2, 1.43, 0.061]}>
          <boxGeometry args={[1.08, 0.72, 0.018]} />
          <meshStandardMaterial color="#9db7bd" transparent opacity={0.48} roughness={0.18} metalness={0.05} />
        </mesh>
        <mesh position={[WIDTH - 0.16, 0.92, 0.075]} castShadow>
          <boxGeometry args={[0.055, 0.32, 0.035]} />
          <meshStandardMaterial color="#d0b06a" metalness={0.72} roughness={0.28} />
        </mesh>
      </RigidBody>

      {nearby && (
        <Html position={[slot.x, slot.y + 2.55, slot.z]} center distanceFactor={8} style={{ pointerEvents: 'none' }}>
          <div style={{
            whiteSpace: 'nowrap', border: '1px solid rgba(189,239,255,.55)', borderRadius: 7,
            padding: '5px 9px', color: open ? '#FFD45C' : '#BDEFFF', background: 'rgba(5,15,22,.9)',
            fontSize: 12, fontWeight: 800, boxShadow: '0 4px 14px rgba(0,0,0,.4)',
          }}>
            E · {slot.label} 문 {open ? '닫기' : '열기'}
          </div>
        </Html>
      )}
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
