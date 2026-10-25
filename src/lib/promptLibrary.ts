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
    | 'browser'
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
  /* The browser pane: a window inside Zephyr, not a page in the system browser. */
  | 'browser'
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
    body: 'Explain the following code line by line: what it does, how data flows, and the parts that are easy to get wrong.\n\n{sel}',
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
    body: 'Write unit tests for the following code. Use the framework this project already uses and cover the important edge cases.\n\n{sel}',
    ikon: 'uji',
  },
  {
    cmd: 'review',
    label: 'Review the code',
    body: 'Review the following code: bugs, security issues, performance problems, and convention violations. Order the findings by importance.\n\n{sel}',
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
    body: 'Keep working on this until it is actually done - verify the result, and do not stop halfway.\n\n{sel}',
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
    body: 'Write a step-by-step plan for this task, then work through it one step at a time.\n\n{sel}',
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
    cmd: 'browser',
    label: 'Buka panel browser',
    body: '',
    aksi: 'browser',
    ikon: 'colok',
  },
  {
    cmd: 'btw',
    label: 'Sisipkan pertanyaan singkat di luar topik',
    body: 'Ngomong-ngomong, {sel}',
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

/**
 * What a slash command DOES, for grouping the list.
 *
 * Three kinds, because they are three different promises:
 *
 *   sesi    acts on the conversation itself (new, clear, compact, export)
 *   prompt  fills the composer with a sentence (explain, fix, review, ...)
 *   kerja   opens a workspace surface (mcp, schedule, history, loop, ...)
 *
 * Derived from `aksi` rather than stored as a fourth field: `aksi` already says
 * what the command does, and a second field would be a second place to get it
 * wrong. A command with no `aksi` is, by definition, one that only writes text.
 */
export type JenisPrompt = 'sesi' | 'prompt' | 'kerja';

const AKSI_SESI = new Set(['baru', 'hapus-semua', 'padatkan', 'ekspor']);

export function jenisPrompt(p: PromptItem): JenisPrompt {
  if (!p.aksi) return 'prompt';
  return AKSI_SESI.has(p.aksi) ? 'sesi' : 'kerja';
}

export const LABEL_PROMPT: Record<JenisPrompt, string> = {
  sesi: 'Session',
  prompt: 'Prompts',
  kerja: 'Workspace',
};

export const URUTAN_PROMPT: JenisPrompt[] = ['prompt', 'sesi', 'kerja'];

export function matchPrompts(draft: string): { query: string; items: PromptItem[] } {
  const m = /^\/([\w-]*)$/.exec(draft);
  if (!m) return { query: '', items: [] };
  const q = m[1].toLowerCase();
  return { query: q, items: allPrompts().filter((p) => p.cmd.startsWith(q)) };
}

/*
 * A snippet trigger is `>` OR `#`, whichever the user reaches for.
 *
 * `>` came first and is kept untouched: users build muscle memory around a
 * symbol, and dropping it to add `#` would break the habit it created. Both
 * spell the same action - insert the snippet body - so the regex accepts
 * either symbol rather than there being two grammars.
 *
 * `#` is safe to share because nothing else in the composer claims it. The
 * only other inline trigger is `@` for file references (see `tokenAt` in
 * AiPanel), and a leading `/` for slash commands; `#` starts a word neither of
 * those reads, so the two lists never open at the same time.
 */
const TRIGGER_SNIPPET = /(^|\s)[>#]([\w-]*)$/;

/**
 * Whether the composer currently holds a `/` command or a `>`/`#` snippet token.
 *
 * The popup is kept alive by its own search field, which is right while the
 * token is still in the composer but wrong the moment it is gone: deleting the
 * `/` used to leave the list floating over the chat because the field still had
 * text. One place answers "is there still something to suggest for?", using the
 * same grammar as the matchers above instead of a second regex in the panel.
 */
export function adaPemicuPrompt(draft: string): boolean {
  return /^\/[\w-]*$/.test(draft) || TRIGGER_SNIPPET.test(draft);
}

export function matchSnippets(draft: string): { query: string; items: PromptItem[] } {
  const m = TRIGGER_SNIPPET.exec(draft);
  if (!m) return { query: '', items: [] };
  const q = m[2].toLowerCase();
  return { query: q, items: allPrompts().filter((p) => p.cmd.startsWith(q)) };
}

/**
 * Which symbol opened the open snippet list, so the row can echo the one the
 * user actually typed. Showing `>` for a list opened with `#` would make the
 * composer look like it ignored the keystroke.
 */
export function snippetTrigger(draft: string): '>' | '#' | null {
  const m = TRIGGER_SNIPPET.exec(draft);
  if (!m) return null;
  return draft[m.index + m[1].length] === '#' ? '#' : '>';
}

export function expandSnippet(draft: string, sel: string): string {
  const m = /(^|\s)[>#]([\w-]+)/.exec(draft);
  if (!m) return draft;
  const item = allPrompts().find((p) => p.cmd === m[2].toLowerCase());
  if (!item) return draft;
  const sebelum = draft.slice(0, m.index + m[1].length);
  const sesudah = draft.slice(m.index + m[0].length);
  return `${sebelum}${item.body}${sesudah || (sel ? '' : '')}`;
}

/**
 * Turn a picked prompt into the text that goes in the composer.
 *
 * THE SHAPE, and why it changed:
 *
 * A slash command now STAYS in the composer - `/explain` is written back as
 * `/explain ` and the cursor is placed after it, so the command reads as a
 * command and the user can type an argument next to it. Picking a prompt used to
 * replace the whole line with the template body, which had three problems the
 * user reported directly:
 *
 *   1. The command vanished. You could not see which one you had picked, and
 *      typing a second one meant retyping the slash.
 *   2. There was nowhere to put an argument. `/explain this function` is the
 *      natural thing to type, but the picker consumed the line.
 *   3. `{sel}` stayed literal when nothing was selected. The body's placeholder
 *      was replaced with an empty string only if there WAS a selection, so an
 *      unselected `/explain` sent the model the text "{sel}".
 *
 * The template body is NOT lost - it is applied at SEND time (see
 * `expandPromptBody`), where the argument and the selection are both known. That
 * is the split the reference uses: the composer holds the command, the send path
 * holds the expansion.
 */
export function expandPrompt(draft: string, sel: string): string {
  void sel;
  const m = /^\/([\w-]+)\s*([\s\S]*)$/.exec(draft);
  if (!m) return draft;
  const item = allPrompts().find((p) => p.cmd === m[1].toLowerCase());
  if (!item) return draft;
  /*
   * Commands with no body act immediately (handled by the caller). For the ones
   * with a body, the composer keeps `/<cmd> <argument>` exactly as typed.
   */
  if (!item.body) return draft;
  return `/${item.cmd} ${m[2].trim()}`.trimEnd() + ' ';
}

/**
 * Expand a command into the message that is actually sent.
 *
 * Called on the send path, where both the argument (what the user typed after
 * the command) and the editor selection are available. The template's `{sel}`
 * is filled with the argument when there is one, the selection otherwise, and
 * the placeholder is removed entirely when neither exists - so the model never
 * receives a literal `{sel}`.
 */
export function expandPromptBody(
  draft: string,
  sel: string,
): { kirim: string; tampil: string } | null {
  const m = /^\/([\w-]+)\s*([\s\S]*)$/.exec(draft);
  if (!m) return null;
  const item = allPrompts().find((p) => p.cmd === m[1].toLowerCase());
  if (!item || !item.body) return null;
  /*
   * The argument wins over the editor selection: if the user typed something
   * after the command, that is what they mean, and reaching for the selection
   * as well would silently append unrelated code.
   */
  const isi = m[2].trim() || sel.trim();
  /*
   * `.trimEnd()` matters when nothing was filled in: every body ends in `{sel}`
   * after a blank line, so an empty argument used to leave the message with two
   * trailing newlines. Harmless to the model, visible in the transcript.
   */
  const kirim = (
    item.body.includes('{sel}')
      ? item.body.replace('{sel}', isi)
      : isi
        ? `${item.body}\n\n${isi}`
        : item.body
  ).trimEnd();
  return { kirim, tampil: draft };
}
