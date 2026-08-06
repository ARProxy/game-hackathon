/** 서버를 실행할 수 없는 심사 환경용 결정적 로컬 게임 transport. */

type Emit = (message: Record<string, unknown>) => void

const WORDS = ['열쇠', '커피', '빨간']
const CLUES = [
  { word: '별', order: 2, total: 3 },
  { word: '달', order: 1, total: 3 },
  { word: '새벽', order: 3, total: 3 },
]
const PROPS = [
  { prop_id: 'demo-key', name: '작은 열쇠', color: '#d8c36a', mesh: 'box', scale: 0.35, position: { x: -9, z: -5 }, zone: 'A' },
  { prop_id: 'demo-coffee', name: '따뜻한 컵', color: '#70452b', mesh: 'cylinder', scale: 0.4, position: { x: 6, z: -6 }, zone: 'B' },
  { prop_id: 'demo-red', name: '붉은 공', color: '#d93645', mesh: 'sphere', scale: 0.4, position: { x: -6, z: 6 }, zone: 'C' },
]
const GATE = { gate_id: 'gate_back', position: { x: -7, z: 38 } }

export default class DemoTransport {
  private playerId: string
  private emit: Emit
  private phase = 'lobby'
  private missionIndex = 0
  private gateArrived = false
  private playerPosition = { x: -9.8, z: -22 }
  private seekerPosition = { x: 26, z: -27 }
  private pendingInspection = false
  private paused = false
  private timers = new Set<number>()

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
    if (message?.type === 'onboarding_complete') this.start()
    if (message?.type === 'speech') this.speech(String(payload.transcript ?? ''))
    if (message?.type === 'spell') this.spell(String(payload.spell_text ?? ''))
    if (message?.type === 'action') this.action(payload)
    return true
  }

  private send(message: Record<string, unknown>) {
    queueMicrotask(() => this.emit(message))
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
    this.send({ type: 'forbidden_words_ready', forbidden_words: WORDS })
    this.send({
      type: 'game_started',
      state: {
        forbidden_words: WORDS,
        players: {
          [this.playerId]: { role: 'human', status: 'alive', position: this.playerPosition },
          partner: { role: 'ai_partner', status: 'alive', position: { x: -16, z: -2 } },
          'partner-2': { role: 'ai_partner', status: 'alive', position: { x: -12.5, z: -2 } },
          seeker: { role: 'seeker', status: 'alive', position: this.seekerPosition },
        },
      },
      round: {
        missions: WORDS.map((forbidden_word, mission_id) => ({ mission_id, forbidden_word })),
        props: PROPS,
        total_clues: CLUES.length,
      },
      active_gate: GATE,
      active_traps: [],
    })
  }

  private speech(transcript: string) {
    if (this.phase !== 'playing' || !transcript.trim()) return
    this.send({ type: 'sound_ping', player_id: this.playerId, position: this.playerPosition })
    const forbidden = WORDS.find((word) => transcript.includes(word))
    if (forbidden) {
      this.send({
        type: 'freeze', player_id: this.playerId, matched_word: forbidden,
        matched_stage: 'exact', confidence: 1, position: this.playerPosition,
        remaining_seconds: 30,
      })
      this.later(() => this.send({ type: 'rescued', rescuer_id: 'partner', target_id: this.playerId }), 1800)
      return
    }
    this.send({ type: 'speech_safe', player_id: this.playerId, transcript, is_final: true })
    if (this.pendingInspection || this.missionIndex >= WORDS.length) return
    const prop = PROPS[this.missionIndex]
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
      const allComplete = this.missionIndex >= WORDS.length
      if (allComplete) this.phase = 'final_spell'
      this.send({
        type: 'prop_inspected', prop_id: PROPS[index].prop_id, is_correct: true,
        mission_index: index, next_mission_index: this.missionIndex,
        clue: CLUES[index], all_complete: allComplete,
        ...(allComplete ? { active_gate: GATE } : {}),
      })
    }, 900)
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
      this.playerPosition = { x: Number(payload.x), z: Number(payload.z) }
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
          : PROPS[Math.min(this.missionIndex, PROPS.length - 1)].position
      const dx = target.x - this.seekerPosition.x
      const dz = target.z - this.seekerPosition.z
      const distance = Math.hypot(dx, dz)
      if (distance > 0.01) {
        const step = Math.min(this.phase === 'escape' ? 0.65 : chasing ? 0.48 : 0.3, distance)
        this.seekerPosition = {
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
      this.send({
        type: 'companion_intent', companion_id: 'partner', state: this.phase === 'escape' ? 'MOVE_TO_GATE' : 'EXPLORE_ZONE',
        target_id: null, target: this.phase === 'escape' ? GATE.position : { x: -9, z: -5 },
        partner_position: { x: -16, z: -2 }, reason: 'demo_script',
      })
      this.send({
        type: 'companion_intent', companion_id: 'partner-2', state: this.phase === 'escape' ? 'MOVE_TO_GATE' : 'EXPLORE_ZONE',
        target_id: null, target: this.phase === 'escape' ? GATE.position : { x: 13, z: 8 },
        partner_position: { x: -12.5, z: -2 }, reason: 'demo_script',
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
