/** Claude Design ZIP의 elevator.js 리그를 원형 그대로 R3F 장면에 탑재한다. */
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { EVS, FLOOR_Y, type CampusFloor } from './campusV4Data.js'
import { buildElevatorRig, elevatorMaterials } from './claudeDesign/elevator.js'

const ORDER = ['B1', 'F1', 'F2', 'F3']
const LABEL: Record<string, string> = { B1: 'B1', F1: '1', F2: '2', F3: '3' }

export default function OriginalElevators({ visibleFloors }: { visibleFloors?: CampusFloor[] }) {
  const result = useMemo(() => {
    const materials = elevatorMaterials(THREE)
    const floorObjects = new Map<string, THREE.Object3D[]>()
    const roots = EVS.map((elevator) => buildElevatorRig(THREE, {
      EV: elevator,
      mat: materials,
      FY: FLOOR_Y,
      order: ORDER,
      label: LABEL,
      onFloor: (floor, object) => {
        const objects = floorObjects.get(floor) ?? []
        objects.push(object)
        floorObjects.set(floor, objects)
      },
      onSolid: () => undefined,
      picks: [],
    }))
    for (const rig of roots) rig.car.position.y = FLOOR_Y.F1
    return { roots, floorObjects }
  }, [])

  useEffect(() => {
    const visible = visibleFloors ? new Set(visibleFloors) : null
    for (const [floor, objects] of result.floorObjects) {
      for (const object of objects) object.visible = !visible || visible.has(floor as CampusFloor)
    }
  }, [result, visibleFloors])

  return <>{result.roots.map((rig, index) => <primitive key={EVS[index].id} object={rig.root} />)}</>
}
