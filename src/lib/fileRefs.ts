import { listWorkspaceFiles } from './commands';

/*
 * Inline file references for the composer: typing "@" suggests files from the
 * workspace and inserts the chosen path into the message.
 *
 * The list is capped because it comes from a directory walk, not from a live
 * index: past a few hundred entries the filter cost starts to show while the
 * user is still typing. When nothing matches the typed prefix, an empty list is
 * returned so the caller can stop showing the popup.
 */

export interface FileRef {
  /** Workspace-relative path, with forward slashes. */
  path: string;
  /** File name, for display. */
  name: string;
}

/*
 * How many suggestions to keep after filtering.
 *
 * This was 12, which read as "the list is incomplete": a workspace with a
 * thousand files showed a dozen and there was no way to reach the rest. The
 * popup scrolls, so the cap is set where the scroll stays usable — past a few
 * hundred rows the list is no longer something a person scans.
 */
const MAKS = 200;

/**
 * The token being typed at the caret, or null when the caret is not inside one.
 *
 * `@` must start the token: an email address or a decorator mid-word should not
 * open the file list.
 */
export function tokenAt(sampaiKursor: string): { mulai: number; teks: string } | null {
  const m = /(^|[\s(])@([^\s@]*)$/.exec(sampaiKursor);
  if (!m) return null;
  return { mulai: sampaiKursor.length - m[2].length - 1, teks: m[2] };
}

/** Ranks a path against a query: name matches beat path matches. */
function skor(path: string, nama: string, q: string): number {
  const n = nama.toLowerCase();
  const p = path.toLowerCase();
  if (n.startsWith(q)) return 0;
  if (n.includes(q)) return 1;
  if (p.includes(q)) return 2;
  return -1;
}

/**
 * Filters workspace files against the text typed after "@".
 *
 * `semua` is passed in rather than fetched here so the caller controls caching:
 * the workspace walk is expensive and must not run on every keystroke.
 */
export function saringFile(semua: FileRef[], teks: string): FileRef[] {
  const q = teks.trim().toLowerCase();
  // No query yet: show the shortest paths first, which puts top-level files
  // (README, package.json) above deep node_modules noise.
  if (!q) {
    return [...semua]
      .sort((a, b) => a.path.split('/').length - b.path.split('/').length || a.path.length - b.path.length)
      .slice(0, MAKS);
  }

  return semua
    .map((f) => ({ f, s: skor(f.path, f.name, q) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => a.s - b.s || a.f.path.length - b.f.path.length)
    .slice(0, MAKS)
    .map((x) => x.f);
}

/** Loads the file list once and caches it for the session. */
let cache: FileRef[] | null = null;

/**
 * Candidate files for "@" suggestions.
 *
 * Two sources, in order:
 *   1. The workspace walk, when a folder is open.
 *   2. The open editor tabs, when it is not.
 *
 * The second case matters: without it, "@" did nothing at all when the user had
 * opened files individually instead of opening a folder — the popup never
 * appeared and the placeholder still promised it would.
 */
export async function muatFileWorkspace(): Promise<FileRef[]> {
  if (cache) return cache;

  const dariTab = (): FileRef[] => {
    try {
      // Imported lazily: the store is a large module and this runs on the first
      // "@", not on every panel render.
      const tabs = (window as unknown as { __ZEPHYR__?: { getState: () => { tabs: { path?: string; name?: string }[] } } })
        .__ZEPHYR__?.getState().tabs;
      return (tabs ?? [])
        .filter((t) => !!t.path)
        .map((t) => ({
          path: (t.path as string).replace(/\\/g, '/'),
          name: t.name ?? ((t.path as string).split(/[\\/]/).pop() ?? ''),
        }));
    } catch {
      return [];
    }
  };

  /*
   * Only a NON-EMPTY walk is cached.
   *
   * Caching the empty result was the bug behind "typing @ shows nothing": the
   * first "@" after launch usually runs before a folder is open, the walk
   * returns nothing, and that empty list stayed cached for the session — so the
   * popup kept showing nothing even after a workspace was opened.
   */
  try {
    const daftar = await listWorkspaceFiles();
    if (daftar.length > 0) {
      cache = daftar.map((f) => ({
        // `rel` is the workspace-relative path, which is what belongs in a
        // message: an absolute path is noise the model does not need.
        path: (f.rel || f.path).replace(/\\/g, '/'),
        name: f.name || (f.path.split(/[\\/]/).pop() ?? f.path),
      }));
      return cache;
    }
  } catch {
    /* no workspace yet: fall through to the open tabs */
  }

  // Tabs are cheap to read, so this result is not cached either — a workspace
  // may be opened later in the same session.
  return dariTab();
}

/** Drops the cache, so the next "@" sees files created since the last one. */
export function lupakanFileWorkspace() {
  cache = null;
}
