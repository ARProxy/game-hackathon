/** Claude Design ZIP의 elevator.js 리그를 원형 그대로 R3F 장면에 탑재한다. */
import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
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
        for (const door of rig.landing[floor] ?? []) {
          door.position.x = door.userData.home + door.userData.sd * open * (rig.PANEL_W - 0.02)
        }
      }
    })
  })

  const promptIndex = insideElevator ?? nearElevator
  const promptElevator = promptIndex === null ? null : EVS[promptIndex]
  return <>
    {result.roots.map((rig, index) => <primitive key={EVS[index].id} object={rig.root} />)}
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
