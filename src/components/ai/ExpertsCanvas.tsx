import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useExperts, type EkspertRun, type TugasAhli } from '../../lib/expertsStore';
import { useSubAgent } from '../../lib/subagentStore';
import { useT } from '../../lib/i18n';
import { IkonAhli, bukaTabTugas, statusTugas } from './expertsBuka';

/*
 * Experts Canvas — peta run ala produk rujukan: Lead Agent di puncak, worker
 * menggantung di bawahnya per kedalaman dependensi, sambungan melengkung
 * (kurva Bézier vertikal), latar titik-titik, zoom + pan + tombol fit.
 *
 * Tata letaknya deterministik tanpa pustaka graf: kedalaman = panjang rantai
 * `setelah`, node dalam satu jenjang disebar rata. Sumbu dunia tetap
 * (LEBAR_DUNIA x TINGGI_DUNIA) supaya edge dan node memakai satu koordinat;
 * zoom/pan cuma transform pada pembungkusnya.
 *
 * Sejak tab canvas menyimpan `runId`, kanvas menampilkan run YANG DIMINTA —
 * dulu ia selalu membaca `runs[0]`, jadi membuka canvas dari run lama
 * menampilkan run terbaru seolah-olah itu isi tombolnya.
 */

const LEBAR_DUNIA = 1200;
const TINGGI_LANGKAH = 150;
const ATAS_LANGKAH = 150;

/** Lebar kartu node. Satu-satunya sumber: CSS tidak lagi menetapkan width. */
const LEBAR_NODE = 230;

/** Tinggi visual kartu Lead — titik awal sambungan ke akar. */
const BAWAH_LEAD = 84;
/** Setengah tinggi kartu; dipakai untuk menaruh titik sambung. */
const SETENGAH_NODE = 28;

interface Titik {
  tugas: TugasAhli;
  indeks: number;
  kedalaman: number;
  x: number;
  y: number;
}

function tataLetak(run: EkspertRun): Titik[][] {
  const byId = new Map(run.tugas.map((t) => [t.id, t] as const));
  const kedalaman = new Map<string, number>();
  const ukur = (t: TugasAhli, jejak: Set<string>): number => {
    const ada = kedalaman.get(t.id);
    if (ada !== undefined) return ada;
    if (!t.setelah || !byId.has(t.setelah) || jejak.has(t.id)) {
      kedalaman.set(t.id, 0);
      return 0;
    }
    jejak.add(t.id);
    const d = ukur(byId.get(t.setelah)!, jejak) + 1;
    kedalaman.set(t.id, d);
    return d;
  };
  for (const t of run.tugas) ukur(t, new Set());

  const indeksDari = new Map(run.tugas.map((t, i) => [t.id, i] as const));
  const perJenjang = new Map<number, Titik[]>();
  for (const t of run.tugas) {
    const d = kedalaman.get(t.id) ?? 0;
    const arr = perJenjang.get(d) ?? [];
    arr.push({
      tugas: t,
      indeks: indeksDari.get(t.id) ?? 0,
      kedalaman: d,
      x: 0,
      y: ATAS_LANGKAH + d * TINGGI_LANGKAH,
    });
    perJenjang.set(d, arr);
  }
  const tingkatMaks = Math.max(0, ...perJenjang.keys());
  for (let d = 0; d <= tingkatMaks; d++) {
    const arr = perJenjang.get(d) ?? [];
    arr.forEach((t, i) => {
      t.x = ((i + 1) / (arr.length + 1)) * LEBAR_DUNIA;
    });
  }
  return Array.from({ length: tingkatMaks + 1 }, (_, d) => perJenjang.get(d) ?? []);
}

/** Label + kelas status untuk sebuah run (batal bukan "Working"). */
function statusRun(status: EkspertRun['status']): { teks: string; kelas: string } {
  if (status === 'selesai') return { teks: 'Done', kelas: 'is-selesai' };
  if (status === 'gagal') return { teks: 'Failed', kelas: 'is-gagal' };
  if (status === 'batal') return { teks: 'Cancelled', kelas: 'is-batal' };
  return { teks: 'Working', kelas: 'is-jalan' };
}

export default function ExpertsCanvas({ runId }: { runId?: string }) {
  const tr = useT();
  const run = useExperts((s) => (runId ? s.runs.find((r) => r.id === runId) : s.runs[0]));
  const agents = useSubAgent((s) => s.agents);
  const [kamera, setKamera] = useState({ x: 0, y: 0, k: 1 });
  const tarikRef = useRef<{ x: number; y: number; kx: number; ky: number } | null>(null);
  const panggungRef = useRef<HTMLDivElement | null>(null);
  /* Sampai pembaca menyentuh kanvas, ukuran pane yang berubah tetap di-fit. */
  const autoRef = useRef(true);

  const jenjang = useMemo(() => (run ? tataLetak(run) : []), [run]);
  const tinggiDunia = ATAS_LANGKAH + jenjang.length * TINGGI_LANGKAH + 40;

  /*
   * Kotak ISI, bukan kotak dunia. Dunia selalu 1200px, sedangkan tiga tugas
   * dalam satu rantai hanya memakai ~230px di tengahnya; fit ke dunia
   * mengecilkan kanvas ke 40% dan teks kartu jadi tak terbaca. Fit ke isi
   * memperbesar sampai isinya pas — perilaku yang sama dengan kanvas rujukan.
   */
  const kotak = useMemo(() => {
    const semua = jenjang.flat();
    if (semua.length === 0) return { x0: 0, y0: 0, x1: LEBAR_DUNIA, y1: tinggiDunia };
    const x0 = Math.min(...semua.map((t) => t.x - LEBAR_NODE / 2));
    const x1 = Math.max(...semua.map((t) => t.x + LEBAR_NODE / 2));
    const y0 = 12;
    const y1 = Math.max(...semua.map((t) => t.y + SETENGAH_NODE)) + SETENGAH_NODE;
    return { x0, y0, x1, y1 };
  }, [jenjang, tinggiDunia]);

  /*
   * Fit: isi ditarik ke tengah pane dan diskalakan sampai pas (dengan sisa 16px
   * di tiap sisi), maksimum 120% — kartu yang direntangkan lebih dari itu
   * hanya membesar tanpa menambah informasi.
   */
  const muatFit = useCallback(() => {
    const el = panggungRef.current;
    if (!el) return;
    const lebar = el.clientWidth || LEBAR_DUNIA;
    const tinggi = el.clientHeight || 600;
    const lebarIsi = Math.max(1, kotak.x1 - kotak.x0);
    const tinggiIsi = Math.max(1, kotak.y1 - kotak.y0);
    const k = Math.max(
      0.4,
      Math.min(1.2, (lebar - 32) / lebarIsi, (tinggi - 32) / tinggiIsi),
    );
    setKamera({
      x: lebar / 2 - ((kotak.x0 + kotak.x1) / 2) * k,
      y: tinggi / 2 - ((kotak.y0 + kotak.y1) / 2) * k,
      k: Number(k.toFixed(2)),
    });
  }, [kotak]);

  useEffect(() => {
    autoRef.current = true;
    muatFit();
  }, [muatFit, run?.id]);

  /* Resize pane (sidebar ditutup, editor dipecah, jendela diperkecil). */
  useEffect(() => {
    const el = panggungRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (autoRef.current) muatFit();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [muatFit, run?.id]);

  /*
   * Roda mouse zoom ke arah KURSOR, bukan ke tengah: titik di bawah penunjuk
   * harus tetap di bawah penunjuk, kalau tidak setiap zoom "melempar" node
   * yang sedang diperiksa keluar layar.
   */
  const tanganiWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const el = panggungRef.current;
    if (!el) return;
    const kotak = el.getBoundingClientRect();
    const px = e.clientX - kotak.left;
    const py = e.clientY - kotak.top;
    autoRef.current = false;
    setKamera((c) => {
      const nk = Math.min(1.8, Math.max(0.4, c.k * (e.deltaY < 0 ? 1.08 : 0.93)));
      const wx = (px - c.x) / c.k;
      const wy = (py - c.y) / c.k;
      return { k: Number(nk.toFixed(3)), x: px - wx * nk, y: py - wy * nk };
    });
  }, []);

  useEffect(() => {
    const el = panggungRef.current;
    if (!el) return;
    el.addEventListener('wheel', tanganiWheel, { passive: false });
    return () => el.removeEventListener('wheel', tanganiWheel);
  }, [tanganiWheel, run?.id]);

  const agentById = useMemo(() => new Map(agents.map((a) => [a.id, a] as const)), [agents]);
  const posisi = useMemo(
    () => new Map(jenjang.flat().map((t) => [t.tugas.id, t] as const)),
    [jenjang],
  );

  if (!run || run.tugas.length === 0) {
    return (
      <div className="experts-canvas" data-testid="experts-canvas">
        <div className="experts-canvas-kosong">
          <span className="experts-canvas-kosong-ikon" aria-hidden="true">
            <IkonAhli id="lead" size={22} />
          </span>
          {tr('No Experts run yet — pick “Experts” in the composer and give the team a goal.')}
        </div>
      </div>
    );
  }

  const statusDari = (t: TugasAhli) =>
    statusTugas(
      agentById.get(t.agentId ?? '')?.status,
      t.statusAkhir,
      run.status === 'jalan',
      t.buktian,
    );

  const ringkasan = run.tugas.map((t) => {
    const st = statusDari(t);
    return { tugas: t, teks: st.teks === 'Completed' ? tr('Done') : st.teks, kelas: st.kelas };
  });
  const selesai = ringkasan.filter((r) => r.kelas === 'is-selesai').length;
  const kepala = statusRun(run.status);

  /** Bawa satu node ke tengah pane tanpa mengubah zoom. */
  const pusatkan = (id: string) => {
    const t = posisi.get(id);
    const el = panggungRef.current;
    if (!t || !el) return;
    autoRef.current = false;
    setKamera((c) => ({
      ...c,
      x: el.clientWidth / 2 - t.x * c.k,
      y: el.clientHeight / 2 - (t.y + SETENGAH_NODE) * c.k,
    }));
  };

  return (
    <div className="experts-canvas" data-testid="experts-canvas">
      <aside className="experts-canvas-overview" aria-label={tr('Task overview')}>
        <div className="experts-canvas-overview-kepala">
          <span className="experts-canvas-overview-judul-besar">{tr('Team overview')}</span>
          <span className={`experts-canvas-overview-ringkas ${kepala.kelas}`}>
            {selesai}/{ringkasan.length} {tr('Done')}
          </span>
        </div>
        <div className="experts-canvas-overview-daftar" data-testid="experts-canvas-overview">
          {ringkasan.map((r, i) => (
            <button
              key={r.tugas.id}
              type="button"
              className={`experts-canvas-overview-baris ${r.kelas}`}
              title={r.tugas.deskripsi}
              onClick={() => pusatkan(r.tugas.id)}
            >
              <span className="experts-canvas-overview-ikon" data-ahli={r.tugas.ahli} aria-hidden="true">
                {r.kelas === 'is-jalan' ? (
                  <span className="experts-spin" />
                ) : (
                  <IkonAhli id={r.tugas.ahli} size={12} />
                )}
              </span>
              <span className="experts-canvas-overview-teks">
                <span className="experts-canvas-overview-baris-judul">
                  Task {i + 1}: {r.tugas.judul}
                </span>
                <span className="experts-canvas-overview-baris-ahli">{r.tugas.nama}</span>
              </span>
              <span className="experts-canvas-overview-baris-status">{r.teks}</span>
            </button>
          ))}
        </div>
      </aside>

      <div className="experts-canvas-alat">
        <button
          type="button"
          title={tr('Zoom out')}
          onClick={() => {
            autoRef.current = false;
            setKamera((k) => ({ ...k, k: Math.max(0.4, Number((k.k - 0.15).toFixed(2))) }));
          }}
        >
          −
        </button>
        <span className="experts-canvas-zoom">{Math.round(kamera.k * 100)}%</span>
        <button
          type="button"
          title={tr('Zoom in')}
          onClick={() => {
            autoRef.current = false;
            setKamera((k) => ({ ...k, k: Math.min(1.8, Number((k.k + 0.15).toFixed(2))) }));
          }}
        >
          +
        </button>
        <button
          type="button"
          title={tr('Fit view')}
          onClick={() => {
            autoRef.current = true;
            muatFit();
          }}
        >
          ⛶
        </button>
      </div>

      <div
        ref={panggungRef}
        className="experts-canvas-panggung"
        onPointerDown={(e) => {
          tarikRef.current = { x: e.clientX, y: e.clientY, kx: kamera.x, ky: kamera.y };
          autoRef.current = false;
          e.currentTarget.setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          const tarik = tarikRef.current;
          if (!tarik) return;
          setKamera((k) => ({ ...k, x: tarik.kx + (e.clientX - tarik.x), y: tarik.ky + (e.clientY - tarik.y) }));
        }}
        onPointerUp={() => {
          tarikRef.current = null;
        }}
        onPointerCancel={() => {
          tarikRef.current = null;
        }}
      >
        <div
          className="experts-canvas-dunia"
          style={{
            width: LEBAR_DUNIA,
            height: tinggiDunia,
            transform: `translate(${kamera.x}px, ${kamera.y}px) scale(${kamera.k})`,
          }}
        >
          <svg className="experts-canvas-edge" width={LEBAR_DUNIA} height={tinggiDunia}>
            {/* Lead -> akar */}
            {jenjang[0]?.map((t) => {
              const x1 = LEBAR_DUNIA / 2;
              const y1 = BAWAH_LEAD;
              const x2 = t.x;
              const y2 = t.y - SETENGAH_NODE;
              const b = Math.max(34, (y2 - y1) / 2);
              return (
                <path
                  key={`lead-${t.tugas.id}`}
                  d={`M ${x1} ${y1} C ${x1} ${y1 + b}, ${x2} ${y2 - b}, ${x2} ${y2}`}
                />
              );
            })}
            {/* induk -> anak */}
            {jenjang.flat().map((t) => {
              if (!t.tugas.setelah) return null;
              const induk = posisi.get(t.tugas.setelah);
              if (!induk) return null;
              const x1 = induk.x;
              const y1 = induk.y + 30;
              const x2 = t.x;
              const y2 = t.y - SETENGAH_NODE;
              const b = Math.max(34, (y2 - y1) / 2);
              return (
                <path
                  key={`${induk.tugas.id}-${t.tugas.id}`}
                  d={`M ${x1} ${y1} C ${x1} ${y1 + b}, ${x2} ${y2 - b}, ${x2} ${y2}`}
                />
              );
            })}
          </svg>

          {/* Kartu Lead */}
          <button
            type="button"
            className={`experts-canvas-node is-lead${run.status === 'jalan' ? ' is-jalan' : ''}`}
            style={{ left: LEBAR_DUNIA / 2 - LEBAR_NODE / 2, top: 12, width: LEBAR_NODE }}
            data-testid="experts-canvas-lead"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <span className="experts-canvas-node-avatar is-lead" aria-hidden="true">
              <IkonAhli id="lead" size={15} />
            </span>
            <span className="experts-canvas-node-badan">
              <span className="experts-canvas-node-ahli">Lead Agent</span>
              <span className="experts-canvas-node-judul">{tr('Orchestrating expert tasks')}</span>
            </span>
            <span className={`experts-canvas-node-status ${kepala.kelas}`}>
              {kepala.kelas === 'is-jalan' ? <span className="experts-spin" aria-hidden="true" /> : null}
              {tr(kepala.teks)}
            </span>
          </button>

          {/* Kartu worker */}
          {jenjang.flat().map((t) => {
            const st = statusDari(t.tugas);
            return (
              <button
                key={t.tugas.id}
                type="button"
                className={`experts-canvas-node${st.kelas !== 'is-selesai' ? ` ${st.kelas}` : ''}`}
                style={{ left: t.x - LEBAR_NODE / 2, top: t.y - SETENGAH_NODE, width: LEBAR_NODE }}
                data-testid={`experts-canvas-node-${t.tugas.id}`}
                title={t.tugas.deskripsi}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => bukaTabTugas(t.tugas, t.indeks)}
              >
                <span className="experts-canvas-node-avatar" data-ahli={t.tugas.ahli} aria-hidden="true">
                  <IkonAhli id={t.tugas.ahli} size={15} />
                </span>
                <span className="experts-canvas-node-badan">
                  <span className="experts-canvas-node-ahli">{t.tugas.nama}</span>
                  <span className="experts-canvas-node-judul">{t.tugas.judul}</span>
                </span>
                <span className={`experts-canvas-node-status ${st.kelas}`}>
                  {st.kelas === 'is-jalan' ? <span className="experts-spin" aria-hidden="true" /> : null}
                  {st.teks === 'Completed' ? tr('Done') : st.teks}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
