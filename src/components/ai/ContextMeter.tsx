import { useState } from 'react';
import { useAi } from '../../lib/aiStore';
import { findModel } from '../../lib/modelCatalog';
import { useT } from '../../lib/i18n';

export function kiraToken(teks: string): number {
  return Math.ceil(teks.length / 4);
}

export function jendelaKonteks(modelId: string): number {
  const m = findModel(modelId);
  return m?.ctx && m.ctx > 0 ? m.ctx : 128_000;
}

/**
 * Harga indikatif (USD per 1 juta token: masuk/keluar) per model.
 *
 * Angka ini perkiraan untuk memberi gambaran biaya, BUKAN tagihan resmi.
 * Kalau model tidak ada di peta, biaya tidak ditampilkan (lebih baik kosong
 * daripada menampilkan angka palsu).
 */
const HARGA: Record<string, { masuk: number; keluar: number }> = {
  'gemini-3.8-flash': { masuk: 0.3, keluar: 2.5 },
  'gemini-3.7-flash': { masuk: 0.3, keluar: 2.5 },
  'gemini-3.6-flash': { masuk: 0.1, keluar: 0.4 },
  'gemini-3.1-pro-preview': { masuk: 1.25, keluar: 10 },
  'gemini-2.5-pro': { masuk: 1.25, keluar: 10 },
  'gemini-2.5-flash': { masuk: 0.3, keluar: 2.5 },
  'gpt-6-astra': { masuk: 2.5, keluar: 10 },
  'gpt-5.6-sol': { masuk: 1.25, keluar: 10 },
  'gpt-5.6-terra': { masuk: 0.5, keluar: 2 },
  'gpt-5.1-mini': { masuk: 0.25, keluar: 2 },
  'claude-opus-5': { masuk: 5, keluar: 25 },
  'claude-sonnet-5': { masuk: 3, keluar: 15 },
  'claude-haiku-4.5': { masuk: 1, keluar: 5 },
  'deepseek-v4-pro': { masuk: 0.28, keluar: 0.42 },
  'deepseek-chat': { masuk: 0.27, keluar: 1.1 },
  'grok-4.6': { masuk: 3, keluar: 15 },
  'grok-4': { masuk: 3, keluar: 15 },
};

export function perkiraanBiaya(
  modelId: string,
  tokenMasuk: number,
  tokenKeluar: number,
): number | null {
  const h = HARGA[modelId];
  if (!h) return null;
  return (tokenMasuk / 1_000_000) * h.masuk + (tokenKeluar / 1_000_000) * h.keluar;
}

export default function ContextMeter() {
  const tr = useT();
  const [buka, setBuka] = useState(false);
  const msgs = useAi((s) => s.activeSession()?.messages ?? []);
  const model = useAi((s) => s.model);

  const dipakai = msgs.reduce((n, m) => n + kiraToken(m.content ?? ''), 0);
  const total = jendelaKonteks(model);
  const persen = Math.min(100, Math.round((dipakai / total) * 100));

  // Token masuk (user) vs keluar (asisten) untuk estimasi biaya sesi.
  const tokMasuk = msgs
    .filter((m) => m.role === 'user')
    .reduce((n, m) => n + kiraToken(m.content ?? ''), 0);
  const tokKeluar = msgs
    .filter((m) => m.role === 'assistant')
    .reduce((n, m) => n + kiraToken(m.content ?? ''), 0);
  const biaya = perkiraanBiaya(model, tokMasuk, tokKeluar);

  const tingkat = persen >= 85 ? 'penuh' : persen >= 60 ? 'sedang' : 'aman';

  return (
    <span className="ctx-wrap">
      <button
        className={`ctx-btn is-${tingkat}`}
        data-testid="ctx-meter"
        data-persen={persen}
        title={tr('Context usage (estimate)')}
        aria-expanded={buka}
        onClick={() => setBuka((v) => !v)}
      >
        <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
          <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.3" />
          <circle
            cx="8"
            cy="8"
            r="6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray={`${(persen / 100) * 37.7} 37.7`}
            transform="rotate(-90 8 8)"
          />
        </svg>
        <span className="ctx-teks" data-testid="ctx-persen">
          {persen}%
        </span>
      </button>

      {buka && (
        <div className="ctx-pop" data-testid="ctx-pop" role="dialog" aria-label={tr('Context usage')}>
          <div className="ctx-head">
            <span className="ctx-besar">{persen}%</span>
            <span className="ctx-kecil" data-testid="ctx-angka">
              {dipakai.toLocaleString('id-ID')} / {total.toLocaleString('id-ID')}
            </span>
          </div>
          <div className="ctx-bar" role="progressbar" aria-valuenow={persen}>
            <div className={`ctx-bar-isi is-${tingkat}`} style={{ width: `${persen}%` }} />
          </div>
          <div className="ctx-baris">
            <span>{tr('Model')}</span>
            <b>{model || '-'}</b>
          </div>
          <div className="ctx-baris">
            <span>{tr('Context used')}</span>
            <b>{dipakai.toLocaleString('id-ID')}</b>
          </div>
          <div className="ctx-baris">
            <span>{tr('Context window')}</span>
            <b>{total.toLocaleString('id-ID')}</b>
          </div>
          <div className="ctx-baris">
            <span>{tr('Session tokens')}</span>
            <b data-testid="ctx-token-sesi">
              {tokMasuk.toLocaleString('id-ID')} ↓ / {tokKeluar.toLocaleString('id-ID')} ↑
            </b>
          </div>
          {biaya !== null && (
            <div className="ctx-baris">
              <span>{tr('Estimated cost')}</span>
              <b data-testid="ctx-biaya">
                {biaya < 0.01 ? `<$0.01` : `$${biaya.toFixed(biaya < 1 ? 3 : 2)}`}
              </b>
            </div>
          )}
          <p className="ctx-note">{tr('Estimated from the visible chat contents and tool payloads.')}</p>
          {biaya !== null && <p className="ctx-note">{tr('The cost is an estimate, not an official provider bill.')}</p>}
        </div>
      )}
    </span>
  );
}
