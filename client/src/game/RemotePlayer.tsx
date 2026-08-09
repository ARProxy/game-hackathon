import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { CharacterModel } from './Characters'
import { useGameStore } from '../stores/gameStore'

const _remoteTarget = new THREE.Vector3()

export default function RemotePlayer({ playerId, characterId }: { playerId: string; characterId: string }) {
  const groupRef = useRef<THREE.Group>(null)
  const movementRef = useRef(0)
  const lastPosition = useRef(new THREE.Vector3())
  const initialized = useRef(false)

  useFrame((_, delta) => {
    const group = groupRef.current
    const player = useGameStore.getState().players[playerId]
    if (!group || !player) return
    _remoteTarget.set(player.position.x, player.position.y ?? 0, player.position.z)
    if (!initialized.current) {
      group.position.copy(_remoteTarget)
      lastPosition.current.copy(_remoteTarget)
      initialized.current = true
      return
    }
    const dx = _remoteTarget.x - group.position.x
    const dz = _remoteTarget.z - group.position.z
    const distance = Math.hypot(dx, dz)
    const syncSpeed = distance > 3 ? 30 : 12
    group.position.lerp(_remoteTarget, 1 - Math.exp(-syncSpeed * delta))
    movementRef.current = THREE.MathUtils.damp(
      movementRef.current,
      THREE.MathUtils.clamp(distance / Math.max(0.01, delta * 5), 0, 1),
      10,
      delta,
    )
    if (distance > 0.015) {
      const targetRotation = Math.atan2(dx, dz)
      const difference = THREE.MathUtils.euclideanModulo(
        targetRotation - group.rotation.y + Math.PI,
        Math.PI * 2,
      ) - Math.PI
      group.rotation.y += difference * (1 - Math.exp(-14 * delta))
    }
    lastPosition.current.copy(group.position)
  })

  const frozen = useGameStore((state) => state.players[playerId]?.status === 'frozen')
  const visible = useGameStore((state) => {
    const status = state.players[playerId]?.status
    return status !== 'eliminated' && status !== 'escaped'
  })

  return (
    <group ref={groupRef} visible={visible}>
      <CharacterModel id={characterId} frozen={frozen} movementRef={movementRef} />
    </group>
  )
}
