import { useGameStore, type MapFloor, type RooftopSignalState, type VerticalProgressionState } from '../stores/gameStore'
import { COMPACT_SCHOOL, type CompactDoor } from '../game/compactSchoolData.js'
import verticalMapContract from '../game/verticalMapContract.json'

const SIZE = 184
type ViewBounds = { x0: number; x1: number; z0: number; z1: number }
type MapPoint = { x: number; z: number; label: string }
type Slot = { floor: string; position?: number[]; interactionPosition?: number[] }

const slots = verticalMapContract.slots as unknown as Record<string, Slot>
const INDOOR_VIEW: ViewBounds = { x0: -49, x1: 1, z0: -49, z1: -7 }
const VIEWS: Partial<Record<MapFloor, ViewBounds>> = {
  ROOF: INDOOR_VIEW,
  F3: INDOOR_VIEW,
  F2: INDOOR_VIEW,
  F1: INDOOR_VIEW,
  B1: { x0: -42, x1: -6, z0: -50, z1: -38 },
  FIELD: { x0: -52, x1: 4, z0: -12, z1: 30 },
  OUT: { x0: -60, x1: 12, z0: -60, z1: 30 },
}
const MISSION_SLOT: Record<string, string> = {
  floor_3: 'F3_MISSION_ROOM_POOL',
  floor_2: 'F2_INTERCOM_B',
  floor_1: 'F1_DEVICE_A',
  field_final: 'FIELD_FINAL_STATION_B',
}
const PHASE_LABEL: Record<string, string> = {
  rooftop_intro: '옥상 삼점 신호',
  floor_3: '3층 방송 장치',
  floor_2: '2층 인터폰',
  floor_1: '1층 동시 장치',
  field_final: '운동장 중앙 장치',
  basement_final: '지하 설비 복구',
  escape_open: '최종 탈출구',
}
const SIGNAL_SLOT: Record<string, string> = {
  center: 'ROOF_SIGNAL_CENTER',
  east: 'ROOF_SIGNAL_EAST',
  west: 'ROOF_SIGNAL_WEST',
}
const TRANSITION_SLOTS: Record<string, string[]> = {
  'ROOF>F3': ['ROOF_TO_F3_FIRE_DOOR'],
  'F3>F2': ['F3_TO_F2_STAIR_WEST', 'F3_TO_F2_STAIR_EAST'],
  'F2>F1': ['F2_TO_F1_STAIR_WEST', 'F2_TO_F1_STAIR_EAST'],
  'F1>FIELD': ['F1_TO_FIELD_FIRE_DOOR'],
  'F1>B1': ['F1_TO_BASEMENT_FIRE_DOOR'],
}

function projector(view: ViewBounds) {
  return {
    x: (value: number) => ((value - view.x0) / (view.x1 - view.x0)) * SIZE,
    z: (value: number) => ((value - view.z0) / (view.z1 - view.z0)) * SIZE,
  }
}

function slotPoint(slotId: string, label: string): MapPoint | null {
  const slot = slots[slotId]
  const position = slot?.interactionPosition ?? slot?.position
  if (!position) return null
  return { x: position[0], z: position[2], label }
}

function currentObjectives(
  progression: VerticalProgressionState | null,
  floor: MapFloor,
  rooftopSignal: RooftopSignalState | null,
): MapPoint[] {
  if (!progression?.enabled) return []
  if (progression.phase === 'escape_open') {
    const slotId = progression.final_route === 'basement' ? 'BASEMENT_ESCAPE_GATE' : 'FIELD_ESCAPE_GATE'
    const objective = slots[slotId]?.floor === floor ? slotPoint(slotId, '열린 탈출구') : null
    return objective ? [objective] : []
  }
  if (progression.active_floor && floor !== progression.active_floor) {
    return (TRANSITION_SLOTS[`${floor}>${progression.active_floor}`] ?? [])
      .map((slotId) => slotPoint(slotId, `${progression.active_floor} 이동`))
      .filter((point): point is MapPoint => point !== null)
  }
  if (progression.phase === 'rooftop_intro' && rooftopSignal?.nextSignalId) {
    const objective = slotPoint(SIGNAL_SLOT[rooftopSignal.nextSignalId], '현재 점등 신호')
    return objective ? [objective] : []
  }
  if (progression.phase === 'basement_final') {
    return [
      ['BASEMENT_DEVICE_PANEL', '배전반'],
      ['BASEMENT_DEVICE_VALVE', '급수 밸브'],
      ['BASEMENT_DEVICE_GENERATOR', '비상 발전기'],
    ].map(([slotId, label]) => slotPoint(slotId, label)).filter((point): point is MapPoint => point !== null)
  }
  const slotId = MISSION_SLOT[progression.phase]
  const objective = slotId && slots[slotId]?.floor === floor
    ? slotPoint(slotId, PHASE_LABEL[progression.phase] ?? '현재 미션')
    : null
  return objective ? [objective] : []
}

function MapRect({ view, x0, z0, x1, z1, fill, stroke = '#587080' }: {
  view: ViewBounds; x0: number; z0: number; x1: number; z1: number; fill: string; stroke?: string
}) {
  const p = projector(view)
  return <rect x={p.x(x0)} y={p.z(z0)} width={p.x(x1) - p.x(x0)} height={p.z(z1) - p.z(z0)} fill={fill} stroke={stroke} strokeWidth=".7" />
}

function DoorMark({ view, door }: { view: ViewBounds; door: CompactDoor }) {
  const p = projector(view)
  const center = door.axis === 'x'
    ? [door.hinge[0] + door.w / 2, door.fixed]
    : [door.fixed, door.hinge[2] + door.w / 2]
  const half = door.w / 2
  const [x1, z1, x2, z2] = door.axis === 'x'
    ? [center[0] - half, center[1], center[0] + half, center[1]]
    : [center[0], center[1] - half, center[0], center[1] + half]
  return <line
    x1={p.x(x1)} y1={p.z(z1)} x2={p.x(x2)} y2={p.z(z2)}
    stroke={door.permanentlyLocked ? '#9B5362' : door.kind === 'fire' ? '#8FD9FF' : '#D7C792'}
    strokeWidth={door.kind === 'fire' ? 2 : 1.25}
  />
}

function IndoorPlan({ view, floor }: { view: ViewBounds; floor: MapFloor }) {
  const p = projector(view)
  const rooms = COMPACT_SCHOOL.rooms.filter((room) => room.floor === floor)
  const doors = COMPACT_SCHOOL.doors.filter((door) => door.f === floor)
  return <>
    <MapRect view={view} {...COMPACT_SCHOOL.bounds} fill="#172832" stroke="#718A98" />
    <MapRect view={view} {...COMPACT_SCHOOL.courtyard} fill="#09151C" stroke="#45606E" />
    {rooms.map((room) => (
      <g key={room.id}>
        <MapRect view={view} x0={room.x0} z0={room.z0} x1={room.x1} z1={room.z1} fill="#263842" stroke="#516B78" />
        <text x={p.x(room.cx)} y={p.z(room.cz) + 2} textAnchor="middle" fill="#9DB1BC" fontSize="5.4">
          {room.name}
        </text>
      </g>
    ))}
    {doors.map((door) => <DoorMark key={door.id} view={view} door={door} />)}
    <text x={p.x(-24)} y={p.z(-27.6)} textAnchor="middle" fill="#526D79" fontSize="7">중정</text>
  </>
}

function FloorPlan({ view, floor }: { view: ViewBounds; floor: MapFloor }) {
  const p = projector(view)
  if (floor === 'F1' || floor === 'F2' || floor === 'F3') return <IndoorPlan view={view} floor={floor} />
  if (floor === 'ROOF') return <>
    <MapRect view={view} {...COMPACT_SCHOOL.bounds} fill="#303C42" stroke="#82939C" />
    <MapRect view={view} {...COMPACT_SCHOOL.courtyard} fill="#09151C" stroke="#687C85" />
    <text x={p.x(-24)} y={p.z(-27.6)} textAnchor="middle" fill="#60757E" fontSize="7">중정 보이드</text>
    <text x={p.x(-24)} y={p.z(-44.3)} textAnchor="middle" fill="#A9B7BC" fontSize="6.5">옥상 설비·신호 구역</text>
  </>
  if (floor === 'B1') return <>
    <MapRect view={view} x0={-40} z0={-48} x1={-8} z1={-40} fill="#2A2B32" stroke="#85828E" />
    {[-32, -24, -16].map((x) => <line key={x} x1={p.x(x)} y1={p.z(-48)} x2={p.x(x)} y2={p.z(-40)} stroke="#5F5C68" strokeWidth=".8" />)}
    <text x={p.x(-24)} y={p.z(-43.5)} textAnchor="middle" fill="#B7B2C0" fontSize="6.5">지하 기계실</text>
  </>
  if (floor === 'FIELD') return <>
    <MapRect view={view} x0={-48} z0={-4} x1={0} z1={28} fill="#243D2D" stroke="#668F70" />
    <rect x={p.x(-44)} y={p.z(0)} width={p.x(-4) - p.x(-44)} height={p.z(24) - p.z(0)} rx="20" fill="none" stroke="#7AA47E" strokeWidth="1" />
    <text x={p.x(-24)} y={p.z(13)} textAnchor="middle" fill="#A9D0AD" fontSize="7">운동장 파이널</text>
  </>
  return <>
    <MapRect view={view} x0={-48} z0={-48} x1={0} z1={-8} fill="#172832" stroke="#718A98" />
    <MapRect view={view} x0={-48} z0={-4} x1={0} z1={28} fill="#243D2D" stroke="#668F70" />
  </>
}

function ActorMarker({ view, point, color, label, player = false }: {
  view: ViewBounds; point: { x: number; z: number }; color: string; label: string; player?: boolean
}) {
  const p = projector(view)
  return <g transform={`translate(${p.x(point.x)} ${p.z(point.z)})`}>
    {player
      ? <path d="M 0 -6 L 5 5 L 0 3 L -5 5 Z" fill={color} stroke="#061016" strokeWidth="1.6" />
      : <circle r="4.5" fill={color} stroke="#061016" strokeWidth="1.6" />}
    <title>{label}</title>
  </g>
}

function ObjectiveMarker({ view, point }: { view: ViewBounds; point: MapPoint }) {
  const p = projector(view)
  return <g transform={`translate(${p.x(point.x)} ${p.z(point.z)})`}>
    <circle r="8" fill="none" stroke="#FFD45C" strokeWidth="1.4" strokeDasharray="2 2" />
    <path d="M 0 -5 L 5 0 L 0 5 L -5 0 Z" fill="#FFD45C" stroke="#4A3510" strokeWidth="1" />
    <title>{point.label}</title>
  </g>
}

export default function MiniMap() {
  const phase = useGameStore((state) => state.phase)
  const playerId = useGameStore((state) => state.playerId)
  const players = useGameStore((state) => state.players)
  const companionIntents = useGameStore((state) => state.companionIntents)
  const storedFloor = useGameStore((state) => state.currentFloor)
  const activeGate = useGameStore((state) => state.activeGate)
  const progression = useGameStore((state) => state.verticalProgression)
  const rooftopSignal = useGameStore((state) => state.rooftopSignal)
  const player = players[playerId]
  const floor = (player?.position.floor ?? storedFloor) as MapFloor
  const view = VIEWS[floor] ?? INDOOR_VIEW
  const teammateMarkers = ['partner', 'partner-2'].flatMap((companionId, index) => {
    const actor = players[companionId]
    if (!actor || actor.position.floor !== floor || actor.status === 'eliminated' || actor.status === 'escaped') return []
    const position = companionIntents[companionId]?.partnerPosition ?? actor.position
    return [{ ...position, color: index === 0 ? '#B6FF3D' : '#8FE8FF', label: `AI 동료 ${index + 1}` }]
  })
  const objectives = currentObjectives(progression, floor, rooftopSignal)
  if (!['playing', 'final_spell', 'escape'].includes(phase)) return null

  return (
    <aside aria-label="학교 미니맵" style={{
      position: 'absolute', top: import.meta.env.DEV ? 112 : 16, right: 16,
      width: SIZE, padding: 9, borderRadius: 12,
      border: '1px solid rgba(143,211,232,.38)', background: 'rgba(5,12,18,.88)',
      boxShadow: '0 10px 34px rgba(0,0,0,.3)', backdropFilter: 'blur(7px)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7, fontSize: 10, letterSpacing: '.06em' }}>
        <strong style={{ color: '#BDEFFF' }}>ㅁ자 학교 · 실제 구조</strong>
        <span style={{ color: '#B6FF3D' }}>{floor}</span>
      </div>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} role="img" aria-label={`${floor} 실제 구조와 현재 목표`}>
        <rect width={SIZE} height={SIZE} rx="7" fill="#0B1821" />
        <FloorPlan view={view} floor={floor} />
        {objectives.map((objective) => <ObjectiveMarker key={`${objective.label}-${objective.x}-${objective.z}`} view={view} point={objective} />)}
        {activeGate && !progression?.enabled && (floor === 'FIELD' || floor === 'OUT') && (
          <ObjectiveMarker view={view} point={{ ...activeGate.position, label: '탈출구' }} />
        )}
        {player && <ActorMarker view={view} point={player.position} color="#52E5FF" label={playerId || '플레이어'} player />}
        {teammateMarkers.map((marker) => <ActorMarker key={marker.label} view={view} point={marker} color={marker.color} label={marker.label} />)}
      </svg>
      <div style={{ marginTop: 5, fontSize: 9, color: 'rgba(255,255,255,.68)', lineHeight: 1.4 }}>
        <span style={{ color: '#52E5FF' }}>▲ 나</span>
        <span style={{ color: '#B6FF3D', marginLeft: 8 }}>● 동료</span>
        <span style={{ color: '#FFD45C', marginLeft: 8 }}>◆ 목표</span>
        {objectives[0] && <div style={{ marginTop: 3, color: '#FFE49A' }}>목표 · {objectives[0].label}</div>}
      </div>
    </aside>
  )
}
