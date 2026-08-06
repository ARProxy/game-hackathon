/**
 * WebSocket 연결 관리 hook
 * - 서버와 연결/재연결
 * - 수신 메시지를 Zustand 스토어에 반영
 * - 메시지 전송 함수 제공
 */

import { useEffect, useRef, useCallback } from 'react'
import { useGameStore } from '../stores/gameStore'
import DemoTransport from '../game/demoTransport'

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
let activeDemo: DemoTransport | null = null

/** Three.js 프레임 루프에서도 동일한 게임 연결을 사용한다. */
export function sendGameMessage(message: object): boolean {
  if (activeSocket?.readyState === WebSocket.OPEN) {
    activeSocket.send(JSON.stringify(message))
    return true
  }
  return activeDemo?.handle(message) ?? false
}

export default function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null)
  const handleMessageRef = useRef<(data: any) => void>(() => undefined)
  const {
    setPhase,
    startRound,
    finishGame,
    setForbiddenWords,
    setRoundData,
    hydratePlayers,
    freezePlayer,
    setLastSoundEvent,
    setHunterIntent,
    unfreezePlayer,
    eliminatePlayer,
    addSubtitle,
    setPartnerTarget,
    setPartnerDecision,
    clearPartnerTarget,
    removeProp,
    acquireClue,
    setCurrentMissionIndex,
    setActiveGate,
    setGateArrived,
  } = useGameStore.getState()

  const connect = useCallback((roomId: string, playerId: string) => {
    if (
      wsRef.current?.readyState === WebSocket.OPEN
      || wsRef.current?.readyState === WebSocket.CONNECTING
    ) return

    useGameStore.getState().setConnectionError(null)
    let opened = false
    const activateDemo = () => {
      if (opened || activeDemo) return
      wsRef.current = null
      activeSocket = null
      activeDemo = new DemoTransport(playerId, (data) => handleMessageRef.current(data))
      useGameStore.getState().setConnected(true)
      useGameStore.getState().setConnectionError(null)
      useGameStore.getState().addSubtitle('system', '로컬 데모 모드로 시작합니다.')
    }
    const ws = new WebSocket(
      `${WS_URL}/${encodeURIComponent(roomId)}/${encodeURIComponent(playerId)}`,
    )

    ws.onopen = () => {
      if (wsRef.current !== ws) return
      opened = true
      activeSocket = ws
      console.log('[WS] connected')
      useGameStore.getState().setConnected(true)
      useGameStore.getState().setConnectionError(null)
    }

    ws.onclose = () => {
      if (wsRef.current !== ws) return
      wsRef.current = null
      if (activeSocket === ws) activeSocket = null
      if (!opened) {
        activateDemo()
        return
      }
      console.log('[WS] disconnected')
      useGameStore.getState().setConnected(false)
      useGameStore.getState().setConnectionError('서버 연결이 끊겼습니다. 페이지를 새로고침해 주세요.')
    }

    ws.onmessage = (event) => {
      if (wsRef.current !== ws) return
      try {
        const data = JSON.parse(event.data)
        if (data && typeof data === 'object') handleMessageRef.current(data)
      } catch (error) {
        console.error('[WS] invalid message', error)
      }
    }

    ws.onerror = (err) => {
      if (wsRef.current !== ws) return
      console.error('[WS] error', err)
      useGameStore.getState().setConnectionError('게임 서버에 연결할 수 없습니다. 네트워크와 서버 주소를 확인해 주세요.')
    }

    wsRef.current = ws
    window.setTimeout(() => {
      if (!opened && wsRef.current === ws) {
        ws.close()
        activateDemo()
      }
    }, 2500)
  }, [])

  const handleMessage = useCallback((data: any) => {
    switch (data.type) {
      case 'forbidden_words_ready':
        setForbiddenWords(data.forbidden_words)
        setPhase('reveal')
        break

      case 'game_started':
        startRound()
        setForbiddenWords(data.state.forbidden_words)
        if (data.state.players) hydratePlayers(data.state.players)
        if (data.round) {
          setRoundData(data.round.props, data.round.missions, data.round.total_clues)
        }
        if (data.active_gate) {
          setActiveGate({
            gateId: data.active_gate.gate_id,
            position: data.active_gate.position,
          })
        }
        if (data.active_traps) useGameStore.getState().setActiveTraps(data.active_traps)
        break

      case 'game_paused':
        useGameStore.getState().setPaused(true)
        break

      case 'game_resumed':
        useGameStore.getState().setPaused(false)
        break

      case 'freeze':
        if (data.trap_id) useGameStore.getState().consumeTrap(data.trap_id)
        freezePlayer({
          playerId: data.player_id,
          matchedWord: data.matched_word,
          matchedStage: data.matched_stage,
          confidence: data.confidence,
          position: data.position,
          timestamp: Date.now(),
          remainingSeconds: data.remaining_seconds,
          danger: data.danger ? { seekerLastSeen: data.danger.seeker_last_seen } : undefined,
        })
        break

      case 'rescued':
        unfreezePlayer(data.target_id)
        addSubtitle(data.rescuer_id ?? 'partner', '땡! 다시 움직여!')
        break

      case 'eliminated':
        eliminatePlayer(data.player_id)
        break

      case 'runner_escaped':
        useGameStore.getState().escapePlayer(data.player_id)
        addSubtitle(data.player_id, '탈출구를 통과했어! 밖에서 기다릴게!')
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

      case 'seeker_intent':
        setHunterIntent({
          state: data.state,
          targetId: data.target_id,
          target: data.target,
          seekerPosition: data.seeker_position,
          reason: data.reason,
          directorTension: data.director_tension ?? 0,
          speedMultiplier: data.speed_multiplier ?? 1,
        })
        break

      case 'companion_intent':
        useGameStore.getState().setCompanionIntent({
          companionId: data.companion_id ?? 'partner',
          state: data.state,
          targetId: data.target_id,
          target: data.target,
          partnerPosition: data.partner_position,
          reason: data.reason,
        })
        break

      case 'companion_report':
        addSubtitle(data.companion_id ?? 'partner', data.message)
        break

      case 'companion_seeker_report':
        addSubtitle(data.companion_id ?? 'partner', data.message)
        break

      case 'companion_assignment':
        addSubtitle('partner', '구조 요청을 확인했어. 각자 상황을 판단할게!')
        break

      case 'partner_command':
        setPartnerTarget({
          propId: data.target_prop_id,
          position: data.position,
          utterance: data.utterance,
        })
        break

      case 'partner_decision':
        if (data.decision !== 'act') clearPartnerTarget()
        setPartnerDecision({
          decision: data.decision,
          confidence: data.confidence,
          reply: data.reply,
          candidates: data.candidates.map((candidate: any) => ({
            propId: candidate.prop_id,
            zone: candidate.zone,
            score: candidate.score,
            cues: candidate.cues,
          })),
        })
        addSubtitle('partner', data.reply)
        break

      case 'prop_inspected':
        removeProp(data.prop_id)
        clearPartnerTarget()
        setPartnerDecision(null)
        setCurrentMissionIndex(data.next_mission_index)
        if (data.is_correct && data.clue) {
          acquireClue(data.clue)
          addSubtitle('partner', `찾았어! ${data.clue.order}번째 주문 조각 "${data.clue.word}" 획득!`)
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
        addSubtitle('system', data.failure_reason === 'order'
          ? '주문 조각의 순서가 맞지 않습니다. 표식을 다시 확인하세요.'
          : `주문 조각이 부족합니다. ${data.matched_count}/${data.required_count}개 인식`)
        break

      case 'spell_rejected':
        addSubtitle('system', '잠긴 탈출구 앞에 도착해야 주문을 외칠 수 있습니다.')
        break

      case 'game_over':
        finishGame('lose', data.reason ?? 'game_over')
        break

      case 'game_won':
        if (data.partner_status) useGameStore.getState().setPartnerResultStatus(data.partner_status)
        finishGame('win', data.reason ?? 'escaped')
        break

      default:
        console.log('[WS] unhandled:', data.type, data)
    }
  }, [setPhase, startRound, finishGame, setForbiddenWords, setRoundData, hydratePlayers, freezePlayer, setLastSoundEvent, setHunterIntent, unfreezePlayer, eliminatePlayer, addSubtitle, setPartnerTarget, setPartnerDecision, clearPartnerTarget, removeProp, acquireClue, setCurrentMissionIndex, setActiveGate, setGateArrived])

  handleMessageRef.current = handleMessage

  const send = useCallback((message: object) => {
    sendGameMessage(message)
  }, [])

  const disconnect = useCallback(() => {
    wsRef.current?.close()
    if (activeSocket === wsRef.current) activeSocket = null
    wsRef.current = null
    activeDemo?.dispose()
    activeDemo = null
  }, [])

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      const ws = wsRef.current
      wsRef.current = null
      if (activeSocket === ws) activeSocket = null
      ws?.close()
      activeDemo?.dispose()
      activeDemo = null
    }
  }, [])

  return { connect, send, disconnect }
}
