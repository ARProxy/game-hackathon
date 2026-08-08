/** Claude Design ZIP의 elevator.js 리그를 원형 그대로 R3F 장면에 탑재한다. */
import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { EVS, FLOOR_Y, type CampusFloor } from './campusV4Data.js'
import { buildElevatorRig, elevatorMaterials } from './claudeDesign/elevator.js'
import type { PlayerHandle } from './Player'
import { useGameStore } from '../stores/gameStore'
import { sendGameMessage } from '../hooks/useWebSocket'

const ORDER = ['B1', 'F1', 'F2', 'F3']
const LABEL: Record<string, string> = { B1: 'B1', F1: '1', F2: '2', F3: '3' }
type ElevatorMode = 'idle' | 'closing' | 'moving' | 'opening'
type Runtime = {
  at: string
  y: number
  mode: ElevatorMode
  target: string | null
  door: number
  wait: number
  previousY: number
}

export default function OriginalElevators({ visibleFloors, playerRef }: {
  visibleFloors?: CampusFloor[]
  playerRef: React.RefObject<PlayerHandle | null>
}) {
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
  const runtimes = useRef<Runtime[]>(result.roots.map(() => ({
    at: 'F1', y: FLOOR_Y.F1, mode: 'idle', target: null,
    door: 0, wait: 0, previousY: FLOOR_Y.F1,
  })))
  const physicsBodies = useRef(new Map<string, RapierRigidBody>())
  const playerFloor = useGameStore((state) => state.players[state.playerId]?.position.floor)
  const accessibleFloors = useGameStore((state) => state.verticalProgression?.accessible_floors ?? ['F1'])
  const [nearElevator, setNearElevator] = useState<number | null>(null)
  const [insideElevator, setInsideElevator] = useState<number | null>(null)
  const proximityRef = useRef({ near: null as number | null, inside: null as number | null })

  useEffect(() => {
    const visible = visibleFloors ? new Set(visibleFloors) : null
    for (const [floor, objects] of result.floorObjects) {
      for (const object of objects) object.visible = !visible || visible.has(floor as CampusFloor)
    }
  }, [result, visibleFloors])

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.repeat) return
      const { near, inside } = proximityRef.current
      if (event.code === 'KeyE' && near !== null && playerFloor && ORDER.includes(playerFloor)) {
        const runtime = runtimes.current[near]
        if (runtime.mode === 'moving' || runtime.mode === 'closing') return
        event.preventDefault()
        if (runtime.at === playerFloor) {
          runtime.mode = 'opening'
          runtime.wait = 6
        } else {
          runtime.target = playerFloor
          runtime.mode = runtime.door > 0 ? 'closing' : 'moving'
        }
        return
      }
      if (inside === null) return
      const target = ({ Digit0: 'B1', Digit1: 'F1', Digit2: 'F2', Digit3: 'F3' } as Record<string, string>)[event.code]
      if (!target || !accessibleFloors.includes(target)) return
      const runtime = runtimes.current[inside]
      if (runtime.mode === 'moving' || target === runtime.at) return
      event.preventDefault()
      runtime.target = target
      runtime.mode = runtime.door > 0 ? 'closing' : 'moving'
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [accessibleFloors, playerFloor])

  useFrame((_, delta) => {
    const player = playerRef.current?.getGroup()
    let near: number | null = null
    let inside: number | null = null
    if (player && playerFloor && ORDER.includes(playerFloor)) {
      EVS.forEach((elevator, index) => {
        const centerX = (elevator.x[0] + elevator.x[1]) / 2
        const landingZ = elevator.z[1] + 0.7
        if (Math.hypot(player.position.x - centerX, player.position.z - landingZ) <= 2.1) near = index
        if (
          player.position.x > elevator.x[0] && player.position.x < elevator.x[1]
          && player.position.z > elevator.z[0] && player.position.z < elevator.z[1]
          && Math.abs(player.position.y - runtimes.current[index].y) < 1.4
        ) inside = index
      })
    }
    if (near !== proximityRef.current.near) { proximityRef.current.near = near; setNearElevator(near) }
    if (inside !== proximityRef.current.inside) { proximityRef.current.inside = inside; setInsideElevator(inside) }

    runtimes.current.forEach((runtime, index) => {
      const rig = result.roots[index]
      runtime.previousY = runtime.y
      if (runtime.mode === 'closing') {
        runtime.door = Math.max(0, runtime.door - delta * 1.6)
        if (runtime.door <= 0.001) runtime.mode = 'moving'
      } else if (runtime.mode === 'moving' && runtime.target) {
        const targetY = FLOOR_Y[runtime.target as CampusFloor]
        const distance = targetY - runtime.y
        runtime.y += Math.sign(distance) * Math.min(Math.abs(distance), delta * 2.2)
        if (Math.abs(targetY - runtime.y) < 0.01) {
          runtime.y = targetY
          runtime.at = runtime.target
          runtime.target = null
          runtime.mode = 'opening'
          runtime.wait = 6
          sendGameMessage({
            type: 'action',
            payload: { action_type: 'use_elevator', elevator_id: EVS[index].id, target_floor: runtime.at },
          })
        }
      } else if (runtime.mode === 'opening') {
        runtime.door = Math.min(1, runtime.door + delta * 1.6)
        if (runtime.door >= 0.999) { runtime.mode = 'idle'; runtime.wait = 6 }
      } else if (runtime.mode === 'idle' && runtime.door > 0) {
        runtime.wait -= delta
        if (runtime.wait <= 0) runtime.door = Math.max(0, runtime.door - delta * 1.2)
      }
      rig.car.position.y = runtime.y
      if (inside === index && runtime.mode === 'moving') {
        playerRef.current?.moveBy(0, runtime.y - runtime.previousY, 0)
      }
      const slide = runtime.door * (rig.PANEL_W - 0.02)
      for (const door of rig.carDoors) door.m.position.x = door.home + door.sd * slide
      for (const floor of ORDER) {
        const open = floor === runtime.at && runtime.mode !== 'moving' ? runtime.door : 0
        for (const [doorIndex, door] of (rig.landing[floor] ?? []).entries()) {
          door.position.x = door.userData.home + door.userData.sd * open * (rig.PANEL_W - 0.02)
          physicsBodies.current.get(`landing-${index}-${floor}-${doorIndex}`)?.setNextKinematicTranslation({
            x: door.position.x,
            y: FLOOR_Y[floor as CampusFloor] + rig.DOOR_H / 2,
            z: EVS[index].z[1] - 0.03,
          })
        }
      }
      syncCarPhysics(physicsBodies.current, index, EVS[index], rig, runtime.y, slide)
    })
  })

  const promptIndex = insideElevator ?? nearElevator
  const promptElevator = promptIndex === null ? null : EVS[promptIndex]
  return <>
    {result.roots.map((rig, index) => <primitive key={EVS[index].id} object={rig.root} />)}
    {result.roots.map((rig, index) => (
      <ElevatorPhysics
        key={`physics-${EVS[index].id}`}
        index={index}
        rig={rig}
        visibleFloors={visibleFloors}
        bodies={physicsBodies}
      />
    ))}
    {promptElevator && playerFloor && (
      <Html position={[(promptElevator.x[0] + promptElevator.x[1]) / 2, FLOOR_Y[playerFloor as CampusFloor] + 2.4, promptElevator.z[1] + 0.8]} center>
        <div style={{ width: 'max-content', padding: '7px 11px', borderRadius: 7, color: '#ffe1aa', background: 'rgba(8,12,16,.9)', border: '1px solid #b79a68', fontSize: 12, fontWeight: 800 }}>
          {insideElevator !== null
            ? `이동 층 선택 · ${accessibleFloors.map((floor) => LABEL[floor]).join(' / ')}`
            : `E · ${promptElevator.name} 호출`}
        </div>
      </Html>
    )}
  </>
}

type ElevatorRig = ReturnType<typeof buildElevatorRig>

function registerBody(
  bodies: React.RefObject<Map<string, RapierRigidBody>>,
  key: string,
  body: RapierRigidBody | null,
) {
  if (body) bodies.current.set(key, body)
  else bodies.current.delete(key)
}

function ElevatorPhysics({ index, rig, visibleFloors, bodies }: {
  index: number
  rig: ElevatorRig
  visibleFloors?: CampusFloor[]
  bodies: React.RefObject<Map<string, RapierRigidBody>>
}) {
  const elevator = EVS[index]
  const visible = new Set(visibleFloors)
  const centerX = (elevator.x[0] + elevator.x[1]) / 2
  const centerZ = (elevator.z[0] + elevator.z[1]) / 2
  const carWidth = Math.min(elevator.x[1] - elevator.x[0] - 0.42, 2)
  const carDepth = Math.min(elevator.z[1] - elevator.z[0] - 0.95, 1.95)
  const carHalfWidth = carWidth / 2
  const carHalfDepth = carDepth / 2

  return <>
    {ORDER.filter((floor) => !visibleFloors || visible.has(floor as CampusFloor)).flatMap((floor) => (
      [-1, 1].map((side, doorIndex) => (
        <RigidBody
          key={`${floor}-${side}`}
          ref={(body) => registerBody(bodies, `landing-${index}-${floor}-${doorIndex}`, body)}
          type="kinematicPosition"
          colliders={false}
          position={[
            centerX + side * rig.PANEL_W / 2,
            FLOOR_Y[floor as CampusFloor] + rig.DOOR_H / 2,
            elevator.z[1] - 0.03,
          ]}
        >
          <CuboidCollider args={[rig.PANEL_W / 2, rig.DOOR_H / 2, 0.023]} />
        </RigidBody>
      ))
    ))}
    <RigidBody ref={(body) => registerBody(bodies, `car-floor-${index}`, body)} type="kinematicPosition" colliders={false} position={[centerX, FLOOR_Y.F1 + 0.04, centerZ]}>
      <CuboidCollider args={[carHalfWidth, 0.04, carHalfDepth]} />
    </RigidBody>
    <RigidBody ref={(body) => registerBody(bodies, `car-back-${index}`, body)} type="kinematicPosition" colliders={false} position={[centerX, FLOOR_Y.F1 + rig.CAR_H / 2, centerZ - carHalfDepth + 0.02]}>
      <CuboidCollider args={[carHalfWidth, rig.CAR_H / 2, 0.02]} />
    </RigidBody>
    {[-1, 1].map((side) => (
      <RigidBody key={`side-${side}`} ref={(body) => registerBody(bodies, `car-side-${index}-${side}`, body)} type="kinematicPosition" colliders={false} position={[centerX + side * (carHalfWidth - 0.02), FLOOR_Y.F1 + rig.CAR_H / 2, centerZ]}>
        <CuboidCollider args={[0.02, rig.CAR_H / 2, carHalfDepth]} />
      </RigidBody>
    ))}
    {[-1, 1].map((side, doorIndex) => (
      <RigidBody key={`door-${side}`} ref={(body) => registerBody(bodies, `car-door-${index}-${doorIndex}`, body)} type="kinematicPosition" colliders={false} position={[centerX + side * rig.PANEL_W / 2, FLOOR_Y.F1 + rig.DOOR_H / 2, centerZ + carHalfDepth - 0.03]}>
        <CuboidCollider args={[rig.PANEL_W / 2, rig.DOOR_H / 2, 0.023]} />
      </RigidBody>
    ))}
  </>
}

function syncCarPhysics(
  bodies: Map<string, RapierRigidBody>,
  index: number,
  elevator: (typeof EVS)[number],
  rig: ElevatorRig,
  y: number,
  slide: number,
) {
  const centerX = (elevator.x[0] + elevator.x[1]) / 2
  const centerZ = (elevator.z[0] + elevator.z[1]) / 2
  const carWidth = Math.min(elevator.x[1] - elevator.x[0] - 0.42, 2)
  const carDepth = Math.min(elevator.z[1] - elevator.z[0] - 0.95, 1.95)
  const halfWidth = carWidth / 2
  const halfDepth = carDepth / 2
  bodies.get(`car-floor-${index}`)?.setNextKinematicTranslation({ x: centerX, y: y + 0.04, z: centerZ })
  bodies.get(`car-back-${index}`)?.setNextKinematicTranslation({ x: centerX, y: y + rig.CAR_H / 2, z: centerZ - halfDepth + 0.02 })
  for (const side of [-1, 1]) {
    bodies.get(`car-side-${index}-${side}`)?.setNextKinematicTranslation({ x: centerX + side * (halfWidth - 0.02), y: y + rig.CAR_H / 2, z: centerZ })
  }
  for (const [doorIndex, side] of [-1, 1].entries()) {
    bodies.get(`car-door-${index}-${doorIndex}`)?.setNextKinematicTranslation({
      x: centerX + side * (rig.PANEL_W / 2 + slide),
      y: y + rig.DOOR_H / 2,
      z: centerZ + halfDepth - 0.03,
    })
  }
}
