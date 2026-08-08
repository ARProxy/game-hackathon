import { memo, useCallback, useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import {
  buildCampus,
  PAL,
  type CampusBox,
  type CampusCylinder,
  type CampusFloor,
  type CampusPlate,
  type CampusRotation,
  type V3,
} from './campusV4Data.js'
import { bakeFamilies, FAMILY_OF_PAL, worldUV, type BakedFamily } from './textures'
import OriginalElevators from './OriginalElevators'
import type { PlayerHandle } from './Player'
import OriginalDoors from './OriginalDoors'

export type FloorKey = CampusFloor

const CAMPUS = buildCampus({ seed: 0 })
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1)
const UNIT_CYLINDER = new THREE.CylinderGeometry(1, 1, 1, 12)
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
  if (hex.toLowerCase() === PAL.glass.toLowerCase() || hex.toLowerCase() === PAL.water.toLowerCase()) return 'glass'
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
function PBRBoxBatch({ items, family, emissive = false, glass = false }: { items: CampusBox[]; family: BakedFamily; emissive?: boolean; glass?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const mat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      map: glass || emissive ? null : family.map,
      normalMap: glass || emissive ? null : family.normalMap,
      roughnessMap: glass || emissive ? null : family.roughnessMap,
      normalScale: new THREE.Vector2(family.nrmScale, family.nrmScale),
      metalness: glass ? 0.1 : emissive ? 0 : family.metalness,
      roughness: glass ? 0.06 : emissive ? 0.35 : 1,
      envMapIntensity: glass ? 2.2 : family.env,
      transparent: glass,
      opacity: glass ? 0.28 : 1,
      emissive: emissive ? '#ffffff' : '#000000',
      emissiveIntensity: emissive ? 1.35 : 0,
    })
    worldUV(m, family.uvScale)
    return m
  }, [family, emissive, glass])

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
    <instancedMesh ref={ref} args={[UNIT_BOX, mat, items.length]} castShadow={!emissive && !glass} receiveShadow />
  )
}

/** PBR 재질 + 인스턴스별 색상 평면 배치 */
function PBRPlateBatch({ items, family, glass = false }: { items: CampusPlate[]; family: BakedFamily; glass?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const mat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      map: glass ? null : family.map,
      normalMap: glass ? null : family.normalMap,
      roughnessMap: glass ? null : family.roughnessMap,
      normalScale: new THREE.Vector2(family.nrmScale, family.nrmScale),
      metalness: glass ? 0.1 : family.metalness,
      roughness: glass ? 0.06 : 1,
      envMapIntensity: glass ? 2.2 : family.env,
      transparent: glass,
      opacity: glass ? 0.28 : 1,
      side: THREE.DoubleSide,
    })
    worldUV(m, family.uvScale)
    return m
  }, [family, glass])

  useEffect(() => {
    if (!ref.current) return
    items.forEach((item, index) => {
      applyMatrix(ref.current!, index, item.p, [item.s[0], 0.05, item.s[1]], item.rot)
      _color.set(item.c)
      ref.current!.setColorAt(index, _color)
    })
    ref.current.instanceMatrix.needsUpdate = true
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true
    ref.current.computeBoundingSphere()
  }, [items])

  return (
    <instancedMesh ref={ref} args={[UNIT_BOX, mat, items.length]} receiveShadow />
  )
}

/** PBR 재질 + 인스턴스별 색상 실린더 배치 */
function PBRCylinderBatch({ items, family, glass = false }: { items: CampusCylinder[]; family: BakedFamily; glass?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const mat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      map: glass ? null : family.map,
      normalMap: glass ? null : family.normalMap,
      roughnessMap: glass ? null : family.roughnessMap,
      normalScale: new THREE.Vector2(family.nrmScale, family.nrmScale),
      metalness: glass ? 0.1 : family.metalness,
      roughness: glass ? 0.06 : 1,
      envMapIntensity: glass ? 2.2 : family.env,
      transparent: glass,
      opacity: glass ? 0.28 : 1,
    })
    worldUV(m, family.uvScale)
    return m
  }, [family, glass])

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
    <instancedMesh ref={ref} args={[UNIT_CYLINDER, mat, items.length]} castShadow={!glass} receiveShadow />
  )
}

// DoorBatch 제거 — OriginalDoors가 인터랙티브 문을 전담한다

/** 재질군별 그룹핑 — 같은 재질군은 같은 InstancedMesh로 배칭 */
function groupByMaterial<T extends { c: string; e?: number }>(items: T[]) {
  const groups = new Map<string, { family: string; emissive: boolean; items: T[] }>()
  for (const item of items) {
    const family = familyFor(item.c)
    const emissive = Boolean(item.e)
    const key = `${family}|${emissive ? 'emissive' : 'surface'}`
    const group = groups.get(key)
    if (group) group.items.push(item)
    else groups.set(key, { family, emissive, items: [item] })
  }
  return groups
}

/** 큰 구조물만 물리 충돌체로 만들고 작은 장식은 시각 전용으로 유지한다. */
function isStructural(item: CampusBox) {
  const [x, y, z] = item.s
  if (item.forceCollider) return true
  if (item.hide && item.ramp) return true
  const isWalkableSlab = y <= 0.75 && x >= 2 && z >= 2
  const isWall = y >= 1.75 && (x >= 1.5 || z >= 1.5)
  return isWalkableSlab || isWall
}

/**
 * ZIP 원본은 fixtures를 메시로 그리지 않고 카메라 주변 16개 PointLight의
 * 재배치 후보로만 사용한다. 0.2초마다 가까운 조명을 골라 원본 조도 계약을
 * 그대로 유지한다.
 */
function DynamicFixtureLights({ fixtures }: { fixtures: typeof CAMPUS.fixtures }) {
  const { camera } = useThree()
  const refs = useRef<(THREE.PointLight | null)[]>([])
  const elapsed = useRef(0)

  useFrame((_, delta) => {
    elapsed.current += delta
    if (elapsed.current < 0.2) return
    elapsed.current = 0

    const candidates = fixtures
      .map((fixture) => ({ fixture, distance: camera.position.distanceToSquared(_position.set(...fixture.p)) }))
      .filter((candidate) => candidate.distance < 4900)
      .sort((a, b) => a.distance - b.distance)

    refs.current.forEach((light, index) => {
      if (!light) return
      const candidate = candidates[index]
      if (!candidate) {
        light.visible = false
        return
      }
      light.visible = true
      light.color.set(candidate.fixture.c)
      light.position.set(...candidate.fixture.p)
      light.intensity = 1.5
    })
  })

  return <>
    {Array.from({ length: 16 }, (_, index) => (
      <pointLight
        key={index}
        ref={(light) => { refs.current[index] = light }}
        visible={false}
        intensity={1.5}
        distance={13}
        decay={2}
      />
    ))}
  </>
}

function SchoolCampusV4({ visibleFloors, playerRef }: {
  visibleFloors?: FloorKey[]
  playerRef: React.RefObject<PlayerHandle | null>
}) {
  const families = useMemo(() => bakeFamilies(), [])
  const visible = useMemo(() => new Set(visibleFloors), [visibleFloors])
  const show = useCallback((floor: FloorKey) => !visibleFloors || visible.has(floor), [visibleFloors, visible])
  // 층 필터는 비교용 시각 계약이다. Rapier collider 배열은 모드/키 입력과 무관하게 고정한다.
  const physicsSolids = useMemo(() => CAMPUS.solids, [])
  const solids = useMemo(() => CAMPUS.solids.filter((item) => show(item.f) && !item.hide), [show])
  const visuals = useMemo(() => CAMPUS.visuals.filter((item) => show(item.f)), [show])
  const plates = useMemo(() => CAMPUS.plates.filter((item) => show(item.f)), [show])
  const cylinders = useMemo(() => CAMPUS.cyls.filter((item) => show(item.f)), [show])
  const fixtures = useMemo(() => CAMPUS.fixtures.filter((item) => show(item.f)), [show])
  const boxGroups = useMemo(() => groupByMaterial([...solids, ...visuals]), [solids, visuals])
  const plateGroups = useMemo(() => groupByMaterial(plates), [plates])
  const cylinderGroups = useMemo(() => groupByMaterial(cylinders), [cylinders])

  const colliders = useMemo(() => physicsSolids.filter(isStructural), [physicsSolids])
  const walkablePlates = useMemo(() => CAMPUS.plates.filter((item) => (
    !item.ceil && item.s[0] >= 1.5 && item.s[1] >= 1.5
  )), [])

  return (
    <group>
      <OriginalElevators visibleFloors={visibleFloors} playerRef={playerRef} />
      <OriginalDoors visibleFloors={visibleFloors} playerRef={playerRef} />
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
      {[...boxGroups].map(([key, group]) => (
        <PBRBoxBatch key={key} family={families[group.family] ?? families.paint} items={group.items} emissive={group.emissive} glass={group.family === 'glass'} />
      ))}
      {[...plateGroups].map(([key, group]) => (
        <PBRPlateBatch key={key} family={families[group.family] ?? families.paint} items={group.items} glass={group.family === 'glass'} />
      ))}
      {[...cylinderGroups].map(([key, group]) => (
        <PBRCylinderBatch key={key} family={families[group.family] ?? families.paint} items={group.items} glass={group.family === 'glass'} />
      ))}
      {/* 문은 OriginalDoors가 인터랙티브로 렌더링한다 */}
      <DynamicFixtureLights fixtures={fixtures} />
    </group>
  )
}

// 플레이어의 10Hz 서버 좌표 동기화가 11,000개 학교 형상을 다시 reconcile하지 않게 한다.
export default memo(SchoolCampusV4)
