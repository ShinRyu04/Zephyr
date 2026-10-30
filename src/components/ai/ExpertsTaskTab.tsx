import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useExperts } from '../../lib/expertsStore';
import { useSubAgent, type SubStep } from '../../lib/subagentStore';
import { useT } from '../../lib/i18n';
import { IkonAhli, statusTugas } from './expertsBuka';

/*
 * Isi tab editor "Task N: <judul>" — laporan lengkap satu worker Experts.
 *
 * Bentuknya mengikuti produk rujukan: header agen (avatar, "Full-Stack
 * Engineer Felix", judul tugas, chip status) lalu transkrip langkah tool
 * (Read / Grep / Thought / edit berkas) dan laporan akhirnya dalam markdown.
 *
 * Kalau baris subagentnya sudah tergantikan batch lain atau aplikasi baru
 * direstart, isi jatuh ke snapshot di TugasAhli — laporan tetap terbaca,
 * transkrip langkah saja yang tidak ada.
 */
export default function ExpertsTaskTab({ ekspertId }: { ekspertId: string }) {
  const tr = useT();
  const run = useExperts((s) =>
    s.runs.find((r) => r.tugas.some((t) => (t.agentId ?? t.id) === ekspertId)),
  );
  const row = useSubAgent((s) => s.agents.find((a) => a.id === ekspertId));

  const indeks = run ? run.tugas.findIndex((t) => (t.agentId ?? t.id) === ekspertId) : -1;
  const tugas = run && indeks >= 0 ? run.tugas[indeks] : null;
  const st = statusTugas(
    row?.status,
    tugas?.statusAkhir,
    run?.status === 'jalan',
    tugas?.buktian,
  );
  const laporan = row?.hasil || tugas?.hasil || '';

  if (!tugas) {
    return (
      <div className="experts-tasktab" data-testid="experts-tasktab">
        <div className="experts-tasktab-kosong">
          {tr('This task no longer has a live run or a stored snapshot.')}
        </div>
      </div>
    );
  }

  return (
    <div className="experts-tasktab" data-testid="experts-tasktab">
      <div className="experts-tasktab-kepala">
        <span className="experts-tasktab-avatar" data-ahli={tugas.ahli}>
          <IkonAhli id={tugas.ahli} size={15} />
        </span>
        <span className="experts-tasktab-badan">
          <span className="experts-tasktab-ahli">{tugas.nama}</span>
          <span className="experts-tasktab-judul">
            Task {indeks + 1}: {tugas.judul}
          </span>
        </span>
        <span className={`experts-tasktab-status ${st.kelas}`}>
          {st.kelas === 'is-jalan' ? <span className="experts-spin" aria-hidden="true" /> : null}
          {st.teks}
        </span>
      </div>

      <div className="experts-tasktab-tubuh">
        {row && row.langkah.length > 0 && (
          <div className="experts-tasktab-langkah">
            {row.langkah.map((l, i) => (
              <BarisLangkah key={i} langkah={l} />
            ))}
          </div>
        )}
        {laporan ? (
          <div className="experts-tasktab-laporan" data-testid="experts-tasktab-laporan">
            <div className="experts-tasktab-laporan-kepala">{tr('Report')}</div>
            <Markdown remarkPlugins={[remarkGfm]}>{laporan}</Markdown>
          </div>
        ) : row?.status === 'jalan' ? (
          <div className="experts-tasktab-laporan">
            <div className="experts-tasktab-laporan-kepala">{tr('Working…')}</div>
          </div>
        ) : (
          <div className="experts-tasktab-laporan">
            <div className="experts-tasktab-laporan-kepala">{tr('Brief')}</div>
            <Markdown remarkPlugins={[remarkGfm]}>{tugas.deskripsi}</Markdown>
          </div>
        )}
        {row?.error && <div className="experts-tasktab-error">{row.error}</div>}
        {/*
          * Laporan yang dipotong saat disimpan harus mengaku dipotong. Tanpa
          * catatan ini, laporan yang berhenti di tengah kalimat setelah reload
          * terbaca seperti laporan yang memang selesai begitu. Catatan hanya
          * muncul saat snapshot-lah yang dibaca (baris hidup masih utuh).
          */}
        {!row && tugas.hasilPendek && (
          <div className="experts-tasktab-catatan" data-testid="experts-tasktab-pendek">
            {tr('This report was shortened when the run was saved (2,000 characters). The full text only lived in this session.')}
          </div>
        )}
      </div>
    </div>
  );
}

/** Satu langkah tool/thought, gaya produk rujukan: ikon + kerja + sasaran. */
function BarisLangkah({ langkah }: { langkah: SubStep }) {
  if (langkah.kind === 'pikir') {
    const teks = (langkah.teks ?? '').trim();
    if (!teks) return null;
    return (
      <div className="experts-langkah is-pikir" title={teks}>
        <span className="experts-langkah-ikon" aria-hidden="true">
          <IkonAhli id="lead" size={11} />
        </span>
        <span className="experts-langkah-label">Thought</span>
        <span className="experts-langkah-target">{teks.slice(0, 120)}</span>
      </div>
    );
  }
  const args = (() => {
    try {
      return JSON.parse(langkah.args ?? '{}') as Record<string, unknown>;
    } catch {
      return {} as Record<string, unknown>;
    }
  })();
  const sasaran = String(args.path ?? args.pattern ?? args.command ?? args.query ?? '')
    .split('\n')[0]
    .slice(0, 90);
  return (
    <div
      className={`experts-langkah${langkah.ok === false ? ' is-gagal' : ''}${langkah.ditolakTulis ? ' is-ditolak' : ''}`}
      title={langkah.hasil ?? ''}
    >
      <span className="experts-langkah-ikon" aria-hidden="true">
        <IkonAhli id="fullstack" size={11} />
      </span>
      <span className="experts-langkah-label">{langkah.nama}</span>
      <span className="experts-langkah-target">{sasaran}</span>
      {langkah.ok === false && <span className="experts-langkah-fail">✕</span>}
    </div>
  );
}
