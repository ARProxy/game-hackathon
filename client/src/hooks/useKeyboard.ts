/**
 * 키보드 입력 상태를 추적하는 hook
 * 매 프레임마다 현재 눌린 키를 확인할 수 있다.
 */

import { useEffect, useRef } from 'react'

export default function useKeyboard() {
  const keys = useRef<Set<string>>(new Set())

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      keys.current.add(e.code)
    }
    const onKeyUp = (e: KeyboardEvent) => {
      keys.current.delete(e.code)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  return keys
}
