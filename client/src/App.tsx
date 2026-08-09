import { useRef, useEffect, useCallback, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Physics } from '@react-three/rapier'
import * as THREE from 'three'
import SchoolCampus, { SPAWNS, type FloorKey } from './game/SchoolCampus'
import Player, { type PlayerHandle } from './game/Player'
import { CHARACTERS, CharacterModel } from './game/Characters'
import PlayerLight from './game/PlayerLight'
import Seeker from './game/Seeker'
import Props from './game/Props'
import Partner from './game/Partner'
import RemotePlayer from './game/RemotePlayer'
import ThirdPersonCamera from './game/ThirdPersonCamera'
import ThreatFeedback from './game/ThreatFeedback'
import VerticalObjectives from './game/VerticalObjectives'
import Fog from './game/Fog'
import HUD from './components/HUD'
import MiniMap from './components/MiniMap'
import ResultScreen from './components/ResultScreen'
import SoundController from './components/SoundController'
import StartFlow, { type EntryScreen, type MultiplayerLaunch } from './components/StartFlow'
import GameErrorBoundary from './components/GameErrorBoundary'
import PauseMenu from './components/PauseMenu'
import { useGameStore } from './stores/gameStore'
import { useSettingsStore } from './stores/settingsStore'
import useWebSocket, { sendGameMessage } from './hooks/useWebSocket'
import useSpeech from './hooks/useSpeech'
import './App.css'

/* ─────────────────────────────────────────────
 * 카메라 모드
 * - reference: Claude Design ZIP의 원본 오빗 구도. 층별 필터 가능
 * - 3d: 게임용. 3인칭 카메라. 플레이어 추종
 * Tab으로 전환
 * ───────────────────────────────────────────── */
type CameraMode = 'reference' | '3d'

/** Claude 원본 비교와 층 필터는 개발 서버에서만 사용할 수 있다. */
const DEV_TOOLS_ENABLED = import.meta.env.DEV
const SEEKER_VISUAL_PREVIEW = DEV_TOOLS_ENABLED
  && new URLSearchParams(window.location.search).get('preview') === 'seeker'

/* ─────────────────────────────────────────────
 * 층 필터 (원본 비교 모드에서 숫자키로 전환)
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
const _trapPlayerPosition = new THREE.Vector3()

const CLAUDE_ORBIT = {
  target: new THREE.Vector3(-24, 2, -30),
  distance: 118,
  yaw: 0.72,
  pitch: 0.62,
}

/** ZIP Canvas.dc.html의 기본 오빗 카메라를 동일한 좌표와 FOV로 복원한다. */
function ClaudeReferenceCamera() {
  const { camera } = useThree()

  useEffect(() => {
    const horizontalDistance = Math.cos(CLAUDE_ORBIT.pitch) * CLAUDE_ORBIT.distance
    camera.position.set(
      CLAUDE_ORBIT.target.x + Math.sin(CLAUDE_ORBIT.yaw) * horizontalDistance,
      CLAUDE_ORBIT.target.y + Math.sin(CLAUDE_ORBIT.pitch) * CLAUDE_ORBIT.distance,
      CLAUDE_ORBIT.target.z + Math.cos(CLAUDE_ORBIT.yaw) * horizontalDistance,
    )
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = 58
      camera.updateProjectionMatrix()
    }
    camera.lookAt(CLAUDE_ORBIT.target)

    return () => {
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.fov = 60
        camera.updateProjectionMatrix()
      }
    }
  }, [camera])

  return (
    <OrbitControls
      target={CLAUDE_ORBIT.target}
      maxPolarAngle={Math.PI / 2.1}
      enablePan
      panSpeed={1.5}
      zoomSpeed={1.2}
      minDistance={6}
      maxDistance={300}
    />
  )
}

/** 원본처럼 달빛 그림자 범위를 현재 카메라 주변으로 이동시킨다. */
function CameraRelativeMoon() {
  const { camera } = useThree()
  const lightRef = useRef<THREE.DirectionalLight>(null)
  const targetRef = useRef<THREE.Object3D>(null)

  useEffect(() => {
    if (lightRef.current && targetRef.current) lightRef.current.target = targetRef.current
  }, [])

  useFrame(() => {
    if (!lightRef.current || !targetRef.current) return
    targetRef.current.position.set(camera.position.x, 0, camera.position.z)
    lightRef.current.position.set(camera.position.x + 70, 110, camera.position.z + 50)
  })

  return <>
    <directionalLight
      ref={lightRef}
      intensity={1.05}
      color="#a8c6e4"
      castShadow
      shadow-mapSize-width={2048}
      shadow-mapSize-height={2048}
      shadow-camera-left={-90}
      shadow-camera-right={90}
      shadow-camera-top={90}
      shadow-camera-bottom={-90}
      shadow-camera-near={20}
      shadow-camera-far={320}
      shadow-bias={-0.0009}
      shadow-normalBias={0.035}
    />
    <object3D ref={targetRef} />
  </>
}

/** 원본 Canvas의 블룸·필름 그레인·비네트를 월드 캔버스 위에만 적용한다. */
function WorldPostEffects() {
  const [grainTexture, setGrainTexture] = useState<string>()
  const graphicsQuality = useSettingsStore((state) => state.graphicsQuality)
  const reducedFlashes = useSettingsStore((state) => state.reducedFlashes)

  useEffect(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 160
    canvas.height = 160
    const context = canvas.getContext('2d')
    if (!context) return
    const image = context.createImageData(canvas.width, canvas.height)
    for (let index = 0; index < image.data.length; index += 4) {
      const value = 70 + Math.floor(Math.random() * 120)
      image.data[index] = value
      image.data[index + 1] = value
      image.data[index + 2] = value
      image.data[index + 3] = 82
    }
    context.putImageData(image, 0, 0)
    setGrainTexture(canvas.toDataURL())
  }, [])

  return (
    <div className={`world-post-effects quality-${graphicsQuality} ${reducedFlashes ? 'reduced-flashes' : ''}`} aria-hidden="true">
      {graphicsQuality !== 'low' && <i className="world-bloom" />}
      {graphicsQuality === 'high' && <i className="world-grain" style={grainTexture ? { backgroundImage: `url(${grainTexture})` } : undefined} />}
      <i className="world-vignette" />
    </div>
  )
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
  const multiplayerRoom = useGameStore((state) => state.multiplayerRoom)
  const seekerCount = useGameStore((state) => state.verticalProgression?.seeker_count ?? 1)
  const activePartnerIds = Object.values(players)
    .filter((player) => player.role === 'ai_partner')
    .map((player) => player.playerId)
  const remoteHumans = Object.values(players).filter((player) => (
    player.role === 'human' && player.playerId !== playerId
  ))
  const characterByPlayer = new Map(
    multiplayerRoom?.players.map((player) => [player.player_id, player.character_id ?? 'R02']) ?? [],
  )

  /* playerGroupRef: 카메라/라이트가 플레이어 위치를 따라가는 데 사용 */
  const playerGroupRef = {
    get current() {
      return playerRef.current?.getGroup() ?? null
    },
  }

  return (
    <>
      {/* ── 조명 ── */}
      <ambientLight color="#16202b" intensity={0.42} />
      <CameraRelativeMoon />
      <hemisphereLight args={['#2b3b4a', '#0b0f13', 0.56]} />
      <Fog />

      {/* ── 물리 월드 ── */}
      <Physics gravity={[0, -9.81, 0]} paused={isPaused}>
        <SchoolCampus
          playerRef={playerRef}
          visibleFloors={visibleFloors}
          referenceMode={cameraMode === 'reference'}
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
              const player = playerRef.current?.getGroup()
              const pos = player?.getWorldPosition(_trapPlayerPosition)
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
        {/* 비교 모드는 렌더링만 숨긴다. Rapier 객체를 제거/재생성하지 않는다. */}
        <group visible={cameraMode === '3d'}>
          <Props />
          <VerticalObjectives playerRef={playerGroupRef} />
          <Player key={`player-${playerId}-${playerCharacterId}`} ref={playerRef} position={SPAWNS.player} characterId={playerCharacterId} />
          {remoteHumans.map((player, index) => (
            <RemotePlayer
              key={player.playerId}
              playerId={player.playerId}
              characterId={characterByPlayer.get(player.playerId) ?? runnerIds[(index + 1) % runnerIds.length]}
            />
          ))}
          {activePartnerIds.includes('partner') && <Partner
            playerRef={playerGroupRef}
            playerId="partner"
            characterId={runnerIds.find((id) => id !== playerCharacterId) ?? 'R05'}
            spawn={SPAWNS.ai}
            requestsThink
          />}
          {activePartnerIds.includes('partner-2') && <Partner
            playerRef={playerGroupRef}
            playerId="partner-2"
            characterId={runnerIds.filter((id) => id !== playerCharacterId)[1] ?? 'R06'}
            spawn={SPAWNS.ai2}
          />}
          {seekerCount >= 1 && <Seeker playerRef={playerGroupRef} spawn={SPAWNS.seeker} />}
          {seekerCount >= 2 && (
            <Seeker
              playerRef={playerGroupRef}
              spawn={SPAWNS.seeker2}
              seekerId="seeker-2"
              requestsThink={false}
            />
          )}
        </group>

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
      {cameraMode === 'reference' && <ClaudeReferenceCamera />}
    </>
  )
}

/* ─────────────────────────────────────────────
 * GameController
 * - 서버 연결, PTT, 비공개 동적 금기어 게임 시작
 * ───────────────────────────────────────────── */
type GameLaunch = (
  | { mode: 'solo'; roomId: string; nickname: string; characterId: string }
  | MultiplayerLaunch
) & { playerId: string }

function GameController({ launch }: { launch: GameLaunch }) {
  const { connect, send, disconnect } = useWebSocket()
  const phase = useGameStore((state) => state.phase)
  const connected = useGameStore((state) => state.connected)
  const isPaused = useGameStore((state) => state.isPaused)
  const setRoom = useGameStore((state) => state.setRoom)
  const playerStatus = useGameStore((state) => state.players[state.playerId]?.status)
  const [speechFallbackReason, setSpeechFallbackReason] = useState<string | null>(null)
  const speechLanguage = useSettingsStore((state) => state.speechLanguage)
  const speechEnabled = !isPaused && (
    (phase === 'playing' || phase === 'final_spell')
    && playerStatus !== 'frozen'
    && playerStatus !== 'eliminated'
  )

  /* 서버 자동 연결 */
  useEffect(() => {
    setRoom(launch.roomId, launch.playerId)
    // 개발 Strict Mode의 setup → cleanup → setup 검사에서 CONNECTING 소켓을
    // 즉시 닫지 않도록 실제 연결은 다음 이벤트 루프에 생성한다.
    const connectTimer = window.setTimeout(() => connect(launch.roomId, launch.playerId), 0)
    return () => {
      window.clearTimeout(connectTimer)
      disconnect()
    }
  }, [connect, disconnect, launch.playerId, launch.roomId, setRoom])

  /* 솔로는 즉시 시작하고, 멀티는 같은 소켓에서 방 생성/참가부터 진행한다. */
  useEffect(() => {
    if (connected && phase === 'lobby') {
      if (launch.mode === 'solo') {
        send({ type: 'start_game', payload: { dynamic_forbidden: true } })
      } else {
        send({
          type: launch.mode === 'host' ? 'create_room' : 'join_room',
          payload: { nickname: launch.nickname },
        })
      }
    }
  }, [connected, launch.mode, launch.nickname, phase, send])

  const multiplayerRoom = useGameStore((state) => state.multiplayerRoom)
  useEffect(() => {
    if (launch.mode === 'solo' || !multiplayerRoom || phase !== 'lobby') return
    const self = multiplayerRoom.players.find((player) => player.player_id === launch.playerId)
    if (self && self.character_id === null) {
      send({ type: 'select_character', payload: { character_id: launch.characterId } })
    }
  }, [launch.characterId, launch.mode, launch.playerId, multiplayerRoom, phase, send])

  /* Q키 Push-to-Talk */
  useSpeech({
    enabled: speechEnabled,
    lang: speechLanguage,
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

  return (
    <>
      {speechFallbackReason && phase !== 'result' && (
        <div role="alert" className="speech-fallback-alert">
          <strong>{speechFallbackReason}</strong>
          <span>Enter를 눌러 텍스트로 말할 수 있습니다.</span>
          <button type="button" onClick={() => setSpeechFallbackReason(null)} aria-label="음성 입력 안내 닫기">×</button>
        </div>
      )}
    </>
  )
}

function MultiplayerLobby({ launch, onLeave }: { launch: GameLaunch; onLeave: () => void }) {
  const room = useGameStore((state) => state.multiplayerRoom)
  const error = useGameStore((state) => state.multiplayerError)
  const connected = useGameStore((state) => state.connected)
  const phase = useGameStore((state) => state.phase)
  if (launch.mode === 'solo' || phase !== 'lobby') return null
  const self = room?.players.find((player) => player.player_id === launch.playerId)
  const allReady = Boolean(room && room.players.length >= 2 && room.players.every((player) => player.is_ready))
  const selectable = Array.from(new Set([
    ...(self?.character_id ? [self.character_id] : []),
    ...(room?.available_characters ?? []),
  ]))
  return (
    <div className="start-modal-backdrop" style={{ zIndex: 190 }}>
      <section className="start-modal" role="dialog" aria-modal="true" aria-labelledby="multi-lobby-title">
        <p className="start-kicker">LIVE MULTIPLAYER</p>
        <h2 id="multi-lobby-title">대기방 {launch.roomId}</h2>
        <p className="contract-note">{connected ? '서버 연결됨' : '서버에 연결 중'} · 초대 코드를 친구에게 전달하세요.</p>
        {error && <div role="alert" className="speech-fallback-alert" style={{ position: 'static' }}>{error}</div>}
        <div style={{ display: 'grid', gap: 8, margin: '16px 0' }}>
          {(room?.players ?? []).map((player) => (
            <div key={player.player_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 11px', border: '1px solid rgba(82,229,255,.24)', borderRadius: 8 }}>
              <span>{player.is_host ? '★ ' : ''}{player.nickname}</span>
              <span>{player.character_id ?? '선택 중'} · {player.is_ready ? '준비 완료' : '대기'}</span>
            </div>
          ))}
          {room && Array.from({ length: room.ai_slots_needed }, (_, index) => (
            <div key={`ai-${index}`} style={{ padding: '8px 11px', opacity: .58 }}>AI 동료 슬롯 {index + 1} · 게임 시작 시 충원</div>
          ))}
        </div>
        {self && (
          <label className="text-field"><span>내 캐릭터</span><select value={self.character_id ?? ''} onChange={(event) => sendGameMessage({ type: 'select_character', payload: { character_id: event.target.value } })}><option value="" disabled>선택</option>{selectable.map((id) => <option key={id} value={id}>{id}</option>)}</select></label>
        )}
        <div className="exit-actions" style={{ marginTop: 16 }}>
          <button className="start-button" onClick={onLeave}>나가기</button>
          {self && <button className="start-button" disabled={!self.character_id} onClick={() => sendGameMessage({ type: 'player_ready', payload: { ready: !self.is_ready } })}>{self.is_ready ? '준비 해제' : '준비'}</button>}
          {self?.is_host && <button className="start-button primary" disabled={!allReady} onClick={() => sendGameMessage({ type: 'start_game', payload: { dynamic_forbidden: true } })}>게임 시작</button>}
        </div>
      </section>
    </div>
  )
}

/* ─────────────────────────────────────────────
 * App — 루트
 * Tab: Claude 원본 비교 ↔ 3D 전환
 * 숫자키 1~4, 0: 층별 필터 (원본 비교 모드에서만)
 * ───────────────────────────────────────────── */
/** `/\?preview=seeker`에서만 열리는 입체 술래 디자인 검수 무대. */
function SeekerVisualPreview() {
  const movementRef = useRef(0.72)
  return (
    <div style={{ width: '100vw', height: '100vh', background: '#060609' }}>
      <Canvas shadows camera={{ position: [0.1, 1.58, 5.3], fov: 42, near: 0.1, far: 100 }}>
        <color attach="background" args={['#060609']} />
        <fog attach="fog" args={['#060609', 7, 15]} />
        <ambientLight intensity={0.28} color="#66778A" />
        <spotLight position={[-2.8, 4.8, 3.8]} intensity={34} angle={0.42} penumbra={0.72} color="#C7D8E8" castShadow />
        <pointLight position={[2.4, 1.2, 2.2]} intensity={10} distance={7} color="#6E0B18" />
        <group position={[0, -1.15, 0]} rotation={[0, -0.05, 0]}>
          <CharacterModel id="R00" movementRef={movementRef} />
        </group>
        <mesh position={[0, -1.16, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <circleGeometry args={[3.8, 48]} />
          <meshStandardMaterial color="#111116" roughness={0.95} />
        </mesh>
        <OrbitControls target={[0, 0.35, 0]} minDistance={2.8} maxDistance={8} enablePan={false} />
      </Canvas>
      <div style={{ position: 'fixed', left: 24, bottom: 20, color: '#AAB4C0', fontFamily: 'monospace', fontSize: 12 }}>
        SEEKER VOLUMETRIC REVIEW · drag / zoom
      </div>
    </div>
  )
}

function GameApp() {
  const [entryScreen, setEntryScreen] = useState<EntryScreen>('title')
  const [playerCharacterId, setPlayerCharacterId] = useState(runnerIds[0] ?? 'R01')
  const [isGameRunning, setGameRunning] = useState(false)
  const [cameraMode, setCameraMode] = useState<CameraMode>('3d')
  const [visibleFloors, setVisibleFloors] = useState<FloorKey[] | undefined>(undefined)
  const [floorLabel, setFloorLabel] = useState('전체')
  const [sceneKey, setSceneKey] = useState(0)
  const [launch, setLaunch] = useState<GameLaunch | null>(null)
  const graphicsQuality = useSettingsStore((state) => state.graphicsQuality)
  const shadowsEnabled = useSettingsStore((state) => state.shadowsEnabled)
  const renderScale = useSettingsStore((state) => state.renderScale)
  const canvasDpr = renderScale * (graphicsQuality === 'low' ? 0.7 : graphicsQuality === 'medium' ? 0.9 : 1)
  // 접근 가능 층은 서버의 문·이동 권한 계약이고 렌더 가시성 계약이 아니다.
  // 게임에서는 전체 학교 외형을 유지하고, 개발용 원본 비교 모드에서만 층을 숨긴다.
  const renderedFloors = DEV_TOOLS_ENABLED && cameraMode === 'reference' ? visibleFloors : undefined
  const startSolo = useCallback((characterId: string) => {
    setPlayerCharacterId(characterId)
    useGameStore.getState().reset()
    useGameStore.getState().setSelectedCharacter(characterId)
    setLaunch({
      mode: 'solo', roomId: `solo-${Date.now()}`,
      playerId: `player-${Math.random().toString(36).slice(2, 8)}`,
      nickname: '도망자', characterId,
    })
    setGameRunning(true)
  }, [])
  const startQuickGame = useCallback(() => {
    const characterId = runnerIds[0] ?? 'R01'
    setPlayerCharacterId(characterId)
    useGameStore.getState().reset()
    useGameStore.getState().setSelectedCharacter(characterId)
    setLaunch({
      mode: 'solo', roomId: `dev-${Date.now()}`,
      playerId: `player-${Math.random().toString(36).slice(2, 8)}`,
      nickname: '개발 도망자', characterId,
    })
    setGameRunning(true)
  }, [])
  const startMultiplayer = useCallback((multiplayer: MultiplayerLaunch) => {
    useGameStore.getState().reset()
    useGameStore.getState().setSelectedCharacter(multiplayer.characterId)
    setPlayerCharacterId(multiplayer.characterId)
    setLaunch({
      ...multiplayer,
      playerId: `human-${Math.random().toString(36).slice(2, 9)}`,
    })
    setGameRunning(true)
  }, [])
  const returnToMainMenu = useCallback(() => {
    useGameStore.getState().reset()
    setEntryScreen('title')
    setGameRunning(false)
    setLaunch(null)
    setSceneKey((key) => key + 1)
  }, [])

  useEffect(() => {
    if (!DEV_TOOLS_ENABLED) return

    const onKeyDown = (e: KeyboardEvent) => {
      /* Tab: 카메라 모드 전환 */
      if (e.code === 'Tab') {
        e.preventDefault()
        setCameraMode((prev) => prev === 'reference' ? '3d' : 'reference')
        return
      }

      /* 숫자키: 층 필터 (원본 비교 모드에서만) */
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
      {/* 타이틀 클릭 자체가 오디오 잠금 해제 제스처가 되도록 항상 마운트한다. */}
      <SoundController />
      {!isGameRunning && (
        <StartFlow screen={entryScreen} onScreenChange={setEntryScreen} onStartSolo={startSolo} onQuickStart={startQuickGame} onStartMultiplayer={startMultiplayer} />
      )}

      {isGameRunning && <GameErrorBoundary
        onRetry={() => setSceneKey((key) => key + 1)}
        onMainMenu={returnToMainMenu}
      >
      {launch && <GameController launch={launch} />}
      {launch && <MultiplayerLobby launch={launch} onLeave={returnToMainMenu} />}

      <Canvas
        key={sceneKey}
        dpr={canvasDpr}
        shadows={shadowsEnabled ? 'soft' : false}
        gl={{ antialias: graphicsQuality !== 'low', powerPreference: 'high-performance' }}
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
        <Scene cameraMode={cameraMode} visibleFloors={renderedFloors} playerCharacterId={playerCharacterId} />
      </Canvas>

      <WorldPostEffects />
      {cameraMode === '3d' && <>
        <HUD />
        <MiniMap />
        <div className="chase-feedback" aria-hidden="true">
          <i className="chase-feedback-left" />
          <i className="chase-feedback-right" />
        </div>
        <ResultScreen />
        <PauseMenu onMainMenu={returnToMainMenu} />
      </>}

      {/* ── 개발 서버 전용 Claude 원본 비교/층 필터 패널 ── */}
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
          {cameraMode === 'reference' ? '🎞 Claude 원본 비교' : '🎮 3D 게임'}
          <span style={{ opacity: 0.4, marginLeft: 8 }}>Tab</span>
        </div>
        <div>
          🏢 {floorLabel}
          <span style={{ opacity: 0.4, marginLeft: 8 }}>1~4, 0</span>
        </div>
        {cameraMode === 'reference' && (
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

function App() {
  return SEEKER_VISUAL_PREVIEW ? <SeekerVisualPreview /> : <GameApp />
}

export default App
