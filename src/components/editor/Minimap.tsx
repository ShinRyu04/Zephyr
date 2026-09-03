// Minimap.tsx — peta gulir di kanan editor (fase 24).
//
// Digambar ke <canvas>, BUKAN DOM per baris. Alasannya bukan gaya: minimap DOM
// pada file 5000 baris = 5000 node yang harus di-layout ulang setiap scroll,
// dan itu persis kelas masalah yang membekukan editor di fase 15.
//
// Biaya render dijaga tiga cara:
//   1. Satu canvas, digambar dengan rect kecil per baris (blok) — atau per
//      karakter kalau `minimapRenderCharacters` dinyalakan user.
//   2. Redraw hanya saat dokumen/tema/ukuran berubah, dan di-throttle ke
//      requestAnimationFrame; scroll hanya menggeser kotak viewport (CSS),
//      tidak menggambar ulang isi.
//   3. Baris di atas MAX_BARIS di-subsample: file 100k baris tetap satu canvas
//      dengan tinggi tetap.
//
// Warna dibaca dari CSS variable (AGENTS.md §4: dilarang hex hardcoded).

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { EditorView } from '@codemirror/view';
import { useProblems, kunciPath } from '../../lib/problemsStore';

/** Lebar minimap; sama dengan --minimap-w di editor-extras.css. */
const LEBAR = 84;
/** Tinggi satu baris di minimap (px). 3px = ~330 baris per layar 1000px. */
const TINGGI_BARIS = 3;
/** Di atas ini, baris di-subsample supaya canvas tidak jadi raksasa. */
const MAX_BARIS = 12000;

/**
 * Catatan gambar terakhir — dibaca harness lewat `__ZEPHYR_EXTRAS__`.
 * Ada supaya kegagalan render bisa didiagnosis tanpa menebak: `alasan`
 * menyebutkan syarat mana yang tidak terpenuhi.
 */
export const minimapDebug: {
  panggil: number;
  gambar: number;
  alasan: string | null;
  w: number;
  h: number;
} = { panggil: 0, gambar: 0, alasan: null, w: 0, h: 0 };

interface Props {
  view: EditorView | null;
  /** path file aktif — untuk marker error dari problemsStore */
  path?: string;
  renderCharacters: boolean;
  /** dinaikkan pemanggil setiap dokumen berubah, supaya redraw terjadwal */
  docVersion: number;
}

const bacaVar = (el: HTMLElement, nama: string, fallback: string): string => {
  const v = getComputedStyle(el).getPropertyValue(nama).trim();
  return v || fallback;
};

export default function Minimap({ view, path, renderCharacters, docVersion }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  /** timer debounce untuk redraw; BUKAN requestAnimationFrame — lihat jadwalkan() */
  const timerRef = useRef<number | null>(null);
  /**
   * Fungsi gambar/viewport TERBARU.
   *
   * BUG NYATA yang ini perbaiki (fase 24): efek anak berjalan SEBELUM efek
   * induk yang membuat EditorView, jadi timer pertama terpasang dengan closure
   * `view = null`. Ketika view sudah ada dan efeknya jalan lagi, penjaga
   * `if (timerRef.current !== null) return` membuat panggilan kedua no-op —
   * dan timer lama (closure basi) langsung keluar. Hasilnya canvas tetap
   * 300×150 default: kotak viewport bergerak (fungsi itu dipanggil langsung
   * dari listener scroll), tapi isi minimap tidak pernah digambar.
   *
   * Dengan ref ini, timer selalu memanggil versi terbaru.
   */
  const fnRef = useRef<{ gambar: () => void; viewport: () => void }>({
    gambar: () => {},
    viewport: () => {},
  });
  const [viewport, setViewport] = useState({ atas: 0, tinggi: 0 });

  const diagList = useProblems((s) =>
    path ? (s.byFile.get(kunciPath(path))?.length ?? 0) : 0,
  );

  /** Gambar isi dokumen. Dipanggil hanya saat perlu, tidak saat scroll. */
  const gambar = useCallback(() => {
    minimapDebug.panggil++;
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host || !view) {
      minimapDebug.alasan = `canvas=${!!canvas} host=${!!host} view=${!!view}`;
      return;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const tinggiHost = host.clientHeight;
    if (tinggiHost <= 0) {
      minimapDebug.alasan = `tinggiHost=${tinggiHost}`;
      return;
    }

    canvas.width = Math.floor(LEBAR * dpr);
    canvas.height = Math.floor(tinggiHost * dpr);
    canvas.style.width = `${LEBAR}px`;
    canvas.style.height = `${tinggiHost}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      minimapDebug.alasan = 'getContext null';
      return;
    }
    minimapDebug.gambar++;
    minimapDebug.alasan = null;
    minimapDebug.w = canvas.width;
    minimapDebug.h = canvas.height;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, LEBAR, tinggiHost);

    const doc = view.state.doc;
    const totalBaris = doc.lines;
    const langkah = totalBaris > MAX_BARIS ? Math.ceil(totalBaris / MAX_BARIS) : 1;
    const barisTampil = Math.ceil(totalBaris / langkah);
    const skala = Math.min(TINGGI_BARIS, tinggiHost / Math.max(barisTampil, 1));

    const warnaTeks = bacaVar(host, '--fg2', '#8b98a5');
    const warnaKomentar = bacaVar(host, '--syntax-comment', '#5c6773');
    const warnaError = bacaVar(host, '--danger', '#f04747');

    ctx.globalAlpha = 0.75;

    // Satu rect per potongan teks; panjang rect = panjang baris (dipotong).
    for (let i = 0; i < barisTampil; i++) {
      const nomor = i * langkah + 1;
      if (nomor > totalBaris) break;
      const teks = doc.line(nomor).text;
      if (teks.trim().length === 0) continue;

      const y = i * skala;
      const indent = teks.length - teks.trimStart().length;
      const komentar = /^\s*(\/\/|#|\*|--|<!--)/.test(teks);
      ctx.fillStyle = komentar ? warnaKomentar : warnaTeks;

      if (renderCharacters) {
        // Mode berat: satu rect per karakter non-spasi (masih jauh lebih murah
        // daripada DOM, tapi tetap ~100x lebih banyak draw call).
        const maxKar = Math.min(teks.length, Math.floor(LEBAR / 1.1));
        for (let k = indent; k < maxKar; k++) {
          if (teks[k] === ' ' || teks[k] === '\t') continue;
          ctx.fillRect(k * 1.1, y, 0.9, Math.max(skala - 0.6, 0.8));
        }
      } else {
        const x = Math.min(indent * 1.1, LEBAR - 4);
        const panjang = Math.min((teks.trimEnd().length - indent) * 1.1, LEBAR - x);
        ctx.fillRect(x, y, Math.max(panjang, 1), Math.max(skala - 0.8, 0.8));
      }
    }

    // Marker error: pita merah selebar minimap di baris diagnostik. Ini gunanya
    // minimap untuk pekerjaan nyata — tahu ada error jauh di bawah tanpa scroll.
    if (path) {
      const list = useProblems.getState().byFile.get(kunciPath(path)) ?? [];
      ctx.globalAlpha = 0.95;
      for (const d of list) {
        if (d.severity !== 'error' && d.severity !== 'warning') continue;
        ctx.fillStyle = d.severity === 'error' ? warnaError : bacaVar(host, '--warning', '#e0a030');
        const y = ((d.line - 1) / langkah) * skala;
        ctx.fillRect(0, Math.max(y - 0.5, 0), LEBAR, Math.max(skala, 2));
      }
    }
    ctx.globalAlpha = 1;
  }, [view, path, renderCharacters]);

  /** Posisi kotak viewport — murah, boleh jalan tiap scroll. */
  const perbaruiViewport = useCallback(() => {
    const host = hostRef.current;
    if (!host || !view) return;
    const tinggiHost = host.clientHeight;
    const doc = view.state.doc;
    const totalBaris = doc.lines;
    const langkah = totalBaris > MAX_BARIS ? Math.ceil(totalBaris / MAX_BARIS) : 1;
    const barisTampil = Math.ceil(totalBaris / langkah);
    const skala = Math.min(TINGGI_BARIS, tinggiHost / Math.max(barisTampil, 1));

    const scroller = view.scrollDOM;
    const barisAtas = doc.lineAt(view.lineBlockAtHeight(scroller.scrollTop).from).number;
    const barisBawah = doc.lineAt(
      view.lineBlockAtHeight(scroller.scrollTop + scroller.clientHeight - 1).from,
    ).number;

    setViewport({
      atas: ((barisAtas - 1) / langkah) * skala,
      tinggi: Math.max(((barisBawah - barisAtas + 1) / langkah) * skala, 6),
    });
  }, [view]);

  const jadwalkan = useCallback(() => {
    // requestAnimationFrame TIDAK dipakai: WebView2 tidak menjalankan rAF saat
    // jendela tidak terlihat/tidak fokus, jadi canvas tetap kosong.
    // setTimeout selalu jalan, dan tetap meredam ledakan redraw.
    if (timerRef.current !== null) return;
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      // Lewat ref: closure yang tersimpan di timer bisa sudah basi.
      fnRef.current.gambar();
      fnRef.current.viewport();
    }, 16);
  }, []);

  // Selalu simpan versi terbaru sebelum timer mana pun menyala.
  fnRef.current = { gambar, viewport: perbaruiViewport };

  // Redraw saat dokumen / opsi / diagnostik / view berubah.
  // `view` WAJIB masuk dependensi: minimap dirender sebelum EditorView induk
  // ada, jadi tanpa ini redraw pertama dengan view asli tidak pernah terjadi.
  useLayoutEffect(() => {
    jadwalkan();
  }, [jadwalkan, view, docVersion, diagList, renderCharacters]);

  // Scroll editor -> hanya geser kotak viewport (murah).
  useEffect(() => {
    if (!view) return;
    const scroller = view.scrollDOM;
    const onScroll = () => perbaruiViewport();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    // Gambar sekali di sini juga: ini titik paling awal yang PASTI punya view.
    jadwalkan();
    return () => scroller.removeEventListener('scroll', onScroll);
  }, [view, perbaruiViewport, jadwalkan]);

  // Ukuran host berubah (panel dibuka/ditutup, window resize) -> redraw.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const ro = new ResizeObserver(() => jadwalkan());
    ro.observe(host);
    return () => ro.disconnect();
  }, [jadwalkan]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        // WAJIB reset, bukan hanya clear.
        //
        // BUG NYATA (fase 24.1): StrictMode dev mount -> unmount -> remount.
        // Tanpa baris ini, timer lama dibatalkan tapi `timerRef.current` masih
        // berisi id-nya, jadi `jadwalkan()` selamanya kena penjaga
        // `if (timerRef.current !== null) return` — sementara timer yang bisa
        // meresetnya sudah dibatalkan. Hasilnya `gambar()` TIDAK PERNAH
        // dipanggil sekali pun (minimapDebug.panggil tetap 0): canvas tetap
        // 300x150 default, jadi kolom kosong di kanan editor, walau kotak
        // viewport tetap bergerak (fungsi itu dipanggil langsung dari listener
        // scroll, tidak lewat timer).
        timerRef.current = null;
      }
    },
    [],
  );

  /** Klik / drag di minimap = lompat ke baris itu. */
  const lompat = (clientY: number) => {
    const host = hostRef.current;
    if (!host || !view) return;
    const rect = host.getBoundingClientRect();
    const doc = view.state.doc;
    const totalBaris = doc.lines;
    const langkah = totalBaris > MAX_BARIS ? Math.ceil(totalBaris / MAX_BARIS) : 1;
    const barisTampil = Math.ceil(totalBaris / langkah);
    const skala = Math.min(TINGGI_BARIS, rect.height / Math.max(barisTampil, 1));
    const baris = Math.min(
      Math.max(Math.round(((clientY - rect.top) / skala) * langkah) + 1, 1),
      totalBaris,
    );
    const pos = doc.line(baris).from;
    view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: 'center' }) });
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    lompat(e.clientY);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons === 1) lompat(e.clientY);
  };

  return (
    <div
      ref={hostRef}
      className="cm-minimap"
      data-testid="minimap"
      data-chars={renderCharacters ? '1' : '0'}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      role="presentation"
    >
      <canvas ref={canvasRef} data-testid="minimap-canvas" />
      <div
        className="cm-minimap-viewport"
        data-testid="minimap-viewport"
        style={{ transform: `translateY(${viewport.atas}px)`, height: `${viewport.tinggi}px` }}
      />
    </div>
  );
}
