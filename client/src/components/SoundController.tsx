import { useEffect, useRef } from 'react'
import useSound from '../hooks/useSound'
import { useGameStore, type GamePhase, type PlayerStatus } from '../stores/gameStore'

export default function SoundController() {
  const phase = useGameStore((state) => state.phase)
  const outcome = useGameStore((state) => state.outcome)
  const players = useGameStore((state) => state.players)
  const lastFreezeEvent = useGameStore((state) => state.lastFreezeEvent)
  const { playFreeze, playRescue, playGateOpen, playVictory, playDefeat } = useSound()
  const lastFreezeTimestamp = useRef(0)
  const previousPhase = useRef<GamePhase>(phase)
  const previousStatuses = useRef<Record<string, PlayerStatus>>({})

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
