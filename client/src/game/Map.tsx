/**
 * 운동장 맵 — 25x25 크기, 4개 구역
 *
 * ┌────────────┬────────────┐
 * │ A. 놀이기구 │ B. 창고     │
 * │ (-6,_,-6)  │ (6,_,-6)   │
 * ├────────────┼────────────┤
 * │ C. 중앙     │ D. 골목출구 │
 * │ (-6,_,6)   │ (6,_,6)    │
 * └────────────┴────────────┘
 *
 * 좌표: x=좌우, z=상하 (위에서 내려다볼 때)
 * 구역 경계는 시각적 가이드용 (충돌 없음)
 */

const ZONE_SIZE = 12
const HALF = ZONE_SIZE / 2
const GAP = 0.5 // 구역 사이 간격

// 구역 색상 (바닥 미세 차이로 구분)
const ZONES = [
  { name: 'A_playground', position: [-HALF - GAP, 0, -HALF - GAP] as const, color: '#1a3050' },
  { name: 'B_storage', position: [HALF + GAP, 0, -HALF - GAP] as const, color: '#302030' },
  { name: 'C_center', position: [-HALF - GAP, 0, HALF + GAP] as const, color: '#203020' },
  { name: 'D_exit', position: [HALF + GAP, 0, HALF + GAP] as const, color: '#303020' },
]

// 맵 외곽 벽
const WALL_HEIGHT = 1.5
const WALL_THICKNESS = 0.3
const MAP_EXTENT = ZONE_SIZE + GAP + ZONE_SIZE / 2 + 0.5 // 맵 가장자리

const WALLS = [
  // 북쪽
  { pos: [0, WALL_HEIGHT / 2, -MAP_EXTENT] as const, size: [MAP_EXTENT * 2, WALL_HEIGHT, WALL_THICKNESS] as const },
  // 남쪽
  { pos: [0, WALL_HEIGHT / 2, MAP_EXTENT] as const, size: [MAP_EXTENT * 2, WALL_HEIGHT, WALL_THICKNESS] as const },
  // 서쪽
  { pos: [-MAP_EXTENT, WALL_HEIGHT / 2, 0] as const, size: [WALL_THICKNESS, WALL_HEIGHT, MAP_EXTENT * 2] as const },
  // 동쪽
  { pos: [MAP_EXTENT, WALL_HEIGHT / 2, 0] as const, size: [WALL_THICKNESS, WALL_HEIGHT, MAP_EXTENT * 2] as const },
]

export default function Map() {
  return (
    <group>
      {/* 구역 바닥 */}
      {ZONES.map((zone) => (
        <mesh
          key={zone.name}
          position={[zone.position[0], -0.01, zone.position[2]]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[ZONE_SIZE, ZONE_SIZE]} />
          <meshStandardMaterial color={zone.color} />
        </mesh>
      ))}

      {/* 구역 경계선 — 얇은 밝은 선 */}
      {/* 수직 중앙선 */}
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.05, ZONE_SIZE * 2 + GAP * 2]} />
        <meshBasicMaterial color="#1a2a35" />
      </mesh>
      {/* 수평 중앙선 */}
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]}>
        <planeGeometry args={[0.05, ZONE_SIZE * 2 + GAP * 2]} />
        <meshBasicMaterial color="#1a2a35" />
      </mesh>

      {/* 외곽 벽 */}
      {WALLS.map((wall, i) => (
        <mesh key={i} position={wall.pos}>
          <boxGeometry args={wall.size} />
          <meshStandardMaterial color="#1a2530" />
        </mesh>
      ))}
    </group>
  )
}
