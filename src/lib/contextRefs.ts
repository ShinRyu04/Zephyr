import { listWorkspaceFiles, listWorkspaceFolders } from './commands';

/*
 * Inline `@` references for the composer, in CATEGORIES.
 *
 * ## What changed and why
 *
 * `@` used to offer one flat list of files. The reference product's composer
 * says "@ for context" and means it: the same keystroke reaches a file, a
 * FOLDER, a RULE and an AGENT, and the popup groups them so the reader can see
 * what kinds of context exist before typing anything.
 *
 * A flat list could not do that. With a workspace of a thousand files the list
 * was files only - there was no way to attach a rule, and no way to mention a
 * folder at all, even though both are things the agent reads.
 *
 * ## The four kinds
 *
 *   file    a path in the workspace            `@src/lib/aiStore.ts`
 *   folder  a directory in the workspace       `@src/lib`
 *   rule    one of Zephyr's write-time rules   `@rule:ts-any`
 *   agent   one of the subagent roles          `@agent:cari`
 *
 * Rules and agents carry a PREFIX (`rule:`, `agent:`) because they are not
 * paths. Without it the model could not tell `@cari` (an agent) from a file
 * named `cari`, and a bare word that means two things is worse than a longer
 * one that means one.
 */

export interface FileRef {
  /** Workspace-relative path, with forward slashes. */
  path: string;
  /** File name, for display. */
  name: string;
}

export type JenisRef = 'file' | 'folder' | 'rule' | 'agent';

export interface RefItem {
  jenis: JenisRef;
  /** What goes into the message, without the leading `@`. */
  sisip: string;
  /** Primary text: the file name, the folder name, the rule id, the agent label. */
  label: string;
  /** Secondary text: the containing folder, the rule's own sentence, the role hint. */
  detail: string;
  /** Stable identity for React keys. */
  kunci: string;
  /**
   * A mode this entry SWITCHES TO when picked, not just text it inserts.
   *
   * The two Agent rows are the composer's Chat/Agent switch, reached from the
   * `@` popup: picking one both mentions it in the message and sets the mode,
   * which is what the reader means by "@chat this". Everything else in the list
   * is a plain reference with no side effect.
   */
  mode?: 'chat' | 'agent';
  /**
   * Drawn in the "recent" block above the divider, not in the category list.
   *
   * A recent entry is the SAME ref with a different place in the popup, so it
   * carries the flag rather than existing as a second object: two objects for
   * one file meant the keyboard highlight and the click could act on different
   * values, and the inserted text was only correct by luck.
   */
  terakhir?: boolean;
}

/** How many rows a single category may contribute. */
const MAKS_PER_JENIS = 60;

/** Which category the popup is filtered to, or `null` for all of them. */
export type SaringanJenis = JenisRef | null;

/**
 * What the popup is searching for, and in which category.
 *
 * `q` is the free text (the popup's own search field, or whatever follows `@`
 * in the composer) and `jenis` narrows it to one kind — set by a chip or by a
 * `file:`/`folder:`/`rule:`/`agent:` prefix.
 *
 * This used to be one encoded string (`"folder:src"`), which meant the caller
 * had to join and split it and the split could not tell an empty query from a
 * category name. Two fields say the same thing without parsing.
 */
export interface QueryRef {
  jenis: SaringanJenis;
  q: string;
}

/**
 * How many recent entries the popup shows above the divider.
 *
 * Three, like the reference product: enough to cover "the file I was just in,
 * the one before it, and the thing I keep coming back to", short enough that
 * it never pushes the real list below the fold.
 */
export const MAKS_RECENT = 3;

/** Display order: the kinds a reader reaches for most often come first. */
export const URUTAN_JENIS: JenisRef[] = ['file', 'folder', 'rule', 'agent'];

export const LABEL_JENIS: Record<JenisRef, string> = {
  file: 'Files',
  folder: 'Folders',
  rule: 'Rules',
  agent: 'Agents',
};

/**
 * The token being typed at the caret, or null when the caret is not inside one.
 *
 * `@` must start the token: an email address or a decorator mid-word should not
 * open the list. A `:` is allowed inside the token so `@rule:ts-any` stays one
 * token while it is being typed.
 */
export function tokenAt(sampaiKursor: string): { mulai: number; teks: string } | null {
  const m = /(^|[\s(])@([^\s@]*)$/.exec(sampaiKursor);
  if (!m) return null;
  return { mulai: sampaiKursor.length - m[2].length - 1, teks: m[2] };
}

/**
 * Splits what was typed after `@` into an optional category prefix and a query.
 *
 * `rule:ts` -> { jenis: 'rule', q: 'ts' }
 * `ts`      -> { jenis: null,   q: 'ts' }
 *
 * Recognising the prefix is what lets a reader narrow to one kind by TYPING
 * rather than by aiming at a filter chip: "rule:any" is faster than clicking
 * Rules and then typing.
 */
export function uraiToken(teks: string): { jenis: SaringanJenis; q: string } {
  const m = /^(file|folder|rule|agent):(.*)$/i.exec(teks);
  if (!m) return { jenis: null, q: teks };
  return { jenis: m[1].toLowerCase() as JenisRef, q: m[2] };
}

/** Ranks a candidate against a query: label matches beat detail matches. */
function skor(label: string, detail: string, q: string): number {
  const n = label.toLowerCase();
  const d = detail.toLowerCase();
  if (n === q) return 0;
  if (n.startsWith(q)) return 1;
  if (n.includes(q)) return 2;
  if (d.includes(q)) return 3;
  return -1;
}

/**
 * Filters and groups the reference list.
 *
 * `semua` is passed in rather than fetched here so the caller controls caching:
 * the workspace walk is expensive and must not run on every keystroke.
 */
export function saringRef(
  semua: RefItem[],
  permintaan: QueryRef | string,
): { jenis: JenisRef; items: RefItem[] }[] {
  const { jenis: paksa, q: mentah } =
    typeof permintaan === 'string' ? uraiToken(permintaan) : permintaan;
  const q = mentah.trim().toLowerCase();

  const hasil: { jenis: JenisRef; items: RefItem[] }[] = [];
  for (const jenis of URUTAN_JENIS) {
    if (paksa && paksa !== jenis) continue;
    const milik = semua.filter((r) => r.jenis === jenis);
    if (milik.length === 0) continue;

    /*
     * No query yet: show the shortest entries first, which puts top-level files
     * (README, package.json) above deep node_modules noise.
     */
    const urut = q
      ? milik
          .map((r) => ({ r, s: skor(r.label, r.detail, q) }))
          .filter((x) => x.s >= 0)
          .sort((a, b) => a.s - b.s || a.r.label.length - b.r.label.length)
          .map((x) => x.r)
      : [...milik].sort(
          (a, b) => a.detail.split('/').length - b.detail.split('/').length || a.label.length - b.label.length,
        );

    if (urut.length === 0) continue;
    hasil.push({ jenis, items: urut.slice(0, MAKS_PER_JENIS) });
  }
  return hasil;
}

/** Every row, flattened in display order - what the keyboard walks through. */
export function ratakan(hasil: { jenis: JenisRef; items: RefItem[] }[]): RefItem[] {
  return hasil.flatMap((g) => g.items);
}

/** Loads the reference list once and caches it for the session. */
let cache: RefItem[] | null = null;

/**
 * Every folder of the workspace, listed by the backend.
 *
 * This used to be DERIVED from the file list ("a second directory walk would
 * cost the same again"). The saving was real but the cost was worse: a folder
 * holding no readable file — an empty one, or one where every file is ignored —
 * simply did not exist in the popup. The walk is one Rust call on the first
 * `@` of a session and its answer is cached with the files, so it is paid once.
 *
 * Falls back to deriving from the files when the call fails (an older backend,
 * or no workspace), so the category never disappears outright.
 */
function folderDariBerkas(berkas: FileRef[]): RefItem[] {
  const terlihat = new Set<string>();
  for (const f of berkas) {
    const bagian = f.path.split('/');
    bagian.pop();
    let jalan = '';
    for (const b of bagian) {
      jalan = jalan ? `${jalan}/${b}` : b;
      terlihat.add(jalan);
    }
  }
  return [...terlihat].map((p) => ({
    jenis: 'folder' as const,
    /* Trailing slash, same reason as `itemFolder`: it reads as a folder. */
    sisip: `${p}/`,
    label: p.split('/').pop() ?? p,
    detail: p.split('/').slice(0, -1).join('/'),
    kunci: `folder:${p}`,
  }));
}

function itemFolder(rel: string, nama: string): RefItem {
  const bagian = rel.split('/');
  return {
    jenis: 'folder',
    /* A trailing slash is what makes the inserted text readable as a FOLDER:
       `@src/lib/` cannot be mistaken for a file called `lib`, and the model
       sees the same hint. Same shape as the reference product. */
    sisip: rel.endsWith('/') ? rel : `${rel}/`,
    label: nama || (bagian[bagian.length - 1] ?? rel),
    detail: bagian.slice(0, -1).join('/'),
    kunci: `folder:${rel}`,
  };
}

/**
 * Candidate references for "@" suggestions.
 *
 * Three sources, in order:
 *   1. The workspace walk, when a folder is open.
 *   2. The open editor tabs, when it is not.
 *   3. Rules and agents, which exist regardless of any folder.
 *
 * The third case is why this is not a file loader any more: rules and agents are
 * Zephyr's own, so they are offered even with nothing open - which is exactly
 * when a reader is most likely to want them.
 */
export async function muatRef(): Promise<RefItem[]> {
  if (cache) return cache;

  const dariTab = (): FileRef[] => {
    try {
      // Imported lazily: the store is a large module and this runs on the first
      // "@", not on every panel render.
      const tabs = (
        window as unknown as { __ZEPHYR__?: { getState: () => { tabs: { path?: string; name?: string }[] } } }
      ).__ZEPHYR__?.getState().tabs;
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

  let berkas: FileRef[] = [];
  /*
   * Only a NON-EMPTY walk is cached.
   *
   * Caching the empty result was the bug behind "typing @ shows nothing": the
   * first "@" after launch usually runs before a folder is open, the walk
   * returns nothing, and that empty list stayed cached for the session - so the
   * popup kept showing nothing even after a workspace was opened.
   */
  try {
    const daftar = await listWorkspaceFiles();
    if (daftar.length > 0) {
      berkas = daftar.map((f) => ({
        // `rel` is the workspace-relative path, which is what belongs in a
        // message: an absolute path is noise the model does not need.
        path: (f.rel || f.path).replace(/\\/g, '/'),
        name: f.name || (f.path.split(/[\\/]/).pop() ?? f.path),
      }));
    }
  } catch {
    /* no workspace yet: fall through to the open tabs */
  }
  if (berkas.length === 0) berkas = dariTab();

  /*
   * Folders come from their own walk, not from the files above. Reason: a
   * folder with no readable file in it is a perfectly good thing to attach and
   * used to be invisible here.
   */
  let folderItems: RefItem[] = [];
  try {
    const daftar = await listWorkspaceFolders();
    folderItems = daftar.map((d) => itemFolder(d.rel.replace(/\\/g, '/'), d.name));
  } catch {
    folderItems = folderDariBerkas(berkas);
  }
  if (folderItems.length === 0) folderItems = folderDariBerkas(berkas);

  const fileItems: RefItem[] = berkas.map((f) => ({
    jenis: 'file',
    sisip: f.path,
    label: f.name,
    detail: f.path.split('/').slice(0, -1).join('/'),
    kunci: `file:${f.path}`,
  }));

  /*
   * Rules and agents are loaded from Zephyr's own catalogs.
   *
   * Both are imported dynamically: `rulesCatalog` pulls in the rule engine and
   * `subagentRoles` pulls in the role prompts, and neither is needed until
   * someone actually types "@" - putting them on the panel's import graph would
   * cost every render of the chat for a popup that may never open.
   */
  let aturan: RefItem[] = [];
  try {
    const { RULES_BAWAAN } = await import('./rulesCatalog');
    aturan = RULES_BAWAAN.map((r) => ({
      jenis: 'rule' as const,
      sisip: `rule:${r.id}`,
      label: r.id,
      detail: r.pesan,
      kunci: `rule:${r.id}`,
    }));
  } catch {
    /* the catalog is optional context; a failure must not close the popup */
  }

  let agen: RefItem[] = [];
  /*
   * TWO agents, not the six subagent roles.
   *
   * `PERAN` from `subagentRoles.ts` lists Search, Review, Plan, Audit, Work and
   * Explore - those are WORKER TYPES an agent delegates to, and putting them in
   * the `@` popup was a category error: mentioning `@Audit` in a message does
   * not make an auditor appear, it just types a word. The reader saw six rows
   * and asked the obvious question, which was "why are there so many".
   *
   * What belongs here is the same pair the composer's mode chip offers: Chat,
   * which answers, and Agent, which has tools. Picking one sets the mode, so
   * `@agent` is a real instruction rather than decoration.
   */
  agen = [
    {
      jenis: 'agent',
      sisip: 'chat',
      label: 'Chat',
      detail: 'Ask questions and talk - no tools, no file changes',
      kunci: 'agent:chat',
      mode: 'chat',
    },
    {
      jenis: 'agent',
      sisip: 'agent',
      label: 'Agent',
      detail: 'Reads files, runs tools, changes code',
      kunci: 'agent:agent',
      mode: 'agent',
    },
  ];

  const gabung = [...fileItems, ...folderItems, ...aturan, ...agen];
  /*
   * Only a list with at least one FILE or FOLDER is cached.
   *
   * Rules and agents are always present, so caching unconditionally would pin
   * the result of the first "@" - taken before any folder was open - and the
   * file list would never appear for the rest of the session.
   */
  if (fileItems.length > 0) cache = gabung;
  return gabung;
}

/** Drops the cache, so the next "@" sees files created since the last one. */
export function lupakanRef() {
  cache = null;
}

/**
 * The "recent" block: the last few refs the reader actually picked.
 *
 * Order is most-recent-first, and a ref that does not exist in the current list
 * any more (a deleted file, a rule that was removed) is dropped rather than
 * offered — a row that inserts a path to nothing is worse than no row.
 *
 * `kunci` is the identity, so the same file picked twice moves to the top
 * instead of appearing twice.
 */
const recent: string[] = [];
const SEMUA_TERAKHIR = 12;

/** Remembers a pick. Called by the composer when a ref is inserted. */
export function catatRefTerakhir(kunci: string) {
  const i = recent.indexOf(kunci);
  if (i >= 0) recent.splice(i, 1);
  recent.unshift(kunci);
  if (recent.length > SEMUA_TERAKHIR) recent.length = SEMUA_TERAKHIR;
}

/**
 * The recent refs, resolved against `semua` and flagged `terakhir`.
 *
 * Returned in pick order, capped at `MAKS_RECENT`. The flag is what the popup
 * draws above the divider; the same items also stay in their category list, so
 * the reader finds them where they expect them too.
 */
export function refTerakhir(semua: RefItem[]): RefItem[] {
  const peta = new Map(semua.map((r) => [r.kunci, r]));
  const hasil: RefItem[] = [];
  for (const k of recent) {
    const r = peta.get(k);
    /* Rules and agents are not "recent places" in the same sense - they are a
       fixed pair that would occupy the block permanently. Only files and
       folders earn a place here. */
    if (!r || (r.jenis !== 'file' && r.jenis !== 'folder')) continue;
    hasil.push({ ...r, terakhir: true });
    if (hasil.length >= MAKS_RECENT) break;
  }
  return hasil;
}
