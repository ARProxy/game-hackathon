import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  onRetry: () => void
  onMainMenu: () => void
}

interface State {
  error: Error | null
}

export default class GameErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Game] 3D scene crashed', error, info.componentStack)
  }

  private retry = () => {
    this.setState({ error: null })
    this.props.onRetry()
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="game-error" role="alert">
        <section>
          <p>RECOVERY MODE</p>
          <h2>3D 화면을 불러오지 못했습니다</h2>
          <span>게임 데이터는 안전합니다. 화면을 다시 시작하거나 메인 메뉴로 돌아갈 수 있습니다.</span>
          <details>
            <summary>오류 정보</summary>
            <code>{this.state.error.message}</code>
          </details>
          <div>
            <button className="start-button primary" type="button" onClick={this.retry}>3D 화면 다시 시작</button>
            <button className="start-button" type="button" onClick={this.props.onMainMenu}>메인 메뉴로 돌아가기</button>
          </div>
        </section>
      </div>
    )
  }
}
