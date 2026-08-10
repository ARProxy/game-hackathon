import { useCallback, useEffect } from 'react'
import { useSettingsStore } from '../stores/settingsStore'

type ToneShape = OscillatorType
type SoundCategory = 'effects' | 'ambience'
export type SeekerSoundRole = 'chaser' | 'blocker'

// 플레이어·술래·HUD가 서로 다른 AudioContext를 만들면 브라우저의 사용자
// 제스처 잠금 상태가 갈라진다. 게임 전체가 하나의 엔진과 마스터 게인을 공유한다.
let sharedContext: AudioContext | null = null
let sharedMaster: GainNode | null = null
let sharedNoiseBuffer: AudioBuffer | null = null

export default function useSound() {
  const masterVolume = useSettingsStore((state) => state.masterVolume)
  const effectsVolume = useSettingsStore((state) => state.effectsVolume)
  const ambienceVolume = useSettingsStore((state) => state.ambienceVolume)

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
    endFrequency = frequency, shape: ToneShape = 'sine', pan = 0, category: SoundCategory = 'effects') => {
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
    const categoryVolume = category === 'ambience' ? ambienceVolume : effectsVolume
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume * categoryVolume), start + Math.min(0.025, duration / 3))
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    const panner = context.createStereoPanner()
    panner.pan.value = Math.min(1, Math.max(-1, pan))
    oscillator.connect(gain).connect(panner).connect(master)
    oscillator.start(start)
    oscillator.stop(start + duration + 0.02)
  }, [ambienceVolume, effectsVolume])

  const noise = useCallback((delay: number, duration: number, volume: number, highpass: number, pan = 0, category: SoundCategory = 'effects') => {
    const context = sharedContext
    const master = sharedMaster
    if (!context || context.state !== 'running' || !master) return
    const start = context.currentTime + delay
    // 술래가 가까울 때마다 수천 개의 난수를 다시 만들면 메인 스레드 GC가
    // 프레임을 멈춘다. 2초짜리 노이즈를 한 번만 만들어 모든 효과가 공유한다.
    if (!sharedNoiseBuffer || sharedNoiseBuffer.sampleRate !== context.sampleRate) {
      sharedNoiseBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate)
      const samples = sharedNoiseBuffer.getChannelData(0)
      for (let index = 0; index < samples.length; index++) {
        samples[index] = Math.random() * 2 - 1
      }
    }
    const source = context.createBufferSource()
    const filter = context.createBiquadFilter()
    const gain = context.createGain()
    source.buffer = sharedNoiseBuffer
    filter.type = 'highpass'
    filter.frequency.value = highpass
    const categoryVolume = category === 'ambience' ? ambienceVolume : effectsVolume
    gain.gain.setValueAtTime(Math.max(0.0001, volume * categoryVolume), start)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    const panner = context.createStereoPanner()
    panner.pan.value = Math.min(1, Math.max(-1, pan))
    source.connect(filter).connect(gain).connect(panner).connect(master)
    const maxOffset = Math.max(0, sharedNoiseBuffer.duration - duration)
    source.start(start, Math.random() * maxOffset, duration)
    source.stop(start + duration + 0.02)
  }, [ambienceVolume, effectsVolume])

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

  const playSeekerProximity = useCallback((intensity: number, pan = 0, role: SeekerSoundRole = 'chaser') => {
    const proximity = Math.min(1, Math.max(0, intensity))
    if (proximity <= 0) return

    if (role === 'blocker') {
      // 차단자는 심장박동이나 사이렌 대신, 형광등 간섭과 금속을 긁는 듯한
      // 고역 정적으로 접근한다. 눈으로 숨지 않으면 잡히는 역할을 귀로 구분한다.
      noise(0, 0.34, 0.012 + proximity * 0.04, 1900 - proximity * 520, pan)
      tone(238 + proximity * 46, 0.035, 0.36, 0.008 + proximity * 0.018,
        176 + proximity * 20, 'sine', pan)
      if (proximity >= 0.62) {
        noise(0.17, 0.18, 0.018 + proximity * 0.028, 3200, -pan)
      }
      return
    }

    // 심장박동 아래에 불규칙한 마찰음과 저주파 호흡을 겹쳐, 화면보다
    // 먼저 '같은 층에 무언가 있다'는 감각을 준다.
    const volume = 0.035 + proximity * 0.085
    const baseFrequency = 46 + proximity * 18
    tone(baseFrequency, 0, 0.17, volume, baseFrequency * 0.68, 'triangle', pan)
    tone(baseFrequency * 0.82, 0.19, 0.14, volume * 0.78, baseFrequency * 0.55, 'sine', pan)
    noise(0.025, 0.22, 0.018 + proximity * 0.035, 760 - proximity * 360, pan)
    if (proximity >= 0.45) {
      tone(280 + proximity * 90, 0.04, 0.32, 0.012 + proximity * 0.022,
        170 + proximity * 45, 'sawtooth', pan)
    }
  }, [noise, tone])

  const playSeekerDetected = useCallback((role: SeekerSoundRole = 'chaser', pan = 0) => {
    if (role === 'blocker') {
      // 차단자의 발견음은 경보가 아니라 순간적으로 주변 전기가 빨려나가는
      // 듯한 정적이다. 추격자와 같은 비명을 재사용하지 않는다.
      noise(0, 0.62, 0.11, 2450, pan)
      tone(980, 0.015, 0.44, 0.06, 170, 'sine', pan)
      tone(136, 0.08, 0.58, 0.08, 72, 'triangle', -pan)
      return
    }
    // 짧은 알림음이 아니라 낮은 포효, 비명성 마찰과 충격을 겹친 발견 스팅.
    noise(0, 0.68, 0.18, 820, pan)
    tone(118, 0, 0.7, 0.19, 34, 'sawtooth', pan)
    tone(82, 0.035, 0.58, 0.15, 29, 'square', pan)
    tone(910, 0.025, 0.24, 0.13, 310, 'sawtooth', pan)
    tone(390, 0.2, 0.42, 0.12, 1180, 'sawtooth', -pan)
  }, [noise, tone])

  const playSeekerFootstep = useCallback((intensity: number, pan: number, running: boolean, role: SeekerSoundRole = 'chaser') => {
    const proximity = Math.min(1, Math.max(0, intensity))
    if (proximity <= 0) return
    if (role === 'blocker') {
      const volume = (running ? 0.044 : 0.025) * proximity
      noise(0, 0.13, volume, 980, pan)
      tone(running ? 126 : 104, 0.012, 0.12, volume * 0.72, 58, 'triangle', pan)
      return
    }
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

  const playSeekerLunge = useCallback((intensity: number, pan: number, role: SeekerSoundRole = 'chaser') => {
    const proximity = Math.min(1, Math.max(0.15, intensity))
    if (role === 'blocker') {
      noise(0, 0.3, 0.055 * proximity, 2800, pan)
      tone(760, 0, 0.24, 0.045 * proximity, 94, 'sine', pan)
      return
    }
    noise(0, 0.34, 0.12 * proximity, 540, pan)
    tone(148, 0, 0.4, 0.15 * proximity, 31, 'sawtooth', pan)
    tone(620, 0.025, 0.22, 0.09 * proximity, 170, 'square', pan)
  }, [noise, tone])

  const playSeekerDoorPound = useCallback((pan = 0) => {
    // 발걸음 재사용을 없애고 문짝·문틀·저역 충격을 분리한다.
    tone(62, 0, 0.24, 0.18, 31, 'triangle', pan)
    noise(0.008, 0.21, 0.105, 240, pan)
    tone(118, 0.028, 0.16, 0.08, 48, 'square', -pan * 0.4)
  }, [noise, tone])

  const playBlackout = useCallback(() => {
    tone(58, 0, 1.2, 0.12, 28, 'sawtooth', 0, 'ambience')
    noise(0.02, 0.18, 0.11, 2600, -0.35, 'ambience')
    noise(0.23, 0.11, 0.08, 2100, 0.4, 'ambience')
    tone(1640, 0.42, 0.7, 0.025, 120, 'sine', 0, 'ambience')
  }, [noise, tone])

  const playPincerReveal = useCallback(() => {
    playSeekerDoorPound(-0.5)
    playSeekerDoorPound(0.5)
    tone(74, 0.42, 1.1, 0.15, 32, 'sawtooth')
    noise(0.48, 0.72, 0.09, 1900)
  }, [noise, playSeekerDoorPound, tone])

  const playForbiddenShift = useCallback(() => {
    noise(0, 0.42, 0.11, 1500)
    tone(1320, 0.02, 0.34, 0.075, 74, 'sawtooth')
    tone(58, 0.12, 1.15, 0.14, 31, 'triangle')
    noise(0.34, 0.62, 0.065, 260)
  }, [noise, tone])

  const playCompanionLost = useCallback(() => {
    noise(0, 0.18, 0.12, 2100, -0.25)
    noise(0.16, 0.24, 0.1, 1500, 0.3)
    tone(230, 0.08, 0.9, 0.12, 42, 'sawtooth')
  }, [noise, tone])

  const playPlayerFootstep = useCallback((rightFoot: boolean, intensity: number) => {
    const strength = Math.min(1, Math.max(0, intensity))
    if (strength <= 0) return
    const pan = rightFoot ? 0.06 : -0.06
    const volume = 0.04 + strength * 0.045
    tone(rightFoot ? 118 : 108, 0, 0.065, volume, 62, 'triangle', pan)
    noise(0.008, 0.065, volume * 0.55, 220, pan)
  }, [noise, tone])

  const playAmbientPulse = useCallback(() => {
    tone(48, 0, 3.2, 0.07, 42, 'sine', 0, 'ambience')
    tone(60, 0.05, 3.4, 0.018, 59, 'sine', -0.24, 'ambience')
    tone(120, 0.12, 2.7, 0.012, 119, 'triangle', 0.28, 'ambience')
    noise(0.05, 1.8, 0.022, 135, 0.22, 'ambience')
    noise(2.15, 0.13, 0.032, 1500, -0.35, 'ambience')
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
    playSeekerLunge,
    playSeekerDoorPound,
    playBlackout,
    playPincerReveal,
    playForbiddenShift,
    playCompanionLost,
    playPlayerFootstep,
    playAmbientPulse,
    playRooftopSignal,
    playMissionProgress,
    playCompanionCue,
    playElevatorMotor,
    playElevatorArrival,
  }
}
