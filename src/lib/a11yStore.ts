// a11yStore.ts — pengumuman screen reader + setelan aksesibilitas (fase 31).
//
// ══════════════════ KEPUTUSAN ARSITEKTUR ══════════════════
//
// 1. SATU live region untuk seluruh app, bukan satu per fitur.
//    Screen reader membacakan tiap region secara independen; tiga region
//    aktif sekaligus menghasilkan tumpang-tindih yang tidak bisa diikuti.
//    Toast (fase 27) tetap punya region sendiri karena isinya PERSISTEN dan
//    dibaca sebagai daftar — beda peran dari pengumuman sekali-jalan.
//
// 2. Pengumuman WAJIB berubah teksnya supaya dibacakan ulang.
//    Screen reader mengabaikan penulisan ulang teks yang identik. Pesan yang
//    sama dua kali (mis. "3 hasil" lalu "3 hasil") tidak akan terdengar kedua
//    kalinya — makanya ada penghitung tak terlihat di belakang pesan.
//
// 3. Setelan a11y disimpan di `settings.accessibility.*` mengikuti penamaan
//    VS Code, dan diterapkan ke ATRIBUT di <html> (bukan class) supaya CSS
//    bisa memakai selector `[data-reduced-motion='true']` yang mudah dibaca
//    dan mudah diperiksa dari harness.

import { create } from 'zustand';

/** Tingkat kesopanan pengumuman. */
export type Kesopanan = 'polite' | 'assertive';

interface A11yState {
  /** teks yang sedang berada di live region (polite) */
  pesan: string;
  /** teks di region assertive — untuk error yang harus memotong */
  pesanPenting: string;
  /** penghitung: dipakai memaksa DOM berubah walau teksnya sama */
  urutan: number;
  /** riwayat pengumuman (untuk verifikasi & debug; dibatasi 30) */
  riwayat: { teks: string; kesopanan: Kesopanan; at: number }[];
}

interface A11yActions {
  /** Umumkan sesuatu ke screen reader. */
  umumkan: (teks: string, kesopanan?: Kesopanan) => void;
  bersihkan: () => void;
}

export const MAX_RIWAYAT = 30;

export const useA11y = create<A11yState & A11yActions>((set, get) => ({
  pesan: '',
  pesanPenting: '',
  urutan: 0,
  riwayat: [],

  umumkan: (teks, kesopanan = 'polite') => {
    const bersih = String(teks ?? '').trim();
    if (!bersih) return;
    const n = get().urutan + 1;
    const riwayat = [
      ...get().riwayat,
      { teks: bersih, kesopanan, at: Date.now() },
    ].slice(-MAX_RIWAYAT);

    if (kesopanan === 'assertive') set({ pesanPenting: bersih, urutan: n, riwayat });
    else set({ pesan: bersih, urutan: n, riwayat });
  },

  bersihkan: () => set({ pesan: '', pesanPenting: '' }),
}));

/** Jalan pintas non-React (dipakai store lain yang bukan komponen). */
export const umumkan = (teks: string, kesopanan: Kesopanan = 'polite') =>
  useA11y.getState().umumkan(teks, kesopanan);

// ───────────────────── setelan → atribut <html> ─────────────────────

export interface AccessibilitySettings {
  /** matikan animasi & transisi di dalam app (di luar preferensi OS) */
  reducedMotion: boolean;
  /** mode screen reader: xterm SR-mode, CM6 tanpa virtualisasi, teks alt */
  screenReader: boolean;
  /** dialog & popup memindahkan fokus otomatis (VS Code: accessibility.opener) */
  autoFocusDialog: boolean;
  /** durasi minimum toast (ms) — screen reader butuh waktu membacakan */
  toastDurasiMin: number;
}

export const DEFAULT_A11Y: AccessibilitySettings = {
  reducedMotion: false,
  screenReader: false,
  autoFocusDialog: true,
  // 3200ms adalah durasi toast fase 27. Dengan screen reader, teks panjang
  // bisa belum selesai dibacakan sebelum toast hilang.
  toastDurasiMin: 3200,
};

/**
 * Terapkan setelan a11y ke <html>.
 *
 * Dipanggil dari jalur yang sama dengan `applyTheme()` (bootstrap,
 * applySettings, reloadSettings) — kalau hanya satu jalur, setelan tidak ikut
 * saat settings dimuat ulang dari disk (pelajaran fase 13 dengan retheme()).
 */
export function terapkanA11y(a: Partial<AccessibilitySettings> | undefined): AccessibilitySettings {
  const nilai: AccessibilitySettings = { ...DEFAULT_A11Y, ...(a ?? {}) };
  const root = document.documentElement;

  // Atribut, bukan class: selector CSS jadi eksplisit dan mudah dibaca dari
  // harness (`documentElement.dataset.reducedMotion`).
  if (nilai.reducedMotion) root.dataset.reducedMotion = 'true';
  else delete root.dataset.reducedMotion;

  if (nilai.screenReader) root.dataset.screenReader = 'true';
  else delete root.dataset.screenReader;

  return nilai;
}

/** Apakah OS meminta animasi dikurangi. */
export const osMintaReducedMotion = (): boolean => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

/**
 * Efektif = setelan app ATAU preferensi OS.
 *
 * OR, bukan hanya setelan app: kalau user sudah menyetel di Windows, Zephyr
 * tidak boleh memaksanya menyetel ulang di sini.
 */
export const reducedMotionEfektif = (a: Partial<AccessibilitySettings> | undefined): boolean =>
  !!a?.reducedMotion || osMintaReducedMotion();
