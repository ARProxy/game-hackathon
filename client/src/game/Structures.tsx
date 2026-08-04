/**
 * 구역별 구조물 — 50x50 맵 + Rapier 충돌
 * 3D 술래잡기에 필요한 밀도:
 * - 시야 차단 벽/구조물
 * - 갈림길, 좁은 통로
 * - 높낮이 (경사면, 계단, 플랫폼)
 * - 막다른 길 (위험)
 * - 숨을 수 있는 코너
 */

import { RigidBody } from '@react-three/rapier'

/** 충돌 있는 박스 구조물 */
function Wall({ position, size, color = '#1a2530' }: {
  position: [number, number, number]
  size: [number, number, number]
  color?: string
}) {
  return (
    <RigidBody type="fixed" position={position} colliders="cuboid">
      <mesh>
        <boxGeometry args={size} />
        <meshStandardMaterial color={color} />
      </mesh>
    </RigidBody>
  )
}

/** 충돌 있는 원기둥 (나무, 기둥) */
function Pillar({ position, radius = 0.2, height = 3, color = '#4a4a4a' }: {
  position: [number, number, number]
  radius?: number
  height?: number
  color?: string
}) {
  return (
    <RigidBody type="fixed" position={position} colliders="cuboid">
      <mesh>
        <cylinderGeometry args={[radius, radius, height, 12]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </RigidBody>
  )
}

/** 경사면 (올라갈 수 있음) */
function Ramp({ position, rotation = [0, 0, 0], size = [2, 0.1, 4], color = '#3a3a3a' }: {
  position: [number, number, number]
  rotation?: [number, number, number]
  size?: [number, number, number]
  color?: string
}) {
  return (
    <RigidBody type="fixed" position={position} rotation={rotation} colliders="cuboid">
      <mesh>
        <boxGeometry args={size} />
        <meshStandardMaterial color={color} />
      </mesh>
    </RigidBody>
  )
}

const W = '#1a2530'
const METAL = '#4a4a4a'
const WOOD = '#3a2a1a'
const CONCRETE = '#2a2a2a'
const CONTAINER = '#1a2028'

/** A구역 — 놀이기구 (좌상, 중심 -13, -13) */
function Playground() {
  return (
    <group position={[-13, 0, -13]}>
      {/* === 미끄럼틀 — 올라갈 수 있는 플랫폼 === */}
      <Wall position={[-5, 2, -5]} size={[3, 0.2, 2.5]} color={CONCRETE} />
      <Pillar position={[-6.3, 1, -6]} height={2} color={METAL} />
      <Pillar position={[-3.7, 1, -6]} height={2} color={METAL} />
      <Pillar position={[-6.3, 1, -4]} height={2} color={METAL} />
      <Pillar position={[-3.7, 1, -4]} height={2} color={METAL} />
      {/* 경사면 — 올라가기 */}
      <Ramp position={[-5, 1, -2.5]} rotation={[-0.35, 0, 0]} size={[2.5, 0.12, 3.5]} color="#4a5a6a" />
      {/* 벽 아래 숨을 공간 */}
      <Wall position={[-5, 0.5, -6.5]} size={[3.5, 1, 0.3]} color={CONCRETE} />

      {/* === 정글짐 — 격자 구조, 안에 숨을 수 있음 === */}
      <group position={[3, 0, -4]}>
        <Pillar position={[-2, 1.5, -2]} height={3} radius={0.1} color={METAL} />
        <Pillar position={[2, 1.5, -2]} height={3} radius={0.1} color={METAL} />
        <Pillar position={[-2, 1.5, 2]} height={3} radius={0.1} color={METAL} />
        <Pillar position={[2, 1.5, 2]} height={3} radius={0.1} color={METAL} />
        <Pillar position={[0, 1.5, 0]} height={3} radius={0.1} color={METAL} />
        {/* 중간 플랫폼 */}
        <Wall position={[0, 1.5, 0]} size={[4.2, 0.1, 4.2]} color={METAL} />
        <Wall position={[0, 3, 0]} size={[4.2, 0.1, 4.2]} color={METAL} />
      </group>

      {/* === 그네 프레임 (충돌) === */}
      <group position={[-2, 0, 5]}>
        <Wall position={[0, 1.8, 0]} size={[5, 0.15, 0.15]} color={METAL} />
        <Pillar position={[-2.3, 1.5, 0]} height={3} radius={0.08} color={METAL} />
        <Pillar position={[2.3, 1.5, 0]} height={3} radius={0.08} color={METAL} />
        {/* 좌석 (비주얼) */}
        <mesh position={[-0.8, 0.5, 0]}><boxGeometry args={[0.5, 0.06, 0.3]} /><meshStandardMaterial color={WOOD} /></mesh>
        <mesh position={[0.8, 0.5, 0]}><boxGeometry args={[0.5, 0.06, 0.3]} /><meshStandardMaterial color={WOOD} /></mesh>
      </group>

      {/* === L자 벽 — 숨을 코너 생성 === */}
      <Wall position={[7, 1, -8]} size={[0.3, 2, 6]} color={W} />
      <Wall position={[9, 1, -5]} size={[4, 2, 0.3]} color={W} />

      {/* === 나무들 (충돌 있는 기둥 + 비주얼 수관) === */}
      {[[8, 3], [-7, 7], [5, 7]].map(([x, z], i) => (
        <group key={`tree${i}`}>
          <Pillar position={[x, 1.5, z]} height={3} radius={0.3} color="#3a2a15" />
          <mesh position={[x, 3.5, z]}><sphereGeometry args={[1.5, 8, 8]} /><meshStandardMaterial color="#1a3a1a" /></mesh>
        </group>
      ))}

      {/* === 작은 벽 조각들 — 미니 은신처 === */}
      <Wall position={[0, 0.6, 0]} size={[1.5, 1.2, 0.2]} color={CONCRETE} />
      <Wall position={[-8, 0.6, 2]} size={[0.2, 1.2, 2]} color={CONCRETE} />
    </group>
  )
}

/** B구역 — 창고 (우상, 중심 13, -13) — 가장 밀도 높음, 좁은 통로 */
function Storage() {
  return (
    <group position={[13, 0, -13]}>
      {/* === 대형 컨테이너 1 — 위에 올라갈 수 있음 === */}
      <Wall position={[0, 1.5, -5]} size={[6, 3, 2.5]} color={CONTAINER} />
      {/* 올라가는 경사면 */}
      <Ramp position={[-3.5, 0.8, -5]} rotation={[0, 0, 0.35]} size={[2, 0.12, 2]} color={METAL} />

      {/* === 대형 컨테이너 2 (L자) === */}
      <Wall position={[5, 1.5, 0]} size={[2.5, 3, 7]} color="#1e2430" />

      {/* === 좁은 통로 만드는 벽들 === */}
      <Wall position={[-3, 1.2, -1]} size={[0.3, 2.4, 6]} color={W} />
      <Wall position={[-6, 1.2, 0]} size={[0.3, 2.4, 8]} color={W} />
      {/* 통로 폭 ~2.7m */}

      {/* === 갈림길 — T자 교차 === */}
      <Wall position={[-4.5, 1.2, 3]} size={[3.3, 2.4, 0.3]} color={W} />

      {/* === 막다른 길 (B구역 유일) === */}
      <Wall position={[-1, 1.2, 7]} size={[4, 2.4, 0.3]} color={W} />
      <Wall position={[-3, 1.2, 5.5]} size={[0.3, 2.4, 3.3]} color={W} />
      <Wall position={[1, 1.2, 5.5]} size={[0.3, 2.4, 3.3]} color={W} />

      {/* === 적재물 상자들 (충돌, 크기 다양) === */}
      <Wall position={[-7, 0.5, -7]} size={[1.2, 1, 1.2]} color="#2a3020" />
      <Wall position={[-5.8, 0.5, -6.5]} size={[0.8, 1, 0.8]} color="#302a20" />
      <Wall position={[-6.5, 1.3, -6.8]} size={[0.7, 0.6, 0.7]} color="#2a2a30" />
      <Wall position={[7, 0.5, -8]} size={[1, 1, 1]} color="#2a3020" />
      <Wall position={[-8, 0.5, 5]} size={[1.5, 1, 1.5]} color="#302a20" />

      {/* === 선반 (충돌 + 숨을 수 있는 아래 공간) === */}
      <group position={[8, 0, -2]}>
        <Wall position={[0, 2, 0]} size={[2, 0.1, 3]} color={METAL} />
        <Pillar position={[-0.9, 1, -1.4]} height={2} radius={0.05} color={METAL} />
        <Pillar position={[0.9, 1, -1.4]} height={2} radius={0.05} color={METAL} />
        <Pillar position={[-0.9, 1, 1.4]} height={2} radius={0.05} color={METAL} />
        <Pillar position={[0.9, 1, 1.4]} height={2} radius={0.05} color={METAL} />
      </group>

      {/* === 추가 벽 — 더 복잡한 동선 === */}
      <Wall position={[2, 1, -9]} size={[0.3, 2, 3]} color={W} />
      <Wall position={[7, 1, 4]} size={[3, 2, 0.3]} color={W} />
    </group>
  )
}

/** C구역 — 운동장 중앙 (좌하, 중심 -13, 13) — 의도적으로 빈 개활지 */
function Center() {
  return (
    <group position={[-13, 0, 13]}>
      {/* === 조회대 (유일한 큰 엄폐물) === */}
      <Wall position={[0, 0.5, 0]} size={[5, 1, 3]} color={CONCRETE} />
      <mesh position={[0, 1.4, 0]}><cylinderGeometry args={[0.04, 0.04, 1, 8]} /><meshStandardMaterial color={METAL} /></mesh>

      {/* === 골대 2개 (기둥 충돌) === */}
      <group position={[8, 0, 6]}>
        <Pillar position={[-1.5, 1.2, 0]} height={2.4} radius={0.06} color="#d0d0d0" />
        <Pillar position={[1.5, 1.2, 0]} height={2.4} radius={0.06} color="#d0d0d0" />
        <mesh position={[0, 2.4, 0]}><boxGeometry args={[3.1, 0.1, 0.1]} /><meshStandardMaterial color="#d0d0d0" /></mesh>
      </group>
      <group position={[-8, 0, 6]}>
        <Pillar position={[-1.5, 1.2, 0]} height={2.4} radius={0.06} color="#d0d0d0" />
        <Pillar position={[1.5, 1.2, 0]} height={2.4} radius={0.06} color="#d0d0d0" />
        <mesh position={[0, 2.4, 0]}><boxGeometry args={[3.1, 0.1, 0.1]} /><meshStandardMaterial color="#d0d0d0" /></mesh>
      </group>

      {/* === 음수대 (작은 엄폐물) === */}
      <Wall position={[-9, 0.5, -3]} size={[1, 1, 0.6]} color={METAL} />

      {/* === 쓰레기통 (작은 엄폐물) === */}
      <Wall position={[5, 0.5, -5]} size={[0.6, 1, 0.6]} color="#3a3a3a" />
      <Wall position={[-3, 0.5, 8]} size={[0.6, 1, 0.6]} color="#3a3a3a" />

      {/* === 라인 마킹 (비주얼만) === */}
      <mesh position={[0, 0.02, 6]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[18, 0.06]} /><meshBasicMaterial color="#2a3a4a" />
      </mesh>

      {/* === 낮은 벽 — 개활지에 최소한의 엄폐 === */}
      <Wall position={[3, 0.4, -2]} size={[2, 0.8, 0.2]} color={CONCRETE} />
      <Wall position={[-6, 0.4, 3]} size={[0.2, 0.8, 3]} color={CONCRETE} />
    </group>
  )
}

/** D구역 — 골목 출구 (우하, 중심 13, 13) */
function Exit() {
  return (
    <group position={[13, 0, 13]}>
      {/* === 벤치들 (충돌 있는 낮은 구조물) === */}
      {[[-5, 2], [0, 6], [5, -1], [-8, 8]].map(([x, z], i) => (
        <Wall key={`bench${i}`} position={[x, 0.3, z]} size={[2, 0.6, 0.6]} color={WOOD} />
      ))}

      {/* === 가로등 3개 (기둥 충돌 + 빛) === */}
      {[[-3, -5], [6, 6], [-7, 7]].map(([x, z], i) => (
        <group key={`lamp${i}`}>
          <Pillar position={[x, 2, z]} height={4} radius={0.06} color="#5a5a5a" />
          <mesh position={[x, 3.9, z]}><coneGeometry args={[0.3, 0.25, 8]} /><meshStandardMaterial color="#5a5a5a" /></mesh>
          <pointLight position={[x, 3.8, z]} intensity={4} distance={8} color="#ffe4b5" />
        </group>
      ))}

      {/* === 화단 (낮은 벽 + 식물) === */}
      {[[-7, -2], [3, -7]].map(([x, z], i) => (
        <group key={`garden${i}`}>
          <Wall position={[x, 0.3, z]} size={[2.5, 0.6, 1.2]} color="#1a3020" />
          {[-0.6, 0, 0.6].map((ox, j) => (
            <mesh key={j} position={[x + ox, 0.8, z]}><sphereGeometry args={[0.3, 6, 6]} /><meshStandardMaterial color="#2a5a2a" /></mesh>
          ))}
        </group>
      ))}

      {/* === 골목 담장 — L자/T자 배치로 갈림길 생성 === */}
      <Wall position={[8, 1, -3]} size={[0.25, 2, 10]} color={W} />
      <Wall position={[4, 1, -8]} size={[8, 2, 0.25]} color={W} />
      <Wall position={[-4, 1, 2]} size={[0.25, 2, 6]} color={W} />
      <Wall position={[-7, 1, 5]} size={[6, 2, 0.25]} color={W} />

      {/* === 탈출 게이트 프레임 === */}
      <group position={[0, 0, -9]}>
        <Pillar position={[-1.3, 1.5, 0]} height={3} radius={0.15} color="#3a3a5a" />
        <Pillar position={[1.3, 1.5, 0]} height={3} radius={0.15} color="#3a3a5a" />
        <Wall position={[0, 2.9, 0]} size={[2.9, 0.3, 0.3]} color="#3a3a5a" />
      </group>

      {/* === 나무 (큰 기둥 + 수관) === */}
      {[[7, -7], [-9, -6]].map(([x, z], i) => (
        <group key={`tree${i}`}>
          <Pillar position={[x, 1.5, z]} height={3} radius={0.35} color="#3a2a15" />
          <mesh position={[x, 3.5, z]}><sphereGeometry args={[1.8, 8, 8]} /><meshStandardMaterial color="#1a3a1a" /></mesh>
        </group>
      ))}

      {/* === 작은 벽 조각 — 코너 은신처 === */}
      <Wall position={[2, 0.6, 3]} size={[1.5, 1.2, 0.2]} color={CONCRETE} />
      <Wall position={[2.7, 0.6, 3.7]} size={[0.2, 1.2, 1.2]} color={CONCRETE} />
    </group>
  )
}

/** 구역 간 벽/울타리 — 이동 경로 제한 + 통과 가능 구간 */
function Boundaries() {
  return (
    <group>
      {/* === A-B 경계 (x=0 라인, z=-25~0) === */}
      {/* 북쪽 구간 */}
      <Wall position={[0, 1, -22]} size={[0.25, 2, 6]} color={W} />
      {/* 3m 개방 (z=-19~-16) */}
      {/* 남쪽 구간 */}
      <Wall position={[0, 1, -10]} size={[0.25, 2, 12]} color={W} />

      {/* === A-C 경계 (z=0 라인, x=-25~0) === */}
      <Wall position={[-20, 1, 0]} size={[10, 2, 0.25]} color={W} />
      {/* 3m 개방 (x=-15~-12) */}
      <Wall position={[-7, 1, 0]} size={[10, 2, 0.25]} color={W} />

      {/* === B-D 경계 (z=0 라인, x=0~25) === */}
      <Wall position={[8, 1, 0]} size={[8, 2, 0.25]} color={W} />
      {/* 3m 개방 (x=12~15) */}
      <Wall position={[20, 1, 0]} size={[10, 2, 0.25]} color={W} />

      {/* === C-D 경계 (x=0 라인, z=0~25) === */}
      <Wall position={[0, 1, 8]} size={[0.25, 2, 8]} color={W} />
      {/* 3m 개방 (z=12~15) */}
      <Wall position={[0, 1, 20]} size={[0.25, 2, 10]} color={W} />

      {/* === 중앙 교차점 부근 작은 벽 — 중앙 통과 시 완전 노출 방지 === */}
      <Wall position={[3, 0.6, -3]} size={[1.5, 1.2, 0.2]} color={CONCRETE} />
      <Wall position={[-3, 0.6, 3]} size={[0.2, 1.2, 1.5]} color={CONCRETE} />
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
      <Boundaries />
    </group>
  )
}
