/** 실제 월드 좌표를 화면 가장자리 위협 피드백으로 변환한다. */

import { useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useGameStore } from '../stores/gameStore'
import { useSettingsStore } from '../stores/settingsStore'

const THREAT_RANGE = 18
const rootStyle = document.documentElement.style
const _playerPosition = new THREE.Vector3()

function clearThreatFeedback() {
  rootStyle.setProperty('--threat-opacity', '0')
  rootStyle.setProperty('--threat-left', '0')
  rootStyle.setProperty('--threat-right', '0')
  rootStyle.setProperty('--threat-pulse-seconds', '1.5s')
  rootStyle.setProperty('--threat-animation', 'threat-pulse 1.5s ease-in-out infinite')
}

export default function ThreatFeedback({
  playerRef,
  enabled,
}: {
  playerRef: React.RefObject<THREE.Group | null>
  enabled: boolean
}) {
  const reducedFlashes = useSettingsStore((state) => state.reducedFlashes)
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

    const playerPosition = player.getWorldPosition(_playerPosition)
    const dx = intent.seekerPosition.x - playerPosition.x
    const dz = intent.seekerPosition.z - playerPosition.z
    const distance = Math.hypot(dx, dz)
    const proximity = THREE.MathUtils.clamp(1 - distance / THREAT_RANGE, 0, 1)
    const detected = intent.state === 'DETECTED' || intent.state === 'CHASE'
    const intensity = Math.max(proximity, detected ? 0.62 : 0)
    const rightX = Math.cos(player.rotation.y)
    const rightZ = -Math.sin(player.rotation.y)
    const pan = distance > 0.001
      ? THREE.MathUtils.clamp((dx * rightX + dz * rightZ) / distance, -1, 1)
      : 0

    rootStyle.setProperty('--threat-opacity', (intensity * (reducedFlashes ? 0.48 : 1)).toFixed(3))
    rootStyle.setProperty('--threat-left', (intensity * Math.max(0, -pan)).toFixed(3))
    rootStyle.setProperty('--threat-right', (intensity * Math.max(0, pan)).toFixed(3))
    const pulseSeconds = `${THREE.MathUtils.lerp(1.5, 0.38, intensity).toFixed(2)}s`
    rootStyle.setProperty('--threat-pulse-seconds', pulseSeconds)
    rootStyle.setProperty('--threat-animation', reducedFlashes ? 'none' : `threat-pulse ${pulseSeconds} ease-in-out infinite`)
  })

  return null
}
