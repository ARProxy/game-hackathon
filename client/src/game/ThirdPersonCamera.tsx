/**
 * 3인칭 카메라
 * - 플레이어 뒤에서 따라감
 * - 마우스 움직임으로 좌우/상하 시점 회전
 * - 포인터 잠금(Pointer Lock)으로 마우스 캡처
 */

import { useRef, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useRapier } from '@react-three/rapier'
import * as THREE from 'three'
import { useCameraStore } from '../stores/cameraStore'
import { useSettingsStore } from '../stores/settingsStore'

const DISTANCE = 4        // 플레이어와의 거리 (가깝게)
const HEIGHT = 1.8        // 카메라 높이 (어깨 높이)
const BASE_SENSITIVITY = 0.002 // 마우스 감도
const LERP_SPEED = 0.12
const WALL_PADDING = 0.18
const MIN_DISTANCE = 0.55

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
  const sensitivity = useSettingsStore((state) => state.mouseSensitivity)

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
        pitch.current - e.movementY * BASE_SENSITIVITY * sensitivity,
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
  }, [enabled, gl.domElement, sensitivity])

  useFrame(() => {
    if (!enabled || !targetRef.current) return

    const target = targetRef.current.position

    // 구면 좌표로 카메라 위치 계산
    const offsetX = Math.sin(yaw.current) * Math.cos(pitch.current) * DISTANCE
    const offsetY = Math.sin(pitch.current) * DISTANCE + HEIGHT
    const offsetZ = Math.cos(yaw.current) * Math.cos(pitch.current) * DISTANCE

    const lookTarget = new THREE.Vector3(target.x, target.y + 1, target.z)
    const desiredPos = new THREE.Vector3(
      target.x + offsetX,
      target.y + offsetY,
      target.z + offsetZ,
    )

    // 플레이어와 카메라 사이의 고정 collider를 검사한다. 벽이 있으면
    // 카메라를 벽 안쪽으로 당겨 복도 밖 공간을 관통해서 볼 수 없게 한다.
    const cameraOffset = desiredPos.clone().sub(lookTarget)
    const desiredDistance = cameraOffset.length()
    if (desiredDistance > 0.001) {
      const direction = cameraOffset.normalize()
      const ray = new rapier.Ray(lookTarget, direction)
      const hit = world.castRay(
        ray,
        desiredDistance,
        true,
        rapier.QueryFilterFlags.ONLY_FIXED | rapier.QueryFilterFlags.EXCLUDE_SENSORS,
      )
      if (hit) {
        const safeDistance = Math.max(MIN_DISTANCE, hit.timeOfImpact - WALL_PADDING)
        desiredPos.copy(lookTarget).addScaledVector(direction, safeDistance)
      }
    }

    camera.position.lerp(desiredPos, LERP_SPEED)
    camera.lookAt(lookTarget)

    // yaw를 스토어에 공유 → Player 이동 방향 보정에 사용
    useCameraStore.getState().setYaw(yaw.current)
  })

  return null
}
