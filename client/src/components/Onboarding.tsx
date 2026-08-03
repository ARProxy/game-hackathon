/**
 * 온보딩 화면
 * - 2~3개 질문을 순서대로 출제
 * - 플레이어가 스페이스바로 답변 (useSpeech 재활용)
 * - 답변 완료 → 서버에 전사 텍스트 전송 → 금기어 채집
 */

import { useState } from 'react'
import { useGameStore } from '../stores/gameStore'

const QUESTIONS = [
  '주말에 보통 뭐 해요?',
  '책상 위에 지금 뭐가 있어요?',
  '좋아하는 색이나 음식이 있나요?',
]

interface OnboardingProps {
  onComplete: (answers: string[]) => void
}

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<string[]>([])
  const [currentAnswer, setCurrentAnswer] = useState('')
  const isSpeaking = useGameStore((s) => s.isSpeaking)
  const lastTranscript = useGameStore((s) => s.lastTranscript)

  const isLastQuestion = currentIndex >= QUESTIONS.length

  // 답변 확정
  const confirmAnswer = () => {
    const answer = lastTranscript || currentAnswer
    if (!answer.trim()) return

    const newAnswers = [...answers, answer]
    setAnswers(newAnswers)
    setCurrentAnswer('')
    useGameStore.getState().setLastTranscript('')

    if (currentIndex + 1 >= QUESTIONS.length) {
      // 모든 질문 완료 → 서버로 전송
      onComplete(newAnswers)
    } else {
      setCurrentIndex(currentIndex + 1)
    }
  }

  if (isLastQuestion) return null

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
      zIndex: 100,
    }}>
      {/* 진행도 */}
      <div style={{
        position: 'absolute',
        top: 40,
        display: 'flex',
        gap: 8,
      }}>
        {QUESTIONS.map((_, i) => (
          <div key={i} style={{
            width: 32,
            height: 4,
            borderRadius: 2,
            background: i <= currentIndex ? '#52E5FF' : 'rgba(255,255,255,0.15)',
            transition: 'background 0.3s',
          }} />
        ))}
      </div>

      {/* 질문 */}
      <div style={{
        fontSize: 14,
        opacity: 0.5,
        marginBottom: 12,
      }}>
        질문 {currentIndex + 1} / {QUESTIONS.length}
      </div>

      <div style={{
        fontSize: 28,
        fontWeight: 700,
        marginBottom: 48,
        textAlign: 'center',
        lineHeight: 1.4,
      }}>
        {QUESTIONS[currentIndex]}
      </div>

      {/* 음성 입력 상태 */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 16,
      }}>
        {/* 현재 인식 중인 텍스트 */}
        <div style={{
          minHeight: 40,
          fontSize: 18,
          color: isSpeaking ? '#52E5FF' : 'rgba(255,255,255,0.6)',
          textAlign: 'center',
          maxWidth: 400,
        }}>
          {isSpeaking ? (lastTranscript || '듣는 중...') : (lastTranscript || '')}
        </div>

        {/* 마이크 버튼 */}
        <div style={{
          width: 80,
          height: 80,
          borderRadius: '50%',
          border: `3px solid ${isSpeaking ? '#52E5FF' : 'rgba(255,255,255,0.2)'}`,
          background: isSpeaking ? 'rgba(82, 229, 255, 0.15)' : 'rgba(255,255,255,0.05)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 32,
          transition: 'all 0.15s',
        }}>
          {isSpeaking ? '🎤' : '🎙️'}
        </div>

        <div style={{ fontSize: 12, opacity: 0.4 }}>
          Space를 누르고 말하세요
        </div>

        {/* 텍스트 직접 입력 (폴백) */}
        <div style={{
          display: 'flex',
          gap: 8,
          marginTop: 16,
        }}>
          <input
            type="text"
            value={currentAnswer}
            onChange={(e) => setCurrentAnswer(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') confirmAnswer() }}
            placeholder="또는 텍스트로 입력..."
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 8,
              padding: '8px 12px',
              color: 'white',
              fontSize: 14,
              width: 240,
              outline: 'none',
              pointerEvents: 'auto',
            }}
          />
          <button
            onClick={confirmAnswer}
            style={{
              background: '#52E5FF',
              color: '#07090D',
              border: 'none',
              borderRadius: 8,
              padding: '8px 16px',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              pointerEvents: 'auto',
            }}
          >
            확인
          </button>
        </div>
      </div>

      {/* 이전 답변 */}
      {answers.length > 0 && (
        <div style={{
          position: 'absolute',
          bottom: 40,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          opacity: 0.3,
          fontSize: 12,
        }}>
          {answers.map((a, i) => (
            <div key={i}>Q{i + 1}: "{a}"</div>
          ))}
        </div>
      )}
    </div>
  )
}
