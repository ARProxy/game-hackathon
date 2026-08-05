/**
 * 정산 화면
 * - 승리/실패 표시
 * - 금기어 출처 공개 (온보딩 답변에서 추출)
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
  const sourceAnswers = useGameStore((s) => s.sourceAnswers)
  const freezeCount = useGameStore((s) => s.freezeCount)
  const acquiredClues = useGameStore((s) => s.acquiredClues)
  const spellWords = useGameStore((s) => s.spellWords)
  const outcome = useGameStore((s) => s.outcome)
  const resultReason = useGameStore((s) => s.resultReason)
  const elapsedSeconds = useGameStore((s) => s.elapsedSeconds)
  const selectedCharacterId = useGameStore((s) => s.selectedCharacterId)

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
        <StatBox label="획득 단서" value={`${acquiredClues.length} / ${spellWords.length}`} color="#52E5FF" />
        <StatBox label="금기어 위반" value={`${freezeCount}회`} color="#FF2F6E" />
        <StatBox label="플레이 시간" value={formatElapsed(elapsedSeconds ?? 0)} color="#B6FF3D" />
      </div>

      {/* 금기어 출처 공개 */}
      <div style={{
        background: 'rgba(255, 255, 255, 0.05)',
        borderRadius: 12,
        padding: '20px 28px',
        marginBottom: 48,
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 12, opacity: 0.5, marginBottom: 12 }}>
          온보딩 답변과 게임에서 표현 가능한 단어를 바탕으로 구성되었습니다
        </div>
        {sourceAnswers.length > 0 && (
          <div style={{
            display: 'grid',
            gap: 6,
            marginBottom: 16,
            maxWidth: 560,
            textAlign: 'left',
          }}>
            {sourceAnswers.map((answer, index) => (
              <div key={`${index}-${answer}`} style={{ fontSize: 13, color: 'rgba(255,255,255,0.72)' }}>
                <span style={{ color: '#52E5FF', marginRight: 8 }}>답변 {index + 1}</span>
                {answer}
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
          {forbiddenWords.map((word) => (
            <span key={word} style={{
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
