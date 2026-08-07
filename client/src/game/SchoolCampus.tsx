import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import SchoolCampusV4 from './SchoolCampusV4'
import { useFrame } from '@react-three/fiber'
import { RigidBody, CuboidCollider } from '@react-three/rapier'
import {
  GATE_LOCKED_BLOCKER_HALF_SIZE,
  GATE_SENSOR_LOCAL_Z,
  GATE_SLOTS,
} from './gateContract'
import actorContract from './actorContract.json'
import trapContract from './trapContract.json'

export { GATE_SLOTS } from './gateContract'

export type FloorKey = 'OUT' | 'F1' | 'F2' | 'F3' | 'ROOF'
type V2 = [number, number]

export const MAP_SIZE = 80
export const FLOOR_HEIGHT = 3.6
export const ROOF_Y = 10.8
/** 층 → 바닥 Y */
export const FLOOR_Y: Record<FloorKey, number> = { OUT: 0, F1: 0, F2: 3.6, F3: 7.2, ROOF: 10.8 }

export type TrapKind = 'gap' | 'shortcut' | 'deadend' | 'vertical'

/** 트랩 슬롯 12곳 — 한 판에 4~5개만 활성화 (pickRound 참조)
 *  gap 병목 · shortcut 지름길의 대가 · deadend 막다른 곳(최악) · vertical 수직 루트 고립 */
const TRAP_METADATA: { id: string; p: V2; floor: FloorKey; kind: TrapKind; risk: 1 | 2 | 3 }[] = [
  { id: 'trap_1f_corridor', p: [-8, -27.2], floor: 'F1', kind: 'gap', risk: 2 }, // 1F 중앙 복도 — 교실 문 사이 병목
  { id: 'trap_2f_science', p: [-9.5, -27.2], floor: 'F2', kind: 'gap', risk: 3 }, // 과학실(미션 방) 앞 — 미션 동선 필수 통과
  { id: 'trap_1f_kitchen', p: [-25.1, -19], floor: 'F1', kind: 'gap', risk: 2 }, // 급식실 앞 복도 — 윙 진입 병목
  { id: 'trap_field_gate', p: [13.5, 22], floor: 'OUT', kind: 'gap', risk: 2 }, // 운동장↔골목 개구부
  { id: 'trap_field_diag', p: [2, 6], floor: 'OUT', kind: 'shortcut', risk: 1 }, // 운동장 대각 지름길 — 지름길의 대가
  { id: 'trap_alley_curve', p: [-2.5, 30.5], floor: 'OUT', kind: 'shortcut', risk: 2 }, // 골목 S커브 — 시야 사각
  { id: 'trap_gym_stage', p: [21, -27], floor: 'F1', kind: 'shortcut', risk: 2 }, // 체육관 무대 앞 횡단
  { id: 'trap_1f_storage', p: [-21, -12.5], floor: 'F1', kind: 'deadend', risk: 3 }, // 창고 막다른 방 입구 — 최악
  { id: 'trap_gym_bleacher', p: [27.5, -31.5], floor: 'F1', kind: 'deadend', risk: 3 }, // 관중석 아래 — 빠져나갈 길 없음
  { id: 'trap_3f_end', p: [5.5, -27.2], floor: 'F3', kind: 'deadend', risk: 3 }, // 3F 복도 동쪽 끝 — 되돌아갈 수밖에
  { id: 'trap_play_bridge', p: [-27.4, 2], floor: 'OUT', kind: 'vertical', risk: 2 }, // 놀이터 공중 브릿지 — 내려갈 길 하나
  { id: 'trap_roof_tank', p: [-2, -33.5], floor: 'ROOF', kind: 'vertical', risk: 3 }, // 옥상 물탱크 사이 — 최상층 고립

]

/** 위치와 층은 서버도 읽는 공통 계약을 정본으로 사용한다. */
export const TRAP_SLOTS = TRAP_METADATA.map((metadata) => {
  const contract = trapContract.traps.find((trap) => trap.id === metadata.id)
  if (!contract) throw new Error(`Missing trap contract: ${metadata.id}`)
  return {
    ...metadata,
    p: [contract.x, contract.z] as V2,
    floor: contract.floor as FloorKey,
  }
})

/** T1 미션용 프롭 슬롯 — surfaceY는 프롭이 놓일 표면 높이(책상/무대/조회대 위) */
export const PROP_SLOTS: { id: string; p: V2; floor: FloorKey; surfaceY: number }[] = [
  { id: 'prop_sci_01', p: [-8.1, -33.6], floor: 'F2', surfaceY: 4.45 },
  { id: 'prop_sci_02', p: [-10.95, -31], floor: 'F2', surfaceY: 4.45 },
  { id: 'prop_class_01', p: [-30.5, -33.7], floor: 'F1', surfaceY: 0.72 },
  { id: 'prop_lobby', p: [-9.5, -27.9], floor: 'F1', surfaceY: 0 },
  { id: 'prop_kitchen', p: [-31.5, -17.5], floor: 'F1', surfaceY: 0 },
  { id: 'prop_stage', p: [17, -25], floor: 'F1', surfaceY: 1.2 },
  { id: 'prop_roof', p: [-25.5, -27], floor: 'ROOF', surfaceY: 10.8 },
  { id: 'prop_podium', p: [-16, -6], floor: 'OUT', surfaceY: 1.2 },
  { id: 'prop_stand', p: [8, 18], floor: 'OUT', surfaceY: 1.4 },
  { id: 'prop_alley', p: [-4, 26], floor: 'OUT', surfaceY: 0 },

]

export type LampTone = 'warm' | 'amber' | 'cool'

/** 조명 톤 팔레트 — 구역 정체성을 색으로 구분한다
 *  warm  #ffe9c4 운동장·놀이터 (h7 야간등은 밝지만 완전 노출 / h4 놀이터는 그림자 많음)
 *  amber #ffd9a0 골목·정문 (좁은 통로의 유일한 광원)
 *  cool  #cfe3ff 건물 입구 (차갑고 인공적 — 실내 대비)
 *  배경/포그는 #07090D~#0F1A22 유지 */
export const LAMP_TONES = { warm: '#ffe9c4', amber: '#ffd9a0', cool: '#cfe3ff' } as const
export const LAMPS: { p: V2; h: number; c: string; tone: LampTone }[] = [
  { p: [-4, 8], h: 7, c: '#ffe9c4', tone: 'warm' }, // 운동장 야간등
  { p: [22, 8], h: 7, c: '#ffe9c4', tone: 'warm' },
  { p: [-4, -14], h: 7, c: '#ffe9c4', tone: 'warm' },
  { p: [22, -14], h: 7, c: '#ffe9c4', tone: 'warm' },
  { p: [-28, 8], h: 4, c: '#ffe9c4', tone: 'warm' }, // 놀이터
  { p: [-30, 16], h: 4, c: '#ffe9c4', tone: 'warm' },
  { p: [-6, 26], h: 4, c: '#ffd9a0', tone: 'amber' }, // 골목
  { p: [6, 33], h: 4, c: '#ffd9a0', tone: 'amber' },
  { p: [17, 24], h: 4, c: '#ffd9a0', tone: 'amber' },
  { p: [33, 30], h: 4, c: '#ffd9a0', tone: 'amber' }, // 정문
  { p: [-9.8, -24], h: 3.4, c: '#cfe3ff', tone: 'cool' }, // 본관 현관
  { p: [-25.5, -13.5], h: 3.4, c: '#cfe3ff', tone: 'cool' }, // 별관 앞
  { p: [23.5, -17], h: 3.4, c: '#cfe3ff', tone: 'cool' }, // 체육관 입구
  { p: [11.5, -20.5], h: 3.4, c: '#cfe3ff', tone: 'cool' }, // 본관↔체육관 사이

]

/** 스폰 */
export const SPAWNS = {
  player: actorContract.spawns.human as V2,   // 본관 현관 앞
  ai: actorContract.spawns.partner as V2,     // 조회대 옆
  ai2: actorContract.spawns.partner2 as V2,   // 조회대 반대편
  seeker: actorContract.spawns.seeker as V2,  // 체육관
}

/** ══ T1 미션 (열쇠 찾기) ══
 *  후보 프롭 3개 중 정답 1개를 판마다 랜덤. 셋 다 같은 외형이라 조사해야 알 수 있다 */
export const MISSION = {
  id: 'T1_key',
  label: '열쇠를 찾아 탈출 게이트를 열어라',
  candidates: ['prop_sci_01', 'prop_sci_02', 'prop_class_01'] as const,
  searchSeconds: 1.6,
  revealRadius: 3.5,
}

/** ══ 라운드 구성 규칙 ══ */
export const ROUNDS = {
  trapCount: [4, 5] as const,
  trapMix: {"gap":[1,2],"shortcut":[1,2],"deadend":[1,2],"vertical":[0,1]} as Record<TrapKind, [number, number]>,
  gateCount: 1,
}

export type RoundPlan = { seed: number; traps: string[]; gate: string; missionProp: string; decoyProps: string[] }

/** 시드 → 판 구성 (결정적: 서버·클라이언트 동일 결과).
 *  트랩은 카테고리 최소치를 먼저 채워 병목만 몰리는 판을 막는다 */
export function pickRound(seed: number = Date.now()): RoundPlan {
  let x = seed >>> 0 || 1
  const rnd = () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296)
  const shuffle = <T,>(a: readonly T[]): T[] => {
    const r = a.slice()
    for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [r[i], r[j]] = [r[j], r[i]] }
    return r
  }
  const [lo, hi] = ROUNDS.trapCount
  const target = lo + Math.floor(rnd() * (hi - lo + 1))
  const chosen: typeof TRAP_SLOTS = []
  for (const kind of Object.keys(ROUNDS.trapMix) as TrapKind[]) {
    const pool = shuffle(TRAP_SLOTS.filter((t) => t.kind === kind))
    for (let i = 0; i < ROUNDS.trapMix[kind][0] && i < pool.length; i++) chosen.push(pool[i])
  }
  for (const t of shuffle(TRAP_SLOTS.filter((t) => !chosen.includes(t)))) {
    if (chosen.length >= target) break
    if (chosen.filter((c) => c.kind === t.kind).length < ROUNDS.trapMix[t.kind][1]) chosen.push(t)
  }
  const gate = shuffle(GATE_SLOTS)[0].id
  const missionProp = shuffle(MISSION.candidates)[0]
  return {
    seed, traps: chosen.map((t) => t.id), gate, missionProp,
    decoyProps: MISSION.candidates.filter((c) => c !== missionProp) as string[],
  }
}

export function TrapPlate({ id, position, floor, active = true, onTriggered }: {
  id: string; position: V2; floor: FloorKey; active?: boolean; onTriggered?: (id: string) => void
}) {
  if (!active) return null
  const y = FLOOR_Y[floor]
  return (
    <RigidBody type="fixed" position={[position[0], y, position[1]]} colliders={false}>
      <CuboidCollider args={[0.75, 0.14, 0.75]} sensor onIntersectionEnter={() => onTriggered?.(id)} />
      <mesh position={[0, 0.04, 0]}>
        <boxGeometry args={[1.5, 0.07, 1.5]} />
        {/* 어둠 속 아주 희미한 발광 — 아는 사람만 피한다 */}
        <meshStandardMaterial color="#33121c" emissive="#FF2F6E" emissiveIntensity={0.12} />
      </mesh>
    </RigidBody>
  )
}

export function GateFrame({ position, rotationY, selected = false, open = false, onActivated, onArrived, onEscaped }: {
  position: V2; rotationY: number
  /** 서버가 선택한 이번 판의 게이트. final_spell부터 잠긴 상태로 노출한다. */
  selected?: boolean
  /** 주문 성공 뒤 실제로 열린 상태. */
  open?: boolean
  onActivated?: () => void
  onArrived?: () => void
  onEscaped?: () => void
}) {
  const beamRef = useRef<THREE.Mesh>(null)
  const prev = useRef(open)
  useEffect(() => {
    if (open && !prev.current) onActivated?.()
    prev.current = open
  }, [open, onActivated])
  // 선택된 게이트는 잠긴 동안 황색, 주문 성공 뒤 청록색 비콘으로 안내한다.
  useFrame((st) => {
    if (!beamRef.current) return
    const t = st.clock.elapsedTime
    const m = beamRef.current.material as THREE.MeshBasicMaterial
    m.opacity = selected
      ? (open ? 0.16 + 0.1 * Math.sin(t * 2.2) : 0.08 + 0.04 * Math.sin(t * 1.8))
      : 0
    beamRef.current.scale.y = selected ? 1 + 0.04 * Math.sin(t * 1.6) : 0.001
  })
  const glow = open ? 1.3 : selected ? 0.55 : 0.12
  const gateColor = open ? '#52E5FF' : selected ? '#FFD166' : '#52E5FF'
  return (
    <group position={[position[0], 0, position[1]]} rotation={[0, rotationY, 0]}>
      {!open && (
        <RigidBody type="fixed" colliders={false}>
          <CuboidCollider args={GATE_LOCKED_BLOCKER_HALF_SIZE} position={[0, 1.5, 0]} />
          <mesh position={[0, 1.5, 0]}>
            <boxGeometry args={[2.6, 3, 0.24]} />
            <meshStandardMaterial color="#171f27" emissive={gateColor}
              emissiveIntensity={selected ? 0.28 : 0.04} transparent opacity={0.88} />
          </mesh>
        </RigidBody>
      )}
      {selected && !open && (
        <RigidBody type="fixed" colliders={false}>
          <CuboidCollider args={[1.4, 1.5, 1.0]} position={[0, 1.5, GATE_SENSOR_LOCAL_Z.arrival]}
            sensor onIntersectionEnter={onArrived} />
        </RigidBody>
      )}
      {selected && open && (
        <RigidBody type="fixed" colliders={false}>
          <CuboidCollider args={[1.15, 1.5, 0.7]} position={[0, 1.5, GATE_SENSOR_LOCAL_Z.escape]}
            sensor onIntersectionEnter={onEscaped} />
        </RigidBody>
      )}
      {/* 탈출 지점 표식 — 멀리서도 보이는 빛기둥 (활성 시에만) */}
      <mesh ref={beamRef} position={[0, 6, 0]}>
        <cylinderGeometry args={[1.5, 1.5, 12, 12, 1, true]} />
        <meshBasicMaterial color={gateColor} transparent opacity={0} depthWrite={false}
          side={THREE.DoubleSide} fog={false} />
      </mesh>
      {selected && <pointLight position={[0, 2.6, 0]} intensity={open ? 14 : 6}
        distance={9} decay={1.5} color={gateColor} />}
      {([-1.5, 1.5] as const).map((x) => (
        <RigidBody key={x} type="fixed" position={[x, 1.7, 0]} colliders="cuboid">
          <mesh>
            <cylinderGeometry args={[0.18, 0.18, 3.4, 10]} />
            <meshStandardMaterial color="#3a3a5a" emissive={gateColor} emissiveIntensity={glow} />
          </mesh>
        </RigidBody>
      ))}
      <mesh position={[0, 3.3, 0]}>
        <boxGeometry args={[3.3, 0.34, 0.34]} />
        <meshStandardMaterial color="#3a3a5a" emissive={gateColor} emissiveIntensity={glow} />
      </mesh>
    </group>
  )
}

export function Lamp({ position, h, color, dynamicLight = true }: {
  position: V2
  h: number
  color: string
  dynamicLight?: boolean
}) {
  return (
    <group position={[position[0], 0, position[1]]}>
      <RigidBody type="fixed" position={[0, h / 2, 0]} colliders="cuboid">
        <mesh>
          <cylinderGeometry args={[0.08, 0.08, h, 8]} />
          <meshStandardMaterial color="#5a5a5a" />
        </mesh>
      </RigidBody>
      <mesh position={[0, h - 0.1, 0]}>
        <coneGeometry args={[0.34, 0.28, 8]} />
        <meshStandardMaterial color="#5a5a5a" emissive={color} emissiveIntensity={0.9} />
      </mesh>
      {dynamicLight && (
        <pointLight position={[0, h - 0.3, 0]} intensity={h > 5 ? 9 : 5}
          distance={h > 5 ? 20 : 13} decay={1.6} color={color} />
      )}
    </group>
  )
}

/**
 * v4 절차형 학교가 월드 지오메트리를 담당하고 기존 라운드 계약 컴포넌트는
 * 서버 좌표 마이그레이션이 끝날 때까지 그대로 유지한다.
 */
export default function SchoolCampus({ visibleFloors, activeTraps, gateId, gateOpen = false, onTrapEnter, onGateArrive, onGateEscape }: {
  visibleFloors?: FloorKey[]
  activeTraps?: string[]
  gateId?: string
  gateOpen?: boolean
  onTrapEnter?: (id: string) => void
  onGateArrive?: (id: string) => void
  onGateEscape?: (id: string) => void
  elevatorY?: number
}) {
  const show = (floor: FloorKey) => !visibleFloors || visibleFloors.includes(floor)
  return (
    <group>
      <SchoolCampusV4 visibleFloors={visibleFloors} />
      {TRAP_SLOTS.filter((trap) => show(trap.floor)).map((trap) => (
        <TrapPlate key={trap.id} id={trap.id} position={trap.p} floor={trap.floor}
          active={!activeTraps || activeTraps.includes(trap.id)} onTriggered={onTrapEnter} />
      ))}
      {GATE_SLOTS.map((gate) => (
        <GateFrame key={gate.id} position={gate.p} rotationY={gate.ry} selected={gate.id === gateId}
          open={gate.id === gateId && gateOpen}
          onArrived={() => onGateArrive?.(gate.id)}
          onEscaped={() => onGateEscape?.(gate.id)} />
      ))}
    </group>
  )
}
