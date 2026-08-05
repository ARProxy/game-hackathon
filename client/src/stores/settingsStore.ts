import { create } from 'zustand'

const STORAGE_KEY = 'ice-ddaeng-settings'

interface SettingsState {
  masterVolume: number
  mouseSensitivity: number
  subtitlesEnabled: boolean
  setMasterVolume: (value: number) => void
  setMouseSensitivity: (value: number) => void
  setSubtitlesEnabled: (enabled: boolean) => void
}

type SavedSettings = Pick<SettingsState, 'masterVolume' | 'mouseSensitivity' | 'subtitlesEnabled'>

const defaults: SavedSettings = {
  masterVolume: 0.32,
  mouseSensitivity: 1,
  subtitlesEnabled: true,
}

function loadSettings(): SavedSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<SavedSettings>
    return {
      masterVolume: typeof saved.masterVolume === 'number' ? saved.masterVolume : defaults.masterVolume,
      mouseSensitivity: typeof saved.mouseSensitivity === 'number' ? saved.mouseSensitivity : defaults.mouseSensitivity,
      subtitlesEnabled: typeof saved.subtitlesEnabled === 'boolean' ? saved.subtitlesEnabled : defaults.subtitlesEnabled,
    }
  } catch {
    return defaults
  }
}

function persist(settings: SavedSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...loadSettings(),
  setMasterVolume: (masterVolume) => {
    set({ masterVolume })
    persist({ ...get(), masterVolume })
  },
  setMouseSensitivity: (mouseSensitivity) => {
    set({ mouseSensitivity })
    persist({ ...get(), mouseSensitivity })
  },
  setSubtitlesEnabled: (subtitlesEnabled) => {
    set({ subtitlesEnabled })
    persist({ ...get(), subtitlesEnabled })
  },
}))
