import { useState } from 'react'
import { CHARACTERS } from '../game/Characters'
import SettingsControls from './SettingsControls'

export type EntryScreen = 'title' | 'mode' | 'character' | 'multiplayer' | 'exit'
export interface MultiplayerLaunch {
  mode: 'host' | 'join'
  roomId: string
  nickname: string
  characterId: string
}

interface StartFlowProps {
  screen: EntryScreen
  onScreenChange: (screen: EntryScreen) => void
  onStartSolo: (characterId: string) => void
  onQuickStart: () => void
  onStartMultiplayer: (launch: MultiplayerLaunch) => void
}

const runners = CHARACTERS.filter((character) => character.role === 'runner')

function SettingsPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="start-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="start-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title" onMouseDown={(event) => event.stopPropagation()}>
        <p className="start-kicker">SYSTEM</p>
        <h2 id="settings-title">설정</h2>
        <SettingsControls />
        <button className="start-button primary" onClick={onClose}>적용하고 돌아가기</button>
      </section>
    </div>
  )
}

function createRoomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('')
}

export default function StartFlow({ screen, onScreenChange, onStartSolo, onQuickStart, onStartMultiplayer }: StartFlowProps) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [selectedCharacter, setSelectedCharacter] = useState(runners[0]?.id ?? 'R01')
  const [nickname, setNickname] = useState('도망자')
  const [roomCode, setRoomCode] = useState('')
  const [closeBlocked, setCloseBlocked] = useState(false)
  const multiplayerValid = nickname.trim().length >= 2

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
          <h1>
            {import.meta.env.DEV ? (
              <button type="button" className="quick-start-title" onClick={onQuickStart} title="개발 게임 바로 시작">
                <span>얼음,</span> 땡!
              </button>
            ) : <><span>얼음,</span> 땡!</>}
          </h1>
          {import.meta.env.DEV && <p className="quick-start-hint">개발 모드 · 타이틀 클릭 바로 시작</p>}
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
                <i className={`character-portrait character-${character.id.toLowerCase()}`} aria-hidden="true"><span className="face" /><span className="detail" /></i>
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
          <label className="text-field"><span>캐릭터</span><select value={selectedCharacter} onChange={(event) => setSelectedCharacter(event.target.value)}>{runners.map((character) => <option key={character.id} value={character.id}>{character.name} · {character.tag}</option>)}</select></label>
          <div className="multi-actions">
            <button className="mode-card" disabled={!multiplayerValid} onClick={() => onStartMultiplayer({ mode: 'host', roomId: createRoomCode(), nickname: nickname.trim(), characterId: selectedCharacter })}><b>새 방 만들기</b><span>6자리 초대 코드를 만들고 대기방으로 이동합니다.</span></button>
            <label className="join-card"><span>방 코드</span><input maxLength={6} value={roomCode} onChange={(event) => setRoomCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="ABC234" /><button disabled={!multiplayerValid || roomCode.length !== 6} onClick={() => onStartMultiplayer({ mode: 'join', roomId: roomCode, nickname: nickname.trim(), characterId: selectedCharacter })}>방 참가</button></label>
          </div>
          <p className="contract-note">제출용 협동 모드는 인간 2명과 독립 AI 동료 2명으로 진행됩니다. 두 인간이 캐릭터 선택과 준비를 마치면 방장이 시작합니다.</p>
        </section>
      )}

      {screen === 'exit' && (
        <section className="flow-panel exit-panel"><p className="start-kicker">EXIT</p><h2>게임을 종료할까요?</h2><p>{closeBlocked ? '자동 종료가 차단되었습니다. 이 브라우저 탭을 직접 닫아주세요.' : '브라우저 보안상 창을 자동으로 닫지 못할 수 있습니다.'}</p><div className="exit-actions"><button className="start-button" onClick={() => { setCloseBlocked(false); onScreenChange('title') }}>계속 플레이</button><button className="start-button danger" onClick={requestExit}>나가기</button></div></section>
      )}
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
    </main>
  )
}
