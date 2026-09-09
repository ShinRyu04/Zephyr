// extApprovalStore.ts — persetujuan izin runtime eksternal ekstensi (fase 34).
//
// Ketika worker ekstensi memanggil zephyr.exec() untuk runtime yang BELUM
// di-whitelist, extHost menaruh permintaan di sini → modal approval muncul →
// user memutuskan:
//   * Izinkan → grant (whitelist binary) ditulis ke settings.extensions.trust,
//     lalu promise `minta` resolve true dan eksekusi dilanjutkan.
//   * Tolak   → promise resolve false; worker dapat error "ditolak".
//
// Antrean (bukan satu slot) supaya beberapa ekstensi yang minta bersamaan
// tidak saling menimpa; modal menampilkan kepala antrean.

import { create } from 'zustand';
import { useStore } from './store';

export interface ExtApproval {
  extId: string;
  runtime: string;
  /** path binary hasil resolve yang akan di-whitelist */
  binPath: string;
  args: string[];
  cwd: string | null;
  /** dipanggil saat user memutuskan (true = izinkan & jalankan) */
  selesaikan: (setujui: boolean) => void;
}

interface ApprovalState {
  antrean: ExtApproval[];
}

interface ApprovalActions {
  /** Minta persetujuan; resolve true = user mengizinkan (grant ditulis). */
  minta: (p: Omit<ExtApproval, 'selesaikan'>) => Promise<boolean>;
  /** User menekan tombol di modal. */
  putuskan: (setujui: boolean) => Promise<void>;
}

export const useExtApproval = create<ApprovalState & ApprovalActions>((set, get) => ({
  antrean: [],

  minta: (p) =>
    new Promise<boolean>((resolve) => {
      set((s) => ({ antrean: [...s.antrean, { ...p, selesaikan: resolve }] }));
    }),

  putuskan: async (setujui) => {
    const kepala = get().antrean[0];
    if (!kepala) return;
    set((s) => ({ antrean: s.antrean.slice(1) }));

    if (setujui) {
      // Tulis grant (whitelist binary) ke settings dulu — Rust ext_exec
      // memeriksa dari sini. Gagal menulis = eksekusi tetap ditolak Rust.
      const trust = { ...(useStore.getState().settings.extensions.trust ?? {}) };
      const lama = trust[kepala.extId];
      trust[kepala.extId] = {
        runtimes: { ...(lama?.runtimes ?? {}), [kepala.runtime]: kepala.binPath },
        grantedAt: lama?.grantedAt ?? new Date().toISOString(),
      };
      const ok = await useStore
        .getState()
        .applySettings({ extensions: { trust } })
        .then(() => true)
        .catch(() => false);
      kepala.selesaikan(ok);
      return;
    }
    kepala.selesaikan(false);
  },
}));