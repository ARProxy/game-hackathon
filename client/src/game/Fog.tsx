/**
 * 시야 시스템 — Fog 기반
 *
 * 현재 게임 카메라는 플레이어 뒤 약 4m에 붙는다. Three Fog는
 * 카메라 깊이 기준이므로, 캐릭터가 선명한 4m 이후부터 빠르게 감쇠시켜
 * 앞쪽 약 7m 정도만 읽히게 한다. 정확한 원형 시야는 아니지만
 * PlayerLight와 결합하면 복도 끝과 다른 구역을 숨길 수 있다.
 */

import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'

const FOG_COLOR = '#07090D'
const VISION_RADIUS = 5

const FOG_NEAR = 4
const FOG_FAR = 11

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
