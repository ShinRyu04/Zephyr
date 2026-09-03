// historyStore.ts — Local History / Timeline (fase 26).
//
// Pembagian tugas dengan Rust (history.rs):
//   Rust  : simpan/baca/pangkas snapshot di %APPDATA%\zephyr\history\<hash>\,
//           dedup lewat hash isi, tolak file besar/biner.
//   Store : kapan snapshot dibuat (hook save), penggabungan Timeline dengan
//           commit git, dan alur Restore yang TIDAK menulis ke disk.
//
// Keputusan penting: Restore mengisi buffer editor dan menandainya dirty.
// Ia TIDAK menulis file. Brief 26 tegas soal ini, dan alasannya masuk akal —
// "kembalikan ke versi lama" yang langsung menimpa disk adalah operasi
// merusak tanpa jalan mundur, sedangkan versi dirty masih bisa di-Ctrl+Z.

import { create } from 'zustand';
import {
  historySnapshot,
  historyList,
  historyRead,
  historyClear,
  historyPrune,
  historyStats,
  gitLog,
} from './commands';
import type { HistoryInfo, Snapshot, TimelineEntry } from './types';
import { kunciPath } from './pathKey';
import { useStore } from './store';
import { notifyError, notifyInfo, notifyWarn } from './notificationStore';

interface HistoryState {
  /** file yang Timeline-nya sedang ditampilkan */
  file: string | null;
  info: HistoryInfo | null;
  /** snapshot + commit git, urut terbaru dulu */
  timeline: TimelineEntry[];
  /** entri yang dipilih (untuk diff) */
  dipilih: string | null;
  /** isi snapshot terpilih — sisi KIRI diff */
  isiSnapshot: string | null;
  loading: boolean;
  error: string | null;
  /** statistik disk, diisi saat Settings dibuka */
  stats: { root: string; folder: number; snapshot: number; byte: number } | null;
}

interface HistoryActions {
  /** Muat Timeline sebuah file (snapshot + commit git). */
  muat: (file: string) => Promise<void>;
  /** Snapshot dipanggil dari jalur save; menghormati settings.history.enabled. */
  snapshotSave: (
    file: string,
    reason?: 'save' | 'before-rename' | 'manual' | 'before-restore',
  ) => Promise<string>;
  pilih: (id: string | null) => Promise<void>;
  /** Kembalikan isi snapshot ke buffer editor — DIRTY, tidak menulis disk. */
  restore: (id: string) => Promise<boolean>;
  bersihkan: (file?: string) => Promise<void>;
  pangkas: (file?: string) => Promise<number>;
  muatStats: () => Promise<void>;
  reset: () => void;
}

/** Gabungkan snapshot lokal + commit git jadi satu urutan waktu. */
const gabungTimeline = (
  snaps: Snapshot[],
  commits: { hash7: string; subject: string; author: string; date: string }[],
): TimelineEntry[] => {
  const out: TimelineEntry[] = snaps.map((s) => ({
    kind: 'snapshot' as const,
    id: s.id,
    timestampMs: s.timestampMs,
    label:
      s.reason === 'save'
        ? 'Disimpan'
        : s.reason === 'manual'
          ? 'Snapshot manual'
          : s.reason === 'before-rename'
            ? 'Sebelum rename'
            : 'Sebelum restore',
    detail: `${(s.size / 1024).toFixed(1)} KB`,
    reason: s.reason,
    size: s.size,
  }));

  for (const c of commits) {
    // `date` dari git berformat ISO (git_log memakai %cI).
    const t = Date.parse(c.date);
    out.push({
      kind: 'commit',
      id: c.hash7,
      timestampMs: Number.isNaN(t) ? 0 : t,
      label: c.subject,
      detail: `${c.hash7} · ${c.author}`,
    });
  }
  out.sort((a, b) => b.timestampMs - a.timestampMs);
  return out;
};

export const useHistory = create<HistoryState & HistoryActions>((set, get) => ({
  file: null,
  info: null,
  timeline: [],
  dipilih: null,
  isiSnapshot: null,
  loading: false,
  error: null,
  stats: null,

  muat: async (file) => {
    set({ loading: true, error: null, file });
    try {
      const info = await historyList(file);
      // Commit git ikut Timeline (integrasi fase 10). Kalau workspace bukan
      // repo, gitLog melempar — itu normal, bukan error yang perlu ditampilkan.
      let commits: Awaited<ReturnType<typeof gitLog>> = [];
      try {
        commits = await gitLog(30);
      } catch {
        commits = [];
      }
      set({
        info,
        timeline: gabungTimeline(info.snapshots, commits),
        loading: false,
      });
    } catch (e) {
      set({ loading: false, error: String(e), info: null, timeline: [] });
    }
  },

  snapshotSave: async (file, reason = 'save') => {
    const s = useStore.getState();
    const cfg = s.settings.history;
    if (!cfg?.enabled) return '';
    try {
      const r = await historySnapshot(file, reason, cfg.maxPerFile, cfg.maxDays);
      // Kalau Timeline file ini sedang terbuka, segarkan supaya entri baru
      // langsung terlihat tanpa user menekan refresh.
      if (r.id && get().file && kunciPath(get().file!) === kunciPath(file)) {
        void get().muat(file);
      }
      return r.id;
    } catch (e) {
      // Snapshot gagal TIDAK boleh menggagalkan save. Cukup beri tahu sekali.
      notifyWarn(`Local History gagal: ${String(e)}`, { source: 'history' });
      return '';
    }
  },

  pilih: async (id) => {
    if (!id) {
      set({ dipilih: null, isiSnapshot: null });
      return;
    }
    const file = get().file;
    const entri = get().timeline.find((t) => t.id === id);
    if (!file || !entri) return;
    if (entri.kind === 'commit') {
      // Commit dibuka lewat panel Source Control (fase 10) — Timeline tidak
      // menduplikasi diff git.
      set({ dipilih: id, isiSnapshot: null });
      return;
    }
    try {
      const isi = await historyRead(file, id);
      set({ dipilih: id, isiSnapshot: isi });
    } catch (e) {
      set({ error: String(e), isiSnapshot: null });
    }
  },

  restore: async (id) => {
    const file = get().file;
    if (!file) return false;
    try {
      const isi = await historyRead(file, id);
      // Simpan dulu keadaan SEKARANG sebagai snapshot: kalau tidak, restore
      // menghapus satu-satunya jejak versi terakhir bila user menekan save.
      await get().snapshotSave(file, 'before-restore');

      const S = useStore.getState();
      // `tab.path` bisa null (tab untitled) — bandingkan hanya yang punya path,
      // kalau tidak kunciPath(null) menabrak tipe dan menyamakan semua untitled.
      const cocok = (p: string | null) => !!p && kunciPath(p) === kunciPath(file);
      const tab = S.tabs.find((t) => cocok(t.path));
      if (!tab) {
        // File belum terbuka: buka dulu, baru isi buffer-nya.
        await S.openPath(file);
        const baru = useStore.getState().tabs.find((t) => cocok(t.path));
        if (!baru) {
          notifyError('Tidak bisa membuka file untuk restore', { source: 'history' });
          return false;
        }
        useStore.getState().updateTabContent(baru.id, isi);
      } else {
        useStore.getState().updateTabContent(tab.id, isi);
      }
      notifyInfo('Isi snapshot dimuat ke editor — belum disimpan (Ctrl+S untuk menulis)', {
        source: 'history',
      });
      return true;
    } catch (e) {
      notifyError(`Restore gagal: ${String(e)}`, { source: 'history' });
      return false;
    }
  },

  bersihkan: async (file) => {
    const f = file ?? get().file;
    if (!f) return;
    try {
      const n = await historyClear(f);
      notifyInfo(`${n} snapshot dihapus`, { source: 'history' });
      await get().muat(f);
    } catch (e) {
      set({ error: String(e) });
    }
  },

  pangkas: async (file) => {
    const f = file ?? get().file;
    if (!f) return 0;
    const cfg = useStore.getState().settings.history;
    try {
      const n = await historyPrune(f, cfg.maxPerFile, cfg.maxDays);
      if (n > 0) await get().muat(f);
      return n;
    } catch {
      return 0;
    }
  },

  muatStats: async () => {
    try {
      set({ stats: await historyStats() });
    } catch {
      set({ stats: null });
    }
  },

  reset: () => set({ file: null, info: null, timeline: [], dipilih: null, isiSnapshot: null }),
}));
