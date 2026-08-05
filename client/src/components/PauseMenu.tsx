import { useEffect } from 'react'
import { sendGameMessage } from '../hooks/useWebSocket'
import { useGameStore } from '../stores/gameStore'
import { useSettingsStore } from '../stores/settingsStore'

const ACTIVE_PHASES = new Set(['playing', 'final_spell', 'escape'])

export default function PauseMenu({ onMainMenu }: { onMainMenu: () => void }) {
  const paused = useGameStore((state) => state.isPaused)
  const settings = useSettingsStore()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Escape' || event.repeat) return
      const target = event.target as HTMLElement | null
      if (target?.matches('input, textarea, [contenteditable="true"]')) return
      if (!ACTIVE_PHASES.has(useGameStore.getState().phase)) return
      event.preventDefault()
      if (document.pointerLockElement) document.exitPointerLock()
      sendGameMessage({ type: 'action', payload: { action_type: useGameStore.getState().isPaused ? 'resume_game' : 'pause_game' } })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  if (!paused) return null

  return (
    <div className="pause-backdrop" role="dialog" aria-modal="true" aria-labelledby="pause-title">
      <section className="pause-panel">
        <p className="start-kicker">GAME PAUSED</p>
        <h2 id="pause-title">잠시 멈춤</h2>
        <div className="pause-columns">
          <div>
            <h3>설정</h3>
            <label className="setting-row"><span>전체 음량 <b>{Math.round(settings.masterVolume * 100)}%</b></span><input type="range" min="0" max="1" step="0.01" value={settings.masterVolume} onChange={(e) => settings.setMasterVolume(Number(e.target.value))} /></label>
            <label className="setting-row"><span>마우스 감도 <b>{settings.mouseSensitivity.toFixed(1)}x</b></span><input type="range" min="0.4" max="2" step="0.1" value={settings.mouseSensitivity} onChange={(e) => settings.setMouseSensitivity(Number(e.target.value))} /></label>
            <label className="setting-toggle"><span>자막 표시</span><input type="checkbox" checked={settings.subtitlesEnabled} onChange={(e) => settings.setSubtitlesEnabled(e.target.checked)} /></label>
          </div>
          <div>
            <h3>조작법</h3>
            <dl className="control-guide"><div><dt>WASD</dt><dd>이동</dd></div><div><dt>마우스</dt><dd>시점</dd></div><div><dt>Space</dt><dd>점프</dd></div><div><dt>Q</dt><dd>누르고 말하기</dd></div><div><dt>E</dt><dd>구조 요청·상호작용</dd></div><div><dt>Esc</dt><dd>계속하기</dd></div></dl>
          </div>
        </div>
        <div className="pause-actions">
          <button className="start-button primary" onClick={() => sendGameMessage({ type: 'action', payload: { action_type: 'resume_game' } })}>계속하기</button>
          <button className="start-button" onClick={onMainMenu}>메인 메뉴</button>
        </div>
      </section>
    </div>
  )
}
