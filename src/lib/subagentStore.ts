import { create } from 'zustand';
import * as cmd from './commands';
import { agentToolSpecs, TOOL_TULIS } from './agentTools';
import { findModel, daftarProvider, modelTersedia, providerSiap } from './modelCatalog';
import { routeSubagentModel, type SubagentModelSource, type SubagentModelCandidate } from './subagentRouter';
import { useStore } from './store';
import { infoPeran, tebakPeran, peranDariPrefix, modelDariPrefix, mcpDariTeks, effortDariTeks, tokenDariTeks, pisahPipeline, PERAN, type PeranId } from './subagentRoles';
import { arahanCustom, cariCustom, bacaDaftar, pisahCustom } from './subagentCustom';
import { faktaInti, petaFitur } from './systemPrompt';
import { useAi, isDestructive, fullUrlProvider } from './aiStore';
import type { SesiLatar } from './types';
import { useSettingsUi } from './settingsStore';
import { TOOL_DISK_TULIS } from './toolGate';
import { TOOL_BY_NAME } from './zephyrTools/catalog';
import { pathTersentuh } from './zephyrTools/perubahanTool';

export const MAX_PARALLEL = 4;

/**
 * Last batch, kept so a restart does not lose the result of a long run. Only
 * finished/errored agents are worth restoring; a run interrupted by a restart
 * has no live provider call behind it, so its "running" rows are marked failed
 * on load rather than left spinning.
 */
const LS_KEY = 'zephyr.subagent.last.v1';

/**
 * Tarif harga per juta token, dalam USD.
 *
 * Sengaja KOSONG sampai ada tarif yang benar-benar dipakai: `null` di sini
 * berarti "tidak dilaporkan". Mengarang angka tarif akan menghasilkan biaya
 * yang salah tapi terlihat meyakinkan, dan itu lebih buruk daripada tidak ada
 * biaya sama sekali. Isi tabel ini kalau tarif providernya sudah pasti.
 */
const TARIF: Record<string, { input: number; output: number }> = {};

/**
 * Gabungkan pemakaian token dari satu putaran ke catatan agent.
 *
 * Dipanggil beberapa kali per agent (satu kali per putaran tool), jadi ini
 * MENJUMLAHKAN, bukan menimpa. Token bukan angka puncak - totalnya yang
 * menentukan biaya.
 */
function pakaiToken(
  a: { inputTokens: number | null; outputTokens: number | null; model?: string | null },
  usage: { input: number; output: number } | undefined,
): { inputTokens: number | null; outputTokens: number | null; costUsd: number | null } {
  if (!usage) {
    // Provider tidak melaporkan pemakaian. Biarkan null apa adanya: "tidak
    // dilaporkan" berbeda dari "nol", dan user yang mengawasi kuota perlu tahu
    // bedanya.
    return { inputTokens: a.inputTokens, outputTokens: a.outputTokens, costUsd: null };
  }

  const masuk = (a.inputTokens ?? 0) + usage.input;
  const keluar = (a.outputTokens ?? 0) + usage.output;

  const tarif = a.model ? TARIF[a.model] : undefined;
  const biaya = tarif ? (masuk / 1_000_000) * tarif.input + (keluar / 1_000_000) * tarif.output : null;

  return { inputTokens: masuk, outputTokens: keluar, costUsd: biaya };
}

export function batasParalel(): number {
  const n = useStore.getState().settings.subagent?.maxParallel;
  return typeof n === 'number' && n >= 1 ? Math.min(8, Math.floor(n)) : MAX_PARALLEL;
}

export function batasLangkah(): number {
  const n = useStore.getState().settings.subagent?.maxSteps;
  return typeof n === 'number' && n >= 3 ? Math.min(50, Math.floor(n)) : MAX_SUB_STEPS;
}

export function bolehTulis(): boolean {
  /*
   * Gerbang tulis subagent. Selain setelan eksplisit, mode persetujuan
   * Full Access ('auto') MEMBUKA tulis otomatis: user yang sudah memberi
   * akses penuh tidak boleh masih ditanya-dua kali ("butuh allow") —
   * keluhannya nyata di Experts Mode yang jalan di atas gerbang ini.
   */
  if (useAi.getState().approvalMode === 'auto') return true;
  return useStore.getState().settings.subagent?.allowWrite === true;
}

/**
 * Tulis DISK dari subagent ditolak hanya kalau setelan izinnya mati.
 *
 * Dulu tulis disk ditahan sampai mode persetujuan `auto`, karena subagent tidak
 * punya kartu persetujuan untuk dimintai izin. Akibatnya user yang SUDAH
 * menyalakan "Let sub-agents write" tetap melihat subagentnya cuma membaca -
 * sakelar di layar dan gerbang di kode bercerita beda. Sekarang sakelar itu
 * sendiri yang memutuskan; yang tetap butuh `auto` hanya perintah shell yang
 * bisa menghapus/menimpa berkas (lihat `putusanTulis`), sebab kerusakannya
 * tidak bisa ditinjau setelah terjadi.
 * `editor_write` tidak lewat sini: ia hanya mengubah buffer, bukan disk.
 */
export function tulisDiskDilarang(namaTool: string): boolean {
  if (!TOOL_DISK_TULIS.has(namaTool)) return false;
  return !bolehTulis();
}

/**
 * Keadaan izin tulis subagent apa adanya - dibaca UI, prompt, dan gerbang.
 *
 * SATU gerbang untuk berkas: `allowWrite` (baris "Let sub-agents write" di
 * Chat Settings -> Sub-agents). Menyalakannya berarti user memang meminta
 * subagentnya BEKERJA, jadi tulis disknya langsung dijalankan - dulu ia masih
 * ditahan sampai mode persetujuan `auto`, dan itu membuat sakelar di layar
 * tidak ada gunanya ("sudah dinyalakan, subagentnya tetap cuma membaca").
 *
 * `persetujuanAuto` tetap dilaporkan karena masih dipakai untuk satu hal:
 * perintah shell yang bisa menghapus/menimpa berkas. Itu tidak bisa ditinjau
 * setelah terjadi dan subagent tidak punya kartu persetujuan, jadi ia tetap
 * butuh mode `auto`.
 */
export interface KemampuanTulis {
  /** `settings.subagent.allowWrite` - gerbang untuk semua tulis berkas. */
  setelan: boolean;

  /** `ai.approvalMode === 'auto'` - gerbang untuk perintah shell yang merusak. */
  persetujuanAuto: boolean;

  /** Setelan menyala: kelas tulis terbuka (buffer editor, bukan selalu disk). */
  bisaTulis: boolean;

  /** Setelan menyala: tulisan berkas memang akan dijalankan. */
  bisaTulisDisk: boolean;
}

export function kemampuanTulis(): KemampuanTulis {
  const setelan = bolehTulis();
  const persetujuanAuto = useAi.getState().approvalMode === 'auto';
  return { setelan, persetujuanAuto, bisaTulis: setelan, bisaTulisDisk: setelan };
}

/** Gerbang mana yang menutup, supaya UI bisa menerjemahkan sebabnya. */
export type AlasanTolakTulis = 'setelan-mati' | 'perlu-persetujuan' | 'peran-readonly' | 'tak-ditawarkan';

export interface PutusanTulis {
  boleh: boolean;
  alasan: AlasanTolakTulis | null;

  /** Pesan yang dikirim balik ke model. Menyebut gerbangnya, bukan "error". */
  pesan: string;
}

/**
 * Satu tempat yang memutuskan tulisan subagent: boleh, atau ditolak karena apa.
 *
 * Dipanggil DUA kali di loop (gelombang dan satu-agent) dan dipakai juga oleh
 * `promptSub`, supaya prompt dan gerbangnya tidak bisa lagi berbeda cerita.
 * Sebelumnya keputusan ini hidup sebagai tiga string berbeda di dua tempat, dan
 * prompt peran `kerja` menjanjikan "You may change files" walaupun `allowWrite`
 * mati - akibatnya subagent membakar langkah mencoba menulis, ditolak setiap
 * kali, lalu melapor seolah pekerjaannya beres. Kalimat penolakan lama pun
 * hanya bilang "refused" tanpa menyebut gerbang mana yang menutup, jadi tidak
 * ada cara bagi siapa pun untuk tahu bahwa ada setelan yang bisa dinyalakan.
 *
 * `bahayaShell` ikut di sini walau namanya bukan tool tulis: `rm -rf` menghapus
 * berkas user tanpa pernah menyentuh `write_file`, jadi perintah shell yang
 * merusak diperlakukan sebagai tulis disk. Sebelumnya ia hanya diperiksa saat
 * `allowWrite` mati, artinya menyalakan "izinkan subagent menulis berkas" diam-diam
 * sekaligus mengizinkan subagent menghapus berkas - izin yang tidak pernah
 * diminta dan tidak pernah diberitahukan.
 */
export function putusanTulis(
  namaTool: string,
  opts: { bahayaShell?: boolean; bolehTulisPeran?: boolean } = {},
): PutusanTulis {
  const k = kemampuanTulis();
  const tulisTool = TOOL_TULIS.has(namaTool);

  /*
   * GERBANG PERAN (B2). Dulu pembatasan peran hanya berupa daftar tawaran
   * tool yang dikirim ke provider — provider tidak wajib memvalidasi nama
   * tool_call terhadap daftar itu, jadi peran read-only bisa menulis/menghapus
   * dengan menyebut `write_file` secara langsung. Eksekusi kini mengecek peran
   * yang sama dengan yang menyusun daftar tawaran: satu ekspresi
   * `bolehTulis() && butuhTulis`, dua tempat, tidak bisa berbeda cerita lagi.
   * `undefined` = pemanggil di luar mesin subagent (main agent) — perilaku lama.
   */
  if (opts.bolehTulisPeran === false && (tulisTool || opts.bahayaShell)) {
    return {
      boleh: false,
      alasan: 'peran-readonly',
      pesan: `(refused: ${namaTool} was NOT run - this role is read-only by design (Researcher/QA/Reviewer only read). ` +
        'Report the exact change (file and lines) in your final answer instead; the main agent or a writing expert will apply it.)',
    };
  }

  if (!k.setelan && (tulisTool || opts.bahayaShell)) {
    return {
      boleh: false,
      alasan: 'setelan-mati',
      pesan: opts.bahayaShell
        ? '(refused: the command that can delete or overwrite files was NOT run - subagents are ' +
          'read-only in this session (Chat Settings → Sub-agents → "Let sub-agents write" is off). ' +
          'Nothing was deleted. Describe the command in your report and let the main agent run it.)'
        : `(refused: ${namaTool} was NOT run - subagents are read-only in this session (Chat Settings → ` +
          'Sub-agents → "Let sub-agents write" is off), so no file was written. Report the exact change ' +
          '(file and lines) and the main agent will apply it.)',
    };
  }

  /*
   * Satu-satunya yang masih butuh mode persetujuan Auto: perintah shell yang
   * bisa menghapus/menimpa berkas. Ia tidak bisa ditinjau setelah terjadi, dan
   * subagent tidak punya kartu persetujuan untuk dimintai izin. Tuls BERKAS
   * tidak lagi lewat sini - setelan "Let sub-agents write" sudah jadi izinnya.
   */
  if (opts.bahayaShell || tulisDiskDilarang(namaTool)) {
    return {
      boleh: false,
      alasan: 'perlu-persetujuan',
      pesan: opts.bahayaShell
        ? '(refused: the command that can delete or overwrite files was NOT run - it needs the ' +
          "user's approval, which a subagent cannot ask for (approval mode is not Auto). Nothing " +
          'was deleted. Describe the command and let the main agent run it.)'
        : `(refused: ${namaTool} was NOT run - file writing is off for subagents in this session. ` +
          'Report what you want changed and let the main agent apply it.)',
    };
  }

  return { boleh: true, alasan: null, pesan: '' };
}

/**
 * Baris izin tulis untuk ringkasan yang dibaca agen utama dan ditampilkan di panel.
 *
 * Ada karena keadaannya tidak bisa ditebak dari hasilnya. Ringkasan yang hanya
 * memuat temuan membuat "subagent sudah menulis berkasnya" jadi kesimpulan yang
 * wajar - padahal saat gerbangnya mati tidak ada satu berkas pun yang tersentuh,
 * dan seluruh pekerjaan tulisnya berhenti di laporan. Kalimat ini menyatakan
 * keadaannya lebih dulu, termasuk berapa percobaan tulis yang ditolak, supaya
 * agen utama menerapkan sendiri perubahan yang dilaporkan alih-alih menganggapnya
 * sudah selesai.
 */
export function catatanTulis(
  agents: { nama: string; tulisDitolak?: number; fileDitulis?: string[] }[],
): string {
  const k = kemampuanTulis();
  const ditolak = agents.reduce((n, a) => n + (a.tulisDitolak ?? 0), 0);
  const ditulis = [...new Set(agents.flatMap((a) => a.fileDitulis ?? []))];

  if (!k.bisaTulisDisk) {
    const sebab =
      'subagents are read-only in this session (Chat Settings → Sub-agents → "Let sub-agents write" is off)';
    return (
      `## WRITE PERMISSION: OFF\nNo file was written by any agent below - ${sebab}. ` +
      (ditolak ? `${ditolak} write attempt(s) were refused. ` : '') +
      'Do not report these results as files already changed: apply the changes yourself, or turn the ' +
      'setting on for another run.'
    );
  }

  return (
    `## WRITE PERMISSION: ON\nSubagents may write files in this session. ` +
    (ditulis.length ? `Files written: ${ditulis.join(', ')}.` : 'No file was written.')
  );
}

export const MAX_SUB_STEPS = 15;

// Display names for spawned subagents, assigned in order (NAMA[i % NAMA.length]).
// Awan names feel at home in Zephyr; they are display-only, never sent to the model.
const NAMA = [
  'Nakroth', 'Florentino', 'Zephys', 'Astra', 'Vesper', 'Kaito',
  'Lumi', 'Rovetta', 'Sefira', 'Draska', 'Elowen', 'Marin',
];

export type SubStatus = 'menunggu' | 'jalan' | 'selesai' | 'gagal' | 'batal';

export interface SubStep {

  kind: 'pikir' | 'tool';

  nama?: string;
  args?: string;
  hasil?: string;
  ok?: boolean;

  /**
   * true saat langkah ini DITOLAK gerbang izin tulis - bukan gagal karena
   * error. Dibedakan supaya UI bisa menyebutnya apa adanya ("ditolak: subagent
   * read-only") dan tidak tertukar dengan kegagalan tool biasa, yang artinya
   * jauh berbeda bagi pembaca.
   */
  ditolakTulis?: boolean;

  teks?: string;
  at: number;
}

export interface SubAgent {
  id: string;
  nama: string;
  tugas: string;

  peran: PeranId;

  /**
   * Set when this worker came from Chat Settings → Sub-agents rather than from the
   * shipped role list. `peran` still names the nearest built-in role, because
   * the panel, the icon set and the tool gate are all keyed on it — but the
   * persona, the tool allowlist and the model are the user's, and those are what
   * this id reaches. Null for a built-in worker.
   */
  customId: string | null;

  /** The user's own name for it, shown instead of the built-in role label. */
  customNama: string | null;

  /** Icon id from `subagentIcons.ts`, for a custom worker's own choice. */
  customIkon: string | null;

  /**
   * MCP server ids this worker may use (tag `[mcp:...]`). Kosong = semua server
   * aktif, sama seperti agen biasa; ini allowlist per tugas dari Experts.
   */
  mcpIzin?: string[];

  /**
   * Reasoning effort this worker asked for (tag `[effort:...]`).
   *
   * `undefined` = ikut chip Reasoning global di composer, which is the
   * behaviour every task had before Experts could pin it per expert. Stored
   * on the row (not read at call time) so a restart or a re-render cannot
   * silently change the depth a finished worker ran at.
   */
  effort?: 'minimal' | 'low' | 'medium' | 'high' | 'ultra';

  /**
   * Id tugas Experts yang melahirkan baris ini (token `[#t3]` di ujung baris
   * tugas, dicopot dari teks yang dilihat worker). Pemetaan tugas → agentId
   * memakai token ini, bukan teks brief: dua tugas dengan brief identik
   * membuat pemetaan teks saling menimpa dan satu tugas "Pending" selamanya.
   */
  tokenTugas?: string | null;

  status: SubStatus;
  langkah: SubStep[];

  hasil: string;

  error: string | null;
  mulai: number;
  selesai: number | null;

  nTool: number;

  /** Provider and model this subagent runs on; resolved at launch, per task. */
  provider: string;
  model: string;
  modelSource: SubagentModelSource;
  routingReason: string;

  /**
   * What the agent's own steps show, not what its summary claims.
   * `terbukti` = it ran tools that succeeded; `sebagian` = some tools failed;
   * `tanpa-bukti` = it claimed a result without any successful tool call.
   */
  verdict: 'terbukti' | 'sebagian' | 'tanpa-bukti';
  /** Files this agent actually wrote, from its own tool calls. */
  fileDitulis: string[];

  /**
   * Berapa kali tulisan agent ini ditolak gerbang izin.
   *
   * Bukan hiasan: ringkasan yang dikirim ke agen utama memakainya untuk
   * menyatakan bahwa berkasnya TIDAK ditulis, sehingga klaim subagent yang
   * mengaku sudah menulis tidak lolos begitu saja ke kesimpulan agen utama.
   */
  tulisDitolak: number;
  /** Nesting depth: 0 for a top-level batch, higher inside `subagent_run`. */
  kedalaman: number;

  /**
   * Identitas BATCH, bukan kedalaman.
   *
   * `kedalaman` saja tidak cukup untuk memisahkan batch: dua batch bersamaan
   * sama-sama berada di kedalaman 0, jadi keduanya melebur jadi satu grup di
   * panel dan tidak bisa lagi dibedakan mana hasil milik siapa. Semua agent
   * yang lahir dari satu pemanggilan `jalankan` membawa id yang sama.
   */
  delegasiId: string;

  /**
   * Biaya dan pemakaian token yang dilaporkan provider untuk agent ini.
   *
   * `null` berarti providernya tidak melaporkan, BUKAN nol - dan perbedaan itu
   * penting saat ditampilkan: "tidak dilaporkan" dan "gratis" adalah dua hal
   * yang berbeda bagi user yang sedang mengawasi kuota.
   */
  inputTokens: number | null;
  outputTokens: number | null;
  /** Estimasi biaya USD, hanya terisi kalau providernya melaporkan token. */
  costUsd: number | null;
  /**
   * The conversation this agent had, kept so a stopped or finished agent can be
   * continued with a follow-up message instead of starting over. Only populated
   * for a top-level agent: a nested one belongs to a batch that is already gone
   * by the time anyone could type at it.
   */
  riwayat?: { role: string; content: string; tool_call_id?: string; tool_calls?: unknown; name?: string }[];
  /** Follow-up messages the user sent after the first run, oldest first. */
  lanjutan?: { teks: string; waktu: number; hasil: string }[];
}

interface SubAgentState {

  agents: SubAgent[];

  sibuk: boolean;

  ringkasan: string | null;

  sesiId: string | null;

  jalankan: (
    /** Satu entri = satu rantai: teks `a -> b -> c`, ATAU array langkah
        terstruktur (Experts) yang boleh berisi '' sebagai celah kedalaman. */
    tugas: ReadonlyArray<string | string[]>,
    opts?: {
      bersarang?: boolean;
      kedalaman?: number;
      routing?: 'auto' | 'manual';
      /** Identitas batch; dipakai memisahkan dua batch yang jalan bersamaan. */
      delegasiId?: string;
      /**
       * Batas rantai paralel untuk batch ini saja (Experts Mode memakainya
       * supaya rencana 5-6 tugas tidak terpotong senyap oleh
       * `settings.subagent.maxParallel`). Tidak pernah MENGURANGI batas
       * setelan — hanya bisa melonggarkannya, dan tetap di-plafon 8.
       */
      batasOverride?: number;
      /**
       * Batas langkah tool per agent untuk batch ini saja. Worker Experts
       * mengerjakan satu perubahan utuh (baca → ubah → cek), yang butuh
       * lebih banyak langkah daripada riset satu-pertanyaan.
       */
      langkahOverride?: number;
    },
  ) => Promise<number>;

  batal: (id: string) => void;

  /**
   * Re-run one agent's task from scratch.
   *
   * A finished agent is not always a finished job: a failed one may work on a
   * retry, and a done one may need re-running after the code moved. Starting
   * over (rather than appending to the old conversation) keeps the two runs
   * separate in the step list, so it is clear which one produced which result.
   */
  ulangi: (id: string) => void;

  batalSemua: () => void;

  /**
   * Batalkan hanya batch dengan delegasiId ini — bukan seluruh mesin.
   *
   * `batalSemua` itu global:Experts yang memanggilnya untuk run-nya ikut
   * membunuh batch lain kalau suatu saat dua batch bisa hidup bersamaan, dan
   * di jendela sintesis (worker sudah selesai, run masih 'jalan') ia membunuh
   * apa-apa tapi tetap menimpa status. Ter-scope per delegasi membuat Stop
   * Experts hanya menyentuh worker miliknya.
   */
  batalDelegasi: (delegasiId: string) => void;

  bersihkan: () => void;

  /**
   * Pin an agent to a model without re-running it.
   *
   * The model is resolved at launch, so before this the only way to change it
   * was to cancel the batch and retype every task with a `@model` prefix. A
   * running agent keeps the model it started with (the request is already in
   * flight); the change applies to the next run, a retry, or a follow-up.
   */
  gantiModel: (id: string, model: string, provider: string) => void;

  /**
   * Send a follow-up to an agent that stopped or finished. Its stored history
   * is the conversation so far, so the model keeps the context it built instead
   * of starting from the task text again.
   */
  lanjutkan: (id: string, teks: string) => Promise<boolean>;

  /** Restore the last batch from localStorage, once, at start-up. */
  muatTersimpan: () => void;

  /*
   * Subagent yang DISOROT untuk tampilan detail: klik baris SubAgent di chat
   * membuka detailnya (panel kanan Agent window / tab editor main window) dan
   * menandai id-nya di sini, supaya panel/tab yang sama bisa menampilkan
   * subagent yang berbeda tanpa tab baru per klik.
   */
  sorotId: string | null;
  sorot: (id: string | null) => void;
}

const resolvers = new Map<string, (r: AgentStepResult) => void>();
const activeAttempts = new Map<string, string>();
const subagentAttempts = new Set<string>();
let attemptSeq = 0;
function providerAttempt(agentId: string): string {
  attemptSeq += 1;
  const id = `${agentId}-attempt-${Date.now().toString(36)}-${attemptSeq}`;
  subagentAttempts.add(id);
  return id;
}

const batalSet = new Set<string>();

/**
 * Which writing subagent owns which file.
 *
 * Two subagents running at once can be handed overlapping tasks and both write
 * the same file. The last writer wins and the other agent's work vanishes with
 * no error. Holding a file for the first writer makes the collision visible as
 * a refused tool call instead of silent data loss. The path is lowercased
 * because Windows paths are case-insensitive.
 */
const pemilikFile = new Map<string, string>();

function kunciPath(p: string): string {
  return p.trim().replace(/\//g, '\\').toLowerCase();
}

/** The agent that owns this file, or null when it is free. */
function pemilikSaatIni(path: string): string | null {
  return pemilikFile.get(kunciPath(path)) ?? null;
}

/** Claim a file for an agent. Returns false when another agent holds it. */
function klaimFile(agentId: string, path: string): boolean {
  const kunci = kunciPath(path);
  const pemilik = pemilikFile.get(kunci);
  if (pemilik && pemilik !== agentId) return false;
  pemilikFile.set(kunci, agentId);
  return true;
}

/** Release every file this agent holds — called when it finishes. */
function lepasFileAgen(agentId: string): void {
  for (const [kunci, pemilik] of [...pemilikFile]) {
    if (pemilik === agentId) pemilikFile.delete(kunci);
  }
}

/**
 * The files a write tool is about to touch.
 *
 * Every tool that persists to disk must be recognised here, or two subagents
 * can be handed the same file and clobber each other. move/copy claim BOTH
 * ends so neither the source nor the destination goes unguarded.
 *
 * The write tools are classified from the catalog's effect (`fsWrite` /
 * `appWrite`) rather than a hand-kept name list, because a list written by hand
 * drifts the moment the catalog gains or renames a tool. The path EXTRACTION
 * itself is delegated to `pathTersentuh` (perubahanTool) so the two surfaces
 * can never disagree again: the copy kept here had already drifted once and
 * silently dropped `edit` and `apply_patch` — both classified as writes by the
 * catalog, both fell through the old switch to `null`, so no file claim was
 * taken, "Changed Files" stayed empty, and `buktiCukup` marked the task
 * Unproven even though the file really changed. move/copy now claim BOTH ends,
 * which the old comment promised but the old code never delivered.
 */
function pathDitulis(namaTool: string, args: Record<string, unknown>): string[] {
  const p = (v: unknown) => String(v ?? '').trim();
  const efek = TOOL_BY_NAME.get(namaTool)?.effect;
  const menulis = efek === 'fsWrite' || efek === 'appWrite';
  if (!menulis) return [];
  const daftar = pathTersentuh(namaTool, args).map((t) => t.trim()).filter(Boolean);
  if (daftar.length) return daftar;
  /* `replace_in_files` finds its own targets while running, so its paths are
     not known up front; the search root stands in as the claimed path. */
  if (namaTool === 'replace_in_files') {
    const root = p(args.root);
    return root ? [root] : [];
  }
  return [];
}

/**
 * Satu persiapan untuk SATU tool call, dipakai kedua loop eksekusi (gelombang
 * dan lanjutan) supaya keduanya tidak bisa berbeda keputusan lagi.
 *
 * Tiga penegakan yang dulu hilang:
 *   1. Nama tool yang tidak ada di daftar tawaran DITOLAK — provider tidak
 *      wajib memvalidasi `tool_calls[].name` terhadap `tools` yang dikirim,
 *      jadi daftar tawaran saja bukan penegakan.
 *   2. `tool_call` DIBONGKAR: tool di dalamnya melewati gerbang tulis, klaim
 *      berkas, dan pencatatan bukti — padahal jalur discovery
 *      (tool_search → tool_call) adalah jalur yang memang didesain dipakai.
 *      Kini tool dalamnya melewati putusanTulis + klaim + fileDitulis yang
 *      sama; `tool_call` bersarang ditolak.
 *   3. Gerbang PERAN (lihat putusanTulis `bolehTulisPeran`).
 */
function siapkanTool(
  nama: string,
  argsObj: Record<string, unknown>,
  opts: { agentId: string; ditawarkan: ReadonlySet<string>; bolehTulisPeran: boolean },
): {
  namaTampil: string;
  namaJalan: string;
  args: Record<string, unknown>;
  putusan: PutusanTulis;
  targets: string[];
  konflik: string | null;
  tulisDitolak: boolean;
} {
  const bungkus = nama === 'tool_call';
  const namaJalan = bungkus ? String(argsObj.name ?? '').trim() : nama;
  const args = bungkus
    ? ((argsObj.args && typeof argsObj.args === 'object' ? argsObj.args : {}) as Record<string, unknown>)
    : argsObj;
  const perintahSub = String(args.command ?? '');
  const shellBahaya = isToolShell(namaJalan) && isDestructive(perintahSub);
  const sarang = bungkus && (!namaJalan || namaJalan === 'tool_call');
  const takDitawarkan = !bungkus && !opts.ditawarkan.has(nama);
  let putusan: PutusanTulis;
  if (sarang) {
    putusan = {
      boleh: false,
      alasan: 'tak-ditawarkan',
      pesan: '(refused: nested tool_call is not supported - call the tool directly, or discover it with tool_search first.)',
    };
  } else if (takDitawarkan) {
    putusan = {
      boleh: false,
      alasan: 'tak-ditawarkan',
      pesan: `(refused: ${nama} was NOT offered to this agent - it is outside your role's tool list. ` +
        'Use tool_search to see what is available, and report anything else instead of calling it.)',
    };
  } else {
    putusan = putusanTulis(namaJalan, { bahayaShell: shellBahaya, bolehTulisPeran: opts.bolehTulisPeran });
  }
  const targets = putusan.boleh ? pathDitulis(namaJalan, args) : [];
  const konflik = putusan.boleh
    ? (targets.map((p) => pemilikSaatIni(p)).find((k) => k && k !== opts.agentId) ?? null)
    : null;
  /* Penolakan yang BUKAN soal tulis (nama tidak ditawarkan untuk tool baca)
     tidak boleh menambah hitungan "write attempts refused". */
  const tulisDitolak =
    putusan.alasan === 'tak-ditawarkan'
      ? TOOL_TULIS.has(namaJalan) || shellBahaya
      : !!putusan.alasan;
  return {
    namaTampil: bungkus && namaJalan ? `tool_call:${namaJalan}` : nama,
    namaJalan,
    args,
    putusan,
    targets,
    konflik,
    tulisDitolak,
  };
}

/**
 * Whether a tool runs a shell command whose text lands in `args.command`.
 *
 * The dangerous-command check only fires for these, so a missing name here
 * means a destructive command from a subagent is never caught. `bash_run` and
 * `bash_background` are the built-in shells; the MCP `sh` tool sends a command
 * terminal. MCP tools reach the model prefixed, so the prefixed form and the
 * bare `sh` are both accepted.
 */
function isToolShell(namaTool: string): boolean {
  return (
    namaTool === 'bash_run' ||
    namaTool === 'mcp__zephyr__sh' ||
    namaTool === 'sh'
  );
}

const AGENT_IDLE_MS = 90_000;
const watchdogs = new Map<string, ReturnType<typeof setTimeout>>();

/** Idle limit in ms; the Subagents setting wins when it is a sane number. */
function idleBatasMs(): number {
  const n = useStore.getState().settings.subagent?.idleSecs;
  return typeof n === 'number' && n >= 10 ? Math.min(600, Math.floor(n)) * 1000 : AGENT_IDLE_MS;
}

function armWatchdog(id: string) {
  const lama = watchdogs.get(id);
  if (lama) clearTimeout(lama);
  watchdogs.set(
    id,
    setTimeout(() => {
      watchdogs.delete(id);
      const r = resolvers.get(id);
      if (r) {
        resolvers.delete(id);
        const detik = Math.round(idleBatasMs() / 1000);
        r({
          content: '',
          toolCalls: [],
          cancelled: false,
          error: `Provider did not respond within ${detik} seconds (idle timeout)`,
        });
      }
    }, idleBatasMs()),
  );
}

function disarmWatchdog(id: string) {
  const t = watchdogs.get(id);
  if (t) clearTimeout(t);
  watchdogs.delete(id);
}

interface AgentStepResult {
  content: string;
  toolCalls: { id: string; name: string; args: unknown }[];
  cancelled: boolean;
  error?: string;
  /** Pemakaian token dari provider; `undefined` = tidak dilaporkan, bukan nol. */
  usage?: { input: number; output: number };
}

function promptSub(tugas: string, total: number, peran: PeranId, customId?: string | null): string {
  /*
   * A custom worker's own persona replaces the shipped role prompt outright.
   *
   * Not merged on top of it. The role prompt says "do not change anything" and
   * the general rules repeat that; a user who writes a persona saying their
   * worker is allowed to draft files would get both instructions at once and
   * the safer one would win, which makes the persona look broken. What the
   * definition cannot be trusted to remember for itself — the tool allowlist
   * and the no-write rule — is still stated after it.
   */
  const custom = customId ? bacaDaftar().find((d) => d.id === customId) ?? null : null;
  const p = custom ? null : infoPeran(peran);
  const inggris = (useStore.getState().settings.general.uiLang || 'en') !== 'id';
  /*
   * Kalimat izin tulis diambil dari GERBANGNYA, bukan dari perannya saja.
   *
   * Dulu kalimatnya hanya melihat `p.butuhTulis`: peran `kerja` selalu diberi
   * tahu "You may change files" walau `allowWrite` mati dan tool tulisnya tidak
   * pernah ditawarkan. Subagent lalu menghabiskan langkah mencoba menulis,
   * ditolak di setiap percobaan, dan tetap melapor. Sekarang aturannya sama
   * dengan yang dipakai `putusanTulis`, jadi prompt tidak menjanjikan apa pun
   * yang akan ditolak gerbangnya sendiri.
   */
  const kt = kemampuanTulis();
  /* Worker kustom yang diberi `multi_edit` boleh menulis; tanpa itu read-only. */
  const mintaTulis = custom ? custom.alat.includes('multi_edit') : p?.butuhTulis ?? false;
  const tulis = !kt.setelan
    ? inggris
      ? 'READ-ONLY SESSION: you cannot write files. write_file/edit/multi_edit/delete_file are not offered and would be refused; anything that deletes or overwrites is refused too. Read, search, run read-only commands, and in your report say exactly what should change and where.'
      : 'SESI HANYA-BACA: kamu tidak bisa menulis berkas. write_file/edit/multi_edit/delete_file tidak ditawarkan dan akan ditolak; perintah yang menghapus atau menimpa juga ditolak. Baca, cari, jalankan perintah hanya-baca, lalu di laporanmu sebutkan persis apa yang harus diubah dan di mana.'
    : !mintaTulis
      ? inggris
        ? 'Do not write any file: this role only reads. Report what should change instead.'
        : 'Jangan menulis berkas apa pun: peran ini hanya membaca. Laporkan apa yang perlu diubah.'
      : inggris
          ? 'You may change files within the scope of your task only.'
          : 'You may edit files, but only within the scope of your task.';
  const baris = inggris
    ? [
        'You are a SUBAGENT in a parallel task.',
        p ? `YOUR ROLE: ${p.label}` : '',
        p ? p.arahan : custom ? arahanCustom(custom, total) : '',
        '',
        `Your task (${total} subagents run at the same time): ${tugas}`,
        '',
        'RULES:',
        '- Do only the task above. Do not do another subagent task.',
        '- WORK WITH TOOLS, do not just explain. Use read_file/list_directory to look, grep/glob to find, and bash_run to run commands. Do not answer from memory when you can check.',
        tulis,
        '- WORK UNTIL DONE, then stop. Do not call tools after you have the answer.',
        '- Report findings clearly in your FINAL answer: what you found, in which file,',
        '  and a short conclusion. Give paths and line numbers where relevant.',
        '- If the task cannot be done, say why. Do not make things up.',
      ]
    : [
        "You are a SUBAGENT of Zephyr, a desktop code editor (Tauri 2 + React + TypeScript) running on the user's machine. You work inside that app on the user's workspace.",
        faktaInti(),
        petaFitur(),
        '',
        'You are a SUBAGENT on a parallel task.',
        p ? `PERANMU: ${p.label}` : '',
        p ? p.arahan : custom ? arahanCustom(custom, total) : '',
        '',
        `Tugasmu (${total} subagent berjalan bersamaan): ${tugas}`,
        '',
        'ATURAN:',
        '- Do ONLY the task above. Do not do another subagent\'s work.',
        '- DO THE WORK WITH TOOLS, do not just explain. Use read_file/list_directory to look around, grep/glob to find things, and bash_run to run commands. Do not answer from memory when you can check.',
        tulis,
        '- WORK UNTIL DONE, then stop. Do not call a tool after you already have the answer.',
        '- Report your findings as clearly as possible in the FINAL answer: what you found,',
        '  in which file, and a short conclusion. Name the path and line numbers when you have them.',
        '- If the task cannot be finished, say why. Do not make things up.',
      ];
  return baris.filter(Boolean).join('\n');
}

/* Prefix peran @cari/@kerja/... diturunkan dari daftar PERAN, bukan regex
   yang diketik tangan: salinan regex pernah menjadi sederet kegagalan senyap
   "Pending selamanya" begitu ada peran yang berubah tanpa regex ikut diubah. */
const POLA_PERAN_AWAL = new RegExp(`^\\s*@(${PERAN.map((p) => p.id).join('|')})\\b\\s*`, 'i');

export const useSubAgent = create<SubAgentState>((set, get) => ({
  agents: [],
  sibuk: false,
  ringkasan: null,
  sesiId: null,

  jalankan: async (tugas, opts) => {
    // Each entry may be a chain: `a -> b -> c` (text, split on `->`), or an
    // ALREADY-SPLIT array of steps (Experts passes structured chains so `->`
    // inside a task brief can never be mistaken for a separator, and a missing
    // depth slot is an empty string, which the wave builder skips below).
    const rantai = tugas
      .map((t) =>
        Array.isArray(t) ? t.map((s) => s.trim()) : pisahPipeline(t.trim()),
      )
      .filter((langkah) => langkah.length > 0)
      .slice(0, Math.max(batasParalel(), Math.min(8, opts?.batasOverride ?? 0)));
    if (rantai.length === 0) return 0;
    // `bersarang` is for a subagent that calls another subagent: it must not be
    // blocked by the global busy flag (which its own caller set).
    if (get().sibuk && !opts?.bersarang) return 0;

    const ai = useAi.getState();

    const setSub = useStore.getState().settings.subagent;
    const subModel = (setSub?.model ?? '').trim();
    // The batch default: the Subagents setting if set, otherwise the AI panel's
    // own model. A task can override it with the [model:...] tag below.
    const defDefault = subModel
      ? findModel(subModel, (setSub?.provider ?? '').trim() || undefined)
      : findModel(ai.model, ai.provider);
    const configuredCandidates: SubagentModelCandidate[] = daftarProvider(
      useStore.getState().settings.models.providers,
    ).flatMap((p) => {
      const hasKey = useAi.getState().hasKey(p.id);
      const ready = providerSiap(p, hasKey, useStore.getState().settings.models.providers);
      if (!ready) return [];
      /*
       * A custom gateway has no catalogue rows (`p.models` is empty), so its
       * models must come from what is actually configured: the typed ids plus
       * the provider's configured model. Reading only `p.models` meant a
       * sub-agent on `custom-ryuga` got zero candidates and silently ran on
       * whatever default the router picked.
       */
      const ids = [
        ...(p.models ?? []).map((m) => m.id),
        ...modelTersedia(p.id, [], useSettingsUi.getState().remoteModels[p.id] ?? [], []).map(
          (m) => m.id,
        ),
      ];
      return [...new Set(ids)].map((id) => {
        const meta = (p.models ?? []).find((m) => m.id === id);
        return {
          id,
          label: meta?.label || id,
          provider: p.id,
          available: true,
        } as SubagentModelCandidate;
      });
    });
    const sesiId = ai.activeId ?? ai.newChat();

    const buatAgent = (teks: string, i: number): SubAgent => {
      /*
       * A custom worker wins over the built-in guess, but only when the `[Name]`
       * actually matches a definition the user enabled. A typo then falls
       * through to the ordinary role guess rather than dying, which is the
       * friendlier failure: the work still gets done, just not by the persona
       * that was asked for.
       */
      const { custom, sisa: tanpaPrefix } = pisahCustom(teks);
      const { peran } = peranDariPrefix(teks);
      const defModel = custom?.model
        ? findModel(custom.model, custom.provider || undefined)
        : undefined;
      const { model, provider, sisa } = modelDariPrefix(tanpaPrefix);
      const { mcp, sisa: sisaTanpaMcp } = mcpDariTeks(sisa);
      /*
       * Tag `[effort:...]` dipotong SEBELUM teks tugas dibersihkan, supaya
       * `teksKeId` di expertsStore mencocokkan teks yang sama persis dengan
       * yang dikirim. Tanpa ini, baris tugas Experts tidak akan pernah
       * menemukan agentId-nya dan kartu task tetap "Pending" selamanya.
       */
      const { effort: effortTugas, sisa: sisaTanpaEffort } = effortDariTeks(sisaTanpaMcp);
      /* Token tugas Experts ([#tN]) dicopot SETELAH tag lain dan disimpan di
         baris: pemetaan tugas → agentId kini memakai token ini, karena teks
         brief dua tugas yang identik membuat pencocokan teks saling menimpa
         dan satu tugas tidak pernah kebagian agentId ("Pending" selamanya). */
      const { token: tokenTugas, sisa: sisaTanpaToken } = tokenDariTeks(sisaTanpaEffort);
      const tugasBersih =
        sisaTanpaToken.replace(POLA_PERAN_AWAL, '').trim() ||
        teks;
      const routed = routeSubagentModel({
        task: tugasBersih,
        candidates: configuredCandidates,
        chatFallback: { provider: ai.provider, model: ai.model },
      });
      /*
       * `[model:auto]` = model dipilih router, BUKAN model batch. Tanpa cabang
       * ini, setting Subagents (subModel) akan menang dan opsi Auto di Experts
       * hanya jadi label kosong.
       */
      const autoRoute = model?.trim().toLowerCase() === 'auto';
      const manualSource: SubagentModelSource = defModel
        ? 'manual-worker'
        : autoRoute
          ? 'auto'
          : model
            ? 'manual-task'
            : subModel
              ? 'manual-batch'
              : routed.source;
      const def =
        defModel ??
        (autoRoute
          ? findModel(routed.model, routed.provider)
          : model
            ? findModel(model, provider ?? undefined)
            : subModel
              ? defDefault
              : findModel(routed.model, routed.provider));
      return {
        id: `sub-${i}-${Math.random().toString(36).slice(2, 8)}`,
        nama: NAMA[i % NAMA.length],
        tugas: tugasBersih,
        peran: custom
          ? custom.alat.includes('multi_edit')
            ? 'kerja'
            : peran ?? 'cari'
          : peran ?? tebakPeran(tugasBersih),
        customId: custom?.id ?? null,
        customNama: custom?.nama ?? null,
        customIkon: custom?.ikon ?? null,
        mcpIzin: mcp,
        effort: effortTugas ?? undefined,
        tokenTugas: tokenTugas ?? null,
        status: 'menunggu' as SubStatus,
        langkah: [],
        hasil: '',
        error: null,
        mulai: Date.now(),
        selesai: null,
        nTool: 0,
        provider: def.provider,
        model: def.id,
        modelSource: manualSource,
        routingReason: manualSource === 'auto' || manualSource === 'chat-fallback'
          ? routed.reason
          : manualSource === 'manual-task'
            ? 'Explicit task model tag.'
            : manualSource === 'manual-worker'
              ? 'Custom worker model override.'
              : 'Subagent batch model setting.',
        verdict: 'tanpa-bukti' as const,
        fileDitulis: [],
        tulisDitolak: 0,
        kedalaman: opts?.kedalaman ?? 0,
        delegasiId: opts?.delegasiId ?? 'batch-0',
        inputTokens: null,
        outputTokens: null,
        costUsd: null,
      };
    };

    // Every agent is created up front so the panel shows the whole plan, then
    // each wave flips its agents to running.
    const agents: SubAgent[] = [];
    const waves: number[][] = [];
    const maksPanjang = Math.max(...rantai.map((r) => r.length));
    for (let w = 0; w < maksPanjang; w++) {
      const indeks: number[] = [];
      for (const langkah of rantai) {
        if (!langkah[w]) continue;
        indeks.push(agents.length);
        agents.push(buatAgent(langkah[w], agents.length));
      }
      waves.push(indeks);
    }

    set({ agents, sibuk: true, ringkasan: null, sesiId });

    /*
     * Record the batch on the conversation that started it.
     *
     * The session is the only place that outlives the panel: the reader closes
     * the AI column, the component that launched these agents unmounts, and
     * without this the ring in the sidebar and the section count would both
     * claim a conversation is idle while four agents are still writing files.
     *
     * One entry per agent (not per batch) because each can end differently and
     * a stopped one must stop spinning on its own.
     */
    const catatKeSesi = (entri: SesiLatar) => {
      if (!sesiId) return;
      useAi.getState().catatLatar(sesiId, entri);
    };
    for (const a of agents) {
      catatKeSesi({
        id: `sub:${a.id}`,
        jenis: 'subagent',
        nama: a.customNama || a.nama,
        mulai: a.mulai,
        status: 'menunggu',
      });
    }

    for (let wi = 0; wi < waves.length; wi++) {
      const gelombang = waves[wi];
      // Context for a later step: the results of every agent that already ran.
      const konteks =
        wi > 0
          ? get()
              .agents.filter((a) => a.selesai !== null)
              .map((a) => `- ${a.nama} (${a.tugas}): ${(a.hasil || a.error || '').slice(0, 400)}`)
              .join('\n')
          : '';
      await Promise.allSettled(
        gelombang.map((idx) => {
          const a = get().agents[idx];
          const cfg = useStore.getState().settings.models.providers[a.provider] ?? {};
          const defA = findModel(a.model, a.provider);
          return jalankanSatu(a, {
            provider: a.provider,
            model: a.model,
            baseUrl: cfg.baseUrl || undefined,
            maxTokens: defA.maxOut ?? 2048,
            effort: a.effort ?? ai.reasoningEffort ?? undefined,
            konteks,
            langkahOverride: opts?.langkahOverride,
            set,
            get,
          });
        }),
      );
    }

    const akhir = get().agents;
    const bagian = akhir.map((a) => {
      const statusTeks =
        a.status === 'selesai' ? 'SELESAI' : a.status === 'batal' ? 'DIBATALKAN' : 'GAGAL';
      const isi = a.hasil || a.error || '(no results)';
      // State the evidence next to the claim, so a reader can tell a verified
      // result from an agent that only talked.
      const bukti =
        a.verdict === 'terbukti'
          ? `${a.nTool} tool steps, all succeeded`
          : a.verdict === 'sebagian'
            ? `${a.nTool} tool steps, some failed — check`
            : 'NO tool step succeeded — the result is unproven';
      const file = a.fileDitulis.length ? `\nFiles written: ${a.fileDitulis.join(', ')}` : '';
      // A refused write is not a plain failure: the agent wanted to change a
      // file and the gate stopped it. Say which one it was.
      const tolak = a.tulisDitolak ? `\nWrite attempts refused: ${a.tulisDitolak}` : '';
      return `## ${a.nama} — ${statusTeks}\nTugas: ${a.tugas}\nBukti: ${bukti}${file}${tolak}\n\n${isi}`;
    });
    // Izin tulis didahulukan: tanpa kalimat ini pembaca ringkasan (agen utama
    // maupun user) tidak punya cara membedakan "sudah ditulis" dari "ditolak
    // lalu dilaporkan", dan yang kedua mudah terbaca sebagai yang pertama.
    const ringkasan = [catatanTulis(akhir), ...bagian].join('\n\n---\n\n');

    set({ sibuk: false, ringkasan });

    /*
     * Close the session-level entries with the real outcomes, in one pass.
     *
     * Done here rather than in `jalankanSatu` per agent: the terminal status is
     * already on each agent by now, and reading it once avoids a second place
     * that has to stay in sync with every early return inside the step loop.
     */
    for (const a of akhir) {
      catatKeSesi({
        id: `sub:${a.id}`,
        jenis: 'subagent',
        nama: a.customNama || a.nama,
        mulai: a.mulai,
        selesai: a.selesai ?? Date.now(),
        status:
          a.status === 'selesai'
            ? 'selesai'
            : a.status === 'batal'
              ? 'batal'
              : 'gagal',
        /* Finished while the reader was elsewhere - the badge the list shows. */
        belumDibaca: a.status === 'selesai',
      });
    }

    // Persist the finished batch so a restart does not lose it.
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ agents: get().agents, ringkasan }));
    } catch {
      // Quota or private mode; the in-memory result is still there.
    }

    return agents.length;
  },

  batal: (id) => {
    batalSet.add(id);
    const attemptId = activeAttempts.get(id);
    if (attemptId) {
      disarmWatchdog(attemptId);
      const r = resolvers.get(attemptId);
      resolvers.delete(attemptId);
      r?.({ content: '', toolCalls: [], cancelled: true });
      void cmd.aiCancel(attemptId);
    }
    lepasFileAgen(id);
    const a = get().agents.find((x) => x.id === id);
    if (a) {
      set((s) => ({
        agents: s.agents.map((x) =>
          x.id === id ? { ...x, status: 'batal', selesai: Date.now() } : x,
        ),
      }));
    }
  },

  batalSemua: () => {
    for (const a of get().agents) {
      if (a.status === 'jalan' || a.status === 'menunggu') get().batal(a.id);
    }
  },

  batalDelegasi: (delegasiId) => {
    for (const a of get().agents) {
      if (a.delegasiId === delegasiId && (a.status === 'jalan' || a.status === 'menunggu')) {
        get().batal(a.id);
      }
    }
  },

  ulangi: (id) => {
    const agent = get().agents.find((a) => a.id === id);
    if (!agent) return;
    // Only a stopped agent can be re-run: a live one already owns its slot, and
    // the batch cap would be exceeded by starting a second copy.
    if (agent.status === 'jalan' || agent.status === 'menunggu') return;
    if (get().sibuk && get().agents.filter((a) => a.status === 'jalan').length >= batasParalel()) return;

    /*
     * Reset in place, then hand the SAME task to the normal runner. Reusing the
     * runner (instead of duplicating its loop) is what keeps retry behaviour
     * identical to a first run — including the write permission rules and the
     * file-claim bookkeeping.
     */
    set((s) => ({
      agents: s.agents.map((x) =>
        x.id === id
          ? {
              ...x,
              status: 'menunggu',
              error: null,
              hasil: '',
              selesai: null,
              mulai: Date.now(),
              langkah: [],
            }
          : x,
      ),
    }));

    void get().jalankan([agent.tugas]);
  },

  bersihkan: () => {
    try {
      localStorage.removeItem(LS_KEY);
    } catch {
      /* nothing to clear */
    }
    set({ agents: [], ringkasan: null, sibuk: false, sesiId: null });
  },

  gantiModel: (id, model, provider) => {
    /*
     * Only the pin changes; the conversation is left alone.
     *
     * Swapping the model mid-run would not take effect anyway (the request is
     * already out), and clearing the history to force one would throw away the
     * files the agent just read. The next run, retry or follow-up picks the new
     * model up from these two fields.
     */
    set((s) => ({
      agents: s.agents.map((a) => (a.id === id ? { ...a, model, provider } : a)),
    }));
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ agents: get().agents, ringkasan: get().ringkasan }));
    } catch {
      /* quota full: the pin still applies for this session */
    }
  },

  /*
   * Continue a stopped or finished agent with a follow-up message.
   *
   * The stored history is the whole point: without it the follow-up would be a
   * fresh agent that knows nothing about the files it just read. The system
   * prompt is refreshed in place so a persona or tool change since the first
   * run still applies, then the follow-up is appended as a user turn and the
   * same step loop runs again.
   */
  lanjutkan: async (id, teks) => {
    const bersih = teks.trim();
    if (!bersih) return false;
    const agent = get().agents.find((a) => a.id === id);
    if (!agent || !agent.riwayat || agent.riwayat.length === 0) return false;
    // A follow-up needs the slot: refuse rather than queue, so the row cannot
    // sit in "waiting" behind a batch the user has already forgotten about.
    if (agent.status === 'jalan' || agent.status === 'menunggu') return false;

    const ai = useAi.getState();
    const setSub = useStore.getState().settings.subagent;
    const pilih = agent.model
      ? findModel(agent.model, agent.provider || undefined)
      : findModel(ai.model, ai.provider);

    const history = agent.riwayat.slice();
    // Refresh the system turn: a persona switch or a tool change since the
    // first run has to reach the model, and index 0 is always the system turn.
    if (history[0]?.role === 'system') {
      history[0] = {
        role: 'system',
        content: promptSub(agent.tugas, get().agents.length, agent.peran, agent.customId),
      };
    }
    history.push({ role: 'user', content: bersih });

    const catat = (fn: (a: SubAgent) => SubAgent) =>
      set((s) => ({ agents: s.agents.map((x) => (x.id === id ? fn(x) : x)) }));

    catat((a) => ({
      ...a,
      status: 'jalan',
      error: null,
      selesai: null,
      langkah: [
        ...a.langkah,
        { kind: 'pikir', teks: `lanjutan: ${bersih}`, ok: true, at: Date.now() },
      ],
      lanjutan: [...(a.lanjutan ?? []), { teks: bersih, waktu: Date.now(), hasil: '' }],
    }));
    set({ sibuk: true });
    batalSet.delete(id);

    try {
      const maksLangkah = batasLangkah();
      let terakhir = '';
      /* Daftar tawaran dibekukan sekali per lanjutan: penegakan "nama tidak
         ditawarkan = ditolak" membandingkan dengan SET yang sama dengan yang
         dikirim ke provider, bukan daftar yang bisa berbeda tiap langkah. */
      const bolehTulisPeran = bolehTulis() && (infoPeran(agent.peran)?.butuhTulis ?? false);
      const specDitawarkan = agentToolSpecs({
        bolehTulis: bolehTulisPeran,
        kedalaman: agent.kedalaman ?? 0,
        alat: agent.customId ? cariCustom(agent.customId)?.alat : undefined,
        mcp: agent.mcpIzin?.length ? agent.mcpIzin : undefined,
      });
      const ditawarkan = new Set(specDitawarkan.map((s) => s.name));
      for (let langkah = 0; langkah < maksLangkah; langkah++) {
        if (batalSet.has(id)) {
          catat((a) => ({ ...a, status: 'batal', selesai: Date.now() }));
          return true;
        }
        const res = await new Promise<AgentStepResult>((resolve) => {
          const attemptId = providerAttempt(id);
          activeAttempts.set(id, attemptId);
          resolvers.set(attemptId, resolve);
          armWatchdog(attemptId);
          cmd.aiToolChatStream({
            id: attemptId,
            provider: pilih.provider,
            model: pilih.id,
            messages: history as never,
            tools: specDitawarkan,
            fullUrl: fullUrlProvider(pilih.provider),
            maxTokens: setSub?.maxSteps ? 8192 : 8192,
            effort: agent.effort ?? useAi.getState().reasoningEffort ?? undefined,
          });
        });
        const attemptId = activeAttempts.get(id);
        if (attemptId) {
          disarmWatchdog(attemptId);
          resolvers.delete(attemptId);
          if (activeAttempts.get(id) === attemptId) activeAttempts.delete(id);
        }

        if (res.error) {
          catat((a) => ({ ...a, status: 'gagal', error: res.error ?? null, selesai: Date.now() }));
          return true;
        }
        if (res.cancelled) {
          catat((a) => ({ ...a, status: 'batal', selesai: Date.now() }));
          return true;
        }

        if (res.content.trim()) {
          terakhir = res.content.trim();
          catat((a) => ({ ...a, hasil: terakhir }));
        }

        if (!res.toolCalls || res.toolCalls.length === 0) {
          // No tools this turn: the model answered, so the follow-up is done.
          catat((a) => ({
            ...a,
            status: 'selesai',
            hasil: terakhir || a.hasil,
            selesai: Date.now(),
            riwayat: history.slice(),
            lanjutan: (a.lanjutan ?? []).map((x, i, arr) =>
              i === arr.length - 1 ? { ...x, hasil: terakhir } : x,
            ),
          }));
          return true;
        }

        history.push({ role: 'assistant', content: res.content, tool_calls: res.toolCalls });
        for (const tc of res.toolCalls) {
          if (batalSet.has(id)) {
            catat((a) => ({ ...a, status: 'batal', selesai: Date.now() }));
            return true;
          }
          const argsObj = (tc.args ?? {}) as Record<string, unknown>;
          /*
           * Satu gerbang untuk kedua loop: alasan penolakannya dibawa ke langkah
           * supaya UI bisa menyebut "ditolak izin", bukan "gagal" - dan supaya
           * jumlah penolakan sampai ke ringkasan yang dibaca agen utama.
           */
          const ctxT = siapkanTool(tc.name, argsObj, { agentId: id, ditawarkan, bolehTulisPeran });
          let hasil: string;
          let ok = true;
          if (!ctxT.putusan.boleh) {
            hasil = ctxT.putusan.pesan;
            ok = false;
          } else if (ctxT.konflik) {
            const pemilik = get().agents.find((a) => a.id === ctxT.konflik);
            const disenggol =
              ctxT.targets.find((t) => pemilikSaatIni(t) === ctxT.konflik) ?? ctxT.targets[0];
            hasil =
              `(refused: ${disenggol} is being worked on by subagent "${pemilik?.nama ?? ctxT.konflik}". ` +
              'Work on another file or wait for that subagent to finish.)';
            ok = false;
          } else {
            for (const p of ctxT.targets) klaimFile(id, p);
            try {
              const { jalankanAgentTool } = await import('./agentTools');
              hasil = await jalankanAgentTool(ctxT.namaJalan, ctxT.args);
              if (ctxT.targets.length) {
                catat((a) => ({
                  ...a,
                  fileDitulis: ctxT.targets.reduce(
                    (daftar, p) => (daftar.includes(p) ? daftar : [...daftar, p]),
                    a.fileDitulis,
                  ),
                }));
              }
            } catch (e) {
              hasil = `ERROR: ${cmd.asZephyrError(e).message}`;
              ok = false;
            }
          }

          catat((a) => ({
            ...a,
            nTool: a.nTool + 1,
            tulisDitolak: ctxT.tulisDitolak ? (a.tulisDitolak ?? 0) + 1 : (a.tulisDitolak ?? 0),
            langkah: [
              ...a.langkah,
              {
                kind: 'tool',
                nama: ctxT.namaTampil,
                args: JSON.stringify(argsObj).slice(0, 300),
                hasil: hasil.slice(0, 2000),
                ok,
                ditolakTulis: ctxT.tulisDitolak,
                at: Date.now(),
              },
            ],
          }));
          history.push({
            role: 'tool',
            content: hasil,
            tool_call_id: tc.id,
            name: tc.name,
          });
        }
      }
      catat((a) => ({
        ...a,
        status: 'gagal',
        error: `melewati batas ${maksLangkah} langkah`,
        selesai: Date.now(),
        riwayat: history.slice(),
      }));
    } catch (e) {
      catat((a) => ({
        ...a,
        status: 'gagal',
        error: cmd.asZephyrError(e).message,
        selesai: Date.now(),
      }));
    } finally {
      disarmWatchdog(id);
      resolvers.delete(id);
      batalSet.delete(id);
      set({ sibuk: false });
      lepasFileAgen(id);
    }
    return true;
  },

  sorotId: null,
  sorot: (id) => set({ sorotId: id }),

  muatTersimpan: () => {
    // Restore once; a later run overwrites this.
    if (get().agents.length > 0 || get().sibuk) return;
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { agents?: SubAgent[]; ringkasan?: string | null };
      if (!Array.isArray(parsed.agents) || parsed.agents.length === 0) return;
      /*
       * Hanya status terminal yang boleh lolos apa adanya.
       *
       * Daftar yang disimpan bisa berasal dari versi aplikasi yang lebih lama,
       * dan status yang tidak dikenal (atau kosong karena entri rusak) akan
       * diteruskan ke panel - di sana ia bukan 'selesai' maupun 'jalan', jadi
       * barisnya tampil berputar selamanya tanpa apa pun yang menghentikannya.
       * Apa pun yang tidak dikenal diperlakukan sebagai gagal, karena itu satu-
       * satunya keadaan yang masih bisa user tindak lanjuti.
       */
      const terminal = new Set<SubStatus>(['selesai', 'gagal', 'batal']);
      const agents = parsed.agents.map((a) => {
        if (a.status === 'jalan' || a.status === 'menunggu') {
          // A row still "running" when the app closed has no live call. Show it
          // as failed with a reason, not as endlessly spinning.
          return {
            ...a,
            status: 'gagal' as SubStatus,
            error: a.error ?? 'interrupted by a restart',
            selesai: a.selesai ?? Date.now(),
          };
        }
        if (!terminal.has(a.status)) {
          return {
            ...a,
            status: 'gagal' as SubStatus,
            error: a.error ?? `status tidak dikenal dari data tersimpan: ${String(a.status)}`,
            selesai: a.selesai ?? Date.now(),
          };
        }
        return a;
      });
      set({ agents, ringkasan: parsed.ringkasan ?? null, sibuk: false, sesiId: null });
    } catch {
      // A corrupt entry must never block start-up.
    }
  },
}));

async function jalankanSatu(
  agent: SubAgent,
  ctx: {
    provider: string;
    model: string;
    baseUrl?: string;
    maxTokens: number;
    effort?: 'minimal' | 'low' | 'medium' | 'high' | 'ultra';
    /** Results of earlier pipeline steps that this task depends on. */
    konteks?: string;
    /** Batas langkah khusus batch ini (Experts); kosong = setelan global. */
    langkahOverride?: number;
    set: (fn: (s: SubAgentState) => Partial<SubAgentState>) => void;
    get: () => SubAgentState;
  },
): Promise<void> {
  const { set, get } = ctx;
  const ubah = (fn: (a: SubAgent) => SubAgent) =>
    set((s) => ({ agents: s.agents.map((x) => (x.id === agent.id ? fn(x) : x)) }));

  const tambahLangkah = (l: SubStep) =>
    ubah((a) => ({ ...a, langkah: [...a.langkah, l] }));

  ubah((a) => ({ ...a, status: 'jalan', mulai: Date.now() }));

  const history: {
    role: string;
    content: string;
    tool_call_id?: string;
    tool_calls?: unknown;
    name?: string;
  }[] = [
    {
      role: 'system',
      content: promptSub(agent.tugas, get().agents.length, agent.peran, agent.customId),
    },
    {
      role: 'user',
      content: ctx.konteks
        ? `${agent.tugas}\n\nResults from the previous step (use these, do not redo the work):\n${ctx.konteks}`
        : agent.tugas,
    },
  ];

  try {
    const maksLangkah = ctx.langkahOverride ?? batasLangkah();
    /* Daftar tawaran + gerbang peran dibekukan sekali per agent: penegakan
       "nama tidak ditawarkan = ditolak" membandingkan dengan SET yang sama
       dengan yang dikirim ke provider. */
    const bolehTulisPeran = bolehTulis() && (infoPeran(agent.peran)?.butuhTulis ?? false);
    const specDitawarkan = agentToolSpecs({
      bolehTulis: bolehTulisPeran,
      kedalaman: agent.kedalaman ?? 0,
      alat: agent.customId ? cariCustom(agent.customId)?.alat : undefined,
      mcp: agent.mcpIzin?.length ? agent.mcpIzin : undefined,
    });
    const ditawarkan = new Set(specDitawarkan.map((s) => s.name));
    for (let langkah = 0; langkah < maksLangkah; langkah++) {
      if (batalSet.has(agent.id)) {
        ubah((a) => ({ ...a, status: 'batal', selesai: Date.now() }));
        return;
      }

      const res = await new Promise<AgentStepResult>((resolve) => {
        const coba = providerAttempt(agent.id);
        activeAttempts.set(agent.id, coba);
        resolvers.set(coba, resolve);
        armWatchdog(coba);
        cmd
          .aiToolChatStream({
            id: coba,
            provider: ctx.provider,
            model: ctx.model,
            messages: history as never,
            // Offer only the tools this agent may use: a read-only role never
            // sees a write tool, so it cannot spend a turn calling one.
            tools: specDitawarkan,
            baseUrl: ctx.baseUrl,
            fullUrl: fullUrlProvider(ctx.provider),
            maxTokens: ctx.maxTokens,
            effort: ctx.effort,
          })
          .catch((e) => {
            /* Kunci resolver = attemptId (kunci `resolvers`), BUKAN agent.id —
               dulu `.catch` membaca kunci yang salah, sehingga error transport
               tidak pernah me-resolve janjinya: langkah menggantung sampai
               watchdog, lalu dilaporkan "idle timeout" alih-alih error aslinya. */
            if (resolvers.get(coba) === resolve) {
              resolvers.delete(coba);
              disarmWatchdog(coba);
              resolve({
                content: '',
                toolCalls: [],
                cancelled: false,
                error: cmd.asZephyrError(e).message,
              });
            }
          });
      });
      const attemptId = activeAttempts.get(agent.id);
      if (attemptId) {
        disarmWatchdog(attemptId);
        resolvers.delete(attemptId);
        if (activeAttempts.get(agent.id) === attemptId) activeAttempts.delete(agent.id);
      }

      if (res.error) throw new Error(res.error);
      if (res.cancelled) {
        ubah((a) => ({ ...a, status: 'batal', selesai: Date.now() }));
        return;
      }

      if (res.content.trim()) {
        tambahLangkah({ kind: 'pikir', teks: res.content, at: Date.now() });
      }

      history.push({ role: 'assistant', content: res.content, tool_calls: res.toolCalls });
      if (res.toolCalls.length === 0) {

        ubah((a) => ({
          ...a,
          status: 'selesai',
          hasil: res.content.trim() || a.hasil,
          selesai: Date.now(),
          ...pakaiToken(a, res.usage),
        }));
        return;
      }

      for (const tc of res.toolCalls) {
        if (batalSet.has(agent.id)) {
          ubah((a) => ({ ...a, status: 'batal', selesai: Date.now() }));
          return;
        }
        const argsObj = (tc.args ?? {}) as Record<string, unknown>;
        // Gerbang yang sama dengan loop lanjutan (siapkanTool): satu keputusan,
        // satu tempat — termasuk bongkar tool_call, tolak nama tak ditawarkan,
        // dan gerbang peran.
        const ctxT = siapkanTool(tc.name, argsObj, {
          agentId: agent.id,
          ditawarkan,
          bolehTulisPeran,
        });
        let hasil: string;
        let ok = true;
        if (!ctxT.putusan.boleh) {
          hasil = ctxT.putusan.pesan;
          ok = false;
        } else if (ctxT.konflik) {
          const pemilik = get().agents.find((a) => a.id === ctxT.konflik);
          const disenggol =
            ctxT.targets.find((t) => pemilikSaatIni(t) === ctxT.konflik) ?? ctxT.targets[0];
          hasil =
            `(refused: ${disenggol} is being worked on by subagent "${pemilik?.nama ?? ctxT.konflik}". ` +
            'Work on another file or wait for that subagent to finish.)';
          ok = false;
        } else {
          // Claim EVERY path this call touches. A second agent handed the same
          // file is refused rather than allowed to overwrite the first's work.
          for (const p of ctxT.targets) klaimFile(agent.id, p);
          try {
            const { jalankanAgentTool } = await import('./agentTools');
            hasil = await jalankanAgentTool(ctxT.namaJalan, ctxT.args);
            // A write tool that actually succeeded is evidence for the verdict.
            if (ctxT.targets.length) {
              ubah((a) => ({
                ...a,
                fileDitulis: ctxT.targets.reduce(
                  (daftar, p) => (daftar.includes(p) ? daftar : [...daftar, p]),
                  a.fileDitulis,
                ),
              }));
            }
          } catch (e) {
            hasil = `ERROR: ${cmd.asZephyrError(e).message}`;
            ok = false;
          }
        }

        tambahLangkah({
          kind: 'tool',
          nama: ctxT.namaTampil,
          args: JSON.stringify(argsObj).slice(0, 300),
          hasil: hasil.slice(0, 2000),
          ok,
          ditolakTulis: ctxT.tulisDitolak,
          at: Date.now(),
        });
        ubah((a) => ({
          ...a,
          nTool: a.nTool + 1,
          tulisDitolak: ctxT.tulisDitolak ? (a.tulisDitolak ?? 0) + 1 : (a.tulisDitolak ?? 0),
        }));

        history.push({
          role: 'tool',
          content: hasil,
          tool_call_id: tc.id,
          name: tc.name,
        });
      }
    }

    ubah((a) => ({
      ...a,
      status: 'gagal',
      error: `melewati batas ${maksLangkah} langkah`,
      selesai: Date.now(),
    }));
  } catch (e) {
    ubah((a) => ({
      ...a,
      status: 'gagal',
      error: cmd.asZephyrError(e).message,
      selesai: Date.now(),
    }));
  } finally {
    disarmWatchdog(agent.id);
    resolvers.delete(agent.id);
    batalSet.delete(agent.id);
    // The verdict reads the agent's own steps, not its summary: a claim of
    // "done" backed by failed tools is not a result.
    ubah((a) => {
      const gagal = a.langkah.filter((l) => l.kind === 'tool' && l.ok === false).length;
      const sukses = a.langkah.filter((l) => l.kind === 'tool' && l.ok === true).length;
      const verdict = sukses === 0 ? 'tanpa-bukti' : gagal > 0 ? 'sebagian' : 'terbukti';
      /*
       * Keep the conversation for a top-level agent so the user can send a
       * follow-up after it stops or finishes. A nested agent is skipped: its
       * parent batch owns the run, and nothing can type at it afterwards.
       */
      const simpanRiwayat = (agent.kedalaman ?? 0) === 0 && history.length > 2;
      return {
        ...a,
        verdict,
        ...(simpanRiwayat ? { riwayat: history.slice() } : {}),
      };
    });
    // Free every file this agent held so a later batch can use it.
    lepasFileAgen(agent.id);
  }
}

export function subagentOnChunk(c: {
  id: string;
  toolDone?: boolean;
  content?: string;
  toolCalls?: { id: string; name: string; args: unknown }[];
  cancelled?: boolean;
  err?: string;
}): boolean {
  const r = resolvers.get(c.id);
  // An attempt id remains recognized after its resolver is released, so a late
  // terminal event cannot fall through to the main AI store.
  if (!r) return subagentAttempts.has(c.id);

  if (!c.toolDone) {
    armWatchdog(c.id);
    return true;
  }
  disarmWatchdog(c.id);
  resolvers.delete(c.id);
  if (c.err) {
    r({ content: '', toolCalls: [], cancelled: false, error: c.err });
    return true;
  }
  r({
    content: c.content ?? '',
    toolCalls: c.toolCalls ?? [],
    cancelled: !!c.cancelled,
  });
  return true;
}

/**
 * The file-ownership table for diagnostics and tests. Keys are normalised
 * paths, values are the owning subagent id. Empty when nothing is mid-write.
 */
export function pemilikFileSnapshot(): Record<string, string> {
  return Object.fromEntries(pemilikFile);
}
