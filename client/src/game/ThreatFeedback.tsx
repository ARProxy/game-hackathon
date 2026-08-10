/** 실제 월드 좌표를 화면 가장자리 위협 피드백으로 변환한다. */

import { useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useGameStore, type HunterIntent } from '../stores/gameStore'
import { useSettingsStore } from '../stores/settingsStore'

const NEAR_THREAT_RANGE = 8.5
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
    const playerState = store.players[store.playerId]
    const active = store.phase === 'playing' || store.phase === 'final_spell' || store.phase === 'escape'
    if (!enabled || !active || !player || !playerState) {
      clearThreatFeedback()
      return
    }

    const playerPosition = player.getWorldPosition(_playerPosition)
    const finalPhase = store.verticalProgression?.phase === 'field_final'
      || store.verticalProgression?.phase === 'basement_final'
      || store.verticalProgression?.phase === 'escape_open'
    const threats = [
      { intent: store.hunterIntent, seekerId: 'seeker', role: 'chaser' },
      { intent: store.secondaryHunterIntent, seekerId: 'seeker-2', role: 'blocker' },
    ].flatMap(({ intent, seekerId, role }) => {
      if (!intent || store.players[seekerId]?.position.floor !== playerState.position.floor) return []
      const dx = intent.seekerPosition.x - playerPosition.x
      const dz = intent.seekerPosition.z - playerPosition.z
      const distance = Math.hypot(dx, dz)
      const proximity = THREE.MathUtils.clamp(1 - distance / NEAR_THREAT_RANGE, 0, 1)
      const detected = (
        (intent.state === 'DETECTED' || intent.state === 'CHASE')
        && intent.targetId === store.playerId
      )
      // 차단자는 일반 1층에서 먼 거리의 붉은 화면을 만들지 않는다. 차가운
      // 탐조등과 정적으로 먼저 드러나며, 가까워졌을 때만 공통 위험 비네트가 켜진다.
      const detectedFloor = detected && (role === 'chaser' || finalPhase) ? 0.72 : 0
      return [{ intent, dx, dz, distance, intensity: Math.max(proximity, detectedFloor) }]
    }) as Array<{ intent: HunterIntent; dx: number; dz: number; distance: number; intensity: number }>
    const threat = threats.sort((a, b) => b.intensity - a.intensity)[0]
    if (!threat || threat.intensity <= 0) {
      clearThreatFeedback()
      return
    }
    const { dx, dz, distance, intensity } = threat
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
