/**
 * 정산 화면
 * - 승리/실패 표시
 * - 금기어 출처 공개 (온보딩 답변에서 추출)
 * - 획득한 단서, 금기어 위반 횟수
 * - 다시 하기 버튼
 */

import { useGameStore } from '../stores/gameStore'

export default function ResultScreen() {
  const phase = useGameStore((s) => s.phase)
  const forbiddenWords = useGameStore((s) => s.forbiddenWords)
  const acquiredClues = useGameStore((s) => s.acquiredClues)
  const spellWords = useGameStore((s) => s.spellWords)
  const subtitles = useGameStore((s) => s.subtitles)

  if (phase !== 'result') return null

  // 금기어 위반 횟수 (자막에서 "얼음" 관련 이벤트 카운트)
  const freezeCount = subtitles.filter(
    (s) => s.text.includes('얼음') || s.text.includes('FREEZE')
  ).length

  const isWin = acquiredClues.length >= spellWords.length

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

      <div style={{
        fontSize: 16,
        opacity: 0.6,
        marginBottom: 48,
      }}>
        {isWin
          ? '술래를 피해 무사히 탈출했습니다'
          : '다음에는 더 조심해서 말해보세요'}
      </div>

      {/* 통계 */}
      <div style={{
        display: 'flex',
        gap: 32,
        marginBottom: 48,
      }}>
        <StatBox label="획득 단서" value={`${acquiredClues.length} / ${spellWords.length}`} color="#52E5FF" />
        <StatBox label="금기어 위반" value={`${freezeCount}회`} color="#FF2F6E" />
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
          당신의 금기어는 온보딩 대화에서 추출되었습니다
        </div>
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
