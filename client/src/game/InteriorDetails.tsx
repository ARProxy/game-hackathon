import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { FloorKey } from './SchoolCampus'

type Detail = {
  floor: FloorKey
  position: [number, number, number]
  scale: [number, number, number]
  rotation?: number
  color: string
}

const DETAILS: Detail[] = []

function box(
  floor: FloorKey,
  position: Detail['position'],
  scale: Detail['scale'],
  color: string,
  rotation = 0,
) {
  DETAILS.push({ floor, position, scale, color, rotation })
}

const WOOD = '#9a7650'
const DARK_WOOD = '#795c43'
const METAL = '#52636f'
const LIGHT_METAL = '#71838f'

function localPoint(x: number, z: number, dx: number, dz: number, rotation: number): [number, number] {
  return [
    x + dx * Math.cos(rotation) + dz * Math.sin(rotation),
    z - dx * Math.sin(rotation) + dz * Math.cos(rotation),
  ]
}

/** 실제 학교 비품 치수(1 Three unit = 1m)를 따르는 저비용 다부품 가구. */
function studentDesk(floor: FloorKey, x: number, y: number, z: number) {
  box(floor, [x, y + 0.69, z], [0.68, 0.06, 0.48], WOOD)
  for (const dx of [-0.27, 0.27]) for (const dz of [-0.17, 0.17]) {
    box(floor, [x + dx, y + 0.34, z + dz], [0.045, 0.68, 0.045], METAL)
  }
}

function chair(floor: FloorKey, x: number, y: number, z: number, rotation = 0) {
  box(floor, [x, y + 0.43, z], [0.42, 0.06, 0.42], METAL, rotation)
  const [backX, backZ] = localPoint(x, z, 0, 0.18, rotation)
  box(floor, [backX, y + 0.67, backZ], [0.42, 0.44, 0.055], METAL, rotation)
  for (const dx of [-0.16, 0.16]) for (const dz of [-0.16, 0.16]) {
    const [legX, legZ] = localPoint(x, z, dx, dz, rotation)
    box(floor, [legX, y + 0.21, legZ], [0.035, 0.42, 0.035], LIGHT_METAL, rotation)
  }
}

function workDesk(floor: FloorKey, x: number, y: number, z: number, rotation = 0) {
  box(floor, [x, y + 0.72, z], [1.35, 0.08, 0.7], DARK_WOOD, rotation)
  for (const dx of [-0.56, 0.56]) {
    const [sideX, sideZ] = localPoint(x, z, dx, 0, rotation)
    box(floor, [sideX, y + 0.35, sideZ], [0.1, 0.7, 0.58], DARK_WOOD, rotation)
  }
}

function bench(floor: FloorKey, x: number, y: number, z: number, rotation = 0) {
  box(floor, [x, y + 0.45, z], [1.8, 0.09, 0.48], '#64717a', rotation)
  const [backX, backZ] = localPoint(x, z, 0, 0.2, rotation)
  box(floor, [backX, y + 0.78, backZ], [1.8, 0.55, 0.08], '#64717a', rotation)
  for (const dx of [-0.68, 0.68]) {
    const [legX, legZ] = localPoint(x, z, dx, 0, rotation)
    box(floor, [legX, y + 0.22, legZ], [0.08, 0.44, 0.38], LIGHT_METAL, rotation)
  }
}

function classroom(floor: FloorKey, cx: number, y: number) {
  // 칠판과 교탁은 입구에서 방의 방향을 즉시 읽게 한다.
  box(floor, [cx, y + 1.65, -35.35], [4.2, 1.05, 0.12], '#315e58')
  workDesk(floor, cx, y, -33.75)

  for (const dx of [-2, 0, 2]) {
    for (const z of [-32.8, -31.4, -30.0]) {
      studentDesk(floor, cx + dx, y, z)
      chair(floor, cx + dx, y, z + 0.58, Math.PI)
    }
  }
  box(floor, [cx + 3.0, y + 0.9, -32.2], [0.55, 1.8, 3.8], '#647786')
}

function hallway(floor: FloorKey, y: number) {
  for (const x of [-30, -24, -18, -12, -6, 0, 5]) {
    box(floor, [x, y + 0.9, -26.0], [1.7, 1.8, 0.42], '#536979')
  }
}

for (const [floor, y] of [['F1', 0], ['F2', 3.6], ['F3', 7.2]] as const) {
  hallway(floor, y)
}

classroom('F1', -30.5, 0)
for (const cx of [-30.5, -23.5, -9.5]) classroom('F2', cx, 3.6)
for (const cx of [-30.5, -23.5, -9.5]) classroom('F3', cx, 7.2)

// 1층 행정실: 마주 보는 업무 책상과 서류장.
for (const x of [-25.3, -21.7]) {
  workDesk('F1', x, 0, -33.0)
  workDesk('F1', x, 0, -31.2, Math.PI)
  chair('F1', x, 0, -32.35)
  chair('F1', x, 0, -31.85, Math.PI)
}
box('F1', [-26.2, 1.0, -34.9], [0.55, 2.0, 1.3], '#65717d')
box('F1', [-20.8, 1.0, -34.9], [0.55, 2.0, 1.3], '#65717d')

// 현관 로비: 서로 마주 보는 벤치와 낮은 안내 테이블.
bench('F1', -11.3, 0, -32.2, Math.PI / 2)
bench('F1', -7.7, 0, -32.2, -Math.PI / 2)
box('F1', [-9.5, 0.42, -32.2], [1.0, 0.08, 0.65], '#897052')
for (const dx of [-0.4, 0.4]) box('F1', [-9.5 + dx, 0.2, -32.2], [0.06, 0.4, 0.5], LIGHT_METAL)

// 보건실: 두 침대와 칸막이로 다른 방과 명확히 구분한다.
for (const z of [-33.2, -30.7]) {
  box('F1', [-4.25, 0.55, z], [0.9, 0.18, 2.0], '#d4d9d8')
  for (const dx of [-0.36, 0.36]) for (const dz of [-0.82, 0.82]) {
    box('F1', [-4.25 + dx, 0.25, z + dz], [0.055, 0.5, 0.055], LIGHT_METAL)
  }
  box('F1', [-4.25, 0.88, z - 0.96], [0.9, 0.65, 0.07], '#8fb0bc')
}

// 별관 1층: 급식실의 긴 테이블 열.
for (const z of [-22.5, -19.4, -16.3]) {
  box('F1', [-30.5, 0.74, z], [3.2, 0.09, 0.8], '#a17b50')
  for (const x of [-31.8, -29.2]) box('F1', [x, 0.36, z], [0.08, 0.72, 0.65], LIGHT_METAL)
  bench('F1', -30.5, 0, z - 0.85)
  bench('F1', -30.5, 0, z + 0.85, Math.PI)
}

function DetailBatch({ items }: { items: Detail[] }) {
  const ref = useRef<THREE.InstancedMesh>(null)

  useEffect(() => {
    if (!ref.current) return
    const matrix = new THREE.Matrix4()
    const quaternion = new THREE.Quaternion()
    const position = new THREE.Vector3()
    const scale = new THREE.Vector3()
    const euler = new THREE.Euler()

    items.forEach((item, index) => {
      position.fromArray(item.position)
      scale.fromArray(item.scale)
      quaternion.setFromEuler(euler.set(0, item.rotation ?? 0, 0))
      matrix.compose(position, quaternion, scale)
      ref.current?.setMatrixAt(index, matrix)
    })
    ref.current.instanceMatrix.needsUpdate = true
  }, [items])

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, items.length]} castShadow receiveShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={items[0].color} roughness={0.78} />
    </instancedMesh>
  )
}

export default function InteriorDetails({ visibleFloors }: { visibleFloors?: FloorKey[] }) {
  const batches = useMemo(() => {
    const visible = DETAILS.filter((item) => !visibleFloors || visibleFloors.includes(item.floor))
    const byColor = new Map<string, Detail[]>()
    visible.forEach((item) => {
      const batch = byColor.get(item.color) ?? []
      batch.push(item)
      byColor.set(item.color, batch)
    })
    return [...byColor.values()]
  }, [visibleFloors])

  return (
    <group>
      {batches.map((items) => <DetailBatch key={items[0].color} items={items} />)}
    </group>
  )
}
