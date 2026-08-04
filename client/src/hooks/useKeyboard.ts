/**
 * 키보드 입력 상태를 추적하는 hook
 * 매 프레임마다 현재 눌린 키를 확인할 수 있다.
 */

import { useEffect, useRef } from 'react'

export default function useKeyboard() {
  const keys = useRef<Set<string>>(new Set())

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target?.matches('input, textarea, [contenteditable="true"]')) {
        keys.current.clear()
        return
      }
      keys.current.add(e.code)
    }
    const onKeyUp = (e: KeyboardEvent) => {
      keys.current.delete(e.code)
    }
    const clearKeys = () => keys.current.clear()

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', clearKeys)
    document.addEventListener('focusin', clearKeys)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', clearKeys)
      document.removeEventListener('focusin', clearKeys)
    }
  }, [])

  return keys
}
