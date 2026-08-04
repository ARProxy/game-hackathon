/**
 * Web Speech API — Push-to-Talk
 * - 스페이스바를 누르고 있는 동안 음성 인식
 * - interim result를 실시간으로 콜백
 * - final result를 콜백
 */

import { useEffect, useRef, useCallback } from 'react'

interface UseSpeechOptions {
  onInterim?: (transcript: string) => void
  onFinal?: (transcript: string) => void
  onStart?: () => void
  onEnd?: () => void
  lang?: string
}

export default function useSpeech({
  onInterim,
  onFinal,
  onStart,
  onEnd,
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
      return
    }

    const recognition = new SpeechRecognition()
    recognition.lang = lang
    recognition.interimResults = true
    recognition.continuous = true

    recognition.onstart = () => {
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
      isListening.current = false
    }

    recognition.onend = () => {
      isListening.current = false
      onEnd?.()
    }

    recognition.start()
    recognitionRef.current = recognition
  }, [lang, onInterim, onFinal, onStart, onEnd])

  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListening.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
    }
  }, [])

  // Q키 Push-to-Talk
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
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
  }, [startListening, stopListening])

  return { isListening: isListening.current, startListening, stopListening }
}
