import { useState } from 'react';
import { useExperts } from '../../lib/expertsStore';
import { useSubAgent } from '../../lib/subagentStore';
import { useT } from '../../lib/i18n';
import { bukaTabTugas, bukaCanvas, statusTugas, IkonAhli, IkonCaret, IkonCentang } from './expertsBuka';

/*
 * Task Progress Experts — strip status tim DI ATAS COMPOSER, bentuk acuan
 * (110036/110050): header caret + "Task Progress N/N Done", tiap baris DUA
 * TINGKAT ("Task N: judul" + avatar & nama worker di bawahnya), dan footer
 * "N Changed Files / Accepted" DI DALAM kartu yang sama. Avatar worker aktif
 * di ujung kanan header membuka Experts Canvas (peran Canvas ala Qoder), dan
 * saat run berjalan ada tombol Stop di sebelahnya — keduanya pindah dari kartu
 * chat yang lama, supaya kartu chat benar-benar polos seperti acuan.
 *
 * Sumber kebenaran tetap run Experts; status tiap tugas dibaca dari baris
 * subagent hidup (fallback snapshot `statusAkhir`). Tugas tanpa bukti tampil
 * sebagai gagal — jangan pernah menjanjikan "Completed" dari klaim laporan.
 *
 * Run yang masih `rencana`/`menyusun` TIDAK dirender di sini: gerbangnya ada di
 * kartu rencana dalam chat, dan belum ada pekerjaan yang perlu dipantau.
 */
/**
 * Angka token yang ringkas tapi tidak menyesatkan: 1.2k / 34k / 1.1M.
 * Pembaca mengawasi kuota, jadi angka kecil tetap ditampilkan apa adanya.
 */
function ringkasAngka(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

export default function KartuProgresExperts({ sessionId }: { sessionId: string | null }) {
  const tr = useT();
  const run = useExperts((s) =>
    s.runs.find(
      (r) =>
        r.sessionId === sessionId &&
        r.tugas.length > 0 &&
        (r.status === 'jalan' || r.status === 'selesai' || r.status === 'gagal' || r.status === 'batal'),
    ),
  );
  const batal = useExperts((s) => s.batal);
  const agents = useSubAgent((s) => s.agents);
  const [buka, setBuka] = useState(true);
  const [berkasBuka, setBerkasBuka] = useState(false);

  /* Semua hook WAJIB dipanggil sebelum return apa pun: jumlah hook tidak boleh
     berubah antar-render. Guard sesi ditaruh setelah hook, bukan sebelumnya. */
  if (!sessionId || !run) return null;

  const jalan = run.status === 'jalan';
  const statusDari = (i: number) => {
    const t = run.tugas[i];
    const row = agents.find((a) => a.id === t.agentId);
    return statusTugas(row?.status, t.statusAkhir, jalan, t.buktian);
  };
  const selesai = run.tugas.filter((_, i) => statusDari(i).teks === 'Completed').length;

  /* Worker yang sedang mengerjakan → avatarnya jadi chip Canvas di header. */
  const aktif = run.tugas.find((t) => {
    const row = agents.find((a) => a.id === t.agentId);
    return row?.status === 'jalan';
  });
  const berkasTulis = [...new Set(run.tugas.flatMap((t) => t.berkasTulis ?? []))];

  /*
   * Pemakaian token/biaya run ini.
   *
   * Dijumlahkan dari baris subagent yang masih hidup ATAU dari snapshot run
   * (`agentId` yang sudah hilang tetap dihitung lewat `useSubAgent` saja tidak
   * cukup — setelah restart barisnya tidak ada). `null` berarti provider tidak
   * melaporkan; itu BUKAN nol, jadi angka 0 tidak pernah ditampilkan sebagai
   * "gratis". Biaya hanya muncul kalau tabel tarif benar-benar punya entri
   * untuk model itu — `TARIF` sengaja kosong sampai tarifnya pasti.
   */
  let totalMasuk = 0;
  let totalKeluar = 0;
  let totalBiaya = 0;
  let adaToken = false;
  let adaBiaya = false;
  for (const t of run.tugas) {
    const row = t.agentId ? agents.find((a) => a.id === t.agentId) : undefined;
    const masuk = row ? row.inputTokens : (t.inputTokens ?? null);
    const keluar = row ? row.outputTokens : (t.outputTokens ?? null);
    const biaya = row ? row.costUsd : (t.costUsd ?? null);
    /* `typeof === 'number'`, BUKAN `!== null`: baris yang belum pernah
       melaporkan pemakaian membawa `undefined`, dan `undefined !== null` lolos
       lalu menjumlahkan NaN — strip sempat menampilkan "$NaN · NaNM↑ NaNM↓". */
    if (typeof masuk === 'number') {
      totalMasuk += masuk;
      adaToken = true;
    }
    if (typeof keluar === 'number') {
      totalKeluar += keluar;
      adaToken = true;
    }
    if (typeof biaya === 'number') {
      totalBiaya += biaya;
      adaBiaya = true;
    }
  }

  return (
    <section
      className={`experts-kartu exp-todo${buka ? ' is-buka' : ''}`}
      data-testid="experts-progress-card"
      data-status={run.status}
    >
      {/*
        * Header = WRAPPER div, bukan satu tombol besar: tombol Canvas & Stop
        * ada di ujung kanannya, dan button tidak boleh menumpuk di dalam
        * button (axe: interactive descendant — pelajaran tab editor fase 31).
        * Yang bisa diklik = bagian kiri (toggle lipatan) dan tombol kanan.
        */}
      <div className="exp-todo-kepala">
        <button
          type="button"
          className="exp-todo-kepala-toggle"
          data-testid="experts-progress-toggle"
          aria-expanded={buka}
          onClick={() => setBuka((v) => !v)}
        >
          <IkonCaret />
          <b>{tr('Task Progress')}</b>
          <span className="experts-progress-badge" aria-hidden="true">
            {selesai}/{run.tugas.length} {tr('Done')}
          </span>
          {adaToken && (
            <span
              className="experts-progress-token"
              title={tr('Tokens reported by the provider for this run')}
              data-testid="experts-progress-token"
            >
              {adaBiaya ? `$${totalBiaya.toFixed(4)} · ` : ''}
              {ringkasAngka(totalMasuk)}↑ {ringkasAngka(totalKeluar)}↓
            </span>
          )}
        </button>
        <span className="exp-todo-kanan">
          {aktif && (
            <button
              type="button"
              className="exp-todo-canvas"
              data-ahli={aktif.ahli}
              title={tr('Open Experts Canvas')}
              aria-label={tr('Open Experts Canvas')}
              data-testid="experts-progress-canvas"
              onClick={() => bukaCanvas(run.id)}
            >
              <IkonAhli id={aktif.ahli} size={11} />
            </button>
          )}
          {jalan && (
            <button
              type="button"
              className="experts-mini is-bahaya"
              data-testid="experts-progress-stop"
              onClick={() => batal(run.id)}
            >
              {tr('Stop')}
            </button>
          )}
        </span>
      </div>
      {buka && (
        <div className="exp-todo-daftar" data-testid="experts-progress-list">
          {run.tugas.map((t, i) => {
            const st = statusDari(i);
            const kelas =
              st.teks === 'Completed' ? 'is-done' : st.kelas === 'is-jalan' ? 'is-jalan' : st.kelas === 'is-pending' ? 'is-pending' : 'is-lain';
            return (
              <button
                key={t.id}
                type="button"
                className={`exp-todo-baris ${kelas}`}
                title={`${t.judul} — ${t.nama} — ${st.teks}`}
                data-testid={`experts-progress-row-${i + 1}`}
                onClick={() => bukaTabTugas(t, i)}
              >
                {/* Status = IKON, bukan teks: centang bulat hijau untuk selesai,
                    lingkaran kosong untuk yang belum jalan (acuan 110036). */}
                <span className={`exp-todo-titik ${kelas}`} aria-hidden="true">
                  {kelas === 'is-jalan' ? (
                    <span className="experts-spin" />
                  ) : kelas === 'is-done' ? (
                    <IkonCentang size={12} />
                  ) : kelas === 'is-pending' ? (
                    <span className="exp-todo-kosong-bulat" />
                  ) : (
                    <span className="exp-todo-silang">✕</span>
                  )}
                </span>
                <span className="exp-todo-badan">
                  <span className="exp-todo-judul">
                    Task {i + 1}: {t.judul}
                  </span>
                  <span className="exp-todo-ahli">
                    <span className="exp-todo-ava" data-ahli={t.ahli} aria-hidden="true">
                      <IkonAhli id={t.ahli} size={9} />
                    </span>
                    {t.nama}
                  </span>
                </span>
                {kelas === 'is-lain' && <span className="experts-progress-ahli-kecil">{st.teks}</span>}
              </button>
            );
          })}
          {/*
            * Changed Files MENEMANI daftar tugas di kartu yang sama (acuan
            * 110036: "› 3 Changed Files … Accepted" di footer Task Progress),
            * bukan di kartu chat — chat menampilkan kartu diff per berkas.
            */}
          {berkasTulis.length > 0 && (
            <div className={`experts-berkas${berkasBuka ? ' is-buka' : ''}`} data-testid="experts-progress-files">
              <button
                type="button"
                className="experts-berkas-kepala"
                aria-expanded={berkasBuka}
                onClick={() => setBerkasBuka((v) => !v)}
              >
                <IkonCaret />
                <b>
                  {berkasTulis.length} {tr('Changed Files')}
                </b>
                <span className="experts-berkas-badge">{tr('Accepted')}</span>
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
      )}
    </section>
  );
}
