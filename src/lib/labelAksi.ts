import type { NamaAiIkon } from '../components/ai/AiIkon';
import { AWALAN_MCP, POLA_AWALAN_MCP } from './zephyrTools/catalog';

export type JenisAksi = 'baca' | 'tulis' | 'jalan' | 'cari' | 'ingat' | 'tanya' | 'lain';

export interface AksiInfo {

  label: string;

  jenis: JenisAksi;

  ikon: NamaAiIkon;
}

/*
 * The map keys are the 51 model-facing names in zephyrTools/catalog.ts, verbatim.
 *
 * It used to be keyed on a retired tool vocabulary that no longer exists in
 * the catalog, so every call fell through to the generic row: the raw name, a
 * dot icon,
 * and jenis 'lain'. The version below tracks the catalog one-for-one — 26
 * builtin, then the 14 MCP names in their full mcp__zephyr__ form, then the 11
 * web/browser names — so a call renders its own verb and glyph again.
 */
const PETA: Record<string, AksiInfo> = {
  /* Files - read */
  read_file: { label: 'Read', jenis: 'baca', ikon: 'doc' },
  list_directory: { label: 'List', jenis: 'baca', ikon: 'list' },

  /* Files - write */
  write_file: { label: 'Write', jenis: 'tulis', ikon: 'doc-edit' },
  create_directory: { label: 'Create folder', jenis: 'tulis', ikon: 'doc-edit' },
  move_file: { label: 'Move', jenis: 'tulis', ikon: 'doc-edit' },
  copy_file: { label: 'Copy', jenis: 'tulis', ikon: 'doc-edit' },
  delete_file: { label: 'Delete', jenis: 'tulis', ikon: 'doc-edit' },
  replace_in_files: { label: 'Replace', jenis: 'tulis', ikon: 'doc-edit' },

  /* Edit */
  edit: { label: 'Edit', jenis: 'tulis', ikon: 'doc-edit' },
  multi_edit: { label: 'Edit', jenis: 'tulis', ikon: 'doc-edit' },

  /* Search */
  grep: { label: 'Search', jenis: 'cari', ikon: 'search' },
  glob: { label: 'Find files', jenis: 'cari', ikon: 'folder' },

  /* Shell */
  bash_run: { label: 'Run', jenis: 'jalan', ikon: 'terminal' },
  bash_background: { label: 'Run in background', jenis: 'jalan', ikon: 'terminal' },
  bash_logs: { label: 'Read output', jenis: 'baca', ikon: 'doc' },
  bash_list: { label: 'List processes', jenis: 'baca', ikon: 'list' },
  bash_kill: { label: 'Stop process', jenis: 'jalan', ikon: 'terminal' },

  /* Network */

  /* Sub-agents */
  run_subagent: { label: 'Subagent', jenis: 'lain', ikon: 'robot' },

  /* Tasks & Notes */
  todo_write: { label: 'Write TODO', jenis: 'ingat', ikon: 'check' },
  ask_user: { label: 'Ask', jenis: 'tanya', ikon: 'comment' },
  notes_write: { label: 'Write notes', jenis: 'ingat', ikon: 'brain' },

  /* Schedules */
  schedule_command: { label: 'Schedule', jenis: 'ingat', ikon: 'clock' },

  /* MCP - inspect */
  mcp__zephyr__inspect: { label: 'Inspect', jenis: 'baca', ikon: 'search' },
  mcp__zephyr__state: { label: 'Read state', jenis: 'baca', ikon: 'doc' },
  mcp__zephyr__read: { label: 'Read surface', jenis: 'baca', ikon: 'doc' },
  mcp__zephyr__wait_for_terminal: { label: 'Wait for terminal', jenis: 'baca', ikon: 'clock' },

  /* MCP - control */
  mcp__zephyr__run_command: { label: 'Run command', jenis: 'jalan', ikon: 'terminal' },
  mcp__zephyr__open_file: { label: 'Open file', jenis: 'tulis', ikon: 'doc-edit' },
  mcp__zephyr__workspace: { label: 'Workspace', jenis: 'tulis', ikon: 'node' },
  mcp__zephyr__set_setting: { label: 'Set setting', jenis: 'tulis', ikon: 'gear' },
  mcp__zephyr__extension: { label: 'Extension', jenis: 'tulis', ikon: 'puzzle' },
  mcp__zephyr__ssh: { label: 'SSH', jenis: 'jalan', ikon: 'node' },
  mcp__zephyr__worktree: { label: 'Worktree', jenis: 'tulis', ikon: 'node' },

  /* MCP - terminal */
  mcp__zephyr__sh: { label: 'Run in terminal', jenis: 'jalan', ikon: 'terminal' },
  mcp__zephyr__focus_pane: { label: 'Focus pane', jenis: 'tulis', ikon: 'node' },
  mcp__zephyr__pane: { label: 'Pane', jenis: 'tulis', ikon: 'node' },

  /* Web */
  web_search: { label: 'Search web', jenis: 'cari', ikon: 'search' },
  web_fetch: { label: 'Fetch page', jenis: 'baca', ikon: 'doc' },

  /* Browser */
  browser_open: { label: 'Open page', jenis: 'jalan', ikon: 'web' },
  browser_read: { label: 'Read page', jenis: 'baca', ikon: 'web' },
  browser_click: { label: 'Click', jenis: 'jalan', ikon: 'web' },
  browser_type: { label: 'Type', jenis: 'jalan', ikon: 'web' },
  browser_list: { label: 'List pages', jenis: 'baca', ikon: 'list' },
  browser_close: { label: 'Close page', jenis: 'tulis', ikon: 'web' },
  browser_download_url: { label: 'Download', jenis: 'tulis', ikon: 'plus' },
};

/*
 * A model-facing MCP name carries a `mcp__zephyr__` prefix; the tool layer does
 * too, but a bare `inspect` can still reach here from a restored session or a
 * hand-written step. Strip the prefix before the lookup so both spellings
 * resolve to the same entry instead of one of them landing on the generic row.
 *
 * `AWALAN_MCP` dan `POLA_AWALAN_MCP` datang dari katalog, bukan ditulis ulang
 * di sini. Satu-satunya awalan yang sah adalah `mcp__zephyr__`; `namaPolos`
 * melepasnya supaya baris aksi tidak pernah menampilkan awalan internal.
 */

/*
 * Nama MCP yang dibaca manusia tidak boleh memperlihatkan awalan internal.
 *
 * Awalan `mcp__zephyr__` adalah konvensi protokol: dispatcher dan prompt model
 * bergantung padanya, jadi nama itu TIDAK diubah. Yang diubah hanya yang
 * terlihat di kartu loop, dan itu dilakukan di sini - satu tempat - supaya
 * AiPanel, ChatMessage, dan SubAgentPanel ikut bersih tanpa perlu tahu
 * soal awalan itu sama sekali.
 *
 * Alasannya bukan kosmetik: `mcp__zephyr__inspect` di baris aksi terbaca
 * sebagai nama asing milik alat lain, padahal itu tindakan Zephyr sendiri.
 * Pengguna tidak punya cara menebak bahwa awalan itu hanya pintu masuk.
 */
export function namaPolos(nama: string | undefined): string {
  if (!nama) return '';
  return nama.replace(POLA_AWALAN_MCP, '');
}

export function infoAksi(nama: string | undefined): AksiInfo {
  if (!nama) return { label: '—', jenis: 'lain', ikon: 'dot' };
  const langsung = PETA[nama];
  if (langsung) return langsung;
  const polosNama = nama.replace(POLA_AWALAN_MCP, '');
  /* A bare MCP name (`inspect`) means its namespaced entry. */
  const berawalan = PETA[AWALAN_MCP + polosNama];
  if (berawalan) return berawalan;
  /* A namespaced name whose namespaced entry is missing falls back to bare. */
  if (polosNama !== nama) {
    const polos = PETA[polosNama];
    if (polos) return polos;
  }
  /*
   * Fallback terakhir: nama tool mentah.
   *
   * Ini yang dulu membocorkan awalan MCP ke layar setiap kali ada tool MCP
   * baru yang belum terdaftar di PETA. Awalan itu bukan bagian dari nama yang
   * perlu dibaca siapa pun, jadi dibuang di sini juga.
   */
  return { label: namaPolos(nama), jenis: 'lain', ikon: 'dot' };
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
     * The reference prints "MCP  INSPECT  commands": the server, then the tool
     * on it. That pair is the whole identity of the call. Falling through to
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
  /* A question is neither reading nor writing: it PAUSES. Its own class lets the
     transcript draw it differently from a tool that returned data, because "the
     run is waiting for you" must not look like "the run did something". */
  tanya: 'is-tanya',
  lain: 'is-lain',
};
