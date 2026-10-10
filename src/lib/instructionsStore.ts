import { create } from 'zustand';
import {
  instructionsList,
  instructionRead,
  instructionWrite,
  instructionDelete,
  type InstructionInfo,
} from './commands';

/*
 * Instructions, read from and written to DISK through the Rust backend.
 *
 * Same shape as `skillsStore`, for the same reason: the prompt is built from
 * files, so a list kept in the browser would be a list the agent never sees.
 * The difference is WHEN an instruction applies — see `cocokPola` below.
 */
interface InstructionsState {
  daftar: InstructionInfo[];
  sibuk: boolean;
  galat: string | null;
  dibuka: string | null;
  isi: string;
  memuatIsi: boolean;

  muat: () => Promise<void>;
  buka: (name: string | null) => Promise<void>;
  simpan: (opts: {
    name: string;
    description: string;
    applyTo: string;
    body: string;
    scope: 'workspace' | 'global';
  }) => Promise<boolean>;
  hapus: (name: string) => Promise<boolean>;
  bersihkanGalat: () => void;
}

export const useInstructions = create<InstructionsState>((set, get) => ({
  daftar: [],
  sibuk: false,
  galat: null,
  dibuka: null,
  isi: '',
  memuatIsi: false,

  muat: async () => {
    set({ sibuk: true, galat: null });
    try {
      set({ daftar: await instructionsList(), sibuk: false });
    } catch (e) {
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
      const isi = await instructionRead(name);
      if (get().dibuka !== name) return;
      set({ isi, memuatIsi: false });
    } catch (e) {
      set({ memuatIsi: false, galat: String(e), isi: '' });
    }
  },

  simpan: async (opts) => {
    set({ sibuk: true, galat: null });
    try {
      await instructionWrite(opts);
      /* The prompt caches `agentContext()` for 60s; saving must take effect on
         the next turn, not a minute later. See skillsStore for the full note. */
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
      await instructionDelete(name);
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

/*
 * Does an `applyTo` pattern cover this file path?
 *
 * The corpus uses three forms: `**` (everything), `*` (everything, in the
 * entries written for a single-file project), and real globs like
 * `**\/*.{ts,tsx}` or `**\/*.tf`. Patterns are comma-separated.
 *
 * Matching is done here rather than in Rust because this is where the open file
 * is known — the backend's job is to store the file and report the pattern it
 * holds, not to guess what the reader is looking at. A pattern that cannot be
 * understood returns TRUE: an instruction the reader wrote and we failed to
 * parse is more likely to be wanted than to be noise, and silently dropping it
 * would make the feature look broken in a way nothing on screen explains.
 */
export function cocokPola(pola: string, jalur: string): boolean {
  if (!pola.trim()) return false;
  const path = jalur.replace(/\\/g, '/');
  const nama = path.split('/').pop() ?? path;

  /*
   * Braces are expanded BEFORE the list is split on commas.
   *
   * The other order is the bug this comment exists to prevent: `**\/*.{ts,tsx}`
   * split on `,` first becomes `**\/*.{ts` and `tsx}` — two fragments, neither a
   * pattern, and the `{`/`}` their only clue. The instruction then silently
   * applied to nothing while looking correct on disk.
   */
  const denganBrace = (() => {
    const m = /^(.*?)\{([^}]*)\}(.*)$/.exec(pola);
    if (!m) return [pola];
    return m[2].split(',').map((p) => `${m[1]}${p.trim()}${m[3]}`);
  })();

  for (const utuh of denganBrace) {
    for (const bagian of utuh.split(',')) {
      const g = bagian.trim().replace(/^['"]|['"]$/g, '');
      if (!g) continue;
      if (g === '*' || g === '**' || g === '**/*' || g === '*.*') return true;
      if (globCocok(g, path, nama)) return true;
    }
  }
  return false;
}

/** One glob against one path. `**` crosses directories, `*` does not. */
function globCocok(glob: string, path: string, nama: string): boolean {
  /* A pattern with no slash matches the file NAME, which is how most people
     write `*.ts` — expecting it to match `src/a/b.ts`. */
  const target = glob.includes('/') ? path : nama;

  /*
   * Built in one pass, character by character, rather than by chained
   * `replace` calls with placeholder tokens.
   *
   * The token version had a bug that took a while to see: `**\/` was swapped for
   * a sentinel, then the sentinel was swapped for `(?:.*\/)?` — but the `**`
   * rule ran BEFORE the `*` rule, so a lone `*` produced `[^\/]*` correctly
   * while the already-substituted sentinel survived into the final regex, where
   * it matched nothing. Every pattern containing `/` failed, which is most of
   * them. Walking the string once removes the ordering question entirely.
   */
  let rx = '^';
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === '*') {
      const ganda = glob[i + 1] === '*';
      if (ganda) {
        /* `**\/` also spans the zero-directory case, so `**\/*.ts` matches a
           file at the root. */
        if (glob[i + 2] === '/') {
          rx += '(?:.*/)?';
          i += 2;
        } else {
          rx += '.*';
          i += 1;
        }
      } else {
        rx += '[^/]*';
      }
    } else if (c === '?') {
      rx += '[^/]';
    } else if ('.+^$()|[]{}'.includes(c)) {
      rx += `\\${c}`;
    } else {
      rx += c;
    }
  }
  rx += '$';

  try {
    return new RegExp(rx).test(target);
  } catch {
    /* A pattern we cannot compile is reported as matching, not as not matching:
       see the note on `cocokPola` for why silence is the worse failure here. */
    return true;
  }
}
