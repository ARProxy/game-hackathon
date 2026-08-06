import { useGameStore } from '../stores/gameStore'

const SIZE = 184
const MAP_MIN = -40
const MAP_SPAN = 80
const point = (value: number) => ((value - MAP_MIN) / MAP_SPAN) * SIZE

function Marker({ x, z, color, label }: { x: number; z: number; color: string; label: string }) {
  return (
    <g transform={`translate(${point(x)} ${point(z)})`}>
      <circle r="5" fill={color} stroke="#071016" strokeWidth="2" />
      <title>{label}</title>
    </g>
  )
}

export default function MiniMap() {
  const phase = useGameStore((state) => state.phase)
  const playerId = useGameStore((state) => state.playerId)
  const player = useGameStore((state) => state.players[state.playerId])
  const floor = useGameStore((state) => state.currentFloor)
  const partner = useGameStore((state) => state.companionIntent?.partnerPosition)
  const seeker = useGameStore((state) => state.hunterIntent?.seekerPosition)
  const activeGate = useGameStore((state) => state.activeGate)
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
        <strong style={{ color: '#BDEFFF' }}>학교 안내도</strong>
        <span style={{ color: '#B6FF3D' }}>{floor}</span>
      </div>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} role="img" aria-label="현재 위치와 주요 구역">
        <rect width={SIZE} height={SIZE} rx="7" fill="#0b1821" />
        <rect x="13" y="8" width="97" height="30" rx="2" fill="#23323d" stroke="#587080" />
        <rect x="124" y="8" width="50" height="42" rx="2" fill="#26333b" stroke="#587080" />
        <rect x="24" y="52" width="58" height="52" rx="18" fill="#20352e" stroke="#5f796a" />
        <rect x="92" y="57" width="68" height="72" rx="4" fill="#273727" stroke="#71866c" />
        <path d="M 10 140 H 128 V 174 H 10 Z" fill="#242b33" stroke="#65717a" />
        <path d="M 137 139 H 174 V 174 H 137 Z" fill="#302b27" stroke="#80705f" />
        <text x="61" y="26" textAnchor="middle" fill="#9eb3c0" fontSize="8">본관</text>
        <text x="149" y="30" textAnchor="middle" fill="#9eb3c0" fontSize="8">체육관</text>
        <text x="126" y="96" textAnchor="middle" fill="#9eb3c0" fontSize="8">운동장</text>
        <text x="53" y="81" textAnchor="middle" fill="#9eb3c0" fontSize="8">놀이터</text>
        <text x="69" y="159" textAnchor="middle" fill="#9eb3c0" fontSize="8">후문 골목</text>
        {player && <Marker x={player.position.x} z={player.position.z} color="#52E5FF" label={playerId || '플레이어'} />}
        {partner && <Marker x={partner.x} z={partner.z} color="#B6FF3D" label="AI 동료" />}
        {seeker && <Marker x={seeker.x} z={seeker.z} color="#FF2F6E" label="술래" />}
        {activeGate && <Marker x={activeGate.position.x} z={activeGate.position.z} color="#FFD45C" label="탈출구" />}
      </svg>
      <div style={{ display: 'flex', gap: 9, marginTop: 5, fontSize: 9, color: 'rgba(255,255,255,.65)' }}>
        <span style={{ color: '#52E5FF' }}>● 나</span><span style={{ color: '#B6FF3D' }}>● 동료</span><span style={{ color: '#FF2F6E' }}>● 술래</span>
      </div>
    </aside>
  )
}
