import { useState, type ReactNode } from 'react';
import { useExperts, jumlahLangkahCari } from '../../lib/expertsStore';
import { useSubAgent, type SubAgent } from '../../lib/subagentStore';
import { useT } from '../../lib/i18n';
import AiIkon from './AiIkon';
import { clipboardWrite } from '../../lib/clipboard';
import { IkonAhli, bukaTabTugas, statusTugas } from './expertsBuka';
import type { TugasAhli } from '../../lib/expertsStore';

/*
 * Permukaan run Experts DI DALAM CHAT, urutan Qoder asli (referensi
 * screenshot): kalimat pembuka Lead sebagai teks polos, lipatan
 * "Created N tasks", lalu kartu KECIL per-worker yang muncul satu-satu
 * saat workernya mulai, dipisah baris "Worked on it · N actions", ditutup
 * baris "Explored N searches", baris berkas yang ditulis, dan tombol reaksi.
 *
 * Dulu ini SATU kartu berbingkai besar "Lead Agent — Orchestrating expert
 * tasks" berisi semua tugas sekaligus — justru itu yang membuat tampilan
 * terlihat jauh dari Qoder (gap 5–9). Bingkainya dihapus: kartu-kartu duduk
 * langsung di atas latar chat. Tombol Canvas & Stop pindah ke kartu Task
 * Progress di atas composer (Qoder: klik avatar di progress card).
 */

/** Satu tugas + status terkini + kesiapan tampil sebagai kartu. */
interface Tampil {
  t: TugasAhli;
  indeks: number;
  row: SubAgent | undefined;
  st: { teks: string; kelas: string };
  /** Kartu hanya muncul saat workernya benar-benar mulai — bukan masih antre. */
  mulai: boolean;
  nAksi: number;
}

export default function ExpertsTimeline({ runId }: { runId: string }) {
  const tr = useT();
  const run = useExperts((s) => s.runs.find((r) => r.id === runId));
  const agents = useSubAgent((s) => s.agents);
  const [buatBuka, setBuatBuka] = useState(true);
  const [cariBuka, setCariBuka] = useState(false);
  const [berkasBuka, setBerkasBuka] = useState(false);
  /* Reaksi lokal (kayak Qoder): 1 = suka, -1 = tidak, 0 = netral. */
  const [reaksi, setReaksi] = useState(0);

  if (!run || run.tugas.length === 0 || run.status === 'menyusun' || run.status === 'rencana') {
    /* fase rencana: kartu gerbang yang tampil; fase menyusun: typing dots. */
    return null;
  }
  const jalan = run.status === 'jalan';

  /*
   * Kartu progresif: saat run berjalan, tugas yang masih menunggu gelombang
   * sebelumnya TIDAK dirender sebagai kartu (masih ada di lipatan "Created
   * N tasks"). Run terminal (selesai/gagal/batal) dan snapshot setelah reload
   * menampilkan semua — itu riwayat, bukan antrean.
   */
  const tampil: Tampil[] = run.tugas.map((t, indeks) => {
    const row = agents.find((a) => a.id === t.agentId);
    const st = statusTugas(row?.status, t.statusAkhir, jalan, t.buktian);
    const mulai = !jalan || !!t.statusAkhir || (!!row && row.status !== 'menunggu');
    const nAksi = row?.nTool ?? t.nTool ?? 0;
    return { t, indeks, row, st, mulai, nAksi };
  });
  const kartu = tampil.filter((x) => x.mulai);

  /* "Explored N searches": hitungan hidup dulu, snapshot sebagai cadangan. */
  const totalCari = tampil.reduce(
    (n, x) => n + (x.row ? jumlahLangkahCari(x.row.langkah) : (x.t.nCari ?? 0)),
    0,
  );
  const kueriCari = tampil.flatMap((x) =>
    (x.row?.langkah ?? [])
      .filter((l) => l.kind === 'tool' && /^(grep|glob|search|tool_search|find|cari|web|ambil_web|browsing|ingat)/i.test(l.nama ?? ''))
      .map((l) => {
        try {
          const a = JSON.parse(l.args ?? '{}') as Record<string, unknown>;
          return String(a.pattern ?? a.query ?? a.url ?? a.path ?? '').split('\n')[0].slice(0, 120);
        } catch {
          return '';
        }
      })
      .filter(Boolean),
  );

  const berkasTulis = [...new Set(run.tugas.flatMap((t) => t.berkasTulis ?? []))];
  const berkasTampil =
    run.status === 'selesai' || run.status === 'gagal' || run.status === 'batal' ? berkasTulis : [];

  const salinRingkas = () => {
    const isi = [
      run.intro,
      ...tampil.map(
        (x) => `Task ${x.indeks + 1}: ${x.t.judul} — ${x.st.teks}${x.t.hasil ? `\n${x.t.hasil}` : ''}`,
      ),
    ]
      .filter(Boolean)
      .join('\n\n');
    void clipboardWrite(isi);
  };

  return (
    <div className="experts-run" data-testid="experts-timeline">
      {run.intro.trim() && <div className="experts-run-intro">{run.intro}</div>}

      {/*
        * "Created N tasks": bukti rencana di transcript — lipatannya terbuka
        * default supaya pembaca melihat apa yang dikerjakan tanpa klik; gelombang
        * yang belum mulai HANYA terlihat di sini, bukan sebagai kartu kosong.
        */}
      <button
        type="button"
        className={`experts-run-fold${buatBuka ? ' is-buka' : ''}`}
        aria-expanded={buatBuka}
        onClick={() => setBuatBuka((v) => !v)}
      >
        <AiIkon name="queue" size={12} />
        <span>
          {tr('Created')} <b>{run.tugas.length}</b> {tr('tasks')}
        </span>
        <span className="experts-progress-caret" aria-hidden="true">▾</span>
      </button>
      {buatBuka && (
        <div className="experts-run-fold-daftar">
          {run.tugas.map((t, i) => (
            <button
              key={t.id}
              type="button"
              className="experts-run-fold-baris"
              onClick={() => bukaTabTugas(t, i)}
            >
              Task {i + 1}: {t.judul}
            </button>
          ))}
        </div>
      )}

      {kartu.map((x, k) => (
        <Bagian key={x.t.id} terakhir={k === kartu.length - 1}>
          {/*
            * Kartu worker: klik ke tab "Task N". Baris atas = avatar tinted +
            * nama + status; baris bawah = └ + judul tebal, persis acuan.
            */}
          <button
            type="button"
            className="experts-run-kartu"
            data-testid={`experts-task-${x.t.id}`}
            title={x.t.deskripsi}
            onClick={() => bukaTabTugas(x.t, x.indeks)}
          >
            <span className="experts-run-atas">
              <span className="experts-run-avatar" data-ahli={x.t.ahli} aria-hidden="true">
                <IkonAhli id={x.t.ahli} size={12} />
              </span>
              <span className="experts-run-nama">{x.t.nama}</span>
              <span className={`experts-run-status ${x.st.kelas}`} aria-label={x.st.teks}>
                {x.st.kelas === 'is-jalan' ? <span className="experts-spin" aria-hidden="true" /> : null}
                {x.st.teks}
              </span>
            </span>
            <span className="experts-run-bawah">
              <span className="experts-run-sambung" aria-hidden="true">└</span>
              <span className="experts-run-judul">
                Task {x.indeks + 1}: {x.t.judul}
              </span>
            </span>
          </button>
          {k !== kartu.length - 1 && (
            <div className="experts-run-kerja" aria-hidden="true">
              <AiIkon name="gear" size={11} />
              <span>
                {tr('Worked on it')}
                {x.nAksi > 0 && (
                  <>
                    {' '}
                    <span className="experts-run-kerja-n">
                      {x.nAksi} {tr('actions')}
                    </span>
                  </>
                )}
              </span>
            </div>
          )}
        </Bagian>
      ))}

      {totalCari > 0 && (
        <>
          <button
            type="button"
            className={`experts-run-cari${cariBuka ? ' is-buka' : ''}`}
            aria-expanded={cariBuka}
            onClick={() => setCariBuka((v) => !v)}
          >
            <AiIkon name="search" size={11} />
            <span>
              {tr('Explored')} <b>{totalCari}</b> {tr('searches')}
            </span>
            {kueriCari.length > 0 && <span className="experts-progress-caret" aria-hidden="true">▾</span>}
          </button>
          {cariBuka && kueriCari.length > 0 && (
            <div className="experts-run-fold-daftar">
              {kueriCari.map((q, i) => (
                <div key={i} className="experts-run-fold-baris is-teks" title={q}>
                  {q}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/*
        * Berkas yang benar-benar ditulis, ala kartu diff acuan: # nama … M
        * Applied. Statistik +n/-n tidak dirender — Zephyr tidak menghitungnya
        * saat worker menulis, dan angka rekaan lebih buruk daripada tanpa angka.
        */}
      {berkasTampil.length > 0 && (
        <div className={`experts-run-berkas${berkasBuka ? ' is-buka' : ''}`} data-testid="experts-files">
          <button
            type="button"
            className="experts-run-fold is-berkas"
            aria-expanded={berkasBuka}
            onClick={() => setBerkasBuka((v) => !v)}
          >
            <AiIkon name="diff" size={12} />
            <span>
              <b>{berkasTampil.length}</b> {tr('Changed Files')}
            </span>
            <span className="experts-progress-caret" aria-hidden="true">▾</span>
          </button>
          {berkasBuka && (
            <div className="experts-run-fold-daftar">
              {berkasTampil.map((p) => (
                <div key={p} className="experts-run-berkas-baris" title={p}>
                  <span className="experts-run-berkas-hash" aria-hidden="true">#</span>
                  <span className="experts-run-berkas-nama">{p.split(/[\\/]/).pop()}</span>
                  <span className="experts-run-berkas-kanan">
                    <span className="is-mod">M</span>
                    <span className="is-applied">{tr('Applied')}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="experts-run-reaksi" role="group" aria-label={tr('Reactions')}>
        <button type="button" title={tr('Copy summary')} onClick={salinRingkas}>
          <AiIkon name="clipboard" size={12} />
        </button>
        <button
          type="button"
          title={tr('Good result')}
          aria-pressed={reaksi === 1}
          className={reaksi === 1 ? 'is-on' : ''}
          onClick={() => setReaksi((v) => (v === 1 ? 0 : 1))}
        >
          <IkonJempol atas />
        </button>
        <button
          type="button"
          title={tr('Bad result')}
          aria-pressed={reaksi === -1}
          className={reaksi === -1 ? 'is-on' : ''}
          onClick={() => setReaksi((v) => (v === -1 ? 0 : -1))}
        >
          <IkonJempol atas={false} />
        </button>
        <button type="button" title={tr('Fork this run into a new chat')}>
          <IkonFork />
        </button>
      </div>
    </div>
  );
}

/*
 * Pemisah "Worked on it" harus nempel ke kartu DI ATASNYA (dia kwitansi pekerja
 * itu), bukan ke kartu di bawahnya — dibungkus satu elemen supaya margin-nya
 * tidak jebol. JSX butuh PascalCase untuk komponen, jadi namanya `Bagian`.
 */
function Bagian({ terakhir, children }: { terakhir: boolean; children: ReactNode }) {
  return (
    <div className="experts-run-bagian" data-terakhir={terakhir ? '1' : undefined}>
      {children}
    </div>
  );
}

/** Ikon jempol 16px — suka/tidak, digambar sendiri gaya garis. */
function IkonJempol({ atas }: { atas?: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={12}
      height={12}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={atas ? undefined : { transform: 'rotate(180deg)' }}
    >
      <path d="M5.2 7.2 8 2.4c.9 0 1.6.7 1.6 1.6v2.4h3.1c.8 0 1.4.7 1.3 1.5l-.7 4.4a1.6 1.6 0 0 1-1.6 1.3H5.2" />
      <path d="M5.2 7.2v6.4H3.4A1.1 1.1 0 0 1 2.3 12.5V8.3a1.1 1.1 0 0 1 1.1-1.1h1.8z" />
    </svg>
  );
}

/** Ikon fork (cabang) 16px untuk aksi "pecah run ini ke chat baru". */
function IkonFork() {
  return (
    <svg
      viewBox="0 0 16 16"
      width={12}
      height={12}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="4.5" cy="3.8" r="1.7" />
      <circle cx="11.5" cy="3.8" r="1.7" />
      <circle cx="8" cy="12.2" r="1.7" />
      <path d="M4.5 5.5v1.4c0 1.6 1.3 2.9 2.9 2.9h1.2c1.6 0 2.9-1.3 2.9-2.9V5.5M8 9.8v.7" />
    </svg>
  );
}
