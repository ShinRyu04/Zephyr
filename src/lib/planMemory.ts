/*
 * Session memory for plans.
 *
 * The agent plan (`agentTodos`) dies with every run: `agent` clears it on start
 * and nothing writes it back afterwards, so a follow-up prompt like "continue
 * where we left off" starts from an empty list and the model re-plans what it
 * already finished. `.zephyr-context.md` helps, but it lives in the workspace and
 * only survives inside a folder — it is invisible to a chat that starts before a
 * folder is opened.
 *
 * This module keeps the last finished plan per workspace in `localStorage`, so
 * the next run can pick it up as context. Deliberately NOT stored in the
 * sessions list: a plan is a property of the WORK, not of one conversation, and
 * a reader who reopens the project in a new chat still needs it.
 *
 * Only finished runs are recorded. A run still in progress is already visible in
 * the todos card; recording it would show the same steps twice.
 */

const KUNCI = 'zephyr.ai.plans.v1';
/** Jumlah rencana terakhir yang disimpan (per workspace). */
const MAKS = 5;
/** Batas jumlah karakter satu item rencana — cukup untuk satu kalimat. */
const MAKS_ITEM = 240;

export interface RencanaTersimpan {
  /** Workspace tempat rencana dibuat; `''` untuk "tanpa folder". */
  workspace: string;
  /** Tugas yang memicunya, satu baris. */
  tugas: string;
  /** Langkah rencana, urut. */
  langkah: { content: string; selesai: boolean }[];
  /** Kapan run itu berakhir (epoch ms). */
  at: number;
  /** Run berhenti karena kegagalan/batalkan, bukan selesai normal. */
  gagal: boolean;
}

type Peta = Record<string, RencanaTersimpan[]>;

function rapikanWorkspace(ws: string | null): string {
  if (!ws) return '';
  return ws.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

function baca(): Peta {
  try {
    const raw = localStorage.getItem(KUNCI);
    if (!raw) return {};
    const obj = JSON.parse(raw) as unknown;
    return obj && typeof obj === 'object' ? (obj as Peta) : {};
  } catch {
    /* Penyimpanan rusak bukan alasan kehilangan fitur: mulai dari kosong. */
    return {};
  }
}

function tulis(peta: Peta) {
  try {
    localStorage.setItem(KUNCI, JSON.stringify(peta));
  } catch {
    /* Kuota penuh / penyimpanan dimatikan — memori rencana bersifat kemudahan. */
  }
}

/** Normalisasi satu item supaya berkas simpanan tidak membengkak. */
function bersihkanItem(teks: string): string {
  return teks.replace(/\s+/g, ' ').trim().slice(0, MAKS_ITEM);
}

/**
 * Catat rencana dari run yang baru selesai.
 *
 * Rencana kosong dilewati: run chat biasa (tanpa todo) tidak meninggalkan apa
 * pun, dan menyimpan daftar kosong akan MENGHAPUS ingatan sebelumnya — run
 * sepele kemudian bisa menghapus rencana besar yang masih relevan.
 */
export function catatRencana(
  workspace: string | null,
  opts: {
    tugas: string;
    todos: { content: string; status: string }[];
    gagal?: boolean;
    at?: number;
  },
): void {
  const langkah = (opts.todos ?? [])
    .map((t) => ({ content: bersihkanItem(String(t.content ?? '')), selesai: t.status === 'done' }))
    .filter((t) => t.content.length > 0);
  if (langkah.length === 0) return;

  const ws = rapikanWorkspace(workspace);
  const peta = baca();
  const daftar = peta[ws] ?? [];
  const tugas = bersihkanItem(opts.tugas || '');

  /*
   * Rencana identik yang dicatat dua kali (mis. run lanjutan dengan todo yang
   * sama) diperbarui waktunya alih-alih menumpuk. Tanpa ini daftar lima entri
   * terisi oleh satu rencana yang dijalankan berulang, dan rencana lain hilang.
   */
  const sidik = (r: RencanaTersimpan) => `${r.tugas}|${r.langkah.map((l) => l.content).join('|')}`;
  const baru: RencanaTersimpan = {
    workspace: ws,
    tugas,
    langkah,
    at: opts.at ?? Date.now(),
    gagal: opts.gagal === true,
  };
  const saring = daftar.filter((r) => sidik(r) !== sidik(baru));
  peta[ws] = [baru, ...saring].slice(0, MAKS);
  tulis(peta);
}

/** Rencana terakhir di workspace ini, atau `null` kalau belum ada. */
export function rencanaTerakhir(workspace: string | null): RencanaTersimpan | null {
  const daftar = baca()[rapikanWorkspace(workspace)] ?? [];
  return daftar[0] ?? null;
}

/** Semua rencana tersimpan untuk workspace ini, terbaru dulu. */
export function daftarRencana(workspace: string | null): RencanaTersimpan[] {
  return baca()[rapikanWorkspace(workspace)] ?? [];
}

/** Hapus ingatan rencana satu workspace. */
export function lupakanRencana(workspace: string | null): void {
  const ws = rapikanWorkspace(workspace);
  const peta = baca();
  if (!(ws in peta)) return;
  delete peta[ws];
  tulis(peta);
}

/**
 * Rangkuman rencana terakhir sebagai teks untuk prompt.
 *
 * Bentuknya sengaja pendek dan berlabel, karena tujuannya satu: model tahu
 * langkah mana yang SUDAH selesai, sehingga tidak mengulanginya. `null` saat
 * tidak ada apa pun untuk diceritakan.
 */
export function ingatanRencana(workspace: string | null): string | null {
  const r = rencanaTerakhir(workspace);
  if (!r) return null;
  const langkah = r.langkah
    .map((l) => `- [${l.selesai ? 'x' : ' '}] ${l.content}`)
    .join('\n');
  const kapan = new Date(r.at).toISOString().slice(0, 16).replace('T', ' ');
  const status = r.gagal ? 'berhenti sebelum selesai' : 'selesai';
  return (
    `Rencana terakhir di workspace ini (${kapan}, ${status}):\n` +
    (r.tugas ? `Tugas: ${r.tugas}\n` : '') +
    `${langkah}\n` +
    `Langkah bertanda [x] SUDAH dikerjakan - jangan ulangi kecuali diminta.`
  );
}
