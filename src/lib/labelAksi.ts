export type JenisAksi = 'baca' | 'tulis' | 'jalan' | 'cari' | 'ingat' | 'lain';

export interface AksiInfo {

  label: string;

  jenis: JenisAksi;

  ikon: string;
}

const PETA: Record<string, AksiInfo> = {

  file_read: { label: 'Read', jenis: 'baca', ikon: '◫' },
  editor_read: { label: 'Read (buffer)', jenis: 'baca', ikon: '◫' },
  file_list: { label: 'List', jenis: 'cari', ikon: '⌸' },
  terminal_read: { label: 'Read output', jenis: 'baca', ikon: '◫' },
  get_output: { label: 'Read output', jenis: 'baca', ikon: '◫' },
  get_problems: { label: 'Read problems', jenis: 'baca', ikon: '⚠' },
  list_panes: { label: 'List panes', jenis: 'cari', ikon: '⌸' },

  editor_write: { label: 'Edit (buffer)', jenis: 'tulis', ikon: '✎' },
  file_write: { label: 'Write', jenis: 'tulis', ikon: '✎' },
  file_edit: { label: 'Edit', jenis: 'tulis', ikon: '✎' },

  terminal_exec: { label: 'Run', jenis: 'jalan', ikon: '❯' },
  shell_exec: { label: 'Run', jenis: 'jalan', ikon: '❯' },
  browser_open: { label: 'Open page', jenis: 'jalan', ikon: '❯' },
  browser_click: { label: 'Click', jenis: 'jalan', ikon: '❯' },
  browser_type: { label: 'Type', jenis: 'jalan', ikon: '❯' },
  browser_eval: { label: 'Eval in page', jenis: 'jalan', ikon: '❯' },
  browser_screenshot: { label: 'Screenshot', jenis: 'jalan', ikon: '◫' },
  browser_read: { label: 'Read page', jenis: 'baca', ikon: '◫' },
  browser_nav: { label: 'Navigate', jenis: 'jalan', ikon: '❯' },
  browser_list: { label: 'List pages', jenis: 'cari', ikon: '⌸' },
  web_search: { label: 'Search web', jenis: 'cari', ikon: '⌸' },
  web_fetch: { label: 'Fetch page', jenis: 'baca', ikon: '◫' },
  editor_patch: { label: 'Patch (buffer)', jenis: 'tulis', ikon: '✎' },
  file_patch: { label: 'Patch', jenis: 'tulis', ikon: '✎' },
  fs_read: { label: 'Read', jenis: 'baca', ikon: '◫' },
  fs_write: { label: 'Write', jenis: 'tulis', ikon: '✎' },
  fs_list: { label: 'List', jenis: 'cari', ikon: '⌸' },
  editor_open: { label: 'Open in editor', jenis: 'jalan', ikon: '❯' },
  mcp_call: { label: 'MCP call', jenis: 'lain', ikon: '⑃' },
  subagent_run: { label: 'Subagent', jenis: 'lain', ikon: '⑃' },

  memory_read: { label: 'Read memory', jenis: 'ingat', ikon: '◈' },
  memory_write: { label: 'Write memory', jenis: 'ingat', ikon: '◈' },
  skill_list: { label: 'List skills', jenis: 'ingat', ikon: '◈' },
  skill_view: { label: 'Read skill', jenis: 'ingat', ikon: '◈' },
  skill_write: { label: 'Write skill', jenis: 'ingat', ikon: '◈' },
  skill_delete: { label: 'Delete skill', jenis: 'ingat', ikon: '◈' },
  todo_read: { label: 'Read TODO', jenis: 'ingat', ikon: '☑' },
  todo_write: { label: 'Write TODO', jenis: 'ingat', ikon: '☑' },
  cron_list: { label: 'List cron', jenis: 'ingat', ikon: '◷' },
  cron_create: { label: 'Create cron', jenis: 'ingat', ikon: '◷' },
  cron_delete: { label: 'Delete cron', jenis: 'ingat', ikon: '◷' },

  subagent: { label: 'Subagent', jenis: 'lain', ikon: '⑃' },
  agent_sub: { label: 'Subagent', jenis: 'lain', ikon: '⑃' },
};

export function infoAksi(nama: string | undefined): AksiInfo {
  if (!nama) return { label: '—', jenis: 'lain', ikon: '•' };
  return PETA[nama] ?? { label: nama, jenis: 'lain', ikon: '•' };
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

    for (const k of ['path', 'file', 'command', 'cmd', 'pattern', 'query', 'nama', 'name', 'id']) {
      const v = o[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }

    const arr = o.args ?? o.command;
    if (Array.isArray(arr) && arr.length > 0) return String(arr[0]).slice(0, 120);
    return '';
  } catch {

    const m = teks.match(/"(?:path|file|command|cmd|pattern|query)"\s*:\s*"([^"]{1,120})"/);
    return m ? m[1] : '';
  }
}

export const KELAS_JENIS: Record<JenisAksi, string> = {
  baca: 'is-baca',
  tulis: 'is-tulis',
  jalan: 'is-jalan',
  cari: 'is-cari',
  ingat: 'is-ingat',
  lain: 'is-lain',
};
