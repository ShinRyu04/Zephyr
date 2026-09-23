// labelAksi.ts — label + ikon manusiawi untuk langkah agent (T3.6).
//
// KENAPA perlu: nama tool mentah (`file_read`, `editor_write`) itu bahasa mesin.
// TEDI menampilkan "Read", "Edit", "Run" dengan ikon berwarna — user langsung
// tahu SEDANG NGAPAIN tanpa harus tahu nama tool internal.
//
// ATURAN: label HARUS tetap jujur. `editor_write` yang hanya mengubah buffer
// diberi label "Edit (buffer)", bukan "Write" — karena file di disk tidak
// berubah sampai disimpan. Label yang menyesatkan lebih buruk daripada nama
// tool mentah.

/** Jenis aksi untuk pewarnaan + ikon. */
export type JenisAksi = 'baca' | 'tulis' | 'jalan' | 'cari' | 'ingat' | 'lain';

export interface AksiInfo {
  /** label yang ditampilkan, mis. "Read" */
  label: string;
  /** jenis untuk ikon + warna */
  jenis: JenisAksi;
  /** ikon teks (dipakai karena SVG per-tool terlalu berat) */
  ikon: string;
}

/** Peta nama tool → label manusiawi. */
const PETA: Record<string, AksiInfo> = {
  // ── Membaca ──
  file_read: { label: 'Read', jenis: 'baca', ikon: '◫' },
  editor_read: { label: 'Read (buffer)', jenis: 'baca', ikon: '◫' },
  file_list: { label: 'List', jenis: 'cari', ikon: '⌸' },
  terminal_read: { label: 'Read output', jenis: 'baca', ikon: '◫' },
  get_output: { label: 'Read output', jenis: 'baca', ikon: '◫' },
  get_problems: { label: 'Read problems', jenis: 'baca', ikon: '⚠' },
  list_panes: { label: 'List panes', jenis: 'cari', ikon: '⌸' },

  // ── Menulis ──
  editor_write: { label: 'Edit (buffer)', jenis: 'tulis', ikon: '✎' },
  file_write: { label: 'Write', jenis: 'tulis', ikon: '✎' },
  file_edit: { label: 'Edit', jenis: 'tulis', ikon: '✎' },

  // ── Menjalankan ──
  terminal_exec: { label: 'Run', jenis: 'jalan', ikon: '❯' },

  // ── Ingatan / skill / tugas ──
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


  // ── Subagent (dipanggil agent utama) ──
  subagent: { label: 'Subagent', jenis: 'lain', ikon: '⑃' },
  agent_sub: { label: 'Subagent', jenis: 'lain', ikon: '⑃' },
};

/** Label + ikon untuk sebuah nama tool. Tool yang tidak dikenal tetap
 *  ditampilkan apa adanya — lebih baik nama mentah daripada label karangan. */
export function infoAksi(nama: string | undefined): AksiInfo {
  if (!nama) return { label: '—', jenis: 'lain', ikon: '•' };
  return PETA[nama] ?? { label: nama, jenis: 'lain', ikon: '•' };
}

/**
 * Ambil "sasaran" langkah: path file, perintah, atau nama.
 *
 * Args datang sebagai string JSON (dipotong 300 char di store). Fungsi ini
 * menoleransi JSON yang tidak lengkap — pemotongan bisa memutus string di
 * tengah, dan itu tidak boleh membuat seluruh baris hilang.
 */
export function sasaranAksi(args: string | undefined): string {
  if (!args) return '';
  try {
    const o = JSON.parse(args) as Record<string, unknown>;
    // Urutan prioritas: path file > perintah > pola cari > nama.
    for (const k of ['path', 'file', 'command', 'cmd', 'pattern', 'query', 'nama', 'name', 'id']) {
      const v = o[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    // Argumen pertama array (mis. terminal_exec { command: [...] }).
    const arr = o.args ?? o.command;
    if (Array.isArray(arr) && arr.length > 0) return String(arr[0]).slice(0, 120);
    return '';
  } catch {
    // JSON terpotong: ambil nilai string pertama secara kasar supaya baris
    // tetap informatif alih-alih kosong.
    const m = args.match(/"(?:path|file|command|cmd|pattern|query)"\s*:\s*"([^"]{1,120})"/);
    return m ? m[1] : '';
  }
}

/** Kelas CSS per jenis aksi (warna ikon). */
export const KELAS_JENIS: Record<JenisAksi, string> = {
  baca: 'is-baca',
  tulis: 'is-tulis',
  jalan: 'is-jalan',
  cari: 'is-cari',
  ingat: 'is-ingat',
  lain: 'is-lain',
};
