/**
 * WebSocket 연결 관리 hook
 * - 서버와 연결/재연결
 * - 수신 메시지를 Zustand 스토어에 반영
 * - 메시지 전송 함수 제공
 */

import { useEffect, useRef, useCallback } from 'react'
import { useGameStore } from '../stores/gameStore'

const WS_URL = `ws://${window.location.hostname}:8000/ws`
let activeSocket: WebSocket | null = null

/** Three.js 프레임 루프에서도 동일한 게임 연결을 사용한다. */
export function sendGameMessage(message: object): boolean {
  if (activeSocket?.readyState !== WebSocket.OPEN) return false
  activeSocket.send(JSON.stringify(message))
  return true
}

export default function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null)
  const {
    setPhase,
    setForbiddenWords,
    setRoundData,
    freezePlayer,
    unfreezePlayer,
    addSubtitle,
  } = useGameStore()

  const connect = useCallback((roomId: string, playerId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const ws = new WebSocket(`${WS_URL}/${roomId}/${playerId}`)

    ws.onopen = () => {
      activeSocket = ws
      console.log('[WS] connected')
      useGameStore.getState().setConnected(true)
    }

    ws.onclose = () => {
      if (activeSocket === ws) activeSocket = null
      console.log('[WS] disconnected')
      useGameStore.getState().setConnected(false)
    }

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      handleMessage(data)
    }

    ws.onerror = (err) => {
      console.error('[WS] error', err)
    }

    wsRef.current = ws
  }, [])

  const handleMessage = useCallback((data: any) => {
    switch (data.type) {
      case 'forbidden_words_ready':
        setForbiddenWords(data.forbidden_words)
        setPhase('reveal')
        break

      case 'game_started':
        setForbiddenWords(data.state.forbidden_words)
        if (data.round) {
          setRoundData(data.round.props, data.round.missions, data.round.spell_words)
        }
        break

      case 'freeze':
        freezePlayer({
          playerId: data.player_id,
          matchedWord: data.matched_word,
          matchedStage: data.matched_stage,
          confidence: data.confidence,
          position: data.position,
          timestamp: Date.now(),
        })
        break

      case 'rescued':
        unfreezePlayer(data.target_id)
        break

      case 'speech_safe':
        addSubtitle(data.player_id, data.transcript)
        break

      case 'spell_success':
        setPhase('result')
        addSubtitle('system', '주문 성공! 탈출구가 열립니다!')
        break

      case 'spell_failed':
        addSubtitle('system', `주문이 달라요! 빠진 단서: ${data.missing.join(', ')}`)
        break

      case 'game_over':
        setPhase('result')
        break

      default:
        console.log('[WS] unhandled:', data.type, data)
    }
  }, [setPhase, setForbiddenWords, setRoundData, freezePlayer, unfreezePlayer, addSubtitle])

  const send = useCallback((message: object) => {
    sendGameMessage(message)
  }, [])

  const disconnect = useCallback(() => {
    wsRef.current?.close()
    if (activeSocket === wsRef.current) activeSocket = null
    wsRef.current = null
  }, [])

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      wsRef.current?.close()
    }
  }, [])

  return { connect, send, disconnect }
}
