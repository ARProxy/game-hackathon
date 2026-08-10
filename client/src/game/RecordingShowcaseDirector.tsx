import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'
import { sendGameMessage } from '../hooks/useWebSocket'
import { useGameStore } from '../stores/gameStore'
import type { PlayerHandle } from './Player'

type Point = { x: number; z: number }

const PATH: Array<{ at: number; point: Point }> = [
  { at: 0, point: { x: -28, z: -38.35 } },
  { at: 1.5, point: { x: -28, z: -38.35 } },
  { at: 3.2, point: { x: -28, z: -44.75 } },
  { at: 7.2, point: { x: -28, z: -38.25 } },
  { at: 10.5, point: { x: -37.2, z: -38.0 } },
  { at: 14.0, point: { x: -38.0, z: -28.0 } },
  { at: 18.0, point: { x: -38.0, z: -18.4 } },
  { at: 22.0, point: { x: -24.0, z: -18.4 } },
  { at: 27.0, point: { x: -10.5, z: -18.4 } },
  { at: 32.0, point: { x: -10.5, z: -28.0 } },
]
const _showcasePosition = new THREE.Vector3()

function targetAt(elapsed: number): Point {
  let segment = PATH[PATH.length - 1]
  for (let index = 1; index < PATH.length; index += 1) {
    if (elapsed <= PATH[index].at) {
      const start = PATH[index - 1]
      const end = PATH[index]
      const progress = Math.max(0, Math.min(1, (elapsed - start.at) / (end.at - start.at)))
      return {
        x: start.point.x + (end.point.x - start.point.x) * progress,
        z: start.point.z + (end.point.z - start.point.z) * progress,
      }
    }
  }
  return segment.point
}

export default function RecordingShowcaseDirector({ playerRef }: {
  playerRef: React.RefObject<PlayerHandle | null>
}) {
  const startedAt = useRef<number | null>(null)
  const openedDoor = useRef(false)
  const activatedConsole = useRef(false)
  const spokeMission = useRef(false)
  const luredHunter = useRef(false)

  useFrame(({ clock }, delta) => {
    const store = useGameStore.getState()
    const player = store.players[store.playerId]
    if (store.phase !== 'playing' || store.verticalProgression?.phase !== 'floor_3' || player?.position.floor !== 'F3') {
      return
    }
    if (startedAt.current === null) startedAt.current = clock.elapsedTime
    const elapsed = clock.elapsedTime - startedAt.current
    const group = playerRef.current?.getGroup()
    if (!group) return

    if (elapsed >= 1.1 && !openedDoor.current) {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }))
      openedDoor.current = true
    }
    if (elapsed >= 4.0 && !activatedConsole.current) {
      sendGameMessage({ type: 'action', payload: { action_type: 'interact_stage_mission' } })
      activatedConsole.current = true
    }
    if (elapsed >= 5.4 && !spokeMission.current) {
      sendGameMessage({
        type: 'speech',
        payload: {
          transcript: '반짝이는 작은 물건으로 잠긴 출입구를 열어',
          is_final: true,
        },
      })
      spokeMission.current = true
    }
    if (elapsed >= 11.0 && !luredHunter.current) {
      sendGameMessage({
        type: 'speech',
        payload: { transcript: '술래가 이쪽으로 온다, 서쪽으로 돌아가자', is_final: true },
      })
      luredHunter.current = true
    }

    const destination = targetAt(elapsed)
    group.getWorldPosition(_showcasePosition)
    const dx = destination.x - _showcasePosition.x
    const dz = destination.z - _showcasePosition.z
    const distance = Math.hypot(dx, dz)
    if (distance > 0.02) {
      const step = Math.min(distance, 3.7 * delta)
      const targetRotation = Math.atan2(dx, dz)
      const rotationDelta = THREE.MathUtils.euclideanModulo(
        targetRotation - group.rotation.y + Math.PI,
        Math.PI * 2,
      ) - Math.PI
      group.rotation.y += rotationDelta * (1 - Math.exp(-12 * delta))
      playerRef.current?.moveBy(dx / distance * step, 0, dz / distance * step)
    }
  })

  return null
}
