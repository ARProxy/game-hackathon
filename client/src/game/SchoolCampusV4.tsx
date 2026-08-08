import { useCallback, useEffect, useMemo, useRef } from 'react'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import {
  buildCampus,
  MAP_SIZE,
  PAL,
  TONE,
  type CampusBox,
  type CampusCylinder,
  type CampusDoor,
  type CampusFloor,
  type CampusPlate,
  type CampusRotation,
  type V3,
} from './campusV4Data.js'
import { bakeFamilies, FAMILY_OF_PAL, worldUV, type BakedFamily } from './textures'
import OriginalElevators from './OriginalElevators'
import type { PlayerHandle } from './Player'

export type FloorKey = CampusFloor

const CAMPUS = buildCampus({ seed: 0 })
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1)
const UNIT_PLANE = new THREE.PlaneGeometry(1, 1)
const UNIT_CYLINDER = new THREE.CylinderGeometry(1, 1, 1, 8)
const matrix = new THREE.Matrix4()
const _position = new THREE.Vector3()
const _rotation = new THREE.Euler()
const _quaternion = new THREE.Quaternion()
const _scale = new THREE.Vector3()
const _color = new THREE.Color()

/** PAL HEX → PAL 이름 역매핑 (한 번만 생성) */
const PAL_REVERSE = new Map<string, string>()
for (const [name, hex] of Object.entries(PAL as Record<string, string>)) {
  PAL_REVERSE.set(hex.toLowerCase(), name)
}

/** HEX 색상 → 재질군 이름 */
function familyFor(hex: string): string {
  const palName = PAL_REVERSE.get(hex.toLowerCase())
  if (palName) {
    const family = FAMILY_OF_PAL[palName]
    if (family) return family
  }
  return 'paint'
}

function rotationTuple(value?: CampusRotation | null): V3 | undefined {
  if (Array.isArray(value)) return value
  if (value && Array.isArray(value.rot)) return value.rot
  return undefined
}

function applyMatrix(ref: THREE.InstancedMesh, index: number, p: V3, s: V3, rot?: CampusRotation | null) {
  _position.set(...p)
  _scale.set(...s)
  const tuple = rotationTuple(rot)
  if (tuple) {
    _rotation.set(...tuple)
    _quaternion.setFromEuler(_rotation)
  } else _quaternion.identity()
  matrix.compose(_position, _quaternion, _scale)
  ref.setMatrixAt(index, matrix)
}

/** PBR 재질 + 인스턴스별 색상을 사용하는 박스 배치 */
function PBRBoxBatch({ items, family, emissive = false }: { items: CampusBox[]; family: BakedFamily; emissive?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const mat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      map: family.map,
      normalMap: family.normalMap,
      roughnessMap: family.roughnessMap,
      metalness: family.metalness,
      roughness: family.roughness,
      envMapIntensity: family.env,
      emissive: emissive ? '#ffffff' : '#000000',
      emissiveIntensity: emissive ? 1.35 : 0,
    })
    worldUV(m, family.uvScale)
    return m
  }, [family, emissive])

  useEffect(() => {
    if (!ref.current) return
    items.forEach((item, index) => {
      applyMatrix(ref.current!, index, item.p, item.s, item.rot)
      _color.set(item.c)
      ref.current!.setColorAt(index, _color)
    })
    ref.current.instanceMatrix.needsUpdate = true
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true
    ref.current.computeBoundingSphere()
  }, [items])

  return (
    <instancedMesh ref={ref} args={[UNIT_BOX, mat, items.length]} castShadow={items.length < 180} receiveShadow />
  )
}

/** PBR 재질 + 인스턴스별 색상 평면 배치 */
function PBRPlateBatch({ items, family }: { items: CampusPlate[]; family: BakedFamily }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const mat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      map: family.map,
      normalMap: family.normalMap,
      roughnessMap: family.roughnessMap,
      metalness: family.metalness,
      roughness: family.roughness,
      envMapIntensity: family.env,
      side: THREE.DoubleSide,
    })
    worldUV(m, family.uvScale)
    return m
  }, [family])

  useEffect(() => {
    if (!ref.current) return
    items.forEach((item, index) => {
      const rot: CampusRotation = item.rot ?? [-Math.PI / 2, 0, 0]
      applyMatrix(ref.current!, index, item.p, [item.s[0], item.s[1], 1], rot)
      _color.set(item.c)
      ref.current!.setColorAt(index, _color)
    })
    ref.current.instanceMatrix.needsUpdate = true
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true
    ref.current.computeBoundingSphere()
  }, [items])

  return (
    <instancedMesh ref={ref} args={[UNIT_PLANE, mat, items.length]} receiveShadow />
  )
}

/** PBR 재질 + 인스턴스별 색상 실린더 배치 */
function PBRCylinderBatch({ items, family }: { items: CampusCylinder[]; family: BakedFamily }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const mat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      map: family.map,
      normalMap: family.normalMap,
      roughnessMap: family.roughnessMap,
      metalness: family.metalness,
      roughness: family.roughness,
      envMapIntensity: family.env,
    })
    worldUV(m, family.uvScale)
    return m
  }, [family])

  useEffect(() => {
    if (!ref.current) return
    items.forEach((item, index) => {
      applyMatrix(ref.current!, index, item.p, [item.r, item.h, item.r], item.rot)
      _color.set(item.c)
      ref.current!.setColorAt(index, _color)
    })
    ref.current.instanceMatrix.needsUpdate = true
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true
    ref.current.computeBoundingSphere()
  }, [items])

  return (
    <instancedMesh ref={ref} args={[UNIT_CYLINDER, mat, items.length]} castShadow={items.length < 100} receiveShadow />
  )
}

function DoorBatch({ doors, families }: { doors: CampusDoor[]; families: Record<string, BakedFamily> }) {
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
  const groups = useMemo(() => groupByFamily(items), [items])
  return <>{[...groups].map(([familyName, group]) => (
    <PBRBoxBatch key={familyName} family={families[familyName] ?? families.paint} items={group} />
  ))}</>
}

/** 재질군별 그룹핑 — 같은 재질군은 같은 InstancedMesh로 배칭 */
function groupByFamily<T extends { c: string }>(items: T[]) {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const family = familyFor(item.c)
    const group = groups.get(family)
    if (group) group.push(item)
    else groups.set(family, [item])
  }
  return groups
}

/** 큰 구조물만 물리 충돌체로 만들고 작은 장식은 시각 전용으로 유지한다. */
function isStructural(item: CampusBox) {
  const [x, y, z] = item.s
  if (item.hide && item.ramp) return true
  const isWalkableSlab = y <= 0.75 && x >= 2 && z >= 2
  const isWall = y >= 1.75 && (x >= 1.5 || z >= 1.5)
  return isWalkableSlab || isWall
}

/** 전체 층을 볼 때도 한 층이 동적 광원 예산을 독점하지 않게 순환 선택한다. */
function selectDynamicFixtures(show: (floor: FloorKey) => boolean, limit = 18) {
  const byFloor = new Map<FloorKey, typeof CAMPUS.fixtures>()
  for (const fixture of CAMPUS.fixtures) {
    if (!fixture.dynamic || !show(fixture.f)) continue
    const fixtures = byFloor.get(fixture.f)
    if (fixtures) fixtures.push(fixture)
    else byFloor.set(fixture.f, [fixture])
  }
  const selected: typeof CAMPUS.fixtures = []
  const floors = [...byFloor.keys()]
  for (let index = 0; selected.length < limit; index++) {
    let added = false
    for (const floor of floors) {
      const fixture = byFloor.get(floor)?.[index]
      if (!fixture) continue
      selected.push(fixture)
      added = true
      if (selected.length === limit) break
    }
    if (!added) break
  }
  return selected
}

export default function SchoolCampusV4({ visibleFloors, playerRef }: {
  visibleFloors?: FloorKey[]
  playerRef: React.RefObject<PlayerHandle | null>
}) {
  const families = useMemo(() => bakeFamilies(), [])
  const visible = useMemo(() => new Set(visibleFloors), [visibleFloors])
  const show = useCallback((floor: FloorKey) => !visibleFloors || visible.has(floor), [visibleFloors, visible])
  const physicsSolids = useMemo(() => CAMPUS.solids.filter((item) => show(item.f)), [show])
  const solids = useMemo(() => physicsSolids.filter((item) => !item.hide), [physicsSolids])
  const visuals = useMemo(() => CAMPUS.visuals.filter((item) => show(item.f)), [show])
  const plates = useMemo(() => CAMPUS.plates.filter((item) => show(item.f)), [show])
  const cylinders = useMemo(() => CAMPUS.cyls.filter((item) => show(item.f)), [show])
  const fixtures = useMemo<CampusBox[]>(() => CAMPUS.fixtures.filter((item) => show(item.f)).map((item) => ({
    f: item.f, p: item.p, s: [1.8, 0.07, 0.22] as V3, c: item.c, e: 1,
  })), [show])
  const doors = useMemo(() => CAMPUS.doors.filter((item) => show(item.f)), [show])

  const boxGroups = useMemo(() => groupByFamily([...solids, ...visuals]), [solids, visuals])
  const plateGroups = useMemo(() => groupByFamily(plates), [plates])
  const cylinderGroups = useMemo(() => groupByFamily(cylinders), [cylinders])
  const fixtureGroups = useMemo(() => groupByFamily(fixtures), [fixtures])

  const colliders = useMemo(() => physicsSolids.filter(isStructural), [physicsSolids])
  const walkablePlates = useMemo(() => plates.filter((item) => (
    !item.ceil && item.s[0] >= 1.5 && item.s[1] >= 1.5
  )), [plates])
  const dynamicFixtures = useMemo(() => selectDynamicFixtures(show), [show])

  return (
    <group>
      <OriginalElevators visibleFloors={visibleFloors} playerRef={playerRef} />
      <RigidBody type="fixed" colliders={false}>
        {colliders.map((item, index) => (
          <CuboidCollider key={index} args={[item.s[0] / 2, item.s[1] / 2, item.s[2] / 2]} position={item.p} rotation={rotationTuple(item.rot)} />
        ))}
        {walkablePlates.map((item, index) => (
          <CuboidCollider
            key={`plate-${index}`}
            args={[item.s[0] / 2, 0.04, item.s[1] / 2]}
            position={[item.p[0], item.p[1] - 0.04, item.p[2]]}
          />
        ))}
      </RigidBody>
      {[...boxGroups].map(([familyName, items]) => (
        <PBRBoxBatch key={familyName} family={families[familyName] ?? families.paint} items={items} />
      ))}
      {[...plateGroups].map(([familyName, items]) => (
        <PBRPlateBatch key={familyName} family={families[familyName] ?? families.paint} items={items} />
      ))}
      {[...cylinderGroups].map(([familyName, items]) => (
        <PBRCylinderBatch key={familyName} family={families[familyName] ?? families.paint} items={items} />
      ))}
      {[...fixtureGroups].map(([familyName, items]) => (
        <PBRBoxBatch key={`fx-${familyName}`} family={families[familyName] ?? families.paint} items={items} emissive />
      ))}
      <DoorBatch doors={doors} families={families} />
      {dynamicFixtures.map((fixture, index) => (
        <pointLight key={index} position={fixture.p} color={TONE[fixture.tone] ?? fixture.c} intensity={42} distance={11} decay={1.8} />
      ))}
      <mesh position={[0, -0.55, 0]} receiveShadow>
        <boxGeometry args={[MAP_SIZE, 1, MAP_SIZE]} />
        <meshStandardMaterial color="#303a3e" roughness={1} />
      </mesh>
    </group>
  )
}
