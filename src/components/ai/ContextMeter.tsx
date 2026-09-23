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

export default function ContextMeter() {
  const tr = useT();
  const [buka, setBuka] = useState(false);
  const msgs = useAi((s) => s.activeSession()?.messages ?? []);
  const model = useAi((s) => s.model);

  const dipakai = msgs.reduce((n, m) => n + kiraToken(m.content ?? ''), 0);
  const total = jendelaKonteks(model);
  const persen = Math.min(100, Math.round((dipakai / total) * 100));

  const tingkat = persen >= 85 ? 'penuh' : persen >= 60 ? 'sedang' : 'aman';

  return (
    <span className="ctx-wrap">
      <button
        className={`ctx-btn is-${tingkat}`}
        data-testid="ctx-meter"
        data-persen={persen}
        title={tr('Pemakaian konteks (perkiraan)')}
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
        <div className="ctx-pop" data-testid="ctx-pop" role="dialog" aria-label={tr('Pemakaian konteks')}>
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
            <b>{model || '—'}</b>
          </div>
          <div className="ctx-baris">
            <span>{tr('Konteks terpakai')}</span>
            <b>{dipakai.toLocaleString('id-ID')}</b>
          </div>
          <div className="ctx-baris">
            <span>{tr('Jendela konteks')}</span>
            <b>{total.toLocaleString('id-ID')}</b>
          </div>
          <p className="ctx-note">{tr('Perkiraan dari isi chat yang terlihat dan payload tool.')}</p>
        </div>
      )}
    </span>
  );
}
