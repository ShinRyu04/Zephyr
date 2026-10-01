import { Component, type ErrorInfo, type ReactNode } from 'react';
import { tx } from '../../lib/i18n';

export class ErrorBoundary extends Component<
  { children: ReactNode; nama?: string },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {

    console.error('[Zephyr] render error:', error, info?.componentStack ?? '');
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const bagian = this.props.nama ?? 'panel';
    return (
      <div className="err-boundary" role="alert">
        <div className="err-boundary-judul">
          {tx('This section failed to render')} - {bagian}
        </div>
        <div className="err-boundary-pesan">{error.message}</div>
        <div className="err-boundary-aksi">
          <button className="btn" onClick={() => this.setState({ error: null })}>
            {tx('Try again')}
          </button>
          <button className="btn" onClick={() => window.location.reload()}>
            {tx('Reload Zephyr')}
          </button>
        </div>
        <details className="err-boundary-detail">
          <summary>{tx('Technical details')}</summary>
          <pre>{String(error.stack ?? error.message).slice(0, 2000)}</pre>
        </details>
      </div>
    );
  }
}
