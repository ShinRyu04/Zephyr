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
import { tf, tx } from './i18n';

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
  /** tanggal rilis (pub_date dari latest.json, opsional ala TEDI) */
  pubDate: string | null;
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
  pubDate: null,
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
        pubDate: null,
        notes: null,
        progress: 0,
        message: tx('update.devMode'),
      });
      return;
    }
    set({ status: 'checking', message: null, progress: 0 });
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const upd = await check();
      if (!upd) {
        set({ status: 'up-to-date', message: tx('update.upToDate'), version: null });
        return;
      }
      updateObj = upd;
      const updAny = upd as { date?: string | null };
      set({
        status: 'available',
        version: upd.version,
        pubDate: updAny.date ?? null,
        notes: upd.body ?? null,
        dialogOpen: !opts?.senyap,
        message: null,
      });
      if (upd.version !== lastNotified) {
        lastNotified = upd.version;
        // Lonceng cukup menampilkan ringkasan 1 baris — changelog lengkap
        // ada di dialog (klik "Lihat & pasang"), bukan wall-of-text di toast.
        const ringkas = (upd.body ?? '')
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l && !/^#/.test(l))
          .slice(0, 3)
          .join(' · ')
          .replace(/\*\*/g, '')
          .slice(0, 220);
        useNotif.getState().notify({
          severity: 'info',
          message: tf('update.available', { v: upd.version }),
          detail: ringkas || undefined,
          source: 'update',
          actions: [{ label: tx('update.viewInstall'), command: 'help.checkUpdates' }],
        });
      }
    } catch (e) {
      const pesan = e instanceof Error ? e.message : String(e);
      if (belumDikonfigurasi(pesan)) {
        set({
          status: 'unconfigured',
          message: tx('update.unconfigured'),
        });
        return;
      }
      set({
        status: opts?.senyap ? 'idle' : 'error',
        message: opts?.senyap ? null : tf('update.checkFailed', { e: pesan }),
      });
    }
  },

  unduhDanPasang: async () => {
    const upd = updateObj as
      | { downloadAndInstall: (cb: (ev: unknown) => void) => Promise<void> }
      | null;
    if (!upd) {
      set({ status: 'error', message: tx('update.nothingToDownload') });
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
        message: tx('update.installed'),
      });
      notifyInfo(tx('update.installed'), {
        source: 'update',
      });
      const notes = get().notes ?? '';
      void cmd.setSettings({ update: { pendingNotes: notes } }).catch(() => {});
    } catch (e) {
      const pesan = e instanceof Error ? e.message : String(e);
      set({ status: 'error', message: tf('update.installFailed', { e: pesan }) });
    }
  },

  restart: async () => {
    try {
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch (e) {
      set({ message: tf('update.restartFailed', { e: String(e) }) });
    }
  },

  tutupDialog: () => set({ dialogOpen: false }),
  reset: () => set({ status: 'idle', version: null, pubDate: null, notes: null, progress: 0, message: null }),
}));

export function labelStatus(s: UpdateStatus, versi: string | null, progress: number): string {
  switch (s) {
    case 'checking':
      return tx('update.checking');
    case 'available':
      return tf('update.updateTo', { v: versi ?? '?' });
    case 'downloading':
      return tf('update.downloading', { p: progress });
    case 'ready':
      return tx('update.restartToInstall');
    case 'up-to-date':
      return tx('update.upToDate');
    case 'unconfigured':
      return tx('update.unconfigured');
    case 'error':
      return tx('update.retry');
    default:
      return tx('update.check');
  }
}
