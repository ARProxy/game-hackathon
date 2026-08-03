/**
 * 게임 전역 상태 — Zustand
 *
 * 서버에서 WebSocket으로 받은 상태를 여기에 반영하고,
 * React UI와 Three.js 씬이 모두 이 스토어를 구독한다.
 */

import { create } from 'zustand'

export type GamePhase = 'lobby' | 'onboarding' | 'playing' | 'final_spell' | 'result'
export type PlayerStatus = 'alive' | 'frozen' | 'eliminated'

export interface PlayerState {
  playerId: string
  role: 'human' | 'ai_partner' | 'seeker'
  status: PlayerStatus
  position: { x: number; z: number }
}

export interface FreezeEvent {
  playerId: string
  matchedWord: string
  matchedStage: string
  confidence: number
  position: { x: number; z: number }
  timestamp: number
}

interface GameStore {
  // 연결 상태
  connected: boolean
  roomId: string
  playerId: string

  // 게임 상태
  phase: GamePhase
  forbiddenWords: string[]
  players: Record<string, PlayerState>

  // 빙결 이벤트 (연출용)
  lastFreezeEvent: FreezeEvent | null

  // 음성 관련
  isSpeaking: boolean
  lastTranscript: string
  subtitles: { playerId: string; text: string; timestamp: number }[]

  // Actions
  setConnected: (connected: boolean) => void
  setRoom: (roomId: string, playerId: string) => void
  setPhase: (phase: GamePhase) => void
  setForbiddenWords: (words: string[]) => void
  updatePlayer: (playerId: string, update: Partial<PlayerState>) => void
  freezePlayer: (event: FreezeEvent) => void
  unfreezePlayer: (playerId: string) => void
  setSpeaking: (isSpeaking: boolean) => void
  setLastTranscript: (transcript: string) => void
  addSubtitle: (playerId: string, text: string) => void
  reset: () => void
}

const initialState = {
  connected: false,
  roomId: '',
  playerId: '',
  phase: 'lobby' as GamePhase,
  forbiddenWords: [],
  players: {},
  lastFreezeEvent: null,
  isSpeaking: false,
  lastTranscript: '',
  subtitles: [],
}

export const useGameStore = create<GameStore>((set) => ({
  ...initialState,

  setConnected: (connected) => set({ connected }),

  setRoom: (roomId, playerId) => set({ roomId, playerId }),

  setPhase: (phase) => set({ phase }),

  setForbiddenWords: (words) => set({ forbiddenWords: words }),

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
      players: {
        ...state.players,
        [event.playerId]: {
          ...state.players[event.playerId],
          status: 'frozen',
          position: event.position,
        },
      },
    })),

  unfreezePlayer: (playerId) =>
    set((state) => ({
      players: {
        ...state.players,
        [playerId]: {
          ...state.players[playerId],
          status: 'alive',
        },
      },
    })),

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
