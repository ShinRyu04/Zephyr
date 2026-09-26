import { useEffect, useState } from 'react';
import * as cmd from '../../lib/commands';
import { useT } from '../../lib/i18n';

interface Captured {
  atMs: number;
  provider: string;
  model: string;
  url: string;
  headers: [string, string][];
  body: unknown;
  chars: number;
}

export default function CapturePanel() {
  const tr = useT();
  const [on, setOn] = useState(false);
  const [daftar, setDaftar] = useState<Captured[]>([]);
  const [buka, setBuka] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [salin, setSalin] = useState<number | null>(null);

  const muat = async () => {
    try {
      const [nyala, isi] = await cmd.aiCaptureGet();
      setOn(nyala);
      setDaftar(isi ?? []);
    } catch {
      /* command belum ada (build lama) - panel tetap tampil kosong */
    }
  };

  useEffect(() => {
    void muat();

    const t = window.setInterval(() => void muat(), 2500);
    return () => window.clearInterval(t);
  }, []);

  const toggle = async (v: boolean) => {
    setBusy(true);
    try {
      await cmd.aiCaptureSet(v);
      await muat();
    } finally {
      setBusy(false);
    }
  };

  const bersihkan = async () => {
    setBusy(true);
    try {
      await cmd.aiCaptureClear();
      await muat();
    } finally {
      setBusy(false);
    }
  };

  const salinSatu = (r: Captured, i: number) => {
    const teks = [
      `# ${r.provider} / ${r.model}`,
      `POST ${r.url}`,
      ...r.headers.map(([k, v]) => `${k}: ${v}`),
      '',
      JSON.stringify(r.body, null, 2),
    ].join('\n');
    void navigator.clipboard?.writeText(teks).catch(() => {});
    setSalin(i);
    window.setTimeout(() => setSalin(null), 1600);
  };

  return (
    <div className="cp-root" data-testid="capture-panel">
      <div className="cp-head">
        <span className="cp-judul">{tr('Record AI requests')}</span>
        <button
          role="switch"
          aria-checked={on}
          aria-label={tr('Record AI requests')}
          className={`set-toggle${on ? ' is-on' : ''}`}
          data-testid="cp-toggle"
          disabled={busy}
          onClick={() => void toggle(!on)}
        >
          <span className="set-toggle-knob" />
        </button>
        <span className="cp-spacer" />
        <span className="cp-jumlah" data-testid="cp-jumlah">
          {daftar.length} {tr('requests recorded')}
        </span>
        {daftar.length > 0 && (
          <button className="btn btn-sm" data-testid="cp-bersih" disabled={busy} onClick={() => void bersihkan()}>
            {tr('Clear')}
          </button>
        )}
      </div>

      <p className="set-note">
        {tr(
          'Records the requests sent to the provider (URL, headers, body) so they can be inspected when a response is wrong. Headers containing API keys are ALREADY STRIPPED - this recording is safe to copy into a bug report.',
        )}
      </p>

      {daftar.length === 0 ? (
        <p className="set-note" data-testid="cp-kosong">
          {on
            ? tr('No requests yet. Send a message in the AI panel, then come back here.')
            : tr('Recording is off. Turn it on, then send a message in the AI panel.')}
        </p>
      ) : (
        <div className="cp-list" data-testid="cp-list">
          {daftar
            .slice()
            .reverse()
            .map((r, i) => {
              const idx = daftar.length - 1 - i;
              const terbuka = buka === idx;
              return (
                <div className="cp-item" key={idx} data-testid="cp-item">
                  <button
                    className="cp-baris"
                    aria-expanded={terbuka}
                    data-testid="cp-buka"
                    onClick={() => setBuka(terbuka ? null : idx)}
                  >
                    <span className="cp-prov">{r.provider}</span>
                    <span className="cp-model">{r.model}</span>
                    <span className="cp-metrik">
                      {r.chars.toLocaleString('id-ID')} {tr('characters')}
                    </span>
                    <span className="cp-waktu">{(r.atMs / 1000).toFixed(1)}s</span>
                  </button>
                  {terbuka && (
                    <div className="cp-isi">
                      <div className="cp-seksi">{tr('URL')}</div>
                      <code className="cp-url">{r.url}</code>
                      <div className="cp-seksi">{tr('Headers (without credentials)')}</div>
                      <pre className="cp-pre">{r.headers.map(([k, v]) => `${k}: ${v}`).join('\n') || '-'}</pre>
                      <div className="cp-seksi">{tr('Body')}</div>
                      <pre className="cp-pre" data-testid="cp-body">
                        {JSON.stringify(r.body, null, 2)}
                      </pre>
                      <div className="cp-aksi">
                        <button className="btn btn-sm" data-testid="cp-salin" onClick={() => salinSatu(r, idx)}>
                          {salin === idx ? tr('Copied') : tr('Copy this request')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
