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

function classroom(floor: FloorKey, cx: number, y: number) {
  // 칠판과 교탁은 입구에서 방의 방향을 즉시 읽게 한다.
  box(floor, [cx, y + 1.65, -35.35], [4.2, 1.05, 0.12], '#315e58')
  box(floor, [cx, y + 0.42, -33.75], [1.45, 0.84, 0.7], '#8b6745')

  for (const dx of [-2, 0, 2]) {
    for (const z of [-32.8, -31.4, -30.0]) {
      box(floor, [cx + dx, y + 0.38, z], [1.15, 0.12, 0.68], '#9a7650')
      box(floor, [cx + dx, y + 0.32, z + 0.55], [0.58, 0.64, 0.58], '#52636f')
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
  box('F1', [x, 0.42, -33.0], [1.7, 0.84, 0.8], '#795c43')
  box('F1', [x, 0.42, -31.2], [1.7, 0.84, 0.8], '#795c43', Math.PI)
}
box('F1', [-26.2, 1.0, -34.9], [0.55, 2.0, 1.3], '#65717d')
box('F1', [-20.8, 1.0, -34.9], [0.55, 2.0, 1.3], '#65717d')

// 현관 로비: 서로 마주 보는 벤치와 낮은 안내 테이블.
box('F1', [-11.3, 0.42, -32.2], [0.75, 0.84, 2.5], '#475b68')
box('F1', [-7.7, 0.42, -32.2], [0.75, 0.84, 2.5], '#475b68')
box('F1', [-9.5, 0.28, -32.2], [1.25, 0.56, 1.25], '#897052')

// 보건실: 두 침대와 칸막이로 다른 방과 명확히 구분한다.
for (const z of [-33.2, -30.7]) {
  box('F1', [-4.3, 0.34, z], [1.25, 0.68, 1.9], '#d4d9d8')
  box('F1', [-3.5, 0.78, z - 0.65], [0.18, 0.9, 1.05], '#8fb0bc')
}

// 별관 1층: 급식실의 긴 테이블 열.
for (const z of [-22.5, -19.4, -16.3]) {
  box('F1', [-30.5, 0.42, z], [3.7, 0.12, 0.9], '#a17b50')
  box('F1', [-32.5, 0.34, z], [0.42, 0.68, 1.5], '#52636f')
  box('F1', [-28.5, 0.34, z], [0.42, 0.68, 1.5], '#52636f')
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
