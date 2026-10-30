import { useState } from 'react';
import { useExperts } from '../../lib/expertsStore';
import { useSubAgent } from '../../lib/subagentStore';
import { useT } from '../../lib/i18n';
import { bukaTabTugas, statusTugas } from './expertsBuka';

/*
 * Task Progress Experts — "todos"-nya Experts, DI ATAS COMPOSER.
 *
 * Produk rujukan menaruh progress tim di kartu status permukaan (dekat input),
 * bukan di dalam alur percakapan. Kartu ini memakai bentuk yang sama dengan
 * `KartuTodos` (header caret + badge, baris status) dan menumpang kelas
 * `.experts-kartu`/`.exp-todo` supaya menyatu hitam dengan composer: border
 * bawah dan sudut atas composer dibuang oleh CSS yang sudah ada.
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
  const agents = useSubAgent((s) => s.agents);
  const [buka, setBuka] = useState(true);

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
    if (masuk !== null) {
      totalMasuk += masuk;
      adaToken = true;
    }
    if (keluar !== null) {
      totalKeluar += keluar;
      adaToken = true;
    }
    if (biaya !== null) {
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
      <button
        type="button"
        className="exp-todo-kepala"
        data-testid="experts-progress-toggle"
        aria-expanded={buka}
        onClick={() => setBuka((v) => !v)}
      >
        <span className="experts-progress-caret" aria-hidden="true">▾</span>
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
      {buka && (
        <div className="exp-todo-daftar" data-testid="experts-progress-list">
          {run.tugas.map((t, i) => {
            const st = statusDari(i);
            const kelas =
              st.teks === 'Completed' ? 'is-done' : st.kelas === 'is-jalan' ? 'is-jalan' : st.kelas === 'is-pending' ? 'is-pending' : 'is-lain';
            const glyph = kelas === 'is-done' ? '✓' : kelas === 'is-lain' ? '✕' : '';
            return (
              <button
                key={t.id}
                type="button"
                className={`exp-todo-baris ${kelas}`}
                title={`${t.judul} — ${t.nama} — ${st.teks}`}
                data-testid={`experts-progress-row-${i + 1}`}
                onClick={() => bukaTabTugas(t, i)}
              >
                <span className={`exp-todo-titik ${kelas}`} aria-hidden="true">
                  {glyph}
                </span>
                <span className="exp-todo-teks">{t.judul}</span>
                <span className="experts-progress-ahli-kecil">{st.teks}</span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
