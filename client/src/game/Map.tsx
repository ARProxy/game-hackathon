/**
 * 운동장 맵 — 50x50, 4개 구역
 * Rapier 충돌체 포함 (바닥 + 외곽 벽)
 */

import { RigidBody } from '@react-three/rapier'

const MAP_SIZE = 50
const ZONE_SIZE = 24
const HALF = ZONE_SIZE / 2
const GAP = 1

const ZONES = [
  { name: 'A_playground', position: [-HALF - GAP, 0, -HALF - GAP] as const, color: '#0e1a28' },
  { name: 'B_storage', position: [HALF + GAP, 0, -HALF - GAP] as const, color: '#12161e' },
  { name: 'C_center', position: [-HALF - GAP, 0, HALF + GAP] as const, color: '#101820' },
  { name: 'D_exit', position: [HALF + GAP, 0, HALF + GAP] as const, color: '#141a22' },
]

const WALL_HEIGHT = 2.5
const WALL_THICKNESS = 0.4
const EXTENT = MAP_SIZE / 2 + 0.5

const WALLS = [
  { pos: [0, WALL_HEIGHT / 2, -EXTENT] as const, size: [MAP_SIZE + 1, WALL_HEIGHT, WALL_THICKNESS] as const },
  { pos: [0, WALL_HEIGHT / 2, EXTENT] as const, size: [MAP_SIZE + 1, WALL_HEIGHT, WALL_THICKNESS] as const },
  { pos: [-EXTENT, WALL_HEIGHT / 2, 0] as const, size: [WALL_THICKNESS, WALL_HEIGHT, MAP_SIZE + 1] as const },
  { pos: [EXTENT, WALL_HEIGHT / 2, 0] as const, size: [WALL_THICKNESS, WALL_HEIGHT, MAP_SIZE + 1] as const },
]

export default function Map() {
  return (
    <group>
      {/* 바닥 — 충돌체 (플레이어가 떨어지지 않게) */}
      <RigidBody type="fixed" position={[0, -0.5, 0]}>
        <mesh>
          <boxGeometry args={[MAP_SIZE + 2, 1, MAP_SIZE + 2]} />
          <meshStandardMaterial color="#0a1018" />
        </mesh>
      </RigidBody>

      {/* 구역 바닥 (시각용) */}
      {ZONES.map((zone) => (
        <mesh
          key={zone.name}
          position={[zone.position[0], 0.01, zone.position[2]]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[ZONE_SIZE, ZONE_SIZE]} />
          <meshStandardMaterial color={zone.color} />
        </mesh>
      ))}

      {/* 구역 경계선 */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.08, MAP_SIZE]} />
        <meshBasicMaterial color="#1a2a35" />
      </mesh>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]}>
        <planeGeometry args={[0.08, MAP_SIZE]} />
        <meshBasicMaterial color="#1a2a35" />
      </mesh>

      {/* 외곽 벽 — 충돌체 포함 */}
      {WALLS.map((wall, i) => (
        <RigidBody key={i} type="fixed" position={wall.pos}>
          <mesh>
            <boxGeometry args={wall.size} />
            <meshStandardMaterial color="#1a2530" />
          </mesh>
        </RigidBody>
      ))}
    </group>
  )
}

export { MAP_SIZE, ZONE_SIZE, EXTENT }
