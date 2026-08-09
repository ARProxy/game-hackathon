import { memo, useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import {
  COMPACT_PALETTE,
  COMPACT_SCHOOL,
  type CompactBox,
  type CompactCylinder,
  type CompactFloor,
  type CompactFixture,
  type V3,
} from './compactSchoolData.js'
import { bakeFamilies, FAMILY_OF_PAL, worldUV, type BakedFamily } from './textures'
import type { PlayerHandle } from './Player'
import CompactDoors from './CompactDoors'

export type FloorKey = CompactFloor

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1)
const UNIT_CYLINDER = new THREE.CylinderGeometry(1, 1, 1, 16)
const matrix = new THREE.Matrix4()
const _position = new THREE.Vector3()
const _rotation = new THREE.Euler()
const _quaternion = new THREE.Quaternion()
const _scale = new THREE.Vector3()
const _color = new THREE.Color()

function applyMatrix(ref: THREE.InstancedMesh, index: number, p: V3, s: V3, rot?: V3) {
  _position.set(...p)
  _scale.set(...s)
  if (rot) {
    _rotation.set(...rot)
    _quaternion.setFromEuler(_rotation)
  } else _quaternion.identity()
  matrix.compose(_position, _quaternion, _scale)
  ref.setMatrixAt(index, matrix)
}

function familyFor(material: string): string {
  return FAMILY_OF_PAL[material] ?? 'paint'
}

function PBRBoxBatch({ items, family, emissive = false, glass = false, surfaceOffset = false }: {
  items: CompactBox[]
  family: BakedFamily
  emissive?: boolean
  glass?: boolean
  surfaceOffset?: boolean
}) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const mat = useMemo(() => {
    const material = new THREE.MeshStandardMaterial({
      map: glass || emissive ? null : family.map,
      normalMap: glass || emissive ? null : family.normalMap,
      roughnessMap: glass || emissive ? null : family.roughnessMap,
      normalScale: new THREE.Vector2(family.nrmScale, family.nrmScale),
      metalness: glass ? 0.12 : emissive ? 0 : family.metalness,
      roughness: glass ? 0.12 : emissive ? 0.32 : 1,
      envMapIntensity: glass ? 1.8 : family.env,
      transparent: glass,
      opacity: glass ? 0.32 : 1,
      emissive: emissive ? '#ffffff' : '#000000',
      emissiveIntensity: emissive ? 1.15 : 0,
      polygonOffset: surfaceOffset,
      polygonOffsetFactor: surfaceOffset ? -1 : 0,
      polygonOffsetUnits: surfaceOffset ? -1 : 0,
    })
    worldUV(material, family.uvScale)
    return material
  }, [family, emissive, glass, surfaceOffset])

  useEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    items.forEach((item, index) => {
      applyMatrix(mesh, index, item.p, item.s, item.rot)
      _color.set(item.c)
      mesh.setColorAt(index, _color)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [items])

  return <instancedMesh
    ref={ref}
    args={[UNIT_BOX, mat, items.length]}
    castShadow={!emissive && !glass && items.length < 450}
    receiveShadow
  />
}

function PBRCylinderBatch({ items, family }: { items: CompactCylinder[]; family: BakedFamily }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const mat = useMemo(() => {
    const material = new THREE.MeshStandardMaterial({
      map: family.map,
      normalMap: family.normalMap,
      roughnessMap: family.roughnessMap,
      normalScale: new THREE.Vector2(family.nrmScale, family.nrmScale),
      metalness: family.metalness,
      roughness: 1,
      envMapIntensity: family.env,
    })
    worldUV(material, family.uvScale)
    return material
  }, [family])

  useEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    items.forEach((item, index) => {
      applyMatrix(mesh, index, item.p, [item.r, item.h, item.r], item.rot)
      _color.set(item.c)
      mesh.setColorAt(index, _color)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [items])

  return <instancedMesh ref={ref} args={[UNIT_CYLINDER, mat, items.length]} castShadow receiveShadow />
}

const SURFACE_OFFSET_ROLES = new Set([
  'roomFinish', 'floorMarking', 'roofJoint', 'servicePad', 'safetyMarking',
  'fieldLine', 'fieldInlay', 'courtyardMarking',
])

function groupBoxes(items: CompactBox[]) {
  const groups = new Map<string, { family: string; emissive: boolean; glass: boolean; surfaceOffset: boolean; items: CompactBox[] }>()
  for (const item of items) {
    const family = familyFor(item.material)
    const glass = item.role === 'window'
    const emissive = Boolean(item.emissive)
    const surfaceOffset = SURFACE_OFFSET_ROLES.has(item.role)
    const key = `${family}|${glass ? 'glass' : emissive ? 'emissive' : surfaceOffset ? 'offset' : 'surface'}`
    const group = groups.get(key)
    if (group) group.items.push(item)
    else groups.set(key, { family, glass, emissive, surfaceOffset, items: [item] })
  }
  return groups
}

function groupCylinders(items: CompactCylinder[]) {
  const groups = new Map<string, { family: string; items: CompactCylinder[] }>()
  for (const item of items) {
    const family = familyFor(item.material)
    const group = groups.get(family)
    if (group) group.items.push(item)
    else groups.set(family, { family, items: [item] })
  }
  return groups
}

function DynamicFixtureLights({ fixtures }: { fixtures: CompactFixture[] }) {
  const { camera } = useThree()
  const refs = useRef<(THREE.PointLight | null)[]>([])
  const elapsed = useRef(0)

  useFrame((_, delta) => {
    elapsed.current += delta
    if (elapsed.current < 0.25) return
    elapsed.current = 0
    const candidates = fixtures
      .map((fixture) => ({ fixture, distance: camera.position.distanceToSquared(_position.set(...fixture.p)) }))
      .filter((candidate) => candidate.distance < 2500)
      .sort((a, b) => a.distance - b.distance)
    refs.current.forEach((light, index) => {
      if (!light) return
      const candidate = candidates[index]
      light.visible = Boolean(candidate)
      if (!candidate) return
      light.color.set(candidate.fixture.c)
      light.position.set(...candidate.fixture.p)
      light.intensity = candidate.fixture.f === 'ROOF' ? 2.1 : 1.35
    })
  })

  return <>
    {Array.from({ length: 14 }, (_, index) => (
      <pointLight
        key={index}
        ref={(light) => { refs.current[index] = light }}
        visible={false}
        intensity={1.35}
        distance={11}
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
  const visibleData = useMemo(() => {
    const visible = visibleFloors ? new Set(visibleFloors) : null
    const show = (floor: FloorKey) => !visible || visible.has(floor) || floor === 'OUT'
    return {
      boxes: COMPACT_SCHOOL.boxes.filter((item) => item.visible && show(item.f)),
      cylinders: COMPACT_SCHOOL.cylinders.filter((item) => item.visible && show(item.f)),
      fixtures: COMPACT_SCHOOL.fixtures.filter((item) => show(item.f)),
    }
  }, [visibleFloors])
  const visualBoxes = visibleData.boxes
  const visualCylinders = visibleData.cylinders
  const fixtures = visibleData.fixtures
  const boxGroups = useMemo(() => groupBoxes(visualBoxes), [visualBoxes])
  const cylinderGroups = useMemo(() => groupCylinders(visualCylinders), [visualCylinders])
  const boxColliders = useMemo(() => COMPACT_SCHOOL.boxes.filter((item) => item.collider), [])
  const cylinderColliders = useMemo(() => COMPACT_SCHOOL.cylinders.filter((item) => item.collider), [])

  return (
    <group>
      <CompactDoors visibleFloors={visibleFloors} playerRef={playerRef} />
      <RigidBody type="fixed" colliders={false}>
        {boxColliders.map((item) => (
          <CuboidCollider
            key={item.id}
            args={[item.s[0] / 2, item.s[1] / 2, item.s[2] / 2]}
            position={item.p}
            rotation={item.rot}
          />
        ))}
        {cylinderColliders.map((item) => (
          <CylinderCollider
            key={item.id}
            args={[item.h / 2, item.r]}
            position={item.p}
            rotation={item.rot}
          />
        ))}
      </RigidBody>
      {[...boxGroups].map(([key, group]) => (
        <PBRBoxBatch
          key={key}
          family={families[group.family] ?? families.paint}
          items={group.items}
          emissive={group.emissive}
          glass={group.glass}
          surfaceOffset={group.surfaceOffset}
        />
      ))}
      {[...cylinderGroups].map(([key, group]) => (
        <PBRCylinderBatch key={key} family={families[group.family] ?? families.paint} items={group.items} />
      ))}
      <DynamicFixtureLights fixtures={fixtures} />
    </group>
  )
}

// 새 골조에서는 역할 토큰이 없는 raw 색을 쓰지 않는다. 이 참조는 번들러가
// 팔레트 계약을 트리셰이킹하며 누락시키지 않도록 유지한다.
void COMPACT_PALETTE

export default memo(SchoolCampusV4)
