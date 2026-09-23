// CapturePanel.tsx — Settings → MCP → Capture requests (T4.8).
//
// KENAPA ada: saat AI menjawab aneh (atau tidak menjawab), yang menentukan
// adalah BODY yang benar-benar dikirim ke provider — bukan pesan yang diniatkan
// user. Adapter menerjemahkan pesan ke bentuk provider, dan di situlah bug
// biasanya bersembunyi (mis. Gemini butuh ?alt=sse, Anthropic butuh max_tokens).
//
// KENAPA ditampilkan mentah: ini alat debugging. Merapikan tampilannya berarti
// menyembunyikan bagian yang justru dicari (header mana yang terkirim, field
// apa yang ada di body).
//
// KEAMANAN: header Authorization / api-key / token sudah dibuang di Rust
// sebelum disimpan. Panel ini TIDAK menerima apa pun yang sensitif — jadi
// aman disalin ke laporan bug.

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
      /* command belum ada (build lama) — panel tetap tampil kosong */
    }
  };

  useEffect(() => {
    void muat();
    // Polling ringan: rekaman berubah karena aksi di panel lain (chat), bukan
    // di sini — tanpa polling, user harus menutup-buka Settings untuk melihat.
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
        <span className="cp-judul">{tr('Rekam request AI')}</span>
        <button
          role="switch"
          aria-checked={on}
          aria-label={tr('Rekam request AI')}
          className={`set-toggle${on ? ' is-on' : ''}`}
          data-testid="cp-toggle"
          disabled={busy}
          onClick={() => void toggle(!on)}
        >
          <span className="set-toggle-knob" />
        </button>
        <span className="cp-spacer" />
        <span className="cp-jumlah" data-testid="cp-jumlah">
          {daftar.length} {tr('request terekam')}
        </span>
        {daftar.length > 0 && (
          <button className="btn btn-sm" data-testid="cp-bersih" disabled={busy} onClick={() => void bersihkan()}>
            {tr('Bersihkan')}
          </button>
        )}
      </div>

      <p className="set-note">
        {tr(
          'Merekam request yang dikirim ke provider (URL, header, body) supaya bisa diperiksa saat jawaban tidak sesuai. Header berisi API key SUDAH DIBUANG — rekaman ini aman disalin ke laporan bug.',
        )}
      </p>

      {daftar.length === 0 ? (
        <p className="set-note" data-testid="cp-kosong">
          {on
            ? tr('Belum ada request. Kirim satu pesan di panel AI, lalu kembali ke sini.')
            : tr('Rekaman mati. Nyalakan, lalu kirim pesan di panel AI.')}
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
                      {r.chars.toLocaleString('id-ID')} {tr('karakter')}
                    </span>
                    <span className="cp-waktu">{(r.atMs / 1000).toFixed(1)}s</span>
                  </button>
                  {terbuka && (
                    <div className="cp-isi">
                      <div className="cp-seksi">{tr('URL')}</div>
                      <code className="cp-url">{r.url}</code>
                      <div className="cp-seksi">{tr('Header (tanpa kredensial)')}</div>
                      <pre className="cp-pre">{r.headers.map(([k, v]) => `${k}: ${v}`).join('\n') || '—'}</pre>
                      <div className="cp-seksi">{tr('Body')}</div>
                      <pre className="cp-pre" data-testid="cp-body">
                        {JSON.stringify(r.body, null, 2)}
                      </pre>
                      <div className="cp-aksi">
                        <button className="btn btn-sm" data-testid="cp-salin" onClick={() => salinSatu(r, idx)}>
                          {salin === idx ? tr('Tersalin') : tr('Salin request ini')}
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
