/**
 * Web Speech API — Push-to-Talk
 * - 스페이스바를 누르고 있는 동안 음성 인식
 * - interim result를 실시간으로 콜백
 * - final result를 콜백
 */

import { useEffect, useRef, useCallback } from 'react'

interface UseSpeechOptions {
  enabled?: boolean
  onInterim?: (transcript: string) => void
  onFinal?: (transcript: string) => void
  onStart?: () => void
  onEnd?: () => void
  onUnavailable?: (reason: 'unsupported' | 'permission_denied' | 'recognition_error') => void
  lang?: string
}

export default function useSpeech({
  enabled = true,
  onInterim,
  onFinal,
  onStart,
  onEnd,
  onUnavailable,
  lang = 'ko-KR',
}: UseSpeechOptions) {
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const isListening = useRef(false)

  const startListening = useCallback(() => {
    if (isListening.current) return

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      console.warn('[Speech] Web Speech API not supported')
      onUnavailable?.('unsupported')
      return
    }

    const recognition = new SpeechRecognition()
    recognition.lang = lang
    recognition.interimResults = true
    recognition.continuous = true
    let finished = false

    const finish = () => {
      if (finished) return
      finished = true
      if (recognitionRef.current === recognition) recognitionRef.current = null
      const wasListening = isListening.current
      isListening.current = false
      if (wasListening) onEnd?.()
    }

    recognition.onstart = () => {
      if (finished) return
      isListening.current = true
      onStart?.()
    }

    recognition.onresult = (event) => {
      let interim = ''
      let final = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          final += transcript
        } else {
          interim += transcript
        }
      }

      if (interim) onInterim?.(interim)
      if (final) onFinal?.(final)
    }

    recognition.onerror = (event) => {
      console.error('[Speech] error:', event.error)
      onUnavailable?.(
        event.error === 'not-allowed' || event.error === 'service-not-allowed'
          ? 'permission_denied'
          : 'recognition_error',
      )
      finish()
    }

    recognition.onend = finish

    recognitionRef.current = recognition
    try {
      recognition.start()
    } catch (error) {
      console.error('[Speech] failed to start:', error)
      onUnavailable?.('recognition_error')
      finish()
    }
  }, [lang, onInterim, onFinal, onStart, onEnd, onUnavailable])

  const stopListening = useCallback(() => {
    const recognition = recognitionRef.current
    if (recognition) {
      try {
        recognition.stop()
      } catch (error) {
        console.error('[Speech] failed to stop:', error)
        recognitionRef.current = null
        if (isListening.current) {
          isListening.current = false
          onEnd?.()
        }
      }
    }
  }, [onEnd])

  // Q키 Push-to-Talk
  useEffect(() => {
    if (!enabled) {
      stopListening()
      return
    }
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target
      if (target instanceof Element && target.matches('input, textarea, [contenteditable="true"]')) return
      if (e.code === 'KeyQ' && !e.repeat) {
        startListening()
      }
    }

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'KeyQ') {
        stopListening()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      stopListening()
    }
  }, [enabled, startListening, stopListening])

  return { isListening: isListening.current, startListening, stopListening }
}
