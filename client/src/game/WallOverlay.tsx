/**
 * 벽 GLB 오버레이 + 가로등 조명
 *
 * SchoolCampus 박스 벽 위에 Kenney Building Kit GLB를 배치한다.
 * 출입구(gap)를 정확히 피해서 배치.
 *
 * ── 복도 남벽 (z=-25.4) 출입구 gap ──
 * gap1: x=-26.9 ~ -23  (별관 쪽, 약 4m)
 * gap2: x=-11.5 ~ -8   (현관, 약 3.5m)
 * 1F에만 gap 있음. 2F/3F는 벽이 연속.
 *
 * ── 교실-복도 벽 (z=-29) ──
 * 각 구간 사이에 ~1m gap = 교실 문
 *
 * Kenney 벽 유닛: 1m 폭, ~3m 높이
 * SchoolCampus 벽: 3.2m → scaleY 1.07
 */

import { useMemo, useEffect, useRef } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import type { FloorKey } from './SchoolCampus'
import { LAMPS, LAMP_TONES } from './SchoolCampus'

const SY = 1.07 // 높이 스케일 (3.2m / 3m)

/* ── 학교 벽 색상 팔레트 ── */
const COLORS = {
  exteriorBrick: '#9C6644',     // 외벽 — 적벽돌
  exteriorBrickDark: '#8B5E3C', // 체육관/어두운 외벽
  interiorCorridor: '#E8DCC8',  // 복도 내벽 — 크림
  interiorPartition: '#D4C8B0', // 교실 칸막이 — 베이지
  alleyWall: '#7A7A7A',         // 후문 담장 — 콘크리트 회색
  windowFrame: '#5A5A5A',       // 창틀
}

/* ── GLB 래퍼 (색상 변경 지원) ── */
function W({ url, position, rotation = [0, 0, 0] as [number, number, number], color }: {
  url: string
  position: [number, number, number]
  rotation?: [number, number, number]
  color?: string
}) {
  const { scene } = useGLTF(url)
  const cloned = useMemo(() => {
    const c = scene.clone()
    if (color) {
      c.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh
          // material을 복제해서 원본 오염 방지
          if (Array.isArray(mesh.material)) {
            mesh.material = mesh.material.map((m) => {
              const clonedMat = m.clone()
              if ('color' in clonedMat) {
                (clonedMat as THREE.MeshStandardMaterial).color.set(color)
              }
              return clonedMat
            })
          } else {
            mesh.material = mesh.material.clone()
            if ('color' in mesh.material) {
              (mesh.material as THREE.MeshStandardMaterial).color.set(color)
            }
          }
        }
      })
    }
    return c
  }, [scene, color])
  return <primitive object={cloned} position={position} rotation={rotation} scale={[1, SY, 1]} />
}

/**
 * 일직선 벽 채우기 — startX~endX (x방향) 또는 startZ~endZ (z방향)
 * 1m 간격으로 GLB 유닛 배치. windowEvery칸마다 창문.
 */
function FillWall({ start, end, fixedCoord, axis, y, windowEvery = 0, isExterior = false, color }: {
  start: number
  end: number
  fixedCoord: number
  axis: 'x' | 'z'
  y: number
  windowEvery?: number
  isExterior?: boolean
  color?: string
}) {
  const wallColor = color || (isExterior ? COLORS.exteriorBrick : COLORS.interiorPartition)

  const units = useMemo(() => {
    const from = Math.min(start, end)
    const to = Math.max(start, end)
    const result: { pos: [number, number, number]; url: string; isWindow: boolean }[] = []
    const count = Math.round(to - from)

    for (let i = 0; i < count; i++) {
      const offset = from + i + 0.5
      let url = '/models/wall.glb'
      let isWindow = false
      if (windowEvery > 0 && i % windowEvery === 1 && isExterior) {
        url = '/models/wall-window-square.glb'
        isWindow = true
      }
      const pos: [number, number, number] = axis === 'x'
        ? [offset, y, fixedCoord]
        : [fixedCoord, y, offset]
      result.push({ pos, url, isWindow })
    }
    return result
  }, [start, end, fixedCoord, axis, y, windowEvery, isExterior])

  const rot: [number, number, number] = axis === 'z' ? [0, Math.PI / 2, 0] : [0, 0, 0]
  // 유리 패널 오프셋 — 벽 안쪽으로 약간 들어감
  const glassOffset = axis === 'x' ? [0, 0, 0.05] : [0.05, 0, 0]

  return (
    <>
      {units.map((u, i) => (
        <group key={i}>
          <W url={u.url} position={u.pos} rotation={rot} color={wallColor} />
          {/* 창문 유리 — 발광 패널 (불 켜진 교실 느낌) */}
          {u.isWindow && (
            <mesh
              position={[
                u.pos[0] + glassOffset[0],
                u.pos[1] + 0.3 * SY, // 창문 중심 높이
                u.pos[2] + glassOffset[2],
              ]}
              rotation={rot}
            >
              <planeGeometry args={[0.7, 0.8 * SY]} />
              <meshBasicMaterial
                color="#ffe4a8"
                transparent
                opacity={0.6}
              />
            </mesh>
          )}
        </group>
      ))}
    </>
  )
}

/* ═══════════════════════════════════════
 * 1F 벽 — 출입구 gap을 정확히 피함
 * ═══════════════════════════════════════ */
function Walls1F({ y }: { y: number }) {
  const EXT = COLORS.exteriorBrick       // 외벽 적벽돌
  const INT = COLORS.interiorCorridor    // 복도 내벽 크림
  const PAR = COLORS.interiorPartition   // 칸막이 베이지

  return (
    <group>
      {/* ── 북쪽 외벽 — 교실별로 분리 (칸막이 위치에 벽, 교실 중앙에 창문) ── */}
      {/* 교실1-1: x=-34~-27 → 벽-창-창-벽-창-창-벽 */}
      {[[-34,-33], [-31,-29], [-28,-27]].map(([s,e], i) => (
        <FillWall key={`nw${i}`} start={s} end={e} fixedCoord={-35.7} axis="x" y={y} color={EXT} />
      ))}
      {[[-33,-31], [-29,-28]].map(([s,e], i) => (
        <FillWall key={`nwin1${i}`} start={s} end={e} fixedCoord={-35.7} axis="x" y={y} isExterior windowEvery={1} color={EXT} />
      ))}
      {/* 행정실~화장실: x=-27~1 — 같은 패턴 반복 */}
      {[[-27,-20], [-20,-13], [-13,-6], [-6,-2], [-2,1], [1,8]].map(([s,e], i) => {
        const width = e - s
        if (width <= 3) {
          // 좁은 방 — 벽-창-벽
          return <FillWall key={`ns${i}`} start={s} end={e} fixedCoord={-35.7} axis="x" y={y} isExterior windowEvery={2} color={EXT} />
        }
        // 넓은 방 — 양끝 벽, 가운데 창문
        return (
          <group key={`ng${i}`}>
            <FillWall start={s} end={s+1} fixedCoord={-35.7} axis="x" y={y} color={EXT} />
            <FillWall start={s+1} end={e-1} fixedCoord={-35.7} axis="x" y={y} isExterior windowEvery={1} color={EXT} />
            <FillWall start={e-1} end={e} fixedCoord={-35.7} axis="x" y={y} color={EXT} />
          </group>
        )
      })}

      {/* ── 서쪽 외벽 (적벽돌) ── */}
      <FillWall start={-35.7} end={-25.4} fixedCoord={-34} axis="z" y={y} windowEvery={3} isExterior color={EXT} />
      <FillWall start={-25.4} end={-8} fixedCoord={-34} axis="z" y={y} windowEvery={3} isExterior color={EXT} />

      {/* ── 동쪽 외벽 (적벽돌) ── */}
      <FillWall start={-35.7} end={-31} fixedCoord={8} axis="z" y={y} windowEvery={2} isExterior color={EXT} />
      <FillWall start={-28} end={-25.4} fixedCoord={8} axis="z" y={y} isExterior color={EXT} />

      {/* ── 복도 남벽 (외벽 = 적벽돌, 짧은 내부 구간 = 크림) ── */}
      <FillWall start={-34} end={-27} fixedCoord={-25.4} axis="x" y={y} windowEvery={3} isExterior color={EXT} />
      {/* gap1: 별관 출입구 */}
      <FillWall start={-23} end={-21.5} fixedCoord={-25.4} axis="x" y={y} color={INT} />
      <FillWall start={-20.4} end={-11.5} fixedCoord={-25.4} axis="x" y={y} windowEvery={3} isExterior color={EXT} />
      {/* gap2: 현관 출입구 */}
      <FillWall start={-8} end={8} fixedCoord={-25.4} axis="x" y={y} windowEvery={3} isExterior color={EXT} />

      {/* ── 교실-복도 벽 (내벽 = 크림) ── */}
      <FillWall start={-34} end={-32.6} fixedCoord={-29} axis="x" y={y} color={INT} />
      <FillWall start={-31.4} end={-29.6} fixedCoord={-29} axis="x" y={y} color={INT} />
      <FillWall start={-28.4} end={-25.6} fixedCoord={-29} axis="x" y={y} color={INT} />
      <FillWall start={-24.4} end={-22.6} fixedCoord={-29} axis="x" y={y} color={INT} />
      <FillWall start={-21.4} end={-17.7} fixedCoord={-29} axis="x" y={y} color={INT} />
      <FillWall start={-15.3} end={-11.6} fixedCoord={-29} axis="x" y={y} color={INT} />
      <FillWall start={-7.4} end={-4.6} fixedCoord={-29} axis="x" y={y} color={INT} />
      <FillWall start={-3.4} end={-1.15} fixedCoord={-29} axis="x" y={y} color={INT} />
      {/* 문 gap */}
      <FillWall start={0.1} end={3.3} fixedCoord={-29} axis="x" y={y} />
      {/* 문 gap */}
      <FillWall start={5.7} end={8} fixedCoord={-29} axis="x" y={y} color={INT} />

      {/* ── 교실 칸막이 (베이지) ── */}
      <FillWall start={-35.5} end={-29} fixedCoord={-27} axis="z" y={y} color={PAR} />
      <FillWall start={-35.5} end={-29} fixedCoord={-20} axis="z" y={y} color={PAR} />
      <FillWall start={-35.5} end={-29} fixedCoord={-13} axis="z" y={y} color={PAR} />
      <FillWall start={-35.5} end={-29} fixedCoord={-6} axis="z" y={y} color={PAR} />
      <FillWall start={-35.5} end={-29} fixedCoord={-2} axis="z" y={y} color={PAR} />
      <FillWall start={-35.5} end={-29} fixedCoord={1} axis="z" y={y} color={PAR} />

      {/* ── 코너 피스 (적벽돌) ── */}
      {[[-34, -35.7], [-34, -25.4], [8, -35.7], [8, -25.4]].map(([x, z], i) => (
        <W key={`c${i}`} url="/models/wall-corner.glb" position={[x, y, z]} color={EXT} />
      ))}
    </group>
  )
}

/* 2F/3F — 현관 gap 없음 */
function WallsUpper({ y }: { y: number }) {
  const EXT = COLORS.exteriorBrick
  const INT = COLORS.interiorCorridor
  const PAR = COLORS.interiorPartition

  return (
    <group>
      {/* 북쪽 외벽 (적벽돌) */}
      <FillWall start={-34} end={8} fixedCoord={-35.7} axis="x" y={y} windowEvery={3} isExterior color={EXT} />
      {/* 서쪽 외벽 */}
      <FillWall start={-35.7} end={-25.4} fixedCoord={-34} axis="z" y={y} windowEvery={3} isExterior color={EXT} />
      {/* 동쪽 외벽 */}
      <FillWall start={-35.7} end={-25.4} fixedCoord={8} axis="z" y={y} windowEvery={2} isExterior color={EXT} />
      {/* 복도 남벽 — 2F/3F는 연속 (적벽돌) */}
      <FillWall start={-34} end={-27} fixedCoord={-25.4} axis="x" y={y} windowEvery={3} isExterior color={EXT} />
      <FillWall start={-23} end={-21.5} fixedCoord={-25.4} axis="x" y={y} color={INT} />
      <FillWall start={-20.4} end={8} fixedCoord={-25.4} axis="x" y={y} windowEvery={3} isExterior color={EXT} />

      {/* 교실-복도 벽 (크림) */}
      <FillWall start={-34} end={-32.6} fixedCoord={-29} axis="x" y={y} color={INT} />
      <FillWall start={-31.4} end={-29.6} fixedCoord={-29} axis="x" y={y} color={INT} />
      <FillWall start={-28.4} end={-25.6} fixedCoord={-29} axis="x" y={y} color={INT} />
      <FillWall start={-24.4} end={-22.6} fixedCoord={-29} axis="x" y={y} color={INT} />
      <FillWall start={-21.4} end={-17.7} fixedCoord={-29} axis="x" y={y} color={INT} />
      <FillWall start={-15.3} end={-11.6} fixedCoord={-29} axis="x" y={y} color={INT} />
      <FillWall start={-7.4} end={-4.6} fixedCoord={-29} axis="x" y={y} color={INT} />
      <FillWall start={-3.4} end={-1.15} fixedCoord={-29} axis="x" y={y} color={INT} />
      <FillWall start={0.1} end={3.3} fixedCoord={-29} axis="x" y={y} color={INT} />
      <FillWall start={5.7} end={8} fixedCoord={-29} axis="x" y={y} color={INT} />

      {/* 칸막이 (베이지) */}
      <FillWall start={-35.5} end={-29} fixedCoord={-27} axis="z" y={y} color={PAR} />
      <FillWall start={-35.5} end={-29} fixedCoord={-20} axis="z" y={y} color={PAR} />
      <FillWall start={-35.5} end={-29} fixedCoord={-13} axis="z" y={y} color={PAR} />
      <FillWall start={-35.5} end={-29} fixedCoord={-6} axis="z" y={y} color={PAR} />
      <FillWall start={-35.5} end={-29} fixedCoord={-2} axis="z" y={y} color={PAR} />
      <FillWall start={-35.5} end={-29} fixedCoord={1} axis="z" y={y} color={PAR} />

      {/* 코너 (적벽돌) */}
      {[[-34, -35.7], [-34, -25.4], [8, -35.7], [8, -25.4]].map(([x, z], i) => (
        <W key={`c${i}`} url="/models/wall-corner.glb" position={[x, y, z]} color={EXT} />
      ))}
    </group>
  )
}

/* ═══════════════════════════════════════
 * 가로등 — SchoolCampus LAMPS 데이터 기반
 * Kenney 에셋 없으므로 프리미티브 + PointLight
 * 조명 톤: warm(운동장) / amber(골목) / cool(건물)
 * ═══════════════════════════════════════ */
function LampPosts() {
  return (
    <group>
      {LAMPS.map((lamp, i) => (
        <group key={i} position={[lamp.p[0], 0, lamp.p[1]]}>
          {/* 기둥 */}
          <mesh position={[0, lamp.h / 2, 0]}>
            <cylinderGeometry args={[0.06, 0.08, lamp.h, 8]} />
            <meshStandardMaterial color="#5a5a5a" />
          </mesh>
          {/* 전등 갓 */}
          <mesh position={[0, lamp.h - 0.1, 0]}>
            <coneGeometry args={[0.3, 0.25, 8]} />
            <meshStandardMaterial color="#6a6a6a" />
          </mesh>
          {/* 전구 발광 */}
          <mesh position={[0, lamp.h - 0.3, 0]}>
            <sphereGeometry args={[0.1, 8, 8]} />
            <meshBasicMaterial color={lamp.c} />
          </mesh>
          {/* 조명 — 넓게 분산 */}
          <pointLight
            position={[0, lamp.h - 0.2, 0]}
            intensity={8}
            distance={lamp.h * 2.5}
            color={lamp.c}
            decay={2}
          />
          {/* 바닥 반사광 — 더 넓고 약하게 */}
          <pointLight
            position={[0, 1, 0]}
            intensity={3}
            distance={lamp.h * 1.5}
            color={lamp.c}
            decay={2}
          />
        </group>
      ))}
    </group>
  )
}

/* ═══════════════════════════════════════
 * 체육관 벽 — 높이 9m (3층 분량)
 * x=14~36, z=-35.7~-18
 * Kenney 벽 3단 스택 (3m x 3 = 9m)
 * ═══════════════════════════════════════ */
function GymWalls() {
  const layers = [0, 3.2, 6.4] // 3단
  const GYM = COLORS.exteriorBrickDark // 체육관 어두운 벽돌

  return (
    <group>
      {layers.map((y, li) => (
        <group key={`gym${li}`}>
          <FillWall start={14} end={36} fixedCoord={-35.7} axis="x" y={y} windowEvery={4} isExterior color={GYM} />
          <FillWall start={14} end={22} fixedCoord={-18} axis="x" y={y} windowEvery={3} isExterior color={GYM} />
          <FillWall start={25} end={36} fixedCoord={-18} axis="x" y={y} windowEvery={3} isExterior color={GYM} />
          <FillWall start={-35.7} end={-18} fixedCoord={36} axis="z" y={y} windowEvery={4} isExterior color={GYM} />
        </group>
      ))}
    </group>
  )
}

/* ═══════════════════════════════════════
 * 윙 건물 벽 (급식실/도서실/미술실)
 * x=-34~-23, z=-25.4~-8
 * ═══════════════════════════════════════ */
function WingWalls({ y }: { y: number }) {
  const EXT = COLORS.exteriorBrick
  const INT = COLORS.interiorCorridor
  const PAR = COLORS.interiorPartition

  return (
    <group>
      {/* 동벽 (적벽돌) */}
      <FillWall start={-25} end={-20} fixedCoord={-23} axis="z" y={y} color={EXT} />
      <FillWall start={-18} end={-13} fixedCoord={-23} axis="z" y={y} color={EXT} />
      <FillWall start={-10} end={-8} fixedCoord={-23} axis="z" y={y} color={EXT} />

      {/* 남벽 (적벽돌) */}
      <FillWall start={-34} end={-30} fixedCoord={-8} axis="x" y={y} isExterior color={EXT} />
      <FillWall start={-24} end={-23} fixedCoord={-8} axis="x" y={y} color={EXT} />

      {/* 칸막이 (베이지) */}
      <FillWall start={-25.4} end={-17.5} fixedCoord={-27} axis="z" y={y} color={PAR} />
    </group>
  )
}

/* ═══════════════════════════════════════
 * 후문 골목 담장 (S자 미로)
 * z=22~36 영역, 높이 2.6m
 * ═══════════════════════════════════════ */
function AlleyWalls() {
  const ALLEY = COLORS.alleyWall // 콘크리트 회색

  return (
    <group>
      {/* 북쪽 담장 */}
      <FillWall start={-20} end={-8} fixedCoord={22} axis="x" y={0} color={ALLEY} />
      <FillWall start={-5} end={12} fixedCoord={22} axis="x" y={0} color={ALLEY} />
      <FillWall start={15} end={38} fixedCoord={22} axis="x" y={0} color={ALLEY} />

      {/* S자 내부 담장 */}
      <FillWall start={-14} end={-8} fixedCoord={28} axis="x" y={0} color={ALLEY} />
      <FillWall start={-6} end={-2} fixedCoord={28} axis="x" y={0} color={ALLEY} />
      <FillWall start={-12} end={2} fixedCoord={32} axis="x" y={0} color={ALLEY} />
      <FillWall start={4} end={8} fixedCoord={32} axis="x" y={0} color={ALLEY} />
      <FillWall start={8} end={13} fixedCoord={26} axis="x" y={0} color={ALLEY} />
      <FillWall start={15} end={20} fixedCoord={26} axis="x" y={0} color={ALLEY} />

      {/* 세로 담장 */}
      <FillWall start={28} end={36} fixedCoord={20} axis="z" y={0} color={ALLEY} />
      <FillWall start={22} end={36} fixedCoord={-8} axis="z" y={0} color={ALLEY} />
      <FillWall start={26} end={32} fixedCoord={-2} axis="z" y={0} color={ALLEY} />

      {/* 후문 현판 벽 */}
      <FillWall start={-12} end={-4} fixedCoord={36} axis="x" y={0} color={ALLEY} />
    </group>
  )
}

/* ═══════════════════════════════════════
 * 바닥 — 구역별 색 구분
 * ═══════════════════════════════════════ */
function GroundPlanes() {
  return (
    <group>
      {/* 운동장 잔디 */}
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[40, 30]} />
        <meshStandardMaterial color="#1a2a1a" />
      </mesh>

      {/* 놀이터 바닥 */}
      <mesh position={[-28, 0.01, 8]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[15, 15]} />
        <meshStandardMaterial color="#2a2520" />
      </mesh>

      {/* 후문 골목 아스팔트 */}
      <mesh position={[5, 0.01, 28]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[50, 16]} />
        <meshStandardMaterial color="#1a1a1e" />
      </mesh>

      {/* 정문/주차장 */}
      <mesh position={[25, 0.01, 32]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[20, 10]} />
        <meshStandardMaterial color="#1e1e22" />
      </mesh>

      {/* 본관 앞 보도 */}
      <mesh position={[-13, 0.01, -22]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[44, 6]} />
        <meshStandardMaterial color="#222228" />
      </mesh>
    </group>
  )
}

/* ── 메인 ── */
export default function WallOverlay({ visibleFloors }: {
  visibleFloors?: FloorKey[]
}) {
  const show = (f: FloorKey) => !visibleFloors || visibleFloors.includes(f)

  return (
    <group>
      {/* 본관 벽 */}
      {show('F1') && <Walls1F y={0} />}
      {show('F2') && <WallsUpper y={3.6} />}
      {show('F3') && <WallsUpper y={7.2} />}

      {/* 윙 건물 */}
      {show('F1') && <WingWalls y={0} />}
      {show('F2') && <WingWalls y={3.6} />}
      {show('F3') && <WingWalls y={7.2} />}

      {/* 체육관 — 항상 표시 (높이 9m, 외부에서도 보임) */}
      <GymWalls />

      {/* 외부 */}
      {show('OUT') && (
        <>
          <AlleyWalls />
          <GroundPlanes />
          <LampPosts />
        </>
      )}
    </group>
  )
}
