import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { useGameStore } from '../stores/gameStore'
import { sendGameMessage } from '../hooks/useWebSocket'
import useSound from '../hooks/useSound'
import contract from './verticalMapContract.json'

type Slot = { position?: number[]; interactionPosition?: number[]; floor: string; zone?: string }
const slots = contract.slots as unknown as Record<string, Slot>
const _playerPosition = new THREE.Vector3()
const MISSION_SLOT: Record<string, string> = {
  rooftop_intro: 'ROOF_INTRO_MISSION',
  floor_3: 'F3_BROADCAST_CONSOLE',
  floor_2: 'F2_INTERCOM_B',
  floor_1: 'F1_DEVICE_A',
  field_final: 'FIELD_FINAL_STATION_B',
}
const MISSION_LABEL: Record<string, string> = {
  rooftop_intro: '점멸 순서를 기억하고 옥상 세 신호를 직접 입력한다',
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

type RooftopSignalId = typeof ROOFTOP_SIGNALS[number]['id']

function RooftopSignalBeacon({ position, label, previewOrder, nearby, guided, activated, progress, total }: {
  position: [number, number, number]
  label: string
  previewOrder: number | null
  nearby: boolean
  guided: boolean
  activated: boolean
  progress: number
  total: number
}) {
  const pulseRef = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    if (!pulseRef.current || (previewOrder === null && !nearby && !guided)) return
    const pulse = 1 + Math.sin(clock.elapsedTime * 4.5) * 0.12
    pulseRef.current.scale.setScalar(pulse)
    pulseRef.current.rotation.y = clock.elapsedTime * 0.55
  })
  const highlighted = previewOrder !== null || nearby || guided
  const color = activated ? '#6DCF92' : previewOrder !== null ? '#FFD166' : guided ? '#B6FF3D' : nearby ? '#8DFFF2' : '#385164'
  return (
    <group position={position}>
      <group ref={pulseRef}>
        <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.72, 1.02, 36]} />
          <meshBasicMaterial color={color} transparent opacity={activated ? 0.55 : highlighted ? 0.92 : 0.16} />
        </mesh>
        {previewOrder !== null && (
          <>
            <mesh position={[0, 3.2, 0]}>
              <cylinderGeometry args={[0.14, 0.52, 6.2, 12, 1, true]} />
              <meshBasicMaterial
                color="#FFD166" transparent opacity={0.38} depthWrite={false}
                blending={THREE.AdditiveBlending}
              />
            </mesh>
            <mesh position={[0, 2.15, 0]}>
              <octahedronGeometry args={[0.28, 0]} />
              <meshBasicMaterial color="#FFF2A8" />
            </mesh>
          </>
        )}
      </group>
      <pointLight position={[0, 1.15, 0]} color={color} intensity={highlighted ? 10 : activated ? 4 : 0.5} distance={highlighted ? 7 : 3.5} />
      {(highlighted || activated) && (
        <Html position={[0, 2.35, 0]} center distanceFactor={9} style={{ pointerEvents: 'none' }}>
          <div style={{
            whiteSpace: 'nowrap', padding: '7px 11px', borderRadius: 8,
            border: `1px solid ${color}`, color: activated ? '#CFFFE0' : '#FFE7A3',
            background: 'rgba(5,15,22,.94)', fontSize: 12, fontWeight: 800,
          }}>
            {activated
              ? `입력 완료 · ${label}`
              : previewOrder !== null
                ? `${previewOrder + 1}번째 · ${label}`
                : guided
                  ? `AI 안내 · 다음은 ${label}${nearby ? ' · E 입력' : ''}`
                : `E · 기억한 순서 입력 (${progress + 1}/${total})`}
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
  const activated = new Set(state?.activatedSignalIds ?? [])
  const sequence = state?.signalSequence?.length
    ? state.signalSequence
    : ROOFTOP_SIGNALS.map((signal) => signal.id)
  const sequenceKey = sequence.join('|')
  const [previewStep, setPreviewStep] = useState(-1)
  const [previewRun, setPreviewRun] = useState(0)
  const [nearbySignalId, setNearbySignalId] = useState<RooftopSignalId | null>(null)
  const nearbyRef = useRef<RooftopSignalId | null>(null)
  const { playRooftopSignal } = useSound()

  useEffect(() => {
    if (previewStep >= 0) playRooftopSignal(previewStep)
  }, [playRooftopSignal, previewStep])

  useEffect(() => {
    const timers: number[] = []
    const previewLength = sequenceKey.split('|').filter(Boolean).length
    for (let index = 0; index < previewLength; index++) {
      timers.push(window.setTimeout(() => setPreviewStep(index), index * 1400))
    }
    timers.push(window.setTimeout(() => setPreviewStep(-1), previewLength * 1400 + 700))
    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [sequenceKey, previewRun])

  useFrame(() => {
    const player = playerRef.current
    if (player) player.getWorldPosition(_playerPosition)
    let closest: RooftopSignalId | null = null
    let closestDistance = 2.25
    if (player) for (const signal of ROOFTOP_SIGNALS) {
      const position = positionOf(slots[signal.slotId])
      const distance = Math.hypot(_playerPosition.x - position[0], _playerPosition.z - position[2])
      if (Math.abs(_playerPosition.y - position[1]) < 1.6 && distance <= closestDistance) {
        closest = signal.id
        closestDistance = distance
      }
    }
    if (closest !== nearbyRef.current) {
      nearbyRef.current = closest
      setNearbySignalId(closest)
    }
  })

  useEffect(() => {
    const interact = (event: KeyboardEvent) => {
      if (event.code === 'KeyR' && !event.repeat) {
        event.preventDefault()
        event.stopImmediatePropagation()
        setPreviewRun((run) => run + 1)
        return
      }
      if (event.code !== 'KeyE' || event.repeat || !nearbyRef.current || previewStep >= 0) return
      event.preventDefault()
      event.stopImmediatePropagation()
      sendGameMessage({
        type: 'action',
        payload: { action_type: 'interact_stage_mission', signal_id: nearbyRef.current },
      })
    }
    window.addEventListener('keydown', interact)
    return () => window.removeEventListener('keydown', interact)
  }, [previewStep])

  return <>
    {ROOFTOP_SIGNALS.map((signal) => (
      <RooftopSignalBeacon
        key={signal.id}
        position={positionOf(slots[signal.slotId])}
        label={signal.label}
        previewOrder={previewStep >= 0 && sequence[previewStep] === signal.id ? previewStep : null}
        nearby={previewStep < 0 && nearbySignalId === signal.id && !activated.has(signal.id)}
        guided={previewStep < 0 && state?.nextSignalId === signal.id}
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

const BROADCAST_MEANINGS = [
  { label: '문을 여는 도구', color: '#52E5FF' },
  { label: '잠긴 출입구', color: '#FFD166' },
  { label: '개방 행동', color: '#FF5C78' },
]

function BroadcastMissionObjective({
  position,
  nearby,
  active,
}: {
  position: [number, number, number]
  nearby: boolean
  active: boolean
}) {
  const waveformRef = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    if (!waveformRef.current) return
    waveformRef.current.children.forEach((bar, index) => {
      const strength = active
        ? 0.45 + Math.abs(Math.sin(clock.elapsedTime * 5.5 + index * 0.9)) * 1.15
        : 0.28
      bar.scale.y = strength
    })
  })
  const accent = active ? '#FF375F' : nearby ? '#FFD166' : '#617989'
  return (
    <group position={position}>
      <group ref={waveformRef} position={[0, 1.4, -0.35]}>
        {Array.from({ length: 9 }, (_, index) => (
          <mesh key={index} position={[(index - 4) * 0.16, 0, 0]}>
            <boxGeometry args={[0.09, 0.5, 0.08]} />
            <meshBasicMaterial color={accent} transparent opacity={active ? 0.95 : 0.48} />
          </mesh>
        ))}
      </group>
      {BROADCAST_MEANINGS.map((meaning, index) => (
        <group key={meaning.label} position={[(index - 1) * 1.05, 0.05, 0.55]}>
          <mesh>
            <boxGeometry args={[0.86, 0.06, 0.34]} />
            <meshBasicMaterial color={meaning.color} transparent opacity={active ? 0.82 : 0.28} />
          </mesh>
        </group>
      ))}
      <pointLight
        position={[0, 1.65, -0.8]}
        color={active ? '#FF294D' : '#FFD166'}
        intensity={active ? 14 : nearby ? 6 : 2}
        distance={active ? 7 : 3.5}
      />
      <Html position={[0, 2.35, 0]} center distanceFactor={9} style={{ pointerEvents: 'none' }}>
        <div style={{
          width: 310, padding: '10px 12px', borderRadius: 8,
          border: `1px solid ${active ? 'rgba(255,55,95,.86)' : 'rgba(255,209,102,.58)'}`,
          color: active ? '#FFD7DF' : '#FFF0B8', background: 'rgba(12,8,14,.95)',
          fontSize: 12, fontWeight: 800, textAlign: 'center', lineHeight: 1.5,
          boxShadow: active ? '0 0 20px rgba(255,41,77,.28)' : 'none',
        }}>
          <div style={{ color: active ? '#FF5C78' : '#FFD166', fontSize: 11, letterSpacing: 2 }}>
            {active ? '● ON AIR · 제한 추격 시작' : '3F EMERGENCY BROADCAST'}
          </div>
          <div style={{ marginTop: 4 }}>
            {active
              ? 'Q · 원문 대신 세 가지 뜻을 다른 말로 방송'
              : nearby ? 'E · 방송 송신기 연결' : '방송실 안 송신 콘솔을 찾으세요'}
          </div>
          {active && (
            <div style={{ marginTop: 5, color: '#C6DCE5', fontSize: 10 }}>
              {BROADCAST_MEANINGS.map((meaning) => meaning.label).join('  /  ')}
            </div>
          )}
        </div>
      </Html>
    </group>
  )
}

function PhysicalRoofStairGuidance({ direction }: { direction: 'down' | 'up' }) {
  const slotId = direction === 'down'
    ? 'ROOF_TO_F3_FIRE_DOOR'
    : 'F3_TO_ROOF_STAIR_TOP_CROSSING'
  const position = positionOf(slots[slotId])
  return (
    <group position={position}>
      <mesh position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.5, 0.76, 32]} />
        <meshBasicMaterial color="#FFD166" transparent opacity={0.7} />
      </mesh>
      <Html position={[0, 2.15, 0]} center distanceFactor={9} style={{ pointerEvents: 'none' }}>
        <div style={{
          width: 230, padding: '8px 12px', borderRadius: 8,
          border: '1px solid rgba(255,209,102,.72)', color: '#FFE9A9',
          background: 'rgba(5,15,22,.94)', fontSize: 12, fontWeight: 800,
          textAlign: 'center', lineHeight: 1.45,
        }}>
          {direction === 'down'
            ? '방화문을 열고 계단을 직접 내려가세요'
            : '계단을 끝까지 올라 옥상으로 돌아가세요'}
        </div>
      </Html>
    </group>
  )
}

export default function VerticalObjectives({ playerRef }: {
  playerRef: React.RefObject<THREE.Group | null>
}) {
  const progression = useGameStore((state) => state.verticalProgression)
  const activeMissionPrompt = useGameStore((state) => state.activeMissionPrompt)
  const playerFloor = useGameStore((state) => state.players[state.playerId]?.position.floor)
  const phase = useGameStore((state) => state.phase)
  const missionNearbyRef = useRef(false)
  const nearbyTransitionRef = useRef<{ source: string; route: string } | null>(null)
  const stairBoundaryRequestAtRef = useRef(0)
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
  const stairDirection = transitionKey === 'ROOF>F3' ? 'down'
    : transitionKey === 'F3>ROOF' ? 'up'
    : null

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

    if (!player || !stairDirection) return
    const boundarySlotId = stairDirection === 'down'
      ? 'ROOF_TO_F3_STAIR_BOTTOM_CROSSING'
      : 'F3_TO_ROOF_STAIR_TOP_CROSSING'
    const boundary = positionOf(slots[boundarySlotId])
    const crossedHeight = stairDirection === 'down'
      ? _playerPosition.y <= boundary[1] + 0.55
      : _playerPosition.y >= boundary[1] - 0.55
    if (
      crossedHeight
      && Math.hypot(_playerPosition.x - boundary[0], _playerPosition.z - boundary[2]) <= 1.25
      && performance.now() - stairBoundaryRequestAtRef.current >= 900
    ) {
      // 네트워크 프레임 유실이나 서버 판정 경합으로 첫 요청이 거절돼도
      // 경계에 머무는 동안 다시 시도한다. 층 변경 후에는 조건에서 빠진다.
      stairBoundaryRequestAtRef.current = performance.now()
      sendGameMessage({
        type: 'action',
        payload: { action_type: 'cross_rooftop_stair_boundary', direction: stairDirection },
      })
    }
  })

  useEffect(() => {
    stairBoundaryRequestAtRef.current = 0
  }, [playerFloor, progression?.phase])

  useEffect(() => {
    const interact = (event: KeyboardEvent) => {
      if (event.code !== 'KeyE' || event.repeat || !progression) return
      // 옥상은 각 중계기의 signal_id가 반드시 필요한 전용 기억 미션이다.
      // 공용 처리기가 같은 E를 또 보내면 signal_id 없는 요청과 정상 요청이
      // 한 프레임에 중복되므로 옥상 입력은 자식 처리기 하나가 독점한다.
      if (progression.phase === 'rooftop_intro') return
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
  const stairGuidance = stairDirection
    ? <PhysicalRoofStairGuidance direction={stairDirection} />
    : null
  if (
    progression?.enabled
    && progression.phase === 'basement_final'
    && playerFloor === 'B1'
    && phase === 'playing'
  ) return <><BasementDeviceObjectives playerRef={playerRef} />{transitionBeacons}{stairGuidance}</>
  if (!progression?.enabled || !['playing', 'final_spell', 'escape'].includes(phase)) return null
  if (!missionPosition) return <>{transitionBeacons}{stairGuidance}</>
  if (progression.phase === 'floor_3') return (
    <>
      {transitionBeacons}
      {stairGuidance}
      <BroadcastMissionObjective
        position={missionPosition}
        nearby={missionNearby}
        active={activeMissionPrompt !== null}
      />
    </>
  )
  const label = MISSION_LABEL[progression.phase] ?? '현재 구역 목표를 수행한다'
  return (
    <>
    {transitionBeacons}
    {stairGuidance}
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
