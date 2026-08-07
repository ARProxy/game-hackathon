import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { useGameStore } from '../stores/gameStore'
import { sendGameMessage } from '../hooks/useWebSocket'
import contract from './verticalMapContract.json'

type Slot = { position?: number[]; interactionPosition?: number[]; floor: string; zone?: string }
const slots = contract.slots as unknown as Record<string, Slot>
const MISSION_SLOT: Record<string, string> = {
  rooftop_intro: 'ROOF_INTRO_MISSION',
  floor_3: 'F3_MISSION_ROOM_POOL',
  floor_2: 'F2_MISSION_ROOM_POOL',
  floor_1: 'F1_MISSION_ROOM_POOL',
}
const MISSION_LABEL: Record<string, string> = {
  rooftop_intro: '옥상 신호 장치를 가동한다',
  floor_3: '3층 방송 장치를 조사한다',
  floor_2: '2층 인터폰 장치를 연결한다',
  floor_1: '1층 관제 장치를 해제한다',
}
const TRANSITIONS: Record<string, { source: string; route: string }[]> = {
  'ROOF>F3': [{ source: 'ROOF_TO_F3_FIRE_DOOR', route: 'west' }],
  'F3>F2': [
    { source: 'F3_TO_F2_STAIR_WEST', route: 'west' },
    { source: 'F3_TO_F2_STAIR_EAST', route: 'east' },
  ],
  'F2>F1': [
    { source: 'F2_TO_F1_STAIR_WEST', route: 'west' },
    { source: 'F2_TO_F1_STAIR_EAST', route: 'east' },
  ],
  'F1>FIELD': [{ source: 'F1_TO_FIELD_FIRE_DOOR', route: 'field' }],
}
const positionOf = (slot: Slot): [number, number, number] => {
  const value = slot.interactionPosition ?? slot.position
  return [value?.[0] ?? 0, value?.[1] ?? 0, value?.[2] ?? 0]
}

export default function VerticalObjectives({ playerRef }: {
  playerRef: React.RefObject<THREE.Group | null>
}) {
  const progression = useGameStore((state) => state.verticalProgression)
  const playerFloor = useGameStore((state) => state.players[state.playerId]?.position.floor)
  const phase = useGameStore((state) => state.phase)
  const nearbyRef = useRef(false)
  const [nearby, setNearby] = useState(false)
  const transitionKey = progression?.active_floor && playerFloor !== progression.active_floor
    ? String(playerFloor) + '>' + progression.active_floor
    : ''
  const choices = TRANSITIONS[transitionKey] ?? []
  const nearestTransition = choices.reduce<{ source: string; route: string } | null>((best, choice) => {
    const player = playerRef.current
    if (!player) return best ?? choice
    const distance = new THREE.Vector3(...positionOf(slots[choice.source])).distanceTo(player.position)
    if (!best) return choice
    const bestDistance = new THREE.Vector3(...positionOf(slots[best.source])).distanceTo(player.position)
    return distance < bestDistance ? choice : best
  }, null)
  const missionSlotId = progression && playerFloor === progression.active_floor
    ? MISSION_SLOT[progression.phase]
    : undefined
  const objectiveSlotId = nearestTransition?.source ?? missionSlotId
  const objectivePosition = objectiveSlotId ? positionOf(slots[objectiveSlotId]) : null

  useFrame(() => {
    const player = playerRef.current
    const nextNearby = Boolean(player && objectivePosition
      && Math.abs(player.position.y - objectivePosition[1]) < 1.6
      && Math.hypot(player.position.x - objectivePosition[0], player.position.z - objectivePosition[2]) <= 2.25)
    if (nextNearby !== nearbyRef.current) {
      nearbyRef.current = nextNearby
      setNearby(nextNearby)
    }
  })

  useEffect(() => {
    const interact = (event: KeyboardEvent) => {
      if (event.code !== 'KeyE' || event.repeat || !nearbyRef.current || !progression) return
      event.preventDefault()
      sendGameMessage(nearestTransition
        ? { type: 'action', payload: { action_type: 'use_floor_transition', route: nearestTransition.route } }
        : { type: 'action', payload: { action_type: 'interact_stage_mission' } })
    }
    window.addEventListener('keydown', interact)
    return () => window.removeEventListener('keydown', interact)
  }, [nearestTransition, progression])

  if (!progression?.enabled || !objectivePosition || !['playing', 'final_spell', 'escape'].includes(phase)) return null
  const label = nearestTransition
    ? progression.active_floor + ' 구역으로 이동한다'
    : MISSION_LABEL[progression.phase] ?? '현재 구역 목표를 수행한다'
  return (
    <group position={objectivePosition}>
      <mesh position={[0, 0.12, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.55, 0.82, 32]} />
        <meshBasicMaterial color={nearby ? '#B6FF3D' : '#52E5FF'} transparent opacity={0.72} />
      </mesh>
      <pointLight position={[0, 1.1, 0]} color={nearby ? '#B6FF3D' : '#52E5FF'} intensity={8} distance={4} />
      <Html position={[0, 2.1, 0]} center distanceFactor={9} style={{ pointerEvents: 'none' }}>
        <div style={{
          width: 'max-content', maxWidth: 280, padding: '7px 11px',
          border: '1px solid ' + (nearby ? '#B6FF3D' : 'rgba(82,229,255,.58)'),
          borderRadius: 8, color: nearby ? '#E9FFB8' : '#BDEFFF',
          background: 'rgba(5,15,22,.92)', fontSize: 12, fontWeight: 800, textAlign: 'center',
        }}>
          {nearby ? 'E · ' + label : label}
        </div>
      </Html>
    </group>
  )
}
