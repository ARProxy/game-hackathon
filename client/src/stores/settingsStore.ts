import { create } from 'zustand'

const STORAGE_KEY = 'ice-ddaeng-settings'

export type SpeechLanguage = 'ko-KR' | 'en-US'
export type GraphicsQuality = 'low' | 'medium' | 'high'

export interface SavedSettings {
  masterVolume: number
  effectsVolume: number
  ambienceVolume: number
  voiceVolume: number
  mouseSensitivity: number
  invertY: boolean
  subtitlesEnabled: boolean
  subtitleScale: number
  speechLanguage: SpeechLanguage
  microphoneDeviceId: string
  graphicsQuality: GraphicsQuality
  shadowsEnabled: boolean
  renderScale: number
  reducedFlashes: boolean
}

interface SettingsState extends SavedSettings {
  setMasterVolume: (value: number) => void
  setEffectsVolume: (value: number) => void
  setAmbienceVolume: (value: number) => void
  setVoiceVolume: (value: number) => void
  setMouseSensitivity: (value: number) => void
  setInvertY: (enabled: boolean) => void
  setSubtitlesEnabled: (enabled: boolean) => void
  setSubtitleScale: (value: number) => void
  setSpeechLanguage: (language: SpeechLanguage) => void
  setMicrophoneDeviceId: (deviceId: string) => void
  setGraphicsQuality: (quality: GraphicsQuality) => void
  setShadowsEnabled: (enabled: boolean) => void
  setRenderScale: (value: number) => void
  setReducedFlashes: (enabled: boolean) => void
}

const defaults: SavedSettings = {
  masterVolume: 0.32,
  effectsVolume: 0.8,
  ambienceVolume: 0.55,
  voiceVolume: 0.85,
  mouseSensitivity: 1,
  invertY: false,
  subtitlesEnabled: true,
  subtitleScale: 1,
  speechLanguage: 'ko-KR',
  microphoneDeviceId: '',
  graphicsQuality: 'high',
  shadowsEnabled: true,
  renderScale: 1,
  reducedFlashes: false,
}

const numberOr = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback

function loadSettings(): SavedSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<SavedSettings>
    return {
      masterVolume: numberOr(saved.masterVolume, defaults.masterVolume, 0, 1),
      effectsVolume: numberOr(saved.effectsVolume, defaults.effectsVolume, 0, 1),
      ambienceVolume: numberOr(saved.ambienceVolume, defaults.ambienceVolume, 0, 1),
      voiceVolume: numberOr(saved.voiceVolume, defaults.voiceVolume, 0, 1),
      mouseSensitivity: numberOr(saved.mouseSensitivity, defaults.mouseSensitivity, 0.4, 2),
      invertY: typeof saved.invertY === 'boolean' ? saved.invertY : defaults.invertY,
      subtitlesEnabled: typeof saved.subtitlesEnabled === 'boolean' ? saved.subtitlesEnabled : defaults.subtitlesEnabled,
      subtitleScale: numberOr(saved.subtitleScale, defaults.subtitleScale, 0.8, 1.5),
      speechLanguage: saved.speechLanguage === 'en-US' ? 'en-US' : 'ko-KR',
      microphoneDeviceId: typeof saved.microphoneDeviceId === 'string' ? saved.microphoneDeviceId : '',
      graphicsQuality: ['low', 'medium', 'high'].includes(saved.graphicsQuality ?? '')
        ? saved.graphicsQuality as GraphicsQuality
        : defaults.graphicsQuality,
      shadowsEnabled: typeof saved.shadowsEnabled === 'boolean' ? saved.shadowsEnabled : defaults.shadowsEnabled,
      renderScale: numberOr(saved.renderScale, defaults.renderScale, 0.6, 1.5),
      reducedFlashes: typeof saved.reducedFlashes === 'boolean' ? saved.reducedFlashes : defaults.reducedFlashes,
    }
  } catch {
    return defaults
  }
}

function snapshot(state: SettingsState, update: Partial<SavedSettings>): SavedSettings {
  return {
    masterVolume: state.masterVolume,
    effectsVolume: state.effectsVolume,
    ambienceVolume: state.ambienceVolume,
    voiceVolume: state.voiceVolume,
    mouseSensitivity: state.mouseSensitivity,
    invertY: state.invertY,
    subtitlesEnabled: state.subtitlesEnabled,
    subtitleScale: state.subtitleScale,
    speechLanguage: state.speechLanguage,
    microphoneDeviceId: state.microphoneDeviceId,
    graphicsQuality: state.graphicsQuality,
    shadowsEnabled: state.shadowsEnabled,
    renderScale: state.renderScale,
    reducedFlashes: state.reducedFlashes,
    ...update,
  }
}

function persist(settings: SavedSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

export const useSettingsStore = create<SettingsState>((set, get) => {
  const update = <K extends keyof SavedSettings>(key: K, value: SavedSettings[K]) => {
    set({ [key]: value } as Pick<SettingsState, K>)
    persist(snapshot(get(), { [key]: value }))
  }
  return {
    ...loadSettings(),
    setMasterVolume: (value) => update('masterVolume', numberOr(value, defaults.masterVolume, 0, 1)),
    setEffectsVolume: (value) => update('effectsVolume', numberOr(value, defaults.effectsVolume, 0, 1)),
    setAmbienceVolume: (value) => update('ambienceVolume', numberOr(value, defaults.ambienceVolume, 0, 1)),
    setVoiceVolume: (value) => update('voiceVolume', numberOr(value, defaults.voiceVolume, 0, 1)),
    setMouseSensitivity: (value) => update('mouseSensitivity', numberOr(value, defaults.mouseSensitivity, 0.4, 2)),
    setInvertY: (value) => update('invertY', value),
    setSubtitlesEnabled: (value) => update('subtitlesEnabled', value),
    setSubtitleScale: (value) => update('subtitleScale', numberOr(value, defaults.subtitleScale, 0.8, 1.5)),
    setSpeechLanguage: (value) => update('speechLanguage', value),
    setMicrophoneDeviceId: (value) => update('microphoneDeviceId', value),
    setGraphicsQuality: (value) => update('graphicsQuality', value),
    setShadowsEnabled: (value) => update('shadowsEnabled', value),
    setRenderScale: (value) => update('renderScale', numberOr(value, defaults.renderScale, 0.6, 1.5)),
    setReducedFlashes: (value) => update('reducedFlashes', value),
  }
})
