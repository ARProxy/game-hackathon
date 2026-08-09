/**
 * 3인칭 카메라
 * - 플레이어 뒤에서 따라감
 * - 마우스 움직임으로 좌우/상하 시점 회전
 * - 포인터 잠금(Pointer Lock)으로 마우스 캡처
 */

import { useRef, useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useRapier } from '@react-three/rapier'
import * as THREE from 'three'
import { useSettingsStore } from '../stores/settingsStore'

const DISTANCE = 4        // 플레이어와의 거리 (가깝게)
const HEIGHT = 1.8        // 카메라 높이 (어깨 높이)
const BASE_SENSITIVITY = 0.002 // 마우스 감도
const FOLLOW_SPEED = 14
const ARM_EXTEND_SPEED = 10
const ARM_RETRACT_SPEED = 32
const WALL_PADDING = 0.18
const MIN_DISTANCE = 0.55
const _targetPosition = new THREE.Vector3()
const _lookTarget = new THREE.Vector3()
const _desiredPosition = new THREE.Vector3()
const _cameraOffset = new THREE.Vector3()

interface ThirdPersonCameraProps {
  targetRef: React.RefObject<THREE.Group | null>
  enabled: boolean
}

export default function ThirdPersonCamera({ targetRef, enabled }: ThirdPersonCameraProps) {
  const { camera, gl } = useThree()
  const { world, rapier } = useRapier()
  const yaw = useRef(0)    // 좌우 회전
  const pitch = useRef(0.15) // 상하 회전 (거의 수평)
  const isLocked = useRef(false)
  const armDistance = useRef<number | null>(null)
  const sensitivity = useSettingsStore((state) => state.mouseSensitivity)
  const invertY = useSettingsStore((state) => state.invertY)
  const collisionRay = useMemo(() => new rapier.Ray(
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 0, z: 1 },
  ), [rapier])

  // 포인터 잠금 + 마우스 이동
  useEffect(() => {
    if (!enabled) return

    const canvas = gl.domElement

    const onClick = () => {
      canvas.requestPointerLock()
    }

    const onLockChange = () => {
      isLocked.current = document.pointerLockElement === canvas
    }

    const onMouseMove = (e: MouseEvent) => {
      if (!isLocked.current) return
      yaw.current -= e.movementX * BASE_SENSITIVITY * sensitivity
      pitch.current = THREE.MathUtils.clamp(
        pitch.current - e.movementY * BASE_SENSITIVITY * sensitivity * (invertY ? -1 : 1),
        -0.2,  // 약간 올려다보기 허용
        0.6,   // 최대 각도 제한 (위층 관통 방지)
      )
    }

    canvas.addEventListener('click', onClick)
    document.addEventListener('pointerlockchange', onLockChange)
    document.addEventListener('mousemove', onMouseMove)

    return () => {
      canvas.removeEventListener('click', onClick)
      document.removeEventListener('pointerlockchange', onLockChange)
      document.removeEventListener('mousemove', onMouseMove)
      if (document.pointerLockElement === canvas) {
        document.exitPointerLock()
      }
    }
  }, [enabled, gl.domElement, invertY, sensitivity])

  useFrame((_, delta) => {
    if (!enabled || !targetRef.current) return

    targetRef.current.getWorldPosition(_targetPosition)

    // 구면 좌표로 카메라 위치 계산
    const offsetX = Math.sin(yaw.current) * Math.cos(pitch.current) * DISTANCE
    const offsetY = Math.sin(pitch.current) * DISTANCE + HEIGHT
    const offsetZ = Math.cos(yaw.current) * Math.cos(pitch.current) * DISTANCE

    _lookTarget.set(_targetPosition.x, _targetPosition.y + 1, _targetPosition.z)
    _desiredPosition.set(
      _targetPosition.x + offsetX,
      _targetPosition.y + offsetY,
      _targetPosition.z + offsetZ,
    )

    // 플레이어와 카메라 사이의 고정 collider를 검사한다. 벽이 있으면
    // 카메라를 벽 안쪽으로 당겨 복도 밖 공간을 관통해서 볼 수 없게 한다.
    _cameraOffset.subVectors(_desiredPosition, _lookTarget)
    const desiredDistance = _cameraOffset.length()
    if (desiredDistance > 0.001) {
      _cameraOffset.multiplyScalar(1 / desiredDistance)
      collisionRay.origin.x = _lookTarget.x
      collisionRay.origin.y = _lookTarget.y
      collisionRay.origin.z = _lookTarget.z
      collisionRay.dir.x = _cameraOffset.x
      collisionRay.dir.y = _cameraOffset.y
      collisionRay.dir.z = _cameraOffset.z
      const hit = world.castRay(
        collisionRay,
        desiredDistance,
        true,
        rapier.QueryFilterFlags.ONLY_FIXED | rapier.QueryFilterFlags.EXCLUDE_SENSORS,
      )
      const safeDistance = hit
        ? Math.max(MIN_DISTANCE, hit.timeOfImpact - WALL_PADDING)
        : desiredDistance
      if (armDistance.current === null) armDistance.current = safeDistance
      const armSpeed = safeDistance < armDistance.current ? ARM_RETRACT_SPEED : ARM_EXTEND_SPEED
      armDistance.current = THREE.MathUtils.damp(armDistance.current, safeDistance, armSpeed, delta)
      _desiredPosition.copy(_lookTarget).addScaledVector(_cameraOffset, armDistance.current)
    }

    const follow = 1 - Math.exp(-FOLLOW_SPEED * delta)
    camera.position.lerp(_desiredPosition, follow)
    camera.lookAt(_lookTarget)
  })

  return null
}
