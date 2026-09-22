import { Component, type ErrorInfo, type ReactNode } from 'react';
import { tx } from '../../lib/i18n';

/**
 * Penjaring error render (React error boundary).
 *
 * Sebelum ini Zephyr tidak punya boundary sama sekali: satu exception di
 * komponen mana pun membuat React melepas SELURUH tree → jendela jadi kosong
 * putih/hitam permanen sampai user me-reload. Sudah kejadian nyata di
 * Settings → Model AI (`models.providers` undefined). Dengan boundary ini,
 * hanya bagian yang error yang diganti kartu pemulihan; sisa app tetap hidup
 * dan user bisa lanjut kerja tanpa kehilangan sesi.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode; nama?: string },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Jejak ke console supaya masih bisa dilacak di devtools / CDP.
    console.error('[Zephyr] render error:', error, info?.componentStack ?? '');
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const bagian = this.props.nama ?? 'panel';
    return (
      <div className="err-boundary" role="alert">
        <div className="err-boundary-judul">
          {tx('Bagian ini gagal ditampilkan')} — {bagian}
        </div>
        <div className="err-boundary-pesan">{error.message}</div>
        <div className="err-boundary-aksi">
          <button className="btn" onClick={() => this.setState({ error: null })}>
            {tx('Coba lagi')}
          </button>
          <button className="btn" onClick={() => window.location.reload()}>
            {tx('Muat ulang Zephyr')}
          </button>
        </div>
        <details className="err-boundary-detail">
          <summary>{tx('Detail teknis')}</summary>
          <pre>{String(error.stack ?? error.message).slice(0, 2000)}</pre>
        </details>
      </div>
    );
  }
}
