import { useCallback, useEffect, useMemo, useRef } from 'react'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import {
  buildCampus,
  MAP_SIZE,
  TONE,
  type CampusBox,
  type CampusCylinder,
  type CampusDoor,
  type CampusFloor,
  type CampusPlate,
  type V3,
} from './campusV4Data.js'

export type FloorKey = CampusFloor

const CAMPUS = buildCampus({ seed: 0 })
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1)
const UNIT_PLANE = new THREE.PlaneGeometry(1, 1)
const UNIT_CYLINDER = new THREE.CylinderGeometry(1, 1, 1, 8)
const matrix = new THREE.Matrix4()
const position = new THREE.Vector3()
const rotation = new THREE.Euler()
const quaternion = new THREE.Quaternion()
const scale = new THREE.Vector3()

function applyMatrix(ref: THREE.InstancedMesh, index: number, p: V3, s: V3, rot?: V3) {
  position.set(...p)
  scale.set(...s)
  if (rot) {
    rotation.set(...rot)
    quaternion.setFromEuler(rotation)
  } else quaternion.identity()
  matrix.compose(position, quaternion, scale)
  ref.setMatrixAt(index, matrix)
}

function BoxBatch({ items, color, emissive = false }: { items: CampusBox[]; color: string; emissive?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  useEffect(() => {
    if (!ref.current) return
    items.forEach((item, index) => applyMatrix(ref.current!, index, item.p, item.s, item.rot))
    ref.current.instanceMatrix.needsUpdate = true
    ref.current.computeBoundingSphere()
  }, [items])
  return (
    <instancedMesh ref={ref} args={[UNIT_BOX, undefined, items.length]} castShadow={items.length < 180} receiveShadow>
      <meshStandardMaterial
        color={color}
        emissive={emissive ? color : '#000000'}
        emissiveIntensity={emissive ? 1.35 : 0}
        roughness={emissive ? 0.42 : 0.82}
      />
    </instancedMesh>
  )
}

function PlateBatch({ items, color }: { items: CampusPlate[]; color: string }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  useEffect(() => {
    if (!ref.current) return
    items.forEach((item, index) => {
      const rot: V3 = item.rot ?? [-Math.PI / 2, 0, 0]
      applyMatrix(ref.current!, index, item.p, [item.s[0], item.s[1], 1], rot)
    })
    ref.current.instanceMatrix.needsUpdate = true
    ref.current.computeBoundingSphere()
  }, [items])
  return (
    <instancedMesh ref={ref} args={[UNIT_PLANE, undefined, items.length]} receiveShadow>
      <meshStandardMaterial color={color} roughness={0.9} side={THREE.DoubleSide} />
    </instancedMesh>
  )
}

function CylinderBatch({ items, color }: { items: CampusCylinder[]; color: string }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  useEffect(() => {
    if (!ref.current) return
    items.forEach((item, index) => applyMatrix(ref.current!, index, item.p, [item.r, item.h, item.r], item.rot))
    ref.current.instanceMatrix.needsUpdate = true
    ref.current.computeBoundingSphere()
  }, [items])
  return (
    <instancedMesh ref={ref} args={[UNIT_CYLINDER, undefined, items.length]} castShadow={items.length < 100} receiveShadow>
      <meshStandardMaterial color={color} roughness={0.78} />
    </instancedMesh>
  )
}

function DoorBatch({ doors }: { doors: CampusDoor[] }) {
  const items = useMemo<CampusBox[]>(() => doors.map((door) => ({
    f: door.f,
    p: [
      door.hinge[0] + (door.axis === 'x' ? door.w / 2 : 0),
      door.hinge[1] + door.h / 2,
      door.hinge[2] + (door.axis === 'z' ? door.w / 2 : 0),
    ],
    s: door.axis === 'x' ? [door.w, door.h, door.t] : [door.t, door.h, door.w],
    c: door.c,
  })), [doors])
  const groups = useMemo(() => groupByColor(items), [items])
  return <>{[...groups].map(([color, group]) => <BoxBatch key={color} color={color} items={group} />)}</>
}

function groupByColor<T extends { c: string }>(items: T[]) {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const group = groups.get(item.c)
    if (group) group.push(item)
    else groups.set(item.c, [item])
  }
  return groups
}

/** 큰 구조물만 물리 충돌체로 만들고 작은 장식은 시각 전용으로 유지한다. */
function isStructural(item: CampusBox) {
  const [x, y, z] = item.s
  const isWalkableSlab = y <= 0.75 && x >= 2 && z >= 2
  const isWall = y >= 1.75 && (x >= 1.5 || z >= 1.5)
  return isWalkableSlab || isWall
}

export default function SchoolCampusV4({ visibleFloors }: { visibleFloors?: FloorKey[] }) {
  const visible = useMemo(() => new Set(visibleFloors), [visibleFloors])
  const show = useCallback((floor: FloorKey) => !visibleFloors || visible.has(floor), [visibleFloors, visible])
  const solids = useMemo(() => CAMPUS.solids.filter((item) => !item.hide && show(item.f)), [show])
  const visuals = useMemo(() => CAMPUS.visuals.filter((item) => show(item.f)), [show])
  const plates = useMemo(() => CAMPUS.plates.filter((item) => show(item.f)), [show])
  const cylinders = useMemo(() => CAMPUS.cyls.filter((item) => show(item.f)), [show])
  const fixtures = useMemo<CampusBox[]>(() => CAMPUS.fixtures.filter((item) => show(item.f)).map((item) => ({
    f: item.f, p: item.p, s: [1.8, 0.07, 0.22], c: item.c, e: 1,
  })), [show])
  const doors = useMemo(() => CAMPUS.doors.filter((item) => show(item.f)), [show])
  const boxGroups = useMemo(() => groupByColor([...solids, ...visuals]), [solids, visuals])
  const plateGroups = useMemo(() => groupByColor(plates), [plates])
  const cylinderGroups = useMemo(() => groupByColor(cylinders), [cylinders])
  const fixtureGroups = useMemo(() => groupByColor(fixtures), [fixtures])
  const colliders = useMemo(() => solids.filter(isStructural), [solids])
  const dynamicFixtures = useMemo(() => CAMPUS.fixtures.filter((item) => item.dynamic && show(item.f)).slice(0, 18), [show])

  return (
    <group>
      <RigidBody type="fixed" colliders={false}>
        {colliders.map((item, index) => (
          <CuboidCollider key={index} args={[item.s[0] / 2, item.s[1] / 2, item.s[2] / 2]} position={item.p} rotation={item.rot} />
        ))}
      </RigidBody>
      {[...boxGroups].map(([color, items]) => <BoxBatch key={color} color={color} items={items} />)}
      {[...plateGroups].map(([color, items]) => <PlateBatch key={color} color={color} items={items} />)}
      {[...cylinderGroups].map(([color, items]) => <CylinderBatch key={color} color={color} items={items} />)}
      {[...fixtureGroups].map(([color, items]) => <BoxBatch key={color} color={color} items={items} emissive />)}
      <DoorBatch doors={doors} />
      {dynamicFixtures.map((fixture, index) => (
        <pointLight key={index} position={fixture.p} color={TONE[fixture.tone] ?? fixture.c} intensity={3.4} distance={10} decay={1.8} />
      ))}
      <mesh position={[0, -0.55, 0]} receiveShadow>
        <boxGeometry args={[MAP_SIZE, 1, MAP_SIZE]} />
        <meshStandardMaterial color="#303a3e" roughness={1} />
      </mesh>
    </group>
  )
}
