import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { useGameStore } from '../stores/gameStore'
import { sendGameMessage } from '../hooks/useWebSocket'
import contract from './verticalMapContract.json'

type Slot = { position?: number[]; interactionPosition?: number[]; floor: string; zone?: string }
const slots = contract.slots as unknown as Record<string, Slot>
const _playerPosition = new THREE.Vector3()
const MISSION_SLOT: Record<string, string> = {
  rooftop_intro: 'ROOF_INTRO_MISSION',
  floor_3: 'F3_MISSION_ROOM_POOL',
  floor_2: 'F2_INTERCOM_B',
  floor_1: 'F1_DEVICE_A',
  field_final: 'FIELD_FINAL_STATION_B',
}
const MISSION_LABEL: Record<string, string> = {
  rooftop_intro: '점등 순서대로 옥상 신호 세 곳을 동기화한다',
  floor_3: '3층 방송 장치를 조사한다',
  floor_2: '2층 인터폰에서 AI의 기호 보고를 전달한다',
  floor_1: 'AI와 3초 안에 두 장치를 함께 작동한다',
  field_final: '중앙 장치에서 팀과 합류한다',
  basement_final: '지하 장치의 대기 상태를 확인해 순서대로 복구한다',
  escape_open: '빛기둥 아래로 탈출한다',
}
const ROOFTOP_SIGNALS = [
  { id: 'center', slotId: 'ROOF_SIGNAL_CENTER', label: '중앙 신호' },
  { id: 'east', slotId: 'ROOF_SIGNAL_EAST', label: '동쪽 신호' },
  { id: 'west', slotId: 'ROOF_SIGNAL_WEST', label: '서쪽 신호' },
] as const
const TRANSITIONS: Record<string, { source: string; route: string }[]> = {
  'ROOF>F3': [{ source: 'ROOF_TO_F3_FIRE_DOOR', route: 'west' }],
  'F3>ROOF': [{ source: 'F3_TO_F2_STAIR_WEST', route: 'west' }],
  'F3>F2': [
    { source: 'F3_TO_F2_STAIR_WEST', route: 'west' },
    { source: 'F3_TO_F2_STAIR_EAST', route: 'east' },
  ],
  'F2>F3': [
    { source: 'F2_TO_F1_STAIR_WEST', route: 'west' },
    { source: 'F2_TO_F1_STAIR_EAST', route: 'east' },
  ],
  'F2>F1': [
    { source: 'F2_TO_F1_STAIR_WEST', route: 'west' },
    { source: 'F2_TO_F1_STAIR_EAST', route: 'east' },
  ],
  'F1>F2': [
    { source: 'F1_STAIR_ARRIVAL_WEST', route: 'west' },
    { source: 'F1_STAIR_ARRIVAL_EAST', route: 'east' },
  ],
  'F1>FIELD': [{ source: 'F1_TO_FIELD_FIRE_DOOR', route: 'field' }],
  'FIELD>F1': [{ source: 'FIELD_FINAL_ENTRY', route: 'field' }],
  'F1>B1': [{ source: 'F1_TO_BASEMENT_FIRE_DOOR', route: 'basement' }],
  'B1>F1': [{ source: 'BASEMENT_FINAL_ENTRY', route: 'basement' }],
}
const BASEMENT_DEVICES = [
  { slotId: 'BASEMENT_DEVICE_PANEL', deviceId: 'panel', label: '배전반' },
  { slotId: 'BASEMENT_DEVICE_VALVE', deviceId: 'valve', label: '급수 밸브' },
  { slotId: 'BASEMENT_DEVICE_GENERATOR', deviceId: 'generator', label: '비상 발전기' },
]
const positionOf = (slot: Slot): [number, number, number] => {
  const value = slot.interactionPosition ?? slot.position
  return [value?.[0] ?? 0, value?.[1] ?? 0, value?.[2] ?? 0]
}

function RooftopSignalBeacon({ position, label, current, activated, progress, total }: {
  position: [number, number, number]
  label: string
  current: boolean
  activated: boolean
  progress: number
  total: number
}) {
  const pulseRef = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    if (!pulseRef.current || !current) return
    const pulse = 1 + Math.sin(clock.elapsedTime * 4.5) * 0.12
    pulseRef.current.scale.setScalar(pulse)
    pulseRef.current.rotation.y = clock.elapsedTime * 0.55
  })
  const color = activated ? '#6DCF92' : current ? '#FFD166' : '#385164'
  return (
    <group position={position}>
      <group ref={pulseRef}>
        <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.72, 1.02, 36]} />
          <meshBasicMaterial color={color} transparent opacity={activated ? 0.55 : current ? 0.92 : 0.22} />
        </mesh>
        {current && (
          <mesh position={[0, 1.9, 0]}>
            <octahedronGeometry args={[0.22, 0]} />
            <meshBasicMaterial color="#FFD166" />
          </mesh>
        )}
      </group>
      <pointLight position={[0, 1.15, 0]} color={color} intensity={current ? 10 : activated ? 4 : 0.5} distance={current ? 7 : 3.5} />
      {(current || activated) && (
        <Html position={[0, 2.35, 0]} center distanceFactor={9} style={{ pointerEvents: 'none' }}>
          <div style={{
            whiteSpace: 'nowrap', padding: '7px 11px', borderRadius: 8,
            border: `1px solid ${color}`, color: activated ? '#CFFFE0' : '#FFE7A3',
            background: 'rgba(5,15,22,.94)', fontSize: 12, fontWeight: 800,
          }}>
            {activated ? `완료 · ${label}` : `E · ${label} 동기화 (${progress + 1}/${total})`}
          </div>
        </Html>
      )}
    </group>
  )
}

function RooftopSignalObjectives({ playerRef }: {
  playerRef: React.RefObject<THREE.Group | null>
}) {
  const state = useGameStore((store) => store.rooftopSignal)
  const nextSignalId = state ? state.nextSignalId : 'center'
  const activated = new Set(state?.activatedSignalIds ?? [])
  const nearbyRef = useRef(false)

  useFrame(() => {
    const player = playerRef.current
    const signal = ROOFTOP_SIGNALS.find((item) => item.id === nextSignalId)
    const position = signal ? positionOf(slots[signal.slotId]) : null
    if (player) player.getWorldPosition(_playerPosition)
    nearbyRef.current = Boolean(player && position
      && Math.abs(_playerPosition.y - position[1]) < 1.6
      && Math.hypot(_playerPosition.x - position[0], _playerPosition.z - position[2]) <= 2.25)
  })

  useEffect(() => {
    const interact = (event: KeyboardEvent) => {
      if (event.code !== 'KeyE' || event.repeat || !nearbyRef.current || !nextSignalId) return
      event.preventDefault()
      sendGameMessage({
        type: 'action',
        payload: { action_type: 'interact_stage_mission', signal_id: nextSignalId },
      })
    }
    window.addEventListener('keydown', interact)
    return () => window.removeEventListener('keydown', interact)
  }, [nextSignalId])

  return <>
    {ROOFTOP_SIGNALS.map((signal) => (
      <RooftopSignalBeacon
        key={signal.id}
        position={positionOf(slots[signal.slotId])}
        label={signal.label}
        current={signal.id === nextSignalId}
        activated={activated.has(signal.id)}
        progress={state?.progress ?? 0}
        total={state?.total ?? 3}
      />
    ))}
  </>
}

function BasementDeviceObjective({ playerRef, slotId, deviceId, label }: {
  playerRef: React.RefObject<THREE.Group | null>
  slotId: string
  deviceId: string
  label: string
}) {
  const position = positionOf(slots[slotId])
  const nearbyRef = useRef(false)
  const [nearby, setNearby] = useState(false)

  useFrame(() => {
    const player = playerRef.current
    if (player) player.getWorldPosition(_playerPosition)
    const nextNearby = Boolean(player
      && Math.abs(_playerPosition.y - position[1]) < 1.6
      && Math.hypot(_playerPosition.x - position[0], _playerPosition.z - position[2]) <= 2.25)
    if (nextNearby !== nearbyRef.current) {
      nearbyRef.current = nextNearby
      setNearby(nextNearby)
    }
  })

  useEffect(() => {
    const interact = (event: KeyboardEvent) => {
      if (event.code !== 'KeyE' || event.repeat || !nearbyRef.current) return
      event.preventDefault()
      sendGameMessage({
        type: 'action',
        payload: { action_type: 'activate_basement_device', device_id: deviceId },
      })
    }
    window.addEventListener('keydown', interact)
    return () => window.removeEventListener('keydown', interact)
  }, [deviceId])

  return (
    <group position={position}>
      <mesh position={[0, 0.12, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.55, 0.82, 32]} />
        <meshBasicMaterial color={nearby ? '#B6FF3D' : '#FFB347'} transparent opacity={0.76} />
      </mesh>
      <pointLight position={[0, 1.1, 0]} color={nearby ? '#B6FF3D' : '#FFB347'} intensity={8} distance={4} />
      <Html position={[0, 2.1, 0]} center distanceFactor={9} style={{ pointerEvents: 'none' }}>
        <div style={{
          width: 'max-content', padding: '7px 11px', borderRadius: 8,
          border: `1px solid ${nearby ? '#B6FF3D' : 'rgba(255,179,71,.65)'}`,
          color: nearby ? '#E9FFB8' : '#FFE0AD', background: 'rgba(5,15,22,.92)',
          fontSize: 12, fontWeight: 800,
        }}>
          {nearby ? `E · ${label} 작동` : label}
        </div>
      </Html>
    </group>
  )
}

function BasementDeviceObjectives({ playerRef }: {
  playerRef: React.RefObject<THREE.Group | null>
}) {
  return <>
    {BASEMENT_DEVICES.map((device) => (
      <BasementDeviceObjective key={device.deviceId} playerRef={playerRef} {...device} />
    ))}
  </>
}

function FloorTransitionBeacon({ position, targetFloor, primary }: {
  position: [number, number, number]
  targetFloor: string
  primary: boolean
}) {
  return (
    <group position={position}>
      <mesh position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.52, 0.78, 32]} />
        <meshBasicMaterial color={primary ? '#52E5FF' : '#A7C9D8'} transparent opacity={primary ? 0.78 : 0.42} />
      </mesh>
      <Html position={[0, 1.9, 0]} center distanceFactor={9} style={{ pointerEvents: 'none' }}>
        <div style={{
          width: 'max-content', padding: '6px 10px', borderRadius: 8,
          border: `1px solid ${primary ? 'rgba(82,229,255,.68)' : 'rgba(167,201,216,.42)'}`,
          color: primary ? '#BDEFFF' : '#D6E7EE', background: 'rgba(5,15,22,.9)',
          fontSize: 11, fontWeight: 800,
        }}>
          E · {targetFloor} 구역으로 이동
        </div>
      </Html>
    </group>
  )
}

export default function VerticalObjectives({ playerRef }: {
  playerRef: React.RefObject<THREE.Group | null>
}) {
  const progression = useGameStore((state) => state.verticalProgression)
  const playerFloor = useGameStore((state) => state.players[state.playerId]?.position.floor)
  const phase = useGameStore((state) => state.phase)
  const missionNearbyRef = useRef(false)
  const nearbyTransitionRef = useRef<{ source: string; route: string } | null>(null)
  const [missionNearby, setMissionNearby] = useState(false)
  const previousFloor = progression?.accessible_floors.find((floor) => floor !== progression.active_floor)
  const targetFloor = progression?.active_floor && playerFloor !== progression.active_floor
    ? progression.active_floor
    : previousFloor
  const transitionKey = playerFloor && targetFloor ? `${playerFloor}>${targetFloor}` : ''
  const choices = TRANSITIONS[transitionKey] ?? []
  const escapeSlotId = progression?.final_route === 'basement'
    ? 'BASEMENT_ESCAPE_GATE'
    : 'FIELD_ESCAPE_GATE'
  const missionSlotId = progression && (
    playerFloor === progression.active_floor
    || (progression.phase === 'escape_open' && playerFloor === slots[escapeSlotId].floor)
  )
    ? progression.phase === 'escape_open' ? escapeSlotId : MISSION_SLOT[progression.phase]
    : undefined
  const missionPosition = missionSlotId ? positionOf(slots[missionSlotId]) : null
  const transitionIsPrimary = Boolean(progression?.active_floor && playerFloor !== progression.active_floor)

  useFrame(() => {
    const player = playerRef.current
    if (player) player.getWorldPosition(_playerPosition)
    const nextMissionNearby = Boolean(player && missionPosition
      && Math.abs(_playerPosition.y - missionPosition[1]) < 1.6
      && Math.hypot(_playerPosition.x - missionPosition[0], _playerPosition.z - missionPosition[2]) <= 2.25)
    if (nextMissionNearby !== missionNearbyRef.current) {
      missionNearbyRef.current = nextMissionNearby
      setMissionNearby(nextMissionNearby)
    }
    nearbyTransitionRef.current = player
      ? choices.find((choice) => {
          const position = positionOf(slots[choice.source])
          return Math.abs(_playerPosition.y - position[1]) < 1.6
            && Math.hypot(_playerPosition.x - position[0], _playerPosition.z - position[2]) <= 2.25
        }) ?? null
      : null
  })

  useEffect(() => {
    const interact = (event: KeyboardEvent) => {
      if (event.code !== 'KeyE' || event.repeat || !progression) return
      const nearbyTransition = nearbyTransitionRef.current
      if (!nearbyTransition && !missionNearbyRef.current) return
      event.preventDefault()
      sendGameMessage(progression.phase === 'escape_open'
        ? { type: 'action', payload: { action_type: 'vertical_escape' } }
        : nearbyTransition
        ? { type: 'action', payload: { action_type: 'use_floor_transition', route: nearbyTransition.route } }
        : { type: 'action', payload: { action_type: 'interact_stage_mission' } })
    }
    window.addEventListener('keydown', interact)
    return () => window.removeEventListener('keydown', interact)
  }, [progression])

  if (
    progression?.enabled
    && progression.phase === 'rooftop_intro'
    && playerFloor === 'ROOF'
    && phase === 'playing'
  ) return <RooftopSignalObjectives playerRef={playerRef} />
  const transitionBeacons = choices.map((choice) => (
    <FloorTransitionBeacon
      key={`${transitionKey}-${choice.route}`}
      position={positionOf(slots[choice.source])}
      targetFloor={String(targetFloor)}
      primary={transitionIsPrimary}
    />
  ))
  if (
    progression?.enabled
    && progression.phase === 'basement_final'
    && playerFloor === 'B1'
    && phase === 'playing'
  ) return <><BasementDeviceObjectives playerRef={playerRef} />{transitionBeacons}</>
  if (!progression?.enabled || !['playing', 'final_spell', 'escape'].includes(phase)) return null
  if (!missionPosition) return <>{transitionBeacons}</>
  const label = MISSION_LABEL[progression.phase] ?? '현재 구역 목표를 수행한다'
  return (
    <>
    {transitionBeacons}
    <group position={missionPosition}>
      {progression.phase === 'escape_open' && (
        <mesh position={[0, 18, 0]}>
          <cylinderGeometry args={[0.35, 1.4, 36, 18, 1, true]} />
          <meshBasicMaterial color="#8DFFF2" transparent opacity={0.32} depthWrite={false} />
        </mesh>
      )}
      <mesh position={[0, 0.12, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.55, 0.82, 32]} />
        <meshBasicMaterial color={missionNearby ? '#B6FF3D' : '#52E5FF'} transparent opacity={0.72} />
      </mesh>
      <pointLight position={[0, 1.1, 0]} color={missionNearby ? '#B6FF3D' : '#52E5FF'} intensity={8} distance={4} />
      <Html position={[0, 2.1, 0]} center distanceFactor={9} style={{ pointerEvents: 'none' }}>
        <div style={{
          width: 'max-content', maxWidth: 280, padding: '7px 11px',
          border: '1px solid ' + (missionNearby ? '#B6FF3D' : 'rgba(82,229,255,.58)'),
          borderRadius: 8, color: missionNearby ? '#E9FFB8' : '#BDEFFF',
          background: 'rgba(5,15,22,.92)', fontSize: 12, fontWeight: 800, textAlign: 'center',
        }}>
          {missionNearby ? 'E · ' + label : label}
        </div>
      </Html>
    </group>
    </>
  )
}
