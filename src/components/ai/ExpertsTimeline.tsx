import { useState } from 'react';
import { useExperts } from '../../lib/expertsStore';
import { useSubAgent, type SubAgent } from '../../lib/subagentStore';
import { useT, tf } from '../../lib/i18n';
import { IkonAhli, bukaTabTugas, bukaCanvas, statusTugas } from './expertsBuka';

/*
 * Kartu "Lead Agent — Orchestrating expert tasks" DI DALAM CHAT, bentuk Qoder
 * (referensi screenshot user): SATU kartu berbingkai — header ikon Lead + judul
 * + status run di ujung kanan, lalu baris per tugas (ikon ahli + judul tebal +
 * subtitle "Nama Worker — runs in parallel / after Task N"), barisnya bisa
 * diklik ke tab "Task N". Dulu ini baris tipis terpisah tanpa kartu, tanpa
 * badge status run, dan tanpa catatan penjadwalan — user menunjuk foto Qoder
 * dan kartu inilah yang diminta tampil di chat.
 */
export default function ExpertsTimeline({ runId }: { runId: string }) {
  const tr = useT();
  const run = useExperts((s) => s.runs.find((r) => r.id === runId));
  const batal = useExperts((s) => s.batal);
  const agents = useSubAgent((s) => s.agents);
  /*
   * Changed Files default TERLIPAT — kwitansinya dibuka kalau diminta.
   * Task Progress TIDAK di sini: dia kartu status di atas composer
   * (`KartuProgresExperts`), seperti To-dos pada mode Agent.
   */
  const [berkasBuka, setBerkasBuka] = useState(false);

  if (!run || run.tugas.length === 0 || run.status === 'menyusun' || run.status === 'rencana') {
    /* fase rencana: kartu rencananya yang tampil, belum kartu Lead */
    return null;
  }
  const jalan = run.status === 'jalan';
  const berkasTulis = [...new Set(run.tugas.flatMap((t) => t.berkasTulis ?? []))];
  const statusRun = jalan
    ? tr('Running')
    : run.status === 'selesai'
      ? tr('Completed')
      : run.status === 'gagal'
        ? tr('Failed')
        : tr('Cancelled');

  return (
    <div className="experts-tl" data-testid="experts-timeline">
      <div className="experts-tl-kepala">
        <span className="experts-tl-lead-ikon" aria-hidden="true">
          <IkonAhli id="lead" size={11} />
        </span>
        <b>{tr('Lead Agent — Orchestrating expert tasks')}</b>
        <span className="experts-tl-aksi">
          <span className="experts-tl-run" data-status={run.status}>
            {statusRun}
          </span>
          <button type="button" className="experts-mini" onClick={() => bukaCanvas(run.id)}>
            {tr('Canvas')}
          </button>
          {jalan && (
            <button
              type="button"
              className="experts-mini is-bahaya"
              data-testid="experts-tl-batal"
              onClick={() => batal(run.id)}
            >
              {tr('Stop')}
            </button>
          )}
        </span>
      </div>

      {run.tugas.map((t, i) => {
        const row: SubAgent | undefined = agents.find((a) => a.id === t.agentId);
        const st = statusTugas(row?.status, t.statusAkhir, jalan, t.buktian);
        /*
         * Catatan penjadwalan ala Qoder: tugas tanpa dependensi = "runs in
         * parallel"; ada `setelah` = "after Task N" — N = posisi tugas induk
         * di rencana, penomoran yang sama dengan judul tab "Task N".
         */
        const indeksInduk = t.setelah ? run.tugas.findIndex((x) => x.id === t.setelah) : -1;
        const jadwal =
          indeksInduk >= 0 ? tf('after Task {n}', { n: indeksInduk + 1 }) : tr('runs in parallel');
        return (
          <button
            key={t.id}
            type="button"
            className="experts-tl-baris"
            data-testid={`experts-task-${t.id}`}
            title={t.deskripsi}
            onClick={() => bukaTabTugas(t, i)}
          >
            <span className="experts-tl-ikon" aria-hidden="true">
              <IkonAhli id={t.ahli} size={12} />
            </span>
            <span className="experts-tl-badan">
              <span className="experts-tl-judul">{t.judul}</span>
              <span className="experts-tl-sub">
                {t.nama} — {jadwal}
              </span>
            </span>
            <span className={`experts-tl-tanda ${st.kelas}`} aria-label={st.teks}>
              {st.kelas === 'is-jalan' ? (
                <span className="experts-spin" aria-hidden="true" />
              ) : st.kelas === 'is-selesai' ? (
                '✓'
              ) : st.kelas === 'is-gagal' ? (
                '✕'
              ) : null}
            </span>
          </button>
        );
      })}

      {/*
        Changed Files tetap INLINE di bawah kartu: ini hasil pekerjaan, bukan
        status permukaan. Dirender untuk SEMUA status terminal yang benar-benar
        menulis berkas — dulu hanya 'selesai', jadi run gagal yang tetap saja
        menulis ke disk menyembunyikan buktinya dari pembaca. Badge "Accepted"
        dihapus: tidak pernah ada langkah accept yang benar-benar terjadi.
      */}
      {(run.status === 'selesai' || run.status === 'gagal' || run.status === 'batal') &&
        berkasTulis.length > 0 && (
          <div className={`experts-berkas${berkasBuka ? ' is-buka' : ''}`} data-testid="experts-files">
            <button type="button" className="experts-berkas-kepala" onClick={() => setBerkasBuka((v) => !v)}>
              <span className="experts-progress-caret" aria-hidden="true">▾</span>
              <b>
                {berkasTulis.length} {tr('Changed Files')}
              </b>
            </button>
            {berkasBuka && (
              <div className="experts-berkas-daftar">
                {berkasTulis.map((p) => (
                  <div key={p} className="experts-berkas-baris" title={p}>
                    <span className="experts-berkas-nama">{p.split(/[\\/]/).pop()}</span>
                    <span className="experts-berkas-dir">{p}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
    </div>
  );
}
