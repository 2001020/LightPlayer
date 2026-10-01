// Last line of defence: a render error must never leave an empty window.

import { Component, type ReactNode } from "react";

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("LightPlayer UI error:", error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash">
        <div className="crash-card">
          <h2>界面出现了问题</h2>
          <p>播放不受影响。可以先尝试继续使用，如果仍有问题请重新载入界面。</p>
          <pre>{this.state.error.message}</pre>
          <div className="crash-actions">
            <button className="btn" onClick={() => this.setState({ error: null })}>
              继续使用
            </button>
            <button className="btn primary" onClick={() => location.reload()}>
              重新载入界面
            </button>
          </div>
        </div>
      </div>
    );
  }
}
