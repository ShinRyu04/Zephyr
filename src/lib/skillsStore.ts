import { create } from 'zustand';
import { skillsList, skillRead, skillWrite, skillDelete, type SkillInfo } from './commands';
import { resetCacheKonteks } from './aiStore';

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

  muat: () => Promise<void>;
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
      resetCacheKonteks();
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
      resetCacheKonteks();
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
