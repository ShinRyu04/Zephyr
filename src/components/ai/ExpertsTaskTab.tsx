import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useExperts } from '../../lib/expertsStore';
import { useSubAgent, type SubStep } from '../../lib/subagentStore';
import { useT } from '../../lib/i18n';
import { IkonAhli, statusTugas, jenisLangkah, labelLangkah, IkonLangkah, durasiLangkah, jumlahHasil } from './expertsBuka';

/*
 * Isi tab editor "Task N: <judul>" — transkrip kerja satu worker Experts,
 * bentuk acuan Qoder (022715/022721): header avatar + nama + └ judul + status
 * kanan; langkah pakai IKON PER JENIS (Read/Thought/Grep/Terminal) dengan
 * DURASI ("Thought · 1s") dan hitungan hasil ("6 results"); tulisan berkas
 * jadi KARTU "# nama … M Applied/Generating"; perintah shell jadi kartu
 * "… Ran in terminal". Lalu laporan akhirnya dalam markdown.
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
            <span className="experts-tasktab-sambung" aria-hidden="true">└</span>
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
            {row.langkah.map((l, i) => {
              /*
               * Durasi langkah = jarak ke langkah berikutnya; langkah terakhir
               * diukur ke waktu selesai (yang masih jalan → ke sekarang).
               */
              const batas =
                i + 1 < row.langkah.length ? row.langkah[i + 1].at : row.selesai ?? (row.status === 'jalan' ? Date.now() : null);
              const generating =
                row.status === 'jalan' && i === row.langkah.length - 1 && jenisLangkah(l.nama) === 'tulis';
              return <BarisLangkah key={i} langkah={l} durasi={batas} generating={generating} />;
            })}
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

/**
 * Satu langkah, bentuk acuan: baris ikon+label+target+durasi untuk
 * baca/cari/pikir, KARTU penuh untuk tulis berkas dan perintah terminal.
 */
function BarisLangkah({
  langkah,
  durasi,
  generating = false,
}: {
  langkah: SubStep;
  /** Batas waktu pengukuran durasi (`at` langkah berikutnya / selesai run). */
  durasi?: number | null;
  /** True = tulisan berkas ini MASIH berjalan → badge "Generating". */
  generating?: boolean;
}) {
  const jenis = jenisLangkah(langkah.nama);

  /* Thought: ikon + "Thought · 1s" — teksnya jadi tooltip, bukan baris panjang. */
  if (langkah.kind === 'pikir') {
    const teks = (langkah.teks ?? '').trim();
    if (!teks) return null;
    return (
      <div className="experts-langkah is-pikir" title={teks}>
        <span className="experts-langkah-ikon" aria-hidden="true">
          <IkonLangkah langkah={langkah} size={12} />
        </span>
        <span className="experts-langkah-label">Thought</span>
        {durasi != null && <span className="experts-langkah-durasi">· {durasiLangkah(langkah.at, durasi)}</span>}
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
  const gagal = langkah.ok === false;

  /* KARTU BERKAS: "# AiPanel.tsx … M Applied/Generating". */
  if (jenis === 'tulis') {
    const path = String(args.path ?? args.file ?? langkah.hasil ?? '').split('\n')[0];
    const nama = path.split(/[\\/]/).pop() || langkah.nama || 'file';
    return (
      <div
        className={`experts-langkah is-berkas${gagal ? ' is-gagal' : ''}${langkah.ditolakTulis ? ' is-ditolak' : ''}`}
        title={langkah.hasil ?? ''}
      >
        <span className="experts-langkah-ikon" aria-hidden="true">
          <IkonLangkah langkah={langkah} size={12} />
        </span>
        <span className="experts-langkah-nama-berkas">{nama}</span>
        <span className="experts-langkah-kanan">
          <span className="is-mod">M</span>
          {generating ? (
            <span className="is-generating">Generating</span>
          ) : gagal || langkah.ditolakTulis ? (
            <span className="is-applied is-bengkok">✕</span>
          ) : (
            <span className="is-applied">Applied</span>
          )}
        </span>
      </div>
    );
  }

  /* KARTU TERMINAL: "bash_run … Ran in terminal". */
  if (jenis === 'terminal') {
    const perintah = String(args.command ?? args.cmd ?? '').split('\n')[0].slice(0, 120);
    return (
      <div
        className={`experts-langkah is-terminal${gagal ? ' is-gagal' : ''}`}
        title={langkah.hasil ?? ''}
      >
        <span className="experts-langkah-ikon" aria-hidden="true">
          <IkonLangkah langkah={langkah} size={12} />
        </span>
        <span className="experts-langkah-nama-berkas">{perintah || langkah.nama}</span>
        <span className="experts-langkah-kanan">
          <span className="is-applied">Ran in terminal</span>
        </span>
      </div>
    );
  }

  /* Baris biasa: Read / Grepped code / Searched … + target + (N results). */
  const sasaran = String(args.path ?? args.pattern ?? args.query ?? args.url ?? '')
    .split('\n')[0]
    .slice(0, 90);
  const hitung = jumlahHasil(langkah.hasil);
  return (
    <div
      className={`experts-langkah${gagal ? ' is-gagal' : ''}${langkah.ditolakTulis ? ' is-ditolak' : ''}`}
      title={langkah.hasil ?? ''}
    >
      <span className="experts-langkah-ikon" aria-hidden="true">
        <IkonLangkah langkah={langkah} size={12} />
      </span>
      <span className="experts-langkah-label">{labelLangkah(langkah)}</span>
      {sasaran && <span className="experts-langkah-target">{sasaran}</span>}
      {hitung && <span className="experts-langkah-count">{hitung}</span>}
      {gagal && <span className="experts-langkah-fail">✕</span>}
    </div>
  );
}
