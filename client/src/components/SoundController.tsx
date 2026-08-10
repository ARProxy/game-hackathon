import { useEffect, useRef, useState } from 'react'
import useSound from '../hooks/useSound'
import {
  useGameStore,
  type GamePhase,
  type HunterIntent,
  type MapFloor,
  type PlayerState,
  type PlayerStatus,
} from '../stores/gameStore'
import { useSettingsStore } from '../stores/settingsStore'

type AdaptiveTrackId = 'exploration' | 'broadcast' | 'danger' | 'final'

interface AdaptiveTrack {
  src: string
  gain: number
}

interface MusicInstance {
  audio: HTMLAudioElement
  id: AdaptiveTrackId
  targetVolume: number
}

const ADAPTIVE_TRACKS: Record<AdaptiveTrackId, AdaptiveTrack> = {
  exploration: { src: '/audio/music/exploration-dark-ambient.mp3', gain: 0.28 },
  broadcast: { src: '/audio/music/broadcast-haunted-music-box.mp3', gain: 0.25 },
  danger: { src: '/audio/music/seeker-danger-ambience.mp3', gain: 0.36 },
  final: { src: '/audio/music/final-suspense-horror.mp3', gain: 0.34 },
}

const MUSIC_CROSSFADE_MS = 3_000
const BROADCAST_ZONE_PATTERN = /(broadcast|control|security|cctv|방송|관제|경비)/i

function humanPlayer(players: Record<string, PlayerState>, playerId: string) {
  return players[playerId] ?? Object.values(players).find((player) => player.role === 'human') ?? null
}

function intentTargetsHuman(intent: HunterIntent | null, playerId: string) {
  return Boolean(intent
    && ['DETECTED', 'CHASE', 'RUSH_GATE'].includes(intent.state)
    && intent.targetId === playerId)
}

function hasNearbySeeker(players: Record<string, PlayerState>, human: PlayerState | null) {
  if (!human?.position.floor) return false
  return Object.values(players).some((player) => {
    if (player.role !== 'seeker' || player.status === 'eliminated') return false
    if (player.position.floor !== human.position.floor) return false
    return Math.hypot(
      player.position.x - human.position.x,
      player.position.z - human.position.z,
    ) <= 11
  })
}

function selectAdaptiveTrack(options: {
  phase: GamePhase
  floor: MapFloor
  isPaused: boolean
  playerId: string
  players: Record<string, PlayerState>
  primaryIntent: HunterIntent | null
  secondaryIntent: HunterIntent | null
}): AdaptiveTrackId | null {
  const { phase, floor, isPaused, playerId, players, primaryIntent, secondaryIntent } = options
  if (isPaused || !['playing', 'final_spell', 'escape'].includes(phase)) return null
  if (phase === 'final_spell' || phase === 'escape' || floor === 'FIELD' || floor === 'B1') return 'final'

  const human = humanPlayer(players, playerId)
  const effectivePlayerId = human?.playerId ?? playerId
  if (human?.status === 'frozen'
    || hasNearbySeeker(players, human)
    || intentTargetsHuman(primaryIntent, effectivePlayerId)
    || intentTargetsHuman(secondaryIntent, effectivePlayerId)) return 'danger'

  if (floor === 'ROOF' || BROADCAST_ZONE_PATTERN.test(human?.position.zone ?? '')) return 'broadcast'
  return 'exploration'
}

function safeCompanionSpeech(text: string, forbiddenWords: string[]): string {
  return forbiddenWords.reduce((safe, word) => {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return escaped ? safe.replace(new RegExp(escaped, 'gi'), '그 대상') : safe
  }, text)
}

function selectKoreanVoice(language: string, companionId: string): SpeechSynthesisVoice | undefined {
  const languagePrefix = language.slice(0, 2).toLowerCase()
  const candidates = window.speechSynthesis.getVoices().filter((voice) =>
    voice.lang.toLowerCase().startsWith(languagePrefix),
  )
  const preferredNames = companionId === 'partner-2'
    ? ['sora', 'eunji', 'sunhi', 'yuna']
    : ['yuna', 'sunhi', 'eunji', 'sora']
  return candidates.sort((a, b) => {
    const score = (voice: SpeechSynthesisVoice) => {
      const name = voice.name.toLowerCase()
      const preference = preferredNames.findIndex((candidate) => name.includes(candidate))
      return (voice.localService ? 20 : 0) + (preference < 0 ? 0 : 12 - preference)
    }
    return score(b) - score(a)
  })[0]
}

export default function SoundController() {
  const phase = useGameStore((state) => state.phase)
  const outcome = useGameStore((state) => state.outcome)
  const players = useGameStore((state) => state.players)
  const lastFreezeEvent = useGameStore((state) => state.lastFreezeEvent)
  const rooftopProgress = useGameStore((state) => state.rooftopSignal?.progress ?? 0)
  const verticalPhase = useGameStore((state) => state.verticalProgression?.phase ?? null)
  const playerId = useGameStore((state) => state.playerId)
  const currentFloor = useGameStore((state) => state.currentFloor)
  const isPaused = useGameStore((state) => state.isPaused)
  const hunterIntent = useGameStore((state) => state.hunterIntent)
  const secondaryHunterIntent = useGameStore((state) => state.secondaryHunterIntent)
  const activeWorldEvent = useGameStore((state) => state.activeWorldEvent)
  const companionMessageCount = useGameStore((state) => state.subtitles.filter((item) => item.playerId.startsWith('partner')).length)
  const latestSubtitle = useGameStore((state) => state.subtitles.at(-1) ?? null)
  const forbiddenWords = useGameStore((state) => state.forbiddenWords)
  const masterVolume = useSettingsStore((state) => state.masterVolume)
  const ambienceVolume = useSettingsStore((state) => state.ambienceVolume)
  const voiceVolume = useSettingsStore((state) => state.voiceVolume)
  const speechLanguage = useSettingsStore((state) => state.speechLanguage)
  const {
    playFreeze, playRescue, playGateOpen, playVictory, playDefeat,
    playAmbientPulse, playMissionProgress, playCompanionCue,
    playBlackout, playPincerReveal,
  } = useSound()
  const [voiceRevision, setVoiceRevision] = useState(0)
  const lastFreezeTimestamp = useRef(0)
  const previousPhase = useRef<GamePhase>(phase)
  const previousVerticalPhase = useRef(verticalPhase)
  const previousRooftopProgress = useRef(rooftopProgress)
  const previousCompanionMessageCount = useRef(companionMessageCount)
  const previousStatuses = useRef<Record<string, PlayerStatus>>({})
  const lastSpokenTimestamp = useRef(0)
  const musicInstances = useRef<MusicInstance[]>([])
  const musicAnimationFrame = useRef<number | null>(null)
  const previousWorldEventId = useRef<string | null>(null)

  const adaptiveTrack = selectAdaptiveTrack({
    phase,
    floor: currentFloor,
    isPaused,
    playerId,
    players,
    primaryIntent: hunterIntent,
    secondaryIntent: secondaryHunterIntent,
  })

  useEffect(() => {
    const targetId = adaptiveTrack
    const existing = targetId
      ? musicInstances.current.find((instance) => instance.id === targetId)
      : null
    const target = targetId ? ADAPTIVE_TRACKS[targetId] : null
    const desiredVolume = target ? masterVolume * ambienceVolume * target.gain : 0

    let nextInstance = existing ?? null
    if (targetId && target && !nextInstance) {
      const audio = new Audio(target.src)
      audio.loop = true
      audio.preload = 'auto'
      audio.volume = 0
      nextInstance = { audio, id: targetId, targetVolume: desiredVolume }
      musicInstances.current.push(nextInstance)
      void audio.play().catch(() => {
        // 첫 사용자 제스처 전에는 브라우저가 자동재생을 막을 수 있다.
        // 아래 unlock 리스너가 같은 인스턴스를 다시 시작한다.
      })
    }

    for (const instance of musicInstances.current) {
      instance.targetVolume = instance === nextInstance ? desiredVolume : 0
    }

    if (musicAnimationFrame.current !== null) cancelAnimationFrame(musicAnimationFrame.current)
    const startedAt = performance.now()
    const starts = new Map(musicInstances.current.map((instance) => [instance, instance.audio.volume]))

    const animate = (now: number) => {
      const ratio = Math.min(1, (now - startedAt) / MUSIC_CROSSFADE_MS)
      for (const instance of musicInstances.current) {
        const start = starts.get(instance) ?? 0
        instance.audio.volume = Math.min(1, Math.max(0,
          start + (instance.targetVolume - start) * ratio,
        ))
      }
      if (ratio < 1) {
        musicAnimationFrame.current = requestAnimationFrame(animate)
        return
      }
      musicAnimationFrame.current = null
      musicInstances.current = musicInstances.current.filter((instance) => {
        if (instance.targetVolume > 0) return true
        instance.audio.pause()
        instance.audio.currentTime = 0
        return false
      })
    }
    musicAnimationFrame.current = requestAnimationFrame(animate)

    document.body.dataset.adaptiveMusic = targetId ?? 'silent'
  }, [adaptiveTrack, ambienceVolume, masterVolume])

  useEffect(() => {
    const unlockMusic = () => {
      for (const instance of musicInstances.current) {
        if (instance.targetVolume > 0 && instance.audio.paused) {
          void instance.audio.play().catch(() => undefined)
        }
      }
    }
    window.addEventListener('pointerdown', unlockMusic)
    window.addEventListener('keydown', unlockMusic)
    return () => {
      window.removeEventListener('pointerdown', unlockMusic)
      window.removeEventListener('keydown', unlockMusic)
    }
  }, [])

  useEffect(() => () => {
    if (musicAnimationFrame.current !== null) cancelAnimationFrame(musicAnimationFrame.current)
    for (const instance of musicInstances.current) {
      instance.audio.pause()
      instance.audio.src = ''
    }
    musicInstances.current = []
    delete document.body.dataset.adaptiveMusic
  }, [])

  useEffect(() => {
    if (!("speechSynthesis" in window)) return
    const refreshVoices = () => setVoiceRevision((revision) => revision + 1)
    window.speechSynthesis.getVoices()
    window.speechSynthesis.addEventListener('voiceschanged', refreshVoices)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', refreshVoices)
  }, [])

  useEffect(() => {
    void voiceRevision
    if (!latestSubtitle?.playerId.startsWith('partner')) return
    if (latestSubtitle.timestamp <= lastSpokenTimestamp.current) return
    lastSpokenTimestamp.current = latestSubtitle.timestamp
    if (!('speechSynthesis' in window) || latestSubtitle.speechMode === 'silent') return
    const utterance = new SpeechSynthesisUtterance(
      safeCompanionSpeech(latestSubtitle.text, forbiddenWords),
    )
    utterance.lang = speechLanguage
    utterance.volume = Math.min(1, masterVolume * voiceVolume * (
      latestSubtitle.speechMode === 'whisper' ? 0.58 : 1
    ))
    const urgent = latestSubtitle.speechMode === 'shout'
    utterance.rate = urgent ? 1.01
      : latestSubtitle.speechMode === 'radio' ? 0.91
        : latestSubtitle.speechMode === 'intercom' ? 0.89 : 0.94
    const partnerTwo = latestSubtitle.playerId === 'partner-2'
    utterance.pitch = latestSubtitle.speechMode === 'intercom' ? 0.88
      : latestSubtitle.speechMode === 'whisper' ? 0.84
        : partnerTwo ? 0.98 : 0.91
    const matchingVoice = selectKoreanVoice(speechLanguage, latestSubtitle.playerId)
    if (matchingVoice) utterance.voice = matchingVoice
    // 일반 보고가 긴급 대사를 자르거나 줄줄이 쌓이지 않게 하고, 구조·발견
    // 같은 긴급 대사만 현재 음성을 끊고 즉시 전달한다.
    if (window.speechSynthesis.speaking && !urgent) return
    if (urgent) window.speechSynthesis.cancel()
    if (utterance.volume > 0.001) window.speechSynthesis.speak(utterance)
  }, [forbiddenWords, latestSubtitle, masterVolume, speechLanguage, voiceRevision, voiceVolume])

  useEffect(() => {
    if (!activeWorldEvent || previousWorldEventId.current === activeWorldEvent.eventId) return
    previousWorldEventId.current = activeWorldEvent.eventId
    if (activeWorldEvent.eventType === 'local_blackout') playBlackout()
    if (activeWorldEvent.eventType === 'dual_hunter_breach') playPincerReveal()
  }, [activeWorldEvent, playBlackout, playPincerReveal])

  useEffect(() => () => window.speechSynthesis?.cancel(), [])

  useEffect(() => {
    if (!['playing', 'final_spell', 'escape'].includes(phase)) return
    const initial = window.setTimeout(playAmbientPulse, 250)
    const interval = window.setInterval(playAmbientPulse, 4_600)
    return () => {
      window.clearTimeout(initial)
      window.clearInterval(interval)
    }
  }, [phase, playAmbientPulse])

  useEffect(() => {
    if (rooftopProgress > previousRooftopProgress.current) playMissionProgress(rooftopProgress)
    previousRooftopProgress.current = rooftopProgress
  }, [playMissionProgress, rooftopProgress])

  useEffect(() => {
    if (previousVerticalPhase.current && verticalPhase !== previousVerticalPhase.current) playGateOpen()
    previousVerticalPhase.current = verticalPhase
  }, [playGateOpen, verticalPhase])

  useEffect(() => {
    if (companionMessageCount > previousCompanionMessageCount.current) playCompanionCue()
    previousCompanionMessageCount.current = companionMessageCount
  }, [companionMessageCount, playCompanionCue])

  useEffect(() => {
    if (lastFreezeEvent && lastFreezeEvent.timestamp > lastFreezeTimestamp.current) {
      lastFreezeTimestamp.current = lastFreezeEvent.timestamp
      playFreeze()
    }
  }, [lastFreezeEvent, playFreeze])

  useEffect(() => {
    if (previousPhase.current !== 'escape' && phase === 'escape') playGateOpen()
    if (previousPhase.current !== 'result' && phase === 'result') {
      if (outcome === 'win') playVictory()
      if (outcome === 'lose') playDefeat()
    }
    previousPhase.current = phase
  }, [outcome, phase, playDefeat, playGateOpen, playVictory])

  useEffect(() => {
    const nextStatuses: Record<string, PlayerStatus> = {}
    let rescued = false
    for (const [playerId, player] of Object.entries(players)) {
      nextStatuses[playerId] = player.status
      if (previousStatuses.current[playerId] === 'frozen' && player.status === 'alive') rescued = true
    }
    previousStatuses.current = nextStatuses
    if (rescued) playRescue()
  }, [players, playRescue])

  return null
}
