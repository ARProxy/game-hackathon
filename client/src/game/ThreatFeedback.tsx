/** 실제 월드 좌표를 화면 가장자리 위협 피드백으로 변환한다. */

import { useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useGameStore } from '../stores/gameStore'

const THREAT_RANGE = 18
const rootStyle = document.documentElement.style

function clearThreatFeedback() {
  rootStyle.setProperty('--threat-opacity', '0')
  rootStyle.setProperty('--threat-left', '0')
  rootStyle.setProperty('--threat-right', '0')
  rootStyle.setProperty('--threat-pulse-seconds', '1.5s')
}

export default function ThreatFeedback({
  playerRef,
  enabled,
}: {
  playerRef: React.RefObject<THREE.Group | null>
  enabled: boolean
}) {
  useEffect(() => clearThreatFeedback, [])

  useFrame(() => {
    const player = playerRef.current
    const store = useGameStore.getState()
    const intent = store.hunterIntent
    const active = store.phase === 'playing' || store.phase === 'final_spell' || store.phase === 'escape'
    if (!enabled || !active || !player || !intent) {
      clearThreatFeedback()
      return
    }

    const dx = intent.seekerPosition.x - player.position.x
    const dz = intent.seekerPosition.z - player.position.z
    const distance = Math.hypot(dx, dz)
    const proximity = THREE.MathUtils.clamp(1 - distance / THREAT_RANGE, 0, 1)
    const detected = intent.state === 'DETECTED' || intent.state === 'CHASE'
    const intensity = Math.max(proximity, detected ? 0.62 : 0)
    const rightX = Math.cos(player.rotation.y)
    const rightZ = -Math.sin(player.rotation.y)
    const pan = distance > 0.001
      ? THREE.MathUtils.clamp((dx * rightX + dz * rightZ) / distance, -1, 1)
      : 0

    rootStyle.setProperty('--threat-opacity', intensity.toFixed(3))
    rootStyle.setProperty('--threat-left', (intensity * Math.max(0, -pan)).toFixed(3))
    rootStyle.setProperty('--threat-right', (intensity * Math.max(0, pan)).toFixed(3))
    rootStyle.setProperty('--threat-pulse-seconds', `${THREE.MathUtils.lerp(1.5, 0.38, intensity).toFixed(2)}s`)
  })

  return null
}
