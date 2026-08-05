import { useState, type CSSProperties } from 'react'
import { CHARACTERS } from '../game/Characters'
import { useSettingsStore } from '../stores/settingsStore'

export type EntryScreen = 'title' | 'mode' | 'character' | 'multiplayer' | 'exit'

interface StartFlowProps {
  screen: EntryScreen
  onScreenChange: (screen: EntryScreen) => void
  onStartSolo: (characterId: string) => void
}

const runners = CHARACTERS.filter((character) => character.role === 'runner')

function SettingsPanel({ onClose }: { onClose: () => void }) {
  const settings = useSettingsStore()
  return (
    <div className="start-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="start-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title" onMouseDown={(event) => event.stopPropagation()}>
        <p className="start-kicker">SYSTEM</p>
        <h2 id="settings-title">설정</h2>
        <label className="setting-row">
          <span>전체 음량 <b>{Math.round(settings.masterVolume * 100)}%</b></span>
          <input type="range" min="0" max="1" step="0.01" value={settings.masterVolume} onChange={(event) => settings.setMasterVolume(Number(event.target.value))} />
        </label>
        <label className="setting-row">
          <span>마우스 감도 <b>{settings.mouseSensitivity.toFixed(1)}x</b></span>
          <input type="range" min="0.4" max="2" step="0.1" value={settings.mouseSensitivity} onChange={(event) => settings.setMouseSensitivity(Number(event.target.value))} />
        </label>
        <label className="setting-toggle">
          <span>자막</span>
          <input type="checkbox" checked={settings.subtitlesEnabled} onChange={(event) => settings.setSubtitlesEnabled(event.target.checked)} />
        </label>
        <button className="start-button primary" onClick={onClose}>적용하고 돌아가기</button>
      </section>
    </div>
  )
}

export default function StartFlow({ screen, onScreenChange, onStartSolo }: StartFlowProps) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [selectedCharacter, setSelectedCharacter] = useState(runners[0]?.id ?? 'R01')
  const [nickname, setNickname] = useState('도망자')
  const [roomCode, setRoomCode] = useState('')
  const [closeBlocked, setCloseBlocked] = useState(false)

  const requestExit = () => {
    window.close()
    window.setTimeout(() => setCloseBlocked(true), 150)
  }

  return (
    <main className="start-flow">
      <div className="start-noise" />
      {screen === 'title' && (
        <section className="title-panel">
          <p className="start-kicker">말하면 위험하다</p>
          <h1><span>얼음,</span> 땡!</h1>
          <p className="title-copy">금지된 말을 피해 단서를 모으고<br />술래가 닿기 전에 학교를 탈출하라.</p>
          <nav className="start-actions" aria-label="메인 메뉴">
            <button className="start-button primary" onClick={() => onScreenChange('mode')}>게임 시작</button>
            <button className="start-button" onClick={() => setSettingsOpen(true)}>설정</button>
            <button className="start-button quiet" onClick={() => onScreenChange('exit')}>나가기</button>
          </nav>
        </section>
      )}

      {screen === 'mode' && (
        <section className="flow-panel wide">
          <button className="back-button" onClick={() => onScreenChange('title')}>← 돌아가기</button>
          <p className="start-kicker">PLAY MODE</p><h2>어떻게 도망칠까요?</h2>
          <div className="mode-grid">
            <button className="mode-card" onClick={() => onScreenChange('character')}><b>솔로 플레이</b><span>지능형 AI 동료와 함께 임무를 해결합니다.</span><em>바로 시작 가능</em></button>
            <button className="mode-card" onClick={() => onScreenChange('multiplayer')}><b>멀티 플레이</b><span>방을 만들거나 코드로 친구의 방에 참가합니다.</span><em>방 연결 준비</em></button>
          </div>
        </section>
      )}

      {screen === 'character' && (
        <section className="flow-panel wide">
          <button className="back-button" onClick={() => onScreenChange('mode')}>← 모드 선택</button>
          <p className="start-kicker">RUNNER SELECT</p><h2>도망자를 선택하세요</h2>
          <div className="character-grid">
            {runners.map((character) => (
              <button key={character.id} className={`character-card ${selectedCharacter === character.id ? 'selected' : ''}`} onClick={() => setSelectedCharacter(character.id)}>
                <i style={{ '--character-color': character.c, '--character-glow': character.glow } as CSSProperties}><span /></i>
                <b>{character.name}</b><span>NO. {character.tag}</span><small>{character.accessory}</small>
              </button>
            ))}
          </div>
          <button className="start-button primary character-confirm" onClick={() => onStartSolo(selectedCharacter)}>이 캐릭터로 시작</button>
        </section>
      )}

      {screen === 'multiplayer' && (
        <section className="flow-panel multiplayer-panel">
          <button className="back-button" onClick={() => onScreenChange('mode')}>← 모드 선택</button>
          <p className="start-kicker">MULTIPLAYER LOBBY</p><h2>친구와 탈출 준비</h2>
          <label className="text-field"><span>닉네임</span><input maxLength={12} value={nickname} onChange={(event) => setNickname(event.target.value)} /></label>
          <div className="multi-actions">
            <button className="mode-card" disabled><b>새 방 만들기</b><span>서버 권위 방 계약 구현 후 활성화됩니다.</span></button>
            <label className="join-card"><span>방 코드</span><input maxLength={8} value={roomCode} onChange={(event) => setRoomCode(event.target.value.toUpperCase())} placeholder="ICE-000" /><button disabled>서버 연결 후 참가 가능</button></label>
          </div>
          <p className="contract-note">현재는 솔로 플레이만 완주할 수 있습니다. 멀티 버튼은 실제 서버 방·준비·재접속 상태가 연결되기 전까지 게임을 시작하지 않습니다.</p>
        </section>
      )}

      {screen === 'exit' && (
        <section className="flow-panel exit-panel"><p className="start-kicker">EXIT</p><h2>게임을 종료할까요?</h2><p>{closeBlocked ? '자동 종료가 차단되었습니다. 이 브라우저 탭을 직접 닫아주세요.' : '브라우저 보안상 창을 자동으로 닫지 못할 수 있습니다.'}</p><div className="exit-actions"><button className="start-button" onClick={() => { setCloseBlocked(false); onScreenChange('title') }}>계속 플레이</button><button className="start-button danger" onClick={requestExit}>나가기</button></div></section>
      )}
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
    </main>
  )
}
