/**
 * 게임 전역 상태 — Zustand
 *
 * 서버에서 WebSocket으로 받은 상태를 여기에 반영하고,
 * React UI와 Three.js 씬이 모두 이 스토어를 구독한다.
 */

import { create } from 'zustand'

export type GamePhase = 'lobby' | 'onboarding' | 'reveal' | 'playing' | 'final_spell' | 'escape' | 'result'
export type PlayerStatus = 'alive' | 'frozen' | 'eliminated' | 'escaped'
export type GameOutcome = 'win' | 'lose' | null

export interface PlayerState {
  playerId: string
  role: 'human' | 'ai_partner' | 'seeker'
  status: PlayerStatus
  position: { x: number; z: number }
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
  confidence: number
  reply: string
  candidates: { propId: string; zone: string; score: number; cues: string[] }[]
}

export interface ActiveGate {
  gateId: string
  position: { x: number; z: number }
}

export interface MissionData {
  mission_id: number
  forbidden_word: string
}

export interface ClueFragment { word: string; order: number; total: number }

export interface FreezeEvent {
  playerId: string
  matchedWord: string
  matchedStage: string
  confidence: number
  position: { x: number; z: number }
  timestamp: number
  remainingSeconds?: number
  danger?: { seekerLastSeen?: { position?: { x: number; z: number } } | null }
}

export interface SoundEvent {
  playerId: string
  position: { x: number; z: number }
  timestamp: number
}

export type HunterState = 'HUNT' | 'INVESTIGATE' | 'DETECTED' | 'CHASE' | 'SEARCH' | 'RUSH_GATE'
export interface HunterIntent {
  state: HunterState
  targetId: string | null
  target: { x: number; z: number }
  seekerPosition: { x: number; z: number }
  reason: string
  directorTension: number
  speedMultiplier: number
}

export type CompanionState = 'EXPLORE_ZONE' | 'INSPECT_CANDIDATE' | 'REPORT_FINDING'
  | 'AVOID_SEEKER' | 'RESCUE_TEAMMATE' | 'REGROUP' | 'MOVE_TO_GATE' | 'ESCAPE' | 'INCAPACITATED'
export interface CompanionIntent {
  state: CompanionState
  targetId: string | null
  target: { x: number; z: number }
  partnerPosition: { x: number; z: number }
  reason: string
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
  currentFloor: 'OUT' | 'F1' | 'F2' | 'F3' | 'ROOF'
  forbiddenWords: string[]
  sourceAnswers: string[]
  freezeCount: number
  roundStartedAt: number | null
  elapsedSeconds: number | null
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

  // 프롭 상호작용
  inspectingPropId: string | null  // AI 동료가 조사 중인 프롭
  removedPropIds: string[]  // 획득/제거된 프롭
  partnerTarget: PartnerTarget | null
  partnerDecision: PartnerDecision | null

  // 빙결 이벤트 (연출용)
  lastFreezeEvent: FreezeEvent | null
  lastSoundEvent: SoundEvent | null
  hunterIntent: HunterIntent | null
  companionIntent: CompanionIntent | null
  rescueRequested: boolean

  // 음성 관련
  isSpeaking: boolean
  lastTranscript: string
  subtitles: { playerId: string; text: string; timestamp: number }[]

  // Actions
  setConnected: (connected: boolean) => void
  setConnectionError: (message: string | null) => void
  setRoom: (roomId: string, playerId: string) => void
  setSelectedCharacter: (characterId: string) => void
  setPhase: (phase: GamePhase) => void
  setPaused: (paused: boolean) => void
  setCurrentFloor: (floor: 'OUT' | 'F1' | 'F2' | 'F3' | 'ROOF') => void
  startRound: () => void
  finishGame: (outcome: Exclude<GameOutcome, null>, reason: string) => void
  setForbiddenWords: (words: string[]) => void
  setSourceAnswers: (answers: string[]) => void
  setRoundData: (props: PropData[], missions: MissionData[], totalClues: number) => void
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
  setCompanionIntent: (intent: CompanionIntent) => void
  unfreezePlayer: (playerId: string) => void
  eliminatePlayer: (playerId: string) => void
  escapePlayer: (playerId: string) => void
  setPartnerResultStatus: (status: PlayerStatus | 'missing') => void
  setSpeaking: (isSpeaking: boolean) => void
  setLastTranscript: (transcript: string) => void
  addSubtitle: (playerId: string, text: string) => void
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
  sourceAnswers: [] as string[],
  freezeCount: 0,
  roundStartedAt: null as number | null,
  elapsedSeconds: null as number | null,
  props: [] as PropData[],
  missions: [] as MissionData[],
  totalClues: 0,
  currentMissionIndex: 0,
  acquiredClues: [] as ClueFragment[],
  activeGate: null as ActiveGate | null,
  activeTrapIds: [] as string[],
  gateArrived: false,
  partnerResultStatus: null as PlayerStatus | 'missing' | null,
  inspectingPropId: null as string | null,
  removedPropIds: [] as string[],
  partnerTarget: null as PartnerTarget | null,
  partnerDecision: null as PartnerDecision | null,
  players: {},
  lastFreezeEvent: null,
  lastSoundEvent: null,
  hunterIntent: null as HunterIntent | null,
  companionIntent: null as CompanionIntent | null,
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
    && samePosition(left.target, right.target)
    && samePosition(left.seekerPosition, right.seekerPosition))
}

function sameCompanionIntent(left: CompanionIntent | null, right: CompanionIntent): boolean {
  return Boolean(left
    && left.state === right.state
    && left.targetId === right.targetId
    && left.reason === right.reason
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

  startRound: () => set({ roundStartedAt: Date.now(), elapsedSeconds: null }),

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

  setSourceAnswers: (sourceAnswers) => set({ sourceAnswers }),

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

  hydratePlayers: (players) => set({
    players: Object.fromEntries(
      Object.entries(players).map(([playerId, player]) => [playerId, { playerId, ...player }]),
    ),
  }),

  setActiveGate: (activeGate) => set({ activeGate, gateArrived: false }),

  setActiveTraps: (activeTrapIds) => set({ activeTrapIds }),

  consumeTrap: (trapId) => set((state) => ({
    activeTrapIds: state.activeTrapIds.filter((id) => id !== trapId),
  })),

  setGateArrived: (gateArrived) => set({ gateArrived }),

  acquireClue: (clue) =>
    set((state) => ({
      acquiredClues: [...state.acquiredClues, clue],
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
          position: event.position,
        },
      },
    })),

  setLastSoundEvent: (event) => set({ lastSoundEvent: event }),

  setHunterIntent: (hunterIntent) => set((state) => (
    sameHunterIntent(state.hunterIntent, hunterIntent) ? state : { hunterIntent }
  )),

  setCompanionIntent: (companionIntent) => set((state) => (
    sameCompanionIntent(state.companionIntent, companionIntent) ? state : { companionIntent }
  )),

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

  setSpeaking: (isSpeaking) => set({ isSpeaking }),

  setLastTranscript: (transcript) => set({ lastTranscript: transcript }),

  addSubtitle: (playerId, text) =>
    set((state) => ({
      subtitles: [
        ...state.subtitles.slice(-4), // 최근 5개만 유지
        { playerId, text, timestamp: Date.now() },
      ],
    })),

  reset: () => set(initialState),
}))
