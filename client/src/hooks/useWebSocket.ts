/**
 * WebSocket 연결 관리 hook
 * - 서버와 연결/재연결
 * - 수신 메시지를 Zustand 스토어에 반영
 * - 메시지 전송 함수 제공
 */

import { useEffect, useRef, useCallback } from 'react'
import { useGameStore } from '../stores/gameStore'

function resolveWebSocketBaseUrl(): string {
  const configured = import.meta.env.VITE_WS_URL?.trim()
  if (configured) {
    try {
      const url = new URL(configured, window.location.origin)
      if (url.protocol === 'http:') url.protocol = 'ws:'
      if (url.protocol === 'https:') url.protocol = 'wss:'
      if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
        throw new Error(`Unsupported WebSocket protocol: ${url.protocol}`)
      }
      if (url.pathname === '/') url.pathname = '/ws'
      return url.toString().replace(/\/$/, '')
    } catch (error) {
      console.error('[WS] invalid VITE_WS_URL, using safe default', error)
    }
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const hostname = window.location.hostname.replace(/^\[|\]$/g, '')
  const isLocal = ['localhost', '127.0.0.1', '::1'].includes(hostname)
  const localHostname = hostname.includes(':') ? `[${hostname}]` : hostname
  const host = isLocal ? `${localHostname}:8000` : window.location.host
  return `${protocol}//${host}/ws`
}

const WS_URL = resolveWebSocketBaseUrl()
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
    finishGame,
    setForbiddenWords,
    setRoundData,
    freezePlayer,
    setLastSoundEvent,
    unfreezePlayer,
    eliminatePlayer,
    addSubtitle,
    setPartnerTarget,
    clearPartnerTarget,
    removeProp,
    acquireClue,
    setCurrentMissionIndex,
    setActiveGate,
    setGateArrived,
  } = useGameStore()

  const connect = useCallback((roomId: string, playerId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    useGameStore.getState().setConnectionError(null)
    const ws = new WebSocket(
      `${WS_URL}/${encodeURIComponent(roomId)}/${encodeURIComponent(playerId)}`,
    )

    ws.onopen = () => {
      activeSocket = ws
      console.log('[WS] connected')
      useGameStore.getState().setConnected(true)
      useGameStore.getState().setConnectionError(null)
    }

    ws.onclose = () => {
      if (activeSocket === ws) activeSocket = null
      console.log('[WS] disconnected')
      useGameStore.getState().setConnected(false)
      useGameStore.getState().setConnectionError('서버 연결이 끊겼습니다. 페이지를 새로고침해 주세요.')
    }

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      handleMessage(data)
    }

    ws.onerror = (err) => {
      console.error('[WS] error', err)
      useGameStore.getState().setConnectionError('게임 서버에 연결할 수 없습니다. 네트워크와 서버 주소를 확인해 주세요.')
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
        if (data.active_gate) {
          setActiveGate({
            gateId: data.active_gate.gate_id,
            position: data.active_gate.position,
          })
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
        addSubtitle(data.rescuer_id ?? 'partner', '땡! 다시 움직여!')
        break

      case 'eliminated':
        eliminatePlayer(data.player_id)
        break

      case 'speech_safe':
        addSubtitle(data.player_id, data.transcript)
        break

      case 'sound_ping':
        setLastSoundEvent({
          playerId: data.player_id,
          position: data.position,
          timestamp: Date.now(),
        })
        break

      case 'partner_command':
        setPartnerTarget({
          propId: data.target_prop_id,
          position: data.position,
          utterance: data.utterance,
        })
        addSubtitle('partner', '알겠어. 네가 설명한 물건을 확인하러 갈게!')
        break

      case 'prop_inspected':
        removeProp(data.prop_id)
        clearPartnerTarget()
        setCurrentMissionIndex(data.next_mission_index)
        if (data.is_correct && data.clue) {
          acquireClue(data.clue)
          addSubtitle('partner', `찾았어! 단서 "${data.clue}" 획득!`)
        } else {
          addSubtitle('partner', '이 물건은 아니야. 다른 특징으로 설명해줘.')
        }
        if (data.all_complete) {
          if (data.active_gate) {
            setActiveGate({
              gateId: data.active_gate.gate_id,
              position: data.active_gate.position,
            })
          }
          setPhase('final_spell')
          addSubtitle('partner', '단서를 다 모았어! 잠긴 탈출구 앞으로 가자!')
        }
        break

      case 'gate_arrived':
        setGateArrived(true)
        addSubtitle('system', '게이트 도착 확인. 이제 주문을 외치세요!')
        break

      case 'action_rejected':
        if (data.action_type === 'inspect_prop') {
          clearPartnerTarget()
          addSubtitle('partner', '지금은 그 물건을 확인할 수 없어.')
        } else if (data.action_type === 'gate_arrived' || data.action_type === 'gate_escape') {
          addSubtitle('system', '선택된 탈출 게이트에 더 가까이 이동하세요.')
        } else if (data.action_type === 'rescue') {
          addSubtitle('partner', '조금만 기다려, 더 가까이 가서 다시 구조할게!')
        }
        break

      case 'spell_success':
        setPhase('escape')
        addSubtitle('system', '주문 성공! 탈출구가 열립니다!')
        break

      case 'spell_failed':
        addSubtitle('system', `주문이 달라요! 빠진 단서: ${data.missing.join(', ')}`)
        break

      case 'spell_rejected':
        addSubtitle('system', '잠긴 탈출구 앞에 도착해야 주문을 외칠 수 있습니다.')
        break

      case 'game_over':
        finishGame('lose', data.reason ?? 'game_over')
        break

      case 'game_won':
        finishGame('win', data.reason ?? 'escaped')
        break

      default:
        console.log('[WS] unhandled:', data.type, data)
    }
  }, [setPhase, finishGame, setForbiddenWords, setRoundData, freezePlayer, setLastSoundEvent, unfreezePlayer, eliminatePlayer, addSubtitle, setPartnerTarget, clearPartnerTarget, removeProp, acquireClue, setCurrentMissionIndex, setActiveGate, setGateArrived])

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
