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

  if (phase !== 'result') return null

  const isWin = outcome === 'win'
  const selectedCharacter = CHARACTERS.find((character) => character.id === selectedCharacterId)
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
      justifyContent: 'center',
      fontFamily: "'Pretendard', sans-serif",
      color: 'white',
      zIndex: 200,
    }}>
      {/* 결과 */}
      <div style={{
        fontSize: 48,
        fontWeight: 800,
        color: isWin ? '#B6FF3D' : '#FF2F6E',
        textShadow: `0 0 30px ${isWin ? 'rgba(182,255,61,0.4)' : 'rgba(255,47,110,0.4)'}`,
        marginBottom: 16,
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
        marginBottom: 48,
      }}>
        {isWin
          ? '술래를 피해 무사히 탈출했습니다'
          : failureMessage}
      </div>

      {/* 통계 */}
      <div style={{
        display: 'flex',
        gap: 32,
        marginBottom: 48,
      }}>
        <StatBox label="획득 단서" value={`${acquiredClues.length} / ${totalClues}`} color="#52E5FF" />
        <StatBox label="금기어 위반" value={`${freezeCount}회`} color="#FF2F6E" />
        <StatBox label="플레이 시간" value={formatElapsed(elapsedSeconds ?? 0)} color="#B6FF3D" />
      </div>

      {/* 플레이 종료 후에만 비공개 금기어 이력을 공개한다. */}
      <div style={{
        background: 'rgba(255, 255, 255, 0.05)',
        borderRadius: 12,
        padding: '20px 28px',
        marginBottom: 48,
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 12, opacity: 0.5, marginBottom: 12 }}>
          게임이 당신의 대화에서 학습했던 금기어
        </div>
        {(forbiddenProfileHistory.length > 0
          ? forbiddenProfileHistory
          : forbiddenWords.length > 0
            ? [{ generation: 1, words: forbiddenWords, reason: 'legacy' }]
            : []
        ).map((entry) => (
          <div key={entry.generation} style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center', marginTop: 9 }}>
            <span style={{ width: 44, fontSize: 11, opacity: 0.45 }}>흔적 {entry.generation}</span>
            {entry.words.map((word) => (
              <span key={`${entry.generation}-${word}`} style={{
                background: 'rgba(255, 47, 110, 0.2)',
                border: '1px solid rgba(255, 47, 110, 0.4)',
                borderRadius: 8,
                padding: '6px 16px',
                fontSize: 18,
                fontWeight: 600,
                color: '#FF2F6E',
              }}>
                {word}
              </span>
            ))}
          </div>
        ))}
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
