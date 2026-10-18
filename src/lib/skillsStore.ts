import { create } from 'zustand';
import {
  skillsList,
  skillRead,
  skillWrite,
  skillDelete,
  skillsKatalog,
  skillPasang,
  type SkillInfo,
  type SkillKatalog,
} from './commands';

/*
 * Skills, read from and written to DISK through the Rust backend.
 *
 * ## Why this store exists at all
 *
 * Skills used to live in `agentExtrasStore`, which keeps them in localStorage.
 * The agent runtime reads skills from disk — `skills.rs` walks
 * `<workspace>/.zephyr/skills/` and the app data folder and injects what it
 * finds into the system prompt. So a skill created in the UI went into a
 * browser key that NOTHING outside the modal could see: the Save button worked,
 * the row appeared, and the agent never learned the skill existed.
 *
 * The backend was already complete — list, read, write, delete, plus the prompt
 * block. Only the frontend was pointing at the wrong place.
 *
 * ## Loading
 *
 * `muat()` is called when the Skills pane mounts and after every write. The
 * list is the backend's answer, not a local guess: a skill added by hand in the
 * editor, or by `git pull`, shows up without a restart, and the row count in
 * the UI cannot drift from the count the prompt injects.
 *
 * Writes are not optimistic. `skill_write` returns the path it wrote, and
 * `muat()` re-reads: an optimistic row would show a skill whose file failed to
 * land, which is the exact failure this store exists to prevent.
 */
interface SkillsState {
  daftar: SkillInfo[];
  sibuk: boolean;
  galat: string | null;
  /** Name of the skill open in the editor pane, or null. */
  dibuka: string | null;
  /** Its body, as read from disk. */
  isi: string;
  /** True while the body is being fetched. */
  memuatIsi: boolean;

  /**
   * Every skill that SHIPS with the app, with an honest `terpasang` flag.
   *
   * Separate from `daftar` on purpose. `daftar` is what is on disk; this is
   * what COULD be. Merging them would make an uninstalled skill look like an
   * installed one with an empty body.
   */
  katalog: SkillKatalog[];

  muat: () => Promise<void>;
  /** Reload both the installed list and the catalogue. */
  muatKatalog: () => Promise<void>;
  /** Plant one bundled skill on disk. Returns false when it already existed. */
  pasang: (name: string) => Promise<boolean>;
  buka: (name: string | null) => Promise<void>;
  simpan: (opts: {
    name: string;
    description: string;
    content: string;
    scope: 'workspace' | 'global';
  }) => Promise<boolean>;
  hapus: (name: string) => Promise<boolean>;
  bersihkanGalat: () => void;
}

export const useSkills = create<SkillsState>((set, get) => ({
  daftar: [],
  sibuk: false,
  galat: null,
  dibuka: null,
  isi: '',
  memuatIsi: false,
  katalog: [],

  muat: async () => {
    set({ sibuk: true, galat: null });
    try {
      const daftar = await skillsList();
      set({ daftar, sibuk: false });
    } catch (e) {
      /*
       * Reported, not swallowed. The old store could not fail — localStorage
       * either writes or throws synchronously — so every failure mode here is
       * new: no workspace open, a permission error, a skill file deleted
       * mid-session. A silent empty list would read as "you have no skills"
       * when the truth is "the list could not be read".
       */
      set({ sibuk: false, galat: String(e) });
    }
  },

  /*
   * The catalogue is loaded TOGETHER with the installed list.
   *
   * Both come from disk, and both must be re-read after any write - an
   * "Install" that left the catalogue saying `terpasang: false` would offer to
   * install the same skill twice, and a delete that left it saying `true` would
   * hide the row that is actually gone.
   */
  muatKatalog: async () => {
    try {
      const [daftar, katalog] = await Promise.all([skillsList(), skillsKatalog()]);
      set({ daftar, katalog });
    } catch (e) {
      set({ galat: String(e) });
    }
  },

  pasang: async (name) => {
    set({ sibuk: true, galat: null });
    try {
      const ditulis = await skillPasang(name);
      /*
       * Same cache drop as `simpan`: the prompt builder holds the skill list
       * for a minute, and an installed skill that the agent does not know about
       * for another minute reads as a broken install.
       */
      void import('./aiStore').then((m) => m.resetCacheKonteks());
      await get().muatKatalog();
      set({ sibuk: false });
      return ditulis;
    } catch (e) {
      set({ sibuk: false, galat: String(e) });
      return false;
    }
  },

  buka: async (name) => {
    if (name === null) {
      set({ dibuka: null, isi: '' });
      return;
    }
    set({ dibuka: name, memuatIsi: true, galat: null });
    try {
      const isi = await skillRead(name);
      /* Guard against a slower read landing after the reader moved on. */
      if (get().dibuka !== name) return;
      set({ isi, memuatIsi: false });
    } catch (e) {
      set({ memuatIsi: false, galat: String(e), isi: '' });
    }
  },

  simpan: async ({ name, description, content, scope }) => {
    set({ sibuk: true, galat: null });
    try {
      await skillWrite({ name, description, content, scope });
      /*
       * The prompt builder caches  for 60 seconds, which is
       * right for a read that rarely changes and wrong for this: the reader
       * saves a skill, sends a message, and the agent does not know the skill
       * exists yet. Dropping the cache here is what makes Save take effect on
       * the very next turn rather than a minute later.
       */
      /*
       * Dynamic, not a top-level import: aiStore pulls in systemPrompt, which
       * pulls in THIS module when it needs the file-pattern instructions. A
       * static import here would close that loop, and the cycle would be live
       * while aiStore is still initialising.  uses the same pattern
       * for the same reason.
       */
      void import('./aiStore').then((m) => m.resetCacheKonteks());
      await get().muat();
      set({ sibuk: false });
      return true;
    } catch (e) {
      set({ sibuk: false, galat: String(e) });
      return false;
    }
  },

  hapus: async (name) => {
    set({ sibuk: true, galat: null });
    try {
      await skillDelete(name);
      if (get().dibuka === name) set({ dibuka: null, isi: '' });
      /*
       * Dynamic, not a top-level import: aiStore pulls in systemPrompt, which
       * pulls in THIS module when it needs the file-pattern instructions. A
       * static import here would close that loop, and the cycle would be live
       * while aiStore is still initialising.  uses the same pattern
       * for the same reason.
       */
      void import('./aiStore').then((m) => m.resetCacheKonteks());
      await get().muat();
      set({ sibuk: false });
      return true;
    } catch (e) {
      set({ sibuk: false, galat: String(e) });
      return false;
    }
  },

  bersihkanGalat: () => set({ galat: null }),
}));

/** Skills in one scope, for the grouped list. */
export const skillsDi = (semua: SkillInfo[], scope: 'workspace' | 'global') =>
  semua.filter((s) => s.scope === scope);
