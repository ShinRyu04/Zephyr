import { create } from 'zustand';
import * as cmd from './commands';
import type { CronJob } from './commands';
import { useStore } from './store';

/*
 * Scheduled commands.
 *
 * The Rust side has had `cron_create` / `cron_list` / `cron_toggle` since the
 * agent gained a scheduler tool, but the only way to reach them was to ask the
 * model to make one — there was no list to read, no switch to turn a job off,
 * and no way to delete one without knowing its id. This store is the missing
 * front end: a plain CRUD wrapper over those commands.
 *
 * Jobs run on the app's own timer in Rust; this store never schedules anything
 * itself, it only reads and writes the list.
 */

interface SchedState {
  /** Loaded jobs, newest first. */
  daftar: CronJob[];
  /** True while the first load is in flight. */
  memuat: boolean;
  /** Set when the last command failed; the panel shows it inline. */
  error: string | null;

  muat: () => Promise<void>;
  tambah: (opts: { name: string; command: string; everyMinutes: number; atHour?: number | null }) => Promise<boolean>;
  hapus: (id: string) => Promise<void>;
  balik: (id: string, enabled: boolean) => Promise<void>;
}

export const useSched = create<SchedState>((set, get) => ({
  daftar: [],
  memuat: false,
  error: null,

  muat: async () => {
    set({ memuat: true, error: null });
    try {
      const jobs = await cmd.cronList();
      /*
       * Soonest first.
       *
       * The useful question about a schedule is "what runs next", so an hourly
       * job belongs above a daily one. Jobs pinned to a clock hour sort by that
       * hour; the rest sort by interval.
       */
      const kunci = (j: CronJob) => (j.at_hour ?? 99) * 60 + j.every_minutes;
      set({ daftar: jobs.slice().sort((a, b) => kunci(a) - kunci(b)), memuat: false });
    } catch (e) {
      set({ memuat: false, error: cmd.asZephyrError(e).message });
    }
  },

  tambah: async (opts) => {
    set({ error: null });
    try {
      await cmd.cronCreate({
        name: opts.name.trim(),
        command: opts.command.trim(),
        everyMinutes: opts.everyMinutes,
        atHour: opts.atHour ?? undefined,
      });
      await get().muat();
      useStore.getState().setStatus(`scheduled "${opts.name.trim()}"`);
      return true;
    } catch (e) {
      set({ error: cmd.asZephyrError(e).message });
      return false;
    }
  },

  hapus: async (id) => {
    /* Optimistic: the row disappears at once, and a failure re-loads the real
       list rather than leaving the panel lying about what exists. */
    set((s) => ({ daftar: s.daftar.filter((j) => j.id !== id) }));
    try {
      await cmd.cronDelete(id);
    } catch (e) {
      set({ error: cmd.asZephyrError(e).message });
    }
    await get().muat();
  },

  balik: async (id, enabled) => {
    set((s) => ({ daftar: s.daftar.map((j) => (j.id === id ? { ...j, enabled } : j)) }));
    try {
      await cmd.cronToggle(id, enabled);
    } catch (e) {
      set({ error: cmd.asZephyrError(e).message });
    }
    await get().muat();
  },
}));

/*
 * Interval presets.
 *
 * A free number field invites 7 and 90, which the scheduler accepts but nobody
 * means; the presets are the intervals people actually schedule. The value is
 * minutes, matching `every_minutes`.
 */
export const INTERVAL = [15, 30, 60, 120, 360, 720, 1440] as const;


/*
 * Open/closed state lives in its own store.
 *
 * The panel is mounted once at the app root and opened from a header button, so
 * the flag cannot live in the panel's own useState — the caller has no way to
 * reach it. Keeping it here also means the list store stays free of UI state.
 */
interface SchedBuka {
  buka: boolean;
  setBuka: (v: boolean) => void;
  toggle: () => void;
}

export const useSchedBuka = create<SchedBuka>((set, get) => ({
  buka: false,
  setBuka: (v) => set({ buka: v }),
  toggle: () => set({ buka: !get().buka }),
}));
