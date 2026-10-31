import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useExperts, type EkspertRun, type TugasAhli } from '../../lib/expertsStore';
import { useSubAgent } from '../../lib/subagentStore';
import { useT } from '../../lib/i18n';
import { IkonAhli, bukaTabTugas, statusTugas } from './expertsBuka';

/*
 * Experts Canvas — salinan kanvas produk rujukan (Qoder): Lead Agent di puncak,
 * worker menggantung di bawahnya per kedalaman dependensi, sambungan melengkung
 * (kurva Bézier vertikal), latar titik-titik, zoom + pan + fit + reset.
 *
 * Bentuk kartu MENGIKUTI acuan: kartu VERTIKAL — kepala (avatar + nama/judul),
 * garis pemisah, lalu baris status dengan ikon (centang hijau = Done). Kanvas
 * mengisi penuh editor; TIDAK ada panel ringkasan di kiri (di acuan daftar tugas
 * hidup di panel chat kanan, bukan di kanvas).
 *
 * Tata letak deterministik tanpa pustaka graf: kedalaman = panjang rantai
 * `setelah`, node satu jenjang disebar rata. Zoom/pan hanya transform pada
 * pembungkusnya. Tab canvas menyimpan `runId`, jadi kanvas menampilkan run yang
 * DIMINTA, bukan selalu runs[0].
 */

const LEBAR_DUNIA = 1280;
/** Jarak pusat-ke-pusat antar jenjang. */
const TINGGI_LANGKAH = 150;
/** Pusat jenjang pertama (anak Lead). */
const ATAS_LANGKAH = 200;

/** Lebar kartu node. Satu-satunya sumber: CSS tidak lagi menetapkan width. */
const LEBAR_NODE = 280;
/** Tinggi visual kartu (kepala + pemisah + status) — titik sambung edge. */
const TINGGI_KARTU = 82;
/** Setengah tinggi kartu; menaruh titik sambung atas/bawah. */
const SETENGAH_NODE = TINGGI_KARTU / 2;
/** Dasar kartu Lead (top tetap 12) — awal sambungan ke akar. */
const BAWAH_LEAD = 12 + TINGGI_KARTU;

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

/** Label + kelas status untuk kepala run (batal bukan "Working"). */
function statusRun(status: EkspertRun['status']): { teks: string; kelas: string } {
  if (status === 'selesai') return { teks: 'Done', kelas: 'is-selesai' };
  if (status === 'gagal') return { teks: 'Failed', kelas: 'is-gagal' };
  if (status === 'batal') return { teks: 'Cancelled', kelas: 'is-batal' };
  return { teks: 'Working', kelas: 'is-jalan' };
}

/** Glyph status di baris bawah kartu: centang/selesai, silang/gagal, titik. */
function IkonStatus({ kelas }: { kelas: string }) {
  if (kelas === 'is-jalan') return <span className="experts-spin" aria-hidden="true" />;
  if (kelas === 'is-selesai')
    return (
      <svg className="experts-canvas-node-statusikon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <circle cx="8" cy="8" r="7" fill="currentColor" opacity="0.18" />
        <path
          d="m4.9 8.2 2.1 2.1 4.1-4.6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  if (kelas === 'is-gagal')
    return (
      <svg className="experts-canvas-node-statusikon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <circle cx="8" cy="8" r="7" fill="currentColor" opacity="0.18" />
        <path
          d="m5.7 5.7 4.6 4.6M10.3 5.7l-4.6 4.6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    );
  return <span className="experts-canvas-node-statusdot" aria-hidden="true" />;
}

interface KartuProps {
  ahli: string;
  nama: string;
  judul: string;
  kelas: string;
  teks: string;
  className: string;
  style: React.CSSProperties;
  testId: string;
  title?: string;
  onClick?: () => void;
}

/** Satu kartu node: kepala (avatar + nama/judul) → pemisah → baris status. */
function KartuNode({ ahli, nama, judul, kelas, teks, className, style, testId, title, onClick }: KartuProps) {
  return (
    <button
      type="button"
      className={`experts-canvas-node ${className}`}
      style={style}
      data-testid={testId}
      title={title}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onClick}
    >
      <span className="experts-canvas-node-kepala">
        <span className="experts-canvas-node-avatar" data-ahli={ahli} aria-hidden="true">
          <IkonAhli id={ahli} size={16} />
        </span>
        <span className="experts-canvas-node-badan">
          <span className="experts-canvas-node-ahli">{nama}</span>
          <span className="experts-canvas-node-judul">{judul}</span>
        </span>
      </span>
      <span className={`experts-canvas-node-status ${kelas}`}>
        <IkonStatus kelas={kelas} />
        {teks}
      </span>
    </button>
  );
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
   * Kotak ISI, bukan kotak dunia. Dunia selalu LEBAR_DUNIA, sedangkan beberapa
   * tugas hanya memakai sebagian tengahnya; fit ke dunia mengecilkan kanvas dan
   * teks kartu jadi tak terbaca. Fit ke isi memperbesar sampai isinya pas.
   */
  const kotak = useMemo(() => {
    const semua = jenjang.flat();
    if (semua.length === 0) return { x0: 0, y0: 0, x1: LEBAR_DUNIA, y1: tinggiDunia };
    const x0 = Math.min(...semua.map((t) => t.x - LEBAR_NODE / 2));
    const x1 = Math.max(...semua.map((t) => t.x + LEBAR_NODE / 2));
    const y0 = 12;
    const y1 = Math.max(...semua.map((t) => t.y + SETENGAH_NODE)) + 12;
    return { x0, y0, x1, y1 };
  }, [jenjang, tinggiDunia]);

  /* Fit: isi ditarik ke tengah pane dan diskalakan sampai pas (maks 120%). */
  const muatFit = useCallback(() => {
    const el = panggungRef.current;
    if (!el) return;
    const lebar = el.clientWidth || LEBAR_DUNIA;
    const tinggi = el.clientHeight || 600;
    const lebarIsi = Math.max(1, kotak.x1 - kotak.x0);
    const tinggiIsi = Math.max(1, kotak.y1 - kotak.y0);
    const k = Math.max(0.4, Math.min(1.2, (lebar - 40) / lebarIsi, (tinggi - 40) / tinggiIsi));
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

  /* Roda mouse zoom ke ARAH KURSOR, bukan ke tengah. */
  const tanganiWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const el = panggungRef.current;
    if (!el) return;
    const kotakEl = el.getBoundingClientRect();
    const px = e.clientX - kotakEl.left;
    const py = e.clientY - kotakEl.top;
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

  const kepala = statusRun(run.status);

  const zoom = (delta: number) => {
    autoRef.current = false;
    setKamera((k) => ({ ...k, k: Math.min(1.8, Math.max(0.4, Number((k.k + delta).toFixed(2)))) }));
  };

  /* Reset: zoom 100%, isi dipusatkan horizontal, puncak sedikit di bawah tepi. */
  const reset = () => {
    const el = panggungRef.current;
    if (!el) return;
    autoRef.current = false;
    setKamera({
      x: el.clientWidth / 2 - (kotak.x0 + kotak.x1) / 2,
      y: 24 - kotak.y0,
      k: 1,
    });
  };

  return (
    <div className="experts-canvas" data-testid="experts-canvas">
      <div className="experts-canvas-alat">
        <button type="button" title={tr('Zoom out')} onClick={() => zoom(-0.15)}>
          −
        </button>
        <span className="experts-canvas-zoom">{Math.round(kamera.k * 100)}%</span>
        <button type="button" title={tr('Zoom in')} onClick={() => zoom(0.15)}>
          +
        </button>
        <span className="experts-canvas-alat-pemisah" aria-hidden="true" />
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
        <button type="button" title={tr('Reset view')} onClick={reset}>
          ⟳
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
            {/* Lead -> akar (jenjang 0) */}
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
              const y1 = induk.y + SETENGAH_NODE;
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
          <KartuNode
            ahli="lead"
            nama="Lead Agent"
            judul={tr('Orchestrating expert tasks')}
            kelas={kepala.kelas}
            teks={tr(kepala.teks)}
            className={`is-lead${run.status === 'jalan' ? ' is-jalan' : ''}`}
            style={{ left: LEBAR_DUNIA / 2 - LEBAR_NODE / 2, top: 12, width: LEBAR_NODE }}
            testId="experts-canvas-lead"
          />

          {/* Kartu worker */}
          {jenjang.flat().map((t) => {
            const st = statusDari(t.tugas);
            return (
              <KartuNode
                key={t.tugas.id}
                ahli={t.tugas.ahli}
                nama={t.tugas.nama}
                judul={t.tugas.judul}
                kelas={st.kelas}
                teks={st.teks === 'Completed' ? tr('Done') : st.teks}
                className={st.kelas !== 'is-selesai' ? st.kelas : ''}
                style={{ left: t.x - LEBAR_NODE / 2, top: t.y - SETENGAH_NODE, width: LEBAR_NODE }}
                testId={`experts-canvas-node-${t.tugas.id}`}
                title={t.tugas.deskripsi}
                onClick={() => bukaTabTugas(t.tugas, t.indeks)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
