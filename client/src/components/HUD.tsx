/**
 * HUD — 화면 위에 겹쳐지는 게임 UI
 * - 금기어 표시
 * - 마이크 상태
 * - 자막 (STT 결과)
 * - 빙결 알림
 */

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useGameStore, type GamePhase } from '../stores/gameStore'
import { sendGameMessage } from '../hooks/useWebSocket'

const FREEZE_TIMEOUT_MS = 30_000

function FrozenCountdown() {
  const phase = useGameStore((s) => s.phase)
  const playerId = useGameStore((s) => s.playerId)
  const playerStatus = useGameStore((s) => s.players[s.playerId]?.status)
  const freezeEvent = useGameStore((s) => s.lastFreezeEvent)
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

  if (!visible || !freezeEvent) return null

  const remainingMs = Math.max(0, FREEZE_TIMEOUT_MS - (now - freezeEvent.timestamp))
  const remainingSeconds = Math.ceil(remainingMs / 1000)
  const urgency = remainingSeconds <= 10

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
        AI 동료가 구조하러 오는 중
      </div>
      <div style={{ fontSize: 12, opacity: 0.68, marginTop: 4 }}>
        동료가 가까워져 “땡!” 할 때까지 기다리세요
      </div>
    </div>
  )
}

function TextSpeechFallback({ phase, connected, gateArrived }: {
  phase: GamePhase
  connected: boolean
  gateArrived: boolean
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const available = phase === 'playing' || (phase === 'final_spell' && gateArrived)

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
  const inspectingPropId = useGameStore((s) => s.inspectingPropId)
  const partnerTarget = useGameStore((s) => s.partnerTarget)
  const missions = useGameStore((s) => s.missions)
  const currentMissionIndex = useGameStore((s) => s.currentMissionIndex)
  const acquiredClues = useGameStore((s) => s.acquiredClues)
  const spellWords = useGameStore((s) => s.spellWords)
  const gateArrived = useGameStore((s) => s.gateArrived)

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
        <div style={{ fontSize: 12, opacity: 0.5 }}>
          {connected ? '● 서버 연결됨' : '○ 연결 중...'}
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
        {phase === 'playing' && missions.length > 0 && (
          <div style={{
            background: 'rgba(82, 229, 255, 0.1)',
            border: '1px solid rgba(82, 229, 255, 0.3)',
            borderRadius: 8,
            padding: '8px 12px',
          }}>
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
                단서: {acquiredClues.map((c) => `"${c}"`).join(' ')}
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
            <div style={{ fontSize: 16, fontWeight: 700, color: '#B6FF3D' }}>
              "{spellWords.join(' ')}"
            </div>
            <div style={{ fontSize: 11, marginTop: 4, opacity: 0.6 }}>
              {gateArrived
                ? '도착 확인 완료 — Q를 누르고 주문을 외치세요!'
                : '노란빛으로 표시된 잠긴 게이트 앞으로 이동하세요.'}
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
        {subtitles.slice(-2).map((sub, i, visibleSubtitles) => (
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
        {isSpeaking && lastTranscript && (
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

        <TextSpeechFallback phase={phase} connected={connected} gateArrived={gateArrived} />
      </div>

      <FrozenCountdown />
    </div>
  )
}
