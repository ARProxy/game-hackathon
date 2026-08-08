import { useRef, useEffect, useCallback, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Physics } from '@react-three/rapier'
import * as THREE from 'three'
import SchoolCampus, { SPAWNS, type FloorKey } from './game/SchoolCampus'
import Player, { type PlayerHandle } from './game/Player'
import { CHARACTERS } from './game/Characters'
import PlayerLight from './game/PlayerLight'
import Seeker from './game/Seeker'
import Props from './game/Props'
import Partner from './game/Partner'
import ThirdPersonCamera from './game/ThirdPersonCamera'
import ThreatFeedback from './game/ThreatFeedback'
import VerticalObjectives from './game/VerticalObjectives'
import Fog from './game/Fog'
import HUD from './components/HUD'
import MiniMap from './components/MiniMap'
import Onboarding from './components/Onboarding'
import ForbiddenReveal from './components/ForbiddenReveal'
import ResultScreen from './components/ResultScreen'
import SoundController from './components/SoundController'
import StartFlow, { type EntryScreen } from './components/StartFlow'
import GameErrorBoundary from './components/GameErrorBoundary'
import PauseMenu from './components/PauseMenu'
import { useGameStore } from './stores/gameStore'
import useWebSocket from './hooks/useWebSocket'
import useSpeech from './hooks/useSpeech'
import { sendGameMessage } from './hooks/useWebSocket'
import './App.css'

/* ─────────────────────────────────────────────
 * 카메라 모드
 * - cctv: 개발용. OrbitControls로 자유 이동. 층별 필터 가능
 * - 3d: 게임용. 3인칭 카메라. 플레이어 추종
 * Tab으로 전환
 * ───────────────────────────────────────────── */
type CameraMode = 'cctv' | '3d'

/** CCTV와 층 필터는 개발 서버에서만 사용할 수 있다. */
const DEV_TOOLS_ENABLED = import.meta.env.DEV

/* ─────────────────────────────────────────────
 * 층 필터 (CCTV 모드에서 숫자키로 전환)
 * 1: 외부+1층  2: 2층  3: 3층  4: 옥상  0: 전체
 * ───────────────────────────────────────────── */
const FLOOR_PRESETS: Record<string, FloorKey[] | undefined> = {
  'Digit0': undefined,                    // 전체
  'Digit1': ['OUT', 'F1'],               // 외부 + 1층
  'Digit2': ['OUT', 'F1', 'F2'],         // ~2층
  'Digit3': ['OUT', 'F1', 'F2', 'F3'],   // ~3층
  'Digit4': ['OUT', 'F1', 'F2', 'F3', 'ROOF'], // 전체 (옥상 포함)
}

const runnerIds = CHARACTERS.filter((character) => character.role === 'runner').map((character) => character.id)

/** 개발용 전경 확인 모드는 공포용 암부와 독립된 판독 가능한 노출을 쓴다. */
function CCTVVisuals() {
  const { gl, scene } = useThree()

  useEffect(() => {
    const previousExposure = gl.toneMappingExposure
    const previousBackground = scene.background
    gl.toneMappingExposure = 1.35
    scene.background = new THREE.Color('#263443')

    return () => {
      gl.toneMappingExposure = previousExposure
      scene.background = previousBackground
    }
  }, [gl, scene])

  return null
}

function Scene({
  cameraMode,
  visibleFloors,
  playerCharacterId,
}: {
  cameraMode: CameraMode
  visibleFloors: FloorKey[] | undefined
  playerCharacterId: string
}) {
  const playerRef = useRef<PlayerHandle>(null)
  const phase = useGameStore((state) => state.phase)
  const activeGate = useGameStore((state) => state.activeGate)
  const activeTrapIds = useGameStore((state) => state.activeTrapIds)
  const isPaused = useGameStore((state) => state.isPaused)
  const playerId = useGameStore((state) => state.playerId)
  const players = useGameStore((state) => state.players)
  const actorPosition = (actorId: string, fallback: readonly [number, number]): [number, number, number] => {
    const position = players[actorId]?.position
    return position
      ? [position.x, position.y ?? 0, position.z]
      : [fallback[0], 0, fallback[1]]
  }
  const playerSpawn = actorPosition(playerId, SPAWNS.player)
  const partnerSpawn = actorPosition('partner', SPAWNS.ai)
  const partnerTwoSpawn = actorPosition('partner-2', SPAWNS.ai2)
  const seekerSpawn = actorPosition('seeker', SPAWNS.seeker)
  const secondarySeekerSpawn = actorPosition('seeker-2', SPAWNS.seeker)
  const seekerCount = useGameStore((state) => state.verticalProgression?.seeker_count ?? 1)

  /* playerGroupRef: 카메라/라이트가 플레이어 위치를 따라가는 데 사용 */
  const playerGroupRef = {
    get current() {
      return playerRef.current?.getGroup() ?? null
    },
  }

  return (
    <>
      {/* ── 조명 ── */}
      <ambientLight intensity={cameraMode === 'cctv' ? 1.4 : 0.5} />
      <directionalLight
        position={[10, 30, 10]}
        intensity={cameraMode === 'cctv' ? 2.4 : 0.62}
        color={cameraMode === 'cctv' ? '#f2f7ff' : '#ffffff'}
      />
      {cameraMode === 'cctv' && (
        <>
          <hemisphereLight args={['#dbeeff', '#59636d', 1.6]} />
          <directionalLight position={[-35, 18, -25]} intensity={1.1} color="#b9d8ff" />
          <CCTVVisuals />
        </>
      )}
      {cameraMode === '3d' && <hemisphereLight args={['#a8c8d9', '#35434a', 0.62]} />}
      {cameraMode === '3d' && <Fog />}

      {/* ── 물리 월드 ── */}
      <Physics gravity={[0, -9.81, 0]} paused={isPaused}>
        <SchoolCampus
          playerRef={playerRef}
          visibleFloors={visibleFloors}
          activeTraps={activeTrapIds}
          gateId={phase === 'final_spell' || phase === 'escape' ? activeGate?.gateId : undefined}
          gateOpen={phase === 'escape'}
          onGateArrive={(id) => {
            if (phase === 'final_spell' && id === activeGate?.gateId) {
              sendGameMessage({ type: 'action', payload: { action_type: 'gate_arrived', gate_id: id } })
            }
          }}
          onGateEscape={(id) => {
            if (phase === 'escape' && id === activeGate?.gateId) {
              sendGameMessage({ type: 'action', payload: { action_type: 'gate_escape', gate_id: id } })
            }
          }}
          onTrapEnter={(id) => {
            const store = useGameStore.getState()
            if (store.phase === 'playing') {
              const pos = playerRef.current?.getGroup()?.position
              sendGameMessage({
                type: 'action',
                payload: {
                  action_type: 'trap',
                  trap_id: id,
                  x: pos?.x ?? 0,
                  z: pos?.z ?? 0,
                },
              })
            }
          }}
        />
        <Props />
        <VerticalObjectives playerRef={playerGroupRef} />
        <Player key={`player-${playerId}-${playerCharacterId}`} ref={playerRef} position={playerSpawn} characterId={playerCharacterId} />
        <Partner
          playerRef={playerGroupRef}
          playerId="partner"
          characterId={runnerIds.find((id) => id !== playerCharacterId) ?? 'R05'}
          spawn={partnerSpawn}
          requestsThink
        />
        <Partner
          playerRef={playerGroupRef}
          playerId="partner-2"
          characterId={runnerIds.filter((id) => id !== playerCharacterId)[1] ?? 'R06'}
          spawn={partnerTwoSpawn}
        />
        {seekerCount >= 1 && (
          <Seeker
            playerRef={playerGroupRef}
            spawn={seekerSpawn}
          />
        )}
        {seekerCount >= 2 && (
          <Seeker
            playerRef={playerGroupRef}
            spawn={secondarySeekerSpawn}
            seekerId="seeker-2"
            requestsThink={false}
          />
        )}

        {/* 카메라 충돌 ray cast는 Rapier 컨텍스트 안에서 실행해야 한다. */}
        <ThirdPersonCamera
          targetRef={playerGroupRef}
          enabled={cameraMode === '3d' && !isPaused}
        />
      </Physics>

      {/* ── 플레이어 시야 조명 ── */}
      {cameraMode === '3d' && <PlayerLight targetRef={playerGroupRef} />}
      <ThreatFeedback playerRef={playerGroupRef} enabled={cameraMode === '3d' && !isPaused} />

      {/* ── 카메라 ── */}
      {/* CCTV 모드: OrbitControls — 마우스로 자유 이동/회전/줌 */}
      {cameraMode === 'cctv' && (
        <OrbitControls
          target={[0, 2, 0]}
          maxPolarAngle={Math.PI / 2.1} /* 바닥 아래로 못 내려가게 */
          enablePan={true}              /* 우클릭 드래그로 이동 */
          panSpeed={1.5}                /* 이동 속도 */
          zoomSpeed={1.2}               /* 줌 속도 */
          minDistance={5}               /* 최소 줌 거리 */
          maxDistance={200}             /* 최대 줌 거리 */
        />
      )}
    </>
  )
}

/* ─────────────────────────────────────────────
 * GameController
 * - 서버 연결, 온보딩, PTT, 게임 흐름 제어
 * - UI 렌더링 (온보딩, 금기어 발표)
 * ───────────────────────────────────────────── */
function GameController({ quickStart }: { quickStart: boolean }) {
  const { connect, send, disconnect } = useWebSocket()
  const phase = useGameStore((state) => state.phase)
  const connected = useGameStore((state) => state.connected)
  const forbiddenWords = useGameStore((state) => state.forbiddenWords)
  const roundStartedAt = useGameStore((state) => state.roundStartedAt)
  const isPaused = useGameStore((state) => state.isPaused)
  const setRoom = useGameStore((state) => state.setRoom)
  const setPhase = useGameStore((state) => state.setPhase)
  const playerStatus = useGameStore((state) => state.players[state.playerId]?.status)
  const [speechFallbackReason, setSpeechFallbackReason] = useState<string | null>(null)
  const speechEnabled = !isPaused && (phase === 'onboarding' || (
    (phase === 'playing' || phase === 'final_spell')
    && playerStatus !== 'frozen'
    && playerStatus !== 'eliminated'
  ))

  /* 서버 자동 연결 */
  useEffect(() => {
    const roomId = `solo-${Date.now()}`
    const playerId = `player-${Math.random().toString(36).slice(2, 8)}`
    setRoom(roomId, playerId)
    // 개발 Strict Mode의 setup → cleanup → setup 검사에서 CONNECTING 소켓을
    // 즉시 닫지 않도록 실제 연결은 다음 이벤트 루프에 생성한다.
    const connectTimer = window.setTimeout(() => connect(roomId, playerId), 0)
    return () => {
      window.clearTimeout(connectTimer)
      disconnect()
    }
  }, [connect, disconnect, setRoom])

  /* 연결 → 일반 온보딩 또는 테스트 빠른 시작 */
  useEffect(() => {
    if (connected && phase === 'lobby') {
      if (quickStart) {
        send({ type: 'start_game', payload: {} })
      } else {
        send({ type: 'request_onboarding_questions' })
        setPhase('onboarding')
      }
    }
  }, [connected, phase, quickStart, send, setPhase])

  useEffect(() => {
    if (quickStart && phase === 'lobby' && roundStartedAt !== null) {
      setPhase('playing')
    }
  }, [phase, quickStart, roundStartedAt, setPhase])

  /* 온보딩 완료 → 서버에 답변 전송 */
  const handleOnboardingComplete = useCallback((answers: string[]) => {
    useGameStore.getState().setSourceAnswers(answers)
    send({ type: 'onboarding_complete', payload: { answers } })
  }, [send])

  /* Q키 Push-to-Talk */
  useSpeech({
    enabled: speechEnabled,
    onStart: () => useGameStore.getState().setSpeaking(true),
    onEnd: () => useGameStore.getState().setSpeaking(false),
    onInterim: (t) => useGameStore.getState().setLastTranscript(t),
    onUnavailable: (reason) => {
      const message = reason === 'unsupported'
        ? '이 브라우저는 음성 인식을 지원하지 않습니다.'
        : reason === 'permission_denied'
          ? '마이크 권한이 거부되었습니다.'
          : '음성 인식을 시작하지 못했습니다.'
      setSpeechFallbackReason(message)
      useGameStore.getState().setSpeaking(false)
    },
    onFinal: (transcript) => {
      useGameStore.getState().setLastTranscript(transcript)
      const p = useGameStore.getState().phase
      if (p === 'playing') {
        useGameStore.getState().addSubtitle(useGameStore.getState().playerId, transcript)
        send({ type: 'speech', payload: { transcript, is_final: true } })
      } else if (p === 'final_spell') {
        if (useGameStore.getState().gateArrived) {
          send({ type: 'spell', payload: { spell_text: transcript } })
        } else {
          useGameStore.getState().addSubtitle('system', '먼저 잠긴 탈출구 앞으로 이동하세요.')
        }
      }
    },
  })

  const handleRevealComplete = useCallback(() => setPhase('playing'), [setPhase])

  return (
    <>
      {phase === 'onboarding' && <Onboarding onComplete={handleOnboardingComplete} />}
      {phase === 'reveal' && <ForbiddenReveal words={forbiddenWords} onComplete={handleRevealComplete} />}
      {speechFallbackReason && phase !== 'result' && (
        <div role="alert" className="speech-fallback-alert">
          <strong>{speechFallbackReason}</strong>
          <span>{phase === 'onboarding' ? '아래 입력창에 답변하세요.' : 'Enter를 눌러 텍스트로 말할 수 있습니다.'}</span>
          <button type="button" onClick={() => setSpeechFallbackReason(null)} aria-label="음성 입력 안내 닫기">×</button>
        </div>
      )}
    </>
  )
}

/* ─────────────────────────────────────────────
 * App — 루트
 * Tab: CCTV ↔ 3D 전환
 * 숫자키 1~4, 0: 층별 필터 (CCTV 모드에서만)
 * ───────────────────────────────────────────── */
function App() {
  const [entryScreen, setEntryScreen] = useState<EntryScreen>('title')
  const [playerCharacterId, setPlayerCharacterId] = useState(runnerIds[0] ?? 'R01')
  const [isGameRunning, setGameRunning] = useState(false)
  const [quickStart, setQuickStart] = useState(false)
  const [cameraMode, setCameraMode] = useState<CameraMode>('3d')
  const [visibleFloors, setVisibleFloors] = useState<FloorKey[] | undefined>(undefined)
  const [floorLabel, setFloorLabel] = useState('전체')
  const [sceneKey, setSceneKey] = useState(0)
  const startSolo = useCallback((characterId: string) => {
    setQuickStart(false)
    setPlayerCharacterId(characterId)
    useGameStore.getState().reset()
    useGameStore.getState().setSelectedCharacter(characterId)
    setGameRunning(true)
  }, [])
  const startQuickGame = useCallback(() => {
    const characterId = runnerIds[0] ?? 'R01'
    setQuickStart(true)
    setPlayerCharacterId(characterId)
    useGameStore.getState().reset()
    useGameStore.getState().setSelectedCharacter(characterId)
    setGameRunning(true)
  }, [])
  const returnToMainMenu = useCallback(() => {
    useGameStore.getState().reset()
    setEntryScreen('title')
    setQuickStart(false)
    setGameRunning(false)
    setSceneKey((key) => key + 1)
  }, [])

  useEffect(() => {
    if (!DEV_TOOLS_ENABLED) return

    const onKeyDown = (e: KeyboardEvent) => {
      /* Tab: 카메라 모드 전환 */
      if (e.code === 'Tab') {
        e.preventDefault()
        setCameraMode((prev) => prev === 'cctv' ? '3d' : 'cctv')
        return
      }

      /* 숫자키: 층 필터 (CCTV 모드에서만) */
      if (FLOOR_PRESETS[e.code] !== undefined || e.code === 'Digit0') {
        const preset = FLOOR_PRESETS[e.code]
        setVisibleFloors(preset)
        const labels: Record<string, string> = {
          'Digit0': '전체',
          'Digit1': '외부+1F',
          'Digit2': '~2F',
          'Digit3': '~3F',
          'Digit4': '전체+옥상',
        }
        setFloorLabel(labels[e.code] || '전체')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#07090D' }}>
      {!isGameRunning && (
        <StartFlow screen={entryScreen} onScreenChange={setEntryScreen} onStartSolo={startSolo} onQuickStart={startQuickGame} />
      )}

      {isGameRunning && <GameErrorBoundary
        onRetry={() => setSceneKey((key) => key + 1)}
        onMainMenu={returnToMainMenu}
      >
      <SoundController />
      <GameController quickStart={quickStart} />

      <Canvas
        key={sceneKey}
        dpr={[1, 1.5]}
        fallback={(
          <div role="alert" style={{
            display: 'grid',
            height: '100%',
            placeItems: 'center',
            padding: 24,
            color: '#FF8BAD',
            textAlign: 'center',
          }}>
            3D 그래픽을 시작할 수 없습니다. WebGL을 지원하는 브라우저에서 다시 실행해 주세요.
          </div>
        )}
        camera={{
          position: [-20, 2.8, -44.5],
          fov: 60,
          near: 0.1,
          far: 1000,
        }}
      >
        <Scene cameraMode={cameraMode} visibleFloors={visibleFloors} playerCharacterId={playerCharacterId} />
      </Canvas>

      <HUD />
      <MiniMap />
      <div className="chase-feedback" aria-hidden="true">
        <i className="chase-feedback-left" />
        <i className="chase-feedback-right" />
      </div>
      <ResultScreen />
      <PauseMenu onMainMenu={returnToMainMenu} />

      {/* ── 개발 서버 전용 CCTV/층 필터 패널 ── */}
      {DEV_TOOLS_ENABLED && <div style={{
        position: 'fixed',
        top: 16,
        right: 16,
        background: 'rgba(0,0,0,0.75)',
        borderRadius: 8,
        padding: '10px 14px',
        color: 'white',
        fontSize: 12,
        fontFamily: 'monospace',
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}>
        <div>
          {cameraMode === 'cctv' ? '📹 CCTV' : '🎮 3D'}
          <span style={{ opacity: 0.4, marginLeft: 8 }}>Tab</span>
        </div>
        <div>
          🏢 {floorLabel}
          <span style={{ opacity: 0.4, marginLeft: 8 }}>1~4, 0</span>
        </div>
        {cameraMode === 'cctv' && (
          <div style={{ opacity: 0.4, marginTop: 4, fontSize: 10 }}>
            드래그: 회전 | 스크롤: 줌 | 우클릭: 이동
          </div>
        )}
        {cameraMode === '3d' && (
          <div style={{ opacity: 0.4, marginTop: 4, fontSize: 10 }}>
            클릭: 마우스 잠금 | WASD: 이동 | Space: 점프 | Q: PTT
          </div>
        )}
      </div>}
      </GameErrorBoundary>}
    </div>
  )
}

export default App
