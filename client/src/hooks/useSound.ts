import { useCallback, useEffect } from 'react'
import { useSettingsStore } from '../stores/settingsStore'

type ToneShape = OscillatorType

// 플레이어·술래·HUD가 서로 다른 AudioContext를 만들면 브라우저의 사용자
// 제스처 잠금 상태가 갈라진다. 게임 전체가 하나의 엔진과 마스터 게인을 공유한다.
let sharedContext: AudioContext | null = null
let sharedMaster: GainNode | null = null

export default function useSound() {
  const masterVolume = useSettingsStore((state) => state.masterVolume)

  const ensureContext = useCallback(() => {
    let context = sharedContext
    if (!context) {
      try {
        context = new AudioContext()
      } catch (error) {
        console.warn('[Audio] unavailable:', error)
        return null
      }
      const master = context.createGain()
      master.gain.value = masterVolume
      master.connect(context.destination)
      sharedContext = context
      sharedMaster = master
    }
    if (sharedMaster) sharedMaster.gain.value = masterVolume
    if (context.state === 'suspended') {
      void context.resume().catch((error) => {
        console.warn('[Audio] resume blocked:', error)
      })
    }
    return context
  }, [masterVolume])

  useEffect(() => {
    if (sharedMaster) sharedMaster.gain.value = masterVolume
  }, [masterVolume])

  useEffect(() => {
    const unlock = () => ensureContext()
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [ensureContext])

  const tone = useCallback((frequency: number, delay: number, duration: number, volume: number,
    endFrequency = frequency, shape: ToneShape = 'sine', pan = 0) => {
    const context = sharedContext
    const master = sharedMaster
    if (!context || context.state !== 'running' || !master) return
    const start = context.currentTime + delay
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = shape
    oscillator.frequency.setValueAtTime(frequency, start)
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), start + duration)
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(volume, start + Math.min(0.025, duration / 3))
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    const panner = context.createStereoPanner()
    panner.pan.value = Math.min(1, Math.max(-1, pan))
    oscillator.connect(gain).connect(panner).connect(master)
    oscillator.start(start)
    oscillator.stop(start + duration + 0.02)
  }, [])

  const noise = useCallback((delay: number, duration: number, volume: number, highpass: number, pan = 0) => {
    const context = sharedContext
    const master = sharedMaster
    if (!context || context.state !== 'running' || !master) return
    const start = context.currentTime + delay
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate)
    const samples = buffer.getChannelData(0)
    for (let index = 0; index < samples.length; index++) {
      samples[index] = (Math.random() * 2 - 1) * (1 - index / samples.length)
    }
    const source = context.createBufferSource()
    const filter = context.createBiquadFilter()
    const gain = context.createGain()
    source.buffer = buffer
    filter.type = 'highpass'
    filter.frequency.value = highpass
    gain.gain.setValueAtTime(volume, start)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    const panner = context.createStereoPanner()
    panner.pan.value = Math.min(1, Math.max(-1, pan))
    source.connect(filter).connect(gain).connect(panner).connect(master)
    source.start(start)
  }, [])

  const playFreeze = useCallback(() => {
    tone(1100, 0, 0.18, 0.16, 240, 'triangle')
    noise(0.03, 0.28, 0.13, 1700)
    tone(720, 0.09, 0.22, 0.09, 120, 'square')
  }, [noise, tone])

  const playRescue = useCallback(() => {
    tone(330, 0, 0.16, 0.1, 440)
    tone(440, 0.11, 0.18, 0.11, 660)
    tone(660, 0.24, 0.28, 0.1, 990)
  }, [tone])

  const playGateOpen = useCallback(() => {
    tone(90, 0, 0.7, 0.13, 180, 'sawtooth')
    tone(360, 0.18, 0.55, 0.08, 720)
    tone(540, 0.36, 0.65, 0.08, 1080)
  }, [tone])

  const playVictory = useCallback(() => {
    ;[523, 659, 784, 1047].forEach((frequency, index) =>
      tone(frequency, index * 0.12, 0.32, 0.09, frequency * 1.02, 'triangle'))
  }, [tone])

  const playDefeat = useCallback(() => {
    tone(260, 0, 0.42, 0.12, 150, 'sawtooth')
    tone(180, 0.3, 0.65, 0.11, 55, 'triangle')
  }, [tone])

  const playSeekerProximity = useCallback((intensity: number, pan = 0) => {
    const proximity = Math.min(1, Math.max(0, intensity))
    if (proximity <= 0) return

    // 가까울수록 묵직한 두 박자가 커지고, 짧은 휘파람 배음이 선명해진다.
    const volume = 0.025 + proximity * 0.065
    const baseFrequency = 58 + proximity * 20
    tone(baseFrequency, 0, 0.13, volume, baseFrequency * 0.82, 'triangle', pan)
    tone(baseFrequency * 0.9, 0.16, 0.11, volume * 0.72, baseFrequency * 0.72, 'sine', pan)
    if (proximity >= 0.45) {
      tone(520 + proximity * 150, 0.03, 0.19, 0.012 + proximity * 0.016,
        430 + proximity * 110, 'sine', pan)
    }
  }, [tone])

  const playSeekerDetected = useCallback(() => {
    tone(720, 0, 0.22, 0.11, 540, 'sawtooth')
    tone(520, 0.22, 0.22, 0.11, 760, 'sawtooth')
    tone(760, 0.44, 0.28, 0.1, 500, 'square')
  }, [tone])

  const playSeekerFootstep = useCallback((intensity: number, pan: number, running: boolean) => {
    const proximity = Math.min(1, Math.max(0, intensity))
    if (proximity <= 0) return
    const volume = (running ? 0.065 : 0.038) * proximity
    tone(running ? 82 : 68, 0, 0.1, volume, 42, 'triangle', pan)
    noise(0.015, 0.09, volume * 0.52, 190, pan)
  }, [noise, tone])

  const playSeekerSiren = useCallback((intensity: number, pan: number) => {
    const proximity = Math.min(1, Math.max(0, intensity))
    const volume = 0.025 + proximity * 0.04
    tone(610, 0, 0.24, volume, 880, 'sawtooth', pan)
    tone(880, 0.25, 0.24, volume, 610, 'sawtooth', pan)
  }, [tone])

  const playPlayerFootstep = useCallback((rightFoot: boolean, intensity: number) => {
    const strength = Math.min(1, Math.max(0, intensity))
    if (strength <= 0) return
    const pan = rightFoot ? 0.06 : -0.06
    const volume = 0.04 + strength * 0.045
    tone(rightFoot ? 118 : 108, 0, 0.065, volume, 62, 'triangle', pan)
    noise(0.008, 0.065, volume * 0.55, 220, pan)
  }, [noise, tone])

  const playAmbientPulse = useCallback(() => {
    tone(48, 0, 2.8, 0.075, 42, 'sine')
    tone(96, 0.18, 2.1, 0.025, 82, 'triangle', -0.18)
    noise(0.05, 1.4, 0.018, 120, 0.22)
  }, [noise, tone])

  const playRooftopSignal = useCallback((step: number) => {
    const base = 420 + Math.max(0, step) * 110
    tone(base, 0, 0.16, 0.17, base * 1.35, 'triangle')
    tone(base * 1.5, 0.09, 0.2, 0.11, base * 1.8, 'sine')
  }, [tone])

  const playMissionProgress = useCallback((progress: number) => {
    const base = 360 + Math.max(0, progress) * 120
    tone(base, 0, 0.16, 0.15, base * 1.2, 'square')
    tone(base * 1.32, 0.12, 0.24, 0.13, base * 1.7, 'triangle')
  }, [tone])

  const playCompanionCue = useCallback(() => {
    tone(540, 0, 0.11, 0.11, 680, 'triangle', -0.12)
    tone(720, 0.1, 0.17, 0.09, 860, 'sine', 0.12)
  }, [tone])

  const playElevatorMotor = useCallback(() => {
    tone(72, 0, 1.1, 0.055, 92, 'sawtooth')
    tone(144, 0.08, 0.9, 0.025, 166, 'triangle')
    noise(0.02, 0.75, 0.018, 90)
  }, [noise, tone])

  const playElevatorArrival = useCallback(() => {
    tone(660, 0, 0.16, 0.12, 880, 'triangle')
    tone(880, 0.13, 0.22, 0.1, 1100, 'sine')
    noise(0.03, 0.32, 0.045, 420)
  }, [noise, tone])

  return {
    playFreeze,
    playRescue,
    playGateOpen,
    playVictory,
    playDefeat,
    playSeekerProximity,
    playSeekerDetected,
    playSeekerFootstep,
    playSeekerSiren,
    playPlayerFootstep,
    playAmbientPulse,
    playRooftopSignal,
    playMissionProgress,
    playCompanionCue,
    playElevatorMotor,
    playElevatorArrival,
  }
}
