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
  try {
    const o = JSON.parse(args) as Record<string, unknown>;

    for (const k of ['path', 'file', 'command', 'cmd', 'pattern', 'query', 'nama', 'name', 'id']) {
      const v = o[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }

    const arr = o.args ?? o.command;
    if (Array.isArray(arr) && arr.length > 0) return String(arr[0]).slice(0, 120);
    return '';
  } catch {

    const m = args.match(/"(?:path|file|command|cmd|pattern|query)"\s*:\s*"([^"]{1,120})"/);
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
