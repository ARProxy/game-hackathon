/**
 * WebSocket 연결 관리 hook
 * - 서버와 연결/재연결
 * - 수신 메시지를 Zustand 스토어에 반영
 * - 메시지 전송 함수 제공
 */

import { useEffect, useRef, useCallback } from 'react'
import { useGameStore } from '../stores/gameStore'

const WS_URL = `ws://${window.location.hostname}:8000/ws`

export default function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null)
  const {
    roomId,
    playerId,
    setConnected,
    setPhase,
    setForbiddenWords,
    freezePlayer,
    unfreezePlayer,
    addSubtitle,
  } = useGameStore()

  const connect = useCallback((roomId: string, playerId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const ws = new WebSocket(`${WS_URL}/${roomId}/${playerId}`)

    ws.onopen = () => {
      console.log('[WS] connected')
      useGameStore.getState().setConnected(true)
    }

    ws.onclose = () => {
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
        // reveal이 끝나면 App에서 playing으로 전환하므로 여기서는 금기어만 동기화
        setForbiddenWords(data.state.forbidden_words)
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

      case 'game_over':
        setPhase('result')
        break

      default:
        console.log('[WS] unhandled:', data.type, data)
    }
  }, [setPhase, setForbiddenWords, freezePlayer, unfreezePlayer, addSubtitle])

  const send = useCallback((message: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message))
    }
  }, [])

  const disconnect = useCallback(() => {
    wsRef.current?.close()
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
