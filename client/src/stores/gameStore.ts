/**
 * 게임 전역 상태 — Zustand
 *
 * 서버에서 WebSocket으로 받은 상태를 여기에 반영하고,
 * React UI와 Three.js 씬이 모두 이 스토어를 구독한다.
 */

import { create } from 'zustand'

export type GamePhase = 'lobby' | 'playing' | 'final_spell' | 'escape' | 'result'
export type PlayerStatus = 'alive' | 'frozen' | 'eliminated' | 'escaped'
export type GameOutcome = 'win' | 'lose' | null
export type MapFloor = 'OUT' | 'ROOF' | 'F3' | 'F2' | 'F1' | 'FIELD' | 'B1'

export interface PlayerState {
  playerId: string
  role: 'human' | 'ai_partner' | 'seeker'
  status: PlayerStatus
  position: {
    x: number
    y?: number
    z: number
    floor?: 'ROOF' | 'F3' | 'F2' | 'F1' | 'FIELD' | 'B1'
    zone?: string
  }
}

export interface PropData {
  prop_id: string
  name: string
  color: string
  mesh: string
  scale: number
  position: { x: number; z: number }
  zone: string
}

export interface PartnerTarget {
  propId: string
  position: { x: number; z: number }
  utterance: string
}

export interface PartnerDecision {
  decision: 'act' | 'clarify' | 'uncertain'
  confidence?: number
  reply: string
  candidates: { propId: string; zone: string; score: number; cues: string[] }[]
}

export interface ActiveGate {
  gateId: string
  position: { x: number; z: number }
}

export interface SubtitleEntry {
  playerId: string
  text: string
  timestamp: number
  speechMode?: string
}

export interface MultiplayerRoomState {
  room_id: string
  host_id: string
  phase: 'waiting' | 'character_select' | 'onboarding' | 'playing' | 'result'
  players: Array<{
    player_id: string
    nickname: string
    character_id: string | null
    is_ready: boolean
    is_host: boolean
  }>
  available_characters: string[]
  runner_slots: number
  ai_slots_needed: number
}

export interface MissionData {
  mission_id: number
  forbidden_word: string
}

export interface ClueFragment {
  total: number
  fragment_id?: string
  symbol?: string
  riddle?: string
  relation?: string
  // 레거시 프롭 라운드 호환 필드. 수직 본편은 완성 답을 보내지 않는다.
  word?: string
  order?: number
}

export interface VerticalProgressionState {
  enabled: boolean
  phase: string
  mission_complete: boolean
  final_route: 'field' | 'basement' | null
  active_floor: 'ROOF' | 'F3' | 'F2' | 'F1' | 'FIELD' | 'B1' | null
  accessible_floors: string[]
  closing_pending_floor: 'ROOF' | 'F3' | 'F2' | 'F1' | 'FIELD' | 'B1' | null
  seeker_count: number
  seeker_threat: string
  time_escalation_enabled: boolean
  forbidden_word_violations: number
  fw_rage_tier: string
  fw_speed_multiplier: number
}

export interface RooftopSignalState {
  signalSequence: Array<'center' | 'east' | 'west'>
  activatedSignalIds: string[]
  nextSignalId: 'center' | 'east' | 'west' | null
  progress: number
  total: number
  completed: boolean
}

export interface FreezeEvent {
  playerId: string
  matchedWord?: string
  matchedStage?: string
  confidence: number
  position: { x: number; z: number }
  timestamp: number
  remainingSeconds?: number
  danger?: { seekerLastSeen?: { position?: { x: number; z: number } } | null }
}

export interface ForbiddenProfileState {
  status: 'observing' | 'active' | 'shifted' | 'locked'
}

export interface ForbiddenProfileSignal {
  id: number
  kind: 'activated' | 'shifted'
  timestamp: number
}

export interface ForbiddenProfileHistoryEntry {
  generation: number
  words: string[]
  reason: string
  activated_at?: number
  retired_at?: number | null
  duration_seconds?: number
}

export interface MissionGenerationState {
  seed: number
  randomized: boolean
  changes: string[]
  source?: 'ollama' | 'seeded_fallback' | string
  scenarioTitle?: string
}

export interface WorldEventState {
  eventId: string
  eventType: 'local_blackout' | 'dual_hunter_breach' | string
  title: string
  message: string
  startedAt: number
  durationMs: number
}

export interface ResultAnalysis {
  forbidden_word_violations: number
  fw_rage_tier: string
  fw_speed_multiplier: number
  final_route?: 'field' | 'basement' | null
  rage_history: Array<{
    tier: string
    triggered_at_violations: number
    speed_multiplier: number
    hearing_expanded: boolean
    vision_expanded: boolean
  }>
  spell_analysis?: {
    answer: string[]
    attempt_count: number
    failed_attempts: Array<{
      attempt: number
      matched_count: number
      required_count: number
      order_valid: boolean
      reason: 'order' | 'incomplete'
    }>
    solved: boolean
  }
}

export interface SoundEvent {
  playerId: string
  position: { x: number; z: number }
  timestamp: number
}

export type HunterState = 'HUNT' | 'INVESTIGATE' | 'DETECTED' | 'CHASE' | 'SEARCH' | 'RUSH_GATE' | 'TRANSIT'
  | 'BLOCK' | 'GUARD' | 'PATROL'
export interface HunterIntent {
  state: HunterState
  targetId: string | null
  target: { x: number; z: number }
  seekerPosition: { x: number; z: number }
  reason: string
  directorTension: number
  speedMultiplier: number
  stageSpeedMultiplier: number
  doorId?: string
  doorPressureSeconds?: number
  mutationPhase?: 'POUND' | 'LUNGE'
}

export type CompanionState = 'EXPLORE_ZONE' | 'INSPECT_CANDIDATE' | 'REPORT_FINDING'
  | 'AVOID_SEEKER' | 'RESCUE_TEAMMATE' | 'REGROUP' | 'FOLLOW_TO_FLOOR'
  | 'MOVE_TO_GATE' | 'ESCAPE' | 'INCAPACITATED'
export interface CompanionIntent {
  companionId?: string
  state: CompanionState
  targetId: string | null
  target: { x: number; z: number }
  partnerPosition: { x: number; z: number }
  reason: string
  arrivalDistance?: number
}

interface GameStore {
  // 연결 상태
  connected: boolean
  connectionError: string | null
  roomId: string
  playerId: string
  selectedCharacterId: string

  // 게임 상태
  phase: GamePhase
  outcome: GameOutcome
  resultReason: string | null
  isPaused: boolean
  currentFloor: MapFloor
  forbiddenWords: string[]
  forbiddenProfile: ForbiddenProfileState | null
  forbiddenProfileSignal: ForbiddenProfileSignal | null
  forbiddenProfileHistory: ForbiddenProfileHistoryEntry[]
  missionGeneration: MissionGenerationState | null
  activeWorldEvent: WorldEventState | null
  freezeCount: number
  roundStartedAt: number | null
  elapsedSeconds: number | null
  verticalProgression: VerticalProgressionState | null
  rooftopSignal: RooftopSignalState | null
  activeMissionPrompt: string | null
  players: Record<string, PlayerState>

  // 라운드 데이터 (미션, 프롭)
  props: PropData[]
  missions: MissionData[]
  totalClues: number
  currentMissionIndex: number
  acquiredClues: ClueFragment[]
  activeGate: ActiveGate | null
  activeTrapIds: string[]
  gateArrived: boolean
  partnerResultStatus: PlayerStatus | 'missing' | null
  resultAnalysis: ResultAnalysis | null
  multiplayerRoom: MultiplayerRoomState | null
  multiplayerError: string | null

  // 프롭 상호작용
  inspectingPropId: string | null  // AI 동료가 조사 중인 프롭
  removedPropIds: string[]  // 획득/제거된 프롭
  partnerTarget: PartnerTarget | null
  partnerDecision: PartnerDecision | null

  // 빙결 이벤트 (연출용)
  lastFreezeEvent: FreezeEvent | null
  lastSoundEvent: SoundEvent | null
  hunterIntent: HunterIntent | null
  secondaryHunterIntent: HunterIntent | null
  doorStates: Record<string, boolean>
  companionIntent: CompanionIntent | null
  companionIntents: Record<string, CompanionIntent>
  rescueRequested: boolean

  // 음성 관련
  isSpeaking: boolean
  lastTranscript: string
  subtitles: SubtitleEntry[]

  // Actions
  setConnected: (connected: boolean) => void
  setConnectionError: (message: string | null) => void
  setRoom: (roomId: string, playerId: string) => void
  setSelectedCharacter: (characterId: string) => void
  setPhase: (phase: GamePhase) => void
  setPaused: (paused: boolean) => void
  setCurrentFloor: (floor: MapFloor) => void
  startRound: () => void
  finishGame: (outcome: Exclude<GameOutcome, null>, reason: string) => void
  setForbiddenWords: (words: string[]) => void
  setForbiddenProfile: (profile: ForbiddenProfileState | null) => void
  signalForbiddenProfile: (kind: ForbiddenProfileSignal['kind']) => void
  setForbiddenProfileHistory: (history: ForbiddenProfileHistoryEntry[]) => void
  setMissionGeneration: (missionGeneration: MissionGenerationState | null) => void
  setActiveWorldEvent: (event: WorldEventState | null) => void
  setRoundData: (props: PropData[], missions: MissionData[], totalClues: number) => void
  setVerticalProgression: (progression: VerticalProgressionState) => void
  setRooftopSignal: (signal: RooftopSignalState) => void
  setActiveMissionPrompt: (prompt: string | null) => void
  hydratePlayers: (players: Record<string, Omit<PlayerState, 'playerId'>>) => void
  setActiveGate: (gate: ActiveGate) => void
  setActiveTraps: (trapIds: string[]) => void
  consumeTrap: (trapId: string) => void
  setGateArrived: (arrived: boolean) => void
  acquireClue: (clue: ClueFragment) => void
  setCurrentMissionIndex: (index: number) => void
  setInspectingProp: (propId: string | null) => void
  removeProp: (propId: string) => void
  setPartnerTarget: (target: PartnerTarget) => void
  setPartnerDecision: (decision: PartnerDecision | null) => void
  clearPartnerTarget: () => void
  updatePlayer: (playerId: string, update: Partial<PlayerState>) => void
  freezePlayer: (event: FreezeEvent) => void
  requestRescue: () => void
  setLastSoundEvent: (event: SoundEvent) => void
  setHunterIntent: (intent: HunterIntent) => void
  setSecondaryHunterIntent: (intent: HunterIntent | null) => void
  setDoorState: (doorId: string, open: boolean) => void
  setCompanionIntent: (intent: CompanionIntent) => void
  unfreezePlayer: (playerId: string) => void
  eliminatePlayer: (playerId: string) => void
  escapePlayer: (playerId: string) => void
  setPartnerResultStatus: (status: PlayerStatus | 'missing') => void
  setResultAnalysis: (analysis: ResultAnalysis | null) => void
  setMultiplayerRoom: (room: MultiplayerRoomState | null) => void
  setMultiplayerError: (message: string | null) => void
  setSpeaking: (isSpeaking: boolean) => void
  setLastTranscript: (transcript: string) => void
  addSubtitle: (playerId: string, text: string, speechMode?: string) => void
  reset: () => void
}

const initialState = {
  connected: false,
  connectionError: null as string | null,
  roomId: '',
  playerId: '',
  selectedCharacterId: 'R01',
  phase: 'lobby' as GamePhase,
  outcome: null as GameOutcome,
  resultReason: null as string | null,
  isPaused: false,
  currentFloor: 'OUT' as const,
  forbiddenWords: [],
  forbiddenProfile: null as ForbiddenProfileState | null,
  forbiddenProfileSignal: null as ForbiddenProfileSignal | null,
  forbiddenProfileHistory: [] as ForbiddenProfileHistoryEntry[],
  missionGeneration: null as MissionGenerationState | null,
  activeWorldEvent: null as WorldEventState | null,
  freezeCount: 0,
  roundStartedAt: null as number | null,
  elapsedSeconds: null as number | null,
  verticalProgression: null as VerticalProgressionState | null,
  rooftopSignal: null as RooftopSignalState | null,
  activeMissionPrompt: null as string | null,
  props: [] as PropData[],
  missions: [] as MissionData[],
  totalClues: 0,
  currentMissionIndex: 0,
  acquiredClues: [] as ClueFragment[],
  activeGate: null as ActiveGate | null,
  activeTrapIds: [] as string[],
  gateArrived: false,
  partnerResultStatus: null as PlayerStatus | 'missing' | null,
  resultAnalysis: null as ResultAnalysis | null,
  multiplayerRoom: null as MultiplayerRoomState | null,
  multiplayerError: null as string | null,
  inspectingPropId: null as string | null,
  removedPropIds: [] as string[],
  partnerTarget: null as PartnerTarget | null,
  partnerDecision: null as PartnerDecision | null,
  players: {},
  lastFreezeEvent: null,
  lastSoundEvent: null,
  hunterIntent: null as HunterIntent | null,
  secondaryHunterIntent: null as HunterIntent | null,
  doorStates: {} as Record<string, boolean>,
  companionIntent: null as CompanionIntent | null,
  companionIntents: {} as Record<string, CompanionIntent>,
  rescueRequested: false,
  isSpeaking: false,
  lastTranscript: '',
  subtitles: [],
}

function samePosition(
  left: { x: number; z: number },
  right: { x: number; z: number },
): boolean {
  return left.x === right.x && left.z === right.z
}

function sameHunterIntent(left: HunterIntent | null, right: HunterIntent): boolean {
  return Boolean(left
    && left.state === right.state
    && left.targetId === right.targetId
    && left.reason === right.reason
    && left.directorTension === right.directorTension
    && left.speedMultiplier === right.speedMultiplier
    && left.doorId === right.doorId
    && left.doorPressureSeconds === right.doorPressureSeconds
    && left.mutationPhase === right.mutationPhase
    && samePosition(left.target, right.target)
    && samePosition(left.seekerPosition, right.seekerPosition))
}

function sameCompanionIntent(left: CompanionIntent | null, right: CompanionIntent): boolean {
  return Boolean(left
    && left.state === right.state
    && left.targetId === right.targetId
    && left.reason === right.reason
    && left.arrivalDistance === right.arrivalDistance
    && samePosition(left.target, right.target)
    && samePosition(left.partnerPosition, right.partnerPosition))
}

export const useGameStore = create<GameStore>((set) => ({
  ...initialState,

  setConnected: (connected) => set({ connected }),

  setConnectionError: (connectionError) => set({ connectionError }),

  setRoom: (roomId, playerId) => set({ roomId, playerId }),

  setSelectedCharacter: (selectedCharacterId) => set({ selectedCharacterId }),

  setPhase: (phase) => set({ phase }),
  setPaused: (isPaused) => set({ isPaused }),
  setCurrentFloor: (currentFloor) => set({ currentFloor }),

  startRound: () => set({
    roundStartedAt: Date.now(),
    elapsedSeconds: null,
    resultAnalysis: null,
    forbiddenProfileSignal: null,
    missionGeneration: null,
  }),

  finishGame: (outcome, resultReason) =>
    set((state) => ({
      phase: 'result',
      outcome,
      resultReason,
      elapsedSeconds: state.roundStartedAt === null
        ? 0
        : Math.max(0, Math.floor((Date.now() - state.roundStartedAt) / 1000)),
    })),

  setForbiddenWords: (words) => set({ forbiddenWords: words }),

  setForbiddenProfile: (forbiddenProfile) => set({ forbiddenProfile }),

  signalForbiddenProfile: (kind) => set((state) => ({
    forbiddenProfileSignal: {
      id: (state.forbiddenProfileSignal?.id ?? 0) + 1,
      kind,
      timestamp: Date.now(),
    },
  })),

  setForbiddenProfileHistory: (forbiddenProfileHistory) => set({ forbiddenProfileHistory }),

  setMissionGeneration: (missionGeneration) => set({ missionGeneration }),

  setActiveWorldEvent: (activeWorldEvent) => set({ activeWorldEvent }),

  setRoundData: (props, missions, totalClues) =>
    set({
      props,
      missions,
      totalClues,
      currentMissionIndex: 0,
      acquiredClues: [],
      removedPropIds: [],
      partnerTarget: null,
      partnerDecision: null,
      inspectingPropId: null,
      gateArrived: false,
    }),

  setVerticalProgression: (verticalProgression) => set({ verticalProgression }),
  setRooftopSignal: (rooftopSignal) => set({ rooftopSignal }),
  setActiveMissionPrompt: (activeMissionPrompt) => set({ activeMissionPrompt }),

  hydratePlayers: (players) => set((state) => {
    const hydratedPlayers = Object.fromEntries(
      Object.entries(players).map(([playerId, player]) => [playerId, { playerId, ...player }]),
    ) as Record<string, PlayerState>
    const playerFloor = hydratedPlayers[state.playerId]?.position.floor
    return {
      players: hydratedPlayers,
      currentFloor: playerFloor ?? state.currentFloor,
    }
  }),

  setActiveGate: (activeGate) => set({ activeGate, gateArrived: false }),

  setActiveTraps: (activeTrapIds) => set({ activeTrapIds }),

  consumeTrap: (trapId) => set((state) => ({
    activeTrapIds: state.activeTrapIds.filter((id) => id !== trapId),
  })),

  setGateArrived: (gateArrived) => set({ gateArrived }),

  acquireClue: (clue) =>
    set((state) => ({
      acquiredClues: state.acquiredClues.some((entry) => (
        clue.fragment_id
          ? entry.fragment_id === clue.fragment_id
          : entry.order === clue.order && entry.word === clue.word
      ))
        ? state.acquiredClues
        : [...state.acquiredClues, clue],
      totalClues: Math.max(state.totalClues, clue.total),
    })),

  setCurrentMissionIndex: (currentMissionIndex) => set({ currentMissionIndex }),

  setInspectingProp: (propId) => set({ inspectingPropId: propId }),

  removeProp: (propId) =>
    set((state) => ({
      removedPropIds: state.removedPropIds.includes(propId)
        ? state.removedPropIds
        : [...state.removedPropIds, propId],
    })),

  setPartnerTarget: (partnerTarget) => set({ partnerTarget }),

  setPartnerDecision: (partnerDecision) => set({ partnerDecision }),

  clearPartnerTarget: () => set({ partnerTarget: null, inspectingPropId: null }),

  updatePlayer: (playerId, update) =>
    set((state) => ({
      players: {
        ...state.players,
        [playerId]: {
          ...state.players[playerId],
          ...update,
        },
      },
    })),

  freezePlayer: (event) =>
    set((state) => ({
      lastFreezeEvent: event,
      rescueRequested: false,
      freezeCount: state.freezeCount + (
        event.playerId === state.playerId && event.matchedStage !== 'trap' ? 1 : 0
      ),
      players: {
        ...state.players,
        [event.playerId]: {
          ...state.players[event.playerId],
          status: 'frozen',
          // 빙결 이벤트는 x/z만 공개한다. 기존 층·높이·구역을 보존하지 않으면
          // 구조 직후 플레이어의 floor가 사라져 미션 진행과 같은 층 위협 판정이 멈춘다.
          position: {
            ...state.players[event.playerId]?.position,
            ...event.position,
          },
        },
      },
    })),

  setLastSoundEvent: (event) => set({ lastSoundEvent: event }),

  setHunterIntent: (hunterIntent) => set((state) => (
    sameHunterIntent(state.hunterIntent, hunterIntent) ? state : { hunterIntent }
  )),
  setSecondaryHunterIntent: (secondaryHunterIntent) => set({ secondaryHunterIntent }),
  setDoorState: (doorId, open) => set((state) => ({
    doorStates: { ...state.doorStates, [doorId]: open },
  })),

  setCompanionIntent: (intent) => set((state) => {
    const companionId = intent.companionId ?? 'partner'
    const previous = state.companionIntents[companionId]
    if (sameCompanionIntent(previous ?? null, intent)) return state
    return {
      companionIntent: companionId === 'partner' ? intent : state.companionIntent,
      companionIntents: { ...state.companionIntents, [companionId]: intent },
    }
  }),

  requestRescue: () => set({ rescueRequested: true }),

  unfreezePlayer: (playerId) =>
    set((state) => ({
      rescueRequested: playerId === state.playerId ? false : state.rescueRequested,
      players: {
        ...state.players,
        [playerId]: {
          ...state.players[playerId],
          status: 'alive',
        },
      },
    })),

  eliminatePlayer: (playerId) =>
    set((state) => ({
      players: {
        ...state.players,
        [playerId]: {
          ...state.players[playerId],
          status: 'eliminated',
        },
      },
    })),

  escapePlayer: (playerId) =>
    set((state) => ({
      players: {
        ...state.players,
        [playerId]: { ...state.players[playerId], status: 'escaped' },
      },
    })),

  setPartnerResultStatus: (partnerResultStatus) => set({ partnerResultStatus }),
  setResultAnalysis: (resultAnalysis) => set({ resultAnalysis }),
  setMultiplayerRoom: (multiplayerRoom) => set({ multiplayerRoom, multiplayerError: null }),
  setMultiplayerError: (multiplayerError) => set({ multiplayerError }),

  setSpeaking: (isSpeaking) => set({ isSpeaking }),

  setLastTranscript: (transcript) => set({ lastTranscript: transcript }),

  addSubtitle: (playerId, text, speechMode) =>
    set((state) => ({
      subtitles: [
        ...state.subtitles.slice(-4), // 최근 5개만 유지
        { playerId, text, timestamp: Date.now(), speechMode },
      ],
    })),

  reset: () => set(initialState),
}))
