import { useCallback, useEffect, useRef } from 'react'
import { useSettingsStore } from '../stores/settingsStore'

type ToneShape = OscillatorType

export default function useSound() {
  const masterVolume = useSettingsStore((state) => state.masterVolume)
  const contextRef = useRef<AudioContext | null>(null)
  const masterRef = useRef<GainNode | null>(null)

  const ensureContext = useCallback(() => {
    let context = contextRef.current
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
      contextRef.current = context
      masterRef.current = master
    }
    if (context.state === 'suspended') {
      void context.resume().catch((error) => {
        console.warn('[Audio] resume blocked:', error)
      })
    }
    return context
  }, [masterVolume])

  useEffect(() => {
    if (masterRef.current) masterRef.current.gain.value = masterVolume
  }, [masterVolume])

  useEffect(() => {
    const unlock = () => ensureContext()
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
      void contextRef.current?.close().catch((error) => {
        console.warn('[Audio] close failed:', error)
      })
      contextRef.current = null
      masterRef.current = null
    }
  }, [ensureContext])

  const tone = useCallback((frequency: number, delay: number, duration: number, volume: number,
    endFrequency = frequency, shape: ToneShape = 'sine', pan = 0) => {
    const context = contextRef.current
    const master = masterRef.current
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

  const noise = useCallback((delay: number, duration: number, volume: number, highpass: number) => {
    const context = contextRef.current
    const master = masterRef.current
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
    source.connect(filter).connect(gain).connect(master)
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

  return {
    playFreeze,
    playRescue,
    playGateOpen,
    playVictory,
    playDefeat,
    playSeekerProximity,
    playSeekerDetected,
  }
}
