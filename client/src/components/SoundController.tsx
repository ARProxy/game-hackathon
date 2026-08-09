import { useEffect, useRef } from 'react'
import useSound from '../hooks/useSound'
import { useGameStore, type GamePhase, type PlayerStatus } from '../stores/gameStore'
import { useSettingsStore } from '../stores/settingsStore'

function safeCompanionSpeech(text: string, forbiddenWords: string[]): string {
  return forbiddenWords.reduce((safe, word) => {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return escaped ? safe.replace(new RegExp(escaped, 'gi'), '그 대상') : safe
  }, text)
}

export default function SoundController() {
  const phase = useGameStore((state) => state.phase)
  const outcome = useGameStore((state) => state.outcome)
  const players = useGameStore((state) => state.players)
  const lastFreezeEvent = useGameStore((state) => state.lastFreezeEvent)
  const rooftopProgress = useGameStore((state) => state.rooftopSignal?.progress ?? 0)
  const verticalPhase = useGameStore((state) => state.verticalProgression?.phase ?? null)
  const companionMessageCount = useGameStore((state) => state.subtitles.filter((item) => item.playerId.startsWith('partner')).length)
  const latestSubtitle = useGameStore((state) => state.subtitles.at(-1) ?? null)
  const forbiddenWords = useGameStore((state) => state.forbiddenWords)
  const masterVolume = useSettingsStore((state) => state.masterVolume)
  const voiceVolume = useSettingsStore((state) => state.voiceVolume)
  const speechLanguage = useSettingsStore((state) => state.speechLanguage)
  const {
    playFreeze, playRescue, playGateOpen, playVictory, playDefeat,
    playAmbientPulse, playMissionProgress, playCompanionCue,
  } = useSound()
  const lastFreezeTimestamp = useRef(0)
  const previousPhase = useRef<GamePhase>(phase)
  const previousVerticalPhase = useRef(verticalPhase)
  const previousRooftopProgress = useRef(rooftopProgress)
  const previousCompanionMessageCount = useRef(companionMessageCount)
  const previousStatuses = useRef<Record<string, PlayerStatus>>({})
  const lastSpokenTimestamp = useRef(0)

  useEffect(() => {
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
    utterance.rate = latestSubtitle.speechMode === 'shout' ? 1.08
      : latestSubtitle.speechMode === 'radio' ? 0.94
        : 1
    utterance.pitch = latestSubtitle.speechMode === 'intercom' ? 0.82
      : latestSubtitle.speechMode === 'whisper' ? 0.92
        : 1.05
    const matchingVoice = window.speechSynthesis.getVoices().find((voice) =>
      voice.lang.toLowerCase().startsWith(speechLanguage.slice(0, 2).toLowerCase()),
    )
    if (matchingVoice) utterance.voice = matchingVoice
    window.speechSynthesis.cancel()
    if (utterance.volume > 0.001) window.speechSynthesis.speak(utterance)
  }, [forbiddenWords, latestSubtitle, masterVolume, speechLanguage, voiceVolume])

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
