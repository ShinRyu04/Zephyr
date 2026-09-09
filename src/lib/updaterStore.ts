// updaterStore.ts — auto-update dalam app (fase 17.6).
//
// Endpoint rilis AKTIF (GitHub Releases → latest.json, lihat tauri.conf.json),
// jadi alur lengkap bisa diuji langsung dari app:
//   idle → checking → available(versi) → downloading(%) → ready → (restart)
//   idle → checking → up-to-date
//   idle → checking → error (jaringan / endpoint mati)
//
// Status 'unconfigured' masih ada sebagai penjaga lama: kalau endpoint kosong
// suatu saat, `check()` gagal dan diterjemahkan jadi pesan jelas, BUKAN crash
// atau toast error berulang (syarat 17.6.e).

import { create } from 'zustand';
import * as cmd from './commands';
import { notifyInfo, useNotif } from './notificationStore';

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

let lastNotified = '';

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
    // Cek update cuma untuk build RELEASE. Di mode dev (`tauri dev` /
    // `npm run dev`) plugin updater ikut jalan, tapi installernya untuk
    // build release — dipasang di atas build dev cuma bikin kacau. Skip
    // penuh; panel Tetap kasih tahu kenapa.
    if (import.meta.env.DEV) {
      set({
        status: 'idle',
        version: null,
        notes: null,
        progress: 0,
        message: 'Mode dev — cek update dinonaktifkan',
      });
      return;
    }
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
      if (upd.version !== lastNotified) {
        lastNotified = upd.version;
        useNotif.getState().notify({
          severity: 'info',
          message: `Zephyr v${upd.version} tersedia`,
          detail: upd.body ?? undefined,
          source: 'update',
          actions: [{ label: 'Lihat & pasang', command: 'help.checkUpdates' }],
        });
      }
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
      notifyInfo('Update terpasang — restart Zephyr untuk memakainya', {
        source: 'update',
      });
      const notes = get().notes ?? '';
      void cmd.setSettings({ update: { pendingNotes: notes } }).catch(() => {});
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
