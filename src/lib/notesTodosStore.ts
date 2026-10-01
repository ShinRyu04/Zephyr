import { create } from 'zustand';
import { useStore } from './store';

/*
 * Notes and todos, for the floating panel in the title bar.
 *
 * The panel holds three things that share one shape: a short line of text the
 * user wrote, with a done flag, a pin, and a time. They differ only in what
 * they are for, so they live in one store with a `kind` discriminator rather
 * than three near-identical stores.
 *
 *   schedule  a command to run on a timer — owned by `schedStore`, shown here
 *             through the same tab strip so the panel has one entry point
 *   notes     free text kept until deleted; pinned notes sort first
 *   todos     short tasks with a done flag; pinned and unfinished sort first
 *
 * Persistence goes through `settings.notesTodos` so the list survives a
 * restart and travels with the rest of the user's settings.
 */

export type Kind = 'notes' | 'todos';

export interface Item {
  id: string;
  kind: Kind;
  teks: string;
  /** Todos only: struck through and sorted last when true. */
  selesai: boolean;
  /** Pinned items sort above the rest, whatever their kind. */
  pin: boolean;
  at: number;
}

interface NotesTodosState {
  items: Item[];
  /** Which tab the panel shows. */
  tab: 'schedule' | 'notes' | 'todos';
  /** Filter text, shared by the notes and todos tabs. */
  cari: string;
  /** Whether the panel stays open when focus leaves it. */
  pinPanel: boolean;

  setTab: (t: NotesTodosState['tab']) => void;
  setCari: (v: string) => void;
  setPinPanel: (v: boolean) => void;

  tambah: (kind: Kind, teks: string) => void;
  /** Toggle done. Notes have no done state, so this is a no-op for them. */
  balikSelesai: (id: string) => void;
  balikPin: (id: string) => void;
  ubah: (id: string, teks: string) => void;
  hapus: (id: string) => void;
  bersihSelesai: () => void;
  /** Hydrate from settings, once. */
  dari: (items: Item[] | undefined) => void;
}

function idBaru(): string {
  return `nt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/*
 * Sort order, applied on every read rather than on write.
 *
 * Pinning a note should move it immediately, and un-pinning should let it fall
 * back into time order — doing that at render time keeps both directions
 * trivial and avoids a second write to settings per toggle.
 *
 * Pinned first, then by kind: unfinished todos before finished ones, notes in
 * time order. Within a group the newest is on top, because that is the one the
 * user just wrote.
 */
export function urutkan(items: Item[]): Item[] {
  return items.slice().sort((a, b) => {
    if (a.pin !== b.pin) return a.pin ? -1 : 1;
    if (a.kind !== b.kind) return a.kind === 'todos' ? -1 : 1;
    if (a.selesai !== b.selesai) return a.selesai ? 1 : -1;
    return b.at - a.at;
  });
}

export const useNotesTodos = create<NotesTodosState>((set, get) => {
  /*
   * Persist through the settings store, debounced.
   *
   * Typing in a note fires on every keystroke; writing the whole settings file
   * that often would thrash the disk and the IPC channel. One timer per burst
   * is enough, and the flush below runs on hide so nothing is lost.
   */
  let timer: number | null = null;
  const simpan = (items: Item[]) => {
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = null;
      void useStore
        .getState()
        .applySettings({ notesTodos: items } as never)
        .catch(() => useStore.getState().setStatus('could not save notes and todos'));
    }, 400);
  };

  const ubahItem = (id: string, fn: (i: Item) => Item) => {
    const next = get().items.map((i) => (i.id === id ? fn(i) : i));
    set({ items: next });
    simpan(next);
  };

  return {
    items: [],
    tab: 'todos',
    cari: '',
    pinPanel: false,

    setTab: (t) => set({ tab: t }),
    setCari: (v) => set({ cari: v }),
    setPinPanel: (v) => set({ pinPanel: v }),

    tambah: (kind, teks) => {
      const bersih = teks.trim();
      if (!bersih) return;
      const next = [
        ...get().items,
        { id: idBaru(), kind, teks: bersih, selesai: false, pin: false, at: Date.now() },
      ];
      set({ items: next });
      simpan(next);
    },

    balikSelesai: (id) =>
      ubahItem(id, (i) => (i.kind === 'todos' ? { ...i, selesai: !i.selesai } : i)),

    balikPin: (id) => ubahItem(id, (i) => ({ ...i, pin: !i.pin })),

    ubah: (id, teks) => ubahItem(id, (i) => ({ ...i, teks })),

    hapus: (id) => {
      const next = get().items.filter((i) => i.id !== id);
      set({ items: next });
      simpan(next);
    },

    bersihSelesai: () => {
      const next = get().items.filter((i) => !(i.kind === 'todos' && i.selesai));
      set({ items: next });
      simpan(next);
    },

    /*
     * An empty stored list means "nothing was ever saved", not "delete
     * everything" — a fresh profile must start empty, and a profile that had
     * items must not be wiped by a settings file that predates this feature.
     */
    dari: (items) => {
      if (!Array.isArray(items)) return;
      set({ items: items.filter((i) => i && typeof i.teks === 'string') });
    },
  };
});
