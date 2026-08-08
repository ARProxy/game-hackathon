/** Claude Design Canvas.dc.html의 심야 환경·안개·환경 반사 설정. */
import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'

const SKY = {
  background: '#0a1017', fog: '#0b121a', zenith: '#152438',
  horizon: '#2b3b4a', ground: '#0b0f13',
}
const VISION_RADIUS = 18

export default function Fog() {
  const { scene, gl } = useThree()

  useEffect(() => {
    const previous = {
      fog: scene.fog, background: scene.background,
      environment: scene.environment, exposure: gl.toneMappingExposure,
    }
    gl.toneMapping = THREE.ACESFilmicToneMapping
    gl.toneMappingExposure = 0.95
    gl.outputColorSpace = THREE.SRGBColorSpace
    scene.background = new THREE.Color(SKY.background)
    scene.fog = new THREE.FogExp2(SKY.fog, 0.0046)

    const canvas = document.createElement('canvas')
    canvas.width = 512; canvas.height = 256
    const context = canvas.getContext('2d')!
    const gradient = context.createLinearGradient(0, 0, 0, 256)
    gradient.addColorStop(0, SKY.zenith)
    gradient.addColorStop(0.48, SKY.horizon)
    gradient.addColorStop(0.52, SKY.ground)
    gradient.addColorStop(1, SKY.ground)
    context.fillStyle = gradient
    context.fillRect(0, 0, 512, 256)
    const cityGlow = context.createRadialGradient(150, 128, 0, 150, 128, 180)
    cityGlow.addColorStop(0, 'rgba(190,140,90,0.4)')
    cityGlow.addColorStop(1, 'rgba(190,140,90,0)')
    context.fillStyle = cityGlow
    context.fillRect(0, 0, 512, 256)
    const texture = new THREE.CanvasTexture(canvas)
    texture.mapping = THREE.EquirectangularReflectionMapping
    texture.colorSpace = THREE.SRGBColorSpace
    const pmrem = new THREE.PMREMGenerator(gl)
    const environment = pmrem.fromEquirectangular(texture).texture
    scene.environment = environment

    return () => {
      scene.fog = previous.fog
      scene.background = previous.background
      scene.environment = previous.environment
      gl.toneMappingExposure = previous.exposure
      environment.dispose(); texture.dispose(); pmrem.dispose()
    }
  }, [gl, scene])

  return null
}

export { VISION_RADIUS }
