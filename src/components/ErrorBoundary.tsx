import { Component, type ReactNode } from 'react';

interface State {
  message: string | null;
}

/** If a screen crashes, show what went wrong instead of a blank page. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { message: null };

  static getDerivedStateFromError(error: unknown): State {
    return { message: error instanceof Error ? error.message : String(error) };
  }

  render() {
    if (this.state.message === null) return this.props.children;
    return (
      <main className="content">
        <h2>Something went wrong</h2>
        <p className="hint">Reload the page to carry on. If it keeps happening, send this message to support:</p>
        <p className="error" role="alert">
          {this.state.message}
        </p>
        <button type="button" className="btn" onClick={() => window.location.reload()}>
          Reload
        </button>
      </main>
    );
  }
}
