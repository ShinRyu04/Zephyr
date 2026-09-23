// SubAgentBar.tsx — tombol + form tugas paralel (T2.1), compact sejak T3.10.
//
// KENAPA diubah: form ini dulu SELALU membuka panel besar (judul + hint +
// textarea 3 baris + footer) yang menumpuk di atas chat. Sekarang:
//   * tertutup = satu baris tipis (ikon + label + maks), tidak menutupi chat
//   * terbuka  = form ringkas dengan textarea 2 baris + hitungan
//   * batasnya mengikuti Settings → Subagent, bukan konstanta

import { useState } from 'react';
import { useSubAgent, batasParalel } from '../../lib/subagentStore';
import { useAi } from '../../lib/aiStore';
import { useT } from '../../lib/i18n';

export default function SubAgentBar({ selaluTerbuka = false }: { selaluTerbuka?: boolean }) {
  const tr = useT();
  // Di tab SUBAGENTS form selalu terbuka (itu tempatnya); di panel AI ia
  // tertutup secara default supaya tidak menumpuk di atas chat.
  const [buka, setBuka] = useState(selaluTerbuka);
  const [teks, setTeks] = useState('');
  const jalankan = useSubAgent((s) => s.jalankan);
  const sibuk = useSubAgent((s) => s.sibuk);
  const agentBusy = useAi((s) => s.agentBusy);
  const pending = useAi((s) => s.pending);

  const maks = batasParalel();
  const tugas = teks
    .split('\n')
    .map((t) => t.trim())
    .filter(Boolean);

  const terlalu = tugas.length > maks;
  const bisaJalan = tugas.length > 0 && !terlalu && !sibuk && !agentBusy && !pending;

  const go = async () => {
    if (!bisaJalan) return;
    await jalankan(tugas);
    setTeks('');
    // Form tetap terbuka supaya user bisa langsung menyusun batch berikutnya —
    // menutupnya memaksa satu klik tambahan tiap kali.
  };

  if (!buka && !selaluTerbuka) {
    return (
      <button
        className="sub-open"
        data-testid="sub-open"
        title={tr('Jalankan beberapa tugas sekaligus (paralel)')}
        onClick={() => setBuka(true)}
      >
        ⚡ {tr('Tugas paralel')}
        <span className="sub-open-maks">maks {maks}</span>
      </button>
    );
  }

  return (
    <div className="sub-form" data-testid="sub-form">
      <div className="sub-form-head">
        <span className="sub-form-judul">⚡ {tr('Tugas paralel')}</span>
        <span className="sub-form-hint">
          {tr('Satu baris = satu subagent')} · maks {maks}
        </span>
        {!selaluTerbuka && (
          <button
            className="sub-form-close"
            data-testid="sub-close"
            title={tr('Tutup')}
            onClick={() => setBuka(false)}
          >
            ✕
          </button>
        )}
      </div>
      <textarea
        className="sub-input"
        data-testid="sub-input"
        rows={2}
        value={teks}
        placeholder={tr('Cari pemakaian fungsi X\nPeriksa bug di modul Y')}
        title={tr('Enter mengirim · Shift+Enter baris baru')}
        onChange={(e) => setTeks(e.target.value)}
        onKeyDown={(e) => {
          // Enter = kirim, Shift+Enter = baris baru (sama seperti kotak chat AI).
          // KENAPA bukan Ctrl+Enter seperti sebelumnya: user menulis satu tugas
          // per baris, jadi Enter terasa seperti "kirim" — dan Ctrl+Enter tidak
          // terlihat di layar sehingga tidak pernah tertebak.
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void go();
          }
        }}
      />
      <div className="sub-form-foot">
        <span className={`sub-count${terlalu ? ' is-err' : ''}`}>
          {tugas.length}/{maks} {tr('subagent')}
        </span>
        <span className="sub-spacer" />
        <button
          className="btn btn-sm btn-primary"
          data-testid="sub-run"
          disabled={!bisaJalan}
          title={tr('Enter mengirim · Shift+Enter baris baru')}
          onClick={() => void go()}
        >
          {sibuk ? tr('Berjalan…') : tr('Jalankan')}
        </button>
      </div>
    </div>
  );
}
