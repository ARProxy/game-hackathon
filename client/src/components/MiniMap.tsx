import { useGameStore, type MapFloor } from '../stores/gameStore'

const SIZE = 184
const X_MIN = -58
const X_SPAN = 68
const Z_MIN = -60
const Z_SPAN = 82
const px = (value: number) => ((value - X_MIN) / X_SPAN) * SIZE
const pz = (value: number) => ((value - Z_MIN) / Z_SPAN) * SIZE

function MapRect({ x0, z0, x1, z1, fill = '#23323d', stroke = '#587080' }: {
  x0: number; z0: number; x1: number; z1: number; fill?: string; stroke?: string
}) {
  return <rect x={px(x0)} y={pz(z0)} width={px(x1) - px(x0)} height={pz(z1) - pz(z0)} fill={fill} stroke={stroke} strokeWidth="1" />
}

function Marker({ x, z, color, label }: { x: number; z: number; color: string; label: string }) {
  return (
    <g transform={`translate(${px(x)} ${pz(z)})`}>
      <circle r="5" fill={color} stroke="#071016" strokeWidth="2" />
      <title>{label}</title>
    </g>
  )
}

function StoreyPlan({ floor }: { floor: MapFloor }) {
  if (floor === 'B1') {
    return <>
      <MapRect x0={-56} z0={-58} x1={8} z1={-46} />
      <MapRect x0={-4} z0={-46} x1={8} z1={-14} />
      <text x={px(-24)} y={pz(-51)} textAnchor="middle" fill="#9eb3c0" fontSize="8">지하 통로</text>
    </>
  }
  if (floor === 'ROOF') {
    return <>
      <MapRect x0={-56} z0={-58} x1={8} z1={-46} fill="#29343a" />
      <MapRect x0={-56} z0={-46} x1={-44} z1={2} fill="#29343a" />
      <MapRect x0={-4} z0={-46} x1={8} z1={2} fill="#29343a" />
      <text x={px(-24)} y={pz(-51)} textAnchor="middle" fill="#9eb3c0" fontSize="8">옥상 시작 구역</text>
    </>
  }

  const finalArea = floor === 'FIELD' || floor === 'OUT'
  return <>
    <MapRect x0={-56} z0={-58} x1={8} z1={-46} />
    <MapRect x0={-56} z0={-46} x1={-44} z1={2} />
    <MapRect x0={-4} z0={-46} x1={8} z1={2} />
    <MapRect x0={-44} z0={-46} x1={-4} z1={2} fill={finalArea ? '#293f31' : '#14242a'} stroke="#526a63" />
    {[-48, -40, -32, -24, -16, -8, 0].map((x) => (
      <line key={`n-${x}`} x1={px(x)} y1={pz(-58)} x2={px(x)} y2={pz(-46)} stroke="#526571" strokeWidth=".65" />
    ))}
    {[-38, -30, -22, -14, -6].map((z) => <g key={`w-${z}`}>
      <line x1={px(-56)} y1={pz(z)} x2={px(-44)} y2={pz(z)} stroke="#526571" strokeWidth=".65" />
      <line x1={px(-4)} y1={pz(z)} x2={px(8)} y2={pz(z)} stroke="#526571" strokeWidth=".65" />
    </g>)}
    <text x={px(-24)} y={pz(-51)} textAnchor="middle" fill="#9eb3c0" fontSize="7">북측 교실·복도</text>
    <text x={px(-50)} y={pz(-20)} textAnchor="middle" fill="#9eb3c0" fontSize="7" transform={`rotate(-90 ${px(-50)} ${pz(-20)})`}>서측 교실</text>
    <text x={px(2)} y={pz(-20)} textAnchor="middle" fill="#9eb3c0" fontSize="7" transform={`rotate(90 ${px(2)} ${pz(-20)})`}>동측 교실</text>
    <text x={px(-24)} y={pz(-18)} textAnchor="middle" fill={finalArea ? '#9ed6a9' : '#718891'} fontSize="8">{finalArea ? '파이널 운동장' : '중정·운동장'}</text>
    <text x={px(-53)} y={pz(-53)} fill="#8fd9ff" fontSize="8">▣</text>
    <text x={px(5)} y={pz(-53)} fill="#8fd9ff" fontSize="8">▣</text>
  </>
}

export default function MiniMap() {
  const phase = useGameStore((state) => state.phase)
  const playerId = useGameStore((state) => state.playerId)
  const players = useGameStore((state) => state.players)
  const storedFloor = useGameStore((state) => state.currentFloor)
  const activeGate = useGameStore((state) => state.activeGate)
  const player = players[playerId]
  const floor = player?.position.floor ?? storedFloor
  const teammates = Object.values(players).filter((actor) => actor.role === 'ai_partner' && actor.position.floor === player?.position.floor)
  const visible = phase === 'playing' || phase === 'final_spell' || phase === 'escape'
  if (!visible) return null

  return (
    <aside aria-label="학교 미니맵" style={{
      position: 'absolute', top: import.meta.env.DEV ? 112 : 16, right: 16,
      width: SIZE, padding: 9, borderRadius: 12,
      border: '1px solid rgba(143,211,232,.38)', background: 'rgba(5,12,18,.84)',
      boxShadow: '0 10px 34px rgba(0,0,0,.3)', backdropFilter: 'blur(7px)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7, fontSize: 10, letterSpacing: '.08em' }}>
        <strong style={{ color: '#BDEFFF' }}>ㄷ자 학교 안내도</strong>
        <span style={{ color: '#B6FF3D' }}>{floor}</span>
      </div>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} role="img" aria-label={`${floor} 현재 위치와 주요 구역`}>
        <rect width={SIZE} height={SIZE} rx="7" fill="#0b1821" />
        <StoreyPlan floor={floor} />
        {player && <Marker x={player.position.x} z={player.position.z} color="#52E5FF" label={playerId || '플레이어'} />}
        {teammates.map((actor, index) => (
          <Marker key={actor.playerId} x={actor.position.x} z={actor.position.z} color={index === 0 ? '#B6FF3D' : '#8FE8FF'} label={index === 0 ? 'AI 동료 1' : 'AI 동료 2'} />
        ))}
        {activeGate && (floor === 'FIELD' || floor === 'OUT') && <Marker x={activeGate.position.x} z={activeGate.position.z} color="#FFD45C" label="탈출구" />}
      </svg>
      <div style={{ display: 'flex', gap: 9, marginTop: 5, fontSize: 9, color: 'rgba(255,255,255,.65)' }}>
        <span style={{ color: '#52E5FF' }}>● 나</span><span style={{ color: '#B6FF3D' }}>● 같은 층 동료</span><span style={{ color: '#FFD45C' }}>● 탈출구</span>
      </div>
    </aside>
  )
}
