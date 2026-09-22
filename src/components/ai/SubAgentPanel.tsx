// SubAgentPanel.tsx — panel subagent paralel (T2.1), tampilan ala TEDI.
//
// YANG MEMBUAT TAMPILAN TEDI TERASA BEDA (dan ditiru di sini):
//   1. Judul batch menyebut JUMLAH: "3 tugas paralel" — bukan daftar kartu
//      tanpa konteks. User langsung tahu skala pekerjaannya.
//   2. Tiap kartu punya NAMA (Comet, Odyssey) sebagai identitas — bukan
//      "Subagent 1". Nama membuat progres bisa dibicarakan ("Comet selesai").
//   3. Langkah terakhir SELALU terlihat saat bekerja, jadi panel terasa hidup
//      tanpa user harus mengklik.
//   4. Langkah bisa dibuka: penalaran ditandai "Reasoned", aksi ditandai tool.
//   5. Grid 2 kolom di panel lebar: 4 subagent terbaca tanpa scroll.

import { useEffect, useState } from 'react';
import { useSubAgent, MAX_PARALLEL, type SubAgent, type SubStep } from '../../lib/subagentStore';
import { useT } from '../../lib/i18n';

/** Ikon status per subagent. */
const IKON: Record<SubAgent['status'], string> = {
  menunggu: '○',
  jalan: '◔',
  selesai: '✓',
  gagal: '✕',
  batal: '⊘',
};

/** Satu langkah: penalaran ditampilkan sebagai blok "Reasoned". */
function Langkah({ l }: { l: SubStep }) {
  const tr = useT();
  if (l.kind === 'pikir') {
    return (
      <li className="sub-step is-pikir" data-step="pikir">
        <span className="sub-step-label">{tr('Reasoned')}</span>
        <span className="sub-step-teks">{l.teks}</span>
      </li>
    );
  }
  return (
    <li className={`sub-step is-tool${l.ok === false ? ' is-err' : ''}`} data-step="tool">
      <span className="sub-step-tool">{l.nama}</span>
      {l.args && <code className="sub-step-args">{l.args}</code>}
      {l.hasil && <pre className="sub-step-hasil">{l.hasil}</pre>}
    </li>
  );
}

function Kartu({ a }: { a: SubAgent }) {
  const tr = useT();
  const batal = useSubAgent((s) => s.batal);
  const [buka, setBuka] = useState(false);
  // Detak 1 detik: durasi subagent yang masih jalan ikut naik. Tanpa ini
  // angkanya beku dan panel terasa mati.
  const [, detak] = useState(0);

  useEffect(() => {
    if (a.status !== 'jalan') return;
    const t = setInterval(() => detak((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [a.status]);

  const durasi = ((a.selesai ?? Date.now()) - a.mulai) / 1000;
  const hidup = a.status === 'jalan' || a.status === 'menunggu';
  const langkahTerakhir = a.langkah[a.langkah.length - 1];
  // Hitung pemanggilan tool saja (langkah 'pikir' bukan aksi).
  const nTool = a.langkah.filter((l) => l.kind === 'tool').length;

  return (
    <div
      className={`sub-card is-${a.status}`}
      data-testid={`sub-card-${a.id}`}
      data-status={a.status}
      data-nama={a.nama}
    >
      <div className="sub-head">
        <span className="sub-ikon" aria-hidden="true">
          {IKON[a.status]}
        </span>
        <span className="sub-nama" data-testid={`sub-nama-${a.id}`}>
          {a.nama}
        </span>
        <span className="sub-badge" data-testid={`sub-status-${a.id}`}>
          {tr(a.status)}
        </span>
        <span className="sub-meta">
          {nTool} {tr('tool')} · {durasi.toFixed(1)}s
        </span>
        {hidup && (
          <button
            className="sub-batal"
            data-testid={`sub-batal-${a.id}`}
            title={tr('Batalkan subagent ini')}
            onClick={() => batal(a.id)}
          >
            ✕
          </button>
        )}
      </div>

      <div className="sub-tugas" title={a.tugas}>
        {a.tugas}
      </div>

      {/* Langkah terakhir SELALU tampil saat berjalan — user harus bisa
          melihat "sedang apa" tanpa mengklik apa pun. */}
      {hidup && langkahTerakhir && (
        <div className="sub-now" data-testid={`sub-now-${a.id}`}>
          <span className="sub-spin" aria-hidden="true">
            ◔
          </span>
          {langkahTerakhir.kind === 'tool' ? (
            <>
              <code>{langkahTerakhir.nama}</code>
              <span className="sub-now-args">{langkahTerakhir.args}</span>
            </>
          ) : (
            <span className="sub-now-pikir">{langkahTerakhir.teks?.slice(0, 140)}</span>
          )}
        </div>
      )}

      {a.error && (
        <div className="sub-err" data-testid={`sub-err-${a.id}`}>
          {a.error}
        </div>
      )}

      {a.langkah.length > 0 && (
        <>
          <button
            className="sub-toggle"
            data-testid={`sub-toggle-${a.id}`}
            aria-expanded={buka}
            onClick={() => setBuka((v) => !v)}
          >
            <span className="sub-caret">{buka ? '▾' : '▸'}</span>
            {a.langkah.length} {tr('langkah')}
          </button>
          {buka && (
            <ol className="sub-langkah" data-testid={`sub-langkah-${a.id}`}>
              {a.langkah.map((l, i) => (
                <Langkah key={i} l={l} />
              ))}
            </ol>
          )}
        </>
      )}

      {a.hasil && a.status === 'selesai' && (
        <div className="sub-hasil-akhir" data-testid={`sub-hasil-${a.id}`}>
          {a.hasil}
        </div>
      )}
    </div>
  );
}

export default function SubAgentPanel() {
  const tr = useT();
  const agents = useSubAgent((s) => s.agents);
  const sibuk = useSubAgent((s) => s.sibuk);
  const ringkasan = useSubAgent((s) => s.ringkasan);
  const batalSemua = useSubAgent((s) => s.batalSemua);
  const bersihkan = useSubAgent((s) => s.bersihkan);

  if (agents.length === 0) return null;

  const jalan = agents.filter((a) => a.status === 'jalan' || a.status === 'menunggu').length;
  const beres = agents.filter((a) => a.status === 'selesai').length;
  const gagal = agents.filter((a) => a.status === 'gagal').length;

  // Judul batch ala TEDI: jumlah saat bekerja, rekap saat selesai.
  const judul = sibuk
    ? `${jalan} ${tr('tugas paralel')}`
    : `${agents.length} ${tr('subagent')} · ${beres} ${tr('selesai')}${gagal ? ` · ${gagal} ${tr('gagal')}` : ''}`;

  return (
    <div className="sub-panel" data-testid="sub-panel">
      <div className="sub-bar">
        <span className="sub-judul" data-testid="sub-title">
          {judul}
        </span>
        <span className="sub-maks">maks {MAX_PARALLEL}</span>
        <span className="sub-spacer" />
        {sibuk ? (
          <button className="btn btn-sm" data-testid="sub-stop-all" onClick={batalSemua}>
            {tr('Hentikan semua')}
          </button>
        ) : (
          <button className="btn btn-sm" data-testid="sub-clear" onClick={bersihkan}>
            {tr('Bersihkan')}
          </button>
        )}
      </div>

      <div className="sub-daftar" data-testid="sub-grid">
        {agents.map((a) => (
          <Kartu key={a.id} a={a} />
        ))}
      </div>

      {ringkasan && !sibuk && (
        <details className="sub-ringkas" data-testid="sub-summary">
          <summary>{tr('Ringkasan gabungan')}</summary>
          <pre>{ringkasan}</pre>
        </details>
      )}
    </div>
  );
}
