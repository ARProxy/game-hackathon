import { useRef, useEffect, useCallback, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Physics } from '@react-three/rapier'
import SchoolCampus, { GATE_SLOTS, pickRound, SPAWNS, type FloorKey, type RoundPlan } from './game/SchoolCampus'
import Player, { type PlayerHandle } from './game/Player'
import { assignCharacters } from './game/Characters'
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

/* 캐릭터 배정 — 시드 고정으로 매번 같은 배정 */
const cast = assignCharacters(42, 3) // seeker + runner 2명

function Scene({
  cameraMode,
  visibleFloors,
  roundPlan,
}: {
  cameraMode: CameraMode
  visibleFloors: FloorKey[] | undefined
  roundPlan: RoundPlan
}) {
  const playerRef = useRef<PlayerHandle>(null)
  const phase = useGameStore((state) => state.phase)
  const gateTarget = GATE_SLOTS.find((gate) => gate.id === roundPlan.gate)?.p

  /* playerGroupRef: 카메라/라이트가 플레이어 위치를 따라가는 데 사용 */
  const playerGroupRef = {
    get current() {
      return playerRef.current?.getGroup() ?? null
    },
  }

  return (
    <>
      {/* ── 조명 ── */}
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 30, 10]} intensity={0.8} />

      {/* ── 물리 월드 ── */}
      <Physics gravity={[0, -9.81, 0]}>
        <SchoolCampus
          visibleFloors={visibleFloors}
          activeTraps={roundPlan.traps}
          gateId={phase === 'escape' ? roundPlan.gate : undefined}
          onGateEnter={(id) => {
            if (phase === 'escape' && id === roundPlan.gate) {
              useGameStore.getState().setPhase('result')
              useGameStore.getState().addSubtitle('system', '탈출 성공!')
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
        <Props playerRef={playerGroupRef} />
        <Player ref={playerRef} position={[SPAWNS.player[0], 1, SPAWNS.player[1]]} characterId={cast.runners[0]} />
        <Partner playerRef={playerGroupRef} characterId={cast.runners[1] ?? 'R05'} />
        <Seeker rushTarget={gateTarget} />
      </Physics>

      {/* ── 비주얼 오버레이 — 성능 최적화 전까지 비활성화 ── */}
      {/* TODO: GLB InstancedMesh로 교체 후 재활성화 */}
      {/* <WallOverlay visibleFloors={visibleFloors} /> */}
      {/* <Furnishings visibleFloors={visibleFloors} /> */}

      {/* ── 플레이어 시야 조명 ── */}
      <PlayerLight targetRef={playerGroupRef} />

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
      {/* 3D 모드: 3인칭 카메라 — 플레이어 뒤에서 추종 */}
      <ThirdPersonCamera
        targetRef={playerGroupRef}
        enabled={cameraMode === '3d'}
      />
    </>
  )
}

/* ─────────────────────────────────────────────
 * GameController
 * - 서버 연결, 온보딩, PTT, E키 조사, 게임 흐름 제어
 * - UI 렌더링 (온보딩, 금기어 발표)
 * ───────────────────────────────────────────── */
function GameController() {
  const { connect, send, disconnect } = useWebSocket()
  const { phase, connected, forbiddenWords, setRoom, setPhase } = useGameStore()

  /* 서버 자동 연결 */
  useEffect(() => {
    const roomId = `solo-${Date.now()}`
    const playerId = `player-${Math.random().toString(36).slice(2, 8)}`
    setRoom(roomId, playerId)
    connect(roomId, playerId)
    return () => disconnect()
  }, [])

  /* 연결 → 온보딩 */
  useEffect(() => {
    if (connected && phase === 'lobby') {
      setPhase('onboarding')
    }
  }, [connected, phase, setPhase])

  /* 온보딩 완료 → 서버에 답변 전송 */
  const handleOnboardingComplete = useCallback((answers: string[]) => {
    send({ type: 'onboarding_complete', payload: { answers } })
  }, [send])

  /* Q키 Push-to-Talk */
  useSpeech({
    onStart: () => useGameStore.getState().setSpeaking(true),
    onEnd: () => useGameStore.getState().setSpeaking(false),
    onInterim: (t) => useGameStore.getState().setLastTranscript(t),
    onFinal: (transcript) => {
      useGameStore.getState().setLastTranscript(transcript)
      const p = useGameStore.getState().phase
      if (p === 'playing') {
        useGameStore.getState().addSubtitle(useGameStore.getState().playerId, transcript)
        send({ type: 'speech', payload: { transcript, is_final: true } })
      } else if (p === 'final_spell') {
        send({ type: 'spell', payload: { spell_text: transcript } })
      }
    },
  })

  /* E키 — 프롭 조사 */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'KeyE') return
      const store = useGameStore.getState()
      if (store.phase !== 'playing' || !store.nearbyPropId || store.inspectingPropId) return

      const prop = store.props.find((p) => p.prop_id === store.nearbyPropId)
      if (!prop) return

      store.setInspectingProp(prop.prop_id)
      store.addSubtitle('partner', '확인해볼게!')

      setTimeout(() => {
        const s = useGameStore.getState()
        if (prop.is_real) {
          const mission = s.missions[s.currentMissionIndex]
          s.acquireClue(mission?.clue_word || '빛')
          s.removeProp(prop.prop_id)
          s.advanceMission()
          s.addSubtitle('partner', `맞아! 단서 "${mission?.clue_word}" 획득!`)
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

  const handleRevealComplete = useCallback(() => setPhase('playing'), [setPhase])

  return (
    <>
      {phase === 'onboarding' && <Onboarding onComplete={handleOnboardingComplete} />}
      {phase === 'reveal' && <ForbiddenReveal words={forbiddenWords} onComplete={handleRevealComplete} />}
    </>
  )
}

/* ─────────────────────────────────────────────
 * App — 루트
 * Tab: CCTV ↔ 3D 전환
 * 숫자키 1~4, 0: 층별 필터 (CCTV 모드에서만)
 * ───────────────────────────────────────────── */
function App() {
  const [cameraMode, setCameraMode] = useState<CameraMode>('3d')
  const [visibleFloors, setVisibleFloors] = useState<FloorKey[] | undefined>(undefined)
  const [floorLabel, setFloorLabel] = useState('전체')
  const [roundPlan] = useState(() => pickRound())

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
      <GameController />

      <Canvas
        camera={{
          position: [60, 40, 60],
          fov: 60,
          near: 0.1,
          far: 1000,
        }}
      >
        <Scene cameraMode={cameraMode} visibleFloors={visibleFloors} roundPlan={roundPlan} />
      </Canvas>

      <HUD />
      <ResultScreen />

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
    </div>
  )
}

export default App
