/**
 * 미션 프롭 렌더링
 * - 제거된 프롭은 렌더링에서 제외
 */

import { useGameStore, type PropData } from '../stores/gameStore'

function PropMesh({ prop }: { prop: PropData }) {
  const s = prop.scale

  return (
    <group position={[prop.position.x, 0, prop.position.z]}>
      <mesh position={[0, s * 1.2, 0]}>
        {prop.mesh === 'box' && <boxGeometry args={[s, s, s]} />}
        {prop.mesh === 'sphere' && <sphereGeometry args={[s * 0.6, 12, 12]} />}
        {prop.mesh === 'cylinder' && <cylinderGeometry args={[s * 0.3, s * 0.3, s, 12]} />}
        {prop.mesh === 'disc' && <cylinderGeometry args={[s * 0.5, s * 0.5, s * 0.15, 12]} />}
        {prop.mesh === 'cup' && <cylinderGeometry args={[s * 0.25, s * 0.3, s * 0.8, 12]} />}
        {prop.mesh === 'coin' && <cylinderGeometry args={[s * 0.4, s * 0.4, s * 0.1, 16]} />}
        {prop.mesh === 'pin' && <cylinderGeometry args={[s * 0.05, s * 0.05, s * 0.8, 8]} />}
        {prop.mesh === 'key' && <boxGeometry args={[s * 0.3, s * 0.15, s * 0.8]} />}
        {prop.mesh === 'clock' && <cylinderGeometry args={[s * 0.5, s * 0.5, s * 0.12, 16]} />}
        {prop.mesh === 'umbrella' && <coneGeometry args={[s * 0.6, s * 0.4, 8]} />}
        <meshStandardMaterial color={prop.color} emissive={prop.color} emissiveIntensity={0.3} />
      </mesh>

      <pointLight position={[0, s * 1.5, 0]} intensity={1.5} distance={4} color={prop.color} />

      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[s * 0.5, s * 0.7, 16]} />
        <meshBasicMaterial color={prop.color} transparent opacity={0.3} />
      </mesh>
    </group>
  )
}

export default function Props() {
  const props = useGameStore((s) => s.props)
  const phase = useGameStore((s) => s.phase)
  const removedPropIds = useGameStore((s) => s.removedPropIds)

  if (phase !== 'playing' || props.length === 0) return null

  const visibleProps = props.filter((p) => !removedPropIds.includes(p.prop_id))

  return (
    <group>
      {visibleProps.map((prop) => (
        <PropMesh key={`${prop.prop_id}-${prop.position.x}-${prop.position.z}`} prop={prop} />
      ))}
    </group>
  )
}
