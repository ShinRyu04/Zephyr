import { useExperts } from '../../lib/expertsStore';

/*
 * Kartu rencana Experts — SISA FUNGSI saja, karena gerbang dihapus.
 *
 * Keputusan user: Qoder tidak punya Start/Edit/Discard — Lead selesai
 * menulis rencana, tim LANGSUNG jalan (auto-run tanpa syarat, lihat
 * `prosesLead` di expertsStore). Urutan chat kini:
 *
 *   "Creating research task" (streaming) → intro + fold "Created N tasks"
 *   + kartu per-worker (ExpertsTimeline).
 *
 * Kartu ini tinggal menutup dua kasus tepi:
 *   1. run-nya hilang dari store (data lama / dibersihkan) — kalimat
 *      pengantar Lead masih ditampilkan sebagai teks, bukan kartu rusak;
 *   2. run gagal TANPA satu pun tugas — pesan error-nya butuh tempat.
 * Status jalan/selesai/gagal dengan tugas → null: permukaannya milik
 * ExpertsTimeline (satu sumber kebalikan, bukan dua kartu bertumpuk).
 */
export default function ExpertsPlanCard({
  runId,
  teks,
}: {
  runId: string;
  /** Kalimat pengantar dari Lead — tampil apa adanya kalau run-nya hilang. */
  teks: string;
}) {
  const run = useExperts((s) => s.runs.find((r) => r.id === runId));

  if (!run) {
    const sisa = teks.trim();
    if (!sisa) return null;
    return (
      <div className="experts-plan is-hilang" data-testid="experts-plan">
        <div className="experts-plan-intro">{sisa}</div>
      </div>
    );
  }

  if (
    (run.status === 'jalan' || run.status === 'selesai' || run.status === 'gagal') &&
    run.tugas.length > 0
  ) {
    return null;
  }

  return (
    <div className="experts-plan" data-testid="experts-plan" data-status={run.status}>
      {run.error && <div className="experts-plan-error">{run.error}</div>}
    </div>
  );
}
