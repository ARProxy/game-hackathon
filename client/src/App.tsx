import { useRef, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import Map from './game/Map'
import Structures from './game/Structures'
import Player, { type PlayerHandle } from './game/Player'
import CameraFollow from './game/CameraFollow'
import PlayerLight from './game/PlayerLight'
import Seeker from './game/Seeker'
import Partner from './game/Partner'
import HUD from './components/HUD'
import { useGameStore } from './stores/gameStore'
import useWebSocket from './hooks/useWebSocket'
import useSpeech from './hooks/useSpeech'
import './App.css'

function Scene() {
  const playerRef = useRef<PlayerHandle>(null)

  const playerGroupRef = {
    get current() {
      return playerRef.current?.getGroup() ?? null
    },
  }

  return (
    <>
      {/* 조명 — 전역은 어둡게, 플레이어 주변만 밝게 */}
      <ambientLight intensity={0.08} />
      <directionalLight position={[5, 10, 5]} intensity={0.15} />

      <Map />
      <Structures />
      <Player ref={playerRef} position={[0, 0, 0]} />
      <Partner playerRef={playerGroupRef} />
      <Seeker />

      <PlayerLight targetRef={playerGroupRef} />
      <CameraFollow targetRef={playerGroupRef} />

      <axesHelper args={[5]} />
    </>
  )
}

function GameController() {
  const { connect, send, disconnect } = useWebSocket()
  const { phase, connected, setRoom } = useGameStore()

  // 자동 연결
  useEffect(() => {
    const roomId = `solo-${Date.now()}`
    const playerId = `player-${Math.random().toString(36).slice(2, 8)}`
    setRoom(roomId, playerId)
    connect(roomId, playerId)

    return () => disconnect()
  }, [])

  // 연결 후 자동 게임 시작
  useEffect(() => {
    if (connected && phase === 'lobby') {
      // MVP: 기본 금기어로 즉시 시작
      send({
        type: 'start_game',
        payload: { forbidden_words: ['열쇠', '커피', '빨간'] },
      })
    }
  }, [connected, phase, send])

  // Push-to-Talk 음성 입력
  useSpeech({
    onStart: () => {
      useGameStore.getState().setSpeaking(true)
    },
    onEnd: () => {
      useGameStore.getState().setSpeaking(false)
    },
    onInterim: (transcript) => {
      useGameStore.getState().setLastTranscript(transcript)
      // interim은 자막 표시용, 서버에는 안 보냄
    },
    onFinal: (transcript) => {
      useGameStore.getState().setLastTranscript(transcript)
      useGameStore.getState().addSubtitle(
        useGameStore.getState().playerId,
        transcript,
      )
      // 서버에 전송 → 금기어 판정
      send({
        type: 'speech',
        payload: { transcript, is_final: true },
      })
    },
  })

  return null
}

function App() {
  return (
    <div style={{ width: '100vw', height: '100vh', background: '#07090D' }}>
      <GameController />
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
      <HUD />
    </div>
  )
}

export default App
