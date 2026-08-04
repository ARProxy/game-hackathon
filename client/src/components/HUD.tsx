/**
 * HUD — 화면 위에 겹쳐지는 게임 UI
 * - 금기어 표시
 * - 마이크 상태
 * - 자막 (STT 결과)
 * - 빙결 알림
 */

import { useGameStore } from '../stores/gameStore'

export default function HUD() {
  const phase = useGameStore((s) => s.phase)
  const forbiddenWords = useGameStore((s) => s.forbiddenWords)
  const isSpeaking = useGameStore((s) => s.isSpeaking)
  const lastTranscript = useGameStore((s) => s.lastTranscript)
  const lastFreezeEvent = useGameStore((s) => s.lastFreezeEvent)
  const connected = useGameStore((s) => s.connected)
  const subtitles = useGameStore((s) => s.subtitles)
  const nearbyPropId = useGameStore((s) => s.nearbyPropId)
  const inspectingPropId = useGameStore((s) => s.inspectingPropId)
  const missions = useGameStore((s) => s.missions)
  const currentMissionIndex = useGameStore((s) => s.currentMissionIndex)
  const acquiredClues = useGameStore((s) => s.acquiredClues)
  const spellWords = useGameStore((s) => s.spellWords)

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
            <div style={{ fontSize: 13 }}>
              {currentMissionIndex < missions.length
                ? '물건을 찾아 조사하세요'
                : '단서를 모두 모았습니다!'}
            </div>
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
              Q를 누르고 주문을 외치세요!
            </div>
          </div>
        )}
      </div>

      {/* E키 조사 힌트 — 프롭 근처일 때 */}
      {phase === 'playing' && nearbyPropId && !inspectingPropId && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'rgba(0, 0, 0, 0.7)',
          border: '1px solid rgba(82, 229, 255, 0.5)',
          borderRadius: 8,
          padding: '8px 16px',
          fontSize: 14,
          color: '#52E5FF',
        }}>
          E키로 조사
        </div>
      )}

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
        {subtitles.slice(-2).map((sub, i) => (
          <div key={sub.timestamp} style={{
            background: 'rgba(0, 0, 0, 0.6)',
            padding: '4px 12px',
            borderRadius: 6,
            fontSize: 14,
            opacity: i === subtitles.length - 1 ? 1 : 0.5,
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
      </div>

      {/* 빙결 알림 — 화면 중앙 */}
      {lastFreezeEvent && Date.now() - lastFreezeEvent.timestamp < 2000 && (
        <div style={{
          position: 'absolute',
          top: '40%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
        }}>
          <div style={{
            fontSize: 48,
            fontWeight: 800,
            color: '#FF2F6E',
            textShadow: '0 0 20px rgba(255, 47, 110, 0.5)',
          }}>
            얼음!
          </div>
          <div style={{
            fontSize: 18,
            color: '#FF2F6E',
            opacity: 0.8,
            marginTop: 8,
          }}>
            "{lastFreezeEvent.matchedWord}" 발화
          </div>
        </div>
      )}
    </div>
  )
}
