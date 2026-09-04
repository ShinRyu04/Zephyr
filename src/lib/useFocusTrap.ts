// useFocusTrap.ts — kurung fokus di dalam dialog (fase 31).
//
// ══════════════════ KEPUTOSAN ══════════════════
//
// Satu hook untuk SEMUA dialog. Audit fase 31 menemukan 10 komponen dengan
// `role="dialog"` + `aria-modal="true"` tapi NOL penanganan Tab — artinya
// pengguna keyboard bisa Tab keluar dari dialog ke UI di belakangnya yang
// secara semantik sudah dinyatakan tidak tersedia. `aria-modal` hanya
// memberitahu screen reader; ia tidak mengurung fokus.
//
// Tidak memakai library (focus-trap ~8KB): yang dibutuhkan hanya query
// elemen fokusabel + dua cabang Tab/Shift+Tab. Menambah dependensi untuk 40
// baris tidak sebanding, dan `inert` belum bisa dipakai karena dialog Zephyr
// bukan <dialog> native (backdrop-nya div, pola fase 02).

import { useEffect, useRef } from 'react';

/** Selector elemen yang bisa menerima fokus keyboard. */
const FOKUSABEL = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function daftarFokusabel(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOKUSABEL)].filter((el) => {
    // Elemen tersembunyi tetap cocok dengan selector tapi tidak bisa difokus;
    // memasukkannya membuat Tab "hilang" satu langkah.
    if (el.hasAttribute('aria-hidden')) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 || r.height > 0;
  });
}

export interface OpsiFocusTrap {
  /** trap hanya aktif saat true */
  aktif: boolean;
  /** dipanggil saat Escape ditekan (opsional — banyak dialog sudah punya) */
  onEscape?: () => void;
  /** fokus otomatis ke elemen pertama saat dibuka (default true) */
  fokusOtomatis?: boolean;
}

/**
 * Kurung fokus di dalam sebuah container.
 *
 * Mengembalikan ref yang harus dipasang ke elemen dialog (BUKAN backdrop —
 * backdrop memuat dialog, dan mengurung di backdrop berarti Tab bisa mendarat
 * di area kosong di sekitarnya).
 */
export function useFocusTrap<T extends HTMLElement = HTMLDivElement>({
  aktif,
  onEscape,
  fokusOtomatis = true,
}: OpsiFocusTrap) {
  const ref = useRef<T | null>(null);
  // Elemen yang tadinya fokus, supaya bisa dikembalikan saat dialog tutup.
  // Tanpa ini fokus jatuh ke <body> dan pengguna keyboard kehilangan posisi.
  const sebelumnya = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!aktif) return;
    const el = ref.current;
    if (!el) return;

    sebelumnya.current = document.activeElement as HTMLElement | null;

    if (fokusOtomatis) {
      const daftar = daftarFokusabel(el);
      // Elemen dengan `autofocus` menang; kalau tidak, yang pertama.
      const target = daftar.find((x) => x.hasAttribute('autofocus')) ?? daftar[0] ?? el;
      // rAF: dialog baru saja dirender, ukurannya belum tentu final —
      // `focus()` pada elemen 0×0 di WebView2 tidak menghasilkan apa pun.
      requestAnimationFrame(() => target.focus());
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onEscape) {
        e.preventDefault();
        onEscape();
        return;
      }
      if (e.key !== 'Tab') return;

      const daftar = daftarFokusabel(el);
      if (daftar.length === 0) {
        // Dialog tanpa kontrol fokusabel: tahan Tab supaya tidak lolos keluar.
        e.preventDefault();
        return;
      }
      const pertama = daftar[0];
      const terakhir = daftar[daftar.length - 1];
      const aktifSekarang = document.activeElement as HTMLElement | null;

      // Fokus di luar dialog (mis. baru dibuka lewat klik) → tarik masuk.
      if (!aktifSekarang || !el.contains(aktifSekarang)) {
        e.preventDefault();
        (e.shiftKey ? terakhir : pertama).focus();
        return;
      }

      if (e.shiftKey && aktifSekarang === pertama) {
        e.preventDefault();
        terakhir.focus();
      } else if (!e.shiftKey && aktifSekarang === terakhir) {
        e.preventDefault();
        pertama.focus();
      }
    };

    // `capture: true` supaya trap jalan sebelum handler komponen lain
    // menelan Tab (mis. keymap CodeMirror saat editor masih memegang fokus).
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      const balik = sebelumnya.current;
      // Kembalikan fokus HANYA kalau elemennya masih ada di DOM — tab yang
      // ditutup oleh dialog itu sendiri sudah hilang.
      if (balik && document.contains(balik)) balik.focus();
    };
  }, [aktif, onEscape, fokusOtomatis]);

  return ref;
}
