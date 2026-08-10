/**
 * HUD — 화면 위에 겹쳐지는 게임 UI
 * - 비공개 언어 감시 상태
 * - 마이크 상태
 * - 자막 (STT 결과)
 * - 빙결 알림
 */

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useGameStore, type ClueFragment, type GamePhase, type PlayerStatus } from '../stores/gameStore'
import { sendGameMessage } from '../hooks/useWebSocket'
import rescueContract from '../game/rescueContract.json'
import { useSettingsStore } from '../stores/settingsStore'

const FREEZE_TIMEOUT_MS = 30_000

function clueKey(clue: ClueFragment, index: number): string {
  return clue.fragment_id ?? `${clue.order ?? index}-${clue.word ?? clue.symbol ?? 'fragment'}`
}

function compactClue(clue: ClueFragment): string {
  return clue.riddle
    ? `${clue.symbol ?? '◆'} ${clue.relation ?? clue.riddle}`
    : `[${clue.order ?? '?'}] ${clue.word ?? '미확인'}`
}

const HUNTER_LABELS: Record<string, string> = {
  HUNT: '술래가 주변을 수색 중',
  INVESTIGATE: '술래가 들린 소리를 확인 중',
  DETECTED: '발견됨 · 즉시 시야를 끊으세요',
  CHASE: '추격 중 · 코너와 장애물을 이용하세요',
  SEARCH: '술래가 마지막 목격 위치를 수색 중',
  RUSH_GATE: '술래가 탈출구로 돌진 중',
}

const COMPANION_LABELS: Record<string, string> = {
  EXPLORE_ZONE: '동료가 독립적으로 구역 탐색 중',
  INSPECT_CANDIDATE: '동료가 후보 물건을 확인 중',
  REPORT_FINDING: '동료가 발견 정보를 정리 중',
  AVOID_SEEKER: '동료가 술래를 피해 우회 중',
  RESCUE_TEAMMATE: '동료가 구조하러 이동 중',
  REGROUP: '동료가 팀과 합류 중',
  FOLLOW_TO_FLOOR: '동료가 다음 층으로 이동 중',
  MOVE_TO_GATE: '동료가 탈출구로 이동 중',
  ESCAPE: '동료가 탈출구를 통과 중',
  INCAPACITATED: '동료가 움직일 수 없음',
}

const COMPANION_REASON_LABELS: Record<string, string> = {
  rooftop_signal_scout: '담당 옥상 중계기 시야 확보',
  rooftop_signal_guide: '다음 정답 신호로 플레이어 안내 중',
  vertical_stage_objective: '현재 미션 장치 지원',
  intercom_ai_position: '인터폰 판독 위치로 이동',
  simultaneous_ai_position: '동시 조작 B 장치 준비',
  security_guided_route: 'CCTV 음성 안내에 따라 원격 장치로 이동',
  security_waiting_for_guidance: '경비실의 첫 방향 안내를 기다리는 중',
  basement_device_assignment: '담당 지하 설비 점검',
  next_route_scout: '다음 층 이동 경로 정찰',
  player_descended: '플레이어의 층 이동을 확인하고 합류',
  waiting_for_floor_transition: '현재 미션 완료를 기다리는 중',
  seeker_visible: '술래를 발견해 안전 경로로 회피',
  seeker_last_seen: '술래의 마지막 위치를 피해 우회',
  assigned_rescue: '빙결된 팀원 구조',
}

function companionSummary(
  state: string | undefined,
  reason: string | undefined,
): string | null {
  if (!state) return null
  return COMPANION_REASON_LABELS[reason ?? ''] ?? COMPANION_LABELS[state] ?? '다음 행동을 판단 중'
}

const VERTICAL_INSTRUCTIONS: Record<string, string> = {
  rooftop_intro: '세 중계기의 점멸 순서를 기억하세요. 안내가 꺼지면 그 순서대로 옥상을 달려 직접 입력합니다.',
  floor_3: '방송실 ON AIR 콘솔에서 E를 누른 뒤 Q로 세 의미를 우회 설명하세요. AI가 증거대를 조사하면 추격을 피해 결과를 기다리고, 질문이 오면 특징을 더 설명하세요.',
  floor_2: '인터폰에서 E를 누른 뒤 AI가 읽은 색과 도형을 Q로 순서대로 전달하세요.',
  floor_1: '경비실 CCTV 콘솔에서 E로 관제를 시작하고, 화면 표식을 Q로 안내해 AI를 원격 장치까지 이동시키세요.',
  field_final: '각자 맡은 운동장 장치에 도착해 E로 활성화하세요.',
  basement_final: 'AI가 보고한 대기 장치가 배전반·밸브면 Q로 작동을 지시하고, 발전기면 직접 찾아 E로 작동하세요.',
  escape_open: '선택된 파이널 출구의 빛기둥으로 이동해 E를 누르세요.',
}

const VERTICAL_PHASE_LABELS: Record<string, string> = {
  rooftop_intro: '옥상 · 기억 신호 탈취',
  floor_3: '3층 · 방송실 우회 전달',
  floor_2: '2층 · 인터폰 기호 전달',
  floor_1: '1층 · CCTV 음성 관제',
  field_final: '운동장 · 삼인 장치 가동',
  basement_final: '지하 · 설비 복구',
  escape_open: '최종 · 탈출구 개방',
}

const ROOFTOP_SIGNAL_LABELS: Record<string, string> = {
  center: '중앙',
  east: '동쪽',
  west: '서쪽',
}

const SEEKER_THREAT_LABELS: Record<string, string> = {
  inactive: '안전 구간 · 술래 판정 없음',
  omen: '위협 암시 · 붉은 실루엣과 발소리를 경계',
  limited_hunt: '제한 추격 · 큰 소리와 직접 시야에 반응',
  full_hunt: '완전 추격 · 소리와 시야를 모두 경계',
  pincer: '복수 위협 · 서로 다른 접근 신호를 경계',
  enraged: '광분 · 최종 출구까지 압박 지속',
}

function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function RoundElapsedTime() {
  const phase = useGameStore((s) => s.phase)
  const startedAt = useGameStore((s) => s.roundStartedAt)
  const [now, setNow] = useState(Date.now())
  const visible = startedAt !== null
    && (phase === 'playing' || phase === 'final_spell' || phase === 'escape')

  useEffect(() => {
    if (!visible) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [visible, startedAt])

  if (!visible || startedAt === null) return null
  const elapsed = Math.max(0, Math.floor((now - startedAt) / 1000))

  return (
    <span style={{ opacity: 0.72, fontVariantNumeric: 'tabular-nums' }}>
      생존 시간 {formatElapsed(elapsed)}
    </span>
  )
}

function ForbiddenProfileAlert() {
  const signal = useGameStore((s) => s.forbiddenProfileSignal)
  const [visibleSignalId, setVisibleSignalId] = useState<number | null>(null)

  useEffect(() => {
    if (!signal) return
    setVisibleSignalId(signal.id)
    const timer = window.setTimeout(() => setVisibleSignalId(null), 4200)
    return () => window.clearTimeout(timer)
  }, [signal])

  if (!signal || visibleSignalId !== signal.id) return null

  const firstActivation = signal.kind === 'activated'

  return (
    <div
      key={signal.id}
      role="status"
      aria-live="assertive"
      style={{
        position: 'absolute',
        top: 92,
        left: '50%',
        width: 'min(440px, calc(100vw - 40px))',
        transform: 'translateX(-50%)',
        zIndex: 20,
        overflow: 'hidden',
        padding: '14px 18px 13px',
        border: '1px solid rgba(255, 74, 130, 0.82)',
        borderRadius: 12,
        background: 'linear-gradient(105deg, rgba(24,4,13,.96), rgba(70,5,29,.94), rgba(24,4,13,.96))',
        boxShadow: '0 0 0 1px rgba(255,47,110,.12) inset, 0 0 34px rgba(255,47,110,.34)',
        textAlign: 'center',
        animation: 'forbidden-profile-alert 4.2s ease both',
      }}
    >
      <style>{`
        @keyframes forbidden-profile-alert {
          0% { opacity: 0; transform: translate(-50%, -12px) scale(.98); filter: brightness(2); }
          7% { opacity: 1; transform: translate(-50%, 0) scale(1.01); }
          11% { filter: brightness(.75); }
          15%, 82% { opacity: 1; transform: translate(-50%, 0) scale(1); filter: brightness(1); }
          100% { opacity: 0; transform: translate(-50%, -6px) scale(.99); }
        }
        @keyframes forbidden-profile-scan {
          from { transform: translateX(-115%); }
          to { transform: translateX(115%); }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-forbidden-profile-alert] { animation: none !important; }
          [data-forbidden-profile-scan] { animation: none !important; }
        }
      `}</style>
      <div data-forbidden-profile-alert style={{ position: 'relative', zIndex: 1 }}>
        <div style={{
          color: '#FF8BAD',
          fontSize: 11,
          fontWeight: 900,
          letterSpacing: '.2em',
          marginBottom: 5,
        }}>
          {firstActivation ? '언어 감시 시작' : '언어 감시 변동 감지'}
        </div>
        <div style={{ fontSize: 19, fontWeight: 900, letterSpacing: '-.02em' }}>
          {firstActivation ? '학교가 당신의 말버릇을 학습했습니다' : '금지어 규칙이 바뀌었습니다'}
        </div>
        <div style={{ marginTop: 5, color: 'rgba(255,255,255,.7)', fontSize: 12, lineHeight: 1.45 }}>
          {firstActivation
            ? '무엇이 위험한지는 알려주지 않습니다. 말의 결과를 관찰하세요.'
            : '방금까지 안전했던 표현도 다시 의심하세요. 변경 내용은 비공개입니다.'}
        </div>
      </div>
      <div data-forbidden-profile-scan style={{
        position: 'absolute',
        inset: 0,
        width: '45%',
        background: 'linear-gradient(90deg, transparent, rgba(255,120,160,.18), transparent)',
        animation: 'forbidden-profile-scan 1.05s ease-out 2',
      }} />
    </div>
  )
}

function FrozenCountdown() {
  const phase = useGameStore((s) => s.phase)
  const playerId = useGameStore((s) => s.playerId)
  const playerStatus = useGameStore((s) => s.players[s.playerId]?.status)
  const freezeEvent = useGameStore((s) => s.lastFreezeEvent)
  const rescueRequested = useGameStore((s) => s.rescueRequested)
  const [now, setNow] = useState(Date.now())
  const visible = (phase === 'playing' || phase === 'final_spell' || phase === 'escape')
    && playerStatus === 'frozen'
    && freezeEvent?.playerId === playerId

  useEffect(() => {
    if (!visible) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [visible, freezeEvent?.timestamp])

  useEffect(() => {
    if (!visible || rescueRequested) return
    const request = (event: KeyboardEvent) => {
      if (event.code !== rescueContract.requestCode || event.repeat) return
      event.preventDefault()
      useGameStore.getState().requestRescue()
      sendGameMessage({ type: 'action', payload: { action_type: 'rescue_request' } })
      useGameStore.getState().addSubtitle('partner', '알겠어! 하던 일을 멈추고 구조하러 갈게!')
    }
    window.addEventListener('keydown', request)
    return () => window.removeEventListener('keydown', request)
  }, [rescueRequested, visible])

  if (!visible || !freezeEvent) return null

  const remainingMs = Math.max(0, FREEZE_TIMEOUT_MS - (now - freezeEvent.timestamp))
  const remainingSeconds = Math.ceil(remainingMs / 1000)
  const urgency = remainingSeconds <= 10
  const rescueActive = rescueRequested || now - freezeEvent.timestamp >= rescueContract.autoDelayMs

  return (
    <div role="status" aria-live="polite" style={{
      position: 'absolute',
      top: '38%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: 'min(420px, calc(100vw - 40px))',
      textAlign: 'center',
      background: 'rgba(7, 16, 25, 0.9)',
      border: `1px solid ${urgency ? '#FF2F6E' : '#52E5FF'}`,
      borderRadius: 18,
      padding: '22px 26px',
      boxShadow: `0 0 40px ${urgency ? 'rgba(255,47,110,0.35)' : 'rgba(82,229,255,0.25)'}`,
    }}>
      <div style={{
        fontSize: 42,
        fontWeight: 900,
        color: urgency ? '#FF2F6E' : '#BDEFFF',
        textShadow: `0 0 20px ${urgency ? 'rgba(255,47,110,0.5)' : 'rgba(82,229,255,0.45)'}`,
      }}>
        얼음! {remainingSeconds}
      </div>
      <div style={{ fontSize: 14, color: '#FF8BAD', marginTop: 6 }}>
        {freezeEvent.matchedStage === 'trap'
          ? '얼음 트랩 발동'
          : '방금 발화에 위험 표현이 포함됨'} · 0초가 되면 탈락합니다
      </div>
      <div style={{
        height: 5,
        margin: '16px 0 12px',
        borderRadius: 999,
        overflow: 'hidden',
        background: 'rgba(255,255,255,0.12)',
      }}>
        <div style={{
          width: `${(remainingMs / FREEZE_TIMEOUT_MS) * 100}%`,
          height: '100%',
          borderRadius: 999,
          background: urgency ? '#FF2F6E' : '#52E5FF',
          transition: 'width 0.25s linear, background 0.2s',
        }} />
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: '#B6FF3D' }}>
        {rescueActive ? 'AI 동료가 구조하러 오는 중' : '동료가 진행 중인 일을 정리하고 있습니다'}
      </div>
      <div style={{ fontSize: 12, opacity: 0.68, marginTop: 4 }}>
        {rescueActive
          ? '구조 전환 완료 · 동료가 가까워져 “땡!” 할 때까지 기다리세요'
          : `E를 눌러 즉시 구조 요청 · ${rescueContract.autoDelayMs / 1000}초 뒤에는 자동으로 구조합니다`}
      </div>
    </div>
  )
}

function PartnerFrozenAlert() {
  const phase = useGameStore((s) => s.phase)
  const players = useGameStore((s) => s.players)
  const freezeEvent = useGameStore((s) => s.lastFreezeEvent)
  const frozenCompanionId = freezeEvent?.playerId?.startsWith('partner')
    && players[freezeEvent.playerId]?.status === 'frozen'
    ? freezeEvent.playerId
    : null
  const [now, setNow] = useState(Date.now())
  const visible = frozenCompanionId !== null
    && (phase === 'playing' || phase === 'final_spell' || phase === 'escape')

  useEffect(() => {
    if (!visible) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [visible, freezeEvent?.timestamp])

  if (!visible || !freezeEvent) return null
  const totalMs = (freezeEvent.remainingSeconds ?? 30) * 1000
  const remaining = Math.max(0, Math.ceil((totalMs - (now - freezeEvent.timestamp)) / 1000))
  const seekerKnown = Boolean(freezeEvent.danger?.seekerLastSeen?.position)
  return (
    <div role="alert" style={{
      position: 'absolute', left: '50%', bottom: 118, transform: 'translateX(-50%)',
      padding: '10px 16px', borderRadius: 10,
      border: '1px solid #B6FF3D', background: 'rgba(18,38,12,.9)',
      color: '#DFFF9A', fontSize: 12, fontWeight: 800,
    }}>
      {frozenCompanionId === 'partner-2' ? 'AI 동료 2' : 'AI 동료 1'} 빙결 · {remaining}초 · 가까이 가서 E로 “땡”
      {seekerKnown && <span style={{ color: '#FF8BAD', marginLeft: 8 }}>술래 마지막 위치 공유됨</span>}
    </div>
  )
}

function TextSpeechFallback({ phase, connected, gateArrived, playerStatus }: {
  phase: GamePhase
  connected: boolean
  gateArrived: boolean
  playerStatus: PlayerStatus | undefined
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const canInteract = playerStatus !== 'frozen' && playerStatus !== 'eliminated'
  const available = canInteract && (phase === 'playing' || (phase === 'final_spell' && gateArrived))

  const close = () => {
    setOpen(false)
    setText('')
  }

  const openInput = useCallback(() => {
    if (!available) return
    if (document.pointerLockElement) void document.exitPointerLock()
    setOpen(true)
  }, [available])

  useEffect(() => {
    if (!available) close()
  }, [available])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const isEditable = target?.matches('input, textarea, [contenteditable="true"]')
      if (!open && available && event.key === 'Enter' && !isEditable) {
        event.preventDefault()
        openInput()
      } else if (open && event.key === 'Escape') {
        event.preventDefault()
        close()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [available, open, openInput])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const transcript = text.trim()
    if (!transcript || !connected) return

    useGameStore.getState().setLastTranscript(transcript)
    if (phase === 'playing') {
      useGameStore.getState().addSubtitle(useGameStore.getState().playerId, transcript)
      sendGameMessage({ type: 'speech', payload: { transcript, is_final: true } })
    } else if (phase === 'final_spell') {
      sendGameMessage({ type: 'spell', payload: { spell_text: transcript } })
    }
    close()
  }

  if (!available) return null

  return open ? (
    <form onSubmit={submit} style={{
      display: 'flex',
      gap: 8,
      width: 'min(560px, calc(100vw - 32px))',
      pointerEvents: 'auto',
    }}>
      <input
        ref={inputRef}
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={phase === 'final_spell' ? '최종 주문을 입력하세요' : '말할 내용을 입력하세요'}
        aria-label={phase === 'final_spell' ? '최종 주문 입력' : '텍스트 발화 입력'}
        style={{
          flex: 1,
          minWidth: 0,
          border: '1px solid rgba(82, 229, 255, 0.7)',
          borderRadius: 10,
          background: 'rgba(7, 9, 13, 0.94)',
          color: 'white',
          padding: '11px 13px',
          fontSize: 16,
          outline: 'none',
        }}
      />
      <button type="submit" disabled={!text.trim() || !connected} style={{
        border: 0,
        borderRadius: 10,
        padding: '0 18px',
        background: '#52E5FF',
        color: '#071016',
        fontWeight: 800,
        cursor: 'pointer',
        opacity: !text.trim() || !connected ? 0.45 : 1,
      }}>
        전송
      </button>
      <button type="button" onClick={close} aria-label="텍스트 입력 취소" style={{
        border: '1px solid rgba(255,255,255,0.25)',
        borderRadius: 10,
        padding: '0 13px',
        background: 'rgba(255,255,255,0.08)',
        color: 'white',
        cursor: 'pointer',
      }}>
        취소
      </button>
    </form>
  ) : (
    <button type="button" onClick={openInput} style={{
      pointerEvents: 'auto',
      border: '1px solid rgba(255,255,255,0.3)',
      borderRadius: 18,
      background: 'rgba(7, 9, 13, 0.82)',
      color: 'white',
      padding: '7px 14px',
      fontSize: 12,
      cursor: 'pointer',
    }}>
      ⌨ {phase === 'final_spell' ? '주문 입력' : '텍스트로 말하기'} <span style={{ opacity: 0.55 }}>Enter</span>
    </button>
  )
}

export default function HUD() {
  const phase = useGameStore((s) => s.phase)
  const forbiddenProfile = useGameStore((s) => s.forbiddenProfile)
  const missionGeneration = useGameStore((s) => s.missionGeneration)
  const isSpeaking = useGameStore((s) => s.isSpeaking)
  const lastTranscript = useGameStore((s) => s.lastTranscript)
  const connected = useGameStore((s) => s.connected)
  const connectionError = useGameStore((s) => s.connectionError)
  const subtitles = useGameStore((s) => s.subtitles)
  const subtitlesEnabled = useSettingsStore((s) => s.subtitlesEnabled)
  const subtitleScale = useSettingsStore((s) => s.subtitleScale)
  const inspectingPropId = useGameStore((s) => s.inspectingPropId)
  const partnerTarget = useGameStore((s) => s.partnerTarget)
  const partnerDecision = useGameStore((s) => s.partnerDecision)
  const missions = useGameStore((s) => s.missions)
  const currentMissionIndex = useGameStore((s) => s.currentMissionIndex)
  const acquiredClues = useGameStore((s) => s.acquiredClues)
  const totalClues = useGameStore((s) => s.totalClues)
  const gateArrived = useGameStore((s) => s.gateArrived)
  const playerStatus = useGameStore((s) => s.players[s.playerId]?.status)
  // 좌표 snapshot은 3D 프레임 루프가 직접 읽고 HUD는 상태 전환만 구독한다.
  const hunterState = useGameStore((s) => s.hunterIntent?.state ?? null)
  const companionOneSummary = useGameStore((s) => companionSummary(
    s.companionIntents.partner?.state ?? s.companionIntent?.state,
    s.companionIntents.partner?.reason ?? s.companionIntent?.reason,
  ))
  const companionTwoSummary = useGameStore((s) => companionSummary(
    s.companionIntents['partner-2']?.state,
    s.companionIntents['partner-2']?.reason,
  ))
  const verticalProgression = useGameStore((s) => s.verticalProgression)
  const playerFloor = useGameStore((s) => s.players[s.playerId]?.position.floor)
  const rooftopSignal = useGameStore((s) => s.rooftopSignal)
  const activeMissionPrompt = useGameStore((s) => s.activeMissionPrompt)
  const movingFromRoofToThirdFloor = verticalProgression?.phase === 'floor_3'
    && playerFloor === 'ROOF'

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      fontFamily: "'Pretendard', sans-serif",
      color: 'white',
    }}>

      {/* 상단 — 연결 상태 + 비공개 언어 감시 */}
      <div style={{
        position: 'absolute',
        top: 16,
        left: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}>
        {/* 연결 상태 */}
        <div style={{ fontSize: 12, opacity: 0.58 }}>
          {connected ? <RoundElapsedTime /> : '○ 게임 연결 중...'}
        </div>
        {connectionError && (
          <div role="alert" style={{
            maxWidth: 360,
            padding: '8px 10px',
            border: '1px solid rgba(255,47,110,0.55)',
            borderRadius: 8,
            background: 'rgba(50,5,20,0.88)',
            color: '#FF8BAD',
            fontSize: 12,
            lineHeight: 1.45,
          }}>
            {connectionError}
          </div>
        )}

        {phase === 'playing' && forbiddenProfile && (
          <div style={{
            background: 'rgba(255, 47, 110, 0.1)',
            border: '1px solid rgba(255, 47, 110, 0.3)',
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 11,
            color: forbiddenProfile.status === 'observing' ? '#BDEFFF' : '#FF8BAD',
          }}>
            <div style={{ fontWeight: 900 }}>
              {forbiddenProfile.status === 'observing'
                ? '말버릇 학습 중'
                : forbiddenProfile.status === 'locked'
                  ? '말의 흔적이 봉인되었습니다'
                  : '언어 감시 활성'}
            </div>
            <div style={{ marginTop: 3, opacity: .72, lineHeight: 1.4 }}>
              {forbiddenProfile.status === 'observing'
                ? '학교가 대화를 듣고 있습니다 · 아직 감시 규칙 형성 전'
                : forbiddenProfile.status === 'locked'
                  ? '파이널 동안 현재 규칙이 더 이상 바뀌지 않습니다'
                  : '금지어는 플레이 중 주기적으로 바뀝니다 · 내용은 비공개'}
            </div>
          </div>
        )}

        {/* 미션 진행 */}
        {phase === 'playing' && missions.length > 0 && !verticalProgression?.enabled && (
          <div style={{
            background: 'rgba(82, 229, 255, 0.1)',
            border: '1px solid rgba(82, 229, 255, 0.3)',
            borderRadius: 8,
            padding: '8px 12px',
          }}>
            <div style={{ height: 3, marginBottom: 8, borderRadius: 999, overflow: 'hidden', background: 'rgba(255,255,255,.12)' }}>
              <div style={{ width: `${Math.min(100, (currentMissionIndex / missions.length) * 100)}%`, height: '100%', background: '#52E5FF', transition: 'width .3s ease' }} />
            </div>
            <div style={{ fontSize: 10, opacity: 0.6, marginBottom: 4 }}>
              미션 {Math.min(currentMissionIndex + 1, missions.length)} / {missions.length}
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.45 }}>
              {currentMissionIndex < missions.length
                ? <>
                    <strong style={{ color: '#52E5FF' }}>
                      물건의 이름을 직접 말하지 말고 동료에게 설명하세요.
                    </strong>
                    <br />외형이나 쓰임새 특징을 2개 이상 조합해 동료에게 설명하세요.
                    <br /><span style={{ color: '#FF8BAD' }}>말할 때마다 술래가 현재 위치를 듣습니다.</span>
                  </>
                : '단서를 모두 모았습니다!'}
            </div>
            {partnerTarget && (
              <div style={{
                marginTop: 7,
                paddingTop: 7,
                borderTop: '1px solid rgba(82, 229, 255, 0.2)',
                fontSize: 11,
                color: inspectingPropId ? '#B6FF3D' : '#52E5FF',
              }}>
                {inspectingPropId
                  ? 'AI 동료가 설명한 물건을 확인하고 있습니다...'
                  : 'AI 동료가 설명을 이해하고 물건으로 이동 중입니다...'}
              </div>
            )}
            {acquiredClues.length > 0 && (
              <div style={{ fontSize: 11, marginTop: 4, opacity: 0.6 }}>
                주문 파편: {acquiredClues.map(compactClue).join(' · ')}
              </div>
            )}
          </div>
        )}
        {phase === 'playing' && verticalProgression?.enabled && (
          <div style={{
            padding: '8px 12px', borderRadius: 8,
            border: '1px solid rgba(82,229,255,.38)',
            background: 'rgba(8,28,36,.86)', fontSize: 12,
          }}>
            <div style={{ color: '#52E5FF', fontWeight: 900, marginBottom: 3 }}>
              {movingFromRoofToThirdFloor
                ? '옥상 완료 · 3층 계단 이동'
                : VERTICAL_PHASE_LABELS[verticalProgression.phase]
                ?? `${verticalProgression.active_floor} · 현재 미션`}
            </div>
            {missionGeneration?.randomized && (
              <div style={{
                marginBottom: 5,
                color: '#FFE7A3',
                fontSize: 9,
                fontWeight: 800,
                letterSpacing: '.06em',
              }}>
                무작위 미션 #{String(missionGeneration.seed).padStart(6, '0')} · 매 판 새 구성
              </div>
            )}
            <div style={{ lineHeight: 1.45 }}>
              {movingFromRoofToThirdFloor
                ? '북서쪽 노란 표식의 방화문으로 들어가 U자 계단을 끝까지 내려가세요. 계단 하단에서 3층으로 자동 전환됩니다.'
                : activeMissionPrompt
                ?? VERTICAL_INSTRUCTIONS[verticalProgression.phase]
                ?? '현재 구역의 청색 목표를 찾아 E로 상호작용하세요.'}
            </div>
            <div style={{
              marginTop: 6, paddingTop: 6,
              borderTop: '1px solid rgba(82,229,255,.18)',
              color: verticalProgression.seeker_threat === 'limited_hunt' ? '#FFBE72' : '#9FC6D4',
              fontSize: 10,
            }}>
              {SEEKER_THREAT_LABELS[verticalProgression.seeker_threat] ?? '위협 상태 분석 중'}
            </div>
            {verticalProgression.phase === 'rooftop_intro' && rooftopSignal && (
              <div style={{
                marginTop: 7, paddingTop: 7,
                borderTop: '1px solid rgba(82,229,255,.22)',
                color: rooftopSignal.completed ? '#B6FF3D' : '#FFE7A3',
              }}>
                기억 신호 입력 {rooftopSignal.progress}/{rooftopSignal.total}
                {' · '}
                {rooftopSignal.nextSignalId
                  ? rooftopSignal.nextSignalId === 'center'
                    ? '플레이어 차례 · 중앙 신호에서 E 입력'
                    : `동료 차례 · AI가 ${ROOFTOP_SIGNAL_LABELS[rooftopSignal.nextSignalId]} 신호 입력 중`
                  : '완료'}
                {rooftopSignal.nextSignalId !== null && (
                  <div style={{ marginTop: 3, color: '#BDEFFF', opacity: .8 }}>
                    R · 점멸 순서 다시 보기<br />
                    역할 분담 · 나=중앙 / 동료 1=동쪽 / 동료 2=서쪽
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 최종 주문 페이즈 */}
        {phase === 'final_spell' && (
          <div style={{
            background: 'rgba(182, 255, 61, 0.15)',
            border: '1px solid rgba(182, 255, 61, 0.4)',
            borderRadius: 8,
            padding: '8px 12px',
          }}>
            <div style={{ fontSize: 10, opacity: 0.6, marginBottom: 4 }}>
              최종 주문
            </div>
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
              {acquiredClues.map((clue, index) => (
                <div key={clueKey(clue, index)} style={{ maxWidth: 205, padding: '7px 9px', border: '1px solid rgba(182,255,61,.35)', borderRadius: 6, color: '#B6FF3D' }}>
                  {clue.riddle ? (
                    <>
                      <strong style={{ fontSize: 16 }}>{clue.symbol ?? '◆'}</strong>
                      <span style={{ marginLeft: 6, fontSize: 11 }}>{clue.riddle}</span>
                      <div style={{ marginTop: 3, fontSize: 10, color: '#BDEFFF' }}>{clue.relation}</div>
                    </>
                  ) : `${clue.order ?? '?'}/${clue.total} · ${clue.word ?? '미확인'}`}
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, marginTop: 4, opacity: 0.6 }}>
              {gateArrived
                ? `도착 확인 완료 — ${totalClues}개 수수께끼의 두 글자 답을 관계 표식 순서로 조합하세요.`
                : '노란빛 게이트로 이동하며 파편의 수수께끼와 관계를 해석하세요.'}
            </div>
          </div>
        )}

        {phase === 'escape' && (
          <div style={{
            background: 'rgba(82, 229, 255, 0.18)',
            border: '1px solid rgba(82, 229, 255, 0.65)',
            borderRadius: 8,
            padding: '10px 14px',
            boxShadow: '0 0 24px rgba(82, 229, 255, 0.2)',
          }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#52E5FF' }}>
              탈출구가 열렸습니다
            </div>
            <div style={{ fontSize: 11, marginTop: 4, opacity: 0.75 }}>
              빛기둥으로 달리세요. 술래도 그곳으로 향합니다!
            </div>
          </div>
        )}
      </div>

      {/* 조사 중 표시 */}
      {hunterState && (phase === 'playing' || phase === 'final_spell' || phase === 'escape') && (
        <div style={{
          position: 'absolute', top: 24, left: '50%', transform: 'translateX(-50%)',
          padding: '7px 12px', borderRadius: 20,
          border: `1px solid ${hunterState === 'CHASE' || hunterState === 'DETECTED' ? '#FF2F6E' : 'rgba(255,255,255,.25)'}`,
          background: hunterState === 'CHASE' || hunterState === 'DETECTED' ? 'rgba(120,10,35,.78)' : 'rgba(7,9,13,.7)',
          color: hunterState === 'CHASE' || hunterState === 'DETECTED' ? '#FF8BAD' : 'rgba(255,255,255,.7)',
          fontSize: 11, fontWeight: 800, letterSpacing: '.08em',
        }}>
          {HUNTER_LABELS[hunterState] ?? '술래의 움직임을 확인할 수 없음'}
        </div>
      )}

      {(companionOneSummary || companionTwoSummary) && (phase === 'playing' || phase === 'final_spell' || phase === 'escape') && (
        <div style={{
          position: 'absolute', top: 62, left: '50%', transform: 'translateX(-50%)',
          padding: '7px 12px', borderRadius: 12,
          border: '1px solid rgba(182,255,61,.4)', background: 'rgba(20,40,12,.72)',
          color: '#B6FF3D', fontSize: 10, fontWeight: 800,
        }}>
          {companionOneSummary && <div>동료 1 · {companionOneSummary}</div>}
          {companionTwoSummary && <div style={{ marginTop: companionOneSummary ? 3 : 0 }}>동료 2 · {companionTwoSummary}</div>}
        </div>
      )}

      <PartnerFrozenAlert />

      <ForbiddenProfileAlert />

      {phase === 'playing' && partnerDecision && (
        <div style={{
          position: 'absolute',
          right: 24,
          bottom: 96,
          width: 260,
          background: 'rgba(7, 16, 25, 0.86)',
          border: `1px solid ${partnerDecision.decision === 'act' ? 'rgba(182,255,61,.5)' : 'rgba(82,229,255,.45)'}`,
          borderRadius: 10,
          padding: '12px 14px',
          fontSize: 12,
        }}>
          <div style={{ color: '#B6FF3D', fontWeight: 800, marginBottom: 7 }}>
            AI 후보 비교 · 확신 {Math.round((partnerDecision.confidence ?? 0) * 100)}%
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 7 }}>
            {partnerDecision.candidates.slice(0, 3).map((candidate) => (
              <span key={candidate.propId} style={{ padding: '3px 6px', borderRadius: 5, background: 'rgba(255,255,255,.08)' }}>
                {candidate.zone}구역 {candidate.score.toFixed(0)}점
              </span>
            ))}
          </div>
          <div style={{ color: 'rgba(255,255,255,.72)', lineHeight: 1.45 }}>{partnerDecision.reply}</div>
          {partnerDecision.candidates[0]?.cues.length > 0 && (
            <div style={{ marginTop: 6, color: 'rgba(143,211,232,.7)' }}>
              일치 단서 · {partnerDecision.candidates[0].cues.join(', ')}
            </div>
          )}
        </div>
      )}

      {inspectingPropId && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'rgba(0, 0, 0, 0.7)',
          border: '1px solid rgba(182, 255, 61, 0.5)',
          borderRadius: 8,
          padding: '8px 16px',
          fontSize: 14,
          color: '#B6FF3D',
        }}>
          조사 중...
        </div>
      )}

      {/* 하단 중앙 — 마이크 + 자막 */}
      <div style={{
        position: 'absolute',
        bottom: 32,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
      }}>
        {/* 자막 */}
        {subtitlesEnabled && subtitles.slice(-2).map((sub, i, visibleSubtitles) => (
          <div key={`${sub.timestamp}-${i}`} style={{
            background: 'rgba(0, 0, 0, 0.6)',
            padding: '4px 12px',
            borderRadius: 6,
            fontSize: 14 * subtitleScale,
            opacity: i === visibleSubtitles.length - 1 ? 1 : 0.5,
          }}>
            {sub.text}
          </div>
        ))}

        {/* 현재 인식 중인 텍스트 */}
        {subtitlesEnabled && isSpeaking && lastTranscript && (
          <div style={{
            background: 'rgba(82, 229, 255, 0.15)',
            border: '1px solid rgba(82, 229, 255, 0.4)',
            padding: '4px 12px',
            borderRadius: 6,
            fontSize: 14 * subtitleScale,
            color: '#52E5FF',
          }}>
            {lastTranscript}
          </div>
        )}

        {/* 마이크 상태 */}
        <div style={{
          background: isSpeaking
            ? 'rgba(82, 229, 255, 0.2)'
            : 'rgba(255, 255, 255, 0.08)',
          border: `1px solid ${isSpeaking ? '#52E5FF' : 'rgba(255,255,255,0.2)'}`,
          borderRadius: 20,
          padding: '6px 16px',
          fontSize: 12,
          transition: 'all 0.15s',
        }}>
          {isSpeaking ? '🎤 듣는 중...' : 'Q를 누르고 말하세요'}
        </div>

        <TextSpeechFallback phase={phase} connected={connected} gateArrived={gateArrived}
          playerStatus={playerStatus} />
      </div>

      <FrozenCountdown />
    </div>
  )
}
