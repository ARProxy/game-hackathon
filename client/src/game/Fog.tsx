/**
 * 시야 시스템 — Fog 기반
 *
 * 직교 카메라가 [20,20,20]에 있으므로 카메라~원점 거리는 약 34.6.
 * 플레이어가 원점에 있을 때 카메라까지의 거리를 기준으로
 * Fog near/far를 설정한다.
 *
 * 시야 반경 5m = 플레이어 주변 5 unit만 보임
 * 카메라 거리 ~34 + 시야 반경으로 Fog 범위를 계산
 */

import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'

const FOG_COLOR = '#07090D'
const VISION_RADIUS = 5

// 직교 카메라 오프셋 [20,20,20]의 거리 = sqrt(20^2+20^2+20^2) ≈ 34.6
// 플레이어 바로 아래(카메라 가장 가까운 지점)는 ~34.6
// 시야 반경 5m 바깥의 오브젝트는 카메라로부터 ~34.6 + 5 이상
const CAMERA_DIST = 34.6
const FOG_NEAR = CAMERA_DIST - VISION_RADIUS * 0.5  // ~32 — 가까운 건 선명
const FOG_FAR = CAMERA_DIST + VISION_RADIUS * 1.0   // ~40 — 시야 밖은 어둠

export default function Fog() {
  const { scene } = useThree()

  useEffect(() => {
    scene.fog = new THREE.Fog(FOG_COLOR, FOG_NEAR, FOG_FAR)
    scene.background = new THREE.Color(FOG_COLOR)

    return () => {
      scene.fog = null
    }
  }, [scene])

  return null
}

export { VISION_RADIUS }
