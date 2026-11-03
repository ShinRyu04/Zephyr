import { create } from 'zustand';
import * as cmd from './commands';
import { notifyInfo } from './notificationStore';
import { invoke } from '@tauri-apps/api/core';
import { tf, tx, translate } from './i18n';
import { useStore } from './store';

// The updater hands us one `notes` string, but the release is published in
// every UI language. The Tauri plugin also passes the parsed latest.json entry
// as `rawJson`, so when that entry carries a per-language `notes` object we
// pick the one matching uiLang. Falls back to the plugin's plain body, then to
// English, then to the first language present.
function notesUntukBahasa(
  body: string | null | undefined,
  raw: Record<string, unknown> | null | undefined,
): string | null {
  const lang = useStore.getState().settings?.general?.uiLang ?? 'en';
  const n = raw?.notes;
  if (n && typeof n === 'object') {
    const t = n as Record<string, string>;
    const pilih = t[lang] ?? t.en ?? Object.values(t)[0];
    if (pilih) return pilih;
  }
  if (typeof n === 'string' && n) return translate(lang, n);
  return body ? translate(lang, body) : null;
}

/*
 * Plain English for now; a separate worker owns the translations, so this must
 * stay a normal UI status message rather than a key that does not exist yet.
 */
/*
 * Endpoint updater — SAMA dengan plugins.updater.endpoints di tauri.conf.json.
 * Jalur PORTABLE tidak memakai plugin updater (installer NSIS bukan untuk
 * portable), jadi ia membaca latest.json sendiri dan mencari field "portable":
 *   { "version": ..., "platforms": {...}, "portable": { "url", "sha256" } }
 * Field itu diisi scripts/buat-latest-json.mjs saat rilis. Berkas penanda
 * "portable" di sebelah exe yang menentukan jalur mana yang dipakai.
 */
const PORTABLE_ENDPOINT =
  'https://github.com/ShinRyu04/Zephyr/releases/latest/download/latest.json';

/** Info unduhan portable dari field "portable" latest.json. */
interface PortableRilis { url: string; sha256: string; versi: string }

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

  version: string | null;

  pubDate: string | null;

  notes: string | null;

  progress: number;

  message: string | null;

  dialogOpen: boolean;

  /** Unduhan portable yang tersedia (dari field "portable" latest.json). */
  portableRilis: PortableRilis | null;
}

interface UpdaterActions {
  check: (opts?: { senyap?: boolean }) => Promise<void>;
  unduhDanPasang: () => Promise<void>;
  restart: () => Promise<void>;
  tutupDialog: () => void;
  reset: () => void;
}

let updateObj: unknown = null;

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

  /** Unduhan portable yang tersedia (dari field "portable" latest.json). */
  portableRilis: null,

  check: async (opts) => {
    if (get().status === 'checking' || get().status === 'downloading') return;

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
    /*
     * JALUR QUICK-SWAP (portable DAN install): baca latest.json langsung dan
     * ambil field "portable" (url + sha256). Kalau ada, update = unduh exe,
     * keluar, timpa satu file, nyala lagi - tanpa installer (Terax-style).
     * Tidak ada field-nya, atau unduhan gagal nanti → jalur NSIS senyap di
     * bawah tetap jadi fallback untuk salinan install.
     */
    const info = await cmd.getAppInfo().catch(() => null);
    if (info) {
      try {
        const res = await fetch(PORTABLE_ENDPOINT, { cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        const latest = (await res.json()) as {
          version?: string;
          portable?: { url?: string; sha256?: string };
        };
        const baru = latest.version ?? '';
        const p = latest.portable;
        if (!baru || !p?.url || !p?.sha256) {
          if (info.portable) {
            // Portable tidak punya jalur lain: tanpa field "portable" berarti
            // rilis itu tidak menyediakan exe portable.
            set({ status: 'up-to-date', message: tx('update.upToDate'), version: null, portableRilis: null });
            return;
          }
          // Salinan install: lanjut ke plugin updater (NSIS) di bawah.
        } else if (baru === info.version) {
          set({ status: 'up-to-date', message: tx('update.upToDate'), version: null, portableRilis: null });
          return;
        } else {
          set({
            status: 'available',
            version: baru,
            pubDate: null,
            notes: null,
            dialogOpen: !opts?.senyap,
            message: null,
            portableRilis: { url: p.url, sha256: p.sha256, versi: baru },
          });
          return;
        }
      } catch (e) {
        if (info.portable) {
          // Portable tanpa jalur lain juga.
          set({
            status: opts?.senyap ? 'idle' : 'error',
            message: opts?.senyap ? null : tf('update.checkFailed', { e: String(e) }),
          });
          return;
        }
        // Salinan install: gagal baca latest.json → biarkan plugin updater mencoba.
      }
    }
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const upd = await check();
      if (!upd) {
        set({ status: 'up-to-date', message: tx('update.upToDate'), version: null });
        return;
      }
      updateObj = upd;
      // `rawJson` is the parsed latest.json entry, but the plugin's TypeScript
      // types describe it as a string. Read it through `unknown` so the cast is
      // honest, and normalise whatever arrives into a plain object before the
      // per-language notes lookup touches it.
      const rawAny = (upd as unknown as { rawJson?: unknown }).rawJson;
      const rawObj =
        rawAny && typeof rawAny === 'object' ? (rawAny as Record<string, unknown>) : null;
      const updAny = upd as unknown as { date?: string | null };
      set({
        status: 'available',
        version: upd.version,
        pubDate: updAny.date ?? null,
        notes: notesUntukBahasa(upd.body, rawObj),
        dialogOpen: !opts?.senyap,
        message: null,
      });
      /*
       * No bell notification for an available update.
       *
       * The title-bar Update button (UpdateBtn) is now the single door to an
       * available release — a VSCode-style badge that stays visible until the
       * user acts on it. A corner toast on top of it was the same news twice,
       * and it is the one that interrupts. The bell stays reserved for errors
       * and the "installed" confirmation below.
       */
    } catch (e) {
      // An error from a Tauri invoke is shaped { code, message }, not Error.
      const pesan = cmd.asZephyrError(e).message;
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
    const info = await cmd.getAppInfo().catch(() => null);

    /*
     * JALUR QUICK-SWAP: dipilih kalau check() menemukan field "portable" di
     * latest.json - portable maupun install sama-sama lewat sini. Unduh exe
     * baru (sha256 diverifikasi Rust), lalu siapkan skrip swap dengan BACKUP:
     * move gagal -> exe lama dipulihkan dan Zephyr tetap menyala.
     */
    if (info?.portable || get().portableRilis) {
      const rilis = get().portableRilis;
      if (!rilis) {
        set({ status: 'error', message: tx('update.nothingToDownload'), progress: 0 });
        return;
      }
      set({ status: 'downloading', progress: 0, dialogOpen: false, message: null });
      try {
        const { listen } = await import('@tauri-apps/api/event');
        const lepas = await listen<{ persen?: number | null }>(
          'portable-update-progress',
          (ev) => {
            const p = ev.payload?.persen ?? null;
            if (p !== null) set({ progress: p });
          },
        );
        await invoke('quick_swap_unduh', { url: rilis.url, sha256Hex: rilis.sha256 });
        lepas();
        set({ status: 'ready', progress: 100, message: tx('update.restartToInstall') });
        notifyInfo(tx('update.installed'), { source: 'update' });
      } catch (e) {
        set({ status: 'error', message: tf('update.installFailed', { e: cmd.asZephyrError(e).message }) });
      }
      return;
    }

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
      // An error from a Tauri invoke is shaped { code, message }, not Error.
      const pesan = cmd.asZephyrError(e).message;
      set({ status: 'error', message: tf('update.installFailed', { e: pesan }) });
    }
  },

  restart: async () => {
    /* Quick-swap (portable atau install dengan unduhan quick-swap): tulis
       skrip swap (backup + timpa exe saat keluar) lalu keluar; skrip
       menyalakan Zephyr versi baru sendiri. */
    const info = await cmd.getAppInfo().catch(() => null);
    if (info?.portable || get().portableRilis) {
      try {
        await invoke('quick_swap_siapkan');
        const { exit } = await import('@tauri-apps/plugin-process');
        await exit(0);
      } catch (e) {
        set({ message: tf('update.restartFailed', { e: cmd.asZephyrError(e).message }) });
      }
      return;
    }
    try {
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch (e) {
      set({ message: tf('update.restartFailed', { e: cmd.asZephyrError(e).message }) });
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
