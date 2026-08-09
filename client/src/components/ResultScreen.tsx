/**
 * 정산 화면
 * - 승리/실패 표시
 * - 플레이 중 형성된 금기어 세대 공개
 * - 획득한 단서, 금기어 위반 횟수
 * - 다시 하기 버튼
 */

import { useGameStore } from '../stores/gameStore'
import { CHARACTERS } from '../game/Characters'

function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function formatProfileReason(reason: string): string {
  if (reason === 'initial_conversation_profile') return '초기 대화에서 반복 가능성이 높은 실제 명사 선택'
  if (reason === 'periodic_conversation_shift') return '최근 대화 변화에 따라 한 단어를 유지하고 나머지 교체'
  return reason === 'legacy' ? '고정 금기어 호환 라운드' : reason
}

function formatRageTier(tier: string): string {
  return ({ warning: '경계', enraged: '광분', extreme: '극단 광분', calm: '평상' } as Record<string, string>)[tier] ?? tier
}

export default function ResultScreen() {
  const phase = useGameStore((s) => s.phase)
  const forbiddenWords = useGameStore((s) => s.forbiddenWords)
  const forbiddenProfileHistory = useGameStore((s) => s.forbiddenProfileHistory)
  const freezeCount = useGameStore((s) => s.freezeCount)
  const acquiredClues = useGameStore((s) => s.acquiredClues)
  const totalClues = useGameStore((s) => s.totalClues)
  const outcome = useGameStore((s) => s.outcome)
  const resultReason = useGameStore((s) => s.resultReason)
  const elapsedSeconds = useGameStore((s) => s.elapsedSeconds)
  const selectedCharacterId = useGameStore((s) => s.selectedCharacterId)
  const partnerResultStatus = useGameStore((s) => s.partnerResultStatus)
  const resultAnalysis = useGameStore((s) => s.resultAnalysis)

  if (phase !== 'result') return null

  const isWin = outcome === 'win'
  const selectedCharacter = CHARACTERS.find((character) => character.id === selectedCharacterId)
  const displayedProfiles = forbiddenProfileHistory.length > 0
    ? forbiddenProfileHistory
    : forbiddenWords.length > 0
      ? [{ generation: 1, words: forbiddenWords, reason: 'legacy', duration_seconds: elapsedSeconds ?? 0 }]
      : []
  const longestProfile = displayedProfiles.reduce<(typeof displayedProfiles)[number] | null>(
    (longest, entry) => (
      !longest || (entry.duration_seconds ?? 0) > (longest.duration_seconds ?? 0)
        ? entry : longest
    ),
    null,
  )
  const spellAnalysis = resultAnalysis?.spell_analysis
  const failureMessage = resultReason === 'caught_by_seeker'
    ? '탈출 직전 술래에게 잡혔습니다'
    : resultReason === 'human_eliminated'
      ? '30초 안에 구조받지 못했습니다'
      : '다음에는 더 조심해서 말해보세요'

  const handleRestart = () => {
    useGameStore.getState().reset()
    window.location.reload()
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(7, 9, 13, 0.95)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'flex-start',
      fontFamily: "'Pretendard', sans-serif",
      color: 'white',
      zIndex: 200,
      overflowY: 'auto',
      padding: '54px 24px',
      boxSizing: 'border-box',
    }}>
      {/* 결과 */}
      <div style={{
        fontSize: 48,
        fontWeight: 800,
        color: isWin ? '#B6FF3D' : '#FF2F6E',
        textShadow: `0 0 30px ${isWin ? 'rgba(182,255,61,0.4)' : 'rgba(255,47,110,0.4)'}`,
        marginBottom: 12,
      }}>
        {isWin ? '탈출 성공!' : '게임 오버'}
      </div>

      {isWin && partnerResultStatus && (
        <div style={{
          marginTop: -34, marginBottom: 34, padding: '8px 14px', borderRadius: 8,
          background: partnerResultStatus === 'escaped' ? 'rgba(182,255,61,.12)' : 'rgba(255,209,102,.12)',
          color: partnerResultStatus === 'escaped' ? '#B6FF3D' : '#FFD166', fontSize: 13,
        }}>
          AI 동료 · {partnerResultStatus === 'escaped'
            ? '함께 탈출'
            : partnerResultStatus === 'eliminated'
              ? '탈락'
              : partnerResultStatus === 'frozen'
                ? '빙결 상태로 남음'
                : '탈출구 안쪽에 남음'}
        </div>
      )}

      {selectedCharacter && <div style={{ color: selectedCharacter.glow, fontSize: 13, marginBottom: 10 }}>
        NO. {selectedCharacter.tag} · {selectedCharacter.name}
      </div>}

      <div style={{
        fontSize: 16,
        opacity: 0.6,
        marginBottom: 28,
      }}>
        {isWin
          ? '술래를 피해 무사히 탈출했습니다'
          : failureMessage}
      </div>

      {/* 통계 */}
      <div style={{
        display: 'flex',
        gap: 32,
        marginBottom: 24,
      }}>
        <StatBox label="획득 단서" value={`${acquiredClues.length} / ${totalClues}`} color="#52E5FF" />
        <StatBox label="금기어 위반" value={`${resultAnalysis?.forbidden_word_violations ?? freezeCount}회`} color="#FF2F6E" />
        {resultAnalysis?.final_route && (
          <StatBox label="파이널 경로" value={resultAnalysis.final_route === 'field' ? '운동장' : '지하'} color="#FFD166" />
        )}
        <StatBox label="플레이 시간" value={formatElapsed(elapsedSeconds ?? 0)} color="#B6FF3D" />
      </div>

      {(spellAnalysis || resultAnalysis) && (
        <div style={{
          width: 'min(760px, 92vw)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))',
          gap: 14, marginBottom: 20,
        }}>
          {spellAnalysis && (
            <div style={{ background: 'rgba(182,255,61,.07)', border: '1px solid rgba(182,255,61,.24)', borderRadius: 12, padding: 16 }}>
              <div style={{ color: '#B6FF3D', fontSize: 12, fontWeight: 800, marginBottom: 8 }}>최종 주문 추론</div>
              <div style={{ fontSize: 18, letterSpacing: 2 }}>{spellAnalysis.answer.join(' · ') || '미도달'}</div>
              <div style={{ marginTop: 7, fontSize: 12, opacity: .7 }}>
                제출 {spellAnalysis.attempt_count}회 · 실패 {spellAnalysis.failed_attempts.length}회
                {spellAnalysis.failed_attempts.length > 0 && (
                  <> · {spellAnalysis.failed_attempts.map((attempt) => (
                    attempt.reason === 'order' ? `${attempt.attempt}차 순서 오류` : `${attempt.attempt}차 단서 부족`
                  )).join(', ')}</>
                )}
              </div>
            </div>
          )}
          {resultAnalysis && (
            <div style={{ background: 'rgba(255,47,110,.07)', border: '1px solid rgba(255,47,110,.24)', borderRadius: 12, padding: 16 }}>
              <div style={{ color: '#FF8BAD', fontSize: 12, fontWeight: 800, marginBottom: 8 }}>금기어 → 술래 강화</div>
              <div style={{ fontSize: 16 }}>
                최종 {formatRageTier(resultAnalysis.fw_rage_tier)} · 속도 ×{resultAnalysis.fw_speed_multiplier.toFixed(2)}
              </div>
              <div style={{ marginTop: 7, fontSize: 12, opacity: .72 }}>
                {resultAnalysis.rage_history.length > 0
                  ? resultAnalysis.rage_history.map((entry) => (
                    `${entry.triggered_at_violations}회 → ${formatRageTier(entry.tier)} ×${entry.speed_multiplier.toFixed(2)}${entry.hearing_expanded ? ' · 청각 확대' : ''}${entry.vision_expanded ? ' · 시야 확대' : ''}`
                  )).join(' / ')
                  : '금기어 누적 강화가 발동하지 않았습니다.'}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 플레이 종료 후에만 비공개 금기어 이력을 공개한다. */}
      <div style={{
        background: 'rgba(255, 255, 255, 0.05)',
        borderRadius: 12,
        padding: '20px 28px',
        marginBottom: 24,
        textAlign: 'center',
        width: 'min(704px, 86vw)',
      }}>
        <div style={{ fontSize: 12, opacity: 0.5, marginBottom: 12 }}>
          게임이 당신의 대화에서 학습했던 금기어
        </div>
        {displayedProfiles.map((entry) => (
          <div key={entry.generation} style={{ marginTop: 10, padding: '9px 10px', borderRadius: 8, background: 'rgba(255,255,255,.025)' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
              <span style={{ width: 48, fontSize: 11, opacity: 0.45 }}>흔적 {entry.generation}</span>
              {entry.words.map((word) => (
                <span key={`${entry.generation}-${word}`} style={{
                  background: 'rgba(255, 47, 110, 0.2)',
                  border: '1px solid rgba(255, 47, 110, 0.4)',
                  borderRadius: 8,
                  padding: '5px 13px',
                  fontSize: 16,
                  fontWeight: 600,
                  color: '#FF2F6E',
                }}>
                  {word}
                </span>
              ))}
              <span style={{ fontSize: 11, color: '#FFD166' }}>{Math.round(entry.duration_seconds ?? 0)}초 유지</span>
            </div>
            <div style={{ marginTop: 6, fontSize: 11, opacity: .58 }}>{formatProfileReason(entry.reason)}</div>
          </div>
        ))}
        {longestProfile && (
          <div style={{ marginTop: 12, color: '#FFD166', fontSize: 12 }}>
            가장 오래 유지된 흔적 · {longestProfile.words.join(' · ')} ({Math.round(longestProfile.duration_seconds ?? 0)}초)
          </div>
        )}
        {forbiddenProfileHistory.length === 0 && forbiddenWords.length === 0 && (
          <div style={{ fontSize: 13, opacity: 0.65 }}>충분한 대화가 쌓이기 전에 라운드가 종료되었습니다.</div>
        )}
      </div>

      {/* 다시 하기 */}
      <button
        onClick={handleRestart}
        style={{
          background: '#52E5FF',
          color: '#07090D',
          border: 'none',
          borderRadius: 12,
          padding: '12px 32px',
          fontSize: 16,
          fontWeight: 700,
          cursor: 'pointer',
          pointerEvents: 'auto',
        }}
      >
        다시 하기
      </button>
    </div>
  )
}

function StatBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 12, opacity: 0.5, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color }}>{value}</div>
    </div>
  )
}
