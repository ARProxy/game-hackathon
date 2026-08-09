import { useEffect, useRef } from 'react'
import useSound from '../hooks/useSound'
import { useGameStore, type GamePhase, type PlayerStatus } from '../stores/gameStore'

export default function SoundController() {
  const phase = useGameStore((state) => state.phase)
  const outcome = useGameStore((state) => state.outcome)
  const players = useGameStore((state) => state.players)
  const lastFreezeEvent = useGameStore((state) => state.lastFreezeEvent)
  const rooftopProgress = useGameStore((state) => state.rooftopSignal?.progress ?? 0)
  const verticalPhase = useGameStore((state) => state.verticalProgression?.phase ?? null)
  const companionMessageCount = useGameStore((state) => state.subtitles.filter((item) => item.playerId.startsWith('partner')).length)
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
