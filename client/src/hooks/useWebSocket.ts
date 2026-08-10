/**
 * WebSocket 연결 관리 hook
 * - 서버와 연결/재연결
 * - 수신 메시지를 Zustand 스토어에 반영
 * - 메시지 전송 함수 제공
 */

import { useEffect, useRef, useCallback } from 'react'
import { useGameStore } from '../stores/gameStore'

function resolveWebSocketBaseUrl(): string {
  const devPort = import.meta.env.DEV
    ? new URLSearchParams(window.location.search).get('wsPort')
    : null
  if (devPort && /^\d{2,5}$/.test(devPort)) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const hostname = window.location.hostname.replace(/^\[|\]$/g, '')
    const localHostname = hostname.includes(':') ? `[${hostname}]` : hostname
    return `${protocol}//${localHostname}:${devPort}/ws`
  }
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
  const localHostname = hostname.includes(':') ? `[${hostname}]` : hostname
  // Vite 개발 서버는 LAN에서도 5173, 게임 서버는 다른 로컬 서비스와
  // 충돌하지 않는 전용 8001 포트를 사용한다.
  // 같은 origin을 쓰면 5173의 Vite에 WebSocket을 요청한 뒤 구형 데모로
  // 조용히 폴백해 서버의 옥상 스폰/수직 진행 계약이 전부 사라진다.
  const host = import.meta.env.DEV ? `${localHostname}:8001` : window.location.host
  return `${protocol}//${host}/ws`
}

const WS_URL = resolveWebSocketBaseUrl()
let activeSocket: WebSocket | null = null

/** Three.js 프레임 루프에서도 동일한 게임 연결을 사용한다. */
export function sendGameMessage(message: object): boolean {
  if (activeSocket?.readyState === WebSocket.OPEN) {
    activeSocket.send(JSON.stringify(message))
    return true
  }
  return false
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
    const reportConnectionFailure = () => {
      if (opened) return
      wsRef.current = null
      activeSocket = null
      useGameStore.getState().setConnected(false)
      useGameStore.getState().setConnectionError(
        '게임 서버에 연결할 수 없습니다. 잠시 후 다시 시도하거나 운영자에게 알려주세요.',
      )
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
        reportConnectionFailure()
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
        reportConnectionFailure()
      }
    }, 2500)
  }, [])

  const handleMessage = useCallback((data: any) => {
    switch (data.type) {
      case 'room_created':
      case 'room_joined':
      case 'character_selected':
      case 'player_ready_changed':
        if (data.room) useGameStore.getState().setMultiplayerRoom(data.room)
        break

      case 'room_error':
        useGameStore.getState().setMultiplayerError(data.reason ?? '멀티플레이 요청을 처리할 수 없습니다.')
        break

      case 'game_starting':
        addSubtitle('system', '모든 플레이어 준비 완료. AI 빈 슬롯을 확정하고 게임을 시작합니다.')
        break

      case 'game_started':
        startRound()
        setForbiddenWords(data.state.forbidden_words ?? [])
        useGameStore.getState().setForbiddenProfile(data.state.forbidden_profile ?? null)
        setPhase('playing')
        if (data.state.players) hydratePlayers(data.state.players)
        if (data.state.door_states) {
          for (const [doorId, open] of Object.entries(data.state.door_states)) {
            useGameStore.getState().setDoorState(doorId, Boolean(open))
          }
        }
        if (data.state.vertical_progression) {
          useGameStore.getState().setVerticalProgression(data.state.vertical_progression)
        }
        if (data.state.rooftop_signal) {
          useGameStore.getState().setRooftopSignal({
            signalSequence: data.state.rooftop_signal.signal_sequence ?? ['center', 'east', 'west'],
            activatedSignalIds: data.state.rooftop_signal.activated_signal_ids ?? [],
            nextSignalId: data.state.rooftop_signal.next_signal_id ?? null,
            progress: data.state.rooftop_signal.progress ?? 0,
            total: data.state.rooftop_signal.total ?? 3,
            completed: Boolean(data.state.rooftop_signal.completed),
          })
        }
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
        if (data.state.mission_generation?.randomized) {
          const seed = Number(data.state.mission_generation.seed ?? 0)
          useGameStore.getState().setMissionGeneration({
            seed,
            randomized: true,
            source: String(data.state.mission_generation.source ?? 'seeded_fallback'),
            scenarioTitle: data.state.mission_generation.scenario_title
              ? String(data.state.mission_generation.scenario_title)
              : undefined,
            changes: Array.isArray(data.state.mission_generation.changes)
              ? data.state.mission_generation.changes
              : [],
          })
          addSubtitle(
            'system',
            `이번 판 미션 #${String(seed).padStart(6, '0')} 구성 완료 · 신호, 증거 위치, 기호와 경로가 새로 배치되었습니다.`,
          )
        }
        if (data.state.active_world_event) {
          useGameStore.getState().setActiveWorldEvent({
            eventId: String(data.state.active_world_event.event_id),
            eventType: String(data.state.active_world_event.event_type),
            title: String(data.state.active_world_event.title ?? '학교 이상 현상'),
            message: String(data.state.active_world_event.message ?? ''),
            startedAt: Date.now(),
            durationMs: Number(data.state.active_world_event.remaining_seconds ?? 0) * 1000,
          })
        }
        break

      case 'mission_generation_ready':
        useGameStore.getState().setMissionGeneration({
          seed: Number(data.seed ?? 0),
          randomized: Boolean(data.randomized),
          source: String(data.source ?? 'ollama'),
          scenarioTitle: data.scenario_title ? String(data.scenario_title) : undefined,
          changes: Array.isArray(data.changes) ? data.changes : [],
        })
        addSubtitle(
          'system',
          `OLLAMA 사건 생성 완료 — ${String(data.scenario_title ?? '야간 학교 봉쇄')}. AI와 말로 풀어야 하는 층별 규칙이 정해졌습니다.`,
        )
        break

      case 'forbidden_profile_shifted':
        {
          const gameState = useGameStore.getState()
          const firstActivation = gameState.forbiddenProfile?.status === 'observing'
            || gameState.forbiddenProfile === null
          gameState.setForbiddenProfile(data.forbidden_profile)
          gameState.signalForbiddenProfile(firstActivation ? 'activated' : 'shifted')
          addSubtitle('system', firstActivation
            ? '학교가 당신의 말버릇을 학습했습니다. 금지어는 공개되지 않습니다.'
            : '금지어 규칙이 바뀌었습니다. 어떤 단어인지는 공개되지 않습니다.')
        }
        break

      case 'forbidden_profile_locked':
        useGameStore.getState().setForbiddenProfile(data.forbidden_profile)
        addSubtitle('system', '말의 흔적이 봉인되었습니다.')
        break

      case 'vertical_stage_advanced':
        useGameStore.getState().setActiveMissionPrompt(null)
        useGameStore.getState().setVerticalProgression({
          enabled: true,
          ...data.progression,
        })
        if (data.clue) {
          acquireClue(data.clue)
          addSubtitle('system', data.clue.riddle
            ? `주문 파편 ${data.clue.symbol ?? '◆'} 확보 · ${data.clue.riddle}`
            : `주문 조각 “${data.clue.word}”을 확보했습니다.`)
        }
        addSubtitle('system', `${data.completed_phase} 완료 — 다음 구역이 열렸습니다.`)
        break

      case 'rooftop_signal_progress':
        useGameStore.getState().setRooftopSignal({
          signalSequence: data.signal_sequence
            ?? useGameStore.getState().rooftopSignal?.signalSequence
            ?? ['center', 'east', 'west'],
          activatedSignalIds: data.activated_signal_ids ?? [],
          nextSignalId: data.next_signal_id ?? null,
          progress: data.progress ?? 0,
          total: data.total ?? 3,
          completed: Boolean(data.completed),
        })
        addSubtitle('system', data.completed
          ? '기억한 신호열 복원 완료. 북서 계단실 방화문이 열립니다.'
          : `옥상 신호 ${data.progress ?? 0}/${data.total ?? 3} 입력 — 기억한 다음 위치로 이동하세요.`)
        break

      case 'vertical_mission_started':
        useGameStore.getState().setActiveMissionPrompt(data.prompt ?? '장치가 활성화되었습니다.')
        addSubtitle('system', data.prompt ?? '장치가 활성화되었습니다.')
        break

      case 'vertical_threat_changed':
        if (data.progression) {
          useGameStore.getState().setVerticalProgression({
            enabled: true,
            ...data.progression,
          })
        }
        addSubtitle('system', data.seeker_threat === 'limited_hunt'
          ? '붉은 실루엣이 움직입니다. 큰 소리와 직접 시야를 피하세요.'
          : '학교 안의 위협 상태가 바뀌었습니다.')
        break

      case 'seeker_phase_event':
        addSubtitle('system', data.message ?? '학교 안에서 술래의 움직임이 달라졌습니다.')
        break

      case 'world_event_started':
        useGameStore.getState().setActiveWorldEvent({
          eventId: String(data.event_id),
          eventType: String(data.event_type),
          title: String(data.title ?? '학교 이상 현상'),
          message: String(data.message ?? ''),
          startedAt: Date.now(),
          durationMs: Number(data.duration_seconds ?? 0) * 1000,
        })
        addSubtitle('system', `${String(data.title ?? '학교 이상 현상')} — ${String(data.message ?? '')}`)
        break

      case 'vertical_mission_feedback':
        {
          const missing = Array.isArray(data.missing_labels)
            ? data.missing_labels.join(' · ')
            : '도구 · 잠긴 출입구 · 개방 행동'
        useGameStore.getState().setActiveMissionPrompt(
          `전달되지 않은 의미: ${missing}. Q로 표현을 바꿔 다시 방송하세요.`,
        )
        addSubtitle('system', `방송 해석 실패 — 빠진 의미: ${missing}`)
        break
        }

      case 'vertical_candidate_inspected':
        clearPartnerTarget()
        setPartnerDecision(null)
        if (data.success) {
          useGameStore.getState().setActiveMissionPrompt(
            'AI가 방송 기록과 일치하는 증거를 확인했습니다. 다음 구역 개방을 기다리세요.',
          )
          addSubtitle(data.companion_id ?? 'partner', data.feedback ?? '방송 기록과 일치해. 이 후보가 맞아.', data.speech_mode)
        } else {
          useGameStore.getState().setActiveMissionPrompt(
            `AI가 ${data.zone ?? '해당 구역'} 후보를 직접 확인했지만 기록과 달랐습니다. Q로 재질·형태·쓰임의 차이를 교정하세요.`,
          )
          addSubtitle(data.companion_id ?? 'partner', data.feedback ?? '직접 확인해 보니 달라. 차이를 교정해 줘.', data.speech_mode)
        }
        break

      case 'vertical_mission_ready':
        useGameStore.getState().setActiveMissionPrompt(
          `${data.message ?? 'AI 확인은 끝났지만 팀 이동이 필요합니다.'} 조건을 맞춘 뒤 방송 콘솔에서 E를 누르세요.`,
        )
        addSubtitle('system', data.message ?? 'AI 확인 완료. 남은 팀 상태를 정리한 뒤 방송 콘솔을 다시 작동하세요.')
        break

      case 'intercom_result':
        addSubtitle('system', data.success
          ? '인터폰 전달 성공. 1층 방화문이 열립니다.'
          : data.order_valid === false
            ? '기호의 순서가 다릅니다. AI의 재확인 보고를 듣고 다시 전달하세요.'
            : '기호가 빠졌습니다. AI가 어긋난 묶음을 다시 확인합니다. 재시도할 수 있습니다.')
        break

      case 'intercom_ai_ready':
        addSubtitle(data.companion_id ?? 'partner', '인터폰 판독 위치에 도착했습니다. 기호 보고를 확인하세요.')
        break

      case 'broadcast_ai_ready':
        addSubtitle(data.companion_id ?? 'partner', '방송 수신 준비 완료. 우회 표현에서 빠진 뜻을 함께 확인할게.')
        break

      case 'simultaneous_ai_ready':
        useGameStore.getState().setActiveMissionPrompt('AI가 원격 B 장치에 도착했습니다. 경비실 A 장치에서 E를 눌러 동시에 해제하세요.')
        addSubtitle(data.companion_id ?? 'partner', '원격 B 장치 준비 완료. 경비실 A 장치에서 E를 누르세요.')
        break

      case 'security_route_progress':
        useGameStore.getState().setActiveMissionPrompt(data.success
          ? data.expected_command
            ? `관제 경로 ${data.accepted_commands}/${data.total_commands} · 다음 CCTV 표식: ${data.expected_command} · Q로 안내`
            : '경로 안내 완료 · AI가 원격 봉쇄 장치로 이동 중'
          : `방향 불일치 · 현재 CCTV 표식: ${data.expected_command ?? '재확인'} · 다른 표현으로 다시 안내`)
        addSubtitle('system', data.success
          ? `CCTV 안내 ${data.accepted_commands}/${data.total_commands} 전달`
          : 'AI가 잘못된 통로 앞에서 멈췄습니다. 방향을 다시 설명하세요.')
        break

      case 'security_checkpoint_ready':
        useGameStore.getState().setActiveMissionPrompt(
          `AI가 교차로에 도착했습니다 · 다음 CCTV 표식: ${data.expected_command} · Q로 방향 안내`,
        )
        addSubtitle(data.companion_id ?? 'partner', '교차로 도착. 다음 방향을 기다립니다.')
        break

      case 'basement_device_status': {
        const status = data.device_status ?? {}
        const stateLabel = status.state === 'standby' ? '대기 중'
          : status.state === 'active' ? '작동 중' : '꺼짐'
        addSubtitle(data.companion_id ?? 'partner', `${status.name ?? '지하 장치'} · ${stateLabel}`)
        break
      }

      case 'basement_device_commanded':
        addSubtitle('system', data.success
          ? `${data.device_name ?? '담당 장치'} 작동 지시 전달 · AI가 실제 조작을 시작합니다.`
          : data.reason === 'human_operated'
            ? '그 장치는 플레이어 담당입니다. 장치 앞에서 E로 직접 작동하세요.'
            : '아직 작동 순서가 아닙니다. AI가 보고한 대기 장치를 확인하세요.')
        break

      case 'device_activated':
        addSubtitle('system', data.success
          ? '두 장치가 동시에 작동했습니다.'
          : data.reason === 'guidance_incomplete'
            ? 'CCTV 경로 안내를 끝내고 AI가 원격 장치에 도착해야 합니다.'
          : data.reason === 'waiting_for_other'
            ? 'A 장치 유지 중 — AI 동료가 B 장치에 도착하면 다시 E를 누르세요.'
            : '동시 조작 시간이 어긋났습니다. 다시 맞춰 보세요.')
        break

      case 'basement_device_activated':
        addSubtitle('system', !data.success && data.reason === 'companion_operated'
          ? '이 설비는 AI 동료 담당입니다. Q로 장치 작동을 지시하세요.'
          : !data.success && data.reason === 'awaiting_command'
            ? 'AI가 플레이어의 음성 작동 지시를 기다리고 있습니다.'
          : data.completed
          ? '지하 설비 복구 완료. 모은 주문 조각을 준비하세요.'
          : data.reset
            ? '잘못된 순서입니다. 모든 장치가 꺼지고 큰 기계음이 울렸습니다.'
            : `장치 복구 ${data.progress ?? 0}/3 — AI의 다음 대기 상태 보고를 확인하세요.`)
        break

      case 'player_moved': {
        const current = useGameStore.getState().players[data.player_id]
        if (current) {
          useGameStore.getState().updatePlayer(data.player_id, {
            position: { ...current.position, ...data.position },
          })
        }
        break
      }

      case 'actor_floor_changed':
        if (data.route === 'elevator' || data.traversal === 'elevator') {
          window.dispatchEvent(new CustomEvent('game:elevator-arrived', { detail: {
            elevator_id: data.elevator_id,
            target_floor: data.position.floor,
          } }))
        }
        useGameStore.getState().updatePlayer(data.actor_id, { position: data.position })
        if (data.progression) {
          useGameStore.getState().setVerticalProgression({
            enabled: true,
            ...data.progression,
          })
        }
        if (data.closed_floor) {
          addSubtitle('system', `${data.closed_floor} 구역 방화문이 닫혔습니다.`)
        }
        if (data.actor_id === useGameStore.getState().playerId) {
          addSubtitle('system', `${data.position.floor} 구역으로 이동했습니다.`)
        } else if (data.actor_id?.startsWith('seeker')) {
          addSubtitle('system', `술래가 ${data.position.floor} 구역에 나타났습니다.`)
        } else if (data.traversal === 'stairs') {
          addSubtitle(data.actor_id, `동료가 계단으로 ${data.position.floor} 구역에 합류 중입니다.`)
        } else {
          addSubtitle(data.actor_id, `동료가 ${data.position.floor} 구역으로 이동했습니다.`)
        }
        break

      case 'elevator_called':
        window.dispatchEvent(new CustomEvent('game:elevator-called', { detail: data }))
        break

      case 'elevator_arrived':
        window.dispatchEvent(new CustomEvent('game:elevator-arrived', { detail: data }))
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

      case 'speech_uncertain':
        addSubtitle('system', data.message
          ?? '음성이 불분명했습니다. 같은 뜻을 다른 표현으로 다시 말해 주세요.')
        break

      case 'sound_ping':
        setLastSoundEvent({
          playerId: data.player_id,
          position: data.position,
          timestamp: Date.now(),
        })
        break

      case 'door_state_changed':
        useGameStore.getState().setDoorState(String(data.door_id), Boolean(data.open))
        if (data.sealed) addSubtitle('system', 'ON AIR — 방송실 방화문이 닫혔습니다. 술래가 떠날 때까지 말소리를 멈추세요.')
        else if (data.forced) addSubtitle('system', '쾅! 술래가 소리를 따라 문을 강제로 열었습니다.')
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
          stageSpeedMultiplier: data.stage_speed_multiplier ?? 1,
          doorId: data.door_id,
          doorPressureSeconds: data.door_pressure_seconds,
          mutationPhase: data.mutation_phase,
        })
        useGameStore.getState().setSecondaryHunterIntent(data.secondary ? {
          state: data.secondary.state,
          targetId: data.secondary.target_id,
          target: data.secondary.target,
          seekerPosition: data.secondary.seeker_position,
          reason: data.secondary.reason,
          directorTension: data.director_tension ?? 0,
          speedMultiplier: data.secondary.speed_multiplier ?? 1,
          stageSpeedMultiplier: data.secondary.stage_speed_multiplier ?? 1,
          doorId: data.secondary.door_id,
          doorPressureSeconds: data.secondary.door_pressure_seconds,
          mutationPhase: data.secondary.mutation_phase,
        } : null)
        break

      case 'companion_intent':
        useGameStore.getState().setCompanionIntent({
          companionId: data.companion_id ?? 'partner',
          state: data.state,
          targetId: data.target_id,
          target: data.target,
          partnerPosition: data.partner_position,
          reason: data.reason,
          arrivalDistance: data.arrival_distance,
        })
        break

      case 'companion_report':
        addSubtitle(data.companion_id ?? 'partner', data.message, data.speech_mode)
        break

      case 'companion_seeker_report':
        addSubtitle(data.companion_id ?? 'partner', data.message, data.speech_mode)
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
        addSubtitle('partner', data.reply, data.speech_mode)
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

      case 'final_station_activated':
        if (data.actor_id === useGameStore.getState().playerId) setGateArrived(true)
        addSubtitle('system', `파이널 장치 활성화 ${data.ready_count}/${data.required_count}`)
        break

      case 'vertical_final_ready':
        setPhase('final_spell')
        setGateArrived(true)
        addSubtitle('system', `전원 준비 완료. ${data.required_clues ?? 3}개 파편의 수수께끼를 풀고 관계 표식 순서로 외치세요!`)
        break

      case 'action_rejected':
        if (data.action_type === 'inspect_prop') {
          clearPartnerTarget()
          addSubtitle('partner', '지금은 그 물건을 확인할 수 없어.')
        } else if (data.action_type === 'gate_arrived' || data.action_type === 'gate_escape') {
          addSubtitle('system', '선택된 탈출 게이트에 더 가까이 이동하세요.')
        } else if (data.action_type === 'rescue') {
          addSubtitle('partner', '조금만 기다려, 더 가까이 가서 다시 구조할게!')
        } else if (data.action_type === 'interact_stage_mission'
          || data.action_type === 'intercom_submit'
          || data.action_type === 'security_direction'
          || data.action_type === 'activate_device'
          || data.action_type === 'activate_basement_device'
          || data.action_type === 'use_floor_transition'
          || data.action_type === 'cross_rooftop_stair_boundary'
          || data.action_type === 'vertical_escape'
          || data.action_type === 'use_elevator'
          || data.action_type === 'call_elevator'
          || data.action_type === 'request_elevator_trip'
          || data.action_type === 'announce_elevator_arrival') {
          addSubtitle('system', data.reason ?? '현재 위치에서는 장치를 사용할 수 없습니다.')
        }
        break

      case 'spell_success':
        if (data.progression) {
          useGameStore.getState().setVerticalProgression({ enabled: true, ...data.progression })
        }
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
        useGameStore.getState().setResultAnalysis(Array.isArray(data.rage_history) ? data : null)
        if (data.forbidden_profile_history) {
          useGameStore.getState().setForbiddenProfileHistory(data.forbidden_profile_history)
        }
        finishGame('lose', data.reason ?? 'game_over')
        break

      case 'game_won':
        useGameStore.getState().setResultAnalysis(Array.isArray(data.rage_history) ? data : null)
        if (data.partner_status) useGameStore.getState().setPartnerResultStatus(data.partner_status)
        if (data.forbidden_profile_history) {
          useGameStore.getState().setForbiddenProfileHistory(data.forbidden_profile_history)
        }
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
  }, [])

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      const ws = wsRef.current
      wsRef.current = null
      if (activeSocket === ws) activeSocket = null
      ws?.close()
    }
  }, [])

  return { connect, send, disconnect }
}
