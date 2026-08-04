import { useRef, useEffect, useCallback, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Physics } from '@react-three/rapier'
import * as THREE from 'three'
import SchoolCampus, { pickRound, SPAWNS } from './game/SchoolCampus'
import Player, { type PlayerHandle } from './game/Player'
import CameraFollow from './game/CameraFollow'
import PlayerLight from './game/PlayerLight'
import Seeker from './game/Seeker'
import Props from './game/Props'
import Partner from './game/Partner'
import ThirdPersonCamera from './game/ThirdPersonCamera'
import HUD from './components/HUD'
import Onboarding from './components/Onboarding'
import ForbiddenReveal from './components/ForbiddenReveal'
import ResultScreen from './components/ResultScreen'
import { useGameStore } from './stores/gameStore'
import useWebSocket from './hooks/useWebSocket'
import useSpeech from './hooks/useSpeech'
import './App.css'

type CameraMode = 'cctv' | '3d'

function Scene({ cameraMode }: { cameraMode: CameraMode }) {
  const playerRef = useRef<PlayerHandle>(null)

  const playerGroupRef = {
    get current() {
      return playerRef.current?.getGroup() ?? null
    },
  }

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 20, 10]} intensity={0.8} />

      <Physics gravity={[0, -9.81, 0]}>
        <SchoolCampus
          onTrapEnter={(id) => {
            // 트랩 밟으면 빙결
            const store = useGameStore.getState()
            if (store.phase === 'playing') {
              store.freezePlayer({
                playerId: store.playerId,
                matchedWord: '트랩',
                matchedStage: 'trap',
                confidence: 1,
                position: { x: 0, z: 0 },
                timestamp: Date.now(),
              })
            }
          }}
        />
        <Props playerRef={playerGroupRef} />
        <Player ref={playerRef} position={[SPAWNS.player[0], 1, SPAWNS.player[1]]} />
        <Partner playerRef={playerGroupRef} />
        <Seeker />
      </Physics>

      <PlayerLight targetRef={playerGroupRef} />

      {/* CCTV 모드 — 전체 맵을 자유롭게 볼 수 있음 */}
      {cameraMode === 'cctv' && (
        <OrbitControls target={[0, 0, 0]} />
      )}

      {/* 3D 모드 — 플레이어 뒤에서 3인칭 */}
      <ThirdPersonCamera
        targetRef={playerGroupRef}
        enabled={cameraMode === '3d'}
      />
    </>
  )
}

function GameController() {
  const { connect, send, disconnect } = useWebSocket()
  const { phase, connected, forbiddenWords, setRoom, setPhase } = useGameStore()

  useEffect(() => {
    const roomId = `solo-${Date.now()}`
    const playerId = `player-${Math.random().toString(36).slice(2, 8)}`
    setRoom(roomId, playerId)
    connect(roomId, playerId)
    return () => disconnect()
  }, [])

  useEffect(() => {
    if (connected && phase === 'lobby') {
      setPhase('onboarding')
    }
  }, [connected, phase, setPhase])

  const handleOnboardingComplete = useCallback((answers: string[]) => {
    send({
      type: 'onboarding_complete',
      payload: { answers },
    })
  }, [send])

  useSpeech({
    onStart: () => {
      useGameStore.getState().setSpeaking(true)
    },
    onEnd: () => {
      useGameStore.getState().setSpeaking(false)
    },
    onInterim: (transcript) => {
      useGameStore.getState().setLastTranscript(transcript)
    },
    onFinal: (transcript) => {
      useGameStore.getState().setLastTranscript(transcript)
      const currentPhase = useGameStore.getState().phase
      if (currentPhase === 'playing') {
        useGameStore.getState().addSubtitle(
          useGameStore.getState().playerId,
          transcript,
        )
        send({
          type: 'speech',
          payload: { transcript, is_final: true },
        })
      } else if (currentPhase === 'final_spell') {
        send({
          type: 'spell',
          payload: { spell_text: transcript },
        })
      }
    },
  })

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'KeyE') return
      const store = useGameStore.getState()
      if (store.phase !== 'playing') return
      if (!store.nearbyPropId) return
      if (store.inspectingPropId) return

      const prop = store.props.find((p) => p.prop_id === store.nearbyPropId)
      if (!prop) return

      store.setInspectingProp(prop.prop_id)
      store.addSubtitle('partner', '확인해볼게!')

      setTimeout(() => {
        const s = useGameStore.getState()
        if (prop.is_real) {
          const mission = s.missions[s.currentMissionIndex]
          const clue = mission?.clue_word || '빛'
          s.acquireClue(clue)
          s.removeProp(prop.prop_id)
          s.advanceMission()
          s.addSubtitle('partner', `맞아! 단서 "${clue}" 획득!`)
          if (s.currentMissionIndex >= s.missions.length) {
            s.setPhase('final_spell')
            s.addSubtitle('partner', '단서를 다 모았어! 주문을 외쳐!')
          }
        } else {
          s.removeProp(prop.prop_id)
          s.addSubtitle('partner', '음... 이건 아닌 것 같아.')
        }
        s.setInspectingProp(null)
      }, 1500)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const handleRevealComplete = useCallback(() => {
    setPhase('playing')
  }, [setPhase])

  return (
    <>
      {phase === 'onboarding' && (
        <Onboarding onComplete={handleOnboardingComplete} />
      )}
      {phase === 'reveal' && (
        <ForbiddenReveal words={forbiddenWords} onComplete={handleRevealComplete} />
      )}
    </>
  )
}

function App() {
  const [cameraMode, setCameraMode] = useState<CameraMode>('3d')

  // Tab 키로 카메라 모드 전환
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Tab') {
        e.preventDefault()
        setCameraMode((prev) => prev === 'cctv' ? '3d' : 'cctv')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#07090D' }}>
      <GameController />
      <Canvas
        camera={{
          position: [80, 80, 80],
          fov: 60,
          near: 0.1,
          far: 1000,
        }}
      >
        <Scene cameraMode={cameraMode} />
      </Canvas>
      <HUD />
      <ResultScreen />

      {/* 카메라 모드 표시 */}
      <div style={{
        position: 'fixed',
        top: 16,
        right: 16,
        background: 'rgba(0,0,0,0.6)',
        borderRadius: 8,
        padding: '6px 12px',
        color: 'white',
        fontSize: 12,
        fontFamily: 'monospace',
        pointerEvents: 'none',
      }}>
        {cameraMode === 'cctv' ? '📹 CCTV (전체)' : '🎮 3D (3인칭)'}
        <span style={{ opacity: 0.4, marginLeft: 8 }}>Tab으로 전환</span>
      </div>
    </div>
  )
}

export default App
