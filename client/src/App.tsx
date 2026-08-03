import { useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import Map from './game/Map'
import Player, { type PlayerHandle } from './game/Player'
import CameraFollow from './game/CameraFollow'
import './App.css'

function Scene() {
  const playerRef = useRef<PlayerHandle>(null)
  const groupRef = useRef<THREE.Group>(null)

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 10, 5]} intensity={0.8} />

      <Map />
      <Player ref={playerRef} position={[0, 0, 0]} />

      <CameraFollow
        targetRef={{
          get current() {
            return playerRef.current?.getGroup() ?? null
          },
        }}
      />

      {/* 축 헬퍼 (디버깅용) */}
      <axesHelper args={[5]} />
    </>
  )
}

function App() {
  return (
    <div style={{ width: '100vw', height: '100vh', background: '#07090D' }}>
      <Canvas
        orthographic
        camera={{
          position: [20, 20, 20],
          zoom: 30,
          near: 0.1,
          far: 200,
        }}
      >
        <Scene />
      </Canvas>
    </div>
  )
}

export default App
