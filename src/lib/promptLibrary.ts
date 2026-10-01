export interface PromptItem {
  cmd: string;
  label: string;
  body: string;
  /**
   * Commands that DO something to the session rather than filling the composer
   * with text. They used to be header buttons (new chat, delete all, compact);
   * typing them keeps the header to a title, the usage meter and close.
   */
  aksi?:
    | 'baru'
    | 'hapus-semua'
    | 'padatkan'
    | 'ekspor'
    | 'loop'
    | 'mcp'
    | 'goal'
    | 'jadwal'
    | 'riwayat'
    | 'bantuan'
    | 'btw';
  /**
   * Glyph id for the command list.
   *
   * A slash list is scanned by shape before it is read: eleven rows of grey
   * text all look alike, and the icon is what lets the eye jump to the one it
   * wants. Ids map to paths in `promptIcons.ts`.
   */
  ikon: IkonCmd;
}

/**
 * The glyph set for slash commands.
 *
 * Each mark is a different SHAPE, not a different tint — the list is small and
 * monochrome, so shape is the only channel that survives at 13px.
 */
export type IkonCmd =
  | 'baru'
  | 'bersih'
  | 'padat'
  | 'unduh'
  | 'jelas'
  | 'perbaiki'
  | 'rapikan'
  | 'dokumen'
  | 'uji'
  | 'tinjau'
  | 'commit'
  | 'cari'
  | 'terminal'
  | 'tanya'
  | 'ringkas'
  | 'terjemah'
  /* The six workspace commands. Each one is a different shape for the same
     reason as the rest: the list is scanned, not read. */
  | 'putar'
  | 'colok'
  | 'sasaran'
  | 'jadwal'
  | 'riwayat'
  | 'bantuan'
  /* Off-topic aside: a side note that should not derail the thread. */
  | 'sisip';

export const BUILTIN_PROMPTS: PromptItem[] = [
  {
    cmd: 'new',
    label: 'Mulai percakapan baru',
    body: '',
    aksi: 'baru',
    ikon: 'baru',
  },
  {
    cmd: 'clear',
    label: 'Clear the whole chat history',
    body: '',
    aksi: 'hapus-semua',
    ikon: 'bersih',
  },
  {
    cmd: 'compact',
    label: 'Padatkan konteks sesi ini',
    body: '',
    aksi: 'padatkan',
    ikon: 'padat',
  },
  {
    cmd: 'export',
    label: 'Salin percakapan sebagai markdown',
    body: '',
    aksi: 'ekspor',
    ikon: 'unduh',
  },
  {
    cmd: 'explain',
    label: 'Explain the selected code',
    body: 'Explain the following code line by line: what it does, how data flows, and the parts that are easy to get wrongi.\n\n{sel}',
    ikon: 'jelas',
  },
  {
    cmd: 'fix',
    label: 'Perbaiki bug',
    body: 'Find and fix the bug in the following code. Name the root cause first, then give the fixed version.\n\n{sel}',
    ikon: 'perbaiki',
  },
  {
    cmd: 'refactor',
    label: 'Refactor without changing behaviour',
    body: 'Refactor the code below so it is shorter and easier to read without changing what it does. Explain each change.\n\n{sel}',
    ikon: 'rapikan',
  },
  {
    cmd: 'doc',
    label: 'Write documentation',
    body: 'Write documentation for the following code: a one-paragraph summary, parameters, return value, and a usage example.\n\n{sel}',
    ikon: 'dokumen',
  },
  {
    cmd: 'test',
    label: 'Write unit tests',
    body: 'Write unit tests for the following code. Use the framework this project already uses and cover the important edge casesting.\n\n{sel}',
    ikon: 'uji',
  },
  {
    cmd: 'review',
    label: 'Review the code',
    body: 'Review the following code: bugs, security issues, performance problems, and convention violations. Order the findings from theng paling penting.\n\n{sel}',
    ikon: 'tinjau',
  },
  {
    cmd: 'commit',
    label: 'Write a commit message',
    body: 'Write a commit message (subject + body) for the following changes, following this repo\'s convention.\n\n{sel}',
    ikon: 'commit',
  },

  /* ── Workspace commands ──────────────────────────────────────────────
     These act on Zephyr itself rather than on the composer: they open a
     panel, run a scheduled job, or switch conversation. They sit below the
     prompt commands because they are used far less often. */

  {
    cmd: 'loop',
    label: 'Repeat this task until it is done',
    body: '',
    aksi: 'loop',
    ikon: 'putar',
  },
  {
    cmd: 'mcp',
    label: 'Start the MCP server (port 9222)',
    body: '',
    aksi: 'mcp',
    ikon: 'colok',
  },
  {
    cmd: 'goal',
    label: 'Write a plan for the current task',
    body: '',
    aksi: 'goal',
    ikon: 'sasaran',
  },
  {
    cmd: 'schedule',
    label: 'Tugas terjadwal',
    body: '',
    aksi: 'jadwal',
    ikon: 'jadwal',
  },
  {
    cmd: 'history',
    label: 'Conversation history',
    body: '',
    aksi: 'riwayat',
    ikon: 'riwayat',
  },
  {
    cmd: 'help',
    label: 'Pintasan keyboard & bantuan',
    body: '',
    aksi: 'bantuan',
    ikon: 'bantuan',
  },
  {
    cmd: 'btw',
    label: 'Sisipkan pertanyaan singkat di luar topik',
    body: '',
    aksi: 'btw',
    ikon: 'sisip',
  },
];

const LS_KEY = 'zephyr.ai.prompts.v1';

export function loadUserPrompts(): PromptItem[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x): x is PromptItem => {
        const o = x as Partial<PromptItem>;
        return !!o && typeof o.cmd === 'string' && typeof o.body === 'string';
      })
      .map((x) => ({
        cmd: x.cmd.toLowerCase().replace(/\s+/g, '-'),
        label: x.label || x.cmd,
        body: x.body,
        // A user prompt has no icon of its own; it borrows the generic one so
        // the list keeps a straight icon column instead of a ragged edge.
        ikon: x.ikon ?? 'tanya',
      }));
  } catch {
    return [];
  }
}

export function saveUserPrompts(items: PromptItem[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(items));
  } catch {
    // Quota full / private mode: the snippet simply is not saved, not fatal.
  }
}

export function allPrompts(): PromptItem[] {
  const user = loadUserPrompts();
  const userCmd = new Set(user.map((u) => u.cmd));
  return [...user, ...BUILTIN_PROMPTS.filter((b) => !userCmd.has(b.cmd))];
}

export function matchPrompts(draft: string): { query: string; items: PromptItem[] } {
  const m = /^\/([\w-]*)$/.exec(draft);
  if (!m) return { query: '', items: [] };
  const q = m[1].toLowerCase();
  return { query: q, items: allPrompts().filter((p) => p.cmd.startsWith(q)) };
}

export function matchSnippets(draft: string): { query: string; items: PromptItem[] } {

  const m = /(^|\s)>([\w-]*)$/.exec(draft);
  if (!m) return { query: '', items: [] };
  const q = m[2].toLowerCase();
  return { query: q, items: allPrompts().filter((p) => p.cmd.startsWith(q)) };
}

export function expandSnippet(draft: string, sel: string): string {
  const m = /(^|\s)>([\w-]+)/.exec(draft);
  if (!m) return draft;
  const item = allPrompts().find((p) => p.cmd === m[2].toLowerCase());
  if (!item) return draft;
  const sebelum = draft.slice(0, m.index + m[1].length);
  const sesudah = draft.slice(m.index + m[0].length);
  return `${sebelum}${item.body}${sesudah || (sel ? '' : '')}`;
}

export function expandPrompt(draft: string, sel: string): string {
  const m = /^\/([\w-]+)\s*([\s\S]*)$/.exec(draft);
  if (!m) return draft;
  const item = allPrompts().find((p) => p.cmd === m[1].toLowerCase());
  if (!item) return draft;
  const sisa = m[2].trim();
  if (item.body.includes('{sel}')) {
    return item.body.replace('{sel}', sisa || sel || '');
  }
  return sisa ? `${item.body}\n\n${sisa}` : item.body;
}
