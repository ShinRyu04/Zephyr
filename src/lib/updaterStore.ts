// updaterStore.ts — auto-update dalam app (fase 17.6).
//
// KONDISI SEKARANG: `plugins.updater.endpoints` di tauri.conf.json KOSONG
// karena belum ada hosting. Itu bukan bug — semua kode di sini harus tetap
// aman: `check()` akan gagal, dan kegagalan itu diterjemahkan menjadi status
// 'unconfigured' dengan pesan yang jelas, BUKAN crash atau toast error
// berulang (syarat 17.6.e).
//
// Alur lengkap saat endpoint sudah diisi:
//   idle → checking → available(versi) → downloading(%) → ready → (restart)
//   idle → checking → up-to-date
//   idle → checking → unconfigured | error

import { create } from 'zustand';
import * as cmd from './commands';
import { notifyInfo } from './notificationStore';

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'up-to-date'
  | 'unconfigured'
  | 'error';

interface UpdaterState {
  status: UpdateStatus;
  /** versi yang tersedia (kalau ada) */
  version: string | null;
  /** catatan rilis dari latest.json */
  notes: string | null;
  /** persen unduhan 0..100 (hanya saat downloading) */
  progress: number;
  /** pesan untuk ditampilkan (error / info) */
  message: string | null;
  /** dialog "versi baru tersedia" terbuka */
  dialogOpen: boolean;
}

interface UpdaterActions {
  check: (opts?: { senyap?: boolean }) => Promise<void>;
  unduhDanPasang: () => Promise<void>;
  restart: () => Promise<void>;
  tutupDialog: () => void;
  reset: () => void;
}

/** Objek Update dari plugin, disimpan di luar store (bukan data serializable). */
let updateObj: unknown = null;

/** true = pesan kegagalan ini berarti "endpoint belum dikonfigurasi", bukan
 *  masalah jaringan. Plugin melaporkannya sebagai error biasa, jadi kita
 *  kenali dari isinya. */
function belumDikonfigurasi(pesan: string): boolean {
  const p = pesan.toLowerCase();
  return (
    p.includes('empty') ||
    p.includes('no endpoint') ||
    p.includes('endpoints') ||
    p.includes('invalid url') ||
    p.includes('relative url') ||
    p.includes('builder error')
  );
}

export const useUpdater = create<UpdaterState & UpdaterActions>((set, get) => ({
  status: 'idle',
  version: null,
  notes: null,
  progress: 0,
  message: null,
  dialogOpen: false,

  /** `senyap` = dipanggil otomatis saat startup: kegagalan TIDAK ditampilkan
   *  sebagai error (syarat 17.6.e — jangan spam toast saat offline). */
  check: async (opts) => {
    if (get().status === 'checking' || get().status === 'downloading') return;
    set({ status: 'checking', message: null, progress: 0 });
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const upd = await check();
      if (!upd) {
        set({ status: 'up-to-date', message: 'Zephyr sudah versi terbaru', version: null });
        return;
      }
      updateObj = upd;
      set({
        status: 'available',
        version: upd.version,
        notes: upd.body ?? null,
        dialogOpen: !opts?.senyap,
        message: null,
      });
    } catch (e) {
      const pesan = e instanceof Error ? e.message : String(e);
      if (belumDikonfigurasi(pesan)) {
        set({
          status: 'unconfigured',
          message: 'Update belum dikonfigurasi (endpoint rilis belum diisi)',
        });
        return;
      }
      set({
        status: opts?.senyap ? 'idle' : 'error',
        message: opts?.senyap ? null : `Gagal memeriksa update: ${pesan}`,
      });
    }
  },

  unduhDanPasang: async () => {
    const upd = updateObj as
      | { downloadAndInstall: (cb: (ev: unknown) => void) => Promise<void> }
      | null;
    if (!upd) {
      set({ status: 'error', message: 'Tidak ada update yang siap diunduh' });
      return;
    }
    set({ status: 'downloading', progress: 0, dialogOpen: false, message: null });
    let total = 0;
    let terunduh = 0;
    try {
      await upd.downloadAndInstall((ev) => {
        const e = ev as { event: string; data?: { contentLength?: number; chunkLength?: number } };
        if (e.event === 'Started') {
          total = e.data?.contentLength ?? 0;
          terunduh = 0;
        } else if (e.event === 'Progress') {
          terunduh += e.data?.chunkLength ?? 0;
          const p = total > 0 ? Math.min(100, Math.round((terunduh / total) * 100)) : 0;
          set({ progress: p });
        } else if (e.event === 'Finished') {
          set({ progress: 100 });
        }
      });
      set({
        status: 'ready',
        message: 'Update terpasang — restart Zephyr untuk memakainya',
      });
      // fase 33: pemberitahuan update selesai lewat toast + Notification
      // Center, dan catatan rilis disimpan ke settings supaya banner
      // "Zephyr diperbarui ke vX" muncul setelah restart (lihat store.ts).
      notifyInfo('Update terpasang — restart Zephyr untuk memakainya', {
        source: 'update',
      });
      const notes = get().notes ?? '';
      void cmd.setSettings({ update: { pendingNotes: notes } }).catch(() => {
        /* non-fatal */
      });
    } catch (e) {
      const pesan = e instanceof Error ? e.message : String(e);
      set({ status: 'error', message: `Gagal memasang update: ${pesan}` });
    }
  },

  restart: async () => {
    try {
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch (e) {
      set({ message: `Tidak bisa restart otomatis: ${e}` });
    }
  },

  tutupDialog: () => set({ dialogOpen: false }),
  reset: () => set({ status: 'idle', version: null, notes: null, progress: 0, message: null }),
}));

/** Label tombol per status (dipakai Settings → Tentang & nanti MenuBar). */
export function labelStatus(s: UpdateStatus, versi: string | null, progress: number): string {
  switch (s) {
    case 'checking':
      return 'Memeriksa…';
    case 'available':
      return `Update ke v${versi ?? '?'}`;
    case 'downloading':
      return `Mengunduh ${progress}%`;
    case 'ready':
      return 'Restart untuk memasang';
    case 'up-to-date':
      return 'Sudah terbaru';
    case 'unconfigured':
      return 'Update belum dikonfigurasi';
    case 'error':
      return 'Coba lagi';
    default:
      return 'Cek update';
  }
}
