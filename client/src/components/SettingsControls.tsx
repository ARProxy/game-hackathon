import { useCallback, useEffect, useState } from 'react'
import { useSettingsStore, type GraphicsQuality, type SpeechLanguage } from '../stores/settingsStore'

type MicrophoneStatus = 'idle' | 'testing' | 'heard' | 'silent' | 'denied' | 'unsupported'

const statusText: Record<MicrophoneStatus, string> = {
  idle: '선택한 입력 장치를 테스트할 수 있습니다.',
  testing: '2초 동안 입력 크기를 확인하고 있습니다…',
  heard: '마이크 입력이 정상적으로 감지됐습니다.',
  silent: '장치는 열렸지만 소리가 감지되지 않았습니다.',
  denied: '마이크 권한이 거부됐습니다. 브라우저 권한을 확인하세요.',
  unsupported: '이 브라우저에서는 마이크 장치 테스트를 지원하지 않습니다.',
}

export default function SettingsControls({ compact = false }: { compact?: boolean }) {
  const settings = useSettingsStore()
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([])
  const [microphoneStatus, setMicrophoneStatus] = useState<MicrophoneStatus>('idle')

  const refreshMicrophones = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return
    const devices = await navigator.mediaDevices.enumerateDevices()
    setMicrophones(devices.filter((device) => device.kind === 'audioinput'))
  }, [])

  useEffect(() => {
    void refreshMicrophones().catch(() => setMicrophoneStatus('unsupported'))
    navigator.mediaDevices?.addEventListener?.('devicechange', refreshMicrophones)
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', refreshMicrophones)
  }, [refreshMicrophones])

  const testMicrophone = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicrophoneStatus('unsupported')
      return
    }
    setMicrophoneStatus('testing')
    let stream: MediaStream | null = null
    let context: AudioContext | null = null
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: settings.microphoneDeviceId
          ? { deviceId: { exact: settings.microphoneDeviceId } }
          : true,
      })
      await refreshMicrophones()
      context = new AudioContext()
      const analyser = context.createAnalyser()
      analyser.fftSize = 256
      context.createMediaStreamSource(stream).connect(analyser)
      const samples = new Uint8Array(analyser.frequencyBinCount)
      let peak = 0
      const startedAt = performance.now()
      while (performance.now() - startedAt < 1_800) {
        analyser.getByteTimeDomainData(samples)
        for (const value of samples) peak = Math.max(peak, Math.abs(value - 128))
        await new Promise((resolve) => window.setTimeout(resolve, 60))
      }
      setMicrophoneStatus(peak >= 4 ? 'heard' : 'silent')
    } catch (error) {
      const denied = error instanceof DOMException && ['NotAllowedError', 'SecurityError'].includes(error.name)
      setMicrophoneStatus(denied ? 'denied' : 'unsupported')
    } finally {
      stream?.getTracks().forEach((track) => track.stop())
      if (context) void context.close()
    }
  }

  return (
    <div className={`settings-controls ${compact ? 'compact' : ''}`}>
      <fieldset>
        <legend>사운드</legend>
        <Volume label="전체" value={settings.masterVolume} setValue={settings.setMasterVolume} />
        <Volume label="효과음" value={settings.effectsVolume} setValue={settings.setEffectsVolume} />
        <Volume label="환경음" value={settings.ambienceVolume} setValue={settings.setAmbienceVolume} />
        <Volume label="AI 음성" value={settings.voiceVolume} setValue={settings.setVoiceVolume} />
      </fieldset>

      <fieldset>
        <legend>마이크·음성 인식</legend>
        <label className="setting-select"><span>입력 장치</span><select value={settings.microphoneDeviceId} onChange={(event) => settings.setMicrophoneDeviceId(event.target.value)}><option value="">시스템 기본 마이크</option>{microphones.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `마이크 ${index + 1}`}</option>)}</select></label>
        <label className="setting-select"><span>인식 언어</span><select value={settings.speechLanguage} onChange={(event) => settings.setSpeechLanguage(event.target.value as SpeechLanguage)}><option value="ko-KR">한국어</option><option value="en-US">English</option></select></label>
        <button type="button" className="settings-test-button" disabled={microphoneStatus === 'testing'} onClick={() => void testMicrophone()}>마이크 입력 테스트</button>
        <p className={`settings-test-status ${microphoneStatus}`}>{statusText[microphoneStatus]}</p>
      </fieldset>

      <fieldset>
        <legend>화면·접근성</legend>
        <label className="setting-toggle"><span>자막 표시</span><input type="checkbox" checked={settings.subtitlesEnabled} onChange={(event) => settings.setSubtitlesEnabled(event.target.checked)} /></label>
        <label className="setting-row"><span>자막 크기 <b>{Math.round(settings.subtitleScale * 100)}%</b></span><input type="range" min="0.8" max="1.5" step="0.05" value={settings.subtitleScale} onChange={(event) => settings.setSubtitleScale(Number(event.target.value))} /></label>
        <label className="setting-select"><span>그래픽 품질</span><select value={settings.graphicsQuality} onChange={(event) => settings.setGraphicsQuality(event.target.value as GraphicsQuality)}><option value="low">낮음</option><option value="medium">중간</option><option value="high">높음</option></select></label>
        <label className="setting-toggle"><span>실시간 그림자</span><input type="checkbox" checked={settings.shadowsEnabled} onChange={(event) => settings.setShadowsEnabled(event.target.checked)} /></label>
        <label className="setting-row"><span>렌더 배율 <b>{Math.round(settings.renderScale * 100)}%</b></span><input type="range" min="0.6" max="1.5" step="0.1" value={settings.renderScale} onChange={(event) => settings.setRenderScale(Number(event.target.value))} /></label>
        <label className="setting-toggle"><span>광과민성 보호</span><input type="checkbox" checked={settings.reducedFlashes} onChange={(event) => settings.setReducedFlashes(event.target.checked)} /></label>
      </fieldset>

      <fieldset>
        <legend>조작</legend>
        <label className="setting-row"><span>마우스 감도 <b>{settings.mouseSensitivity.toFixed(1)}x</b></span><input type="range" min="0.4" max="2" step="0.1" value={settings.mouseSensitivity} onChange={(event) => settings.setMouseSensitivity(Number(event.target.value))} /></label>
        <label className="setting-toggle"><span>카메라 Y축 반전</span><input type="checkbox" checked={settings.invertY} onChange={(event) => settings.setInvertY(event.target.checked)} /></label>
      </fieldset>
    </div>
  )
}

function Volume({ label, value, setValue }: { label: string; value: number; setValue: (value: number) => void }) {
  return <label className="setting-row"><span>{label} 음량 <b>{Math.round(value * 100)}%</b></span><input type="range" min="0" max="1" step="0.01" value={value} onChange={(event) => setValue(Number(event.target.value))} /></label>
}
