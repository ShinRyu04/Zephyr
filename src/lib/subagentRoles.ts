export type PeranId = 'cari' | 'telaah' | 'rencana' | 'audit' | 'kerja' | 'jelajah';

/** One glyph per role, drawn in `peranIcons.ts`. */
export type PeranIkon = 'cari' | 'telaah' | 'rencana' | 'audit' | 'kerja' | 'jelajah';

export interface Peran {
  id: PeranId;
  label: string;

  hint: string;

  /**
   * Glyph id from `peranIcons.ts`.
   *
   * Was a text character ("⌕", "◈", "⚒"). Those render at whatever weight the
   * font happens to have, drift in size between platforms, and read as
   * decoration rather than as a mark — the list is scanned by shape, so the
   * shapes have to be drawn, not borrowed from a font.
   */
  ikon: PeranIkon;

  butuhTulis: boolean;

  arahan: string;

  kunci: string[];

  /** Terkunci: peran bawaan tidak bisa ditambah/diubah lewat jalur runtime. */
  terkunci: boolean;

  /** Kategori tool yang BOLEH dipakai peran ini. */
  batasTool: BatasKategori[];

  /** Kategori tool yang DITOLAK (selalu memuat `BATAS_UMUM`). */
  dilarang: BatasKategori[];

  /** Satu kasus tepi / tabrakan paling mungkin untuk peran ini — jujur, bukan menyanjung. */
  kasusTepi: string;
}

/**
 * Kategori akses tool. Ini bahasa batasnya, bukan nama tool satu-satu, supaya
 * batas tetap benar kalau nama tool individu berganti — pemetaannya ke nama
 * nyata ada di `TOOL_KATEGORI`.
 *
 *   baca        - membaca isi: read_file, list_directory, lsp_hover, lsp_diagnostics
 *   cari        - menemukan tanpa mengubah: grep, glob, lsp_symbols/references/definition
 *   web         - riset di luar proyek: web_search, web_fetch, browser_open, browser_read
 *   tulis       - mengubah berkas: write_file, edit, multi_edit, replace_in_files,
 *                 create_directory, editor_write
 *   hapus       - merusak: delete_file, move_file, browser_download_url  (DILARANG semua peran)
 *   shell-cek   - bash_run TERBATAS perintah pemeriksa (typecheck/test/build); tidak
 *                 boleh menghapus/menimpa
 *   shell-bebas - terminal tanpa batas (rm, git push, kill)  (DILARANG semua peran)
 */
export type BatasKategori =
  | 'baca'
  | 'cari'
  | 'web'
  | 'tulis'
  | 'hapus'
  | 'shell-cek'
  | 'shell-bebas';

/** Semua kategori yang dikenal. Dipakai harness untuk menolak kategori karangan. */
export const KATEGORI_BATAS: BatasKategori[] = [
  'baca', 'cari', 'web', 'tulis', 'hapus',
  'shell-cek',
  'shell-bebas',
];

/** Larangan yang berlaku untuk SETIAP peran, tanpa kecuali. */
export const BATAS_UMUM: BatasKategori[] = ['hapus', 'shell-bebas'];

/** Nama tool NYATA per kategori (dari `toolGate.ts`/katalog). */
export const TOOL_KATEGORI: Record<BatasKategori, string[]> = {
  baca: ['read_file', 'list_directory', 'lsp_hover', 'lsp_diagnostics'],
  cari: ['grep', 'glob', 'lsp_symbols', 'lsp_references', 'lsp_definition'],
  web: ['web_search', 'web_fetch', 'browser_open', 'browser_read'],
  tulis: ['write_file', 'multi_edit', 'replace_in_files', 'editor_write'],
  hapus: ['delete_file', 'move_file', 'browser_download_url'],
  'shell-cek': ['bash_run'],
  'shell-bebas': ['bash_run'],
};

/** Susun peran lalu bekukan dalam-dalam, supaya batasnya tidak bisa dilonggarkan saat jalan. */
function beku(p: Peran): Peran {
  Object.freeze(p.batasTool);
  Object.freeze(p.dilarang);
  Object.freeze(p.kunci);
  return Object.freeze(p);
}

export const PERAN: Peran[] = [
  {
    id: 'cari',
    label: 'Search',
    hint: 'Search the code: find usages, map the structure, locate definitions',
    ikon: 'cari',
    butuhTulis: false,
    arahan:
      'You are the SCOUT worker. Your job is to map the code: find usages, locate definitions, ' +
      'explain the structure. Change nothing. Report: which file, which line, and what ' +
      'you found — with a short quote as evidence.',
    kunci: ['cari', 'temukan', 'pemakaian', 'struktur', 'dimana', 'di mana', 'list', 'daftar', 'peta'],
    terkunci: true,
    batasTool: ['baca', 'cari'],
    dilarang: ['tulis', 'hapus', 'shell-cek', 'shell-bebas'],
    kasusTepi:
      'Tugasnya berbunyi "hapus impor yang tak terpakai" — itu BUNYI tulis. Peran cari tetap ' +
      'TIDAK menyunting; laporkan file:line lalu agen induk yang mengubahnya.',
  },
  {
    id: 'telaah',
    label: 'Review',
    hint: 'Analisis mendalam: bug sulit, arsitektur, trade-off',
    ikon: 'telaah',
    butuhTulis: false,
    arahan:
      'You are the REVIEWER. Your job is to analyse: why something failed, what the design risks are, what ' +
      'the trade-offs are. Change nothing. Give an analysis that names concrete evidence ' +
      '(file, line, behaviour), not a guess. When you are unsure, say which part is ' +
      'still unproven.',
    kunci: ['analisis', 'kenapa', 'mengapa', 'bug', 'risiko', 'arsitektur', 'trade', 'review', 'telaah'],
    terkunci: true,
    batasTool: ['baca', 'cari'],
    dilarang: ['tulis', 'hapus', 'shell-cek', 'shell-bebas'],
    kasusTepi:
      'User menulis "perbaiki bug ini" padahal perannya telaah. Telaah hanya menganalisis dan ' +
      'mengusulkan patch dalam kata (file + baris + usul); menyunting kode BUKAN wewenangnya.',
  },
  {
    id: 'rencana',
    label: 'Plan',
    hint: 'Draft a step-by-step plan someone can execute directly',
    ikon: 'rencana',
    butuhTulis: false,
    arahan:
      'You are the PLANNER. Your job is to write a plan someone else can execute without asking ' +
      'again: ordered steps, files touched, and how to verify each step. ' +
      'Change nothing. A plan that still leaves design questions open is not finished.',
    kunci: ['rencana', 'plan', 'rancang', 'desain', 'langkah', 'strategi'],
    terkunci: true,
    batasTool: ['baca', 'cari'],
    dilarang: ['tulis', 'hapus', 'shell-cek', 'shell-bebas'],
    kasusTepi:
      'Rencananya menyentuh 5 berkas untuk DITULIS. Peran rencana hanya menulis RENCANA; ' +
      'kelima berkas itu ditulis oleh peran kerja, bukan di sini.',
  },
  {
    id: 'audit',
    label: 'Audit',
    hint: 'Check whether the plan/changes actually work',
    ikon: 'audit',
    butuhTulis: false,
    arahan:
      'You are the AUDITOR. Your job is to check whether this plan or change can actually run. ' +
      'Find missed cases, wrong assumptions, and incomplete steps. Change ' +
      'nothing. Answer with a list of findings plus a confidence level, not a general verdict.',
    kunci: ['audit', 'periksa', 'cek', 'verifikasi', 'validasi', 'can actually run', 'feasible'],
    terkunci: true,
    batasTool: ['baca', 'cari'],
    dilarang: ['tulis', 'hapus', 'shell-cek', 'shell-bebas'],
    kasusTepi:
      'Auditor menemukan satu baris salah di KODE PRODUK. Peran audit melaporkannya dengan ' +
      'file:line dan tingkat keyakinan; ia TIDAK menyunting kode produk untuk "sekalian membetulkan".',
  },
  {
    id: 'kerja',
    label: 'Work',
    hint: 'Complete one real task end to end (needs write permission)',
    ikon: 'kerja',
    butuhTulis: true,
    arahan:
      'You are the WORKER. Your job is to complete one real change and verify it. ' +
      'Stay inside the scope of your task. When done, run a check ' +
      '(typecheck/test) then report what changed and what the check returned.',
    kunci: ['perbaiki', 'ubah', 'tulis', 'implementasi', 'buat', 'tambah', 'hapus', 'fix', 'kerjakan'],
    terkunci: true,
    batasTool: ['baca', 'cari', 'tulis', 'shell-cek'],
    dilarang: ['hapus', 'shell-bebas'],
    kasusTepi:
      'Butuh menghapus berkas lama, `rm -rf`, atau `git push`. Peran kerja BERHENTI dan melapor; ' +
      'hapus/push dijalankan agen INDUK dengan persetujuan user — bukan oleh anak.',
  },
  {
    id: 'jelajah',
    label: 'Explore',
    hint: 'Riset pustaka/dokumentasi di luar proyek',
    ikon: 'jelajah',
    butuhTulis: false,
    arahan:
      'You are the EXPLORER. Your job is to find out things OUTSIDE this project: library behaviour, API versions, ' +
      'common practice. Name the source. If you find no evidence, say you found none — ' +
      'never invent library behaviour.',
    kunci: ['pustaka', 'library', 'dokumentasi', 'docs', 'versi', 'api', 'riset', 'bandingkan'],
    terkunci: true,
    batasTool: ['baca', 'web'],
    dilarang: ['tulis', 'hapus', 'shell-cek', 'shell-bebas'],
    kasusTepi:
      'Dokumentasi menyarankan menambah dependensi. Peran jelajah hanya melaporkan nama + versi + ' +
      'sumbernya; memasang (itu MENULIS package.json / node_modules) bukan wewenangnya.',
  },
];

PERAN.forEach(beku);

export const PERAN_BY_ID = new Map(PERAN.map((p) => [p.id, p]));

export function infoPeran(id: string | undefined): Peran | null {
  if (!id) return null;
  return PERAN_BY_ID.get(id as PeranId) ?? null;
}

export function tebakPeran(tugas: string): PeranId {
  const t = tugas.toLowerCase();

  let terbaik: PeranId = 'cari';
  let skorTerbaik = -1;
  for (const p of PERAN) {
    let skor = 0;
    for (const k of p.kunci) {
      if (t.includes(k)) skor += k.length; // a longer keyword is more specific
    }
    if (skor > skorTerbaik) {
      skorTerbaik = skor;
      terbaik = p.id;
    }
  }
  return terbaik;
}

export function peranDariPrefix(tugas: string): { peran: PeranId | null; sisa: string } {
  const m = tugas.match(/^\s*@(cari|telaah|rencana|audit|kerja|jelajah)\b\s*(.*)$/is);
  if (!m) return { peran: null, sisa: tugas };
  return { peran: m[1].toLowerCase() as PeranId, sisa: m[2] };
}

/**
 * Split a task line on the `->` dependency marker.
 *
 * `buat API -> tulis test` runs "buat API" first, then "tulis test" after it
 * finishes, with the first task's result passed in as context. A line with no
 * marker is a single step. This is a chain, not a full graph: each task depends
 * on the one before it, which covers the common "B needs A's output" case.
 */
export function pisahPipeline(tugas: string): string[] {
  return tugas
    .split(/\s*->\s*/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * Optional per-task model override: `[model:<id>]` or `[model:<provider>/<id>]`
 * anywhere in the task line. Each subagent can run on a different model, so a
 * batch can pair a cheap search model with an expensive one for the hard task.
 * Everything after the tag is the task text.
 */
export function modelDariPrefix(tugas: string): { model: string | null; provider: string | null; sisa: string } {
  const m = tugas.match(/\[\s*model\s*:\s*([^\]]+?)\s*\]/i);
  if (!m) return { model: null, provider: null, sisa: tugas };
  const isi = m[1].trim();
  const slash = isi.indexOf('/');
  const provider = slash > 0 ? isi.slice(0, slash).trim() : null;
  const model = (slash > 0 ? isi.slice(slash + 1) : isi).trim() || null;
  const sisa = (tugas.slice(0, m.index) + ' ' + tugas.slice((m.index ?? 0) + m[0].length))
    .replace(/\s+/g, ' ')
    .trim();
  return { model, provider, sisa };
}

/**
 * Optional per-task MCP allowlist: `[mcp:<serverId>,<serverId>]`.
 *
 * Dipakai Experts untuk pengaturan Skills & MCP per ahli. Tag dicopot dari
 * teks tugas dan diteruskan ke `agentToolSpecs({ mcp })`, sehingga worker itu
 * hanya ditawari tool dari server yang dicentang. Kosong = semua server aktif
 * (perilaku lama), jadi baris tugas tanpa tag tidak berubah sama sekali.
 */
export function mcpDariTeks(tugas: string): { mcp: string[]; sisa: string } {
  const m = tugas.match(/\[\s*mcp\s*:\s*([^\]]*?)\s*\]/i);
  if (!m) return { mcp: [], sisa: tugas };
  const mcp = [...new Set(m[1].split(',').map((s) => s.trim()).filter(Boolean))];
  const sisa = (tugas.slice(0, m.index) + ' ' + tugas.slice((m.index ?? 0) + m[0].length))
    .replace(/\s+/g, ' ')
    .trim();
  return { mcp, sisa };
}

/**
 * Optional per-task reasoning effort: `[effort:low]`.
 *
 * Dipakai Experts untuk pengaturan "Thinking effort" per ahli. Tag dicopot
 * dari teks tugas (supaya tidak muncul di laporan worker) dan nilainya
 * diteruskan ke `aiToolChat({ effort })`. Kosong = ikut chip Reasoning global
 * di composer, jadi baris tanpa tag berperilaku persis seperti sebelumnya.
 */
export type EffortTugas = 'minimal' | 'low' | 'medium' | 'high' | 'ultra';

const EFFORT_SAH: readonly EffortTugas[] = ['minimal', 'low', 'medium', 'high', 'ultra'];

export function effortDariTeks(tugas: string): { effort: EffortTugas | null; sisa: string } {
  const m = tugas.match(/\[\s*effort\s*:\s*([^\]]*?)\s*\]/i);
  if (!m) return { effort: null, sisa: tugas };
  const nilai = m[1].trim().toLowerCase();
  const effort = (EFFORT_SAH as readonly string[]).includes(nilai) ? (nilai as EffortTugas) : null;
  const sisa = (tugas.slice(0, m.index) + ' ' + tugas.slice((m.index ?? 0) + m[0].length))
    .replace(/\s+/g, ' ')
    .trim();
  return { effort, sisa };
}

/**
 * Token identitas tugas di UJUNG baris: `[#t3]`.
 *
 * Dipakai Experts memetakan baris agent kembali ke tugas rencananya. Dulu
 * pemetaan mengandalkan TEKS brief — dua tugas dengan brief identik membuat
 * tugas pertama tidak pernah kebagian agentId (diam-diam "Pending" selamanya).
 * Token ini unik per tugas, dicopot dari teks tugas oleh `buatAgent`
 * (supaya worker tidak melihatnya), dan disimpan di baris SubAgent sebagai
 * `tokenTugas` untuk pencocokan yang tidak mungkin tabrakan.
 */
export function tokenDariTeks(tugas: string): { token: string | null; sisa: string } {
  const m = tugas.match(/\s*\[#([A-Za-z0-9_-]+)\]\s*$/);
  if (!m) return { token: null, sisa: tugas };
  return { token: m[1], sisa: tugas.slice(0, m.index).trim() };
}

/** True kalau `id` bukan salah satu peran bawaan (termasuk undefined/kosong). */
export function peranTidakDikenal(id: string | undefined): boolean {
  return !id || !PERAN_BY_ID.has(id as PeranId);
}

/** Peran yang dikenal, atau MELEMPAR. Gerbang "peran tak dikenal DITOLAK". */
export function peranWajib(id: string | undefined): Peran {
  const p = infoPeran(id);
  if (!p) throw new Error(`peran tidak dikenal: ${String(id)} (dikenal: ${PERAN.map((x) => x.id).join(', ')})`);
  return p;
}

/** Batas tool satu peran dalam bentuk yang bisa diperiksa harness. */
export function batasPeran(
  id: string | undefined,
): { peran: Peran; batasTool: BatasKategori[]; dilarang: BatasKategori[] } | null {
  const p = infoPeran(id);
  return p ? { peran: p, batasTool: p.batasTool, dilarang: p.dilarang } : null;
}

/** Roster ringkas, satu baris, dipakai blok aturan prompt. */
export const ROSTER_SINGKAT =
  'cari/Search, telaah/Review, rencana/Plan, audit/Audit, jelajah/Explore = READ-ONLY; ' +
  'kerja/Work = satu-satunya yang boleh menulis; tidak ada peran yang boleh menghapus berkas atau menjalankan terminal bebas.';

/**
 * Blok ATURAN SUBAGENT yang dikirim ke model — sumbernya berkas ini, bukan
 * salinan di tempat lain.
 *
 * Kenapa ada di sini: harness acuan `scripts/uji-prompt-subagent2.mjs` membaca
 * prompt sistem yang SUNGGUHAN dikirim app (`__ZEPHYR_PROMPT__.system()`). Aturan
 * peran sebelumnya hanya hidup di berkas ini sementara prompt memakai teks lain,
 * jadi model tidak pernah menerima aturan peran itu. Fungsi ini menjadikan berkas
 * ini satu-satunya sumber teks aturan: `systemPrompt.ts` memanggilnya di blok
 * aturan EN (`src/lib/systemPrompt.ts:259`) dan ID (`:339`), lewat impor di
 * `:3`, jadi teks di bawah ini benar-benar ikut terkirim tiap giliran.
 *
 * Frasa yang HARUS ada (dicek apa adanya oleh harness acuan):
 *   - 'Subagents RESEARCH; they do not write files'
 *   - 'Never hand file-writing to a subagent'
 *   - 'decide by the kind of work, not the number of files'
 *   - 'verify it from the disk'
 * dan frasa lama yang SALAH harus tetap tidak ada:
 *   - 'More than one file means more than one subagent'
 */
export function aturanSubagentPrompt(bahasa: string, experts = false): string {
  if (experts) {
    /*
     * Mode EXPERTS aktif: gerbang tulis untuk delegasi experts TERBUKA
     * (`dariTimExperts` di subagentStore) dan worker menjalankan shell
     * normalnya sendiri. Aturan lama "subagents do not write files"
     * kontradiktif di sini — prompt dan gerbang harus satu cerita, kalau
     * tidak Lead menahan tugas yang justru boleh dieksekusi tim.
     */
    if ((bahasa || '').toLowerCase().startsWith('id')) {
      return [
        '- MODE EXPERTS aktif: tim dikerahkan untuk MENGHASILKAN pekerjaan. Worker MENULIS berkas dan MENJALANKAN perintah normal yang tugasnya butuhkan (build, test, git status) tanpa bertanya — jangan merencanakan di sekitar aturan "worker tidak boleh menulis"; gerbang itu sudah tidak ada. Tulis tiap tugas sebagai kerja berkas konkret dengan hasil yang bisa diverifikasi; kalau worker melapor ditolak, tulis ulang tugasnya atau kerjakan langkah itu sendiri.',
        '- Sebelum run ditutup, SETIAP tugas berakhir TERBUKTI dari disk (glob, read_file, list_directory), bukan dari kata worker. Ringkasan adalah klaim, bukan bukti. Kalau berkasnya tidak ada, berarti tidak ada.',
      ].join('\n');
    }
    return [
      '- EXPERTS MODE is active: the team is dispatched to PRODUCE work. Workers WRITE the files and RUN the normal commands their tasks need (build, test, git status) without asking - do not plan around a "workers cannot write" rule, that gate no longer exists. Phrase each task as concrete file-level work with a verifiable result; if a worker reports a refusal, rewrite the task or do that step yourself.',
      '- Before the run closes, EVERY task ends PROVEN from disk (glob, read_file, list_directory), not from what the worker claims. A summary is a claim, not proof. If the files are not there, they do not exist.',
    ].join('\n');
  }
  if ((bahasa || '').toLowerCase().startsWith('id')) {
    return [
      '- JANGAN memunculkan subagent (run_subagent) kecuali user secara eksplisit minta subagent, delegasi, atau kerja paralel. Subagent MENELITI; mereka tidak menulis berkas. Jangan pernah menyerahkan penulisan berkas ke subagent: anak read-only tetap melapor selesai padahal berkasnya tak pernah ada; putuskan dari JENIS pekerjaan, bukan jumlah berkas - membangun dikerjakan OLEHMU satu berkas demi satu, riset paralel yang boleh didelegasikan. Kalau memang mendelegasikan, tiap peran TERKUNCI pada batas tool-nya (roster: cari/telaah/rencana/audit/jelajah read-only, hanya `kerja` yang boleh menulis, tak ada peran yang boleh menghapus berkas atau memakai terminal bebas).',
      '- Sebelum mengaku pekerjaan selesai, buktikan dari disk dengan tool baca (glob, read_file, list_directory). Ringkasan adalah klaim, bukan bukti. Kalau berkasnya tidak ada, berarti tidak ada.',
    ].join('\n');
  }
  return [
    '- Do NOT spawn subagents (run_subagent) unless the user explicitly asks for subagents, delegation, or parallel work. Subagents RESEARCH; they do not write files. Never hand file-writing to a subagent: a read-only child reports success while the file never appears; decide by the kind of work, not the number of files - a build is done by YOU, file by file, while genuine parallel research is the case you may delegate. When you DO delegate, each role is LOCKED to its tool limits (roster: cari/telaah/rencana/audit/jelajah are read-only, only `kerja` may write, and no role may delete files or run a free shell).',
    '- Before you claim a build is finished, verify it from the disk with a read tool (glob, read_file, list_directory). A summary is a claim, not proof. If the files are not there, they do not exist.',
  ].join('\n');
}
