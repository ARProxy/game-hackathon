import { useRef, useEffect, useCallback } from 'react'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import Map from './game/Map'
import Structures from './game/Structures'
import Player, { type PlayerHandle } from './game/Player'
import CameraFollow from './game/CameraFollow'
import PlayerLight from './game/PlayerLight'
import Seeker from './game/Seeker'
import Props from './game/Props'
import Partner from './game/Partner'
import HUD from './components/HUD'
import Onboarding from './components/Onboarding'
import ForbiddenReveal from './components/ForbiddenReveal'
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
      <ambientLight intensity={0.08} />
      <directionalLight position={[5, 10, 5]} intensity={0.15} />

      <Map />
      <Structures />
      <Props playerRef={playerGroupRef} />
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
  const { phase, connected, forbiddenWords, setRoom, setPhase } = useGameStore()

  // 자동 연결
  useEffect(() => {
    const roomId = `solo-${Date.now()}`
    const playerId = `player-${Math.random().toString(36).slice(2, 8)}`
    setRoom(roomId, playerId)
    connect(roomId, playerId)

    return () => disconnect()
  }, [])

  // 연결 후 → 온보딩 페이즈로
  useEffect(() => {
    if (connected && phase === 'lobby') {
      setPhase('onboarding')
    }
  }, [connected, phase, setPhase])

  // 온보딩 완료 → 서버에 답변 전송, 금기어 채집 요청
  const handleOnboardingComplete = useCallback((answers: string[]) => {
    send({
      type: 'onboarding_complete',
      payload: { answers },
    })
  }, [send])

  // Push-to-Talk 음성 입력 — playing 페이즈에서만 서버에 전송
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
      }
    },
  })

  // E키 — 프롭 조사
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'KeyE') return

      const store = useGameStore.getState()
      if (store.phase !== 'playing') return
      if (!store.nearbyPropId) return
      if (store.inspectingPropId) return // 이미 조사 중

      const prop = store.props.find((p) => p.prop_id === store.nearbyPropId)
      if (!prop) return

      // AI 동료가 조사 시작
      store.setInspectingProp(prop.prop_id)
      store.addSubtitle('partner', '확인해볼게!')

      // 1.5초 후 판별 결과
      setTimeout(() => {
        const s = useGameStore.getState()
        if (prop.is_real) {
          // 진짜! 단서 획득
          const mission = s.missions[s.currentMissionIndex]
          const clue = mission?.clue_word || '빛'
          s.acquireClue(clue)
          s.removeProp(prop.prop_id)
          s.advanceMission()
          s.addSubtitle('partner', `맞아! 단서 "${clue}" 획득!`)

          // 모든 미션 완료 체크
          if (s.currentMissionIndex >= s.missions.length) {
            s.setPhase('final_spell')
            s.addSubtitle('partner', '단서를 다 모았어! 주문을 외쳐!')
          }
        } else {
          // 가짜
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
