/**
 * 금기어 발표 화면
 * - 온보딩 후 채집된 금기어를 연출과 함께 공개
 * - 3초 후 자동으로 게임 시작
 */

import { useEffect, useState } from 'react'

interface ForbiddenRevealProps {
  words: string[]
  onComplete: () => void
}

export default function ForbiddenReveal({ words, onComplete }: ForbiddenRevealProps) {
  const [revealedCount, setRevealedCount] = useState(0)
  const [fadeOut, setFadeOut] = useState(false)

  // 단어를 하나씩 공개
  useEffect(() => {
    if (revealedCount < words.length) {
      const timer = setTimeout(() => {
        setRevealedCount((c) => c + 1)
      }, 600)
      return () => clearTimeout(timer)
    } else {
      // 모두 공개 후 2초 대기 → 페이드아웃 → 게임 시작
      let completionTimer: ReturnType<typeof setTimeout> | undefined
      const timer = setTimeout(() => {
        setFadeOut(true)
        completionTimer = setTimeout(onComplete, 500)
      }, 2000)
      return () => {
        clearTimeout(timer)
        if (completionTimer) clearTimeout(completionTimer)
      }
    }
  }, [revealedCount, words.length, onComplete])

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
      opacity: fadeOut ? 0 : 1,
      transition: 'opacity 0.5s',
    }}>
      <div style={{
        fontSize: 14,
        opacity: 0.5,
        marginBottom: 24,
      }}>
        당신의 답변을 바탕으로 준비된
      </div>

      <div style={{
        fontSize: 32,
        fontWeight: 800,
        color: '#FF2F6E',
        marginBottom: 48,
      }}>
        금기어
      </div>

      <div style={{
        display: 'flex',
        gap: 24,
      }}>
        {words.map((word, i) => (
          <div
            key={word}
            style={{
              opacity: i < revealedCount ? 1 : 0,
              transform: i < revealedCount ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.8)',
              transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
              background: 'rgba(255, 47, 110, 0.15)',
              border: '2px solid rgba(255, 47, 110, 0.5)',
              borderRadius: 12,
              padding: '16px 28px',
              fontSize: 28,
              fontWeight: 700,
              color: '#FF2F6E',
            }}
          >
            {word}
          </div>
        ))}
      </div>

      <div style={{
        marginTop: 48,
        fontSize: 14,
        opacity: revealedCount >= words.length ? 0.5 : 0,
        transition: 'opacity 0.5s',
      }}>
        이 단어를 말하면 얼어붙습니다
      </div>
    </div>
  )
}
