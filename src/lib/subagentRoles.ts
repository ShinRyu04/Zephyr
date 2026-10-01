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
      'anything. Answer with a list of findings plus a confidence level, not a general verdict.',
    kunci: ['audit', 'periksa', 'cek', 'verifikasi', 'validasi', 'can actually run', 'feasible'],
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
  },
];

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
