// SubAgentBar.tsx — kotak input untuk menjalankan tugas paralel (T2.1).
//
// Ditempatkan di panel AI, DI ATAS area chat, hanya tampil saat user membuka
// mode paralel. Tugas dipisah baris: satu baris = satu subagent. Itu bentuk
// paling sederhana yang bisa dipakai tanpa UI builder.

import { useState } from 'react';
import { useSubAgent, MAX_PARALLEL } from '../../lib/subagentStore';
import { useAi } from '../../lib/aiStore';
import { useT } from '../../lib/i18n';

export default function SubAgentBar() {
  const tr = useT();
  const [buka, setBuka] = useState(false);
  const [teks, setTeks] = useState('');
  const jalankan = useSubAgent((s) => s.jalankan);
  const sibuk = useSubAgent((s) => s.sibuk);
  const agentBusy = useAi((s) => s.agentBusy);
  const pending = useAi((s) => s.pending);

  const tugas = teks
    .split('\n')
    .map((t) => t.trim())
    .filter(Boolean);

  const terlalu = tugas.length > MAX_PARALLEL;
  const bisaJalan = tugas.length > 0 && !terlalu && !sibuk && !agentBusy && !pending;

  const go = async () => {
    if (!bisaJalan) return;
    await jalankan(tugas);
    setTeks('');
  };

  if (!buka) {
    return (
      <button
        className="sub-open"
        data-testid="sub-open"
        title={tr('Jalankan beberapa tugas sekaligus (paralel)')}
        onClick={() => setBuka(true)}
      >
        ⚡ {tr('Tugas paralel')}
      </button>
    );
  }

  return (
    <div className="sub-form" data-testid="sub-form">
      <div className="sub-form-head">
        <span>{tr('Tugas paralel')}</span>
        <span className="sub-form-hint">
          {tr('Satu baris = satu subagent')} · maks {MAX_PARALLEL}
        </span>
        <button
          className="sub-form-close"
          data-testid="sub-close"
          title={tr('Tutup')}
          onClick={() => setBuka(false)}
        >
          ✕
        </button>
      </div>
      <textarea
        className="sub-input"
        data-testid="sub-input"
        rows={3}
        value={teks}
        placeholder={tr(
          'Cari semua pemakaian fungsi X\nPeriksa apakah ada bug di modul Y\nRingkas struktur folder Z',
        )}
        onChange={(e) => setTeks(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            void go();
          }
        }}
      />
      <div className="sub-form-foot">
        <span className={`sub-count${terlalu ? ' is-err' : ''}`}>
          {tugas.length}/{MAX_PARALLEL} {tr('subagent')}
        </span>
        <button
          className="btn btn-sm btn-primary"
          data-testid="sub-run"
          disabled={!bisaJalan}
          title={tr('Ctrl+Enter')}
          onClick={() => void go()}
        >
          {sibuk ? tr('Berjalan…') : tr('Jalankan')}
        </button>
      </div>
    </div>
  );
}
