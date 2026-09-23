// layoutStore.ts — Customize Layout (kontrol visibilitas tata letak).
//
// KENAPA store terpisah dari `store.ts`: tata letak adalah preferensi TAMPILAN
// yang berubah cepat (buka/tutup panel sana-sini) dan tidak berhubungan dengan
// isi dokumen. Menaruhnya di store utama berarti setiap toggle memicu render
// ulang seluruh pohon editor.
//
// YANG DIKONTROL (mengikuti VS Code "Customize Layout"):
//   Menu Bar · Activity Bar · Primary Side Bar · Panel · Status Bar
//   + posisi side bar (kiri/kanan), posisi panel, kerapatan, mode (zen/fullscreen)
//
// SEMUA pilihan disimpan ke settings lewat `applySettings` supaya tidak hilang
// saat app ditutup — tata letak yang selalu kembali ke default itu menjengkelkan.

import { create } from 'zustand';

/** Posisi side bar utama. */
export type PosisiSidebar = 'left' | 'right';

/** Kerapatan tata letak. */
export type KerapatanLayout = 'default' | 'compact';

interface LayoutState {
  // ── Visibilitas (semua bisa dimatikan sendiri-sendiri) ──
  menuBar: boolean;
  activityBar: boolean;
  sidebar: boolean;
  panel: boolean;
  statusBar: boolean;

  // ── Posisi & tampilan ──
  posisiSidebar: PosisiSidebar;
  kerapatan: KerapatanLayout;

  /**
   * Panel Customize Layout sedang terbuka.
   *
   * KENAPA di store, bukan state lokal komponen: panel ini yang dipakai untuk
   * MENYALAKAN KEMBALI elemen yang dimatikan. Kalau state-nya lokal di MenuBar,
   * mematikan Menu Bar menghilangkan satu-satunya tombol pembukanya — user
   * terjebak tanpa Menu Bar dan harus menghapus settings.json manual.
   */
  menuBuka: boolean;
  setMenuBuka: (v: boolean) => void;

  /**
   * Panel info Subagent di sebelah KANAN chat AI.
   *
   * KENAPA di store, bukan state lokal: posisinya bagian dari tata letak yang
   * disimpan. Kalau lokal, tiap kali app dibuka ulang user harus membukanya
   * lagi — dan panel yang tidak diminta muncul sendiri juga mengganggu.
   */
  subKanan: boolean;
  setSubKanan: (v: boolean) => void;

  // ── Aksi ──
  set: (bagian: Partial<LayoutState>) => void;
  toggle: (kunci: 'menuBar' | 'activityBar' | 'sidebar' | 'panel' | 'statusBar') => void;
  /** Kembalikan semua ke default (semua terlihat, sidebar kiri). */
  reset: () => void;
  /** Simpan ke settings (dipanggil setelah perubahan). */
  simpan: () => Promise<void>;
  /** Muat dari settings saat app start. */
  muat: () => Promise<void>;
}

const DEFAULT = {
  menuBar: true,
  activityBar: true,
  sidebar: true,
  panel: true,
  statusBar: true,
  posisiSidebar: 'left' as PosisiSidebar,
  kerapatan: 'default' as KerapatanLayout,
  menuBuka: false,
  // Default TERTUTUP: panel ini informasi tambahan, bukan kebutuhan semua
  // orang. Yang mau, buka sekali lewat Customize Layout atau Settings.
  subKanan: false,
};

export const useLayoutCustom = create<LayoutState>((set, get) => ({
  ...DEFAULT,

  set: (bagian) => set(bagian as never),

  setMenuBuka: (v) => set({ menuBuka: v }),

  setSubKanan: (v) => set({ subKanan: v }),

  toggle: (kunci) => set({ [kunci]: !get()[kunci] } as never),

  reset: () => set({ ...DEFAULT }),

  simpan: async () => {
    const s = get();
    const { useStore } = await import('./store');
    await useStore.getState().applySettings({
      general: {
        layout: {
          menuBar: s.menuBar,
          activityBar: s.activityBar,
          sidebar: s.sidebar,
          panel: s.panel,
          statusBar: s.statusBar,
          posisiSidebar: s.posisiSidebar,
          kerapatan: s.kerapatan,
          subKanan: s.subKanan,
        },
      },
    } as never);
  },

  muat: async () => {
    const { useStore } = await import('./store');
    const g = (useStore.getState().settings.general ?? {}) as unknown as Record<string, unknown>;
    const l = (g.layout ?? {}) as Partial<typeof DEFAULT>;
    set({
      menuBar: l.menuBar ?? DEFAULT.menuBar,
      activityBar: l.activityBar ?? DEFAULT.activityBar,
      sidebar: l.sidebar ?? DEFAULT.sidebar,
      panel: l.panel ?? DEFAULT.panel,
      statusBar: l.statusBar ?? DEFAULT.statusBar,
      posisiSidebar: l.posisiSidebar ?? DEFAULT.posisiSidebar,
      kerapatan: l.kerapatan ?? DEFAULT.kerapatan,
      subKanan: l.subKanan ?? DEFAULT.subKanan,
    });
  },
}));

/** Daftar baris untuk panel Customize Layout (dipakai UI + harness). */
export const BARIS_LAYOUT: {
  kunci: 'menuBar' | 'activityBar' | 'sidebar' | 'panel' | 'statusBar';
  label: string;
  shortcut?: string;
}[] = [
  { kunci: 'menuBar', label: 'Menu Bar' },
  { kunci: 'activityBar', label: 'Activity Bar' },
  { kunci: 'sidebar', label: 'Primary Side Bar', shortcut: 'Ctrl+B' },
  { kunci: 'panel', label: 'Panel', shortcut: 'Ctrl+J' },
  { kunci: 'statusBar', label: 'Status Bar' },
];
