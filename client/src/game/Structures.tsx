/**
 * 구역별 구조물 — 프리미티브 조합
 *
 * A. 놀이기구 (좌상): 미끄럼틀, 정글짐, 그네
 * B. 창고 (우상): 컨테이너, 적재물
 * C. 중앙 (좌하): 조회대, 골대
 * D. 골목출구 (우하): 벤치, 가로등, 화단
 */

const STRUCT_COLOR = '#1a2a3a'
const ACCENT_COLOR = '#2a3a4a'

/** A구역 — 놀이기구 */
function Playground() {
  return (
    <group position={[-7, 0, -7]}>
      {/* 미끄럼틀 — 기둥 + 경사판 */}
      <mesh position={[0, 1.5, 0]}>
        <boxGeometry args={[0.3, 3, 0.3]} />
        <meshStandardMaterial color={STRUCT_COLOR} />
      </mesh>
      <mesh position={[0, 1.5, -1]}>
        <boxGeometry args={[0.3, 3, 0.3]} />
        <meshStandardMaterial color={STRUCT_COLOR} />
      </mesh>
      <mesh position={[0, 2.8, -0.5]} rotation={[0, 0, 0]}>
        <boxGeometry args={[1.2, 0.1, 1.5]} />
        <meshStandardMaterial color={ACCENT_COLOR} />
      </mesh>
      <mesh position={[0, 1.5, 1]} rotation={[0.5, 0, 0]}>
        <boxGeometry args={[0.8, 0.08, 2.5]} />
        <meshStandardMaterial color="#3a4a5a" />
      </mesh>

      {/* 정글짐 — 격자 박스 */}
      <group position={[-3, 0, -2]}>
        {/* 기둥 4개 */}
        {[[-0.8, -0.8], [-0.8, 0.8], [0.8, -0.8], [0.8, 0.8]].map(([x, z], i) => (
          <mesh key={i} position={[x, 1, z]}>
            <boxGeometry args={[0.15, 2, 0.15]} />
            <meshStandardMaterial color={STRUCT_COLOR} />
          </mesh>
        ))}
        {/* 가로대 상단 */}
        <mesh position={[0, 2, 0]}>
          <boxGeometry args={[1.8, 0.1, 1.8]} />
          <meshStandardMaterial color={ACCENT_COLOR} />
        </mesh>
        {/* 가로대 중간 */}
        <mesh position={[0, 1, 0]}>
          <boxGeometry args={[1.8, 0.1, 1.8]} />
          <meshStandardMaterial color={ACCENT_COLOR} />
        </mesh>
      </group>

      {/* 그네 — 프레임 + 좌석 */}
      <group position={[3, 0, -1]}>
        <mesh position={[0, 2, 0]}>
          <boxGeometry args={[2.5, 0.15, 0.15]} />
          <meshStandardMaterial color={STRUCT_COLOR} />
        </mesh>
        <mesh position={[-0.8, 1, 0]}>
          <boxGeometry args={[0.1, 2, 0.1]} />
          <meshStandardMaterial color={STRUCT_COLOR} />
        </mesh>
        <mesh position={[0.8, 1, 0]}>
          <boxGeometry args={[0.1, 2, 0.1]} />
          <meshStandardMaterial color={STRUCT_COLOR} />
        </mesh>
        {/* 줄 */}
        <mesh position={[0, 1.2, 0]}>
          <boxGeometry args={[0.03, 1.6, 0.03]} />
          <meshStandardMaterial color="#4a5a6a" />
        </mesh>
        {/* 좌석 */}
        <mesh position={[0, 0.4, 0]}>
          <boxGeometry args={[0.5, 0.06, 0.25]} />
          <meshStandardMaterial color="#4a3a2a" />
        </mesh>
      </group>
    </group>
  )
}

/** B구역 — 창고 */
function Storage() {
  return (
    <group position={[7, 0, -7]}>
      {/* 컨테이너 큰 것 */}
      <mesh position={[0, 1, 0]}>
        <boxGeometry args={[3, 2, 1.8]} />
        <meshStandardMaterial color="#1e2830" />
      </mesh>

      {/* 컨테이너 작은 것 */}
      <mesh position={[-2.5, 0.6, -2]}>
        <boxGeometry args={[2, 1.2, 1.2]} />
        <meshStandardMaterial color="#222e38" />
      </mesh>

      {/* 적재물 — 상자들 */}
      <mesh position={[2, 0.4, -2.5]}>
        <boxGeometry args={[0.8, 0.8, 0.8]} />
        <meshStandardMaterial color="#2a3020" />
      </mesh>
      <mesh position={[2.8, 0.4, -2.2]}>
        <boxGeometry args={[0.7, 0.8, 0.7]} />
        <meshStandardMaterial color="#302a20" />
      </mesh>
      <mesh position={[2.3, 1.1, -2.3]}>
        <boxGeometry args={[0.6, 0.6, 0.6]} />
        <meshStandardMaterial color="#2a2a30" />
      </mesh>

      {/* 좁은 통로 벽 */}
      <mesh position={[-1, 1, -3.5]}>
        <boxGeometry args={[4, 2, 0.3]} />
        <meshStandardMaterial color={STRUCT_COLOR} />
      </mesh>
    </group>
  )
}

/** C구역 — 운동장 중앙 */
function Center() {
  return (
    <group position={[-7, 0, 7]}>
      {/* 조회대 */}
      <mesh position={[0, 0.3, 0]}>
        <boxGeometry args={[2.5, 0.6, 1.5]} />
        <meshStandardMaterial color="#2a2a2a" />
      </mesh>

      {/* 축구 골대 */}
      <group position={[4, 0, 2]}>
        {/* 좌측 기둥 */}
        <mesh position={[-1.2, 1, 0]}>
          <boxGeometry args={[0.12, 2, 0.12]} />
          <meshStandardMaterial color="#e0e0e0" />
        </mesh>
        {/* 우측 기둥 */}
        <mesh position={[1.2, 1, 0]}>
          <boxGeometry args={[0.12, 2, 0.12]} />
          <meshStandardMaterial color="#e0e0e0" />
        </mesh>
        {/* 상단 바 */}
        <mesh position={[0, 2, 0]}>
          <boxGeometry args={[2.52, 0.12, 0.12]} />
          <meshStandardMaterial color="#e0e0e0" />
        </mesh>
      </group>
    </group>
  )
}

/** D구역 — 골목 출구 */
function Exit() {
  return (
    <group position={[7, 0, 7]}>
      {/* 벤치 1 */}
      <group position={[-2, 0, 1]}>
        <mesh position={[0, 0.3, 0]}>
          <boxGeometry args={[1.5, 0.08, 0.5]} />
          <meshStandardMaterial color="#4a3a2a" />
        </mesh>
        <mesh position={[-0.6, 0.15, 0]}>
          <boxGeometry args={[0.1, 0.3, 0.4]} />
          <meshStandardMaterial color="#3a3a3a" />
        </mesh>
        <mesh position={[0.6, 0.15, 0]}>
          <boxGeometry args={[0.1, 0.3, 0.4]} />
          <meshStandardMaterial color="#3a3a3a" />
        </mesh>
      </group>

      {/* 벤치 2 */}
      <group position={[1, 0, -2]}>
        <mesh position={[0, 0.3, 0]}>
          <boxGeometry args={[1.5, 0.08, 0.5]} />
          <meshStandardMaterial color="#4a3a2a" />
        </mesh>
        <mesh position={[-0.6, 0.15, 0]}>
          <boxGeometry args={[0.1, 0.3, 0.4]} />
          <meshStandardMaterial color="#3a3a3a" />
        </mesh>
        <mesh position={[0.6, 0.15, 0]}>
          <boxGeometry args={[0.1, 0.3, 0.4]} />
          <meshStandardMaterial color="#3a3a3a" />
        </mesh>
      </group>

      {/* 가로등 */}
      <group position={[3, 0, 3]}>
        <mesh position={[0, 1.5, 0]}>
          <cylinderGeometry args={[0.06, 0.08, 3, 8]} />
          <meshStandardMaterial color="#5a5a5a" />
        </mesh>
        <pointLight position={[0, 3, 0]} intensity={3} distance={8} color="#ffe4b5" />
        {/* 전등 갓 */}
        <mesh position={[0, 2.9, 0]}>
          <coneGeometry args={[0.25, 0.2, 8]} />
          <meshStandardMaterial color="#5a5a5a" />
        </mesh>
      </group>

      {/* 화단 */}
      <mesh position={[-3, 0.25, -3]}>
        <boxGeometry args={[2, 0.5, 1]} />
        <meshStandardMaterial color="#1a3020" />
      </mesh>
    </group>
  )
}

export default function Structures() {
  return (
    <group>
      <Playground />
      <Storage />
      <Center />
      <Exit />
    </group>
  )
}
