/**
 * HUD — 화면 위에 겹쳐지는 게임 UI
 * - 금기어 표시
 * - 마이크 상태
 * - 자막 (STT 결과)
 * - 빙결 알림
 */

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useGameStore, type GamePhase, type PlayerStatus } from '../stores/gameStore'
import { sendGameMessage } from '../hooks/useWebSocket'
import rescueContract from '../game/rescueContract.json'
import { useSettingsStore } from '../stores/settingsStore'

const FREEZE_TIMEOUT_MS = 30_000

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
  MOVE_TO_GATE: '동료가 탈출구로 이동 중',
  ESCAPE: '동료가 탈출구를 통과 중',
  INCAPACITATED: '동료가 움직일 수 없음',
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
          : `“${freezeEvent.matchedWord}” 발화`} · 0초가 되면 탈락합니다
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
  const forbiddenWords = useGameStore((s) => s.forbiddenWords)
  const isSpeaking = useGameStore((s) => s.isSpeaking)
  const lastTranscript = useGameStore((s) => s.lastTranscript)
  const connected = useGameStore((s) => s.connected)
  const connectionError = useGameStore((s) => s.connectionError)
  const subtitles = useGameStore((s) => s.subtitles)
  const subtitlesEnabled = useSettingsStore((s) => s.subtitlesEnabled)
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
  const companionState = useGameStore((s) => s.companionIntent?.state ?? null)
  const verticalProgression = useGameStore((s) => s.verticalProgression)

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

      {/* 상단 — 연결 상태 + 금기어 */}
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

        {/* 금기어 표시 */}
        {phase === 'playing' && forbiddenWords.length > 0 && (
          <div style={{
            background: 'rgba(255, 47, 110, 0.15)',
            border: '1px solid rgba(255, 47, 110, 0.4)',
            borderRadius: 8,
            padding: '8px 12px',
          }}>
            <div style={{ fontSize: 10, opacity: 0.6, marginBottom: 4 }}>
              금기어
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {forbiddenWords.map((word) => (
                <span key={word} style={{
                  background: 'rgba(255, 47, 110, 0.25)',
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#FF2F6E',
                }}>
                  {word}
                </span>
              ))}
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
                      “{missions[currentMissionIndex]?.forbidden_word}” 이름은 절대 말하지 마세요.
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
                주문 조각: {acquiredClues.map((clue) => `[${clue.order}] ${clue.word}`).join(' · ')}
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
              {verticalProgression.active_floor} · {verticalProgression.phase}
            </div>
            현재 층의 청색 목표를 찾아 E로 상호작용하세요.
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
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {acquiredClues.map((clue) => (
                <span key={`${clue.order}-${clue.word}`} style={{ padding: '5px 8px', border: '1px solid rgba(182,255,61,.35)', borderRadius: 6, color: '#B6FF3D' }}>
                  {clue.order}/{clue.total} · {clue.word}
                </span>
              ))}
            </div>
            <div style={{ fontSize: 11, marginTop: 4, opacity: 0.6 }}>
              {gateArrived
                ? `도착 확인 완료 — ${totalClues}개 조각을 표식 순서로 조합해 외치세요!`
                : '노란빛 게이트로 이동하며 조각의 순서를 기억하세요.'}
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

      {companionState && (phase === 'playing' || phase === 'final_spell' || phase === 'escape') && (
        <div style={{
          position: 'absolute', top: 62, left: '50%', transform: 'translateX(-50%)',
          padding: '6px 11px', borderRadius: 20,
          border: '1px solid rgba(182,255,61,.4)', background: 'rgba(20,40,12,.72)',
          color: '#B6FF3D', fontSize: 10, fontWeight: 800, letterSpacing: '.06em',
        }}>
          {COMPANION_LABELS[companionState] ?? '동료가 다음 행동을 판단 중'}
        </div>
      )}

      <PartnerFrozenAlert />

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
            AI 후보 비교 · 확신 {Math.round(partnerDecision.confidence * 100)}%
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
          <div key={sub.timestamp} style={{
            background: 'rgba(0, 0, 0, 0.6)',
            padding: '4px 12px',
            borderRadius: 6,
            fontSize: 14,
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
            fontSize: 14,
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
