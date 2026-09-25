import { useEffect, useState } from 'react';
import { useSubAgent, batasParalel, type SubAgent, type SubStep } from '../../lib/subagentStore';
import { useStore } from '../../lib/store';
import { infoAksi, sasaranAksi, KELAS_JENIS } from '../../lib/labelAksi';
import { infoPeran } from '../../lib/subagentRoles';
import { useT } from '../../lib/i18n';

const IKON: Record<SubAgent['status'], string> = {
  menunggu: '○',
  jalan: '◔',
  selesai: '✓',
  gagal: '✕',
  batal: '⊘',
};

function durasi(ms: number): string {
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.round(s - m * 60)}s`;
}

function Langkah({ l }: { l: SubStep }) {
  const tr = useT();
  const [buka, setBuka] = useState(false);

  if (l.kind === 'pikir') {
    const teks = l.teks ?? '';

    const panjang = teks.length > 180;
    return (
      <li className="sub-step is-pikir" data-step="pikir">
        <button
          className="sub-pikir-toggle"
          data-testid="sub-reasoned-toggle"
          aria-expanded={panjang ? buka : true}
          onClick={() => panjang && setBuka((v) => !v)}
        >
          <span className="sub-step-label">{tr('Reasoned')}</span>
          {panjang && <span className="sub-caret">{buka ? '▾' : '▸'}</span>}
        </button>
        {(!panjang || buka) && <p className="sub-step-teks">{teks}</p>}
        {panjang && !buka && <p className="sub-step-teks is-ringkas">{teks.slice(0, 150)}…</p>}
      </li>
    );
  }

  const info = infoAksi(l.nama);
  const sasaran = sasaranAksi(l.args);

  return (
    <li
      className={`sub-step is-tool ${KELAS_JENIS[info.jenis]}${l.ok === false ? ' is-err' : ''}`}
      data-step="tool"
      data-aksi={info.label}
      data-jenis={info.jenis}
    >
      <span className="sub-aksi-ikon" aria-hidden="true">
        {info.ikon}
      </span>
      <span className="sub-aksi-label">{info.label}</span>
      {sasaran && (
        <span className="sub-aksi-sasaran" title={sasaran}>
          {sasaran}
        </span>
      )}
      {l.ok === false && <span className="sub-aksi-gagal">{tr('gagal')}</span>}
      {/* Hasil lengkap tetap bisa diperiksa lewat <details> — timeline rapi,
          tapi buktinya tidak disembunyikan. */}
      {l.hasil && (
        <details className="sub-aksi-hasil">
          <summary>{tr('hasil')}</summary>
          <pre>{l.hasil}</pre>
        </details>
      )}
    </li>
  );
}

function Kartu({ a }: { a: SubAgent }) {
  const tr = useT();
  const batal = useSubAgent((s) => s.batal);

  const autoCollapse = useStore((s) => s.settings.subagent?.autoCollapse !== false);

  const [buka, setBuka] = useState(!autoCollapse);

  const [, detak] = useState(0);

  useEffect(() => {
    if (a.status !== 'jalan') return;
    const t = setInterval(() => detak((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [a.status]);

  const ms = (a.selesai ?? Date.now()) - a.mulai;
  const hidup = a.status === 'jalan' || a.status === 'menunggu';
  const langkahTerakhir = a.langkah[a.langkah.length - 1];

  const nLangkah = a.langkah.length;

  const statusHidup = (() => {
    if (!langkahTerakhir) return tr('Menyiapkan…');
    if (langkahTerakhir.kind === 'pikir') return tr('Berpikir…');
    const info = infoAksi(langkahTerakhir.nama);
    const sasaran = sasaranAksi(langkahTerakhir.args);
    const namaFile = sasaran.split(/[/\\]/).pop() || sasaran;
    return `${info.label} ${namaFile}`.trim();
  })();

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
        {(() => {
          const pr = infoPeran(a.peran);
          if (!pr) return null;
          return (
            <span
              className={`sub-peran${pr.butuhTulis ? ' is-tulis' : ''}`}
              data-testid={`sub-peran-${a.id}`}
              data-peran={a.peran}
              title={tr(pr.hint)}
            >
              {pr.ikon} {tr(pr.label)}
            </span>
          );
        })()}
        <span className="sub-badge" data-testid={`sub-status-${a.id}`}>
          {tr(a.status)}
        </span>
        <span className="sub-meta" data-testid={`sub-meta-${a.id}`}>
          {nLangkah} {tr('langkah')} · {durasi(ms)}
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

      {/* Live status line: "Read agent.ts · 13s". */}
      {hidup && (
        <div className="sub-now" data-testid={`sub-now-${a.id}`}>
          <span className="sub-spin" aria-hidden="true">
            ◔
          </span>
          <span className="sub-now-teks">{statusHidup}</span>
          <span className="sub-now-timer">{durasi(ms)}</span>
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
            {nLangkah} {tr('langkah')}
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

      {/* Hasil TIDAK diulang di sini. Isinya sudah ada di pesan ringkasan
          chat, dan mengulangnya membuat panel terasa menumpuk — inilah yang
          dikeluhkan user. Yang tersisa hanya pratinjau satu baris supaya
          kartu tetap informatif tanpa mengulang paragraf. */}
      {a.hasil && a.status === 'selesai' && (
        <div className="sub-hasil-1baris" data-testid={`sub-hasil-${a.id}`} title={a.hasil}>
          {a.hasil.split(/\r?\n/).find((l) => l.trim()) || ''}
        </div>
      )}
    </div>
  );
}

export default function SubAgentPanel({ polos = false }: { polos?: boolean } = {}) {
  const tr = useT();
  const agents = useSubAgent((s) => s.agents);
  const sibuk = useSubAgent((s) => s.sibuk);
  const ringkasan = useSubAgent((s) => s.ringkasan);
  const batalSemua = useSubAgent((s) => s.batalSemua);
  const bersihkan = useSubAgent((s) => s.bersihkan);

  const showPanel = useStore((s) => s.settings.subagent?.showPanel !== false);
  if (!showPanel || agents.length === 0) return null;

  const jalan = agents.filter((a) => a.status === 'jalan' || a.status === 'menunggu').length;
  const beres = agents.filter((a) => a.status === 'selesai').length;
  const gagal = agents.filter((a) => a.status === 'gagal').length;

  const judul = sibuk
    ? `${jalan} ${tr('tugas paralel')}`
    : `${agents.length} ${tr('subagent')} · ${beres} ${tr('selesai')}${gagal ? ` · ${gagal} ${tr('gagal')}` : ''}`;

  return (
    <div className="sub-panel" data-testid="sub-panel">
      {/* Bar disembunyikan saat `polos`: di tab Subagents kepalanya sudah ada
          di SubAgentView, dan menampilkan dua tombol Bersihkan membingungkan. */}
      {!polos && (
      <div className="sub-bar">
        <span className="sub-judul" data-testid="sub-title">
          {judul}
        </span>
        <span className="sub-maks">maks {batasParalel()}</span>
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
      )}

      <div className="sub-daftar" data-testid="sub-grid">
        {agents.map((a) => (
          <Kartu key={a.id} a={a} />
        ))}
      </div>

      {!polos && ringkasan && !sibuk && (
        <details className="sub-ringkas" data-testid="sub-summary">
          <summary>{tr('Ringkasan gabungan')}</summary>
          <pre>{ringkasan}</pre>
        </details>
      )}
    </div>
  );
}
