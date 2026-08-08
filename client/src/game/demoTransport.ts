/** 서버를 실행할 수 없는 심사 환경용 결정적 로컬 게임 transport. */

import { actorSpawnPosition } from './spawnContract'

type Emit = (message: Record<string, unknown>) => void

const CLUES = [
  { word: '별', order: 2, total: 3 },
  { word: '달', order: 1, total: 3 },
  { word: '새벽', order: 3, total: 3 },
]
const PROP_POOL = [
  { word: '열쇠', prop_id: 'demo-key', name: '작은 열쇠', color: '#d8c36a', mesh: 'box', scale: 0.35 },
  { word: '커피', prop_id: 'demo-coffee', name: '따뜻한 컵', color: '#70452b', mesh: 'cylinder', scale: 0.4 },
  { word: '빨간', prop_id: 'demo-red', name: '붉은 공', color: '#d93645', mesh: 'sphere', scale: 0.4 },
  { word: '우산', prop_id: 'demo-umbrella', name: '접힌 우산', color: '#466a8c', mesh: 'cylinder', scale: 0.45 },
  { word: '책', prop_id: 'demo-book', name: '낡은 책', color: '#6d5038', mesh: 'box', scale: 0.4 },
]
const GATE = { gate_id: 'gate_back', position: { x: -58, z: -56 } }
const ROOFTOP_PROGRESSION = {
  enabled: true,
  phase: 'rooftop_intro',
  mission_complete: false,
  final_route: null,
  active_floor: 'ROOF',
  accessible_floors: ['ROOF'],
  closing_pending_floor: null,
  seeker_count: 0,
  seeker_threat: 'inactive',
  time_escalation_enabled: true,
  forbidden_word_violations: 0,
  fw_rage_tier: 'calm',
  fw_speed_multiplier: 1,
}
const ROOFTOP_SIGNALS = ['center', 'east', 'west'] as const

export default class DemoTransport {
  private playerId: string
  private emit: Emit
  private phase = 'lobby'
  private missionIndex = 0
  private rooftopSignalIndex = 0
  private gateArrived = false
  private playerPosition = actorSpawnPosition('human')
  private seekerPosition = actorSpawnPosition('seeker')
  private companionPositions = {
    partner: actorSpawnPosition('partner'),
    'partner-2': actorSpawnPosition('partner-2'),
  }
  private pendingInspection = false
  private paused = false
  private observedUtterances: string[] = []
  private activeForbidden: string[] = []
  private appliedThrough = 0
  private lastShiftAt = 0
  private timers = new Set<number>()
  private selected = [...PROP_POOL].sort(() => Math.random() - 0.5).slice(0, 3).map((item, index) => ({
    ...item,
    position: [{ x: -9, z: -5 }, { x: 6, z: -6 }, { x: -6, z: 6 }][index],
    zone: ['A', 'B', 'C'][index],
  }))

  constructor(playerId: string, emit: Emit) {
    this.playerId = playerId
    this.emit = emit
  }

  dispose() {
    this.timers.forEach((timer) => window.clearTimeout(timer))
    this.timers.clear()
  }

  handle(message: any): boolean {
    const payload = message?.payload ?? {}
    if (message?.type === 'start_game') this.start()
    if (message?.type === 'speech') this.speech(String(payload.transcript ?? ''))
    if (message?.type === 'spell') this.spell(String(payload.spell_text ?? ''))
    if (message?.type === 'action') this.action(payload)
    return true
  }

  private send(message: Record<string, unknown>) {
    queueMicrotask(() => this.emit(message))
  }

  private advanceCompanion(
    companionId: 'partner' | 'partner-2',
    target: { x: number; z: number },
  ) {
    const position = this.companionPositions[companionId]
    const dx = target.x - position.x
    const dz = target.z - position.z
    const distance = Math.hypot(dx, dz)
    if (distance <= 0.8) return position
    const step = Math.min(3.4 * 0.25, distance - 0.8)
    const next = {
      ...position,
      x: position.x + dx / distance * step,
      z: position.z + dz / distance * step,
    }
    this.companionPositions[companionId] = next
    return next
  }

  private later(callback: () => void, delay: number) {
    const timer = window.setTimeout(() => {
      this.timers.delete(timer)
      if (this.paused) {
        this.later(callback, 100)
        return
      }
      callback()
    }, delay)
    this.timers.add(timer)
  }

  private start() {
    this.phase = 'playing'
    this.observedUtterances = []
    this.activeForbidden = []
    this.appliedThrough = 0
    this.lastShiftAt = 0
    this.playerPosition = actorSpawnPosition('human')
    this.seekerPosition = actorSpawnPosition('seeker')
    this.companionPositions = {
      partner: actorSpawnPosition('partner'),
      'partner-2': actorSpawnPosition('partner-2'),
    }
    this.rooftopSignalIndex = 0
    this.send({
      type: 'game_started',
      state: {
        forbidden_words: [],
        forbidden_profile: { status: 'observing' },
        players: {
          [this.playerId]: { role: 'human', status: 'alive', position: this.playerPosition },
          partner: { role: 'ai_partner', status: 'alive', position: actorSpawnPosition('partner') },
          'partner-2': { role: 'ai_partner', status: 'alive', position: actorSpawnPosition('partner-2') },
          seeker: { role: 'seeker', status: 'alive', position: this.seekerPosition },
          'seeker-2': { role: 'seeker', status: 'alive', position: actorSpawnPosition('seeker-2') },
        },
        vertical_progression: ROOFTOP_PROGRESSION,
        rooftop_signal: {
          activated_signal_ids: [], next_signal_id: 'center',
          progress: 0, total: ROOFTOP_SIGNALS.length, completed: false,
        },
      },
      active_gate: GATE,
      active_traps: [],
    })
  }

  private speech(transcript: string) {
    if (this.phase !== 'playing' || !transcript.trim()) return
    this.send({ type: 'sound_ping', player_id: this.playerId, position: this.playerPosition })
    // 현재 세대로 먼저 판정한 뒤에만 이 발화를 관찰한다(소급 판정 금지).
    const forbidden = this.activeForbidden.find((word) => transcript.includes(word))
    this.observeSpeech(transcript)
    if (forbidden) {
      this.send({
        type: 'freeze', player_id: this.playerId,
        position: this.playerPosition,
        remaining_seconds: 30,
      })
      this.later(() => this.send({ type: 'rescued', rescuer_id: 'partner', target_id: this.playerId }), 1800)
      return
    }
    this.send({ type: 'speech_safe', player_id: this.playerId, transcript, is_final: true })
    if (this.pendingInspection || this.missionIndex >= this.selected.length) return
    const prop = this.selected[this.missionIndex]
    this.pendingInspection = true
    this.send({
      type: 'partner_decision', decision: 'act', confidence: 0.84,
      reply: `${prop.zone}구역의 ${prop.name} 후보를 확인해볼게.`,
      candidates: [{ prop_id: prop.prop_id, zone: prop.zone, score: 84, cues: ['우회 설명'] }],
    })
    this.send({ type: 'partner_command', target_prop_id: prop.prop_id, position: prop.position, utterance: transcript })
    this.later(() => {
      const index = this.missionIndex++
      this.pendingInspection = false
      const allComplete = this.missionIndex >= this.selected.length
      if (allComplete) this.phase = 'final_spell'
      this.send({
        type: 'prop_inspected', prop_id: this.selected[index].prop_id, is_correct: true,
        mission_index: index, next_mission_index: this.missionIndex,
        clue: CLUES[index], all_complete: allComplete,
        ...(allComplete ? { active_gate: GATE } : {}),
      })
    }, 900)
  }

  private observeSpeech(transcript: string) {
    this.observedUtterances.push(transcript)
    const total = this.observedUtterances.length
    const initialReady = this.activeForbidden.length === 0 && total >= 3
    const rotationReady = this.activeForbidden.length > 0
      && total - this.appliedThrough >= 5
      && Date.now() - this.lastShiftAt >= 45_000
    if (!initialReady && !rotationReady) return

    const protectedWords = new Set(['얼음', '땡', '술래', '동료', '탈출', '주문', '여기', '저기'])
    const counts = new Map<string, number>()
    this.observedUtterances.slice(-20).forEach((utterance) => {
      for (const word of utterance.match(/[가-힣A-Za-z]{2,}/g) ?? []) {
        if (!protectedWords.has(word)) counts.set(word, (counts.get(word) ?? 0) + 1)
      }
    })
    const ranked = [...counts].sort((left, right) => right[1] - left[1]).map(([word]) => word)
    if (ranked.length === 0) return
    const retained = this.activeForbidden[0]
    this.activeForbidden = retained
      ? [retained, ...ranked.filter((word) => word !== retained).slice(0, 2)]
      : ranked.slice(0, 3)
    this.appliedThrough = total
    this.lastShiftAt = Date.now()
    this.send({ type: 'forbidden_profile_shifted', forbidden_profile: { status: 'shifted' } })
  }

  private spell(text: string) {
    if (this.phase !== 'final_spell') return
    if (!this.gateArrived) {
      this.send({ type: 'spell_rejected', reason: 'gate_required' })
      return
    }
    if (text.replace(/\s+/g, ' ').trim() === '달 별 새벽') {
      this.phase = 'escape'
      this.send({ type: 'spell_success', matched: ['달', '별', '새벽'], order_valid: true })
    } else {
      this.send({ type: 'spell_failed', failure_reason: 'order', matched_count: 3, required_count: 3 })
    }
  }

  private action(payload: any) {
    const action = payload.action_type
    if (action === 'pause_game' && !this.paused && this.phase !== 'result') {
      this.paused = true
      this.send({ type: 'game_paused', player_id: this.playerId })
      return
    }
    if (action === 'resume_game' && this.paused) {
      this.paused = false
      this.send({ type: 'game_resumed', player_id: this.playerId })
      return
    }
    if (this.paused) return
    if (action === 'move') {
      this.playerPosition = { ...this.playerPosition, x: Number(payload.x), z: Number(payload.z) }
    } else if (action === 'interact_stage_mission' && this.rooftopSignalIndex < ROOFTOP_SIGNALS.length) {
      const expected = ROOFTOP_SIGNALS[this.rooftopSignalIndex]
      if (payload.signal_id !== expected) return
      this.rooftopSignalIndex += 1
      const completed = this.rooftopSignalIndex === ROOFTOP_SIGNALS.length
      this.send({
        type: 'rooftop_signal_progress', actor_id: this.playerId,
        signal_id: expected,
        activated_signal_ids: ROOFTOP_SIGNALS.slice(0, this.rooftopSignalIndex),
        next_signal_id: completed ? null : ROOFTOP_SIGNALS[this.rooftopSignalIndex],
        progress: this.rooftopSignalIndex, total: ROOFTOP_SIGNALS.length, completed,
      })
      if (completed) this.send({
        type: 'vertical_stage_advanced', actor_id: this.playerId,
        completed_phase: 'rooftop_intro', next_phase: 'floor_3', clue: null,
        progression: {
          ...ROOFTOP_PROGRESSION,
          phase: 'floor_3', active_floor: 'F3', accessible_floors: ['ROOF', 'F3'],
          closing_pending_floor: 'ROOF', seeker_count: 1,
        },
      })
    } else if (action === 'seeker_think') {
      const playerDistance = Math.hypot(
        this.playerPosition.x - this.seekerPosition.x,
        this.playerPosition.z - this.seekerPosition.z,
      )
      const chasing = playerDistance <= 12 && this.phase !== 'escape'
      const target = this.phase === 'escape'
        ? GATE.position
        : chasing
          ? this.playerPosition
          : this.selected[Math.min(this.missionIndex, this.selected.length - 1)].position
      const dx = target.x - this.seekerPosition.x
      const dz = target.z - this.seekerPosition.z
      const distance = Math.hypot(dx, dz)
      if (distance > 0.01) {
        const step = Math.min(this.phase === 'escape' ? 0.65 : chasing ? 0.48 : 0.3, distance)
        this.seekerPosition = {
          ...this.seekerPosition,
          x: this.seekerPosition.x + dx / distance * step,
          z: this.seekerPosition.z + dz / distance * step,
        }
      }
      this.send({
        type: 'seeker_intent', state: this.phase === 'escape' ? 'RUSH_GATE' : chasing ? 'CHASE' : 'HUNT',
        target_id: chasing ? this.playerId : null, target,
        seeker_position: this.seekerPosition, reason: 'demo_director',
        director_tension: 0.42, speed_multiplier: 0.88,
      })
    } else if (action === 'companion_think') {
      const firstTarget = this.phase === 'escape' ? GATE.position : { x: -5.5, z: -27.8 }
      const secondTarget = this.phase === 'escape' ? GATE.position : { x: -42.5, z: -27.8 }
      this.send({
        type: 'companion_intent', companion_id: 'partner', state: this.phase === 'escape' ? 'MOVE_TO_GATE' : 'EXPLORE_ZONE',
        target_id: this.phase === 'escape' ? null : 'roof_signal_scout_east', target: firstTarget,
        partner_position: this.advanceCompanion('partner', firstTarget), reason: 'demo_script',
      })
      this.send({
        type: 'companion_intent', companion_id: 'partner-2', state: this.phase === 'escape' ? 'MOVE_TO_GATE' : 'EXPLORE_ZONE',
        target_id: this.phase === 'escape' ? null : 'roof_signal_scout_west', target: secondTarget,
        partner_position: this.advanceCompanion('partner-2', secondTarget), reason: 'demo_script',
      })
    } else if (action === 'gate_arrived' && this.phase === 'final_spell') {
      this.gateArrived = true
      this.send({ type: 'gate_arrived', player_id: this.playerId, gate_id: GATE.gate_id })
    } else if (action === 'gate_escape' && this.phase === 'escape') {
      this.phase = 'result'
      this.send({
        type: 'game_won', player_id: this.playerId, reason: 'escaped',
        gate_id: GATE.gate_id, escaped_player_ids: [this.playerId], partner_status: 'alive',
        companion_statuses: { partner: 'alive', 'partner-2': 'alive' },
      })
    } else if (action === 'seeker_catch' && this.phase !== 'result') {
      const distance = Math.hypot(
        this.playerPosition.x - this.seekerPosition.x,
        this.playerPosition.z - this.seekerPosition.z,
      )
      if (payload.target_id === this.playerId && distance <= 1.5) {
        this.phase = 'result'
        this.send({ type: 'game_over', reason: 'caught_by_seeker' })
      }
    } else if (action === 'trap') {
      this.send({
        type: 'freeze', player_id: this.playerId, matched_word: '트랩', matched_stage: 'trap',
        confidence: 1, trap_id: payload.trap_id, position: this.playerPosition, remaining_seconds: 30,
      })
      this.later(() => this.send({ type: 'rescued', rescuer_id: 'partner', target_id: this.playerId }), 1800)
    }
  }
}
