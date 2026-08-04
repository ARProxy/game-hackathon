/**
 * Kenney GLB 가구 오버레이
 *
 * 방 경계 (SchoolCampus 벽 데이터 기준):
 * ── 교실 밴드 (z=-35.7 북벽 ~ z=-29 복도벽, 깊이 6.7m) ──
 *   교실1-1: x=-34 ~ -27 (폭 7m)    중심 (-30.5, -32.35)
 *   행정실:  x=-27 ~ -20 (폭 7m)    중심 (-23.5, -32.35)
 *   계단실1: x=-20 ~ -13 (폭 7m)    중심 (-16.5, -32.35)
 *   현관로비: x=-13 ~ -6 (폭 7m)    중심 (-9.5, -32.35)
 *   보건실:  x=-6 ~ -2  (폭 4m)     중심 (-4, -32.35)
 *   화장실:  x=-2 ~ 1   (폭 3m)     중심 (-0.5, -32.35)
 *   계단실2: x=1 ~ 8    (폭 7m)     중심 (4.5, -32.35)
 *
 * ── 복도 (z=-29 ~ z=-25.4, 폭 3.6m) ──
 *
 * ── 윙 (x=-34 ~ -27, z=-25.4 ~ -8) ──
 *   급식실/도서실/미술실 등
 *
 * ── 계단실 ──
 *   중앙: (-16.5, -30)  동쪽: (4.5, -30)  윙: (-30.5, -10.5)
 *
 * 층 높이: F1=0, F2=3.6, F3=7.2
 */

import { useGLTF } from '@react-three/drei'
import type { FloorKey } from './SchoolCampus'

/* ── GLB 래퍼 ── */
function M({ url, position, scale = 1, rotation = [0, 0, 0] as [number, number, number] }: {
  url: string
  position: [number, number, number]
  scale?: number
  rotation?: [number, number, number]
}) {
  const { scene } = useGLTF(url)
  return <primitive object={scene.clone()} position={position} scale={scale} rotation={rotation} />
}

/* ── 천장 조명 — 방 내부 + 창문 밖으로 빛 새어나옴 ── */
function RoomLight({ cx, y, cz = -32.3, intensity = 4, color = '#ffe8c0' }: {
  cx: number
  y: number
  cz?: number
  intensity?: number
  color?: string
}) {
  const ceilingY = y + 3 // 천장 높이
  return (
    <group>
      {/* 천장등 모델 */}
      <M url="/models/lampSquareCeiling.glb" position={[cx, ceilingY, cz]} />
      {/* 실내 조명 — 따뜻한 빛 */}
      <pointLight position={[cx, ceilingY - 0.3, cz]} intensity={intensity} distance={10} color={color} decay={2} />
      {/* 창문 밖으로 새어나오는 빛 — 북벽(z=-35.7) 바깥으로 약하게 */}
      <pointLight position={[cx, y + 1.5, -36.5]} intensity={intensity * 0.3} distance={5} color={color} decay={2} />
    </group>
  )
}

/* ═══════════════════════════════════════
 * 방 템플릿
 * cx: 방 중심 x, cz: 방 중심 z
 * y: 층 바닥 높이
 * 방 범위: cx±3.3 (폭 6.6, 벽 두께 제외), cz: 북벽~복도벽
 * ═══════════════════════════════════════ */

/* ── 교실 (7m x 6.7m) ──
 * 북벽 쪽: 칠판(비주얼)
 * 교탁: 북벽 앞
 * 학생 책상: 3열 x 3행
 * 동벽: 사물함
 * 구석: 쓰레기통, 화분
 */
function Classroom({ cx, y }: { cx: number; y: number }) {
  const nz = -34.5  // 북벽 근처 (칠판/교탁)
  const sz = -30    // 복도벽 근처

  return (
    <group>
      {/* 천장 조명 */}
      <RoomLight cx={cx} y={y} />
      {/* 교탁 — 북벽 앞 */}
      <M url="/models/desk.glb" position={[cx, y, nz + 1]} />
      <M url="/models/chairDesk.glb" position={[cx, y, nz + 1.6]} rotation={[0, Math.PI, 0]} />
      <M url="/models/books.glb" position={[cx + 0.3, y + 0.75, nz + 1]} />

      {/* 학생 책상 3열 x 3행 — 중앙 배치 */}
      {[-2, 0, 2].map((dx) =>
        [0, 1.5, 3].map((dz) => (
          <group key={`d${dx}${dz}`}>
            <M url="/models/desk.glb" position={[cx + dx, y, nz + 2.5 + dz]} scale={0.85} />
            <M url="/models/chair.glb" position={[cx + dx, y, nz + 3 + dz]} scale={0.85} rotation={[0, Math.PI, 0]} />
          </group>
        ))
      )}

      {/* 사물함 — 동쪽 벽 (cx+3) */}
      <M url="/models/bookcaseClosedWide.glb" position={[cx + 3, y, nz + 2]} rotation={[0, -Math.PI / 2, 0]} />
      <M url="/models/bookcaseClosedWide.glb" position={[cx + 3, y, nz + 3.5]} rotation={[0, -Math.PI / 2, 0]} />

      {/* 쓰레기통 — 입구 근처 */}
      <M url="/models/trashcan.glb" position={[cx - 3, y, sz + 0.3]} />

      {/* TV — 북벽 */}
      <M url="/models/televisionModern.glb" position={[cx, y + 2, nz + 0.3]} />
    </group>
  )
}

/* ── 행정실 / 교무실 (7m x 6.7m) ── */
function Office({ cx, y }: { cx: number; y: number }) {
  const nz = -34.5
  return (
    <group>
      <RoomLight cx={cx} y={y} />
      {/* L자 사무 책상 2개 */}
      <M url="/models/deskCorner.glb" position={[cx - 2, y, nz + 1.5]} />
      <M url="/models/deskCorner.glb" position={[cx + 2, y, nz + 1.5]} rotation={[0, Math.PI / 2, 0]} />
      <M url="/models/chairDesk.glb" position={[cx - 2, y, nz + 2.2]} rotation={[0, Math.PI, 0]} />
      <M url="/models/chairDesk.glb" position={[cx + 2, y, nz + 2.2]} rotation={[0, Math.PI, 0]} />

      {/* 컴퓨터 */}
      <M url="/models/computerScreen.glb" position={[cx - 2, y + 0.75, nz + 1.5]} />
      <M url="/models/laptop.glb" position={[cx + 2, y + 0.75, nz + 1.5]} />

      {/* 캐비닛 — 서쪽 벽 */}
      <M url="/models/bookcaseClosedDoors.glb" position={[cx - 3, y, nz + 4]} rotation={[0, Math.PI / 2, 0]} />
      <M url="/models/bookcaseClosedDoors.glb" position={[cx - 3, y, nz + 5.5]} rotation={[0, Math.PI / 2, 0]} />

      {/* 응접 소파 */}
      <M url="/models/loungeSofa.glb" position={[cx + 1, y, nz + 5]} rotation={[0, Math.PI, 0]} />
      <M url="/models/tableCoffee.glb" position={[cx + 1, y, nz + 4.2]} />

      <M url="/models/pottedPlant.glb" position={[cx + 3, y, nz + 0.5]} />
      <M url="/models/trashcan.glb" position={[cx - 3, y, nz + 0.5]} />
    </group>
  )
}

/* ── 현관 로비 (7m x 6.7m) ── */
function Lobby({ cx, y }: { cx: number; y: number }) {
  const nz = -34.5
  return (
    <group>
      <RoomLight cx={cx} y={y} intensity={5} />
      <M url="/models/loungeSofa.glb" position={[cx - 1.5, y, nz + 3]} rotation={[0, Math.PI / 2, 0]} />
      <M url="/models/loungeSofa.glb" position={[cx + 1.5, y, nz + 3]} rotation={[0, -Math.PI / 2, 0]} />
      <M url="/models/tableCoffee.glb" position={[cx, y, nz + 3]} />
      <M url="/models/pottedPlant.glb" position={[cx - 3, y, nz + 0.5]} scale={1.3} />
      <M url="/models/pottedPlant.glb" position={[cx + 3, y, nz + 0.5]} scale={1.3} />
      <M url="/models/coatRackStanding.glb" position={[cx + 3, y, nz + 5.5]} />
      <M url="/models/bench.glb" position={[cx, y, nz + 5.5]} />
      <M url="/models/rugRectangle.glb" position={[cx, y + 0.01, nz + 3]} scale={2} />
    </group>
  )
}

/* ── 보건실 (4m x 6.7m) ── */
function NurseRoom({ cx, y }: { cx: number; y: number }) {
  const nz = -34.5
  return (
    <group>
      <RoomLight cx={cx} y={y} intensity={3} />
      <M url="/models/bedSingle.glb" position={[cx - 0.8, y, nz + 2]} rotation={[0, Math.PI / 2, 0]} />
      <M url="/models/bedSingle.glb" position={[cx - 0.8, y, nz + 4.5]} rotation={[0, Math.PI / 2, 0]} />
      <M url="/models/sideTable.glb" position={[cx + 1, y, nz + 2]} />
      <M url="/models/sideTable.glb" position={[cx + 1, y, nz + 4.5]} />
      <M url="/models/desk.glb" position={[cx, y, nz + 0.8]} />
      <M url="/models/chairDesk.glb" position={[cx, y, nz + 1.5]} rotation={[0, Math.PI, 0]} />
    </group>
  )
}

/* ── 화장실 (3m x 6.7m) ── */
function Bathroom({ cx, y }: { cx: number; y: number }) {
  const nz = -34.5
  return (
    <group>
      <RoomLight cx={cx} y={y} intensity={3} color="#e0e8f0" />
      {/* 세면대 — 북벽 */}
      <M url="/models/bathroomSink.glb" position={[cx - 0.8, y, nz + 0.5]} />
      <M url="/models/bathroomSink.glb" position={[cx + 0.8, y, nz + 0.5]} />
      <M url="/models/bathroomMirror.glb" position={[cx - 0.8, y + 1.2, nz + 0.2]} />
      <M url="/models/bathroomMirror.glb" position={[cx + 0.8, y + 1.2, nz + 0.2]} />
      {/* 변기 칸 */}
      <M url="/models/toilet.glb" position={[cx - 0.8, y, nz + 3]} rotation={[0, Math.PI, 0]} />
      <M url="/models/toilet.glb" position={[cx + 0.8, y, nz + 3]} rotation={[0, Math.PI, 0]} />
      <M url="/models/toilet.glb" position={[cx, y, nz + 5]} rotation={[0, Math.PI, 0]} />
      <M url="/models/trashcan.glb" position={[cx - 1, y, nz + 5.5]} />
    </group>
  )
}

/* ── 계단실 (7m x 6.7m) — Kenney 계단 에셋 ── */
function Stairwell({ cx, y }: { cx: number; y: number }) {
  const nz = -34.5
  return (
    <group>
      {/* 계단 — 1플라이트 위로 */}
      <M url="/models/stairs-center.glb" position={[cx - 1, y, nz + 2]} scale={1.2} />
      <M url="/models/stairs-center.glb" position={[cx - 1, y + 1, nz + 2]} scale={1.2} />
      {/* 반대편 — 꺾임 */}
      <M url="/models/stairs-center.glb" position={[cx + 1, y + 1.5, nz + 4]} scale={1.2} rotation={[0, Math.PI, 0]} />
      <M url="/models/stairs-center.glb" position={[cx + 1, y + 2.5, nz + 4]} scale={1.2} rotation={[0, Math.PI, 0]} />
    </group>
  )
}

/* ── 도서실 (7m x ~6m) ── */
function Library({ cx, y }: { cx: number; y: number }) {
  const nz = -24.5
  return (
    <group>
      <RoomLight cx={cx} y={y} cz={-20} intensity={3} color="#f0e8d0" />
      {/* 책장 — 벽면 */}
      {[-2.5, -1.2, 0, 1.2, 2.5].map((dx) => (
        <M key={`bk${dx}`} url="/models/bookcaseOpen.glb" position={[cx + dx, y, nz + 0.5]} />
      ))}
      {/* 열람 테이블 */}
      <M url="/models/tableRound.glb" position={[cx - 1.5, y, nz + 3]} />
      <M url="/models/tableRound.glb" position={[cx + 1.5, y, nz + 3]} />
      {/* 의자 */}
      {[-2, -1, 1, 2].map((dx) => (
        <M key={`lc${dx}`} url="/models/chairRounded.glb" position={[cx + dx, y, nz + 3.8]} rotation={[0, Math.PI, 0]} />
      ))}
      <M url="/models/pottedPlant.glb" position={[cx + 3, y, nz + 0.5]} />
    </group>
  )
}

/* ── 컴퓨터실 ── */
function ComputerRoom({ cx, y }: { cx: number; y: number }) {
  const nz = -24.5
  return (
    <group>
      <RoomLight cx={cx} y={y} cz={-15} intensity={3} color="#d0e0f0" />
      {[-2, 0, 2].map((dx) =>
        [1.5, 3.5].map((dz) => (
          <group key={`pc${dx}${dz}`}>
            <M url="/models/desk.glb" position={[cx + dx, y, nz + dz]} />
            <M url="/models/computerScreen.glb" position={[cx + dx, y + 0.75, nz + dz - 0.2]} />
            <M url="/models/computerKeyboard.glb" position={[cx + dx, y + 0.75, nz + dz + 0.15]} scale={0.8} />
            <M url="/models/computerMouse.glb" position={[cx + dx + 0.3, y + 0.75, nz + dz + 0.15]} scale={0.8} />
            <M url="/models/chair.glb" position={[cx + dx, y, nz + dz + 0.6]} rotation={[0, Math.PI, 0]} />
          </group>
        ))
      )}
    </group>
  )
}

/* ── 급식실 ── */
function Cafeteria({ cx, y }: { cx: number; y: number }) {
  const nz = -24.5
  return (
    <group>
      <RoomLight cx={cx} y={y} cz={-20} intensity={5} />
      {[-2, 2].map((dx) =>
        [1.5, 3.5, 5.5].map((dz) => (
          <group key={`ct${dx}${dz}`}>
            <M url="/models/table.glb" position={[cx + dx, y, nz + dz]} />
            <M url="/models/chair.glb" position={[cx + dx - 0.6, y, nz + dz]} rotation={[0, Math.PI / 2, 0]} />
            <M url="/models/chair.glb" position={[cx + dx + 0.6, y, nz + dz]} rotation={[0, -Math.PI / 2, 0]} />
          </group>
        ))
      )}
      {/* 배식대 — 북벽 */}
      <M url="/models/kitchenCabinet.glb" position={[cx - 2, y, nz + 0.3]} />
      <M url="/models/kitchenCabinetDrawer.glb" position={[cx - 1, y, nz + 0.3]} />
      <M url="/models/kitchenSink.glb" position={[cx, y, nz + 0.3]} />
      <M url="/models/kitchenStove.glb" position={[cx + 1, y, nz + 0.3]} />
    </group>
  )
}

/* ── 복도 구간 가구 ── */
function HallwayFurniture({ x, y }: { x: number; y: number }) {
  const z = -27.2 // 복도 중심
  return (
    <group>
      {/* 사물함 — 남쪽 벽 */}
      <M url="/models/bookcaseClosed.glb" position={[x, y, z + 1]} rotation={[0, Math.PI, 0]} />
      {/* 천장등 + 복도 조명 */}
      <M url="/models/lampSquareCeiling.glb" position={[x, y + 3.2, z]} />
      <pointLight position={[x, y + 2.8, z]} intensity={2.5} distance={6} color="#ffe8c0" decay={2} />
    </group>
  )
}

/* ── 외부 가구 ── */
function OutdoorFurniture() {
  return (
    <group>
      {/* 운동장 주변 벤치 */}
      <M url="/models/bench.glb" position={[-5, 0, 10]} />
      <M url="/models/bench.glb" position={[5, 0, 10]} />
      <M url="/models/bench.glb" position={[-15, 0, 20]} rotation={[0, Math.PI / 2, 0]} />
      <M url="/models/bench.glb" position={[15, 0, 5]} rotation={[0, -Math.PI / 2, 0]} />
      {/* 쓰레기통 */}
      <M url="/models/trashcan.glb" position={[-6, 0, 10.5]} />
      <M url="/models/trashcan.glb" position={[6, 0, 10.5]} />
      <M url="/models/trashcan.glb" position={[20, 0, 25]} />
      {/* 화분 */}
      <M url="/models/pottedPlant.glb" position={[-10, 0, -5]} />
      <M url="/models/pottedPlant.glb" position={[10, 0, -5]} />
      {/* 후문 근처 박스 */}
      <M url="/models/cardboardBoxClosed.glb" position={[-22, 0, -12]} />
      <M url="/models/cardboardBoxClosed.glb" position={[-21.5, 0, -11.5]} />
      <M url="/models/cardboardBoxOpen.glb" position={[-21, 0, -12.5]} />
    </group>
  )
}

/* ═══════════════════════════════════════
 * 메인 — 층별 가구 배치
 * ═══════════════════════════════════════ */
export default function Furnishings({ visibleFloors }: {
  visibleFloors?: FloorKey[]
}) {
  const show = (f: FloorKey) => !visibleFloors || visibleFloors.includes(f)

  return (
    <group>
      {/* ════ 1F (y=0) ════ */}
      {show('F1') && (
        <group>
          <Classroom cx={-30.5} y={0} />
          <Office cx={-23.5} y={0} />
          <Stairwell cx={-16.5} y={0} />
          <Lobby cx={-9.5} y={0} />
          <NurseRoom cx={-4} y={0} />
          <Bathroom cx={-0.5} y={0} />
          <Stairwell cx={4.5} y={0} />
          <Cafeteria cx={-30.5} y={0} />
          {/* 복도 — 6구간 */}
          {[-30, -24, -18, -12, -6, 0, 5].map((x) => (
            <HallwayFurniture key={`h1_${x}`} x={x} y={0} />
          ))}
        </group>
      )}

      {/* ════ 2F (y=3.6) ════ */}
      {show('F2') && (
        <group>
          <Classroom cx={-30.5} y={3.6} />
          <Classroom cx={-23.5} y={3.6} />
          <Stairwell cx={-16.5} y={3.6} />
          <Classroom cx={-9.5} y={3.6} /> {/* 과학실 → 교실 변형 */}
          <Office cx={-4} y={3.6} />      {/* 교무실 */}
          <Bathroom cx={-0.5} y={3.6} />
          <Stairwell cx={4.5} y={3.6} />
          <Library cx={-30.5} y={3.6} />
          {/* 복도 */}
          {[-30, -24, -18, -12, -6, 0, 5].map((x) => (
            <HallwayFurniture key={`h2_${x}`} x={x} y={3.6} />
          ))}
        </group>
      )}

      {/* ════ 3F (y=7.2) ════ */}
      {show('F3') && (
        <group>
          <Classroom cx={-30.5} y={7.2} />
          <Classroom cx={-23.5} y={7.2} /> {/* 시청각실 */}
          <Stairwell cx={-16.5} y={7.2} />
          <Classroom cx={-9.5} y={7.2} />
          <Office cx={-4} y={7.2} />       {/* 방송실 */}
          <Bathroom cx={-0.5} y={7.2} />
          <Stairwell cx={4.5} y={7.2} />
          <ComputerRoom cx={-30.5} y={7.2} />
          {/* 복도 */}
          {[-30, -24, -18, -12, -6, 0, 5].map((x) => (
            <HallwayFurniture key={`h3_${x}`} x={x} y={7.2} />
          ))}
        </group>
      )}

      {/* ════ 외부 (OUT) ════ */}
      {show('OUT') && <OutdoorFurniture />}
    </group>
  )
}
