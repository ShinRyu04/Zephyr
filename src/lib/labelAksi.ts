import type { NamaAiIkon } from '../components/ai/AiIkon';

export type JenisAksi = 'baca' | 'tulis' | 'jalan' | 'cari' | 'ingat' | 'lain';

export interface AksiInfo {

  label: string;

  jenis: JenisAksi;

  ikon: NamaAiIkon;
}

const PETA: Record<string, AksiInfo> = {

  file_read: { label: 'Read', jenis: 'baca', ikon: 'doc' },
  editor_read: { label: 'Read (buffer)', jenis: 'baca', ikon: 'doc' },
  file_list: { label: 'List', jenis: 'cari', ikon: 'list' },
  terminal_read: { label: 'Read output', jenis: 'baca', ikon: 'doc' },
  get_output: { label: 'Read output', jenis: 'baca', ikon: 'doc' },
  get_problems: { label: 'Read problems', jenis: 'baca', ikon: 'warn' },
  list_panes: { label: 'List panes', jenis: 'cari', ikon: 'list' },

  editor_write: { label: 'Edit (buffer)', jenis: 'tulis', ikon: 'doc-edit' },
  file_write: { label: 'Write', jenis: 'tulis', ikon: 'doc-edit' },
  file_edit: { label: 'Edit', jenis: 'tulis', ikon: 'doc-edit' },

  terminal_exec: { label: 'Run', jenis: 'jalan', ikon: 'terminal' },
  shell_exec: { label: 'Run', jenis: 'jalan', ikon: 'terminal' },
  browser_open: { label: 'Open page', jenis: 'jalan', ikon: 'terminal' },
  browser_click: { label: 'Click', jenis: 'jalan', ikon: 'terminal' },
  browser_type: { label: 'Type', jenis: 'jalan', ikon: 'terminal' },
  browser_eval: { label: 'Eval in page', jenis: 'jalan', ikon: 'terminal' },
  browser_screenshot: { label: 'Screenshot', jenis: 'jalan', ikon: 'doc' },
  browser_read: { label: 'Read page', jenis: 'baca', ikon: 'doc' },
  browser_nav: { label: 'Navigate', jenis: 'jalan', ikon: 'terminal' },
  browser_list: { label: 'List pages', jenis: 'cari', ikon: 'list' },
  web_search: { label: 'Search web', jenis: 'cari', ikon: 'list' },
  search_text: { label: 'Search', jenis: 'cari', ikon: 'search' },
  web_fetch: { label: 'Fetch page', jenis: 'baca', ikon: 'doc' },
  editor_patch: { label: 'Patch (buffer)', jenis: 'tulis', ikon: 'doc-edit' },
  file_patch: { label: 'Patch', jenis: 'tulis', ikon: 'doc-edit' },
  fs_read: { label: 'Read', jenis: 'baca', ikon: 'doc' },
  fs_write: { label: 'Write', jenis: 'tulis', ikon: 'doc-edit' },
  fs_list: { label: 'List', jenis: 'cari', ikon: 'list' },
  editor_open: { label: 'Open in editor', jenis: 'jalan', ikon: 'terminal' },
  mcp_call: { label: 'MCP call', jenis: 'lain', ikon: 'puzzle' },
  subagent_run: { label: 'Subagent', jenis: 'lain', ikon: 'puzzle' },

  memory_read: { label: 'Read memory', jenis: 'ingat', ikon: 'brain' },
  memory_write: { label: 'Write memory', jenis: 'ingat', ikon: 'brain' },
  skill_list: { label: 'List skills', jenis: 'ingat', ikon: 'brain' },
  skill_view: { label: 'Read skill', jenis: 'ingat', ikon: 'brain' },
  skill_write: { label: 'Write skill', jenis: 'ingat', ikon: 'brain' },
  skill_delete: { label: 'Delete skill', jenis: 'ingat', ikon: 'brain' },
  todo_read: { label: 'Read TODO', jenis: 'ingat', ikon: 'check' },
  todo_write: { label: 'Write TODO', jenis: 'ingat', ikon: 'check' },
  cron_list: { label: 'List cron', jenis: 'ingat', ikon: 'clock' },
  cron_create: { label: 'Create cron', jenis: 'ingat', ikon: 'clock' },
  cron_delete: { label: 'Delete cron', jenis: 'ingat', ikon: 'clock' },

  subagent: { label: 'Subagent', jenis: 'lain', ikon: 'puzzle' },
  agent_sub: { label: 'Subagent', jenis: 'lain', ikon: 'puzzle' },
};

export function infoAksi(nama: string | undefined): AksiInfo {
  if (!nama) return { label: '—', jenis: 'lain', ikon: 'dot' };
  return PETA[nama] ?? { label: nama, jenis: 'lain', ikon: 'dot' };
}

export function sasaranAksi(args: string | undefined): string {
  if (!args) return '';
  /*
   * args arrives as a JSON string from the tool layer, but not every caller
   * guarantees that: a step restored from a saved session can carry the parsed
   * object, and the fallback below then threw "args.match is not a function"
   * and took the whole AI panel down with it. Normalise first — a non-string
   * becomes '' rather than a crash.
   */
  const teks = typeof args === 'string' ? args : '';
  if (!teks) return '';
  try {
    const o = JSON.parse(teks) as Record<string, unknown>;

    /*
     * Only a real target earns a place on the row.
     *
     * `reason` is the agent's own justification and `maxLines` is a tuning knob
     * — neither is a target, and printing them turned a one-word row into a
     * sentence. Hermes shows `List panes` and stops; the full JSON is one click
     * away in the expanded body.
     */
    /*
     * An MCP call reads as `server / tool`.
     *
     * TEDI prints "MCP TEDI INSPECT  commands" — the server, then the tool on
     * it — and that pair is the whole identity of the call. Falling through to
     * the generic field list would return only one of the two (whichever key
     * happens to be checked first), which names half the call and hides the
     * half that says what it did.
     */
    if (typeof o.server === 'string' && typeof o.tool === 'string') {
      return `${o.server} / ${o.tool}`;
    }

    for (const k of ['path', 'file', 'command', 'cmd', 'pattern', 'query', 'url', 'nama', 'name', 'id']) {
      const v = o[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }

    const arr = o.args ?? o.command;
    if (Array.isArray(arr) && arr.length > 0) return String(arr[0]).slice(0, 120);

    return '';
  } catch {
    const m = teks.match(/"(?:path|file|command|cmd|pattern|query|url)"\s*:\s*"([^"]{1,120})"/);
    return m ? m[1] : '';
  }
}

/*
 * The command a tool call is actually running, in the reader's language.
 *
 * Hermes prints `Read package.json`, `Run python server.py` — a verb and its
 * object — never the JSON envelope the tool layer happened to use. The row
 * already resolves the target; this is the same idea applied to the expanded
 * body, so opening a call does not drop the reader back into `{"path":"..."}`.
 *
 * A shell call is the interesting case: the JSON holds one string, and that
 * string IS the command, so it is returned bare. A call with several fields
 * (a write with a path and contents, a search with a pattern and a glob) is
 * summarised as `key=value` pairs joined by spaces — enough to read the call at
 * a glance without the punctuation of JSON. Anything unparseable falls back to
 * the raw text rather than hiding it.
 */
export function perintahAksi(nama: string | undefined, args: string | undefined): string {
  const teks = typeof args === 'string' ? args.trim() : '';
  if (!teks) return '';

  const info = infoAksi(nama);
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(teks) as Record<string, unknown>;
  } catch {
    return teks;
  }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return teks;

  const kunci = Object.keys(o);
  if (!kunci.length) return '';

  /* A single string field is the call itself — print it, not its name. */
  if (kunci.length === 1 && typeof o[kunci[0]] === 'string') {
    return String(o[kunci[0]]).trim();
  }

  const bagian: string[] = [];
  for (const k of kunci) {
    const v = o[k];
    if (v === null || v === undefined || v === '') continue;
    if (typeof v === 'string') bagian.push(`${k}=${v}`);
    else if (typeof v === 'number' || typeof v === 'boolean') bagian.push(`${k}=${v}`);
    else if (Array.isArray(v)) bagian.push(`${k}=[${v.length}]`);
    else if (typeof v === 'object') bagian.push(`${k}={…}`);
  }
  return bagian.join(' ') || info.label;
}

export const KELAS_JENIS: Record<JenisAksi, string> = {
  baca: 'is-baca',
  tulis: 'is-tulis',
  jalan: 'is-jalan',
  cari: 'is-cari',
  ingat: 'is-ingat',
  lain: 'is-lain',
};
