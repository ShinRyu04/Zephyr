import { create } from 'zustand';
import { subagentOnChunk } from './subagentStore';
import {
  HYDRA_ID_PREFIX,
  HYDRA_MAKS_ESKALASI,
  bacaPengaturan,
  hydraAmbil,
  hydraCatat,
  hydraLihat,
  hydraLupakan,
  hydraSiapkan,
  jalankanHydra,
  kandidatHydra,
  rencanaHydra,
  type HydraLapor,
  type HydraTerakhir,
} from './hydraFusion';
import { pilihHydra, HYDRA_MODEL_ID } from './hydraModel';
import { kecilkanGambar } from './gambarKecil';
import {
  BATAS_LEG_MS,
  bacaPutusanKritik,
  jumlahkanPemakaian,
  legHarusBerhenti,
  pesanKritik,
  pesanRevisi,
  pilihKritikus,
  type HydraPemakaian,
} from './hydraAgent';
import {
  mengulangDominan,
  mengulangPelarian,
  REPETITION_LOOP_INTERRUPTED,
} from './repeatDetect';
import * as cmd from './commands';
import { useStore } from './store';
import {
  findModel,
  isPlaceholderModel,
  MODEL_FALLBACK,
  PROVIDER_AUTO,
  PROVIDER_BY_ID,
  providerEfektif,
} from './modelCatalog';
import { buatJendela, jatahJendela, JENDELA_PROVIDER, type JendelaKredensial } from './providerTahan';
import { useSettingsUi } from './settingsStore';
import { expandPromptBody } from './promptLibrary';
import { stopLoop, startLoop, parseInterval, formatInterval, MAX_LOOP_RUNS, type LoopState } from './loopJadwal';
import { activeSelection } from './editorRegistry';
import { useAiDebug } from './aiDebugStore';
import { useToolGate, TOOL_DISK_TULIS } from './toolGate';
import {
  alatRencanaPertama,
  catatAlatTerakhir,
  gerbangRencanaSiap,
  tugasBerat,
} from './subsetAlat';
/* LAMA-a1 (subset tool <= 20 per giliran) + LAMA-a4 (paksa todo di tugas berat).
   Modulnya murni dan tidak mengubah apa pun sampai dipanggil dari sini. */
import { pilihToolTugas, wajibTodo } from './subsetTugas';
import { evaluasiUntukPanggilan } from './toolRules';
import {
  agentToolSpecs,
  jalankanAgentTool,
  AGENT_TOOLS,
  ambilGambarMenunggu,
  clearGambarMenunggu,
  TOOL_TULIS,
} from './agentTools';
import {
  perkiraanKonteks,
  batasAutoCompact,
  AUTO_COMPACT_AT,
  AUTO_COMPACT_KEEP,
  AUTO_COMPACT_COOLDOWN_STEPS,
  ringkasUkuran,
  pilihModelCadangan,
  PAYLOAD_MAX_CHARS,
  ukuranPayload,
} from './contextBudget';
import type { AiChunk, AiMessage, AgentMsg, AgentToolCall, AgentToolRun, ApprovalMode, ChatMsg, ChatSession, PublicModel } from './types';
import { TOOL_CATALOG } from './zephyrTools/catalog';
import { agentStopMessage, type AgentFailureCategory, type AgentStopReason } from './agentStop';

// Re-exported so existing importers keep working; agentStop.ts is the one
// definition. Two copies of this union would drift the moment one is widened.
export type { AgentFailureCategory } from './agentStop';

/*
 * BUG-ANGGARAN-PESAN - kalimat yang ditempel SETELAH pemotongan.
 *
 * Tiga kalimat disisipkan ke daftar pesan setelah `ringkasRiwayat()` selesai
 * bekerja (status pekerjaan, gerbang rencana, koreksi argumen), jadi ukurannya
 * tidak pernah ikut dihitung cap. Sebelum ini panjangnya tak terbatas: pada
 * beban 44 giliran satu catatan status saja mencapai 2.023 char dan payload
 * yang benar-benar dikirim melewati PAYLOAD_MAX_CHARS di SETIAP giliran.
 *
 * Dua konstanta menutupnya:
 *   - KALIMAT_PASCA_POTONG_CHARS: envelope yang DISISIHKAN di `capUntukPesan`
 *     supaya kalimat-kalimat ini punya ruangnya sendiri, bukan memakan ruang
 *     riwayat tanpa tercatat;
 *   - CATATAN_MAKS_CHARS: batas keras satu catatan, dijaga `potongCatatan`.
 */
export const KALIMAT_PASCA_POTONG_CHARS = 3_000;
/*
 * 240, bukan 1.200 seperti usulan awal dokumen. Dengan beban 44 giliran (baca
 * ~6 KB per giliran) blok tetap saja sudah 23.793 char dari anggaran 40.000,
 * dan katalog tool menahan 14.844 char di kabel - sisa untuk SELURUH percakapan
 * tinggal ~1.363 char, yang sudah dipakai pesan terakhir hasil potong (~505
 * char) plus pembungkusnya. Headroom terukur untuk catatan cuma ~366 char.
 * Menyetel 1.200 membuat payload tetap lewat batas (terukur 40.975 char); 240
 * adalah nilai bulat terbesar yang muat dengan margin. Menaikkannya menuntut
 * anggaran model dinaikkan / system prompt & katalog tool dikuruskan - itu
 * keputusan pemilik, bukan sesuatu yang boleh disembunyikan di sini.
 */
export const CATATAN_MAKS_CHARS = 240;

/**
 * Potong satu catatan pasca-pemotongan agar tidak melebihi anggaran pesan.
 *
 * Dipotong pada batas baris bila memungkinkan supaya item rencana tidak
 * terbelah di tengah; ekornya diganti penanda yang menyebut ukuran aslinya,
 * jadi model (dan pembaca log) tahu ada yang disembunyikan - bukan pemotongan
 * diam-diam.
 */
export function potongCatatan(teks: string, maks = CATATAN_MAKS_CHARS): string {
  if (teks.length <= maks) return teks;
  const penanda = `\n[...catatan dipotong: ${teks.length} -> ${maks} char]`;
  const jatah = Math.max(0, maks - penanda.length);
  const kasar = teks.slice(0, jatah);
  const batasBaris = kasar.lastIndexOf('\n');
  const isi = batasBaris > jatah / 2 ? kasar.slice(0, batasBaris) : kasar;
  return `${isi}${penanda}`;
}

/*
 * LANE ANTREAN-LIVE (item C) - pesan yang diketik SEMENTARA agen bekerja.
 *
 * Dua modul murni yang sudah ada dan sudah diuji dipakai APA ADANYA di sini; tidak
 * ada aturan antrean atau aturan penyusunan giliran yang disalin ke berkas ini:
 *   * `antreanPesan.ts`  - keputusan masuk/penuh/terlalu panjang, dan pengambilan
 *                          kepala antrean saat giliran selesai;
 *   * `suntikKonteks.ts` - susunan giliran (konteks -> riwayat -> antrean -> tugas
 *                          -> permintaan), sensor rahasia, blok wajib utuh, plus
 *                          titik sisip `sisipKeDepanEkor`.
 */
import { giliranSelesaiPanel, rencanaMasukSaatSibuk } from './antreanPesan';
import { giliranAntreanKeRiwayat, sisipKeDepanEkor } from './suntikKonteks';

/*
 * Read-only tools, derived from the catalog instead of typed out by hand.
 *
 * A hand-kept list of names silently stops matching the moment a tool is
 * renamed, and then the coalescing and the parallel-read batch quietly never
 * fire. The catalog already classifies every tool, so it is the only list that
 * can stay correct.
 */
const TOOL_BACA: readonly string[] = TOOL_CATALOG.filter((t) => t.effect === 'read').map((t) => t.name);
const TOOL_BACA_SET: ReadonlySet<string> = new Set(TOOL_BACA);
const TOOL_BACA_DIPARALELKAN = new Set(TOOL_BACA);
/*
 * Web reads (`web_search`, `web_fetch`, `browser_read`, ...) are classified
 * `net`, not `read`, because they touch the network. For the no-progress guard
 * they behave like reads - gathering material is work - so they are collected
 * here rather than being lumped in with passive steps.
 */
const TOOL_NET_SET: ReadonlySet<string> = new Set(
  /* Only pure `net` (search/fetch/read). `netWrite` (browser_click/type) changes
     remote state and is handled like a writer. */
  TOOL_CATALOG.filter((t) => t.effect === 'net').map((t) => t.name),
);

const LS_KEY = 'zephyr.ai.sessions.v1';

/*
 * Satu pesan di antrian kirim.
 *
 * `id` stabil dan dibuat saat masuk antrian, bukan indeks array. Baris antrian
 * bisa dinaikkan/diturunkan, jadi indeks yang sama bisa menunjuk pesan berbeda
 * setelah reorder: identitas baris (mis. yang sedang diedit inline di AiPanel)
 * harus ikut item, bukan posisinya. `id` opsional supaya antrian lama yang
 * sudah tersimpan tanpa id tetap bisa dibaca.
 */
export interface AntrianPesan {
  id?: string;
  teks: string;
  images: string[];
}

/*
 * A standing goal for one chat.
 *
 * `/goal <text>` sets it and starts working on it; the agent keeps going across
 * turns until the goal is marked done or cleared. `startedAt` is kept so the
 * strip can show how long the goal has been open - measured from when it was
 * SET, so a panel reopen or a chat switch does not restart the clock.
 */
export interface GoalState {
  text: string;
  startedAt: number;
  /** Set when the user marks it done; the strip then shows it struck through. */
  completedAt: number | null;
}

let urutAntrian = 0;
const idAntrian = () => `q${Date.now().toString(36)}-${(urutAntrian += 1).toString(36)}`;

/** Posisi item antrian dari id stabilnya, atau dari indeks kalau id tidak ada. */
const posisiAntrian = (arr: AntrianPesan[], idx: number | string): number => {
  if (typeof idx === 'string') {
    const pos = arr.findIndex((a) => a.id === idx);
    return pos >= 0 ? pos : -1;
  }
  return idx;
};

const cocokAntrian = (a: AntrianPesan, i: number, idx: number | string) =>
  typeof idx === 'string' ? a.id === idx : i === idx;

/* ── LANE ANTREAN-LIVE (item C): giliran berikutnya dari antrean pesan ────── */

/**
 * Kepala pesan yang diketik SEMENTARA run berjalan.
 *
 * Dipertahankan dari jalur lama apa adanya: tanpa kalimat ini model memperlakukan
 * pesan yang datang di tengah pekerjaan sebagai permintaan baru yang menunggu run
 * kelar - persis kelakuan yang item C keluhkan.
 */
const KEPALA_PESAN_SEMENTARA =
  'Pesan dari pengguna SEMENTARA kamu bekerja - baca SEKARANG, jangan tunggu run selesai:';

/**
 * Suntikkan giliran dari antrean pesan ke `history` yang SEDANG berjalan.
 *
 * Dipanggil di awal tiap langkah, di titik yang sudah dipakai jalur lama: di situ
 * `history` berakhir dengan hasil tool langkah sebelumnya, dan satu giliran `user`
 * SESUDAH hasil tool tidak membelah pasangan assistant<->tool (yang memicu 400).
 *
 * Seluruh keputusannya DISERAHKAN ke modul murni yang sudah diuji: siapa yang
 * diproses dari `antreanPesan.giliranSelesaiPanel` (kepala antrean LANGSUNG
 * diproses, sisanya tetap menunggu), susunannya dari `suntikKonteks` (urutan
 * konteks -> riwayat -> antrean -> tugas -> permintaan, rahasia disensor, blok
 * wajib tidak pernah dipotong), titik sisipnya `sisipKeDepanEkor`. Tidak ada aturan
 * antrean atau penyusunan yang disalin ke berkas ini.
 *
 * `konteks`/`riwayat` sengaja TIDAK diisi: keduanya sudah ada di `history`
 * (konteks workspace dimuat jalurnya sendiri), jadi yang disuntikkan di sini hanya
 * pekerjaan yang BELUM selesai - pesan mengantre, tugas, dan permintaan giliran ini.
 * Menyuntik ulang riwayat akan menggandakan percakapan.
 */
function suntikGiliranAntrean(
  antri: readonly AntrianPesan[],
  history: AgentMsg[],
  todos: ReadonlyArray<{ content: string; status: string }>,
): { kepala: string | null; ringkas: string } {
  const giliran = giliranSelesaiPanel(antri, { sibuk: true });
  if (!giliran.langsungDiproses) {
    return { kepala: null, ringkas: giliran.laporan };
  }
  const kepala = giliran.langsungDiproses;
  const adaTeks = kepala.teks.trim().length > 0;
  const susunan = giliranAntreanKeRiwayat({
    langsungDiproses: { id: kepala.id, teks: kepala.teks, images: kepala.images },
    antrean: giliran.keadaan,
    tugasBelumSelesai: tugasBelumSelesaiRiwayat(history, todos),
    konteks: null,
    riwayat: [],
  });
  const blok: AgentMsg[] = susunan.blok.map((p, i) => ({
    role: p.peran,
    content: i === 0 ? `${KEPALA_PESAN_SEMENTARA}\n${p.teks}` : p.teks,
  }));
  /*
   * Catatan gambar dipertahankan dari jalur lama apa adanya: gambar yang ditempel
   * pada pesan mengantre tidak ikut dikirim ke tengah run (`history` hanya membawa
   * teks), dan model harus tahu itu supaya tidak mengaku sudah melihatnya.
   *
   * Dua jalur, karena `susunGiliran` tidak membuat blok dari permintaan tanpa teks
   * (dan itu benar - blok kosong tidak ada gunanya): kalau baris antrean itu hanya
   * berisi gambar, catatannya berdiri sendiri; kalau ada teks, catatannya menempel
   * di blok permintaan yang jadi giliran ini.
   */
  const jumlahGambar = kepala.images.length;
  if (!adaTeks && jumlahGambar > 0) {
    blok.push({
      role: 'user',
      content:
        `${KEPALA_PESAN_SEMENTARA}\n(gambar yang ditempel pada pesan selagi kamu bekerja TIDAK ` +
        'diteruskan ke tengah run; sebut di ringkasan akhir kalau gambar itu masih perlu dilihat.)',
    });
  } else if (jumlahGambar > 0 && blok.length > 0) {
    const terakhir = blok.length - 1;
    blok[terakhir] = {
      ...blok[terakhir],
      content:
        `${blok[terakhir].content}\n\n(${jumlahGambar} gambar terlampir TIDAK diteruskan ke tengah ` +
        'run; sebut di ringkasan akhir kalau gambar itu masih perlu dilihat.)',
    };
  }
  if (blok.length === 0) {
    return { kepala: null, ringkas: susunan.ringkas };
  }
  const baru = sisipKeDepanEkor(history, blok, (m) => m.role === 'tool');
  history.length = 0;
  for (const m of baru) history.push(m);
  return { kepala: adaTeks ? kepala.teks : '(baris antrean tanpa teks - hanya gambar)', ringkas: susunan.ringkas };
}

// Old session titles from versions before the UI was standardised to English — mapped
// back when loaded so already-saved history also shows up in English.
const JUDUL_LAMA = new Set(['Chat baru', 'New Chat', 'Neuer Chat', 'Nueva conversación']);

export const MAX_MSGS = 200;

export const ATTACH_LIMIT = 12 * 1024;

export const MSG_LIMIT = 8 * 1024;

export const MAX_IMAGES = 10;

/*
 * Shrinks currently in flight, so `send()` can wait for them.
 *
 * Module-level on purpose: the attachment is added by a component, but the
 * message is sent by the store, and the two must not race. A reader who pastes
 * a screenshot and presses Enter immediately must get the image attached, not
 * an empty message that silently lost it.
 */
const gambarMenunggu = new Set<Promise<void>>();

/** Resolve once every pending attachment shrink has landed. */
async function tungguGambar(): Promise<void> {
  while (gambarMenunggu.size > 0) {
    await Promise.allSettled([...gambarMenunggu]);
  }
}

export const IMAGE_MAX_BYTES = 3_500_000;

export const PERSIST_TOOL_CHARS = 4000;

/*
 * 6 steps, was 8. The window is what keeps the agent responsive: every step
 * re-sends the whole trimmed history, so each extra step kept here is paid
 * again on every request. Six still covers the working set the model needs to
 * reason about (the file it just read, the edit it just made), and older turns
 * are already represented by the summary note `ringkasRiwayat` inserts.
 */
export const HISTORY_KEEP_STEPS = 6;

/*
 * 500 chars, was 1200. Only old turns are clipped here: a tool result produced
 * during the current step is pushed to `history` untrimmed and reaches the
 * model in full until it ages out of HISTORY_KEEP_STEPS. Measured reports put
 * step 14 in the tens of thousands of tokens, and most of that is stale file
 * dumps and subagent transcripts the model has already acted on. Cutting the
 * archived copy to 500 chars drops the per-step token cost roughly 2.4x on tool
 * heavy runs, while the note appended to each clipped result tells the model it
 * can re-run the tool if it genuinely needs the lost tail.
 */
export const HISTORY_TOOL_CHARS = 500;

/*
 * How much of the clipped budget goes to the END of a long tool result.
 *
 * The tail is not a nicety. A build or test log puts its verdict at the bottom
 * — `error: could not compile`, the `N failed` summary, the stack trace — while
 * the head is boilerplate ("Compiling zephyr v1.1", warning banners, the
 * command echo). Keeping only the first 500 characters therefore handed the
 * model the one part of a failing run that never says what failed, and it
 * concluded from a listing that had lost its conclusion.
 *
 * 40% is enough for a compiler error block plus its surrounding context, and
 * leaves 60% for the head where the command and early warnings live.
 */
export const HISTORY_TOOL_TAIL_RATIO = 0.4;

/**
 * Clip a long tool result for the archived history, keeping BOTH ends.
 *
 * Head-only clipping silently drops the conclusion of any log-shaped result,
 * which is the failure this exists to prevent. The middle is what gets dropped:
 * for a build log that is the least informative part, and for a file dump the
 * head plus tail still shows the shape and the ending.
 *
 * The note says what was lost and how to get it back, so a model that really
 * needs the middle re-runs the tool or reads the file with offset/limit rather
 * than guessing from an incomplete listing.
 */
export function potongHasilRiwayat(isi: string, batas: number = HISTORY_TOOL_CHARS): string {
  if (isi.length <= batas) return isi;
  const ekor = Math.floor(batas * HISTORY_TOOL_TAIL_RATIO);
  const kepala = batas - ekor;
  const hilang = isi.length - kepala - ekor;
  return (
    `${isi.slice(0, kepala)}\n` +
    `[… ${hilang} characters in the middle are not sent: this is the head and the tail of the result]\n` +
    `${isi.slice(isi.length - ekor)}`
  );
}

import { systemPromptFor, identityReminder, aturanProyek, konteksMemoriProyek } from './systemPrompt';
import { kumpulkanDariApp, setPotretKeadaan } from './aiZephyrState';
import { muatLengkap as muatMemoriSesi } from './aiMemori';

/*
 * Segarkan potret keadaan runtime SEBELUM prompt dirakit (ai-tahu-100-2 /
 * ext-sadar).
 *
 * `systemPromptFor` sinkron, sedangkan membaca store yang benar-benar dipakai
 * UI (manifest ekstensi lewat perintah Tauri, status LSP, port MCP, updater)
 * butuh async - dan perintah Tauri yang menggantung tidak boleh menahan sebuah
 * giliran. Karena itu pengumpulannya ditempelkan ke `Promise.all` yang sudah
 * ada di kedua titik perakitan prompt, bukan dijadikan async di dalam perakit
 * prompt.
 *
 * Batas 2,5 detik: potret yang tidak selesai tepat waktu dianggap tidak ada dan
 * giliran tetap jalan dengan blok cadangan. Kegagalan di sini tidak pernah
 * menjatuhkan giliran - blok keadaan bukan syarat sebuah giliran bisa dikirim.
 */
const POTRET_BATAS_MS = 2500;

async function segarkanPotretKeadaan(): Promise<void> {
  try {
    const batas = new Promise<null>((r) => setTimeout(() => r(null), POTRET_BATAS_MS));
    setPotretKeadaan(await Promise.race([kumpulkanDariApp(), batas]));
  } catch {
    setPotretKeadaan(null);
  }
  /*
   * Memori lintas sesi (ai-ingat-sesi) dimuat di titik yang SAMA.
   *
   * Kedua titik perakitan prompt sudah `await` fungsi ini, jadi menempelkan
   * pemuatan memori di sini tidak menambah titik async baru - dan blok memori
   * di systemPromptFor() tetap sinkron membaca cache. Batas 2,5 detik yang sama
   * berlaku: memori yang lambat/gagal bukan alasan sebuah giliran batal.
   */
  try {
    const batasMemori = new Promise<null>((r) => setTimeout(() => r(null), POTRET_BATAS_MS));
    await Promise.race([muatMemoriSesi(), batasMemori]);
  } catch {
    /* gagal dengan lembut: blok memori hanya kosong, giliran tetap jalan */
  }
}

/*
 * Ambang "sudah cukup membaca, sekarang menulis" dipakai di footer status
 * (lihat `statusPekerjaan`). Angkanya sengaja hidup di `agentDorong` - di sana
 * ia bisa diuji di Node tanpa menjalankan agen, dan satu tempat berarti tidak
 * ada dua ambang yang berbeda untuk gejala yang sama.
 */
import { BATAS_TULIS_PAKSA } from './agentDorong';

import { useCliAgent } from './cliAgentStore';
import { useTerminal } from './terminalStore';
import { useProblems } from './problemsStore';
import { tx, tf } from './i18n';
/*
 * Only the Rust agent context is cached here.
 *
 * This used to be one blob holding BOTH `cmd.agentContext()` and the project
 * summary, behind a 60s TTL. That made the workspace part of the context stale
 * on purpose: the workspace can change at any moment with no notification, so
 * a TTL is the wrong tool for it - a user who opens a folder and immediately
 * asks a question is served the pre-open context, and the model stays blind
 * while the explorer shows the tree.
 *
 * So the split is: workspace-derived text is rebuilt every turn (it is cheap -
 * one capped directory walk), and only the expensive, workspace-independent
 * Rust context keeps a TTL. Even that entry is keyed by the workspace it was
 * built for, so switching folders drops it without waiting for anyone to call
 * a reset.
 */
let ctxCache: { at: number; teks: string; workspace: string | null } | null = null;
const CTX_TTL_MS = 60_000;

/*
 * Tool results are deliberately scoped to one agent run. A provider can emit
 * the same read several times in one response batch (notably file reads and
 * typechecks), so keep both completed results and promises for calls already in
 * flight. This is not a filesystem cache: clearing it at both ends of sendAgent
 * keeps writes, approvals, and later conversations independent.
 */
interface AgentToolCacheEntry {
  promise: Promise<string>;
  result?: string;
  at: number;
}
let agentToolCache = new Map<string, AgentToolCacheEntry>();
let agentToolCacheRun = false;
const TERMINAL_READ_CACHE_TTL_MS = 750;

function stableToolJson(value: unknown, key = ''): string {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'string' && /(?:path|file|dir|folder|cwd|worktree)/i.test(key)) {
      return JSON.stringify(value.trim().replace(/\\/g, '/').toLowerCase());
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((v) => stableToolJson(v, key)).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((k) => `${JSON.stringify(k)}:${stableToolJson(object[k], k)}`).join(',')}}`;
}

function agentToolCacheKey(name: string, args: Record<string, unknown>): string | null {
  const action = String(args.action ?? '').trim().toLowerCase();
  const readGit = name === 'git' && ['status', 'diff', 'log', 'branches'].includes(action);
  const safeAction = (name === 'notes' && action === 'list') || (name === 'schedule_command' && action === 'list') || (name === 'worktree' && action === 'list');
  const exactTsc = name === 'bash_run' && String(args.command ?? '').trim() === 'npx tsc --noEmit';
  if (!TOOL_BACA_SET.has(name) && !readGit && !safeAction && !exactTsc) return null;
  return `${name}:${stableToolJson(args)}`;
}

/*
 * Anti-loop watchdog.
 *
 * The failure it exists for is not a crash but a treadmill: the model re-reads
 * the same file or re-runs the same subagent every step, the history grows, and
 * the run ends at MAX_AGENT_STEPS with nothing to show. `agentToolCacheKey`
 * cannot serve as the fingerprint because it only covers read-only tools on
 * purpose, and the treadmill is at least as common with a failing build or a
 * subagent that never returns. So the fingerprint here is the requested call
 * itself, normalized through `stableToolJson` so key order and path spelling
 * cannot make one repeated action look like two.
 */
const BATAS_AKSI_SAMA = 3;
/*
 * The same read, repeated. Higher than the write limit because a read after a
 * write is legitimate verification — the model checks its own work — and a
 * directory listing that genuinely changed between calls is progress. Six is
 * comfortably past "checking" and well short of the eleven seen in a live run.
 */
const BATAS_BACA_SAMA = 6;
const BATAS_AKSI_INGAT = 2;

/*
 * Browser treadmill guard.
 *
 * The identical-action watchdog above does NOT catch this one: browser_open ->
 * browser_read -> web_fetch -> browser_read -> ... never repeats a fingerprint,
 * so the counter never trips, and the run marches to MAX_AGENT_STEPS while the
 * page has been visible on screen since the first step.
 *
 * The distinguishing fact is not repetition but the absence of PROGRESS after
 * a page has already been opened. Once an open succeeded in this turn, any
 * further browser/web call that is not itself an open for a DIFFERENT url is
 * the model circling. Three of those in a row is enough to stop.
 */
export const BATAS_BROWSER_MUTER = 3;
/* Consecutive read-only steps that teach nothing before the run is ended. */
const BATAS_TANPA_KEMAJUAN = 4;
/*
 * Berapa kali model boleh disodok untuk melanjutkan saat ia berhenti memanggil
 * tool ATAU membaca tanpa kemajuan padahal rencananya belum selesai.
 *
 * TURUN dari 20 ke 4.
 *
 * Kenapa: 20 itu cukup untuk membuat agen "terus bekerja" setelah tugasnya
 * benar-benar selesai. Penyebabnya todo yang tidak pernah ditandai `done` -
 * model menulis semua berkasnya tapi lupa memanggil `todo_write`, jadi daftar
 * rencana tetap penuh, dan guard menyodok model sampai 20 kali untuk
 * mengerjakan ulang pekerjaan yang sudah ada di disk. Yang dilihat pembaca:
 * run yang tidak pernah berhenti.
 *
 * Empat cukup untuk satu koreksi yang jujur (model lupa satu langkah) tanpa
 * memberi ruang untuk loop panjang. Batas keras yang sebenarnya tetap
 * MAX_AGENT_STEPS; ini hanya rem untuk "menyodok terus".
 */
const BATAS_LANJUT_TANPA_TOOL = 4;

/*
 * Tool yang benar-benar mengubah sesuatu.
 *
 * Sengaja sebuah HIMPUNAN, bukan regex berawalan. Versi regex sebelumnya punya
 * dua cacat yang terbukti:
 *
 *   - `web_` dan `browser_` didaftarkan sebagai penulis, sehingga `web_fetch`
 *     dan `browser_read` - yang hanya membaca - mereset penghitung "muter".
 *     Akibatnya treadmill yang seluruhnya berisi bacaan web tidak pernah
 *     tertangkap: setiap langkah dianggap kemajuan.
 *   - `sh$` dan `get_` tidak berlabuh, jadi namanya cocok dengan hal lain.
 *
 * Daftar eksplisit tidak bisa salah cocok. Kalau ada tool baru, tool itu
 * dianggap PEMBACA sampai namanya ditambahkan di sini - dan arah salah itu
 * jauh lebih aman: paling buruk agen berhenti lebih awal dengan pesan yang
 * menjelaskan, bukan terus berputar tanpa henti.
 */
const TOOL_PENULIS = new Set([
  'write_file', 'multi_edit', 'replace_in_files', 'copy_file', 'move_file', 'delete_file', 'bash_run', 'mcp__zephyr__sh', 'sh', 'browser_open', 'browser_click', 'browser_type', 'browser_close', 'browser_download_url', 'subagent_run', 'subagent_kirim', 'subagent_batal', 'todo_write', 'schedule_command', 'notes_write', 'set_setting', 'run_command', 'ssh', 'worktree', 'extension', 'pane', 'workspace', 'focus_pane',
]);
const TOOL_BROWSER = new Set([
  'browser_open', 'browser_read', 'browser_click', 'browser_type', 'browser_close', 'browser_list', 'web_fetch', 'web_search',
]);

function sidikAksi(name: string, args: Record<string, unknown>): string {
  return `${name}:${stableToolJson(args)}`;
}

/*
 * Muter browser, sebagai fungsi murni.
 *
 * Logika ini sebelumnya hidup inline di dalam loop agent, jadi tidak ada yang
 * bisa mengujinya - dan harness yang ada ("cek-loop-agent-e2e") ternyata hanya
 * memeriksa tool ADA di katalog, bukan bahwa penjaganya benar-benar menolak.
 * Itulah celah yang membuat loop "buka YouTube yang sudah terbuka" berjalan
 * sampai MAX_AGENT_STEPS.
 *
 * Lubangnya: `membukaBaru` dulu hanya berarti "punya url yang tidak kosong".
 * Membuka url yang sama lagi-lagi tetap dihitung kemajuan, dan `browser_close`
 * ada di TOOL_PENULIS sehingga juga mereset penghitung tanpa-kemajuan. Jadi
 * siklus
 *
 *     browser_open(youtube) -> browser_read -> browser_close -> browser_open(youtube)
 *
 * mereset kedua penghitung di setiap putaran dan tidak pernah menyentuh
 * ambang mana pun. Halaman terlihat di layar sejak langkah pertama, dan run
 * tetap berjalan sampai 120 langkah.
 *
 * Jadi "baru" berarti url yang belum pernah dibuka pada giliran ini - bukan
 * sekadar url yang tidak kosong. Membuka tab berbeda tetap lolos, membuka
 * ulang halaman yang sama tidak.
 *
 * Fungsi murni: tidak menyentuh store, tidak menyentuh Date.now, tidak
 * melempar. Jauh lebih mudah diuji daripada dibaca.
 */
export interface HasilMuterBrowser {
  /** Penghitung setelah langkah ini. */
  muter: number;
  /** True saat langkah ini sudah menjadi muter dan run harus dihentikan. */
  berhenti: boolean;
  /** Sidik jari langkah browser terakhir yang tercatat, untuk panggilan berikutnya. */
  sidik: string[];
}

function urlBrowserDinormalisasi(nama: string, args: Record<string, unknown>): string {
  if (nama !== 'browser_open') return '';
  return String(args.url ?? '')
    .trim()
    .toLowerCase()
    .replace(/\/+$/, '');
}

/** Sidik jari satu panggilan browser: nama tool + argumennya. */
function sidikBrowser(nama: string, args: Record<string, unknown>): string {
  let isi = '';
  try {
    isi = JSON.stringify(args ?? {});
  } catch {
    isi = '?';
  }
  return `${nama} ${isi}`;
}

/**
 * Hitung panggilan browser yang MUTER (berputar) tanpa kemajuan.
 *
 * Kenapa berbasis sidik jari, bukan "ada halaman terbuka lalu panggilan browser
 * apa pun":
 *
 * Aturan lama menganggap SETIAP panggilan browser/web setelah satu halaman
 * terbuka sebagai putaran, kecuali `browser_open` dengan URL baru. Untuk tugas
 * riset itu salah potong: model membuka Google, membacanya, mem-fetch satu
 * tautan, lalu membaca pane lagi - tiga langkah yang masing-masing membawa
 * informasi baru - dan tepat pada langkah ketiga run-nya dibunuh dengan pesan
 * "a page is already open ... made no progress". Pekerjaan riset memang berupa
 * banyak bacaan berurutan; yang tidak berguna adalah bacaan yang SAMA PERSIS
 * diulang.
 *
 * Jadi yang dihitung sekarang hanya pengulangan dalam jendela pendek: sidik jari
 * panggilan disimpan sampai `BATAS_JENDELA_SIDIK` langkah terakhir, dan sebuah
 * panggilan yang sidik jarinya sudah ada di jendela itu dianggap mengulang.
 * Panggilan dengan argumen berbeda - halaman lain, tautan lain, elemen lain -
 * selalu dihitung kemajuan dan mengosongkan penghitung.
 */
export const BATAS_JENDELA_SIDIK = 6;

export function cekMuterBrowser(
  terbuka: boolean,
  muter: number,
  urlSudahTerbuka: readonly string[],
  nama: string,
  args: Record<string, unknown>,
  sidikSebelumnya: readonly string[] = [],
): HasilMuterBrowser {
  const sidikLama = [...sidikSebelumnya];
  /* Sebelum ada halaman, atau untuk tool yang bukan browser: bukan muter, dan
     penghitung tidak boleh disentuh. */
  if (!terbuka || !TOOL_BROWSER.has(nama)) {
    return { muter, berhenti: false, sidik: sidikLama };
  }

  const url = urlBrowserDinormalisasi(nama, args);
  if (url && !urlSudahTerbuka.includes(url)) {
    /* Halaman yang belum pernah dibuka: ini kemajuan sungguhan, termasuk
       ketika dipanggil lewat browser_close lalu browser_open lagi. */
    return { muter: 0, berhenti: false, sidik: [] };
  }

  const sidik = sidikBrowser(nama, args);
  if (!sidikLama.includes(sidik)) {
    /* Panggilan ini belum pernah dilakukan dalam jendela pendek: model sedang
       melihat sesuatu yang lain, dan itu kemajuan. */
    const jendela = [...sidikLama, sidik].slice(-BATAS_JENDELA_SIDIK);
    return { muter: 0, berhenti: false, sidik: jendela };
  }

  const berikut = muter + 1;
  return { muter: berikut, berhenti: berikut >= BATAS_BROWSER_MUTER, sidik: sidikLama };
}

export interface HasilCatatAksi {
  /** How many requests carried this fingerprint during the current turn. */
  jumlah: number;
  /** True on the second occurrence: nudge the model, do not stop it. */
  ingatkan: boolean;
  /** True once the same request has been made `BATAS_AKSI_SAMA` times. */
  hentikan: boolean;
}

/**
 * Count one requested tool call against the current turn's fingerprints.
 *
 * Pure bookkeeping: it observes and decides, it never dispatches a tool. The
 * caller owns the map and clears it per turn and on real progress.
 */
export function catatAksiBerulang(peta: Map<string, number>, name: string, args: Record<string, unknown>): HasilCatatAksi {
  const sidik = sidikAksi(name, args);
  const jumlah = (peta.get(sidik) ?? 0) + 1;
  peta.set(sidik, jumlah);
  /*
   * A repeated READ is not the same failure as a repeated WRITE.
   *
   * The stop signal exists for a model that keeps re-issuing a mutating action
   * with no effect - reopening the same page, re-running the same command. A
   * read-only call repeated is usually VERIFICATION: after writing files, a
   * model lists the directory or re-reads the file to check its own work, and
   * the listing genuinely changes between calls because the writes changed the
   * directory. Killing the run there stopped healthy work with a "no progress"
   * accusation, even though the files were already on disk - the same failure
   * the goal-satisfied guard was fixed for.
   *
   * So reads may WARN (the caller nudges the model to conclude) but are never
   * allowed to force-stop. Writers keep the hard limit.
   */
  const bolehHentikan = !TOOL_BACA_SET.has(name);
  return {
    jumlah,
    /*
     * EVERY repeat past the first, not just the second.
     *
     * `jumlah === BATAS_AKSI_INGAT` fires once, when the count is exactly two,
     * and that was the whole defence against a loop. A live run made the flaw
     * plain: `list_directory` was called ELEVEN times with identical arguments
     * and identical results, so the reminder arrived once — at the second
     * repeat, seconds in — and the loop then ran unreminded for nine more
     * rounds. The failure mode being defended against is the model NOT
     * retaining the notice, so sending it once cannot work.
     */
    ingatkan: jumlah > BATAS_AKSI_INGAT,
    /*
     * Reads keep the soft limit, but not an unlimited one.
     *
     * Allowing a read to force-stop was removed because a model that lists a
     * directory after writing files is VERIFYING its own work, and killing that
     * stopped healthy runs. That reasoning holds for a few repeats. It stops
     * holding past `BATAS_BACA_SAMA`, where the same read returning the same
     * bytes is no longer verification but a stuck loop — and every one of those
     * results stays in the conversation and is re-sent on every later turn,
     * which is the cost that makes an unbounded read loop expensive rather than
     * merely untidy.
     */
    hentikan: bolehHentikan ? jumlah >= BATAS_AKSI_SAMA : jumlah >= BATAS_BACA_SAMA,
  };
}

/**
 * Fingerprints of tool calls requested during the current agent turn.
 *
 * Module-level rather than a local of the loop because the todo-completion
 * reset happens in `setAgentTodos`, which runs outside that loop and must be
 * able to forget what the watchdog has counted. It is cleared where it is
 * consumed (turn start, and turn start of the next run), so a stale turn can
 * never stop the next one.
 */
const agenAksiBerulang = new Map<string, number>();

/**
 * Partial text a failed agent attempt produced, kept aside when a retry clears
 * the bubble.
 *
 * The retry re-sends the same prompt and answers from scratch, so the old text
 * MUST leave the message or the two attempts interleave into a stutter. Keeping
 * a copy means the work is not simply lost: it is available for the run report
 * and for diagnosis, which is what was missing when a heavy run appeared to
 * destroy its own output on every hiccup.
 *
 * Keyed by the assistant message id, so concurrent runs cannot collide, and
 * cleared when the run finishes.
 */
const catatanPercobaanGagal = new Map<string, string>();

/** Clear the per-run tool cache. Called at both start and end of sendAgent. */
export function resetAgentToolCache(): void {
  agentToolCache.clear();
  agentToolCacheRun = true;
}

export function finishAgentToolCache(): void {
  agentToolCache.clear();
  agentToolCacheRun = false;
}

/** Dispatch one tool while coalescing only the explicitly safe reads. */
export async function jalankanAgentToolCached(name: string, args: Record<string, unknown>): Promise<string> {
  const key = agentToolCacheRun ? agentToolCacheKey(name, args) : null;
  if (!key) return jalankanAgentTool(name, args);
  const now = Date.now();
  const prior = agentToolCache.get(key);
  const ttl = name === 'bash_run' ? TERMINAL_READ_CACHE_TTL_MS : Infinity;
  if (prior && (now - prior.at < ttl)) return prior.result !== undefined ? prior.result : prior.promise;
  const promise = jalankanAgentTool(name, args);
  const entry: AgentToolCacheEntry = { promise, at: now };
  agentToolCache.set(key, entry);
  try {
    const result = await promise;
    // Only successful results are reusable. In particular, a failed tsc run is
    // not cached, so a later call can observe the fixed workspace.
    if (name !== 'bash_run' || /^exit=0(?:\s|$)/.test(result)) entry.result = result;
    else agentToolCache.delete(key);
    return result;
  } catch (error) {
    agentToolCache.delete(key);
    throw error;
  }
}

/*
 * Live editor state, rebuilt on every agent turn instead of cached. The model
 * needs to know which folder the project lives in, which file is in front of
 * the user right now, what the terminal is showing, and what the diagnostics
 * say. Without it the agent asks "which folder?" - or spends four tool calls
 * on `cd`, `powershell`, `list` - to answer a question the explorer is
 * already showing, and it cannot connect a failing command in the terminal to
 * the task it was given.
 */
function konteksEditor(): string {
  const s = useStore.getState() as unknown as {
    tabs?: { id: string; path?: string; title?: string; unsaved?: boolean }[];
    activeTabId?: string | null;
    workspace?: string | null;
  };
  const baris: string[] = [];
  const workspace = s.workspace ?? null;
  /*
   * The working directory, stated outright and unconditionally.
   *
   * The project summary used to be the ONLY place a workspace path reached the
   * model, and it is built from the file listing: it returns nothing when
   * `listWorkspaceFiles` comes back empty (a folder just created, an index
   * that has not settled) and nothing at all before the first turn warms it.
   * That is exactly the window where a model spends eight tool calls - Inspect,
   * cd, cd, powershell, List, cmd - to learn which folder it is standing in.
   *
   * Read straight from the store and never cached: the workspace can change
   * with no notification at all, so a stale path is worse than no path. When
   * there is genuinely no workspace the line says so, because an honest "none
   * open" stops the model inventing a directory instead of guessing one.
   */
  baris.push(
    workspace
      ? `- Active workspace: ${workspace.replace(/\\/g, '/')} (the folder that is open: relative paths resolve against it, but it is not a boundary - a path the user names is used as given and a task living elsewhere is done there)`
      : '- Active workspace: none open (that is fine - chat, questions and absolute paths all work without one; do NOT ask the user to open a folder)',
  );
  const semuaTab = s.tabs ?? [];
  const tabAktif = semuaTab.find((t) => t.id === s.activeTabId);
  baris.push(
    `- Active file: ${tabAktif?.path || '(none open)'}` +
      (tabAktif?.unsaved ? ' (unsaved changes in the buffer)' : ''),
  );
  const lain = semuaTab
    .filter((t) => t.id !== s.activeTabId)
    .slice(0, 8)
    .map((t) => t.path || t.title || '?');
  if (lain.length) baris.push(`- Other open tabs: ${lain.join(', ')}`);

  try {
    const ts = useTerminal.getState();
    const panes = ts.terminalTabs.flatMap((tb) =>
      tb.panes.map((p) => {
        const status = p.status === 'live' ? '' : ` [${p.status}${p.exitCode != null ? ` exit ${p.exitCode}` : ''}]`;
        return `${p.kind}${p.title ? ` "${p.title}"` : ''}${status}`;
      }),
    );
    baris.push(panes.length ? `- Terminal panes: ${panes.join(', ')}` : '- Terminal panes: none open');
  } catch {
  }

  const pr = useProblems.getState().all();
  if (pr.length) {
    const c = useProblems.getState().counts();
    baris.push(`- Diagnostics: ${c.errors} error(s), ${c.warnings} warning(s) in the workspace`);
    const tiga = pr.slice(0, 3).map((p) => `${p.file}:${p.line} ${p.message}`);
    baris.push(`- First diagnostics: ${tiga.join(' | ')}`);
  } else {
    baris.push('- Diagnostics: clean');
  }
  return baris.join('\n');
}

/*
 * The tail of any pane that exited with a failure. A build or test that died in
 * the terminal is the single most common thing the user wants explained, and
 * hunting for it with a terminal read costs a round trip every time. Only panes
 * that already finished with a non-zero code qualify: a live dev server is
 * scrolling noise, and its last 20 lines say nothing about what to do next.
 */
async function konteksKegagalan(): Promise<string> {
  const panes = useTerminal.getState().allPanes();
  const gagal = panes.filter((p) => p.exitCode != null && p.exitCode !== 0);
  if (gagal.length === 0) return '';
  const bagian: string[] = [];
  for (const p of gagal.slice(0, 2)) {
    try {
      const teks = await cmd.ptyTail(p.id, 15);
      if (!teks.trim()) continue;
      bagian.push(`Pane "${p.title || p.id}" exited with code ${p.exitCode}:\n${teks.trim()}`);
    } catch {
      /* the pane buffer is gone; the exit code alone is still reported above */
    }
  }
  if (bagian.length === 0) return '';
  return [
    'A command in the terminal failed. This is its output, so you do not need to read it again:',
    bagian.join('\n\n'),
  ].join('\n');
}

export async function konteksAgent(): Promise<string> {
  const workspace = useStore.getState().workspace ?? null;
  const hidup = konteksEditor();
  const kegagalan = await konteksKegagalan();
  const gabung = (...blok: string[]) => blok.filter((s) => s && s.trim()).join('\n\n');

  /*
   * Cached: the Rust context. Expensive to produce, and it does not describe
   * the workspace, so a TTL is safe here - as long as the entry is tied to the
   * folder it was built for. A workspace change invalidates it immediately,
   * even if nothing called `resetCacheKonteks`.
   */
  let dariRust = '';
  if (ctxCache && ctxCache.workspace === workspace && Date.now() - ctxCache.at < CTX_TTL_MS) {
    dariRust = ctxCache.teks;
  } else {
    try {
      dariRust = await cmd.agentContext();
      ctxCache = { at: Date.now(), teks: dariRust, workspace };
    } catch {
      dariRust = ctxCache?.teks ?? '';
    }
  }

  /*
   * Not cached: the project summary. It is pure workspace state - the folder
   * path, the stack, the file tree - and it is one capped walk, so rebuilding
   * it per turn is cheap next to serving a stale one. `ringkasanProyek` keeps
   * its own in-flight de-duplication, so parallel callers still share a single
   * walk instead of each starting their own.
   */
  let proyek = '';
  try {
    proyek = await (await import('./projectContext')).ringkasanProyek();
  } catch {
    /* a bonus block; the workspace line in `hidup` still stands on its own */
  }

  return gabung(dariRust, proyek, hidup, kegagalan);
}

/**
 * Drop every cached context block, both here and in `projectContext`.
 *
 * The workspace-dependent blocks are not cached at all any more, so this only
 * clears the Rust context - but it is exported because the workspace actions in
 * `store` already call a reset on open and close, and that call must keep
 * meaning "nothing about this folder is remembered".
 */
export function resetCacheKonteks(): void {
  ctxCache = null;
  void import('./projectContext').then((m) => m.resetRingkasanProyek());
}

/** Existing call site name for `resetCacheKonteks`; kept so callers still compile. */
export function resetKonteksAgent(): void {
  resetCacheKonteks();
}

export async function oneShot(prompt: string): Promise<string> {
  const st = useAi.getState();
  const def = findModel(st.model, st.provider);
  const cfg = useStore.getState().settings.models.providers[def.provider] ?? {};
  const res = await cmd.aiToolChat({
    provider: def.provider,
    model: def.id,
    messages: [{ role: 'user', content: prompt }],
    tools: [],
    baseUrl: cfg.baseUrl || undefined,
    maxTokens: def.maxOut ?? 512,
    effort: st.reasoningEffort ?? undefined,
  });
  return (res.content ?? '').trim();
}

/*
 * Riwayat agen yang BENAR.
 *
 * Bentuk inilah yang sering hilang di implementasi agen, dan hilangnya membuat
 * model mengulang panggilan tool yang sama dengan argumen yang sama persis.
 * Penyebabnya satu: yang dikirim ke provider bukan percakapan, melainkan
 * gabungan semua teks asisten.
 *
 * Satu langkah agen menghasilkan SATU pesan asisten. Pesan itu membawa teks
 * langkah itu dan tool call-nya. Langkah berikutnya menghasilkan pesan asisten
 * BARU. `history` versi lama menyimpan `content` saja lalu menambahkan objek
 * terpisah yang membawa toolCalls, sehingga `pesan` yang dikirim berisi dua
 * entri asisten berurutan untuk satu langkah, dan `content`-nya menumpuk:
 * langkah ke-n membawa n+1 salinan kalimat yang sama. Beberapa gateway langsung
 * menolaknya sebagai bentuk yang tidak sah; semua gateway membacanya sebagai
 * "aku sudah mengatakannya" berulang kali, dan jawaban yang wajar untuk itu
 * adalah mengulang aksi yang sama.
 *
 * Yang dibangun di sini: satu objek per langkah, dengan `tampil` sebagai teks
 * langkah itu saja dan `pesan` sebagai apa yang dikirim ke provider.
 */
export function riwayatAgen(
  langkah: Array<{ content: string; reasoning?: string; reasoningSignature?: string; toolCalls?: AgentToolCall[] }>,
  system?: string,
  opts?: { ringkasPesan?: (m: AgentMsg) => AgentMsg },
): AgentMsg[] {
  const hasil: AgentMsg[] = [];
  if (system) hasil.push({ role: 'system', content: system });
  const ringkasPesan = opts?.ringkasPesan ?? ((m: AgentMsg) => m);
  for (const l of langkah) {
    if (!l.content.trim() && !l.toolCalls?.length && !l.reasoning) continue;
    hasil.push(
      ringkasPesan({
        role: 'assistant',
        content: l.content,
        toolCalls: l.toolCalls?.length ? l.toolCalls : undefined,
        ...(l.reasoning ? { reasoning: l.reasoning } : {}),
        ...(l.reasoningSignature ? { reasoningSignature: l.reasoningSignature } : {}),
      }),
    );
  }
  return hasil;
}

/**
 * Susun blok yang dikirim ke provider dari riwayat berpasangan.
 *
 * Dipakai bersama `riwayatAgen`: `riwayatPesan` memegang percakapannya
 * (peran user/assistant/tool seperti biasa), lalu tiap pesan asisten dipetakan
 * ke beberapa langkah dengan `pembagi`. Dengan begitu bentuk wire-nya tetap
 * bersih - satu asisten per langkah, tanpa entri duplikat - dan teks tiap
 * langkah untuk bubble tetap utuh.
 *
 * Dipakai juga oleh pemadatan konteks supaya ringkasan tidak menghapus batas
 * antar langkah, yang persis kesalahan yang membuat model mengulang tool.
 */
export function bagiLangkahDariRiwayat(
  pesan: AgentMsg[],
  pembagi: (teks: string) => string[],
): LangkahRiwayat[] {
  const hasil: LangkahRiwayat[] = [];
  for (const m of pesan) {
    if (m.role !== 'assistant') continue;
    const potongan = pembagi(m.content ?? '').filter((p) => p.trim() || (m.toolCalls?.length ?? 0) > 0);
    if (potongan.length === 0) {
      hasil.push({ pesan: m, tampil: m.content ?? '' });
      continue;
    }
    potongan.forEach((teks, i) => {
      const terakhir = i === potongan.length - 1;
      hasil.push({
        pesan: {
          ...m,
          content: teks,
          ...(terakhir ? {} : { contentStored: undefined }),
          toolCalls: terakhir ? m.toolCalls : undefined,
        },
        tampil: teks,
      });
    });
  }
  return hasil;
}

export function ringkasRiwayat(history: AgentMsg[], cap: number = PAYLOAD_MAX_CHARS): AgentMsg[] {  const system = history.filter((m) => m.role === 'system');
  const sisanya = history.filter((m) => m.role !== 'system');
  if (sisanya.length === 0) return history;
  

  const batas = Math.max(0, sisanya.length - HISTORY_KEEP_STEPS * 2);
  const lama = sisanya.slice(0, batas);
  /*
   * Images only matter when the model is looking at them right now. Anything
   * older than the working window is dead weight: the model already acted on
   * it, and re-sending megabytes of base64 every step is what made long runs
   * crawl. Strip them from the outgoing copy (history itself keeps them, so a
   * retry or a re-read still finds them where it left them).
   */
  const baru = sisanya.slice(batas).map((m, i, arr) =>
    i < arr.length - 1 && m.images?.length ? { ...m, images: undefined } : m,
  );

  const ringkas = lama.map((m) => {
    const tanpaGambar = m.images?.length ? { ...m, images: undefined } : m;
    if (m.role === 'tool') {
      /*
       * Head AND tail, not head alone. A clipped build or test log kept only
       * its first 500 characters — the compile banner and the command echo —
       * and dropped the `error:` block and the `N failed` line at the bottom,
       * which is the entire reason the model asked for the output. See
       * `potongHasilRiwayat` for why the middle is what gets discarded.
       */
      return { ...tanpaGambar, content: potongHasilRiwayat(String(m.content ?? '')) };
    }
    if (m.role === 'assistant') {
      const teks = String(m.content ?? '');
      return {
        ...tanpaGambar,
        content: teks.length > HISTORY_TOOL_CHARS ? `${teks.slice(0, HISTORY_TOOL_CHARS)}…` : teks,
        toolCalls: undefined,
      };
    }
    return tanpaGambar;
  });

  const jumlahTool = lama.filter((m) => m.role === 'tool').length;
  const catatan =
    jumlahTool > 0
      ? `[${jumlahTool} earlier steps were summarized to keep the conversation fast. ` +
        `If you need the detail, re-run the relevant tool — do not invent its contents.]`
      : '';

  const hasil = [
    ...system,
    ...(catatan ? [{ role: 'user' as const, content: catatan }] : []),
    ...ringkas,
    ...baru,
  ];
  // Age-based trimming above is blind to request SIZE; this is the pass that
  // respects the gateway's body limit.
  return system.length > 0 ? ringkasUkuran(hasil, cap) : hasil;
}

/**
 * Ubah riwayat pesan menjadi daftar langkah.
 *
 * `history` di store berbentuk pesan (user/assistant/tool); agent butuh batas
 * langkah untuk memperbaiki bentuk wire dan mempertahankan kalimat asisten.
 * Pemetaannya satu arah dan murni: pesan asisten menjadi langkah, pesan lain
 * (user, tool) menjadi penanda yang dilewati.
 */
export function langkahDariRiwayat(history: AgentMsg[]): Array<{
  content: string;
  reasoning?: string;
  reasoningSignature?: string;
  toolCalls?: AgentToolCall[];
}> {
  return history
    .filter((m) => m.role === 'assistant')
    .map((m) => ({
      content: m.content ?? '',
      ...(m.reasoning ? { reasoning: m.reasoning } : {}),
      ...(m.reasoningSignature ? { reasoningSignature: m.reasoningSignature } : {}),
      ...(m.toolCalls?.length ? { toolCalls: m.toolCalls } : {}),
    }));
}

/** Perbaiki bentuk wire: satu pesan asisten per langkah, tanpa entri duplikat. */
export function bentukWireRiwayat(history: AgentMsg[]): AgentMsg[] {
  const system = history.filter((m) => m.role === 'system');
  const lain = history.filter((m) => m.role !== 'system');
  const hasil: AgentMsg[] = [];
  for (const m of lain) {
    /*
     * Two user messages in a row are MERGED into one.
     *
     * A strict OpenAI-compatible gateway rejects `system -> user -> user` with
     * 400 invalid_request — measured against modelrouter.id with a real run:
     * the request died on step 3 with the roles printed as
     * `system -> user -> user -> assistant -> tool -> assistant -> tool`.
     *
     * The sequence is REACHABLE without anyone doing anything odd. A turn whose
     * reply never arrived — a transient network failure, a cancel, a provider
     * that closed the stream with no text — leaves a user message with no
     * assistant after it. The reader then types another message, and from that
     * point EVERY request carries `user -> user` and 400s. The conversation is
     * permanently stuck and nothing on screen says why.
     *
     * Merging is what a correct client does: the two messages are one turn from
     * the model's point of view, and joining them with a blank line keeps both
     * intact rather than dropping either.
     */
    const sebelum = hasil[hasil.length - 1];
    if (m.role === 'user' && sebelum?.role === 'user') {
      const a = String(sebelum.content ?? '').trimEnd();
      const b = String(m.content ?? '').trim();
      hasil[hasil.length - 1] = {
        ...sebelum,
        content: a && b ? `${a}\n\n${b}` : a || b,
        /* Images from either side survive: whichever message carried them, the
           merged turn is the one the model is being asked about. */
        images: m.images?.length ? m.images : sebelum.images,
      };
      continue;
    }
    if (m.role !== 'assistant') {
      hasil.push(m);
      continue;
    }
    /*
     * Asisten yang punya tool call TIDAK boleh punya tool berikutnya yang
     * menggantung. Kalau entri sebelumnya adalah asisten tanpa tool call dan
     * entri ini punya tool call, keduanya adalah satu langkah yang terpecah:
     * gabungkan supaya bentuknya sah.
     */
    const sebelumnya = hasil[hasil.length - 1];
    if (sebelumnya?.role === 'assistant' && !sebelumnya.toolCalls?.length && m.toolCalls?.length) {
      /* Teks sebelumnya dipertahankan HANYA kalau ada isinya. Menggabungkan
         asisten kosong ke asisten bertool-call hanya memindahkan masalah:
         entri hasilnya tetap kosong. */
      const isi = (sebelumnya.content ?? '').trim();
      hasil[hasil.length - 1] = isi
        ? { ...sebelumnya, toolCalls: m.toolCalls }
        : { ...m, content: sebelumnya.content };
      continue;
    }
    /*
     * Asisten TANPA isi dan TANPA tool call tidak dikirim sama sekali.
     *
     * Bagi gateway OpenAI-compatible yang ketat, `{role:"assistant",
     * content:""}` di AKHIR array pesan adalah bentuk yang tidak sah: tidak ada
     * pertanyaan yang dijawabnya dan tidak ada aksi yang dimintanya. Model yang
     * membuka langkah tanpa kalimat pembuka menghasilkan persis entri ini, dan
     * penolakannya kembali sebagai 400 - yang lalu memicu masalah langkah
     * menggantung di tempat lain.
     *
     * Asisten kosong yang PUNYA toolCalls tetap dikirim: `content:""` bersama
     * `tool_calls` adalah bentuk resmi untuk langkah yang langsung bertindak,
     * dan itu justru bentuk paling umum di agent loop.
     */
    const adaIsi = !!(m.content ?? '').trim();
    if (!adaIsi && !m.toolCalls?.length) continue;
    hasil.push(m);
  }

  /*
   * Jaring terakhir: buang hasil tool yang pemanggilnya tidak ada, DAN buang
   * tool call yang hasilnya tidak ada.
   *
   * Ini penjaga bentuk paling murah dan paling luas - ia bekerja apa pun yang
   * terjadi sebelumnya (pemotongan ukuran, pemadatan konteks, gabungan langkah,
   * penyaringan tool call). Bentuk yang dilanggar selalu berujung sama: provider
   * menolak SELURUH request, dan seluruh langkah hilang. Membuang satu potongan
   * hanya kehilangan informasi.
   *
   * Terbukti perlu dua-duanya. Payload nyata yang ditolak gateway berbunyi
   * `system -> user -> assistant(x2) -> tool` - dua tool call, satu hasil.
   */
  const bersih: AgentMsg[] = [];
  /*
   * Pasangan assistant↔tool harus memakai id yang COCOK dan UNIK.
   *
   * Merapikan urutan peran saja tidak cukup. Payload nyata yang ditolak gateway
   * dengan 400 permanen berbentuk sah secara urutan
   * (`assistant(tc) -> tool -> assistant(tc) -> tool`) tetapi id-nya rusak:
   *
   *   assistant tool_calls=[id A]      ← minta A
   *   tool      tool_call_id=B         ← id TIDAK cocok (B, bukan A)
   *   assistant tool_calls=[id A]      ← id A DIPAKAI LAGI (duplikat)
   *   tool      tool_call_id=A
   *
   * Ini terjadi saat run dibatalkan di tengah tool-call: langkah yang
   * setengah jadi meninggalkan id yang tidak sinkron, lalu ikut tersimpan ke
   * riwayat sehingga SETIAP request berikutnya 400. Gateway OpenAI-compatible
   * mewajibkan `tool_call_id` sebuah pesan tool sama dengan id tool_call pada
   * assistant tepat sebelumnya, dan setiap id tool_call unik dalam satu request.
   *
   * Jadi di sini id dipasangkan ulang BERDASARKAN POSISI dan ditulis ulang jadi
   * unik: call ke-i sebuah assistant dipasangkan dengan hasil tool ke-i, dan
   * keduanya diberi id baru yang sama. Dengan begitu id acak/duplikat/tak cocok
   * dari model atau dari pembatalan tidak pernah lolos ke provider.
   */
  let idPasangan = 0;
  const idBerikut = () => `zc_${(idPasangan++).toString(36)}`;
  let idToolMenunggu: string[] = [];
  for (const m of hasil) {
    if (m.role === 'tool') {
      /* Sah selama assistant terbaru yang punya tool call masih menyisakan id
         yang belum dipasangkan. TIDAK boleh memakai kedekatan dengan entri
         sebelumnya: pada assistant dengan BANYAK tool call, hasil tool kedua
         berdampingan dengan hasil tool pertama, bukan dengan assistant-nya —
         `idToolMenunggu` itulah penanda yang benar. */
      const idCocok = idToolMenunggu.shift();
      if (!idCocok) continue;
      bersih.push({ ...m, toolCallId: idCocok });
      continue;
    }
    if (m.role === 'assistant' && m.toolCalls?.length) {
      /*
       * Sebuah asisten harus meminta HANYA tool yang benar-benar punya hasil.
       * Yang dihitung hanya `tool` yang langsung mengikutinya, karena itulah
       * yang dibaca provider sebagai pasangannya.
       */
      let punyaHasil = 0;
      for (let i = hasil.indexOf(m) + 1; i < hasil.length && hasil[i].role === 'tool'; i++) {
        punyaHasil += 1;
      }
      const dipakai = m.toolCalls.slice(0, punyaHasil);
      if (dipakai.length === 0) {
        /* Tidak ada satu pun hasil tool: kirim teksnya saja, tanpa tool call. */
        if ((m.content ?? '').trim()) bersih.push({ ...m, toolCalls: undefined });
        idToolMenunggu = [];
        continue;
      }
      /* Beri id baru yang unik untuk tiap pasangan, dan simpan untuk pesan
         tool yang mengikutinya supaya dua sisi memakai id yang sama. */
      const idBaru = dipakai.map(() => idBerikut());
      const dipakaiBerid = dipakai.map((tc, i) => ({ ...tc, id: idBaru[i] }));
      idToolMenunggu = [...idBaru];
      bersih.push({ ...m, toolCalls: dipakaiBerid });
      continue;
    }
    idToolMenunggu = [];
    bersih.push(m);
  }
  return [...system, ...bersih];
}

/*
 * Automatic context compaction for the agent loop.
 *
 * `ringkasRiwayat` already trims per turn, but trimming is lossy in the wrong
 * direction: old tool results are cut mid-sentence and old reasoning is dropped
 * with no trace, so the model keeps working from a mutilated history. When the
 * window is genuinely close to full the honest move is a real summary: ask the
 * model to read the older history and write down what matters, then replace
 * those messages with that summary. The model keeps the thread, the reader sees
 * one notice instead of a silent cut, and the window frees up in one step.
 *
 * The call goes through `cmd.aiToolChat`, the same non-streaming provider helper
 * `oneShot` uses, so the path boundary and the provider adapters are unchanged.
 */

/** Result of one automatic compaction pass. */
interface AutoCompact {
  history: AgentMsg[];
  /** Estimated tokens before / after, so the notice can state what was reclaimed. */
  sebelum: number;
  sesudah: number;
  diringkas: number;
}

function ringkasSistem(history: AgentMsg[]): AgentMsg[] {
  return history.filter((m) => m.role === 'system');
}

/**
 * Summarize the older part of the history with a real model call.
 *
 * Returns null when there is nothing worth compacting, or when the model call
 * fails. On failure the caller keeps the history as-is rather than throwing:
 * a summarization hiccup must not kill a running task.
 */
export async function padatkanRiwayat(
  history: AgentMsg[],
  opts: {
    provider: string;
    model: string;
    baseUrl?: string;
    effort?: 'minimal' | 'low' | 'medium' | 'high' | 'ultra';
  },
): Promise<AutoCompact | null> {
  const system = ringkasSistem(history);
  const sisanya = history.filter((m) => m.role !== 'system');
  if (sisanya.length <= AUTO_COMPACT_KEEP) return null;

  const batas = sisanya.length - AUTO_COMPACT_KEEP;
  const lama = sisanya.slice(0, batas);
  const baru = sisanya.slice(batas);

  const transkrip = lama
    .map((m) => {
      const isi = String(m.content ?? '');
      const potong = isi.length > 4000 ? `${isi.slice(0, 4000)}\n[… truncated]` : isi;
      if (m.role === 'tool') return `TOOL ${m.name ?? ''}:\n${potong}`;
      if (m.role === 'assistant') return `ASSISTANT:\n${potong}`;
      return `USER:\n${potong}`;
    })
    .join('\n\n');

  const prompt =
    'You are compacting an agent conversation to keep it inside the context window. ' +
    'Read the transcript below and write a dense running summary that a continuing agent ' +
    'can work from without the original messages. Preserve: the user\'s goal, decisions made, ' +
    'files touched, exact commands and their outcomes, and any unfinished work or blocker. ' +
    'Drop: pleasantries, repeated reads, and text you can point to by path instead of quoting. ' +
    'Be specific and factual; never invent detail that is not in the transcript. ' +
    'Answer with the summary only.\n\n--- TRANSCRIPT ---\n\n' +
    transkrip;

  let ringkasan = '';
  try {
    const res = await cmd.aiToolChat({
      provider: opts.provider,
      model: opts.model,
      messages: [{ role: 'user', content: prompt }],
      tools: [],
      baseUrl: opts.baseUrl,
      maxTokens: 2048,
      effort: opts.effort,
    });
    ringkasan = (res.content ?? '').trim();
  } catch {
    return null;
  }
  if (!ringkasan) return null;

  const sebelum = perkiraanKonteks(history);
  const baruHistory: AgentMsg[] = [
    ...system,
    {
      role: 'user',
      content:
        `[AUTO-COMPACTED CONTEXT: ${lama.length} earlier messages were summarized into the block below ` +
        `to keep the conversation inside the context window. Work from this summary. ` +
        `If you need detail that is not here, re-run the relevant tool — do not invent it.]\n\n` +
        ringkasan,
    },
    ...baru,
  ];
  /*
   * Pemadatan yang membuat konteks LEBIH BESAR bukan pemadatan.
   *
   * Terukur, bukan dugaan: pada run uji 15 pesan (4.547 token) diringkas jadi
   * satu blok 4.677 token - modelnya menulis ringkasan yang lebih panjang
   * daripada bahan yang digantikannya. Aplikasi tetap membuang riwayat aslinya,
   * jadi yang terjadi: satu panggilan model terbuang, riwayat hilang, dan
   * konteks TIDAK menyusut. Kalau pembacanya menurunkan ambang pemadatan
   * (setting "window"), kondisi ini gampang tercapai - riwayat kecil, ringkasan
   * besar - dan hasilnya pemadatan berulang yang tidak pernah menolong.
   *
   * Karena itu hasilnya diukur sesudah ringkasan jadi, dan kalau tidak ada yang
   * dihemat, pemadatan dibatalkan seperti kegagalan lain (return null):
   * pemanggilnya tidak menyentuh riwayat, dan cooldown akan mencoba lagi nanti
   * saat riwayatnya memang sudah besar.
   */
  const sesudah = perkiraanKonteks(baruHistory);
  if (sesudah >= sebelum) return null;
  return { history: baruHistory, sebelum, sesudah, diringkas: lama.length };
}

/* ------------------------------------------------------------------ */
/* D: berkas konteks pekerjaan, dikelola aplikasi                     */
/* ------------------------------------------------------------------ */

/*
 * `.zephyr-context.md` dulu hanya hidup di prompt: model disuruh MEMBUATNYA
 * sendiri di langkah pertama. Itu bergantung pada model menurut - dan pada run
 * yang gagal membuatnya di langkah 1, catatan yang seharusnya menyelamatkan
 * konteks justru tidak pernah ada. Padahal isinya seluruhnya fakta yang sudah
 * dipegang aplikasi: tugas, rencana, berkas yang ditulis, dan hasil run.
 *
 * Jadi aplikasi yang menulisnya: kerangka dibuat sebelum langkah pertama
 * (sekali saja - run berikutnya MEMPERBARUI berkas yang sama, tidak menumpuk
 * kerangka baru), dan bagian hasilnya ditulis di jalur keluar run. Model tetap
 * bebas menambah bagiannya sendiri; yang dijamin di sini adalah kerangkanya
 * ada, dan isinya tidak pernah kosong.
 */
const NAMA_KONTEKS_KERJA = '.zephyr-context.md';
const JUDUL_KONTEKS_BERKAS = '## Berkas dibuat / diubah';
const JUDUL_KONTEKS_HASIL = '## Hasil run';

/** Jalur berkas konteks di dalam workspace (null kalau tidak ada workspace). */
export function jalurKonteksKerja(workspace: string | null): string | null {
  if (!workspace) return null;
  const ws = workspace.replace(/\\/g, '/').replace(/\/+$/, '');
  return `${ws}/${NAMA_KONTEKS_KERJA}`;
}

/** Kerangka awal. Bagian hasil sengaja diberi penanda supaya bisa diisi nanti. */
function kerangkaKonteks(tugas: string): string {
  const ringkas = tugas.replace(/\s+/g, ' ').trim().slice(0, 400);
  return (
    `# Konteks pekerjaan (dikelola otomatis oleh Zephyr)\n\n` +
    `Berkas ini dibuat dan diperbarui oleh APLIKASI, bukan oleh model. Model boleh\n` +
    `menambah catatannya sendiri; bagian yang ditulis aplikasi akan ditimpa ulang\n` +
    `pada run berikutnya.\n\n` +
    `## Tugas terakhir\n${ringkas || '- (belum ada)'}\n\n` +
    `## Rencana\n- (diisi agen lewat todo_write)\n\n` +
    `${JUDUL_KONTEKS_BERKAS}\n- (belum ada)\n\n` +
    `${JUDUL_KONTEKS_HASIL}\n- (belum ada)\n`
  );
}

/** Pastikan berkas konteks ada sebelum run pertama menulis apa pun. */
export async function siapkanKonteksKerja(
  workspace: string | null,
  tugas: string,
): Promise<string | null> {
  const jalur = jalurKonteksKerja(workspace);
  if (!jalur) return null;
  let ada = false;
  try {
    ada = await cmd.fsExists(jalur);
  } catch {
    /* Kalau pertanyaannya sendiri gagal dijawab, jangan menebak: menulis di
       atas berkas yang mungkin sudah berisi catatan penting lebih buruk
       daripada melewatinya. */
    return null;
  }
  if (ada) return jalur;
  try {
    await cmd.fsWrite(jalur, kerangkaKonteks(tugas), undefined, undefined, { allowMissing: true });
  } catch {
    return null;
  }
  return jalur;
}

/** Ganti isi satu bagian (`## Judul` s/d judul berikutnya) tanpa menyentuh sisanya. */
function gantiBagian(isi: string, judul: string, baru: string): string {
  const i = isi.indexOf(judul);
  if (i < 0) return `${isi.trimEnd()}\n\n${baru}`;
  const j = isi.indexOf('\n## ', i + judul.length);
  const akhir = j < 0 ? isi.length : j + 1;
  return isi.slice(0, i) + baru + isi.slice(akhir);
}

/** Tulis hasil run ke `.zephyr-context.md` (dipanggil di jalur keluar run). */
export async function catatHasilKonteks(
  workspace: string | null,
  opts: {
    tugas: string;
    langkah: number;
    kategori: string | null;
    berkas: string[];
    todos: { content: string; status: string }[];
  },
): Promise<void> {
  const jalur = jalurKonteksKerja(workspace);
  if (!jalur) return;
  if (opts.langkah === 0 && opts.berkas.length === 0) return;
  let isi = '';
  try {
    const baca = await cmd.fsRead(jalur);
    isi = baca.content ?? '';
  } catch {
    return;
  }
  if (!isi) return;
  const daftar =
    opts.berkas.length > 0 ? opts.berkas.map((b) => `- \`${b}\``).join('\n') : '- (tidak ada berkas baru)';
  const rencana =
    opts.todos.length > 0
      ? opts.todos.map((t) => `- [${t.status === 'done' ? 'x' : t.status === 'in_progress' ? '~' : ' '}] ${t.content}`).join('\n')
      : '- (tidak ada rencana)';
  const bagianBerkas = `${JUDUL_KONTEKS_BERKAS}\n${daftar}\n`;
  const bagianHasil =
    `${JUDUL_KONTEKS_HASIL}\n` +
    `- Tugas: ${opts.tugas.replace(/\s+/g, ' ').trim().slice(0, 200)}\n` +
    `- Status: ${opts.kategori ? `berhenti (${opts.kategori})` : 'selesai'}\n` +
    `- Langkah terpakai: ${opts.langkah}\n` +
    `- Waktu: ${new Date().toISOString()}\n` +
    `\n#### Rencana saat run berakhir\n${rencana}\n`;
  const baru = gantiBagian(gantiBagian(isi, JUDUL_KONTEKS_BERKAS, bagianBerkas), JUDUL_KONTEKS_HASIL, bagianHasil);
  if (baru === isi) return;
  try {
    await cmd.fsWrite(jalur, baru, undefined, undefined, { wasExisting: true });
  } catch {
    /* Catatan konteks adalah kemudahan, bukan hasil kerja: kegagalannya tidak
       boleh mengubah status run yang sudah benar. */
  }
}

let seq = 0;
const nextId = (p: string) => `${p}-${Date.now().toString(36)}-${++seq}`;

// Multi-file tasks commonly need more than 60 tool turns. Keep a finite
// safety cap, but do not stop a healthy agent halfway through a normal task.
// 200: a full website or app scaffold (6-12 files, each written then verified
// once) runs 80-140 steps once wasteful re-reads are counted as no-progress;
// 120 cut those off mid-build. The no-progress guard, not this ceiling, is what
// stops a genuinely looping run, so a higher cap only helps real work finish.
export const MAX_AGENT_STEPS = 200;

/**
 * How many times a malformed/truncated tool call is re-asked before the run
 * stops.
 *
 * Measured, not guessed: a Fase 5 run died at `write_file` for a README after
 * nine files had already been written, because the model emitted unterminated
 * JSON and the old budget was a single retry. The call is re-asked WITH the
 * snippet of the broken argument, so each retry is a real chance to fix it
 * rather than a blind re-roll.
 *
 * Truncated calls (output limit hit) keep their own budget - see the call site:
 * they double the output ceiling instead, because the JSON was fine and simply
 * did not fit.
 */
export const AGENT_MALFORMED_RETRY = 3;

/*
 * Sidik pesan galat terakhir yang SAMA.
 *
 * Dipakai untuk membedakan "model mencoba lagi dengan cara berbeda" (galatnya
 * berubah = kemajuan) dari "model mengulang perintah yang sama dan gagal dengan
 * cara yang sama" (galat identik = treadmill). Tanpa pembeda ini, setiap
 * pemanggilan tool penulis yang GAGAL tetap mereset penghitung tanpa-kemajuan,
 * dan run bisa berputar ratusan langkah tanpa satu pun perubahan di disk.
 */
let sidikGagalTerakhir = '';
function sidikGagal(nama: string, hasil: string): string {
  /* Cuplikan saja: pesan galat panjang sering sama di 200 karakter pertama. */
  return `${nama}::${hasil.slice(0, 200)}`;
}

/**
 * How long a permission request may wait before it is treated as DENIED.
 *
 * Two minutes: long enough for a reader to notice the panel and press Allow,
 * short enough that a run started where no panel can appear does not sit idle
 * for the 15-minute watchdog. On expiry the step is skipped WITH a toast, so the
 * agent continues with other tools instead of dying silently.
 *
 * Overridable at runtime (`setIzinTimeout`) so a harness can prove the timeout
 * path in three seconds instead of sitting through two minutes. The value is
 * read at call time, never captured, so the override is honest.
 */
export const IZIN_TIMEOUT_MS = 120_000;

let izinTimeoutMs = IZIN_TIMEOUT_MS;
export const setIzinTimeout = (ms: number): void => {
  izinTimeoutMs = Math.max(1000, Math.min(600_000, ms));
};
export const izinTimeoutAktif = (): number => izinTimeoutMs;

/**
 * Classify only explicit URL navigation requests. A URL is required, as is a
 * clear open/navigate/visit verb; inspection, fetching, clicking, execution,
 * and verification language always makes the request a normal agent task.
 *
 * "buka X di terminal/pane browser" IS navigation - the terminal/shell words
 * only name WHERE the browser pane lives. Only a genuine execution verb aimed
 * at the URL itself (jalankan script/perintah, unduh, ambil/baca isinya, uji,
 * verifikasi) disqualifies it.
 */
/*
 * Sesuatu yang jelas-jelas nama situs, bukan sekadar kata berakhiran "com".
 *
 * Versi lama hanya menerima `http://`, `https://`, dan `www.`, sehingga
 * permintaan yang paling wajar justru ditolak: "buka google.com" dan "buka
 * youtube" bukan URL menurut regex itu. Pola di bawah menerima domain telanjang
 * (`google.com`, `youtube.co.id`, `localhost:5173`), dan sengaja menolak nama
 * berkas agar "buka src/main.ts" tidak berubah menjadi navigasi - itulah yang
 * membedakan `.com` dari `.ts`.
 */
const POLA_URL_NAVIGASI = new RegExp(
  [
    String.raw`https?://[^\s<>)]+`,
    String.raw`\bwww\.[^\s<>)]+`,
    String.raw`\b(?:localhost|127\.0\.0\.1)(?::\d+)?(?:/\S*)?`,
    String.raw`\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|dev|ai|app|co|id|me|xyz|info|edu|gov|tv|site|online|store|blog|news|tech|cloud|page|link|live|pro|space|website|fun|club|today|world|life|zone|digital|studio|design|software|code|sh|to|gg|ly|be|it|fr|de|jp|ru|br|au|ca|in|nl|se|no|pl|es|mx|kr|cn|tw|hk|sg|my|th|vn|ph|tr|ir|sa|ae|eg|za|ng|ke|pk|bd|lk|np|mm|kh|la|mn|kz|ua|by|cz|sk|hu|ro|bg|gr|pt|ch|at|dk|fi|ie|is|ee|lv|lt|si|hr|rs|ba|mk|al|mt|cy|lu|mc|li|ad|sm|va|gi|im|je|gg|fo|gl|aq|tf|hm|bv|gs|um|us|uk|ca|au|nz|eu|asia|int|mil|aero|coop|museum|jobs|mobi|name|pro|tel|travel|xxx|cat|coop)\b`,
  ].join('|'),
  'i',
);

export function isNavigationOnlyRequest(text: string): boolean {
  const source = String(text ?? '').trim();
  if (!source || !POLA_URL_NAVIGASI.test(source)) return false;

  const explicitNavigation =
    /\b(?:open|navigate|visit|go\s+to|buka|navigasi|kunjungi|pergi\s+ke)\b/i.test(source) ||
    /\bcoba\s+jalankan\s+ini\b/i.test(source);
  if (!explicitNavigation) return false;

  /*
   * Maksud lain pada URL-nya membatalkan navigasi.
   *
   * Versi lama mensyaratkan kata kerja Indonesia diikuti `script|perintah|ini
   * di terminal`, sehingga "buka https://example.com lalu jalankan npm install"
   * LOLOS sebagai navigasi - padahal separuh perintahnya adalah pekerjaan nyata,
   * dan menghentikan agent setelah halaman terbuka akan membuang instruksi itu.
   * Sekarang kata kerja eksekusi berdiri sendiri, jadi bentuk apa pun tertangkap.
   *
   * Kata penunjuk tempat (terminal/shell/pane/browser) tetap TIDAK membatalkan:
   * itu hanya menyebut di mana halaman harus dibuka.
   */
  /*
   * "coba jalankan ini <url>" adalah IDIOM, bukan perintah eksekusi.
   *
   * Orang memakainya untuk berarti "buka ini", dan pola `jalankan` di bawah
   * akan membatalkannya. Diperiksa lebih dulu, dan HANYA bentuk utuh itu:
   * "coba jalankan ini" yang diikuti ketentuan lain tetap tertangkap.
   */
  const cobaJalankan = /\bcoba\s+jalankan\s+ini\b/i.test(source);
  if (cobaJalankan && source.replace(/\bcoba\s+jalankan\s+ini\b/i, '').trim().split(/\s+/).length <= 1) {
    return true;
  }

  const executionOrInspection =
    /\b(?:jalankan|execute|run|download|fetch|read|check|inspect|click|test|verify|install|build|rename|deploy)\b/i.test(source) ||
    /\b(?:unduh|ambil|baca|cek|periksa|inspeksi|klik|uji|verifikasi|pasang|bangun|ganti\s+nama|serahkan)\b/i.test(source);
  if (executionOrInspection) return false;

  return true;
}

function normalizedBrowserUrl(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    url.hash = '';
    url.pathname = url.pathname.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/';
    return url.toString().toLowerCase();
  } catch {
    return raw.replace(/\/$/, '').toLowerCase();
  }
}

export interface AgentStep {
  kind: 'mulai' | 'tool' | 'selesai';
  name?: string;
  args?: string;
  result?: string;
  ok?: boolean;
  at: number;
}

interface AgentStepResult {
  content: string;
  toolCalls: AgentToolCall[];
  cancelled: boolean;
  error?: string;
  /**
   * Pemakaian token yang dilaporkan provider untuk putaran ini.
   *
   * Subagent memakainya untuk menjumlahkan token dan menghitung biaya. Dibuat
   * opsional: tidak semua provider melaporkannya, dan `undefined` berarti
   * "tidak dilaporkan" - bukan nol.
   */
  usage?: { input: number; output: number };
  /**
   * Penalaran putaran ini, dibawa masuk ke riwayat.
   *
   * Dibuang berarti setiap langkah menurunkan ulang apa yang sudah
   * disimpulkannya, karena permintaan berikutnya menunjukkan kesimpulan tanpa
   * jejak cara mencapainya. Provider yang mengekspos penalaran mengharapkannya
   * kembali; Anthropic memvalidasi tanda tangan pada blok thinking.
   */
  reasoning?: string;
  reasoningSignature?: string;
}

/** Satu langkah agen. `pesan` adalah blok yang dikirim ke provider, `tampil` teks langkah itu. */
interface LangkahRiwayat {
  /** Pesan yang benar-benar dikirim ke provider - satu objek per langkah. */
  pesan: AgentMsg;
  /** Teks langkah ini saja, terpisah dari blok yang dikirim ke provider. */
  tampil: string;
}

export interface AgentTodo {
  content: string;
  status: 'pending' | 'in_progress' | 'done';
  startedAt?: number;
  endedAt?: number;
  /**
   * Identitas stabil satu baris tugas.
   *
   * Sebelumnya tipe ini TIDAK punya id, dan `setAgentTodos` membuangnya kalau
   * ada. Tanpa identitas, React memakai kunci cadangan yang diturunkan dari
   * ISI tugas - sehingga menyunting teks sebuah tugas melepas-pasang barisnya
   * (animasi centang dan durasi yang berjalan ikut tereset), dan dua tugas
   * berisi sama menghasilkan kunci kembar.
   */
  id?: string;
}

/*
 * Batas jumlah tugas yang diterima dalam satu tulisan.
 *
 * Angkanya dulu 20, dan itu memotong daftar panjang DIAM-DIAM: uji langsung
 * dengan 68 tugas menghasilkan laporan "20 tugas" sementara 48 baris hilang
 * tanpa satu pun pesan - persis pengurangan kerja senyap yang dilarang.
 * Rencana kerja nyata (mis. plan bertahap di dokumen proyek) jauh di atas 20
 * langkah, jadi batasnya juga jauh di atas kebutuhan wajar.
 *
 * Batas tetap ada sebagai pengaman kalau model mengirim daftar tak masuk akal,
 * tapi setiap pemotongan WAJIB terdengar: jumlah entri yang dibuang dicatat di
 * `dipangkasTodo` dan dibaca tool `todo_write` supaya peringatannya sampai ke
 * pengguna dan ke model, bukan cuma menguap.
 */
export const MAX_TODOS = 200;

/** Entri yang dibuang karena batas di atas pada panggilan terakhir. */
let dipangkasTodo = 0;
export const todoTerpangkas = () => dipangkasTodo;

/*
 * Tool yang benar-benar mengubah isi disk.
 *
 * Sengaja BUKAN `TOOL_PENULIS`: himpunan itu juga memuat `bash_run`,
 * `todo_write`, dan tool browser - yang justru dipakai untuk memeriksa. Kalau
 * ikut masuk, catatan "berkas yang sudah kamu tulis" akan berbohong kepada
 * model dan bukannya menghentikan pembacaan berulang.
 */
const TOOL_TULIS_BERKAS = new Set([
  'write_file', 'multi_edit', 'replace_in_files', 'copy_file', 'move_file', 'delete_file',
]);

/** Tool yang jelas-jelas tidak mengubah apa pun. */
const TOOL_HANYA_BACA = new Set([
  'read_file', 'list_directory', 'glob', 'grep', 'search_files', 'read_terminal',
]);

/**
 * Perintah shell yang isinya MEMBACA saja.
 *
 * Layak dihitung: pada run nyata model yang kehilangan konteks berkas beralih
 * ke `bash_run` dengan `powershell -c "[IO.File]::ReadAllText(...)"` atau
 * `Select-String` untuk melihat isi berkas - tercatat 13 kali dalam satu run
 * enam berkas. Kalau perintah seperti itu tidak dihitung sebagai bacaan,
 * penghitung "sudah berapa langkah hanya membaca" berhenti di nol dan tidak
 * pernah menyodok.
 */
const SHELL_BACA =
  /(\bget-content\b|\breadalltext\b|\bselect-string\b|\bfindstr\b|\bget-childitem\b|\bcat\b|\btype\s|\bdir\s|\bls\s)/i;

function bacaLewatShell(cmd: string): boolean {
  return SHELL_BACA.test(cmd) && !/(>|>>|\bset-content\b|\bout-file\b|\bnew-item\b|\bremove-item\b|\bdel\s)/i.test(cmd);
}

/** Path dari argumen tool. `args` disimpan sebagai JSON string di langkah. */
function pathDariArgumen(args: string | undefined): string {
  const t = String(args ?? '');
  if (!t) return '';
  try {
    const o = JSON.parse(t) as Record<string, unknown>;
    const p = o.path ?? o.file ?? o.file_path ?? o.target ?? o.from ?? o.to;
    if (typeof p === 'string' && p.trim()) return p.trim();
  } catch {
    /* Argumen yang bukan JSON: dicoba lewat pola di bawah. */
  }
  const m = /"(?:path|file|file_path|target|from|to)"\s*:\s*"([^"]+)"/.exec(t);
  return m ? m[1].trim() : '';
}

/**
 * Berkas yang sudah ditulis/diubah pada giliran ini, urut kejadian dan unik.
 *
 * Inilah jawaban untuk loop termahal pada tugas besar: hasil tool yang lama
 * dipangkas menjadi 500 karakter (`potongHasilRiwayat`) dan `toolCalls` langkah
 * lama dibuang dari wire, jadi model kehilangan catatan apa yang pernah
 * ditulisnya. Tanpa daftar ini, satu-satunya cara ia tahu isi sebuah berkas
 * adalah membacanya lagi - dan itulah yang mengubah tugas 40 berkas menjadi 40
 * pembacaan berulang sementara rencananya tidak pernah selesai.
 */
export function berkasDitulisGiliran(steps: AgentStep[]): string[] {
  const urut: string[] = [];
  const ada = new Set<string>();
  for (const s of steps) {
    if (s.kind !== 'tool' || s.ok === false) continue;
    if (!TOOL_TULIS_BERKAS.has(String(s.name ?? ''))) continue;
    const p = pathDariArgumen(s.args);
    if (!p || ada.has(p)) continue;
    ada.add(p);
    urut.push(p);
  }
  return urut;
}

/** Berapa langkah tool TERAKHIR yang berturut-turut hanya membaca. */
export function ekorHanyaBaca(steps: AgentStep[], maks = 20): number {
  const tool = steps.filter((s) => s.kind === 'tool');
  let n = 0;
  for (let i = tool.length - 1; i >= 0 && n < maks; i--) {
    const nama = String(tool[i].name ?? '');
    const baca =
      TOOL_HANYA_BACA.has(nama) ||
      (nama === 'bash_run' && bacaLewatShell(String(tool[i].args ?? '')));
    if (!baca) break;
    n++;
  }
  return n;
}

export function statusPekerjaan(
  todos: AgentTodo[],
  steps: AgentStep[],
  langkahKe: number,
  maksLangkah: number,
): string {
  const baris: string[] = [`# Status pekerjaanmu (langkah ${langkahKe}/${maksLangkah})`];

  if (todos.length) {
    const simbol = (s: AgentTodo['status']) =>
      s === 'done' ? '[x]' : s === 'in_progress' ? '[~]' : '[ ]';
    baris.push('## Rencana (todo_write)');
    for (const t of todos) baris.push(`- ${simbol(t.status)} ${t.content}`);
  } else {
    baris.push('## Plan: none yet. When a task needs 3+ steps, write the plan into todo_write.');
  }

  // Only the relevant tool steps; take the last 8 so the prompt stays compact.
  const tool = steps.filter((s) => s.kind === 'tool').slice(-8);
  if (tool.length) {
    baris.push('## Langkah tool terakhir (terbaru di bawah)');
    for (const s of tool) {
      const tanda = s.ok === false ? 'GAGAL' : 'ok';
      baris.push(`- ${s.name} [${tanda}]${s.ok === false && s.result ? `: ${s.result.slice(0, 160)}` : ''}`);
    }
    const gagal = tool.filter((s) => s.ok === false);
    if (gagal.length) {
      baris.push(
        `## Warning: ${gagal.length} of the last steps FAILED. ` +
          'Do not repeat the same approach — try something different or explain the blocker.',
      );
    }
  }

  /*
   * Kerja-log: berkas yang SUDAH jadi, ditulis ulang di setiap langkah.
   *
   * Ini bagian yang membuat tugas panjang bisa diselesaikan. Riwayat yang
   * dikirim ke provider memangkas hasil tool lama jadi 500 karakter dan
   * membuang `toolCalls` langkah lama, jadi setelah beberapa langkah model
   * benar-benar tidak lagi memegang isi berkas yang ia tulis sendiri. Yang
   * dilakukannya lalu: membacanya lagi - berulang - sampai batas langkah habis.
   * Daftar ini murah (satu baris per berkas) dan memberi tahu dua hal yang
   * mahal dipulihkan: berkas apa yang sudah ada, dan bahwa isinya tidak perlu
   * diverifikasi ulang.
   */
  const ditulis = berkasDitulisGiliran(steps);
  if (ditulis.length) {
    baris.push(
      `## Berkas yang SUDAH kamu tulis di giliran ini (${ditulis.length}) - jangan dibaca ulang untuk memastikan isinya`,
    );
    for (const p of ditulis.slice(-40)) baris.push(`- ${p}`);
  }

  /*
   * Sodokan "berhenti membaca".
   *
   * Dibandingkan dengan penjaga tanpa-kemajuan di loop agen, penghitung ini
   * mengukur hal yang berbeda: penjaga itu menghitung langkah yang tidak
   * mengubah apa pun, sedangkan membaca berkas yang belum pernah dibaca tetap
   * dianggap nol di sana walaupun model sudah berputar-putar. Di sini yang
   * dihitung hanyalah ekor langkah: kalau sepuluh langkah terakhir semuanya
   * membaca, tidak ada informasi baru yang bisa didapat dari langkah kesebelas.
   */
  const bacaEkor = ekorHanyaBaca(steps);
  if (bacaEkor >= BATAS_TULIS_PAKSA) {
    if (ditulis.length > 0) {
      baris.push(
        `## Berhenti membaca: ${bacaEkor} langkah terakhir tidak mengubah apa pun.`,
        'Berkas di daftar atas sudah ada di disk persis seperti yang kamu kirim - isinya tidak perlu',
        'diverifikasi lagi dengan membacanya. Tulis berkas BERIKUTNYA sekarang (`write_file`, satu berkas',
        'penuh per panggilan), atau tandai item rencananya `done` lewat `todo_write` lalu kerjakan item',
        'berikutnya.',
      );
    } else if (todos.length > 0) {
      baris.push(
        `## Berhenti membaca: ${bacaEkor} langkah terakhir hanya membaca dan belum ada berkas yang ditulis.`,
        'Rencananya sudah kamu susun sendiri, jadi bahan sudah cukup. Kerjakan item pertamanya sekarang',
        'dengan `write_file`.',
      );
    }
  }

  return baris.join('\n');
}

/*
 * Expand a leading slash command in a message about to be sent.
 *
 * `/explain why this fails` becomes the template body with the argument and the
 * editor selection filled in. A message that does not start with a known command
 * is returned untouched, which is what keeps ordinary text - including text that
 * happens to start with a slash, like a path - safe.
 */
function perluasPerintah(teks: string): { kirim: string; tampil: string } {
  return expandPromptBody(teks, activeSelection()) ?? { kirim: teks, tampil: teks };
}

let agentConfirmResolve: ((ok: boolean) => void) | null = null;

/*
 * Penunggu jawaban pertanyaan (`agentTanya`).
 *
 * Berbeda dari `agentConfirmResolve` yang menerima boolean, ini menerima
 * STRING: pertanyaan bebas tidak bisa dijawab dengan ya/tidak.
 *
 * `null` juga punya arti sendiri di sini - bukan "belum dijawab", melainkan
 * "user menutup pertanyaannya tanpa menjawab". Tool-nya harus bisa membedakan
 * keduanya, karena jawaban kosong yang disengaja berbeda dari pembatalan.
 */
let agentTanyaResolve: ((jawaban: string | null) => void) | null = null;

let agentStepResolve: ((r: AgentStepResult) => void) | null = null;

// The UI message id is stable across agent steps, but every provider call must
// have its own id so a cancelled worker cannot deliver into a later attempt.
let activeAgentAttempt: string | null = null;
let activeAgentUiId: string | null = null;

/**
 * Which surface the running agent belongs to: the EDITOR's AI panel, or the
 * separate Agents window ("Open in Agents").
 *
 * Recorded at the moment a run starts because the tools that consult it —
 * `ask_user` today — run from inside the loop, where the composer id is not in
 * scope. The two surfaces have separate switches in Conversation settings, and
 * a tool that could not tell them apart would have to honour both, which is the
 * same as honouring neither.
 */
let activeAgentPermukaan: 'editor' | 'agents' = 'editor';

/** The surface of the run in flight. Read by agent tools, never by the UI. */
export const permukaanAgentAktif = (): 'editor' | 'agents' => activeAgentPermukaan;

const cancelledAttempts = new Set<string>();
const retiredAgentAttempts = new Set<string>();

let agentBatal = false;
let agentStopReason: AgentStopReason | null = null;

function classifyAgentFailure(error: string, reason: AgentStopReason | null = agentStopReason): AgentFailureCategory {
  const text = error.toLowerCase();
  if (reason === 'guard') return 'tool';
  if (reason === 'watchdog' || /watchdog|idle|timed out|timeout|batas waktu|berhenti menjawab/.test(text)) return 'timeout';
  if (reason === 'user' || /cancelled by the user|dibatalkan pengguna|user cancel/.test(text)) return 'cancelled';
  if (/tool|shell|process|command|terminal|alat/.test(text) && /error|failed|fail|timeout|gagal|tidak/.test(text)) return 'tool';
  if (/protocol|malformed|tool call|stream ended|eof|format/.test(text)) return 'protocol';
  if (/provider|network|connection|connect|dns|econn|receive response|unauthorized|forbidden|api/.test(text)) return 'provider';
  return 'unknown';
}

function agentFailureLabel(category: AgentFailureCategory): string {
  return category[0].toUpperCase() + category.slice(1);
}

function safeAgentFailureMessage(message: string): string {
  return message
    .replace(/https?:\/\/[^\s)]+/gi, '[redacted URL]')
    .replace(/\b(?:sk|key|token|api[_ -]?key)\s*[:=]\s*[^\s,;]+/gi, 'credential: [redacted]');
}

const cancelled = new Set<string>();

/*
 * Setiap penolakan di jalur agent WAJIB meninggalkan jejak yang terlihat.
 *
 * `return false` telanjang dari `sendAgent` memberi tahu pemanggil bahwa
 * kirimannya tidak jalan, tapi kalau tidak ada toast, pembaca hanya melihat
 * tombol Kirim yang seolah tidak melakukan apa-apa - persis keluhan "tidak ada
 * reaksi". Helper ini memaksa setiap penolakan melewati satu pintu yang selalu
 * menyetel toast, sehingga `return false` diam-diam jadi canggung secara
 * struktural, bukan sekadar konvensi yang bisa lupa dipatuhi.
 */
function gagalKirimToast(pesan: string): false {
  // Module-level helper, so it reaches the store through the singleton rather
  // than the closure `set` that only exists inside `create(...)`.
  useAi.setState({ toast: pesan });
  return false;
}

/*
 * The last agent step at which automatic compaction ran. Module-level so it
 * spans the whole run: the cooldown has to survive across loop iterations, and
 * resetting it per send would let a long task compact on every single step.
 */
let autoCompactStep = -AUTO_COMPACT_COOLDOWN_STEPS;

/**
 * Jejak pemadatan konteks - INSTRUMENTASI untuk harness, bukan perilaku app.
 *
 * A(ii) tidak bisa diverifikasi dari berkas di disk: kalau tugas asli hilang
 * setelah pemadatan, run biasanya tetap menulis sesuatu sebelum tersesat, jadi
 * "ada berkas" bukan bukti. Yang perlu dibuktikan adalah isi riwayat yang
 * benar-benar dikirim SESUDAH pemadatan: apakah kalimat permintaan user masih
 * ada di sana. Karena itu tiap pemadatan mencatat ringkasannya di sini, dan
 * harness membacanya lewat bridge `__ZEPHYR_AI__.jejakPemadatan`.
 */
export const jejakPemadatan: Array<{
  langkah: number;
  sebelum: number;
  sesudah: number;
  diringkas: number;
  tugasDisuntik: boolean;
  tugasAsli: string;
  sisaTodo: number;
}> = [];

/** Reset the compaction cooldown at the start of a fresh agent run. */
export function resetAutoCompact() {
  autoCompactStep = -AUTO_COMPACT_COOLDOWN_STEPS;
}

/**
 * Agent step watchdog.
 *
 * A provider can hang: the connection is open, headers sent, then not a single
 * byte more and no stream close. At that point Rust never sends
 * "toolDone", so the frontend's step promise waits forever and
 * `agentBusy` stays true. The effect is broad: the Stop button does not give the UI back,
 * and subagents cannot run because the form refuses while agentBusy is true.
 *
 * The watchdog resets the timer every time a chunk arrives. If it is truly quiet
 * for more than AGENT_IDLE_MS, the step is considered failed and the agent status is released.
 */
// Rust's receive idle timeout is 300s (aligned below). The frontend watchdog
// sits above it so Rust reports the stall first with its own message, and the
// frontend only fires when Rust itself never answered at all.
const AGENT_IDLE_MS = 900_000;

/*
 * Batas tanpa KEMAJUAN, jauh di bawah batas diam.
 *
 * Dua timer ini menjawab dua kegagalan berbeda, dan menyatukannya membuat salah
 * satunya buta:
 *
 *   `AGENT_IDLE_MS` (360 detik) mengukur "provider tidak mengirim apa-apa".
 *     Cocok untuk koneksi yang mati total.
 *
 *   Timer ini mengukur "provider mengirim sesuatu, tapi tidak ada ISI BARU".
 *     Itu bentuk macet yang paling sering terjadi dan paling sulit dilihat:
 *     stream tetap hidup, keep-alive dan potongan usage terus datang, dan
 *     watchdog diam tidak pernah menembak karena setiap byte dianggap tanda
 *     sehat. Yang akhirnya menghentikan run hanya batas keras 15 menit.
 *
 * Batasnya harus cukup lega untuk kerja berat yang SEHAT, karena satu-satunya
 * cara timer ini menyala adalah dengan mematikan langkah yang sedang berjalan.
 * 120 detik terbukti terlalu pendek: model frontier yang menalar panjang sebelum
 * tool call, atau yang menyusun argumen `write_file` besar, benar-benar bisa
 * tidak mengirim token baru selama beberapa menit. Setiap kali itu terjadi,
 * langkah sehat dibunuh dan user melihat tugas berat "terpotong" tanpa sebab.
 *
 * 300 detik diselaraskan dengan `RECEIVE_IDLE_TIMEOUT_SECS` Rust: transport
 * sudah menyerah lebih dulu pada koneksi yang benar-benar mati, jadi timer ini
 * tidak perlu ikut memotong dan cukup menjadi jaring untuk stream yang hidup
 * tapi tidak lagi berguna.
 */
const AGENT_NO_PROGRESS_MS = 600_000;
let agentWatchdog: ReturnType<typeof setTimeout> | null = null;
let agentNoProgress: ReturnType<typeof setTimeout> | null = null;

/*
 * Watchdog lapis kedua: pukulan tunggal di batas mutlak.
 *
 * Watchdog utama di atas disetel ULANG setiap potongan masuk. Itu benar untuk
 * provider yang lambat tapi hidup - tapi justru salah untuk provider yang
 * mengirim satu potongan setiap dua menit: timer-nya tidak pernah habis,
 * `agentBusy` tetap true, dan UI terkunci pada dasarnya selamanya. Stop tidak
 * mengembalikan UI, dan subagent tidak bisa jalan.
 *
 * Batas mutlak ini TIDAK pernah disetel ulang. Kalau satu langkah berjalan
 * lebih lama dari ini, cepat atau lambat ia salah atau providernya mengirim
 * data tak berguna; dua-duanya bukan alasan menahan UI.
 */
const AGENT_HARD_LIMIT_MS = 45 * 60_000;
let agentHardTimer: ReturnType<typeof setTimeout> | null = null;

function agentHardLimitArm() {
  if (agentHardTimer) clearTimeout(agentHardTimer);
  agentHardTimer = setTimeout(() => {
    agentHardTimer = null;
    if (!useAi.getState().agentBusy) return; // sudah selesai sendiri, tidak ada yang perlu dipaksa
    /* Land any buffered text BEFORE aborting: the exit block decides what the
       bubble shows from `m.content`, and a pending rAF would otherwise append
       text after the message was already finalised. */
    flushChunkBuf();
    agentStopReason = 'hard-limit';
    agentBatal = true;
    /*
     * Resolve the pending step - do NOT just null it. The agent loop is parked
     * on this promise (`res = await new Promise<AgentStepResult>(...)`) and
     * nothing there polls `agentBatal`, so a bare `agentStepResolve = null`
     * leaves the await pending forever: sendAgent never reaches its exit block,
     * the assistant bubble stays `streaming: true`, and the user sees exactly
     * the reported symptom - "press send, no reaction, no error, no toast".
     * The watchdog below resolves in the same way, which is why it never had
     * this bug.
     */
    const r = agentStepResolve;
    agentStepResolve = null;
    agentConfirmResolve = null;
    r?.({
      content: '',
      toolCalls: [],
      cancelled: true,
      error: 'Satu langkah melebihi batas 45 menit dan dihentikan.',
    });
    // If no step is waiting (the run hung outside the loop), release the UI
    // directly - the resolved step can no longer do it from inside the loop.
    if (!r) {
      useAi.setState({
        agentBusy: false,
  agentBusys: { '': false },
  pendings: { '': null },
        pending: null,
        agentConfirm: null,
  agentTanya: null,
        agentPhase: 'idle',
        agentCurrentTool: null,
        agentStepIndex: 0,
        agentStepLimit: MAX_AGENT_STEPS,
        agentLastProgressAt: null,
        toast: 'Satu langkah berjalan melebihi batas waktu dan dihentikan. Agen siap menerima perintah lagi.',
      });
    }
  }, AGENT_HARD_LIMIT_MS);
}

function agentHardLimitDisarm() {
  if (agentHardTimer) clearTimeout(agentHardTimer);
  agentHardTimer = null;
}

const AGENT_PROVIDER_RETRY_DELAYS = [1000, 2500] as const;
/**
 * Pacer jalur argumen-cacat (keputusan E2, 2026-10-15).
 *
 * Dulu jalur ini mengulang 0 ms - memukul provider lagi persis ketika jawaban
 * rusaknya belum sempat diproses. 1 dtk jeda tetap murah (paling banyak 1 ulang),
 * menutup temuan E2, dan tetap bisa dibatalkan lewat Stop karena pakai
 * `tungguRetryAgent` yang memeriksa `agentBatal`.
 */
const JEDA_ULANG_ARGUMEN_CACAT_MS = 1_000;
/**
 * Berapa kali argumen tool rusak BERTURUT-TURUT masih boleh disodok sebelum
 * run dilempar (lihat `responsToolRusak` di loop agen).
 *
 * Batas 2: sodokan pertama biasanya membuat model menulis JSON yang benar;
 * kalau langkah KETIGA berturut-turut masih rusak, model memang tidak akan
 * pernah menulis JSON yang valid dan melanjutkan hanya memutar langkah.
 */
/*
 * How many malformed tool responses IN A ROW are tolerated before the run stops.
 *
 * Was 2. Measured in Fase 5 (two runs): the agent writes 8-9 of 10 files, then
 * the model emits unterminated JSON for the LAST one (a README) and the run
 * dies - once at attempt 3, once at attempt 34. The work is on disk and
 * complete except for one file, and the reader sees "Agent stopped".
 *
 * Opencode does not stop there: a broken call is ONE FAILED STEP, and the model
 * is asked to rewrite it. The counter exists only to stop a model that can
 * never produce valid JSON - which looks nothing like "one big file out of ten".
 *
 * 4 gives a genuinely stuck model four chances while letting a run that trips
 * on one oversized argument recover. The counter resets on every successful
 * step, so this is a budget for a RUN OF FAILURES, never a run-wide quota.
 */
const BATAS_ARGUMEN_RUSAK_BERTURUT = 4;

/**
 * How many times a run may resume ITSELF after a protocol stop.
 *
 * Two: enough to get past a broken call and finish the file, few enough that a
 * model that cannot produce valid JSON ends with an honest message instead of
 * looping in the background where nobody can see it.
 */
const AUTO_LANJUT_MAKS = 2;

/*
 * PLAFON ANGGARAN KREDENSIAL per menit (60 sukses / 70 percobaan / 60 dtk).
 *
 * Sebelum modul `providerTahan` disambungkan (2026-10-15), jalur kirim nyata
 * NOL KODENYA untuk ini: satu-satunya yang menahan laju adalah tangga retry
 * 41.500 ms per giliran, dan itu mengunci laju BUKAN karena dijaga - jadi
 * dua lajur yang gagal bersamaan menembak provider tanpa rem (temuan f3).
 *
 * Satu jendela dipakai bersama SEMUA giliran (bukan per-giliran): jendela yang
 * di-reset tiap giliran mengirim 70 permintaan/menit dari tiap giliran
 * sekaligus, tepat kesalahan yang melahirkan modul kembar ini.
 */
const jendelaKunci: Record<string, JendelaKredensial> = {};
function jendelaUntuk(provider: string): JendelaKredensial {
  return (jendelaKunci[provider] ??= buatJendela());
}
/**
 * true = masih ada jatah menit; false = user menekan Stop saat menunggu.
 *
 * Menunggu, BUKAN menyerah: menolak di sini adalah bug "menyerah di percobaan
 * ke-3" yang justru diminta hilang. Batas 180 putar (3 menit) mencegah
 * penggantungan tanpa batas; keputusan berhenti tetap milik lapisan bawah.
 */
async function jagaJendela(provider: string): Promise<boolean> {
  const j = jendelaUntuk(provider);
  const jendelaMs = JENDELA_PROVIDER.detik * 1000;
  for (let putar = 0; putar < 180; putar++) {
    const sisa = jatahJendela(j, Date.now(), {
      jendelaMs,
      maksPercobaanJendela: JENDELA_PROVIDER.maksPercobaan,
      maksSuksesJendela: JENDELA_PROVIDER.maksSukses,
    });
    if (!sisa) return true;
    if (!(await tungguRetryAgent(Math.max(250, Math.min(sisa.tungguMs, 5_000))))) return false;
  }
  return true;
}
/** Catat satu percobaan kirim. Dua fungsi terpisah: sukses dicatat SEBELUM dipanggil lagi, jadi tidak double-count. */
function catatPercobaan(provider: string): void {
  jendelaUntuk(provider).percobaan.push(Date.now());
}
/** Provider benar-benar membalas (bahkan 4xx) = memakai kuota sukses menit. */
function catatSukses(provider: string): void {
  jendelaUntuk(provider).sukses.push(Date.now());
}

/** A malformed tool response is safe to retry: no tool call has been dispatched yet. */
function isRetryableAgentToolResponseError(error: string): boolean {
  const text = error.toLowerCase();
  return (
    text.includes('returned malformed json arguments') ||
    text.includes('arguments must be a json object') ||
    text.includes('is missing arguments') ||
    text.includes('is missing a function name') ||
    /* A tool call cut off at the output-token ceiling: the arguments are
       incomplete JSON, not wrong JSON. Retryable, and the retry raises the
       budget (see `naikkanTokenTerpotong`) so the same file fits next time. */
    text.includes('terpotong karena batas token')
  );
}

/** Whether a tool-response error was caused by hitting the output-token ceiling. */
function isTruncatedToolResponseError(error: string): boolean {
  return error.toLowerCase().includes('terpotong karena batas token');
}

/** Only errors from the provider request itself are eligible for agent retry. */
function isRetryableAgentProviderError(error: string): boolean {
  const text = error.toLowerCase();
  if (
    /\b(?:401|403|400|404)\b/.test(text) ||
    text.includes('unauthorized') ||
    text.includes('forbidden') ||
    text.includes('invalid request') ||
    text.includes('not found') ||
    text.includes('cancel') ||
    text.includes('dibatalkan') ||
    text.includes('tool call') ||
    text.includes('tool error') ||
    text.includes('failed to run tool') ||
    text.includes('malformed')
  ) return false;
  if (/\b(?:408|429|500|502|503|504)\b/.test(text)) return true;
  if (/timeout|timed out|receive response|tidak menjawab|batas waktu/.test(text)) return true;
  /*
   * A broken stream is retryable, and it was NOT being recognised as one.
   *
   * Rust reports a mid-body disconnect as "stream terputus: …" and a garbled
   * frame as "invalid stream response: …". Neither matched any pattern above, so
   * both fell through to the connection test below - which they also fail,
   * because the wording says nothing about a connection. The result was the
   * worst possible combination: the one failure that heavy work hits most often
   * was classified as permanent and killed the run on the spot, with no retry
   * and no wait-recover.
   *
   * These are transport faults by definition - the handshake succeeded and the
   * body died mid-flight - so the same history is worth re-sending.
   */
  if (/stream terputus|invalid stream response|stream ended before completion/.test(text))
    return true;
  return /connection|connect|network|econn|enotfound|reset by peer|broken pipe|dns/.test(text);
}

function tungguRetryAgent(ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const mulai = Date.now();
    const cek = () => {
      if (agentBatal) {
        resolve(false);
        return;
      }
      const sisa = ms - (Date.now() - mulai);
      if (sisa <= 0) {
        resolve(true);
        return;
      }
      setTimeout(cek, Math.min(50, sisa));
    };
    cek();
  });
}

function labelRetryAgent(error: string): string {
  const text = error.toLowerCase();
  return /timeout|timed out|receive response|tidak menjawab|batas waktu/.test(text)
    ? 'provider timeout'
    : 'provider error sementara';
}

/*
 * Wait-recover ladder for a provider that is retryable-down (429/5xx).
 *
 * The tension is real and both ends were tried. [15s, 30s, 60s] (~105s, the
 * original) made a transient hiccup look like a freeze: the reader watched
 * "waiting for provider" for over a minute. Cutting it to ~26s fixed that but
 * broke the other case - a gateway that needs a moment to breathe after a 429
 * was abandoned before it recovered, and a heavy run then died on a hiccup it
 * would have survived.
 *
 * The ladder is now ~38s across three visible steps. That is long enough for a
 * rate-limited gateway to come back, and short enough that the reader is never
 * staring at nothing: each step prints its number, its wait, and the total, with
 * Stop available throughout (see `tungguProviderPulihAgent`). After the ladder
 * the model falls back rather than dying, so a still-busy provider costs a model
 * switch rather than the run.
 */
const TUNGGU_PULIH_DELAYS = [4000, 12000, 22000] as const;

async function tungguProviderPulihAgent(
  setProgress: (p: { agentPhase: 'thinking'; agentCurrentTool: string | null }) => void,
  error: string,
  fase: number,
): Promise<boolean> {
  if (agentBatal) return false;
  const i = Math.min(fase, TUNGGU_PULIH_DELAYS.length - 1);
  const total = TUNGGU_PULIH_DELAYS.reduce((a, b) => a + b, 0);
  const sisaFase = TUNGGU_PULIH_DELAYS.slice(i).reduce((a, b) => a + b, 0);
  // Countdown in 5s ticks so the wait shows it is still alive instead of
  // looking frozen; interruption is checked on every tick.
  const target = Date.now() + TUNGGU_PULIH_DELAYS[i];
  for (;;) {
    if (agentBatal) return false;
    const sisa = Math.max(0, Math.ceil((target - Date.now()) / 1000));
    setProgress({
      agentPhase: 'thinking',
      agentCurrentTool:
        `Menunggu provider pulih (${i + 1}/${TUNGGU_PULIH_DELAYS.length}, ${sisa} dtk, total ~${Math.round(sisaFase / 1000)} dtk dari ~${Math.round(total / 1000)} dtk) karena ${labelRetryAgent(error)} — Stop untuk hentikan`,
    });
    if (sisa <= 0) break;
    if (!(await tungguRetryAgent(Math.min(5000, sisa * 1000)))) return false;
  }
  return !agentBatal;
}

function agentWatchdogArm() {
  if (agentWatchdog) clearTimeout(agentWatchdog);
  /* Timer tanpa-kemajuan dikelola terpisah: ia TIDAK di-reset oleh frame yang
     tidak membawa isi, jadi ia tidak boleh ikut dibatalkan di sini. Kalau ikut,
     provider yang mengirim keep-alive akan mematikan penjaga yang justru
     mendeteksinya. */
  agentWatchdog = setTimeout(() => {
    agentWatchdog = null;
    /* Land buffered text before the step resolves as cancelled, so the exit
       block sees the real content and no late rAF writes after finalisation. */
    flushChunkBuf();
    agentStopReason = 'watchdog';
    agentBatal = true;
    const r = agentStepResolve;
    agentStepResolve = null;
    agentConfirmResolve = null;
    r?.({
      content: '',
      toolCalls: [],
      cancelled: true,
      error: 'Provider berhenti menjawab (timeout). Langkah dihentikan.',
    });
    // If no step is waiting (e.g. it hung outside the loop),
    // force the agent status released so the UI and subagents are not locked.
    if (!r) {
      useAi.setState({ agentBusy: false, agentBusys: { '': false }, pendings: { '': null }, pending: null, agentConfirm: null, agentPhase: 'idle', agentCurrentTool: null, agentStepIndex: 0, agentStepLimit: MAX_AGENT_STEPS, agentLastProgressAt: null, agentStartedAt: null });
    }
  }, AGENT_IDLE_MS);
}

/**
 * Timer "tidak ada ISI BARU", dipasang ulang hanya saat chunk membawa konten.
 *
 * Dipisah dari `agentWatchdogArm` karena keduanya harus bisa menembak
 * sendiri-sendiri: stream yang terus mengirim keep-alive tanpa token baru tidak
 * pernah menyentuh `AGENT_IDLE_MS`, dan justru itulah kasus yang membuat agen
 * menggantung sampai batas keras 15 menit.
 *
 * Pesan yang diberikannya berbeda dari watchdog diam, dan perbedaan itu
 * disengaja: pembaca perlu tahu bahwa providernya HIDUP tapi tidak lagi
 * menghasilkan apa pun, supaya tidak menunggu tanpa alasan.
 */
function agentNoProgressArm() {
  if (agentNoProgress) clearTimeout(agentNoProgress);
  agentNoProgress = setTimeout(() => {
    agentNoProgress = null;
    flushChunkBuf();
    agentStopReason = 'watchdog';
    agentBatal = true;
    const r = agentStepResolve;
    agentStepResolve = null;
    agentConfirmResolve = null;
    r?.({
      content: '',
      toolCalls: [],
      cancelled: true,
      error:
        'Provider masih terhubung tetapi tidak menghasilkan isi baru selama ' +
        `${Math.round(AGENT_NO_PROGRESS_MS / 1000)} detik. Langkah dihentikan.`,
    });
    if (!r) {
      useAi.setState({ agentBusy: false, agentBusys: { '': false }, pendings: { '': null }, pending: null, agentConfirm: null, agentPhase: 'idle', agentCurrentTool: null, agentStepIndex: 0, agentStepLimit: MAX_AGENT_STEPS, agentLastProgressAt: null, agentStartedAt: null });
    }
  }, AGENT_NO_PROGRESS_MS);
}

function agentWatchdogDisarm() {
  if (agentWatchdog) clearTimeout(agentWatchdog);
  agentWatchdog = null;
  if (agentNoProgress) clearTimeout(agentNoProgress);
  agentNoProgress = null;
}

/** Hanya menyetel ulang timer kemajuan; dipakai jalur chunk yang membawa isi. */
function agentNoProgressTandai(): void {
  if (agentNoProgress) agentNoProgressArm();
}

/**
 * Commands that deserve a confirmation before they run.
 *
 * This is a best-effort backstop, NOT a sandbox. It reads one string and guesses;
 * no regex list can decide whether a command is destructive, because the same
 * bytes mean different things depending on the directory, the shell and the
 * alias table. The real boundaries are elsewhere: the approval card, which shows
 * a human the exact command and requires an explicit yes in `ask` mode, and the
 * read-only mode, which refuses every write tool outright before we ever get
 * here. What this list buys is that a trivially destructive command - the one
 * the model typed without thinking - reaches a human instead of the terminal.
 *
 * Rules for maintaining it:
 * - Case-insensitive, always. PowerShell cmdlets, cmd built-ins and SQL keywords
 *   do not care about case, so a pattern without `/i` misses the obvious form.
 * - Argument order is not fixed. `rd /s /q x`, `rd /q /s x`, `rm -fr x` and
 *   `rm --force --recursive x` are the same command.
 * - Anchor on `\b` and keep patterns on one line (`[^\n]*`) so a flag in another
 *   command on the next line does not trigger a false positive.
 * - Favour false positives: one extra approval click costs nothing, a missed
 *   `rm -rf` costs the user their work.
 * - Only the unbounded form counts for DML. `DELETE FROM t WHERE id = 1` is
 *   ordinary work; `DELETE FROM t` is a typo away from an empty table.
 *
 * Keeping the name, signature and export exactly as-is: `isDestructive` is called
 * from the UI (AiPanel, ChatMessage, PromptSection), devBridge and subagentStore.
 */
const DESTRUCTIVE = [
  // POSIX recursive/forced delete, flags in any order, operands anywhere.
  /\brm\s+(-\S+\s+)*-{1,2}\S*(r|recursive|f|force)\S*/i,
  /\brm\b(?=[^\n]*(\s-[a-z]*[rf]|--(recursive|force)))[^\n]*/i,
  /\bsudo\s+rm\b/i,
  // cmd.exe delete, recursive or forced, any order: del /f /s /q, del /q /s /f.
  /\b(del|erase)\b[^\n]*(?:\/[a-z]*[fsq]|\/[a-z]*[fsq])/i,
  /\b(del|erase)\s+\/[a-z]*[fsq][a-z]*\b/i,
  /\bdel\b[^\n]*(?:\/[a-z]*[fsq])\s*[*]?/i,
  // rd / rmdir / Remove-Item recursive in cmd and PowerShell forms.
  /\b(rd|rmdir)\b[^\n]*\/s\b/i,
  /\brmdir\b[^\n]*--recursive/i,
  /\b(remove-item|ri)\b(?=[^\n]*(-recurse|-force|-r\b|-f\b))/i,
  /\bremove-item\b[^\n]*-recurse/i,
  // Overwrites file contents in place, one of the Windows footguns.
  /\bclear-content\b/i,
  /\bset-content\b/i,
  /\bout-file\b[^\n]*-force/i,
  // git: history and working-tree destruction.
  /\bgit\s+push\b[^\n]*(\s-f\b|\s--force(?!-with-lease)\b)/i,
  /\bgit\s+push\b[^\n]*\s\+[^\s]+\s*:/i,
  /\bgit\s+reset\b[^\n]*--hard/i,
  /\bgit\s+clean\b[^\n]*(\s-[a-z]*[fd]|--force|--dry-run)/i,
  /\bgit\s+checkout\b[^\n]*(\s--\s|\s-[a-z]*[df]\b)/i,
  // `git restore .` is the modern spelling of `git checkout -- .`; only
  // --staged/--worktree on a pathspec are safe, so anything else is suspect.
  /\bgit\s+restore\b[^\n]*(\s\.(\s|$)|--staged[^\n]*\s\.(\s|$)|(^|\s)(?!-)([^\s]+\s+)*[^\s-][^\s]*)/i,
  /\bgit\s+restore\b[^\n]*--(worktree|source)/i,
  /\bgit\s+switch\b[^\n]*--discard-changes/i,
  // -D force-deletes unmerged branches, -d only deletes merged ones. Use a
  // negative lookahead for the capital D: a character class cannot carry a
  // case-sensitive flag, so `/i` would let `[^\s]*D` match a plain `-d`.
  /\bgit\s+branch\b[^\n]*(\s-(?=[a-z]*D)[a-z]+D\b|\s-D\b|\s--delete\b[^\n]*--force)/i,
  /\bgit\s+stash\b[^\n]*\b(clear|drop)\b/i,
  // Disk and volume level operations, no undo at all.
  // `format c:`, `format C:` and the option forms `format /q c:` all qualify.
  /\bformat\b(\s+\/[a-z]+)*\s+[a-z]:(\s|$|\\)/i,
  /\bformat-volume\b/i,
  /\bclear-disk\b/i,
  /\bdiskpart\b/i,
  /\bmkfs(\.[a-z0-9]+)?\b/i,
  /\bdd\b[^\n]*\bof=/i,
  /\b(new|initialize)-disk\b/i,
  // Power state and user/owner and ACL changes.
  /\bshutdown\b/i,
  /\b(stop|restart|reset)-computer\b/i,
  /\bsystemctl\b[^\n]*\b(poweroff|reboot|halt)\b/i,
  /\btakeown\b/i,
  /\bicacls\b/i,
  /\bcacls\b/i,
  /\bchmod\b[^\n]*\b(-[a-z]*r\b|\+x\b)/i,
  // Destructive SQL. The unbounded DELETE FROM is the one that hurts.
  /\bDROP\s+(TABLE|DATABASE|SCHEMA|VIEW|INDEX|USER)\b/i,
  /\bTRUNCATE\s+TABLE\b/i,
  /\bDELETE\s+FROM\b(?![^\n]*\bWHERE\b)/i,
];

export function isDestructive(command: string): boolean {
  if (!command) return false;
  return DESTRUCTIVE.some((re) => re.test(command));
}

export function extractCommand(markdown: string): string | null {
  const re = /```(bash|sh|shell|zsh|ps1|powershell|pwsh|cmd|bat|console|terminal)?\s*\n([\s\S]*?)```/gi;
  let last: string | null = null;
  for (;;) {
    const m = re.exec(markdown);
    if (!m) break;
    const lang = (m[1] ?? '').toLowerCase();

    const body = m[2].trim();
    if (!body) continue;
    const isCmdLang = lang !== '' && lang !== 'console' ? true : body.split('\n').length <= 3;
    if (isCmdLang) last = body;
  }
  return last;
}

function judulDari(pesan: string): string {
  const baris = pesan.trim().split('\n')[0].replace(/^[#>*\-\s]+/, '').trim();
  if (!baris) return 'New chat';
  if (baris.length <= 48) return baris;
  const potong = baris.slice(0, 48);
  const spasi = potong.lastIndexOf(' ');
  return (spasi > 24 ? potong.slice(0, spasi) : potong) + '…';
}

function makeSession(model: string, provider: string): ChatSession {
  return {
    id: nextId('chat'),
    title: 'New chat',
    model,
    provider,
    messages: [],
    createdAt: Date.now(),
  };
}

function loadSessions(): { sessions: ChatSession[]; activeId: string | null; activeIds: Record<string, string | null> } {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { sessions: [], activeId: null, activeIds: {} };
    const parsed = JSON.parse(raw) as { sessions?: ChatSession[]; activeId?: string; activeIds?: Record<string, string | null> };
    const sessions = (parsed.sessions ?? [])
      .filter((s) => s && Array.isArray(s.messages))
      .map((s) => ({
        ...s,
        // Old titles may be stored in another language (e.g. "Chat baru" from
        // an earlier version). Normalise them to the standard, already-translated titles.
        title: JUDUL_LAMA.has(String(s.title ?? '')) ? 'New chat' : s.title,
        messages: s.messages.slice(-MAX_MSGS).map((m) => ({ ...m, streaming: false })),
      }));
    const activeId = sessions.some((s) => s.id === parsed.activeId)
      ? (parsed.activeId as string)
      : (sessions[0]?.id ?? null);
    /*
     * Per-surface ids are restored, and a surface that lost its chat (trimmed
     * to the last 20, or deleted on another window) falls back to the primary -
     * a surface pointing at a missing session would render an empty transcript
     * with no way to tell why.
     *
     * EVERY SURFACE GETS ITS OWN SESSION. The rule now:
     *
     *   ''        the right-hand column (the primary surface)
     *   'editor'  the chat tab in the editor area
     *   'agents'  the Agents window
     *
     * The three are independent: each keeps its own conversation, its own todo
     * list and its own running task, so a reader can have one agent editing in
     * the column while another researches in the popped-out window - the way
     * VS Code's chat surfaces behave.
     *
     * `agents` USED TO BE SEEDED with the primary id, which made the popped-out
     * window open the SAME conversation as the column. That was written when the
     * window was only a "pop out" of the same chat; once it became a place to
     * run a second task, sharing the session meant two surfaces writing into one
     * transcript - the exact opposite of what the reader asked for.
     *
     * A surface with no stored id gets `null`, NOT the primary id. `null` means
     * "this surface has not started a conversation yet"; the first `send()` from
     * that surface creates its own session (see `mulaiSesiBaru`). Handing it the
     * primary id is what forced the sharing.
     */
    const activeIds: Record<string, string | null> = { '': activeId, editor: null, agents: null };
    for (const [k, v] of Object.entries(parsed.activeIds ?? {})) {
      if (k === '') continue;
      /*
       * Only restore an id that still EXISTS. A missing one becomes null (start
       * fresh) rather than borrowing the primary conversation: borrowing is how
       * two surfaces ended up sharing one transcript.
       */
      activeIds[k] = sessions.some((s) => s.id === v) ? v : null;
    }
    return { sessions, activeId, activeIds };
  } catch {
    return { sessions: [], activeId: null, activeIds: {} };
  }
}

export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high' | 'ultra';

export type AgentPhase = 'idle' | 'thinking' | 'running-tool' | 'waiting-confirmation' | 'cancelling';

/*
 * Everything one surface shows about ITS run in progress.
 *
 * `null` for a surface with no run. Kept separate from the flat fields below,
 * which remain the primary surface's copy for the ~forty call sites that read
 * them without an id.
 */
export interface AgentSurfaceState {
  steps: AgentStep[];
  phase: AgentPhase;
  currentTool: string | null;
  stepIndex: number;
  stepLimit: number;
  lastProgressAt: number | null;
  startedAt: number | null;
  navigationOnly: boolean;
  /** A question the agent is waiting on, for this run. */
  tanya: { pertanyaan: string; pilihan: string[] } | null;
  /** An approval the loop is blocked on, for this run. */
  confirm: { tool: string; argsText: string; isDestructive: boolean; isWrite?: boolean } | null;
  /** The task list the agent maintains, for this run. */
  todos: AgentTodo[];
}

export interface AgentProgress {
  agentPhase: AgentPhase;
  agentCurrentTool: string | null;
  agentStepIndex: number;
  agentStepLimit: number;
  agentLastProgressAt: number | null;
  agentStartedAt: number | null;
}

interface AiState {
  sessions: ChatSession[];

  /*
   * Which conversation each SURFACE is showing, keyed by composer id.
   *
   * Two `AiPanel`s can be mounted at once — the docked right column and the
   * editor tab — and they are two independent chats, not one shown twice. A
   * single `activeId` made them share a conversation, so sending from the editor
   * also appended the exchange to the column's transcript and ran the column's
   * streaming. Keyed like `drafts`, with `''` as the primary surface (the right
   * column), so every existing no-id call site keeps its old meaning.
   *
   * `activeId` (below) remains the PRIMARY surface's id, kept in sync so the
   * ~20 places that read it for the docked panel — the agent loop, persistence,
   * the model/approval writers — need no change.
   */
  activeIds: Record<string, string | null>;
  activeId: string | null;

  model: string;
  provider: string;

  pending: string | null;

  /*
   * HydraFusion, chat side.
   *
   * `hydraTahap` is the stage running RIGHT NOW (which model, which of the
   * plan's requests, and why) — it is what keeps a three-request route from
   * looking like a hung app. `hydraTerakhir` survives the run so the UI can
   * still answer "which model actually wrote this, and why that one" after the
   * answer has landed.
   *
   * Both are null unless the feature is on and a run is in flight; a plain
   * single-model turn never touches them.
   */
  hydraTahap: HydraLapor | null;
  hydraTerakhir: HydraTerakhir | null;

  /*
   * The run state, keyed by WHICH composer is running — same keys as `drafts`
   * and `activeIds`.
   *
   * `pending`, `antrian` and `agentBusy` were single globals shared by every
   * mounted `AiPanel`, so with the chat open in both the right column and the
   * editor tab the two surfaces shared ONE run: sending from the editor made the
   * column show the "answering…" spinner and its Send button turn into Stop, and
   * a message parked while the editor was busy appeared in the column's queue.
   * Reported as "the queue shows up in both" and "the buttons are still linked".
   *
   * Kept as three parallel records rather than one object per composer so each
   * keeps its own primitive type — zustand compares selector output with `===`,
   * and a nested object would hand back a fresh reference on every read.
   *
   * `''` is the primary surface (the docked right column), so the roughly forty
   * call sites that read the flat `pending`/`agentBusy`/`antrian` — the agent
   * loop, the cancellation path, the provider writers — need no change.
   */
  pendings: Record<string, string | null>;
  antrians: Record<string, AntrianPesan[]>;
  agentBusys: Record<string, boolean>;

  /*
   * The agent RUN's own display state, also per surface.
   *
   * These describe one run in progress: which step it is on, what it is doing,
   * how far along the ETA is, and any question or approval it is waiting on.
   * With two panels mounted and one shared copy, a run started in the editor
   * drew its step trail in the right column too, and an approval prompt appeared
   * on both at once — the reader could answer the same question twice, or answer
   * it on the panel that was not running.
   *
   * Stored as one record rather than a dozen parallel ones because they are
   * always written together by the loop and always read together by the panel
   * that renders the trail. A MISSING key means "this surface has no run", which
   * is what the panel's selectors fall back to.
   */
  agentStates: Record<string, AgentSurfaceState>;

  /*
   * The resumable checkpoint, per surface.
   *
   * A checkpoint is a half-finished task in ONE conversation, so Resume belongs
   * on the panel showing that conversation. Shared, the button appeared on both
   * and pressing it on the wrong panel resumed work into the other one's chat.
   */
  agentResumes: Record<string, { teks: string; images: string[] } | null>;

  /*
   * Messages the user sent while the assistant was still answering.
   *
   * Sending used to be blocked outright while a request was in flight, so a
   * second thought had to be held in the user's head and retyped later. Instead
   * of dropping the text or refusing it, the composer accepts it and parks it
   * here; each entry goes out on its own once the current answer finishes.
   */
  antrian: AntrianPesan[];

  /*
   * `/loop` state, per chat.
   *
   * A loop is a SCHEDULE, not a message - see `lib/loopJadwal.ts` for why it is
   * not a prompt template. It lives in the store rather than in component state
   * so the banner survives the panel being closed and reopened, and so the
   * timer (which lives in the module map) has somewhere to report its runs.
   */
  loops: Record<string, LoopState>;

  /*
   * `/goal` state, per chat.
   *
   * A goal is a standing instruction the agent keeps working on across turns.
   * Stored per chat because two conversations can have two different goals, and
   * clearing one must not clear the other.
   */
  goals: Record<string, GoalState>;

  /*
   * The composer's text, keyed by WHICH composer typed it.
   *
   * `AiPanel` is mounted more than once at a time — the docked right column and
   * the editor tab are two live instances of the same conversation — and a
   * single shared `draft` made them share one input: typing in the editor made
   * the same characters appear in the column, and typing in the column made
   * them appear in the editor. Reported as exactly that.
   *
   * The KEY is the mount's own id, not the tab or the conversation: the same
   * chat shown in two places is one conversation with one transcript, but each
   * SURFACE gets its own half-typed message, which is what a reader expects from
   * two text boxes they can both see.
   *
   * `''` is the primary composer — the docked right column — so every existing
   * caller that passes no id (`setDraft('')` from a menu, a template insert, a
   * test) keeps its old meaning.
   */
  drafts: Record<string, string>;

    attachActive: boolean;

    draftImages: string[];

  lastTruncated: { from: number; to: number } | null;
  keys: PublicModel[];

  modelMenuOpen: boolean;

  confirmCmd: string | null;
  toast: string | null;

  agentMode: 'chat' | 'agent';

  /*
   * How an agent run is dispatched — a real behaviour, not just a label:
   *   - 'interactive' : step-by-step, approvals as configured. The default.
   *   - 'plan'        : the agent must present a plan and STOP before changing
   *                     anything; writes/commands are held back this turn.
   *   - 'autopilot'   : runs to completion without pausing (approval 'auto').
   * Separate from `agentMode` (chat vs agent) and from `approvalMode`: the run
   * mode is the user's intent for the WHOLE turn, which then drives the
   * approval level and a planning instruction in the system prompt.
   */
  runMode: 'interactive' | 'plan' | 'autopilot';

  approvalMode: ApprovalMode;

  agentBusy: boolean;

  /** True only for the current explicit URL-navigation request. */
  agentNavigationOnly: boolean;

  agentPhase: AgentPhase;
  agentCurrentTool: string | null;
  agentStepIndex: number;
  agentStepLimit: number;
  agentLastProgressAt: number | null;
  agentStartedAt: number | null;

  /*
   * Last failed provider-interrupted run, kept so the user can continue from
   * where it stopped instead of redoing finished work. Cleared when a new run
   * starts or when the user resumes it. Deliberately NOT persisted to disk:
   * the history holds tool results that reference a live session.
   */
  agentResume: {
    teks: string;
    history: AgentMsg[];
    images?: string[];
    langkah: number;
    at: number;
  } | null;

  agentSteps: AgentStep[];

  agentConfirm: { tool: string; argsText: string; isDestructive: boolean; isWrite?: boolean } | null;

  /**
   * Pertanyaan yang sedang menunggu jawaban user, diisi lewat jalur
 * pertanyaan (`agentAjukanTanya`) yang kini dipakai juga oleh plan mode.
   *
   * `pilihan` boleh kosong: kalau ada isinya, UI menampilkan tombol pilihan
   * cepat di samping kotak ketik bebas.
   */
  agentTanya: { pertanyaan: string; pilihan: string[] } | null;

  agentTodos: AgentTodo[];
  /**
   * Kartu saran perintah (bekas tool `suggest_command` yang sudah dihapus
   * dari katalog; state dipertahankan supaya kartu lama tetap tampil).
   *
   * Sengaja hanya DATA, bukan aksi: tool ini menampilkan perintah untuk
   * diperiksa user, dan yang menjalankannya adalah user lewat tombol Insert.
   * Kalau tool ini langsung menulis ke PTY, ia berubah menjadi eksekusi shell
   * tanpa izin - persis yang ingin dihindari oleh kelas efek `appWrite`.
   */
  commandSuggestion: {
    command: string;
    alasan?: string;
    at: number;
  } | null;

  promptHistory: string[];
  promptHistoryIdx: number;

  /**
   * How hard the model should think before answering.
   *
   * `null` means "do not ask for reasoning at all" — which is a real setting,
   * not a bug, but it was also the DEFAULT, so every fresh install silently ran
   * without reasoning: the provider was never asked, no thinking block came
   * back, and the transcript had nothing to show. A reader who never opened the
   * effort menu could not tell that the feature existed.
   *
   * The default is now set to `medium` on first run (see `AWAL_EFFORT`), so
   * reasoning works out of the box and a reader who does not want it can turn
   * it off deliberately. `null` still disables it.
   */
  reasoningEffort: ReasoningEffort | null;

  reasoningText: string | null;
}

interface AiActions {
  init: () => Promise<void>;
  loadKeys: () => Promise<void>;
  hasKey: (provider?: string) => boolean;

  /**
   * `providerId` = provider whose group the click came from, when there is one.
   *
   * A model row lives inside a provider group, and clicking it means "use THIS
   * model from THIS provider". Without the argument the resolution fell back to
   * the provider that happened to be active: pick Gemini's `gemini-3.8-flash`
   * while Anthropic is active and the model string changed while the provider
   * stayed `anthropic` - the composer read "Anthropic - gemini-3.8-flash" and
   * the request then went to Anthropic's endpoint. The group is what the user
   * clicked, so the group is what the model must be resolved against.
   */
  setModel: (modelId: string, providerId?: string) => Promise<void>;
  /**
   * Align the AI panel's provider/model with settings.models.activeProvider.
   *
   * The "Active model" dropdown in Settings only writes to settings, whereas the
   * AI panel has its own copy (aiStore.provider). Without alignment, choosing a new
   * provider is only felt after the app is restarted — so this action
   * is called by applySettings every time models.activeProvider changes.
   */
  sinkronProvider: () => void;
  setModelMenuOpen: (v: boolean) => void;
  /*
   * `id` names WHICH composer is typing. Optional so every existing caller keeps
   * working and targets the primary composer (the docked right column).
   */
  setDraft: (v: string, id?: string) => void;
  /** The draft for one composer; '' when it has not typed anything yet. */
  draftOf: (id: string) => string;
    setAttachActive: (v: boolean) => void;

    addDraftImage: (dataUrl: string) => boolean;
    removeDraftImage: (index: number) => void;
    clearDraftImages: () => void;
    setToast: (v: string | null) => void;
  setConfirmCmd: (v: string | null) => void;

  setAgentMode: (m: 'chat' | 'agent') => void;
  setRunMode: (m: 'interactive' | 'plan' | 'autopilot') => void;
  tipsVisible: boolean;

  /*
   * Transcript appearance, from Chat Settings.
   *
   * These three lived as local useState inside ChatSettingsPage - the file's own
   * comment admitted it ("Local state, not saved settings"). The switches moved,
   * the toast fired, and NOTHING changed in the transcript, because the chat
   * never read them. Reported as "I turned Show thinking off and it still
   * thinks" and "sometimes toggling does nothing".
   *
   * They live here because the transcript (ChatMessage, AiPanel) is what must
   * obey them, and in localStorage because they are preferences, not per-chat
   * state.
   */
  showThinking: boolean;
  showStamps: boolean;
  showDividers: boolean;
  /*
   * The "Thinking … 12s" strip above the composer.
   *
   * OFF by default: other agents show no such strip, and the transcript's own
   * thinking line already says the model is working. It stays switchable
   * because a long tool run with no output is the one case where a heartbeat
   * helps - see Chat Settings > Agent.
   */
  showThinkingBar: boolean;
  setTipsVisible: (v: boolean) => void;
  setShowThinking: (v: boolean) => void;
  setShowStamps: (v: boolean) => void;
  setShowDividers: (v: boolean) => void;
  setShowThinkingBar: (v: boolean) => void;
  setApprovalMode: (m: ApprovalMode) => void;

  agentPutuskan: (setujui: boolean) => void;
  /**
   * Ask the reader for permission, with a deadline.
   *
   * Resolves `false` when denied OR when nobody answered in time - the caller
   * treats both as "this step does not run", which is what keeps a run moving
   * instead of hanging forever on a dialog nobody can see.
   */
  agentMintaIzin: (
    tool: string,
    argsText: string,
    opsi: { destruktif?: boolean; tulis?: boolean },
  ) => Promise<boolean>;
  setAgentProgress: (progress: Partial<AgentProgress>) => void;

  /**
   * Ajukan pertanyaan ke user dan tunggu jawabannya.
   *
   * Mengembalikan jawaban yang diketik user, atau `null` kalau pertanyaannya
   * dibatalkan (ditutup tanpa dijawab). Dipakai jalur pertanyaan: model yang
   * menemukan instruksi ambigu berhenti dan bertanya, alih-alih menebak lalu
   * mengerjakan hal yang salah.
   */
  agentAjukanTanya: (pertanyaan: string, pilihan?: string[]) => Promise<string | null>;
  /** Jawab pertanyaan yang sedang menunggu. Dipanggil dari UI. */
  jawabTanya: (jawaban: string | null) => void;

  setAgentTodos: (list: unknown[]) => number;

  /**
   * Kosongkan daftar tugas - TERMASUK yang tidak disebut lagi.
   *
   * Tidak bisa lewat `setAgentTodos([])`: fungsi itu sengaja menambal-balik
   * tugas yang tidak ikut disebut, supaya update parsial dari model tidak
   * menghapus pekerjaan yang sedang jalan. Akibatnya tombol "Clear all tasks"
   * di panel dulu tidak melakukan apa pun - daftarnya tetap penuh, dan satu-
   * satunya cara mengosongkan adalah reload. Penghapusan harus eksplisit, dan
   * inilah jalur eksplisitnya.
   */
  kosongkanTodos: () => void;

  /** Buang hanya tugas yang sudah selesai. Jalur eksplisit yang sama. */
  buangTodosSelesai: () => void;

  /** Tampilkan kartu saran perintah. Tidak menjalankan apa pun. */
  setCommandSuggestion: (s: { command: string; alasan?: string } | null) => void;

  historyUp: () => string | null;
  historyDown: () => string | null;
  addPromptHistory: (prompt: string) => void;
  clearPromptHistory: () => void;

  setReasoningEffort: (e: ReasoningEffort | null) => void;

  sendAgent: (text: string, images?: string[], tampilBubble?: string, composerId?: string) => Promise<boolean>;

  /**
   * Manually compact the active session's context.
   *
   * Keeps the last N messages and replaces the rest with a single summary
   * message, so a long session does not flood the context window. Returns
   * the number of messages that were compacted.
   */
  compactContext: (keep?: number, composerId?: string) => number;

  newChat: (id?: string) => string;
    selectChat: (id: string, composerId?: string) => void;
    deleteChat: (id: string) => void;
    /*
     * Session actions the Agents window's context menu offers.
     *
     * WHY in the store and not in the component: the same operations are
     * reachable from more than one surface (the Agents list, and later a
     * palette command), and a second implementation would drift on the details
     * that matter — whether a rename survives a restart, whether a duplicate
     * copies the workspace, whether pinning reorders the list.
     */
    renameChat: (id: string, title: string) => void;
    duplicateChat: (id: string) => string | null;
    setChatPinned: (id: string, pinned: boolean) => void;
    /**
     * Point the chat surfaces at the conversation belonging to this folder.
     * Called when a workspace is opened, so the transcript on screen is never
     * another project's history.
     */
    ikutiWorkspace: (dir: string | null) => void;

    clearAllChats: () => void;

    clearAllOpen: boolean;
    setClearAllOpen: (v: boolean) => void;

    regenerate: () => Promise<void>;
    activeSession: () => ChatSession | null;

    exportChat: (composerId?: string) => Promise<void>;

  send: (text?: string, images?: string[], composerId?: string) => Promise<boolean>;

  /* Drop one queued message, or clear the whole queue. */
  buangAntrian: (idx: number | string, composerId?: string) => void;
  kosongkanAntrian: (composerId?: string) => void;

  /** Set (or clear, with null) the loop for a chat. The timer is armed here. */
  setLoop: (sessionId: string, loop: LoopState | null) => void;
  /** Stop the loop for a chat and forget it. */
  hentikanLoop: (sessionId: string) => void;
  /**
   * Handle `/loop` and `/goal`. Returns true when the command was consumed, so
   * the caller stops and sends nothing to the provider.
   */
  jalankanPerintahKerja: (teks: string, sessionId: string, composerId?: string) => boolean;
  /** Set (or clear, with null) the goal for a chat. */
  setGoal: (sessionId: string, goal: GoalState | null) => void;
  /*
   * Send one queued message right now, out of turn.
   *
   * The queue is a waiting list, not a fixed script: a reader who queued three
   * things and then decides the third one matters most should be able to
   * promote it without deleting the other two and retyping. The message leaves
   * the queue and goes through the same send() path as a typed one, so it
   * cannot bypass the busy check — it just reorders what was already lined up.
   */
  kirimAntrian: (idx: number | string, composerId?: string) => Promise<boolean>;
  /**
   * Move one queued message one place up or down the line.
   *
   * The queue is a plain list, so reordering it only has to move the entry the
   * user pointed at and leave the rest where they are. The ends are quiet
   * no-ops because the panel already disables the button there; the guard is
   * what makes a stray call harmless rather than a way to install undefined.
   */
  naikkanAntrian: (idx: number | string, composerId?: string) => void;
  turunkanAntrian: (idx: number | string, composerId?: string) => void;
  /*
   * Rewrite one queued message in place.
   *
   * Editing beats delete-and-retype: the queue slot keeps its position, so a
   * reader fixing a typo in the fifth message does not have to rebuild the
   * other four. Blank input is refused rather than saved, so a cleared field is
   * not a way to lose the message by accident.
   */
  ubahAntrian: (idx: number | string, teks: string, composerId?: string) => void;
  /**
   * Send a message now, interrupting whatever is running.
   *
   * The difference from `send` is that it does not queue when the agent is
   * busy: it stops the current run first and waits for it to unwind. When
   * that wait times out the message is queued instead of thrown away.
   */
  kirimSekarang: (teks: string, images?: string[], composerId?: string) => Promise<void>;
  /**
   * Continue the last provider-interrupted run from its checkpoint.
   *
   * Re-sends the same task with the saved history (finished tool results and
   * all), so the model picks up after the last completed step instead of
   * redoing them. Returns false when there is nothing to resume.
   */
  lanjutkanAgent: () => Promise<boolean>;
  cancel: () => Promise<void>;

  onChunk: (c: AiChunk) => void;

  runInTerminal: (command: string, opts?: { confirmed?: boolean }) => Promise<boolean>;
}

export type AiStore = AiState & AiActions;

function persist(state: AiState) {
  try {
    const sessions = state.sessions.slice(-20).map((s) => ({
      ...s,
      messages: s.messages.slice(-MAX_MSGS).map((m) => ({
        ...m,

        tools: m.tools?.map((t) => ({ ...t, result: t.result.slice(0, PERSIST_TOOL_CHARS) })),
      })),
    }));
    localStorage.setItem(LS_KEY, JSON.stringify({ sessions, activeId: state.activeId, activeIds: state.activeIds }));
  } catch {
    /* quota full — the chat still runs in memory */
  }
}

const boot = loadSessions();

/**
 * What a turn DOES: an agent run. Kept as a stored field for older sessions,
 * but no longer a choice.
 *
 * Chat mode was removed at the reader's request (2026-10-13): the AI has tools,
 * reads files and runs commands, so "answer only" was a second dispatch path
 * that behaved like a different product.
 *
 * THAT DECISION IS REVERSED. The two modes are not the same product with one
 * switch removed - they answer different questions. Chat answers; Agent reads
 * files, runs commands and edits code. A reader who wants "what does this regex
 * do" should not have to send it to something that starts opening files, and
 * "why is there no chat" is exactly that complaint. The composer's chip offers
 * both again.
 *
 * The stored choice is read back. It used to return a literal 'agent' while the
 * signature promised to honour what was saved, so the picker's Chat row wrote
 * 'chat' and the next load silently put it back - a switch that looks connected
 * and is not.
 */
function bootAgentMode(): 'chat' | 'agent' {
  try {
    const v = localStorage.getItem('zephyr.ai.mode');
    return v === 'chat' ? 'chat' : 'agent';
  } catch {
    return 'agent';
  }
}

/** Last run mode (Interactive / Plan / Autopilot), kept across sessions. */
/**
 * Whether the composer's Tip strip is shown.
 *
 * A preference, not a run setting: it is chrome the reader chose to remove, and
 * it lives in localStorage rather than Settings because the control to remove
 * it is the strip's own ✕ — an option you only ever reach from the settings
 * page for something you already dismissed is a trap. The re-enable lives in
 * the "…" menu, one click from where the strip used to be.
 */
function bootTips(): boolean {
  try {
    return localStorage.getItem('zephyr.ai.tip') !== '0';
  } catch {
    return true;
  }
}

/*
 * Default ON: a preference that starts off would hide content the reader never
 * asked to hide. `!== '0'` so a missing key reads as on.
 */
function bootTampil(kunci: string): boolean {
  try {
    return localStorage.getItem(kunci) !== '0';
  } catch {
    return true;
  }
}

/*
 * Default OFF: `'1'` turns it on, a missing key keeps it hidden.
 *
 * The opposite rule of `bootTampil` on purpose - a preference that ADDS chrome
 * should start off, so the reader only ever sees it after asking for it.
 */
function bootTampilMati(kunci: string): boolean {
  try {
    return localStorage.getItem(kunci) === '1';
  } catch {
    return false;
  }
}

function bootRunMode(): 'interactive' | 'plan' | 'autopilot' {
  try {
    const v = localStorage.getItem('zephyr.ai.runMode');
    return v === 'plan' || v === 'autopilot' ? v : 'interactive';
  } catch {
    return 'interactive';
  }
}

const EFFORT_KEY = 'zephyr.ai.effort';

/**
 * Reasoning effort, remembered across restarts.
 *
 * The choice was never persisted, so it reset on every launch — which meant a
 * reader who deliberately turned reasoning OFF got it back on, and one who
 * turned it up to Ultra lost that too. A setting that does not survive a
 * restart is not a setting.
 *
 * The default is `medium`: reasoning ON. It used to default to null, i.e. the
 * provider was never asked, so a fresh install produced no thinking block and
 * nothing in the transcript showed that the feature existed at all.
 *
 * `'off'` is stored explicitly so "turned off on purpose" stays distinguishable
 * from "never chosen".
 */
function bootEffort(): ReasoningEffort | null {
  try {
    const v = localStorage.getItem(EFFORT_KEY);
    if (v === 'off') return null;
    if (v === 'minimal' || v === 'low' || v === 'medium' || v === 'high' || v === 'ultra') {
      return v;
    }
  } catch {
    /* storage unavailable — fall through to the default */
  }
  return 'medium';
}

/*
 * Run state, mirrored into per-surface records.
 *
 * `pending`, `agentBusy` and `antrian` are read from roughly forty places — the
 * agent loop, the cancellation path, the queue drain, the provider writers — and
 * rewriting every one of them to take a composer id would be a large, risky
 * change to code that has nothing to do with multiple surfaces.
 *
 * So they stay, and this wrapper keeps them honest: whichever surface wrote the
 * flat value has its per-surface entry updated to match. A surface then reads
 * `pendings[composerId]` / `agentBusys[composerId]` / `antrians[composerId]` and
 * gets its OWN run state, while every untouched call site keeps working on the
 * primary surface's copy.
 *
 * The mapping is positional on purpose: `set` is always called by the surface
 * that is running, and `COMPOSER_AKTIF` is which one that is. It is set by
 * `kirimSekarang`/`sendAgent` at the top of a turn — the only places a run
 * starts — and cleared when the run ends.
 */
let COMPOSER_AKTIF = '';

/** Mirror a flat run-state patch into the writing surface's record. */
function mirrorRun(
  patch: Record<string, unknown>,
  s: AiState,
): Record<string, unknown> {
  const id = COMPOSER_AKTIF;
  const out: Record<string, unknown> = { ...patch };
  if ('pending' in patch) out.pendings = { ...s.pendings, [id]: patch.pending as string | null };
  if ('agentBusy' in patch) out.agentBusys = { ...s.agentBusys, [id]: patch.agentBusy as boolean };
  if ('antrian' in patch) {
    const a = patch.antrian as AntrianPesan[];
    out.antrians = { ...s.antrians, [id]: a };
  }

  /*
   * The agent-display fields, folded into one per-surface record.
   *
   * Each flat key that is present in this patch updates its field on the writing
   * surface's entry; fields the patch does not mention keep their previous value
   * for that surface, so a loop writing only `agentStepIndex` does not wipe the
   * step list. The primary surface's entry exists only once it has run
   * something, which is why a missing entry reads as "no run" rather than as a
   * half-filled one.
   */
  const AGEN_KUNCI: Array<[string, keyof AgentSurfaceState]> = [
    ['agentSteps', 'steps'],
    ['agentPhase', 'phase'],
    ['agentCurrentTool', 'currentTool'],
    ['agentStepIndex', 'stepIndex'],
    ['agentStepLimit', 'stepLimit'],
    ['agentLastProgressAt', 'lastProgressAt'],
    ['agentStartedAt', 'startedAt'],
    ['agentNavigationOnly', 'navigationOnly'],
    ['agentTanya', 'tanya'],
    ['agentConfirm', 'confirm'],
    ['agentTodos', 'todos'],
  ];
  const adaAgent = AGEN_KUNCI.some(([k]) => k in patch);
  if (adaAgent) {
    const lama = s.agentStates[id];
    const dasar: AgentSurfaceState = lama ?? {
      steps: [],
      phase: 'idle',
      currentTool: null,
      stepIndex: 0,
      stepLimit: 0,
      lastProgressAt: null,
      startedAt: null,
      navigationOnly: false,
      tanya: null,
      confirm: null,
      todos: [],
    };
    const next: AgentSurfaceState = { ...dasar };
    for (const [k, field] of AGEN_KUNCI) {
      if (k in patch) (next as unknown as Record<string, unknown>)[field] = patch[k];
    }
    out.agentStates = { ...s.agentStates, [id]: next };
  }
  if ('agentResume' in patch) {
    out.agentResumes = { ...s.agentResumes, [id]: patch.agentResume as { teks: string; images: string[] } | null };
  }

  return out;
}

/*
 * The live AI store for THIS window, published so that anything holding a chunk
 * callback can reach the same instance the UI renders.
 *
 * Why this exists: a chunk subscription created before an HMR boundary (or in a
 * window that ends up with two copies of this module) can close over an
 * instance that is no longer the one React reads. Chunks then land in a store
 * nobody displays - the transcript stays empty, `agentBusy` is never cleared,
 * and the chat sits on "thinking" forever with no error to explain it. Measured
 * directly: the Tauri listener fired (4 chunks received) while
 * `__ZEPHYR_AI_CALLBACK__ !== useAi.getState().onChunk`.
 *
 * Published on `window` because the duplication is a property of module
 * loading, not of any component - a global is the only scope both copies share.
 */
declare global {
  interface Window {
    __ZEPHYR_AI_STORE__?: typeof useAi;
  }
}

export const useAi = create<AiStore>((set0, get) => {
  /*
   * Every write goes through `mirrorRun` first, so the flat run-state keys and
   * their per-surface copies can never drift. Accepts both zustand call shapes —
   * a patch object and an updater function — because the store uses both.
   */
  const set: typeof set0 = (partial, replace) => {
    if (typeof partial === 'function') {
      return set0(
        (s) => mirrorRun((partial as (st: AiState) => Record<string, unknown>)(s), s) as never,
        replace as never,
      );
    }
    return set0((s) => mirrorRun(partial as Record<string, unknown>, s) as never, replace as never);
  };

  return {
  sessions: boot.sessions,
  activeId: boot.activeId,
  activeIds: boot.activeIds,
  model: 'custom-model',
  provider: 'custom',
  pending: null,
  hydraTahap: null,
  hydraTerakhir: null,
  pendings: { '': null },
  antrian: [],
  antrians: { '': [] },
  loops: {},
  goals: {},
  drafts: { '': '' },
    attachActive: false,
    draftImages: [],
    lastTruncated: null,
  keys: [],
  modelMenuOpen: false,
  confirmCmd: null,
  toast: null,
  clearAllOpen: false,

  agentMode: bootAgentMode(),
  runMode: bootRunMode(),
  tipsVisible: bootTips(),
  showThinking: bootTampil('zephyr.ai.tampil.think'),
  showStamps: bootTampil('zephyr.ai.tampil.stamp'),
  showDividers: bootTampil('zephyr.ai.tampil.divider'),
  showThinkingBar: bootTampilMati('zephyr.ai.tampil.thinkbar'),

  approvalMode: boot.sessions.find((s) => s.id === boot.activeId)?.approval ?? 'auto',
  agentBusy: false,
  agentBusys: { '' : false },
  agentStates: {},
  agentResumes: {},
  agentNavigationOnly: false,
  agentPhase: 'idle',
  agentCurrentTool: null,
  agentStepIndex: 0,
  agentStepLimit: MAX_AGENT_STEPS,
  agentLastProgressAt: null,
  agentStartedAt: null,
  agentSteps: [],
  agentConfirm: null,
  agentTanya: null,
  agentTodos: [],
  agentResume: null,
  commandSuggestion: null,
  promptHistory: [],
  promptHistoryIdx: -1,
  /*
   * Reasoning is ON by default.
   *
   * `null` here meant every fresh install ran without reasoning and the reader
   * had no way to know it existed: the provider was never asked, so no thinking
   * block could arrive and nothing in the transcript hinted at what was missing.
   * `medium` is a middle budget — enough to be visibly useful without asking the
   * provider to spend heavily on every turn — and turning it off stays a
   * deliberate choice in the effort menu.
   */
  reasoningEffort: bootEffort(),
  reasoningText: null,

  init: async () => {

    // The agent status must never get stuck from a previous session. If the
    // app was closed while the agent was running, or a provider hung, this value
    // can be left true and block both sending chat and subagents.
    agentWatchdogDisarm();
    agentHardLimitDisarm();
    agentBatal = false;
    agentStopReason = null;
    agentStepResolve = null;
    agentConfirmResolve = null;
    set({ pending: null, agentBusy: false, agentConfirm: null, agentPhase: 'idle', agentCurrentTool: null, agentStepIndex: 0, agentStepLimit: MAX_AGENT_STEPS, agentLastProgressAt: null, agentStartedAt: null });

    const st = useStore.getState().settings.models;
    const dikenal = (id: string) => PROVIDER_BY_ID.has(id);

    let adaKey: string[] = [];
    try {
      const pub = await cmd.getPublicModels();
      set({ keys: pub });
      adaKey = pub.filter((k) => k.hasKey).map((k) => k.provider);
    } catch {
      /* non-fatal: falls back to a choice without key info */
    }

    const aktif = st.activeProvider;
    /*
     * `'auto'` resolves to a REAL provider here, so nothing downstream has to
     * know the sentinel exists. `providerEfektif` honours an explicit choice
     * that has a key and otherwise takes the first provider in catalogue order
     * that does - deterministic, so the same keys pick the same provider on
     * every launch.
     */
    let prov = providerEfektif(aktif, (id) => adaKey.includes(id));
    if (!dikenal(prov)) prov = 'custom';

    /*
     * Resolve the model WITHOUT ever landing on a catalogue placeholder.
     *
     * `custom`/`local` ship a "type a model name" row (`custom-model`,
     * `local-default`) that is a prompt, not a model the provider serves. The
     * old `?.[0]?.id ?? 'custom-model'` fallback handed that id to the router,
     * so a fresh install sent `custom-model` and got a 404 that read as a
     * broken provider. Prefer the stored model; else the first real catalogue
     * model; else '' (the provider is free-text with nothing chosen yet).
     */
    const tersimpan = st.providers[prov]?.model ?? '';
    const kandidat =
      st.providers[prov]?.model ||
      PROVIDER_BY_ID.get(prov)?.models?.find((m) => !isPlaceholderModel(m.id))?.id ||
      '';
    const model = isPlaceholderModel(tersimpan) ? kandidat : tersimpan || kandidat;
    set({
      provider: prov,
      model,
      attachActive: useStore.getState().settings.agents.attachActiveFile,
    });
    if (get().sessions.length === 0) get().newChat();
    get().sinkronProvider();
  },

  loadKeys: async () => {
    try {
      set({ keys: await cmd.getPublicModels() });
    } catch {
      /* non-fatal: the status badge becomes "no key yet" */
    }
  },

  hasKey: (provider) => {
    const p = provider ?? get().provider;
    return get().keys.some((k) => k.provider === p && k.hasKey);
  },

  sinkronProvider: () => {
    /*
     * HydraFusion is a selection, not a provider default.
     *
     * `sinkronProvider` exists to pull the panel onto the provider+model saved
     * in settings. But the HydraFusion sentinel is deliberately NEVER written to
     * settings (it would 404 every request), so the saved model is always a real
     * one — and this function would immediately undo the reader's pick. That is
     * exactly what made selecting HydraFusion silently do nothing: the model
     * snapped back to the previous real model within one settings write.
     */
    if (pilihHydra(get().model)) return;
    const models = useStore.getState().settings.models;
    /*
     * `'auto'` is not a provider, so there is nothing to normalise TOWARDS: the
     * live provider was already resolved at init and by the picker. Returning
     * early is what keeps `auto` from snapping the panel onto a provider the
     * reader never chose - the same failure HydraFusion had.
     */
    const target = models?.activeProvider;
    if (!target || target === PROVIDER_AUTO) return;

    // An unknown provider is left as-is: normalising now
    // could actually move the panel to the wrong provider.
    if (!PROVIDER_BY_ID.has(target)) return;

    const dariSettings = models.providers?.[target]?.model;
    const providerSama = target === get().provider;
    const modelSama = !dariSettings || dariSettings === get().model;

    // If the provider AND model are already the same, there is nothing to change.
    if (providerSama && modelSama) return;

    /*
     * Never sync the panel onto a placeholder. A stored `custom-model` (from an
     * earlier build, or written by the Settings "Active model" select, which
     * sends only the provider) must not become the live model again. Order:
     * the stored model when it is real; else the provider's first real
     * catalogue model; else KEEP what is already selected rather than forcing a
     * placeholder. The `modelSama` guard above stays as-is so this cannot spin.
     */
    const tersimpan = dariSettings && !isPlaceholderModel(dariSettings) ? dariSettings : '';
    const kandidat =
      tersimpan ||
      PROVIDER_BY_ID.get(target)?.models?.find((m) => !isPlaceholderModel(m.id))?.id ||
      '';
    const model = kandidat || get().model;
    if (!model) return;

    set({ provider: target, model });
    const sid = get().activeId;
    if (sid) {
      set((s) => ({
        sessions: s.sessions.map((x) => (x.id === sid ? { ...x, provider: target, model } : x)),
      }));
    }
  },

  setModel: async (modelId, providerId) => {
    /*
     * Persistence choke point. `custom-model` / `local-default` are catalogue
     * rows that mean "type a name", not models the router serves; letting a
     * click on one through used to overwrite the user's real choice in
     * settings.json and then 404 on every send. Refuse it and say so instead.
     */
    if (isPlaceholderModel(modelId)) {
      set({
        toast: 'Pilih model dulu — nama itu cuma placeholder, bukan model yang dikenali',
        modelMenuOpen: false,
      });
      return;
    }

    const def = findModel(modelId, providerId ?? get().provider);
    /*
     * The HydraFusion sentinel is a ROUTING choice, never a model name.
     *
     * Storing it in `settings.models.providers[...].model` would make every
     * request name a model no provider serves (404), and it would survive a
     * restart as the "last model". Only the in-memory selection carries it; the
     * persisted model stays whatever real model the reader had, which is also
     * the fallback HydraFusion needs when a plan cannot run.
     */
    const hydra = pilihHydra(modelId);
    set({ model: hydra ? HYDRA_MODEL_ID : def.id, provider: def.provider, modelMenuOpen: false });

    set((s) => ({
      sessions: s.sessions.map((x) =>
        x.id === s.activeId ? { ...x, model: hydra ? HYDRA_MODEL_ID : def.id, provider: def.provider } : x,
      ),
    }));
    persist(get());

    const models = useStore.getState().settings.models;
    const providers = models?.providers ?? {};
    await useStore.getState().applySettings({
      models: {
        activeProvider: def.provider,
        providers: hydra
          ? providers
          : {
              ...providers,
              [def.provider]: { ...(providers[def.provider] ?? {}), model: def.id },
            },
      },
    });
  },

  setModelMenuOpen: (v) => set({ modelMenuOpen: v }),
  setDraft: (v, id = '') => set((s) => ({ drafts: { ...s.drafts, [id]: v } })),
  draftOf: (id) => get().drafts[id] ?? '',

  /*
   * Every queue mutator takes the id of the composer whose queue it edits.
   *
   * They wrote the FLAT `antrian` — the primary surface's mirror — while the
   * panel renders `antrians[composerId]`. So pressing "run now", "remove" or
   * "clear" on a row in the EDITOR tab edited the RIGHT COLUMN's queue: the row
   * the reader clicked stayed put, and a row in the other panel disappeared.
   * Reported as the queue looking linked between the two surfaces.
   *
   * The flat `antrian` is written on the primary path only (id === '') so the
   * ~fifteen call sites that read it without an id — the drain, the store's own
   * bookkeeping — keep working unchanged.
   */
  buangAntrian: (idx, composerId = '') =>
    set((s) => {
      const daftar = s.antrians[composerId] ?? [];
      const sisa = daftar.filter((a, i) => !cocokAntrian(a, i, idx));
      return {
        antrians: { ...s.antrians, [composerId]: sisa },
        ...(composerId === '' ? { antrian: sisa } : {}),
      };
    }),
  naikkanAntrian: (idx, composerId = '') =>
    set((s) => {
      const daftar = s.antrians[composerId] ?? [];
      const pos = posisiAntrian(daftar, idx);
      if (pos <= 0 || pos >= daftar.length) return {};
      const arr = daftar.slice();
      [arr[pos - 1], arr[pos]] = [arr[pos], arr[pos - 1]];
      return {
        antrians: { ...s.antrians, [composerId]: arr },
        ...(composerId === '' ? { antrian: arr } : {}),
      };
    }),
  turunkanAntrian: (idx, composerId = '') =>
    set((s) => {
      const daftar = s.antrians[composerId] ?? [];
      const pos = posisiAntrian(daftar, idx);
      if (pos < 0 || pos >= daftar.length - 1) return {};
      const arr = daftar.slice();
      [arr[pos], arr[pos + 1]] = [arr[pos + 1], arr[pos]];
      return {
        antrians: { ...s.antrians, [composerId]: arr },
        ...(composerId === '' ? { antrian: arr } : {}),
      };
    }),
  ubahAntrian: (idx, teks, composerId = '') =>
    set((s) => {
      const daftar = s.antrians[composerId] ?? [];
      const pos = posisiAntrian(daftar, idx);
      const sekarang = daftar[pos];
      if (!sekarang) return {};
      const bersih = (teks ?? '').trim();
      if (!bersih) return {};
      const arr = daftar.map((a, i) => (i === pos ? { ...a, teks: bersih } : a));
      return {
        antrians: { ...s.antrians, [composerId]: arr },
        ...(composerId === '' ? { antrian: arr } : {}),
      };
    }),
  kosongkanAntrian: (composerId = '') =>
    set((s) => ({
      antrians: { ...s.antrians, [composerId]: [] },
      ...(composerId === '' ? { antrian: [] } : {}),
    })),

  /*
   * The loop timer lives in `loopJadwal.ts`'s module map, not here, because it
   * has to keep firing while the panel is closed. These two actions are the
   * bridge: `setLoop` arms or disarms the timer and mirrors the state into the
   * store for the banner to read.
   */
  setLoop: (sessionId, loop) => {
    if (!loop) {
      stopLoop(sessionId);
      set((s) => {
        const next = { ...s.loops };
        delete next[sessionId];
        return { loops: next };
      });
      return;
    }
    set((s) => ({ loops: { ...s.loops, [sessionId]: loop } }));
  },

  hentikanLoop: (sessionId) => {
    stopLoop(sessionId);
    set((s) => {
      const next = { ...s.loops };
      delete next[sessionId];
      return { loops: next, toast: tx('Loop stopped') };
    });
  },

  setGoal: (sessionId, goal) => {
    set((s) => {
      const next = { ...s.goals };
      if (goal) next[sessionId] = goal;
      else delete next[sessionId];
      return { goals: next };
    });
  },
  lanjutkanAgent: async () => {
    const cp = get().agentResume;
    if (!cp || get().agentBusy || get().pending) return false;
    await get().send(cp.teks, cp.images);
    return true;
  },
  kirimAntrian: async (idx, composerId = '') => {
    const pos = posisiAntrian(get().antrians[composerId] ?? [], idx);
    const item = (get().antrians[composerId] ?? [])[pos];
    if (!item) return false;

    /*
     * Whether the message went out is taken from `send`'s RETURN VALUE, not
     * from whether a toast happens to be on screen.
     *
     * The old check was `get().hasKey() && !get().toast`, and it read a side
     * effect as if it were the result. `toast` carries all sorts of unrelated
     * things - 'Added to the queue', 'Message trimmed from N to M characters' -
     * and any of them being live at this moment made an ACCEPTED send look
     * rejected. The item then stayed in the queue and was sent AGAIN by the next
     * drain, so the same message went out twice and its answer arrived out of
     * order or interleaved: the "AI stutters" report.
     *
     * `send` already answers the real question and always did - it returns false
     * only when nothing could be sent (no key, empty text) and true when the
     * request went out or was accepted into the queue. Reading it directly is
     * what makes a queued message leave the queue exactly once.
     */
    /*
     * Sent as THIS surface, so the message lands in the conversation that
     * queued it and its reply does not surface in the other panel.
     */
    const terkirim = await get().send(item.teks, item.images, composerId);
    if (terkirim) {
      /* Removed by IDENTITY, so two identical texts in the queue do not both
         disappear when only one of them was sent. */
      set((s) => {
        const sisa = (s.antrians[composerId] ?? []).filter((entry) => entry !== item);
        return {
          antrians: { ...s.antrians, [composerId]: sisa },
          ...(composerId === '' ? { antrian: sisa } : {}),
        };
      });
    }
    return terkirim;
  },

  /**
   * Send immediately, cutting short whatever is running.
   *
   * The queue answers "run this after the current answer"; this answers "I
   * do not want that answer, start mine now". Two things have to be true
   * before the new message goes out, and neither is instant:
   *
   *   1. `cancel()` sets a flag in Rust, and Rust only looks at that flag
   *      between packets from the provider. A hung provider leaves the old
   *      thread alive until its read timeout. That thread is harmless — it
   *      holds its own request id — but the UI must not start a second send
   *      while `pending`/`agentBusy` still describe the old one, or the busy
   *      guard in `send()` would simply queue the new message instead.
   *
   *   2. In agent mode `agentBusy` is cleared by the loop's own exit path,
   *      not by `cancel()`, so it has to be waited for.
   *
   * Hence the poll below: cancel, then wait for the flags to go quiet, with a
   * ceiling so a pathological provider cannot wedge the button forever. If the
   * ceiling is hit the run is FORCE-RELEASED and the message is still sent -
   * queuing it silently is what turned a stuck run into a composer that looked
   * dead, because the reader got no request, no error and no reply.
   */
  kirimSekarang: async (teks, images, composerId = '') => {
    /* This surface owns the run it is about to start. */
    COMPOSER_AKTIF = composerId;
    const teksBersih = (teks ?? '').trim();
    // "lanjut" with a pending checkpoint continues the interrupted run from
    // where it stopped instead of starting a new one on top of the failure.
    if (/^\s*lanjut(kan)?\s*[.!?…]*\s*$/i.test(teksBersih ?? '') && get().agentResume && !get().agentBusy && !get().pending) {
      await get().lanjutkanAgent();
      return;
    }
    await tungguGambar();
    const imgs = images ?? get().draftImages;
    if (!teksBersih && imgs.length === 0) return;    if (!get().pending && !get().agentBusy) {
      await get().send(teksBersih, imgs, composerId);
      return;
    }
    await get().cancel();
    const batas = Date.now() + 8000;
    while ((get().pending || get().agentBusy) && Date.now() < batas) {
      await new Promise((r) => setTimeout(r, 50));
    }
    if (get().pending || get().agentBusy) {
      /*
       * The old run refused to unwind in time.
       *
       * Sending is refused while the previous run is live, so that two answers
       * never write the same session. That rule stands - but a run that ignores
       * `cancel()` must not be able to block the composer FOREVER, which is
       * what it did: `agentBusy` stayed true, every later message took this
       * branch, and the reader saw a send that produced no request, no error
       * and no reply ("it just thinks forever"). The Rust side never even
       * received the call, so nothing upstream could recover it either.
       *
       * After `cancel()` and an 8s grace period the run has demonstrably failed
       * to stop, and by then keeping the UI locked protects nothing: the run is
       * already broken. So force the flags down and send, rather than queue
       * silently. Whatever the stalled attempt still holds is discarded by
       * `retiredAgentAttempts`, which is exactly what it exists for.
       */
      set((s) => ({
        pending: null,
        agentBusy: false,
        agentBusys: { ...s.agentBusys, '': false },
        agentPhase: 'idle',
        agentCurrentTool: null,
        agentStepIndex: 0,
        agentStartedAt: null,
        antrian: [],
        toast: tf('The previous run did not stop; it was released so this message can be sent.', {}),
      }));
    }
    await get().send(teksBersih, imgs);
  },
    setAttachActive: (v) => set({ attachActive: v }),
    addDraftImage: (dataUrl) => {
      const now = get().draftImages;
      if (now.length >= MAX_IMAGES) {
        set({ toast: tf('Too many images - the limit is {n} per message', { n: MAX_IMAGES }) });
        return false;
      }
      /*
       * Shrink BEFORE the size check.
       *
       * The 3.5 MB ceiling below guards the file, but a file that passes it can
       * still be far too large for the REQUEST: a 638 KB screenshot becomes
       * 850.834 characters of base64, and the request budget is 80.000 for
       * everything. The trimmer then had to release the image to fit, so the
       * model answered about a picture it never received ("request-nya terpotong
       * batas gateway"). Rejecting big screenshots would be the wrong fix - they
       * are exactly what readers paste. Scaling them down is the right one.
       *
       * The optimistic path (small images) is synchronous: no await, no flicker
       * for the common case. Only oversized images take the async re-encode, and
       * the draft is updated once when it finishes.
       */
      const masukkan = (url: string) => {
        set((s) => ({ draftImages: [...s.draftImages, url] }));
      };
      /*
       * Track the in-flight shrink so `send()` can WAIT for it.
       *
       * Without this, a reader who pastes a screenshot and hits Enter inside the
       * ~200 ms the canvas needs sends a message with NO image — the draft is
       * still empty, `send()` reads it, and the model answers about nothing. A
       * race that silently loses the attachment is worse than the size bug it
       * replaces, so the promise is registered and awaited at the send door.
       */
      const kecil = kecilkanGambar(dataUrl).then((hasil) => {
        const url = hasil.dataUrl;
        let bytes = 0;
        const match = /^data:[^;,]+;base64,([A-Za-z0-9+/=\s]+)$/.exec(url);
        if (match) {
          const encoded = match[1].replace(/\s/g, '');
          const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
          bytes = Math.max(0, Math.floor(encoded.length * 3 / 4) - padding);
        } else if (url.startsWith('data:')) {
          bytes = new TextEncoder().encode(url).byteLength;
        }
        if (bytes > IMAGE_MAX_BYTES) {
          set({ toast: tf('Image is larger than 3.5 MB and was not attached', {}) });
          return;
        }
        masukkan(url);
        if (hasil.dikecilkan) {
          /*
           * Say it, quietly. A reader who pasted a 2 MB screenshot and sees a
           * smaller attachment deserves to know the app resized it, otherwise
           * "the model missed the small text" looks like a model failure.
           */
          set({
            toast: tf('Image resized for sending ({from} KB -> {to} KB)', {
              from: String(Math.round(hasil.awalChar / 1024)),
              to: String(Math.round(hasil.akhirChar / 1024)),
            }),
          });
        }
      });
      gambarMenunggu.add(kecil);
      void kecil.finally(() => gambarMenunggu.delete(kecil));
      return true;
    },
    removeDraftImage: (index) =>
      set((s) => ({ draftImages: s.draftImages.filter((_, i) => i !== index) })),
    clearDraftImages: () => set({ draftImages: [] }),
    setToast: (v) => set({ toast: v }),
  setConfirmCmd: (v) => set({ confirmCmd: v }),
  /*
   * The caller's choice is HONOURED.
   *
   * This used to ignore its argument and always write `'agent'`, on the
   * reasoning that Chat had been retired and there was nothing left to switch
   * between. That left the parameter in the signature while making it a lie:
   * any caller - a menu row, a Settings control, a restored session - asking
   * for 'chat' got 'agent' back and no way to tell. The composer's picker now
   * offers both, so the choice has to survive the round trip.
   */
  setAgentMode: (m) => {
    const mode: 'chat' | 'agent' = m === 'chat' ? 'chat' : 'agent';
    set({ agentMode: mode });
    try {
      localStorage.setItem('zephyr.ai.mode', mode);
    } catch {
      /* diabaikan */
    }
  },
  setTipsVisible: (v) => {
    set({ tipsVisible: v });
    try {
      localStorage.setItem('zephyr.ai.tip', v ? '1' : '0');
    } catch {
      /* diabaikan: pilihan hanya berlaku sesi ini */
    }
  },
  setShowThinking: (v) => {
    set({ showThinking: v });
    try { localStorage.setItem('zephyr.ai.tampil.think', v ? '1' : '0'); } catch { /* sesi ini saja */ }
  },
  setShowStamps: (v) => {
    set({ showStamps: v });
    try { localStorage.setItem('zephyr.ai.tampil.stamp', v ? '1' : '0'); } catch { /* sesi ini saja */ }
  },
  setShowDividers: (v) => {
    set({ showDividers: v });
    try { localStorage.setItem('zephyr.ai.tampil.divider', v ? '1' : '0'); } catch { /* sesi ini saja */ }
  },
  setShowThinkingBar: (v) => {
    set({ showThinkingBar: v });
    try { localStorage.setItem('zephyr.ai.tampil.thinkbar', v ? '1' : '0'); } catch { /* sesi ini saja */ }
  },
  /*
   * Pick the run mode and apply the approval level it implies.
   *
   * The three modes map to real behaviour: Autopilot runs everything (approval
   * 'auto'); Interactive and Plan both pause for risky actions (approval
   * 'work'), and Plan additionally injects a "present a plan, change nothing"
   * instruction read by `sendAgent`.
   *
   * IT NO LONGER FORCES `agentMode`. It used to, on the reasoning that these
   * modes only mean anything to an agent - so choosing one was also choosing to
   * run as an agent. That was defensible while Chat did not exist, and became a
   * bug the moment it came back: the run mode is persisted and restored on
   * boot, so every launch silently switched the reader out of Chat. A control
   * that resets another control is not a default, it is a trap.
   */
  setRunMode: (m) => {
    set((s) => ({
      runMode: m,
      approvalMode: m === 'autopilot' ? 'auto' : 'work',
      sessions: s.sessions.map((x) =>
        x.id === s.activeId ? { ...x, approval: m === 'autopilot' ? 'auto' : 'work' } : x,
      ),
    }));
    try {
      localStorage.setItem('zephyr.ai.runMode', m);
    } catch {
      /* diabaikan */
    }
    persist(get());
  },
  setApprovalMode: (m) => {

    set((s) => ({
      approvalMode: m,
      sessions: s.sessions.map((x) => (x.id === s.activeId ? { ...x, approval: m } : x)),
    }));
    persist(get());
  },
  setAgentTodos: (list) => {

    const sebelum = get().agentTodos;
    const bersih: AgentTodo[] = [];
    dipangkasTodo = 0;
    const masukan = Array.isArray(list) ? list : [];
    let iMasuk = -1;
    for (const raw of masukan) {
      iMasuk++;
      if (bersih.length >= MAX_TODOS) {
        /* Sisa entri dibuang, tapi jumlahnya DICATAT supaya bisa dilaporkan -
           lihat catatan di MAX_TODOS. Pemotongan tanpa laporan adalah gagal
           senyap, bukan pengaman. */
        dipangkasTodo = masukan.length - iMasuk;
        break;
      }
      const o = raw as { id?: unknown; content?: unknown; status?: unknown };

      /*
       * Entri dikenali lewat `id` lebih dulu, baru lewat teksnya.
       *
       * Skema tool mengajarkan bahwa `id` adalah identitas tetap ("supaya tanda
       * centangnya tidak berpindah baris"), jadi model yang memakainya akan
       * mengirim `{id: '3', status: 'completed'}` TANPA mengulang teksnya -
       * mengulang teks memang tidak perlu kalau idnya sudah menunjuk ke sana.
       *
       * Tapi kode ini dulu mensyaratkan teks di setiap entri, dan mencocokkan
       * lewat `content`. Akibatnya panggilan yang paling wajar justru gagal
       * SELURUHNYA ("tidak ada tugas yang diterima karena teksnya kosong"),
       * dan to-do list tidak pernah bisa ditandai selesai. Yang salah bukan
       * tafsir model: yang salah adalah tool yang mengajarkan id lalu
       * mengabaikannya.
       */
      const idMasuk = o?.id == null ? '' : String(o.id).trim();
      /*
       * Cocokkan lewat id, LALU lewat nomor urut.
       *
       * Model tidak pernah melihat id yang sebenarnya: id yang disimpan
       * dibangkitkan di sini (`td-...`), sedangkan model mengirim `"1"`, `"2"`
       * sesuai urutan yang ia susun sendiri di argumennya. Mencari
       * `x.id === '2'` karena itu TIDAK PERNAH ketemu, dan setiap putaran
       * membuat entri baru dengan id baru - pemanggilan kedua gagal seluruhnya
       * walau maksudnya jelas.
       *
       * Nomor urut 1-basis adalah identitas yang benar-benar dimiliki model,
       * jadi itu juga yang harus dikenali. Dua tugas yang kebetulan berbagi
       * nomor tetap dipisahkan oleh teksnya di bawah.
       */
      const nomorMasuk = /^\d+$/.test(idMasuk) ? Number(idMasuk) - 1 : -1;
      /*
       * Satu pencarian, tiga jalan: lewat teks (paling kuat), lewat id yang
       * dikenali, lalu lewat nomor urut.
       *
       * Teks dicari lebih dulu dengan sengaja: model yang MENGUBAH isi sebuah
       * tugas mengirim teks barunya, dan mencocokkannya dengan id lama bisa
       * salah kalau nomornya sudah bergeser karena tugas lain selesai.
       * Nomor urut menjadi jaring terakhir - itu identitas yang benar-benar
       * dimiliki model, karena ia menyusun daftarnya sendiri.
       */
      const seposisi =
        (idMasuk ? sebelum.find((x) => x.id === idMasuk) : undefined) ??
        (nomorMasuk >= 0 && nomorMasuk < sebelum.length ? sebelum[nomorMasuk] : undefined);
      const content = String(o?.content ?? seposisi?.content ?? '').trim();
      if (!content) continue;
      const dariId = seposisi;

      /* Tugas yang cocok dengan daftar lama: pakai ulang identitasnya. */
      const asal = dariId ?? seposisi;
      const s = String(o?.status ?? 'pending').trim().toLowerCase();
      /*
       * Terima semua sinonim, jangan paksa ke 'pending'.
       *
       * Dulu hanya 'done' dan 'in_progress' yang lolos, jadi model yang mengirim
       * 'completed' (istilah standar di banyak prompt) jatuh ke 'pending' - todo
       * tidak pernah centang dan agen mengulang pekerjaan yang sama tanpa henti.
       */
      let status: AgentTodo['status'] = 'pending';
      if (s === 'done' || s === 'completed' || s === 'complete' || s === 'finished' || s === 'selesai') {
        status = 'done';
      } else if (s === 'in_progress' || s === 'in-progress' || s === 'active' || s === 'running' || s === 'working') {
        status = 'in_progress';
      }

      /* Simpan id-nya. Lihat catatan di bawah - membuangnya merusak pemasangan
         baris dan identitas untuk React. */
      /*
       * `prev` dicari lewat teks - dan lewat `asal` kalau teksnya tidak ketemu.
       *
       * Untuk update yang membawa id/nomor saja, teksnya disalin dari tugas
       * lama; pencarian lewat teks tetap perlu supaya model yang MENGUBAH teks
       * sebuah tugas (mis. "langkah tiga" menjadi "langkah tiga, diperbaiki")
       * tidak kehilangan durasi dan idnya.
       */
      const prev = sebelum.find((x) => x.content === content) ?? asal;
      let startedAt = prev?.startedAt;
      let endedAt = prev?.endedAt;

      if (status === 'in_progress' && !startedAt) {
        startedAt = Date.now();
      } else if (status === 'done') {
        if (!startedAt) startedAt = Date.now();
        if (!endedAt) endedAt = Date.now();
      } else if (status === 'pending') {
        startedAt = undefined;
        endedAt = undefined;
      }

      /*
       * `id` IKUT DISIMPAN.
       *
       * Dulu baris ini berbunyi `bersih.push({ content, status, startedAt,
       * endedAt })` - id-nya dibuang. Akibatnya tidak ada identitas stabil per
       * baris, dan React jatuh ke kunci cadangan (`renderKey` di TodoPanel)
       * yang diturunkan dari ISI tugas.
       *
       * Itu merusak dua hal sekaligus. Pertama, saat model menyunting isi
       * sebuah tugas ("langkah tiga" menjadi "langkah tiga, diperbaiki"),
       * kuncinya berubah dan React melepas-pasang barisnya - animasi centang
       * dan durasi yang sedang berjalan ikut tereset. Kedua, dua tugas dengan
       * isi yang sama persis menghasilkan kunci kembar, dan React salah
       * memasangkan isi ke elemen.
       *
       * Id dipakai ulang dari entri lama kalau isinya sama, supaya tugas yang
       * sama tetap punya identitas yang sama sepanjang hidupnya.
       */
      const id =
        prev?.id ??
        `td-${Date.now().toString(36)}-${bersih.length}-${Math.random().toString(36).slice(2, 7)}`;

      bersih.push({ id, content, status, startedAt, endedAt });
    }

    /*
     * Tugas yang TIDAK disebut model tetap dipertahankan.
     *
     * Ini yang membuat "todo-nya tidak ikut berubah saat bekerja". Daftar yang
     * dikirim model sering hanya menyebut tugas yang SEDANG berubah - model
     * membalas dua baris, bukan kelima-limanya. Karena hasilnya dulu dipakai
     * apa adanya sebagai daftar baru, setiap update MENGHAPUS tugas yang tidak
     * ikut disebut: 5 tugas -> 3 -> 1 -> kosong, tepat saat pekerjaannya paling
     * banyak. Yang tidak disebut bukan berarti dibatalkan; itu hanya berarti
     * tidak berubah, dan tugas yang tidak berubah harus tetap tampil.
     *
     * Penghapusan tetap mungkin, tapi harus DIMINTA: satu-satunya cara sah
     * untuk membuang tugas adalah mengirimnya dengan status yang tidak
     * dikenali... dan itu pun tidak, karena entri tanpa teks dan tanpa nomor
     * yang cocok memang sudah dilewati di atas. Jadi daftar ini hanya bisa
     * bertambah dan berubah, tidak pernah menyusut diam-diam.
     */
    const sudahAda = new Set(bersih.map((t) => t.id));
    for (const lama of sebelum) {
      if (!sudahAda.has(lama.id)) bersih.push(lama);
    }

    set({ agentTodos: bersih });
    /*
     * A todo reaching 'done' is real progress, so the anti-loop watchdog
     * forgets what it has seen: completing a task is the one signal that the
     * repetition is producing something, and without it a plan that
     * legitimately revisits a step (fix, re-check, fix again) would be stopped
     * as a treadmill.
     *
     * Membership is counted per content, not by position: a todo written as
     * "step three" and later edited to "step three, refactored" is still the
     * same plan item being finished, and a positional diff would miss it.
     */
    const jumlahSelesai = (list2: AgentTodo[]) =>
      list2.reduce((peta, t) => {
        if (t.status === 'done') peta.set(t.content, (peta.get(t.content) ?? 0) + 1);
        return peta;
      }, new Map<string, number>());
    const lSebelum = jumlahSelesai(sebelum);
    const lSesudah = jumlahSelesai(bersih);
    const adaBaruSelesai = [...lSesudah].some(([content, n]) => (lSebelum.get(content) ?? 0) < n);
    /*
     * Menandai todo `done` adalah kemajuan - TAPI bukan alasan membuang SELURUH
     * penghitung aksi-berulang.
     *
     * Versi sebelumnya memanggil `agenAksiBerulang.clear()`, dan itu terbukti
     * mematikan penjaga: pada run nyata `todo_write` dipanggil 19 kali, dan tiap
     * satu item yang selesai mengosongkan hitungan untuk SEMUA sidik jari -
     * termasuk bacaan identik yang sedang berputar. `read_file` atas berkas yang
     * sama diulang 33 kali tanpa pernah menyentuh ambang 6, karena hitungannya
     * ke-reset terus oleh todo yang tak berhubungan. Loop bacaan seperti itu
     * lalu hanya berhenti di `batas langkah`, bukan di penjaga.
     *
     * Yang benar: KURANGI hitungan, jangan buang. Sebuah kemajuan tidak
     * membatalkan pengulangan yang sudah terjadi; ia hanya memberi sedikit
     * kelonggaran. Dengan pengurangan 1 per todo selesai, verifikasi sah di
     * sela kerja tetap lolos (tulis -> baca -> tulis), sementara loop murni
     * tanpa tulisan tetap merangkak ke ambang dan berhenti di sana.
     */
    if (adaBaruSelesai) {
      for (const [sidik, n] of agenAksiBerulang) {
        if (n <= 1) agenAksiBerulang.delete(sidik);
        else agenAksiBerulang.set(sidik, n - 1);
      }
    }
    return bersih.length;
  },

  kosongkanTodos: () => {
    set({ agentTodos: [] });
    persist(get());
  },
  buangTodosSelesai: () => {
    set((s) => ({ agentTodos: s.agentTodos.filter((t) => t.status !== 'done') }));
    persist(get());
  },

  setReasoningEffort: (e) => {
    /* Remembered, so the choice survives a restart - including "off". */
    try {
      localStorage.setItem(EFFORT_KEY, e ?? 'off');
    } catch {
      /* storage unavailable: the setting still applies for this session */
    }
    set({ reasoningEffort: e });
  },
  setAgentProgress: (progress) => set((s) => {
    const mulai = progress.agentStartedAt !== undefined
      ? progress.agentStartedAt
      // A step index rolling back to zero marks a fresh run, not a rewind:
      // the old start time would make the elapsed clock lie.
      : (progress.agentStepIndex === 0 && s.agentStartedAt == null ? Date.now() : s.agentStartedAt);
    return {
      ...progress,
      agentStartedAt: mulai,
      agentLastProgressAt: progress.agentLastProgressAt !== undefined
        ? progress.agentLastProgressAt
        : progress.agentPhase === 'idle' ? null : Date.now(),
    };
  }),
  agentPutuskan: (setujui) => {
    if (agentConfirmResolve) {
      const r = agentConfirmResolve;
      agentConfirmResolve = null;
      r(setujui);
    }
    set({ agentConfirm: null });
  },

  /*
   * ── KONFIRMASI TIDAK BOLEH MENGGANTUNG TANPA UI ───────────────────────────
   *
   * Temuan Fase 5: agen diam 293 detik di `waiting-confirmation`. Penyebabnya
   * `send()` menunggu Promise yang HANYA diselesaikan tombol Allow di AiPanel.
   * Kalau panel chat tidak ter-mount - run dari command palette, dari
   * keybinding, dari jendela AI terpisah yang belum dibuka, atau headless -
   * tidak ada tombol, Promise tidak pernah selesai, dan agen menunggu sampai
   * watchdog 15 menit membunuhnya.
   *
   * Dua perbaikan:
   *
   *  1. PANEL DIBUKA OTOMATIS saat agen butuh izin. Permintaan izin adalah
   *     momen yang butuh mata manusia; menyembunyikannya di panel tertutup
   *     membuat agen tampak menggantung.
   *
   *  2. BATAS WAKTU pada Promise-nya. Kalau izin tidak dijawab dalam
   *     `IZIN_TIMEOUT_MS`, permintaan DITOLAK dan langkah dilewati - agen
   *     melanjutkan pekerjaannya dengan tool lain, bukan mati. Menolak dengan
   *     alasan yang terlihat jauh lebih baik daripada menggantung tanpa kabar.
   */
  agentMintaIzin: (tool: string, argsText: string, opsi: { destruktif?: boolean; tulis?: boolean }) =>
    new Promise<boolean>((resolve) => {
      /*
       * Buka KOLOM SAMPING saja, bukan tab di editor.
       *
       * Versi pertama perbaikan ini memanggil `bukaViewAi('ai-chat')`, yang
       * membuka tab Chat di AREA EDITOR - jadi meminta izin menutupi berkas
       * yang sedang dibaca. Permintaan izin tidak boleh merebut tempat kerja;
       * yang dibutuhkan hanya panelnya terlihat supaya tombolnya bisa ditekan.
       *
       * `setAiKolomVisible(true)` menampilkan kolom kanan (kalau layout-nya
       * 'right'), dan itu tidak menyentuh tab editor sama sekali.
       */
      try {
        void import('./store').then((m) => {
          const s = m.useStore.getState();
          s.setAiKolomVisible?.(true);
          /*
           * Kalau posisi panel AI bukan kolom kanan (mis. 'window'), kolom itu
           * tidak akan tampil. Dalam kasus itu panel tetap diset di store dan
           * dialognya muncul begitu panel dibuka - bukan dengan merebut editor.
           */
        });
      } catch {
        /* store belum siap: dialog tetap diset, hanya tidak terlihat */
      }

      set({
        agentConfirm: {
          tool,
          argsText,
          isDestructive: !!opsi.destruktif,
          isWrite: !!opsi.tulis,
        },
      });

      const selesai = (nilai: boolean) => {
        if (agentConfirmResolve !== resolve) return;
        agentConfirmResolve = null;
        clearTimeout(pewaktu);
        set({ agentConfirm: null });
        resolve(nilai);
      };

      agentConfirmResolve = resolve;

      const pewaktu = setTimeout(() => {
        if (agentConfirmResolve !== resolve) return;
        /*
         * Ditolak karena waktu, dan itu DICATAT: agen harus tahu mengapa
         * langkahnya tidak jalan, bukan menerima penolakan tanpa sebab.
         */
        selesai(false);
        set({
          toast: `Izin untuk ${tool} tidak dijawab dalam ${Math.round(izinTimeoutMs / 1000)} detik - langkah dilewati.`,
        });
      }, izinTimeoutMs);
    }),

  agentAjukanTanya: (pertanyaan, pilihan) =>
    new Promise<string | null>((selesai) => {
      /*
       * Hanya satu pertanyaan yang boleh menunggu pada satu waktu. Kalau ada
       * yang lain, yang lama dijawab batal dulu - kalau tidak, janjinya
       * menggantung selamanya dan langkah agen tidak pernah lanjut.
       */
      if (agentTanyaResolve) {
        const lama = agentTanyaResolve;
        agentTanyaResolve = null;
        lama(null);
      }

      agentTanyaResolve = selesai;
      set({ agentTanya: { pertanyaan, pilihan: pilihan ?? [] } });
      /*
       * The run is now parked on a decision, and the reader may be in another
       * window. This is the "needs you" moment, so it gets its own tone — see
       * `bunyiMenunggu` for why it is not the completion sound.
       */
      void import('./notifikasiAi').then((m) => m.bunyiMenunggu()).catch(() => {});
    }),

  jawabTanya: (jawaban) => {
    const r = agentTanyaResolve;
    agentTanyaResolve = null;
    set({ agentTanya: null });
    /* Dipanggil SETELAH state dibersihkan: kalau pemanggilnya langsung memicu
       render ulang, kartu pertanyaannya sudah tidak ada lagi saat komponennya
       membaca state. */
    if (r) r(jawaban);
  },

  setCommandSuggestion: (s) => {
    if (!s) {
      set({ commandSuggestion: null });
      return;
    }
    const command = String(s.command ?? '').trim();
    if (!command) {
      set({ commandSuggestion: null });
      return;
    }
    const alasan = String(s.alasan ?? '').trim();
    set({ commandSuggestion: { command, alasan: alasan || undefined, at: Date.now() } });
  },

  historyUp: () => {
    const s = get();
    if (!s.promptHistory.length) return null;
    const next = Math.min(s.promptHistoryIdx + 1, s.promptHistory.length - 1);
    set({ promptHistoryIdx: next });
    return s.promptHistory[next];
  },
  historyDown: () => {
    const s = get();
    if (s.promptHistoryIdx < 0) return null;
    const next = s.promptHistoryIdx - 1;
    if (next < 0) {
      set({ promptHistoryIdx: -1 });
      return null;
    }
    set({ promptHistoryIdx: next });
    return s.promptHistory[next];
  },
  addPromptHistory: (prompt: string) => {
    if (!prompt.trim()) return;
    const s = get();
    // Taruh di depan kalau sudah pernah ada, batasi 30 entri.
    const history = [prompt, ...s.promptHistory.filter((h) => h !== prompt)].slice(0, 30);
    set({ promptHistory: history, promptHistoryIdx: -1 });
  },
  clearPromptHistory: () => set({ promptHistory: [], promptHistoryIdx: -1 }),

  compactContext: (keep = 4, composerId = '') => {
    /* The surface that ran /compact, not the primary chat. */
    const id = get().activeIds[composerId] ?? (composerId === '' ? get().activeId : null);
    if (!id) {
      set({ toast: tf('No conversation is open', {}) });
      return 0;
    }
    const sesi = get().activeSession();
    if (!sesi) {
      set({ toast: tf('No conversation is open', {}) });
      return 0;
    }
    const msgs = sesi.messages;
    /*
     * Say why nothing happened, instead of returning 0 in silence.
     *
     * This is the guard that made the feature look broken: a short chat did
     * nothing, showed nothing, and the button may as well not exist. Saying
     * "already short" costs one toast and turns a dead click into an answer.
     */
    if (msgs.length <= keep) {
      set({
        toast: tf('Context is already short - {n} of {keep} messages kept', {
          n: msgs.length,
          keep,
        }),
      });
      return 0;
    }

    const lama = msgs.slice(0, msgs.length - keep);
    const baru = msgs.slice(msgs.length - keep);
    const ringkas: ChatMsg = {
      id: nextId('m'),
      role: 'assistant',
      content:
        `[Konteks dipadatkan: ${lama.length} pesan sebelumnya diringkas.]\n` +
        lama
          .slice(-4)
          .map((m) => `${m.role === 'user' ? 'Pengguna' : 'Asisten'}: ${(m.content ?? '').slice(0, 160)}`)
          .join('\n'),
      at: Date.now(),
    };
    set((s) => ({
      sessions: s.sessions.map((x) => (x.id === id ? { ...x, messages: [ringkas, ...baru] } : x)),
      toast: tf('{n} messages compacted', { n: lama.length }),
    }));
    persist(get());
    return lama.length;
  },

  newChat: (id = '') => {
    const st = get();
    /*
     * Lifecycle: a session starts here, and this is the ONLY place it does.
     *
     * Measured by "a new chat was created", which is a fact one call site can
     * assert — as opposed to "the agent is about to do something", which is a
     * guess about intent. Hooks fire from facts.
     *
     * Fire-and-forget: the reader asked for a new chat and gets one. A hook that
     * takes two seconds, or fails, must not delay that or turn it into an error.
     */
    void import('./hookRuntime').then((m) => m.jalankanHook('session-start'));
    const s = makeSession(st.model, st.provider);

    s.approval = st.approvalMode;
    /*
     * Record the folder this conversation belongs to.
     *
     * The Agents window groups its session list by workspace; without a folder
     * stamped on the session there is nothing to group by, because a chat has no
     * other link to a place on disk. Read from the store rather than a prop so
     * it is right no matter which surface created the chat.
     */
    s.workspace = useStore.getState().workspace ?? undefined;
    /* Drop any buffered delta from a run that ended abnormally (crash, HMR) so
       it cannot flush into the NEW chat on the next frame. */
    batalkanFlushChunk();
    chunkBuf.clear();
    /*
     * The new chat becomes the active one for the surface that asked for it, and
     * only for that surface. `activeId`/`drafts['']` are the primary surface's
     * copies, so they follow only when the primary asked.
     */
    set((x) => ({
      sessions: [...x.sessions, s],
      activeIds: { ...x.activeIds, [id]: s.id },
      ...(id === '' ? { activeId: s.id } : {}),
      drafts: id === '' ? {} : x.drafts,
    }));
    persist(get());
    return s.id;
  },

  selectChat: (id, composerId = '') => {
    const s = get().sessions.find((x) => x.id === id);
    set((st) => ({
      activeIds: { ...st.activeIds, [composerId]: id },
      ...(composerId === '' ? { activeId: id } : {}),
      /*
       * Approval mode is a property of the CHAT, not the surface — switching the
       * docked panel to a chat whose approval is 'auto' must not silently change
       * what the editor tab's chat will do. Only the primary surface's switch
       * updates it, which is the behaviour every existing caller expects.
       */
      ...(composerId === '' ? { approvalMode: s?.approval ?? get().approvalMode } : {}),
    }));
    persist(get());
  },

  deleteChat: (id) => {
    set((s) => {
      const sessions = s.sessions.filter((x) => x.id !== id);

      /*
       * Hapus yang aktif: pindah ke chat lain yang SUDAH ADA, jangan bikin
       * yang baru.
       *
       * Dulu baris berikutnya selalu `newChat()` begitu `activeId` jadi null,
       * jadi menghapus chat yang sedang dibuka langsung memunculkan chat
       * kosong sebagai gantinya — jumlah sesi tidak pernah berkurang dan
       * tombol hapus terlihat rusak. Membuat chat baru hanya benar kalau
       * memang sudah tidak ada sisa sama sekali.
       *
       * EVERY surface pointing at the deleted chat moves, not just the primary:
       * the editor tab and the right column can each have that chat open, and
       * leaving one of them pointing at a chat that no longer exists would blank
       * its transcript while `activeIds` still claimed a session.
       */
      const gantinya = sessions[sessions.length - 1]?.id ?? null;
      const activeIds: Record<string, string | null> = { ...s.activeIds };
      for (const k of Object.keys(activeIds)) {
        if (activeIds[k] === id) activeIds[k] = gantinya;
      }
      const activeId = s.activeId === id ? gantinya : s.activeId;
      return { sessions, activeId, activeIds };
    });
    if (get().sessions.length === 0) get().newChat();
    persist(get());
  },

  renameChat: (id, title) => {
    const bersih = String(title ?? '').trim().slice(0, 120);
    if (!bersih) return;
    set((s) => ({
      sessions: s.sessions.map((x) => (x.id === id ? { ...x, title: bersih } : x)),
    }));
    persist(get());
  },

  duplicateChat: (id) => {
    const asal = get().sessions.find((x) => x.id === id);
    if (!asal) return null;
    const baru = get().newChat();
    /*
     * Copy the transcript AND the folder it belongs to.
     *
     * The workspace is what the Agents list groups by, so a duplicate that lost
     * it would jump into "Chats" and look like a different conversation. The
     * title gets a suffix because two identically-named rows in one group are
     * indistinguishable.
     */
    set((s) => ({
      sessions: s.sessions.map((x) =>
        x.id === baru
          ? {
              ...x,
              title: `${asal.title} (copy)`,
              messages: asal.messages.map((m) => ({ ...m })),
              workspace: asal.workspace,
              model: asal.model,
              provider: asal.provider,
            }
          : x,
      ),
    }));
    persist(get());
    return baru;
  },

  setChatPinned: (id, pinned) => {
    set((s) => ({
      sessions: s.sessions.map((x) => (x.id === id ? { ...x, pinned } : x)),
    }));
    persist(get());
  },

  /*
   * Point the chat surfaces at the conversation that belongs to this folder.
   *
   * WHY this is a store action and not something the Agents list does: the chat
   * is shown in three places (editor tab, right column, Agents window), and all
   * three read `activeIds`. If each surface picked a session for itself, opening
   * a folder would leave two of them on a conversation from the PREVIOUS
   * project — which is exactly the reported bug: "buka folder Zephyr, tapi yang
   * kebaca folder lain".
   *
   * Order of preference:
   *   1. the newest session recorded for this folder;
   *   2. the session already active, when it has no folder recorded (old data
   *      predating `workspace`; keeping it avoids yanking the reader elsewhere);
   *   3. a fresh chat, stamped with this folder.
   *
   * It never selects a session that belongs to a DIFFERENT folder. That is the
   * whole point: showing another project's transcript under this folder's title
   * is a lie about what is open.
   */
  ikutiWorkspace: (dir) => {
    const target = (dir ?? '').trim();
    if (!target) return;
    const sesi = get().sessions;
    const milik = sesi
      .filter((s) => s.workspace === target)
      .sort(
        (a, b) =>
          (b.messages[b.messages.length - 1]?.at ?? b.createdAt) -
          (a.messages[a.messages.length - 1]?.at ?? a.createdAt),
      );
    const aktifSekarang = get().activeId;
    const aktif = sesi.find((s) => s.id === aktifSekarang);
    const kandidat =
      milik[0] ??
      (aktif && !aktif.workspace ? aktif : null);

    if (kandidat) {
      set((s) => ({
        activeId: kandidat.id,
        /* Every surface follows: leaving one on another folder's chat is the bug. */
        activeIds: Object.fromEntries(Object.keys(s.activeIds).map((k) => [k, kandidat.id])),
      }));
      persist(get());
      return;
    }
    /* Nothing for this folder yet: open a fresh chat so the reader can start. */
    const baru = get().newChat();
    /*
     * Stamp the folder EXPLICITLY.
     *
     * `newChat` reads `useStore.workspace`, but `ikutiWorkspace` is called from
     * `syncWorkspaceLokal` in the same tick the folder changes, so that read can
     * still see the PREVIOUS folder — measured: a chat opened for `D:\FolderBaru`
     * came out stamped `D:\Zephyr`. The caller knows the folder; pass it.
     */
    set((s) => ({
      sessions: s.sessions.map((x) => (x.id === baru ? { ...x, workspace: target } : x)),
      /*
       * Point EVERY surface at the new chat, not just the primary.
       *
       * `newChat()` was called without a composer id, so it only wrote
       * `activeIds['']`. A surface whose key was absent - the Agents window on
       * first run - was left with no chat at all, and its panel rendered an
       * empty transcript even though a chat existed. `agents` is included
       * explicitly because it may not be in `activeIds` yet.
       */
      activeIds: Object.fromEntries(
        [...new Set([...Object.keys(s.activeIds), 'agents'])].map((k) => [k, baru]),
      ),
    }));
    persist(get());
  },

  clearAllChats: () => {    /* Every surface loses its chat here, not just the primary — the sessions
       themselves are gone, so any id left in `activeIds` would be a dangling
       reference to a chat that no longer exists. */
    set({ sessions: [], activeId: null, activeIds: {}, clearAllOpen: false });
    get().newChat();
    set({ toast: tx('Chat history cleared') });
  },

  setClearAllOpen: (v) => set({ clearAllOpen: v }),

  regenerate: async () => {
    if (get().pending) return;
    const s = get().activeSession();
    if (!s) return;
    const last = [...s.messages].reverse().find((m) => m.role === 'user' && !m.error);
    if (!last) return;

    const idx = s.messages.findIndex((m) => m.id === last.id);
    const keep = s.messages.slice(0, idx + 1);
    set((st) => ({
      sessions: st.sessions.map((x) =>
        x.id === s.id ? { ...x, messages: keep } : x,
      ),
    }));
    await get().send(last.content, last.images ?? (last.image ? [last.image] : undefined));
  },

  activeSession: () => get().sessions.find((s) => s.id === get().activeId) ?? null,

  exportChat: async (composerId = '') => {
    /* The surface that ran /export, not the primary chat. */
    const sid = get().activeIds[composerId] ?? (composerId === '' ? get().activeId : null);
    const s = sid ? get().sessions.find((x) => x.id === sid) ?? null : get().activeSession();
    if (!s || s.messages.length === 0) {
      set({ toast: tx('Nothing to export yet') });
      return;
    }
    const def = findModel(s.model, s.provider);
    const lines: string[] = [`# ${s.title}`, '', `**Model:** ${def.label} (${def.providerLabel})`, ''];
    for (const m of s.messages) {
      if (m.error) continue;
      lines.push(`## ${m.role === 'user' ? 'User' : def.label}`, '');
      if (m.image) lines.push('_[image attachment — not included in the export]_', '');
      lines.push(m.content, '');
    }
    const md = lines.join('\n');

    /*
     * Written to a FILE as well as the clipboard.
     *
     * The clipboard is useful for pasting into a chat box; a file is what
     * attaches a session to a pull request, a bug report or a commit message —
     * and those are the reasons anyone exports a thread. Clipboard-only meant
     * the reader had to paste into an editor and save by hand, which is the
     * step the command exists to remove.
     *
     * The file lands in the workspace so it is inside the path guard, and a
     * name collision gets a counter rather than overwriting an earlier export —
     * two sessions can share a title, and silently replacing the first export
     * would lose the thing the reader asked to keep.
     */
    const ws = useStore.getState().workspace;
    let disimpan = '';
    if (ws) {
      try {
        const aman = s.title
          .replace(/[^a-zA-Z0-9 _-]/g, '')
          .trim()
          .replace(/\s+/g, '-')
          .slice(0, 60) || 'chat';
        const dir = `${ws.replace(/\\/g, '/')}/.zephyr/exports`;
        await cmd.fsCreateDir(dir).catch(() => undefined);
        let target = `${dir}/${aman}.md`;
        /* Bounded probe: a reader is not going to export the same title 100
           times, and an unbounded loop on a failing stat would hang the send. */
        for (let n = 2; n < 100; n += 1) {
          const ada = await cmd.fsExists(target).catch(() => false);
          if (!ada) break;
          target = `${dir}/${aman}-${n}.md`;
        }
        await cmd.fsWrite(target, md, undefined, undefined, { allowMissing: true });
        /*
         * And tell the turn's checkpoint, so an export the agent performed is
         * undone by "put back what this turn changed" like any other file it
         * wrote. A reader who asks the agent to export and then regrets the
         * turn should not be left with the file behind.
         */
        void import('./checkpoint').then((m) => m.catat(target));
        disimpan = target;
      } catch {
        /* A failed file write must not lose the export: the clipboard copy
           below still runs, and the toast says which happened. */
      }
    }

    const { clipboardWrite } = await import('./clipboard');
    await clipboardWrite(md);
    set({
      toast: disimpan
        ? tf('Chat exported ({n} characters) to {f}', { n: md.length, f: disimpan })
        : tf('Chat exported ({n} characters) - copied to the clipboard', { n: md.length }),
    });
  },

/*
   * Slash commands that are JOBS, not messages.
   *
   * `/loop` and `/goal` used to expand into a sentence and land in the transcript
   * as a bubble, which was wrong twice: the sentence said nothing about what to
   * repeat, and nothing repeated anything. They are handled here instead - before
   * anything reaches the provider - and they answer with a toast or a strip, not
   * with a bubble. The model never sees the command text.
   *
   * Returns `true` when the command was consumed, so the caller stops and does not
   * send a request.
   */
    jalankanPerintahKerja: (teks: string, sessionId: string, composerId = ''): boolean => {
    /*
     * SESSION commands are handled here too, not only in the slash menu.
     *
     * `/new`, `/clear`, `/compact` and `/export` existed only as menu items: the
     * suggestion dropdown matched a BARE token (`/^\/([\w-]*)$/`), so the
     * moment the reader typed a trailing space or an argument the dropdown
     * closed, Enter fell through to the normal send path, and `/clear` was
     * posted to the MODEL as a chat message. Nothing was cleared and the command
     * text became part of the conversation.
     *
     * Accepting an optional argument here (`\s*` instead of the dropdown's
     * bare-token rule) is what makes typed and picked behave the same: whichever
     * way the command is entered, it reaches this one function and is consumed
     * before any request goes out.
     */
    const m = /^\/(loop|goal|new|clear|compact|export)\b\s*([\s\S]*)$/.exec(teks.trim());
    if (!m) return false;

    const cmd = m[1].toLowerCase();
    const arg = m[2].trim();
    const st = get();

    /*
     * ── Session commands ────────────────────────────────────────────────────
     * Each acts on THIS surface's chat, then returns true so the caller stops.
     */
    if (cmd === 'new') {
      st.newChat(composerId);
      set({ toast: tx('New chat') });
      return true;
    }
    if (cmd === 'clear') {
      /* Every surface's history goes, so the confirmation is not per-surface. */
      set({ clearAllOpen: true });
      return true;
    }
    if (cmd === 'compact') {
      const n = st.compactContext(undefined, composerId);
      set({
        toast:
          n > 0
            ? tf('Context compacted - {n} messages folded away', { n })
            : tx('Nothing old enough to compact yet'),
      });
      return true;
    }
    if (cmd === 'export') {
      void st.exportChat(composerId);
      return true;
    }

    if (cmd === 'loop') {
      /* A loop is per CONVERSATION, so it needs one to attach to. */
      if (!sessionId) {
        set({ toast: tx('Open a chat before starting a loop') });
        return true;
      }
      const low = arg.toLowerCase();
      if (low === 'stop' || low === 'off' || low === 'clear') {
        st.hentikanLoop(sessionId);
        return true;
      }
      if (!arg) {
        const l = st.loops[sessionId];
        set({
          toast: l
            ? tf('Looping every {interval} ({runs}/{max} runs)', {
                interval: formatInterval(l.everyMs),
                runs: l.runs,
                max: MAX_LOOP_RUNS,
              })
            : tx('No loop. Usage: /loop 10m <prompt>'),
        });
        return true;
      }
      const [pertama, ...sisa] = arg.split(/\s+/);
      const everyMs = parseInterval(pertama);
      const prompt = sisa.join(' ').trim();
      if (everyMs === null || !prompt) {
        set({ toast: tx('Usage: /loop <interval> <prompt>, interval like 5m, 1h or 1h30m (at least 1m)') });
        return true;
      }
      startLoop(sessionId, everyMs, prompt, {
        getLoop: () => get().loops[sessionId] ?? null,
        setLoop: (l) => get().setLoop(sessionId, l),
        /*
         * A tick goes through `kirimSekarang`, so it waits behind a busy turn
         * instead of stacking a second request - and it does NOT go through
         * `jalankanPerintahKerja` again, which is what stops a loop from
         * re-triggering itself.
         */
        /*
         * The tick goes back to the surface that STARTED the loop, so a loop
         * running from the editor tab keeps feeding the editor tab's
         * conversation instead of surfacing its output in the right column.
         */
        enqueue: (text) => void get().kirimSekarang(text, undefined, composerId),
      });
      set({ toast: tf('Looping every {interval}. /loop stop to end it.', { interval: formatInterval(everyMs) }) });
      return true;
    }

    /* cmd === 'goal' */
    if (!sessionId) {
      set({ toast: tx('Open a chat before setting a goal') });
      return true;
    }
    const low = arg.toLowerCase();
    if (low === 'clear' || low === 'stop' || low === 'off') {
      st.setGoal(sessionId, null);
      set({ toast: tx('Goal cleared') });
      return true;
    }
    if (low === 'done') {
      const g = st.goals[sessionId];
      if (!g) {
        set({ toast: tx('No goal set') });
        return true;
      }
      st.setGoal(sessionId, { ...g, completedAt: Date.now() });
      set({ toast: tx('Goal marked done') });
      return true;
    }
    if (!arg) {
      const g = st.goals[sessionId];
      set({ toast: g ? tf('Goal: {text}', { text: g.text }) : tx('No goal. Usage: /goal <what to achieve>') });
      return true;
    }
    st.setGoal(sessionId, { text: arg, startedAt: Date.now(), completedAt: null });
    /*
     * Setting a goal also sends the opening turn. A goal that only wrote a line
     * somewhere and then sat there until the user typed something else reads as a
     * no-op - the user asked for work, so the work starts.
     */
    void get().send(arg, get().draftImages);
    return true;
    },

  send: async (text, images, composerId = ''): Promise<boolean> => {
    COMPOSER_AKTIF = composerId;
    get().sinkronProvider();
    const diketik = (text ?? get().drafts[''] ?? '').trim();

    /*
     * `/loop` and `/goal` are jobs, not messages: they start a schedule or set
     * a standing goal and answer with a toast or a strip. Handled here, at the
     * top of every send path, so neither the composer nor a queued drain can
     * slip the command text through to the model.
     */
    {
      /* The surface's own chat: a job started from the editor tab belongs to the
         editor tab's conversation, not to whatever the right column has open. */
      const sid = get().activeIds[composerId] ?? (composerId === '' ? get().activeId : null);
      /*
       * Called even with no session id: "clear" and "new" are meaningful on an
       * empty surface (the first clears history, the second creates a chat), and
       * the commands that DO need a conversation guard themselves.
       */
      if (get().jalankanPerintahKerja(diketik, sid ?? '', composerId)) {
        set({ drafts: {}, draftImages: [] });
        return true;
      }
    }
    /*
     * Expand a leading slash command into the message the model receives.
     *
     * The composer keeps `/explain why this fails` visible while the user types,
     * so the command has to be turned into the template body before the request
     * goes out. This is the one place every send path passes through - Enter, the
     * send button, and the queued-message drain all end up here - so the
     * expansion cannot differ between them.
     *
     * `diketik` (what the user typed) is kept for the prompt history and for the
     * bubble in the transcript: seeing `/loop cek build` back is more useful than
     * seeing the paragraph it expanded to. Only the request to the provider uses
     * the expanded text.
     */
    const perluas = perluasPerintah(diketik);
    const raw = perluas.kirim;
    const tampil = perluas.tampil;
    /*
     * Wait for an in-flight attachment shrink before reading the draft.
     *
     * The reader can press Enter inside the ~200 ms the canvas needs; without
     * this await the message leaves with `draftImages: []` and the image is
     * silently lost — a race that looks exactly like "the model cannot see my
     * image".
     */
    await tungguGambar();
    const imgs = images ?? get().draftImages;
    if (!raw && imgs.length === 0) return false;

    if (diketik) get().addPromptHistory(diketik);

    if (get().agentMode === 'agent') {
      if (get().agentBusy) {
        // Park it instead of refusing: the composer accepts the message and it
        // goes out as soon as the running task finishes.
        /*
         * The queue holds what the user TYPED, not the expanded text: the drain
         * runs it back through `send`, which expands it again. Storing the
         * expanded form would work too - a body does not start with a slash, so
         * a second pass leaves it alone - but the queued row would then show the
         * paragraph instead of the command, and the two paths would drift.
         */
        /*
         * LANE ANTREAN-LIVE (item C). Keputusan masuk/penuh/terlalu-panjang TIDAK
         * ditebak di sini: `rencanaMasukSaatSibuk` (src/lib/antreanPesan.ts) yang
         * memutuskan, dengan aturan yang sama dengan 18 uji di
         * scripts/uji-antrean-pesan.mjs. Tiga akibatnya, semuanya disengaja:
         *   * pesan kosong / terlalu panjang -> DITOLAK dengan sebab yang bisa
         *     dibaca, dan draft TIDAK dikosongkan supaya user bisa langsung
         *     memperbaikinya (dulu: apa pun yang diketik "berhasil" diantrekan);
         *   * antrean penuh (20 pesan) -> pesan TERLAMA dibuang dan pesan BARU
         *     tetap masuk, dengan pemberitahuan (dulu: tak ada batas sama sekali);
         *   * barisnya ditulis ke `antrians[composerId]` - daftar yang dirender
         *     panel - dan dicerminkan ke `antrian` untuk permukaan utama, sama
         *     seperti aksi antrean lain. Jadi pesan yang diketik selagi sibuk
         *     SEKARANG terlihat di daftar antrean panel (dulu hanya masuk daftar
         *     datar yang tidak dirender).
         */
        const kunciAntrean = composerId || COMPOSER_AKTIF;
        const barisAntrean: AntrianPesan = { id: idAntrian(), teks: diketik, images: imgs };
        /*
         * Baris TANPA teks (hanya gambar yang ditempel) tetap lewat jalur lama:
         * `kirim()` di antreanPesan.ts menolak pesan kosong, sedangkan panel
         * menerima baris bergambar. Menolaknya di sini akan menghilangkan gambar
         * yang sudah ditempel user - keluhan yang justru sedang diperbaiki - jadi
         * aturan antrean hanya berlaku untuk baris berteks.
         */
        if (diketik.trim().length === 0) {
          set((s) => ({ antrian: [...s.antrian, barisAntrean] }));
          set((s) => ({ drafts: { ...s.drafts, [composerId]: '' }, draftImages: [], toast: tx('Added to the queue') }));
          return true;
        }
        const keputusan = rencanaMasukSaatSibuk(get().antrians[kunciAntrean] ?? [], diketik, imgs);
        if (!keputusan.ok || !keputusan.item) {
          // Draft sengaja TIDAK dikosongkan: user harus bisa memperbaiki teksnya.
          set({ toast: keputusan.pesan ?? tx('Message could not be queued') });
          return false;
        }
        const penuh = keputusan.buangIndeks !== null;
        set((s) => {
          const sekarang = (s.antrians[kunciAntrean] ?? []).slice();
          if (keputusan.buangIndeks !== null) sekarang.splice(keputusan.buangIndeks, 1);
          const sesudah = [...sekarang, { ...barisAntrean, teks: keputusan.item!.teks }];
          return {
            antrians: { ...s.antrians, [kunciAntrean]: sesudah },
            ...(kunciAntrean === '' ? { antrian: sesudah } : {}),
          };
        });
        set((s) => ({
          drafts: { ...s.drafts, [composerId]: '' },
          draftImages: [],
          toast: penuh
            ? tf('Queue full ({n}): the oldest queued message was dropped, yours is in', {
                n: keputusan.keadaan.batas,
              })
            : tx('Added to the queue'),
        }));
        return true;
      }
      return get().sendAgent(raw, imgs, tampil, composerId);
    }
    if (get().pending) {
      // Same rule in chat mode: queue it rather than dropping the text.
      set((s) => ({ antrian: [...s.antrian, { id: idAntrian(), teks: diketik, images: imgs }] }));
      set((s) => ({ drafts: { ...s.drafts, [composerId]: '' }, draftImages: [], toast: tx('Added to the queue') }));
      return true;
    }

    let content = raw;
    if (raw.length > MSG_LIMIT) {
      content =
        `${raw.slice(0, MSG_LIMIT)}\n\n[truncated: message of ${raw.length} characters, ` +
        `sending the first ${MSG_LIMIT} characters]`;
      set({
        toast: tf('Message trimmed from {from} to {to} characters', { from: raw.length, to: MSG_LIMIT }),
        lastTruncated: { from: raw.length, to: MSG_LIMIT },
      });
    } else {
      set({ lastTruncated: null });
    }

    await get().loadKeys();
    if (!get().hasKey()) {
      const label = PROVIDER_BY_ID.get(get().provider)?.label ?? get().provider;

      const lain = get().keys.filter((k) => k.hasKey && k.provider !== get().provider);
      if (lain.length > 0) {
        const pindah = lain[0].provider;
        const labelPindah = PROVIDER_BY_ID.get(pindah)?.label ?? pindah;
        set({ provider: pindah });
        set({ toast: tf('No key for {from} - switched to {to}, which has one', { from: label, to: labelPindah }) });
        return false;
      }
      set({
        toast: tf('Add an API key for {name} in AI Models, or pick a provider that already has one', { name: label }),
      });
      return false;
    }

    /*
     * The chat this message belongs to is the SENDING SURFACE's, not the
     * primary one's.
     *
     * This is the line that made the two surfaces share a conversation: the
     * editor tab's composer sent into whatever chat the right column had open,
     * so a message typed in the editor was appended to the column's transcript
     * and the column showed the streaming reply. `activeIds[composerId]` scopes
     * it; the fallback keeps no-id callers (queued drains, tests) on the primary.
     */
    let sessionId = get().activeIds[composerId] ?? (composerId === '' ? get().activeId : null);
    if (!sessionId) sessionId = get().newChat(composerId);

    let attached: ChatMsg['attached'];
    let payloadContent = content;
    const st = useStore.getState();
    const tab = st.tabs.find((t) => t.id === st.activeTabId);
    if (get().attachActive && tab) {
      const full = tab.content ?? '';
      const truncated = full.length > ATTACH_LIMIT;
      const body = truncated ? full.slice(0, ATTACH_LIMIT) : full;
      attached = { path: tab.path ?? tab.name, bytes: body.length, truncated };
      payloadContent =
        `${content}\n\n---\n` +
        `Treat this file as the active working context.\n` +
        `File: ${tab.path ?? tab.name}${truncated ? ' (first 12KB truncated)' : ''}\n` +
        '```\n' +
        body +
        '\n```';
    }

    for (const m of content.matchAll(/@file\s+([^\s,.;:!?]+)/g)) {
      const nama = m[1];
      const kandidat = st.tabs.find(
        (x) => x.path && x.path.toLowerCase().endsWith(nama.toLowerCase()),
      );
      const path = kandidat?.path ?? nama;
      let isi = kandidat?.content ?? '';
      const truncated = isi.length > ATTACH_LIMIT;
      if (truncated) isi = isi.slice(0, ATTACH_LIMIT);
      if (!isi.trim()) {
        set({ toast: tf('"{name}" is not open in the editor', { name: nama }) });
        continue;
      }
      payloadContent =
        payloadContent.replace(m[0], `(@file: ${path})`) +
        `\n\n--- isi ${path}${truncated ? ' (12KB truncated)' : ''} ---\n` +
        '```\n' +
        isi +
        '\n```';
    }

    const reqId = nextId('req');
    let ragContext: string | null = null;
    const rag = useStore.getState().settings.models;
    if (rag.ragEnabled && rag.ragUrl.trim() && rag.ragProject.trim()) {
      try {
        const hits = await cmd.ragSearch(
          rag.ragUrl.trim().replace(/\/+$/, ''),
          rag.ragProject.trim(),
          raw.slice(0, 400),
          rag.ragK || 4,
        );
        if (hits.length > 0) {
          ragContext =
            'RAG context from this project (answer from this when relevant):\n\n' +
            hits
              .map(
                (h, i) =>
                  `[${i + 1}] ${h.sourceFile || '(tanpa file)'} (skor ${h.score.toFixed(2)})\n${h.content}`,
              )
              .join('\n\n---\n\n');
        }
      } catch (e) {

        set({ toast: cmd.asZephyrError(e).message });
      }
    }
        const userMsg: ChatMsg = {
          id: nextId('m'),
          role: 'user',
          /* Same rule as the agent path: the bubble shows the command as typed,
             the provider gets the expanded body. */
          content: tampil,
          at: Date.now(),
          attached,

          images: imgs.length > 0 ? imgs : undefined,
          image: imgs[0],
        };
    const botMsg: ChatMsg = {
      id: reqId,
      role: 'assistant',
      content: '',
      at: Date.now(),
      streaming: true,
      model: get().model,
    };

    const prev = get().activeSession()?.messages ?? [];
    const mentah: AgentMsg[] = prev
      .filter((m) => !m.error && (m.content.trim() || m.images?.length || m.image))
      .map((m) => {
        const banyak = m.images?.length ? m.images : m.image ? [m.image] : [];
        return {
          role: m.role,
          content: m.content,
          ...(banyak.length ? { images: banyak } : {}),
          /*
           * Echo the turn's reasoning back to the provider.
           *
           * Anthropic validates the signature against the thinking block,
           * so the two travel together; the OpenAI-compatible gateways
           * take `reasoning_content` on the assistant turn and ignore the
           * signature field. Non-empty only — an empty string is not the
           * same as absent, and some routers reject that form.
           */
          ...(m.reasoning ? { reasoning: m.reasoning } : {}),
          ...(m.reasoningSignature ? { reasoningSignature: m.reasoningSignature } : {}),
        } as AgentMsg;
      });

    /*
     * The chat path needs the SAME shape repair the agent path gets.
     *
     * It did not have it, and that left the `user -> user` bug alive on this
     * path after it had been fixed on the agent path. Both paths draw from the
     * same session messages, and a turn whose reply never arrived — a network
     * failure, a cancel, a provider that closed the stream with no text — leaves
     * a user message with no assistant after it. The reader types again, and
     * from that point EVERY chat request carries `user -> user` and is refused
     * with 400, permanently, with nothing on screen explaining why.
     *
     * `bentukWireRiwayat` merges consecutive user turns, drops empty assistant
     * turns, and rewrites assistant↔tool pairing. Trimming runs after it, then
     * the repair runs once more, because trimming can break a pairing it did not
     * create (the same order the agent path uses).
     */
    const dirApi = bentukWireRiwayat(mentah);
    const history: AiMessage[] = bentukWireRiwayat(ringkasUkuran(dirApi)) as AiMessage[];

    const bhsJawab = useStore.getState().settings.models.answerLang ?? 'follow';
    const gayaJawab = useStore.getState().settings.models.answerStyle ?? 'short';
    {

      const [ekstra, aturan] = await Promise.all([konteksAgent(), aturanProyek(), segarkanPotretKeadaan()]);

      const ai = get();
      /*
       * `content` (pesan user giliran ini) diteruskan sebagai argumen terakhir
       * `kueri`. Dua blok prompt dibangun darinya dan keduanya HARUS ada di
       * setiap giliran:
       *
       *   - blok bahasa: aturan bahasa yang mengikat giliran ini, dipasang di
       *     paling atas prompt oleh `systemPromptFor` sendiri; tanpa teks user
       *     ia tidak bisa tahu bahasa apa yang dipakai, dan jawaban kembali
       *     menyimpang ke Inggris (materi prompt mayoritas Inggris);
       *   - blok indeks: potongan indeks pengetahuan Zephyr yang cocok dengan
       *     kata-kata user, disuntik OTOMATIS. Ini yang menghapus ketergantungan
       *     pada model yang ingat memanggil tool `zephyr_self`.
       *
       * Yang diteruskan `content`, BUKAN `payloadContent`: lampiran (isi tab yang
       * sedang terbuka) bisa mencapai ATTACH_LIMIT dan akan menenggelamkan kata
       * kunci pesan user, sehingga indeks tidak menemukan apa pun.
       */
      history.unshift({
        role: 'system',
        content: systemPromptFor(bhsJawab, ekstra, aturan, ai.model, ai.provider, gayaJawab, content),
      });
      /*
       * Plan mode: tell the agent to think before it touches anything.
       *
       * This is the behavioural half of the run-mode switch — the approval level
       * ('work') already holds risky actions back, and this instruction makes
       * the agent PRESENT a plan and stop rather than start editing. Added as a
       * second system line so it sits above the conversation without rewriting
       * the shared prompt builder.
       */
      if (ai.runMode === 'plan') {
        history.unshift({
          role: 'system',
          content:
            'PLAN MODE: Do not change anything this turn. Explore as needed with ' +
            'read-only tools, then present a concise, numbered plan of what you ' +
            'would do and STOP, asking the user to approve before you edit files ' +
            'or run commands. Do not call write or terminal tools until the user ' +
            'tells you to proceed. Write and shell tools are REFUSED in this mode ' +
            'by the runtime, so calling them only wastes a step.',
        });
      } else if (ai.runMode === 'interactive') {
        /*
         * INTERACTIVE means the reader wants to be in the loop, so the run must
         * actually stop and ask rather than barrel through.
         *
         * Before this, Interactive and Autopilot differed only in the approval
         * level ('work' vs 'auto'), which controls the confirmation CARD but
         * says nothing about pacing: the model still planned and executed the
         * whole task in one turn. The button promised "Step-by-step
         * collaboration" and delivered a single long turn, so the three modes
         * were effectively two.
         *
         * The rule is stated as a checkpoint, not as "ask often": a checkpoint
         * at every single tool call would make the mode useless, so it lands
         * where a decision actually belongs - before touching files, and before
         * any change that is hard to undo.
         */
        history.unshift({
          role: 'system',
          content:
            'INTERACTIVE MODE: the user wants to stay in the loop. Do the reading ' +
            'and investigation for this turn, then STOP at the first point where ' +
            'you would change something on disk (writing/editing files, deleting, ' +
            'or a shell command that mutates state) and say what you are about to ' +
            'do in one or two sentences, so the user can confirm or redirect. ' +
            'Read-only work needs no permission: keep going until you reach a ' +
            'change. After the user answers, continue.',
        });
      } else if (ai.runMode === 'autopilot') {
        /*
         * AUTOPILOT: finish the task in this turn, and say so when you cannot.
         *
         * The mode already sets approval 'auto', so nothing is refused. What it
         * was missing is the other half of the promise: a run that keeps going
         * until the task is DONE, rather than stopping to narrate and waiting
         * for a "continue" nobody asked to send. The escape hatch matters as
         * much as the mandate - an agent that cannot admit it is blocked will
         * invent progress, and a blocked autopilot run is exactly where that
         * temptation is strongest.
         */
        history.unshift({
          role: 'system',
          content:
            'AUTOPILOT MODE: complete the whole task in this turn. Do not stop to ' +
            'ask for confirmation before changes, and do not end the turn with a ' +
            'plan of work you could have done - do it, verify it, then report. If ' +
            'you genuinely cannot proceed (missing credentials, a decision only ' +
            'the user can make, an external service down), stop and say exactly ' +
            'what you need and why; that is the only reason to pause. Never claim ' +
            'a step succeeded without the tool result that proves it.',
        });
      }
    }

    if (ragContext) history.push({ role: 'user', content: ragContext });
            /*
             * `content` diteruskan juga ke `identityReminder`, yang menempelkan
             * satu baris bahasa di UJUNG pesan user ("Answer in Indonesian - the
             * message above is written in it."). Blok bahasa di prompt sistem
             * berjarak ribuan token dari jawaban; perintah di ujung pesan user
             * adalah teks terakhir yang dibaca model sebelum mulai menulis, jadi
             * pasangan ini yang menahan jawaban tetap satu bahasa dengan user.
             */
            history.push({
              role: 'user',
              content: payloadContent + identityReminder(get().model, content),
              ...(imgs.length ? { images: imgs } : {}),
            });

    /*
     * Open the debug row once the payload is final.
     *
     * Placed after the history is assembled so the counts describe what actually
     * goes out — the system turn, RAG context and attachments all shift those
     * numbers, and a row logged before them would understate the request.
     */
    {
      const d = findModel(get().model, get().provider);
      useAiDebug.getState().mulai({
        id: reqId,
        provider: d.provider,
        model: d.id,
        kind: 'chat',
        pesan: history.length,
        chars: history.reduce((n, m) => n + (m.content?.length ?? 0), 0),
      });
    }

    set((s) => ({
      sessions: s.sessions.map((x) =>
        x.id === sessionId
          ? {
              ...x,

              title: x.messages.length === 0 ? judulDari(content) : x.title,
              messages: [...x.messages, userMsg, botMsg].slice(-MAX_MSGS),
            }
          : x,
      ),
      /*
       * Draft dihapus untuk PERMUKAAN YANG MENGIRIM, bukan seluruh peta.
       *
       * Sebelumnya: `drafts: text ? s.drafts : {}`. Composer selalu mengirim
       * `text` (isinya draft permukaan itu), jadi cabang `text` yang terpakai
       * dan draft-nya TIDAK PERNAH dibersihkan - kotak input tetap berisi teks
       * yang baru dikirim, dan itu terlihat user. Cabang `{}` hanya terpakai
       * kalau send() dipanggil tanpa teks (mis. drain antrian), lalu ia justru
       * menghapus draft SEMUA permukaan, termasuk yang tidak mengirim.
       * Sekarang satu aturan untuk keduanya: yang mengirim dibersihkan, yang
       * lain dibiarkan.
       */
      drafts: { ...s.drafts, [composerId]: '' },
      draftImages: [],
      pending: reqId,
      toast: null,
    }));
    persist(get());

    const cliAktif = useCliAgent.getState().aktif;
    if (cliAktif) {
      const cwd = useStore.getState().workspace ?? undefined;
      await useCliAgent.getState().jalankan(content, cwd);
      const runs = useCliAgent.getState().runs;
      const terakhir = runs[runs.length - 1];
      const teks = terakhir?.output ?? '(no output)';

      get().onChunk({ id: reqId, text: teks });
      get().onChunk({ id: reqId, done: true });
      return true;
    }

    let def = findModel(get().model, get().provider);
    /*
     * The same sentinel resolution as the agent path: `hydrafusion` is a
     * routing signal, not a model any provider serves. Resolve it to the
     * reader's configured model so the plan always has a real fallback.
     */
    const hydraAktif = pilihHydra(get().model);
    if (hydraAktif) {
      const s2 = useStore.getState().settings.models;
      def = findModel(
        (s2.providers[s2.activeProvider] ?? {}).model ?? get().model,
        s2.activeProvider,
      );
    }
    const cfg = useStore.getState().settings.models.providers[def.provider] ?? {};

    /*
     * ── HydraFusion: the plan, not the picker, chooses the model ─────────────
     *
     * WHY it sits HERE: this is the last point before the request goes out, and
     * everything the plan needs — the assembled `history`, the resolved catalog
     * entry, the provider config — is already local. Above this line the same
     * turn runs with the reader's own model, so switching the setting off
     * restores the old path byte for byte.
     *
     * The route is decided from the text alone (`rencanaHydra` is pure), then
     * executed pass by pass. Every pass reports its stage before it starts, so
     * a three-request critique-revision shows what it is doing instead of going
     * quiet and then printing a finished answer.
     */
    const hydraSet = bacaPengaturan(useStore.getState().settings.hydrafusion);
    if (hydraAktif) {
      /* Candidates are the providers that are actually usable right now — a key
         AND an endpoint — and, for a free-text provider, the model the reader
         actually configured rather than the catalogue's placeholder row. See
         `kandidatHydra` for why that distinction is the whole feature. */
      const kandidat = kandidatHydra(
        useStore.getState().settings.models.providers,
        (id) => get().hasKey(id),
      );
      const rencana = rencanaHydra({
        teks: content,
        kandidat,
        cadangan: { provider: def.provider, model: def.id },
        pengaturan: hydraSet,
        providerSiap: (p) => get().hasKey(p),
      });
      /*
       * Only a ONE-request plan streams straight into the bubble. Any other pass
       * may still be overruled by a later one, and a transcript that flickers
       * through draft, critique and revision is worse than a stage strip — so
       * those are buffered and the winner is handed over in one piece.
       */
      const live = rencana.langkah.length === 1;
      const hasil = await jalankanHydra(rencana, ringkasUkuran(history), {
        id: (n) => (live ? reqId : `${HYDRA_ID_PREFIX}${rencana.jalur}-${n}`),
        lapor: (l) => set({ hydraTahap: l }),
        batalkan: () => cancelled.has(reqId) || get().pending !== reqId,
        kirim: async (langkah, pesan, id) => {
          hydraSiapkan(id, live);
          try {
            const p = useStore.getState().settings.models.providers[langkah.provider] ?? {};
            await cmd.aiChat({
              id,
              provider: langkah.provider,
              model: langkah.model,
              messages: pesan,
              baseUrl: p.baseUrl || undefined,
              maxTokens: findModel(langkah.model, langkah.provider).maxOut ?? 2048,
              effort: get().reasoningEffort ?? undefined,
              sessionId: get().activeSession()?.id,
            });
            /*
             * `aiChat` resolves when the backend is done WRITING - which is not
             * the moment its frames reach us: the invoke result and the
             * 'ai-chunk' events are two independent deliveries, so a slow
             * answer can still be in flight right here. Reading the buffer
             * straight away, and even a 3 s cap, turned exactly that into
             * 'empty answer': a healthy pass reported as a failure while the
             * reader watched the answer arrive. Wait for the terminal frame
             * instead - stopping early if the pass is gone (cancelled), if an
             * error frame landed, or if its bubble already stopped streaming.
             * The deadline exists only so a provider that never closes its
             * stream cannot pin the turn forever.
             */
            const tenggat = Date.now() + 60000;
            while (Date.now() < tenggat) {
              const b = hydraLihat(id);
              if (!b || b.selesai || b.err) break;
              const pesan = get().activeSession()?.messages.find((x) => x.id === id);
              if (pesan && pesan.streaming === false) break;
              await new Promise((r) => setTimeout(r, 25));
            }
            return hydraAmbil(id);
          } catch (e) {
            const msg = cmd.asZephyrError(e).message;
            hydraLupakan(id);
            return { teks: '', err: msg };
          }
        },
      });

      const akhir = hasil.dipakai[hasil.dipakai.length - 1];
      set({
        hydraTahap: null,
        hydraTerakhir: {
          jalur: hasil.jalur,
          tingkat: rencana.tingkat,
          kategori: rencana.kategori,
          provider: akhir?.provider ?? def.provider,
          model: akhir?.model ?? def.id,
          alasan: rencana.alasan,
          request: hasil.request,
          berhenti: hasil.berhenti,
          catatanTahap: hasil.catatanTahap,
          eskalasi: hasil.eskalasi,
        },
      });
      if (live) {
        /* The stream already filled the bubble and closed it; only a failure
           still needs reporting, exactly as the single-model path does below. */
        if (hasil.err) {
          get().onChunk({ id: reqId, err: hasil.err });
          get().onChunk({ id: reqId, done: true });
        }
      } else {
        if (hasil.teks) get().onChunk({ id: reqId, text: hasil.teks });
        if (hasil.err) get().onChunk({ id: reqId, err: hasil.err });
        get().onChunk({ id: reqId, done: true });
      }
      return true;
    }

    /*
     * Chat mode retries a failed request, exactly like the agent does.
     *
     * WHY it did not before, and why that was wrong: only `sendAgent` had retry
     * logic, so a transient provider failure - a 502 from the router, a dropped
     * connection - killed a plain chat turn on the first attempt while the same
     * failure in agent mode was silently retried and usually succeeded. The user
     * sees "Server provider bermasalah (502) — coba lagi nanti" in chat and a
     * perfectly fine answer in the agent, from the same provider, seconds apart.
     *
     * A chat turn has no tools and no side effects, so retrying it is strictly
     * safer than retrying an agent step: there is nothing to replay. The stream
     * is restarted from the beginning, which is why the partial text is cleared
     * before each attempt (see `resetTeksRetry` below) - otherwise the second
     * attempt's answer lands on top of the first attempt's fragment and the
     * message stutters.
     */
    const RETRY_CHAT = [1200, 3000] as const;
    let terakhirErr: string | null = null;
    for (let retry = 0; retry <= RETRY_CHAT.length; retry++) {
      if (retry > 0) {
        /* Clear what the failed attempt wrote before the new one starts. The
           retry re-sends the same prompt and the provider answers from scratch,
           so any fragment already in the bubble would end up duplicated. */
        set((s) => ({
          sessions: s.sessions.map((sess) => ({
            ...sess,
            messages: sess.messages.map((m) => (m.id === botMsg.id ? { ...m, content: '', error: undefined } : m)),
          })),
        }));
        if (!(await tungguRetryAgent(RETRY_CHAT[retry - 1]))) break;
        if (cancelled.has(reqId)) break;
      }
      try {
        await cmd.aiChat({
          id: reqId,
          provider: def.provider,
          model: def.id,
          // Same gateway ceiling as the agent path. Plain chat only LOOKED
          // immune because one message is small, but a long conversation
          // plus a few screenshots builds the same oversized body - it just
          // takes more turns to get there.
          messages: ringkasUkuran(history),
          baseUrl: cfg.baseUrl || undefined,
          maxTokens: def.maxOut ?? 2048,
          effort: get().reasoningEffort ?? undefined,
          // Stable per-chat id: lets the provider reuse its prompt cache for
          // this conversation instead of re-reading the whole prompt each turn.
          sessionId: get().activeSession()?.id,
        });
        terakhirErr = null;
        break;
      } catch (e) {
        const msg = cmd.asZephyrError(e).message;
        terakhirErr = msg;
        /*
         * Retry only what can succeed on a second try. A 401 or a 400 will
         * answer the same way every time, and retrying those would just make
         * the user wait three seconds to see the same error.
         */
        if (!isRetryableAgentProviderError(msg) || retry === RETRY_CHAT.length) break;
        if (cancelled.has(reqId)) break;
      }
    }
    if (terakhirErr) {
      get().onChunk({ id: reqId, err: terakhirErr });
      get().onChunk({ id: reqId, done: true });
    }
    return true;
  },

  sendAgent: async (raw, explicitImages, tampilBubble, composerId = '') => {
    COMPOSER_AKTIF = composerId;
    get().sinkronProvider();
    clearGambarMenunggu();
    if (get().pending || get().agentBusy) {
      /*
       * The busy guard is deliberately APP-WIDE, not per surface: there is one
       * provider, one request id and one chunk buffer, so two agent loops at
       * once would interleave their deltas into the same transcript. What the
       * message adds is WHERE the run is, so a reader who started it in the
       * editor tab is not left hunting in the right column for the Stop button.
       */
      const diEditor = COMPOSER_AKTIF !== '';
      return gagalKirimToast(
        diEditor
          ? tx('An agent task is still running in the editor tab - stop it first')
          : tx('An agent task is still running - stop it first'),
      );
    }
    const agentImages = explicitImages ?? get().draftImages;
    /*
     * JEJAK KANDIDAT & PENCACAH PERCOBAAN (temuan d: pesan akhir TIDAK pernah
     * menyebut provider mana pun, dan TIDAK memberi tahu user berapa kali
     * permintaan yang sama diulang).
     *
     * Dideklarasikan di lingkup `sendAgent` paling luar (bukan di blok retry)
     * supaya terlihat oleh catch akhir yang menyusun `finalError` ~1.500 baris
     * ke bawah. `activeDef` ada di indentasi 8 dan TIDAK terlihat dari catch
     * yang berindentasi 6 - itu sebabnya jejak dicatat di sini.
     */
    const jejakKandidat: string[] = [];
    let jejakPercobaan = 0;
    const navigationOnly = isNavigationOnlyRequest(raw);
    let content = raw;
    if (raw.length > MSG_LIMIT) {
      content =
        `${raw.slice(0, MSG_LIMIT)}\n\n[truncated: message of ${raw.length} characters, ` +
        `sending the first ${MSG_LIMIT} characters]`;
      set({
        toast: tf('Message trimmed from {from} to {to} characters', { from: raw.length, to: MSG_LIMIT }),
        lastTruncated: { from: raw.length, to: MSG_LIMIT },
      });
    } else {
      set({ lastTruncated: null });
    }

    /*
     * Lampiran berkas aktif ikut jalur AGEN.
     *
     * Settings -> agents.attachActiveFile ('Send active file to agent') di
     * janjikan tepat di sini: agent yang dikirimi berkas yang sedang terbuka.
     * Blok serupa sudah lama ada di cabang chat send(), tetapi cabang itu kini
     * mati (mode chat pensiun) - tanpa salinan di sini, mengaktifkan setelan
     * itu tidak lagi berpengaruh sama sekali pada panel AI, dan chip lampiran
     * di bubble tidak pernah muncul. Perilakunya sengaja dibuat sama persis
     * dengan cabang chat: yang dikirim ke model adalah perluasan payload,
     * sedangkan bubble tetap menampilkan teks yang di ketik orang.
     */
    let payloadAgen = content;
    let attachedAgen: ChatMsg['attached'];
    if (get().attachActive) {
      const stA = useStore.getState();
      const tabA = stA.tabs.find((t) => t.id === stA.activeTabId);
      if (tabA) {
        const fullA = tabA.content ?? '';
        const truncatedA = fullA.length > ATTACH_LIMIT;
        const bodyA = truncatedA ? fullA.slice(0, ATTACH_LIMIT) : fullA;
        attachedAgen = { path: tabA.path ?? tabA.name, bytes: bodyA.length, truncated: truncatedA };
        payloadAgen =
          `${content}\n\n---\n` +
          `Treat this file as the active working context.\n` +
          `File: ${tabA.path ?? tabA.name}${truncatedA ? ' (first 12KB truncated)' : ''}\n` +
          '```\n' +
          bodyA +
          '\n```';
      }
    }

    await get().loadKeys();
    if (!get().hasKey()) {
      const label = PROVIDER_BY_ID.get(get().provider)?.label ?? get().provider;
      const lain = get().keys.filter((k) => k.hasKey && k.provider !== get().provider);
      if (lain.length > 0) {
        const pindah = lain[0].provider;
        const labelPindah = PROVIDER_BY_ID.get(pindah)?.label ?? pindah;
        set({ provider: pindah });
        return gagalKirimToast(tf('No key for {from} - switched to {to}, which has one', { from: label, to: labelPindah }));
      }
      return gagalKirimToast(
        tf('Add an API key for {name} in AI Models, or pick a provider that already has one', { name: label }),
      );
    }

    /*
     * The chat this message belongs to is the SENDING SURFACE's, not the
     * primary one's.
     *
     * This is the line that made the two surfaces share a conversation: the
     * editor tab's composer sent into whatever chat the right column had open,
     * so a message typed in the editor was appended to the column's transcript
     * and the column showed the streaming reply. `activeIds[composerId]` scopes
     * it; the fallback keeps no-id callers (queued drains, tests) on the primary.
     */
    let sessionId = get().activeIds[composerId] ?? (composerId === '' ? get().activeId : null);
    if (!sessionId) sessionId = get().newChat(composerId);

    const userMsg: ChatMsg = {
      id: nextId('m'),
      role: 'user',
      /*
       * Show the command as typed. The model gets the expanded body (that is
       * `content`), but the transcript is for the person reading it back: a
       * `/loop cek build` bubble says what was asked far better than the
       * paragraph it turned into.
       */
      content: tampilBubble ?? content,
      at: Date.now(),
      attached: attachedAgen,
      images: agentImages.length > 0 ? agentImages : undefined,
      image: agentImages[0],
    };
    const botMsg: ChatMsg = {
      id: nextId('m'),
      role: 'assistant',
      content: '',
      at: Date.now(),
      streaming: true,
      model: get().model,
      /*
       * The reasoning clock starts here, at zero.
       *
       * A `reasoningMs` of 0 is what tells the block's header that reasoning is
       * still open — the first chunk stamps the real start time, and the first
       * answer token stops the clock. Without the sentinel the header would have
       * to guess from the text, and a provider that sends no reasoning at all
       * would still get a duration it never earned.
       */
      reasoningMs: 0,
    };
    set((s) => ({
      sessions: s.sessions.map((x) =>
        x.id === sessionId
          ? {
              ...x,
              title: x.messages.length === 0 ? judulDari(content) : x.title,
              messages: [...x.messages, userMsg, botMsg].slice(-MAX_MSGS),
            }
          : x,
      ),
      // Permukaan yang mengirim saja yang dikosongkan - lihat catatan di
      // jalur chat di atas. Permukaan lain bisa sedang berisi ketikan user.
      drafts: { ...s.drafts, [composerId]: '' },
      draftImages: [],
      toast: null,
      agentSteps: [],
      agentBusy: true,
      agentNavigationOnly: navigationOnly,
      agentPhase: 'thinking',
      agentCurrentTool: null,
      agentStepIndex: 0,
      agentStepLimit: MAX_AGENT_STEPS,
      agentLastProgressAt: Date.now(),
      agentStartedAt: Date.now(),
      agentConfirm: null,
      agentTanya: null,
      agentTodos: [],
      // A new run invalidates any earlier checkpoint: the reader is starting
      // over on purpose, and a stale resume point would silently reappear.
      agentResume: null,
      commandSuggestion: null,
    }));

    /*
     * Start the clock for the finish notification.
     *
     * Recorded here, where `agentBusy` becomes true, so the measured duration is
     * the RUN's and not the time since the window opened. `catatSelesaiRun`
     * compares against it and only notifies past a threshold - a two-second
     * reply does not deserve a toast.
     */
    void import('./notifikasiAi').then((m) => m.catatMulaiRun(activeAgentUiId ?? '')).catch(() => {});
    /*
     * Open this turn's file checkpoint.
     *
     * After the state that marks the run as started, so the write path sees a
     * checkpoint in progress for exactly the window the turn is running. The
     * write path itself only reports "this file is about to change" — it does
     * not need to know the conversation or the message, which is what keeps
     * `tulis` a two-line function.
     */
    void import('./checkpoint').then((m) => m.mulaiTurn(composerId, botMsg.id));
    resetAgentToolCache();
    persist(get());
    agentBatal = false;
    agentStopReason = null;
    resetAutoCompact();

    let def = findModel(get().model, get().provider);
    /*
     * HydraFusion is a PICKER ENTRY, not a hidden switch.
     *
     * When the reader selects it, the stored model is the `hydrafusion`
     * sentinel — a name no provider serves. `findModel` would otherwise hand
     * that string to the provider and every request would 404. Resolving it to
     * the reader's configured model here keeps the sentinel purely a routing
     * signal: HydraFusion still needs a real fallback model for plans that
     * cannot run, and `def` is exactly that fallback everywhere below.
     *
     * `hydraAktif` is the single answer to "does HydraFusion route this turn?"
     * and it is read from the SELECTION, never from `settings.hydrafusion.enabled`.
     * The old flag-based gate is what made HydraFusion engage on its own for
     * readers who never picked it.
     */
    const hydraAktif = pilihHydra(get().model);
    if (hydraAktif) {
      const s2 = useStore.getState().settings.models;
      def = findModel(
        (s2.providers[s2.activeProvider] ?? {}).model ?? get().model,
        s2.activeProvider,
      );
    }
    const cfg = useStore.getState().settings.models.providers[def.provider] ?? {};

    const history: AgentMsg[] = [];
    // A resume reuses the checkpointed history verbatim (finished tool results
    // included): that is the whole point — the model continues after the last
    // completed step instead of redoing finished work. Fresh runs build the
    // history from the visible session as before.
    const checkpoint = get().agentResume;
    let langkahAwal = 0;
    if (checkpoint && checkpoint.teks === content) {
      history.push(...checkpoint.history);
      langkahAwal = checkpoint.langkah;
      set({ agentResume: null });
    }
    /*
     * Riwayat percakapan sebelumnya dibawa HANYA sebatas giliran terakhir, dan
     * hanya kalau memang giliran yang BERBEDA.
     *
     * Sebelumnya SELURUH pesan sesi disalin, dan itu merusak dua hal sekaligus.
     * Bukti dari payload nyata yang ditolak gateway:
     *
     *   isi tiap pesan:
     *     1. user "Baca 3 berkas ini di D:/Talos: index.html..."   <- tugas LAMA
     *     2. assistant(x1) "I'll plan this and create the three files."
     *     3. user "Buat website company profile kecil di folder..."  <- tugas BARU
     *     4. user "Buat website company profile kecil di folder..."
     *     ...  (tujuh salinan tugas baru)
     *     10. assistant(x1) ""
     *     11. tool "Daftar tugas diperbarui..."
     *
     * Dua kerusakan terlihat di situ:
     *
     *   a. Pesan tugas yang SAMA muncul tujuh kali. Setiap run menambahkan satu
     *      salinan ke daftar pesan sesi, dan run berikutnya menyalin semuanya -
     *      jadi pertumbuhannya berlipat, bukan bertambah satu.
     *
     *   b. Giliran lama menyempil di antara asisten yang meminta tool dan hasil
     *      tool-nya. Indeks 2 meminta sebuah tool, dan hasilnya baru muncul di
     *      indeks 11 - delapan pesan `user` di antaranya. Bagi gateway
     *      OpenAI-compatible itu graf yang tidak sah.
     *
     * Batasnya sekarang GILIRAN TERAKHIR yang muat (40 pesan ≈ 20 giliran),
     * bukan dua pesan: tugas yang diset tiga pesan lalu dulu hilang tanpa jejak.
     * Ukuran tetap dijaga `ringkasRiwayat` pada salinan yang dikirim, dan
     * `capUntukPesan` sekarang realistis (lihat contextBudget.ts), jadi riwayat
     * panjang tidak lagi memaksa jalur potong-terakhir menyala tiap giliran.
     *
     * Ditambah satu saringan: pesan yang bunyinya SAMA dengan perintah yang baru
     * saja diketik dibuang. Percobaan ulang meninggalkan pesan user sebelumnya
     * di sesi, dan tanpa saringan ini tugas yang identik terkirim dua kali -
     * yang bukan hanya boros, tapi juga menyesatkan model agar mengerjakan
     * pekerjaan yang sama dua kali.
     */
    const prevSemua = (get().activeSession()?.messages ?? []).filter(
      (m) =>
        !m.error &&
        (m.content.trim() || m.images?.length || m.image) &&
        m.id !== botMsg.id &&
        !(m.role === 'user' && m.content.trim() === (tampilBubble ?? content).trim()),
    );
    /*
     * Window: the last turns, not the last two MESSAGES.
     *
     * `slice(-2)` was one user turn plus one assistant turn, and it silently
     * dropped anything asked earlier: a task set three messages ago simply did
     * not reach the model, with nothing on screen saying so. The window is
     * wider now and SIZE is what bounds it — `ringkasRiwayat` trims the outgoing
     * copy to `capUntukPesan` and protects the newest turn, so a long history
     * costs nothing until it actually does not fit.
     *
     * Images travel with the turn that carried them (see the push below): a
     * window that drops them would reintroduce the "model cannot see the image"
     * bug through the back door.
     */
    const prev = prevSemua.slice(-40);
    for (const m of prev) {
      if (m.role === 'user' || m.role === 'assistant') {
        const banyak = m.images?.length ? m.images : m.image ? [m.image] : [];
        history.push({
          role: m.role,
          content: m.content,
          ...(banyak.length ? { images: banyak } : {}),
        });
      }
    }
    const bhsJawab = useStore.getState().settings.models.answerLang ?? 'follow';
    const gayaJawab = useStore.getState().settings.models.answerStyle ?? 'short';
    {
      // Context assembly is outside the provider loop, but a failed context
      // lookup must still leave the agent in a clean, runnable state.
      try {
        const [ekstra, aturan, memori] = await Promise.all([konteksAgent(), aturanProyek(), konteksMemoriProyek(), segarkanPotretKeadaan()]);
        const ai = get();
        /* Memori proyek `.zephyr-context.md` disatukan dengan aturan sebagai
           konteks berdiri: ia rencana + status lintas-sesi, bukan instruksi
           sekali pakai. Ditaruh setelah aturan supaya terbaca sebagai "di mana
           kita sekarang", bukan "aturannya apa". */
        const aturanGabung = memori ? `${aturan}\n\n${memori}`.trim() : aturan;
        history.unshift({
          role: 'system',
          /*
           * Jalur agen memakai argumen `kueri` yang SAMA dengan jalur chat:
           * pesan user giliran ini (`content`), bukan teks lampiran. Dari sini
           * `systemPromptFor` menaruh blok bahasa giliran ini di kepala prompt
           * dan menyuntik potongan indeks Zephyr yang cocok - jalur otomatis yang
           * tidak bergantung pada model memanggil `zephyr_self`.
           */
          content: systemPromptFor(bhsJawab, ekstra, aturanGabung, ai.model, ai.provider, gayaJawab, content),
        });
      } catch {
        history.unshift({
          role: 'system',
          content: systemPromptFor(bhsJawab, '', '', get().model, get().provider, gayaJawab, content),
        });
      }
    }

    history.push({
      role: 'user',
      content: payloadAgen + identityReminder(get().model, content),
      ...(agentImages.length ? { images: agentImages } : {}),
    });

    {
      const st2 = useStore.getState();
      const tabAktif = st2.tabs.find((t) => t.id === st2.activeTabId);
      if (tabAktif && tabAktif.path) {
        history.push({
          role: 'user',
          content:
            `[EDITOR CONTEXT] The file the user has open: ${tabAktif.path}` +
            `${tabAktif.unsaved ? ' (unsaved changes in the buffer)' : ''}. ` +
            'When the instruction mentions "this file", "this function", or "here", ' +
            'it means that file. Use read_file for its contents and edit/write_file to change it.',
        });
      }
    }

    /*
     * ── HydraFusion on the AGENT path ────────────────────────────────────────
     *
     * WHY IT ALSO LIVES HERE. The chat branch above (`send`) has its own
     * HydraFusion block, but that branch only runs when the reader sets the mode
     * to `chat`. The app's default is `agent`, and in that mode `send()` hands
     * the turn to `sendAgent()` before reaching its own Hydra block — so with
     * the setting on and the default mode, the reader got no stage strip, no
     * "last route" and no cost cap. Measured, not assumed:
     * `node scripts/cek-hydra-live.mjs` reported "mode saat kirim: agent" and
     * three failures, and a grep of this file showed every Hydra reference
     * sitting above the `sendAgent` call.
     *
     * The two blocks are NOT copies: the chat one is a text-only
     * draft/critique/revise pipeline (`jalankanHydra`), which cannot work here
     * because an agent turn reads files and runs tools — a draft pass with no
     * tools could only narrate. So this path does the thing that IS meaningful
     * for a loop: the plan picks WHICH MODEL runs the turn (the tier), and the
     * ladder is what a provider failure escalates along, up to the cost cap.
     * That is the module's own promise — "the plan, not the picker, chooses the
     * model" — made real on the path the reader actually uses.
     *
     * `hydraRencana` is null whenever the setting is off, and every block below
     * is guarded by it, so switching the setting off restores the old path.
     */
    const hydraSet = bacaPengaturan(useStore.getState().settings.hydrafusion);
    let hydraRencana: ReturnType<typeof rencanaHydra> | null = null;
    if (hydraAktif) {
      const kandidat = kandidatHydra(
        useStore.getState().settings.models.providers,
        (id) => get().hasKey(id),
      );
      hydraRencana = rencanaHydra({
        teks: content,
        kandidat,
        cadangan: { provider: def.provider, model: def.id },
        pengaturan: hydraSet,
        providerSiap: (p) => get().hasKey(p),
      });
      /*
       * Validated routing: a plan that cannot run is reported and dropped, so the
       * turn falls back to the reader's own model with the reason visible instead
       * of spending a request that was always going to fail inside the ladder.
       */
      if (hydraRencana.tolak) {
        set({ hydraTerakhir: null, toast: hydraRencana.tolak });
        hydraRencana = null;
      }
    }
    if (hydraRencana) {
      const mulai = hydraRencana.langkah[0];
      /* Report the plan BEFORE the first request, so a long turn shows what it
         decided instead of going quiet and then printing an answer. */
      set({
        hydraTahap: {
          request: 1,
          total: hydraRencana.langkah.length,
          jalur: hydraRencana.jalur,
          peran: 'draft',
          provider: mulai.provider,
          model: mulai.model,
          catatan: hydraRencana.alasan,
        },
      });
    }
    /* Model actually used by the loop, and the escalations it took — both needed
       after the loop, where the per-step locals are gone. */
    let hydraDipakai = hydraRencana
      ? { provider: hydraRencana.langkah[0].provider, model: hydraRencana.langkah[0].model }
      : { provider: def.provider, model: def.id };
    let hydraEskalasi: string[] = [];
    /* Token usage per leg, so the run can report what it actually cost. */
    const hydraPemakaian: (HydraPemakaian | undefined)[] = [];
    let hydraKritik: string | null = null;
    let hydraPutusan: string | null = null;

    let akhir = '';
    let taskComplete = false;
    let navigationOpened = false;
    /*
     * Riwayat per langkah, terpisah dari `history`.
     *
     * Inilah yang dipakai untuk MEMBENTUK permintaan ke provider. `history`
     * tetap jadi catatan percakapan (user/assistant/tool) untuk pemadatan dan
     * penyimpanan; daftar ini yang tahu batas tiap langkah asisten, sehingga
     * satu langkah menghasilkan tepat satu pesan asisten - bukan dua entri
     * berurutan dengan teks yang menumpuk.
     */
    const langkahRiwayat: LangkahRiwayat[] = [];
    // A resumed run keeps counting from its checkpoint so the step meter and
    // the max-step guard see the real position, not a fresh zero.
    let langkah = langkahAwal;
    let agentFailure: { category: AgentFailureCategory; message: string } | null = null;
    /* Anti-loop fingerprints; see `catatAksiBerulang` for the why. */
    agenAksiBerulang.clear();
    /* A new run starts with no failed call to compare against. */
    sidikGagalTerakhir = '';
    /* Set once a page actually opened, then counts circling browser calls. */
    let halamanTerbuka = false;
    let browserMuter = 0;
    /* Pages already opened this turn. This is what separates "open a different
       page" (progress) from "open the same page again" (circling). Without it,
       a close/open/read cycle resets both counters every round and runs to
       MAX_AGENT_STEPS. See cekMuterBrowser. */
    const urlBrowserTerbuka: string[] = [];
    /* Sidik jari beberapa panggilan browser TERAKHIR. Yang dihitung muter hanya
       pengulangan di jendela ini - bukan setiap bacaan setelah halaman terbuka
       (lihat cekMuterBrowser). */
    let browserSidikTerakhir: string[] = [];
    /* Consecutive read-only steps with nothing new; see the goal-satisfied guard. */
    let langkahTanpaKemajuan = 0;
    /* A new run starts with no failed call to compare against. */
    sidikGagalTerakhir = '';
    /*
     * URL/kunci kueri yang BELUM PERNAH dibuka pada giliran ini.
     *
     * Guard tanpa-kemajuan menghentikan run RISET yang tidak punya todo_write:
     * membaca web bersifat netral (bukan kemajuan, bukan kemunduran), jadi
     * penghitung hanya maju dari langkah pasif - dan pada run yang memang
     * tujuannya membaca, hitungan itu penuh tanpa pernah ada tulisan yang
     * me-resetnya. Padahal membuka URL BARU adalah mengumpulkan bahan baru,
     * bukan berputar; yang berputar adalah URL YANG SAMA dibuka lagi.
     *
     * Karena itu yang dihitung kemajuan adalah KEBARUAN-nya. Pengulangan URL
     * sama tetap netral, dan watchdog sidik-jari browser (BATAS_BROWSER_MUTER,
     * BATAS_BACA_SAMA) tetap menangkap loop web sungguhan.
     */
    let webUrlBaruDilacak = new Set<string>();
    /*
     * Berkas yang DITULIS agen pada giliran ini.
     *
     * Membaca ulang atau mencari di dalam berkas yang baru saja kamu tulis
     * sendiri bukan kemajuan - isinya adalah keluaranmu sendiri, sudah kamu
     * ketahui. Model mr-vip terbukti menghabiskan 116 dari 120 langkah dengan
     * read_file/grep/Select-String pada tiga berkas yang baru ia tulis, sementara
     * tiga berkas lain di rencananya tak pernah dibuat. Jejak berkas-tertulis ini
     * membuat guard tanpa-kemajuan menghitung pemeriksaan sia-sia itu sebagai
     * diam, sehingga sodokan "lanjut menulis" bisa menembak.
     */
    const berkasDitulisGiliran = new Set<string>();
    const normalPath = (p: unknown): string =>
      String(p ?? '').replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
    const sebutBerkasTertulis = (args: Record<string, unknown>): string | null => {
      const p = args?.path ?? args?.file ?? args?.target;
      return typeof p === 'string' && p.trim() ? normalPath(p) : null;
    };
    /*
     * Berapa kali berturut-turut model berhenti memanggil tool PADAHAL rencana
     * (todo) belum selesai, dan disodok untuk lanjut. Dibatasi supaya model yang
     * benar-benar mandek tidak membuat loop berputar sampai MAX_AGENT_STEPS.
     */
    let lanjutTanpaTool = 0;
    /*
     * Whether the guard has already given the model its one reminder.
     *
     * The guard used to KILL the run the moment the counter hit the limit. That
     * hit healthy work: a model that finished writing files and then read a few
     * of them back to check would be stopped mid-verification, and the run ended
     * looking like a failure even though the files were already on disk. Like
     * opencode/Hermes, give the model one chance to conclude: on the first trip,
     * tell it to stop reading and report, and only stop forcibly if it STILL
     * makes no progress on the next step.
     */
    let sudahDiberiPeringatanTanpaKemajuan = false;
    /*
     * Peringatan sekali untuk guard treadmill BROWSER.
     *
     * Sama alasannya dengan peringatan di atas: guard ini dulu langsung
     * MEMBUNUH run. Itu salah untuk tugas riset - agen yang sudah mengumpulkan
     * datanya (mis. seri kurs dari satu API) lalu mengulang-ulang membaca
     * halaman yang sama akan mati SEBELUM menulis apa pun, jadi pengguna
     * menerima kekosongan padahal datanya sudah lengkap di riwayat. Sekarang
     * peringatan pertama menyuruh BERHENTI membaca lalu MENULIS, dan run baru
     * dihentikan paksa kalau setelah peringatan itu tetap tidak ada kemajuan.
     */
    let sudahDiberiPeringatanBrowserMuter = false;
    /*
     * Jaring pengaman untuk `izin-isi-web-mati` (temuan 2026-10-15).
     *
     * Ketika `izinIsiWeb` mati (itu DEFAULT, lihat `kebijakanIsiWeb.ts:98`),
     * `web_fetch`/`web_search` menolak dengan teks yang berisi
     * "izin-isi-web-mati". Model lalu mengulang fetch dengan argumen lain,
     * ditolak lagi, dan loop itu baru berhenti setelah disodok 20x oleh
     * BATAS_LANJUT_TANPA_TOOL - pengguna melihat "thinking" lama sekali lalu
     * run mati sendiri tanpa penjelasan.
     *
     * Penghitungnya SEKALI PER RUN, bukan per langkah: izin yang mati tidak
     * berubah di tengah run, jadi mengulang percobaan ke-N sama saja dengan
     * percobaan pertama.
     */
    let izinWebMatiPercobaan = 0;
    /*
     * Berapa kali argumen tool rusak BERTURUT-TURUT, tanpa satu pun langkah
     * sukses di antaranya.
     *
     * Jalur nudge dulu dijaga `langkah > 0`: argumen rusak di langkah PERTAMA
     * dianggap "belum ada kerja nyata" lalu `throw`, jadi run mati merah tepat
     * pada langkah pertama - persis yang dilaporkan pengguna, bubble merah
     * membunuh run padahal model baru saja mulai. Kondisi itu dibuang; sebagai
     * gantinya penghitung inilah yang menjaga agar nudge tidak memutar tanpa
     * batas: dua sodokan diberikan, langkah ketiga yang masih rusak baru
     * dilempar (BATAS_ARGUMEN_RUSAK_BERTURUT).
     *
     * Penghitungnya BERTURUT-TURUT, bukan kumulatif: satu langkah sukses
     * mengembalikannya ke nol, karena model yang kembali menulis JSON benar
     * sudah membuktikan dirinya membaik.
     */
    let argumenRusakBerturut = 0;
/* Automatic resumes used by THIS run; see AUTO_LANJUT_MAKS. */
let autoLanjut = 0;
    /*
     * A(i)/A(iv): keadaan yang hanya perlu dihitung SEKALI per run.
     *
     * Tugasnya dibekukan di sini, bukan dibaca ulang tiap langkah: yang
     * menentukan subset alat adalah permintaan user, dan itu tidak berubah di
     * tengah run. `beratRun` memutuskan gerbang rencana; lihat `subsetAlat.ts`
     * untuk batasnya.
     */
    const tugasRun = content;
    /*
     * LAMA-a4: tugas berat WAJIB merancang lebih dulu. `tugasBerat` (heuristik
     * lama di `subsetAlat`) menuntut teksnya panjang/berdaftar/majemuk; kata
     * perintah tunggal yang jelas berat - "perbaiki bug di src/lib/a.ts",
     * "migrasi berkas config" - lolos dari situ dan langsung menulis tanpa
     * rencana. `wajibTodo` menutup celah itu dengan daftar kata yang bisa
     * dibaca (`KATA_BERAT`), dan hasilnya adalah OR: tugas yang dulu berat
     * tetap berat, tidak ada yang jadi lebih ringan.
     */
    const beratRun = tugasBerat(tugasRun) || wajibTodo(tugasRun);
    /* D: kerangka `.zephyr-context.md` dibuat SEBELUM langkah pertama, jadi
       catatan konteks tidak lagi bergantung pada model ingat membuatnya. */
    const wsRun = useStore.getState().workspace;
    await siapkanKonteksKerja(wsRun, tugasRun);
    try {
      for (; langkah < MAX_AGENT_STEPS; langkah++) {
        if (agentBatal) break;
        /*
         * HydraFusion decides the model for THIS step. `activeDef` starts from
         * the plan's first rung instead of the reader's picked model, and the
         * escalation below walks the plan's ladder rather than the static
         * `MODEL_FALLBACK` catalogue — that is what makes the setting mean
         * something on the agent path.
         */
        const hydraRung = hydraRencana
          ? (hydraRencana.tangga.find(
              (l) => l.provider === hydraDipakai.provider && l.model === hydraDipakai.model,
            ) ?? hydraRencana.langkah[0])
          : null;
        const defLangkah = hydraRung ? findModel(hydraRung.model, hydraRung.provider) : def;
        set((s) => ({
          agentSteps: [...s.agentSteps, { kind: 'mulai', at: Date.now() }],

          sessions: s.sessions.map((x) =>
            x.id === sessionId
              ? {
                  ...x,
                  messages: x.messages.map((m) =>
                    m.id === botMsg.id && m.content.trim()
                      ? { ...m, content: `${m.content}\n\n` }
                      : m,
                  ),
                }
              : x,
          ),
        }));

        agentWatchdogArm();
        agentNoProgressArm();
        agentHardLimitArm();

        /*
         * C: pesan yang diketik SEMENTARA run berjalan.
         *
         * Composer sudah menerima pesan itu sejak lama - ia diparkir di
         * `antrian` - tetapi antrian baru dibaca setelah run SELESAI, jadi
         * "tunggu dulu" adalah satu-satunya jawaban yang mungkin. Pada run
         * berat 20 menit artinya praktis tidak bisa mengetik apa pun.
         *
         * Di sini antrian diambil di AWAL setiap langkah: pesannya muncul di
         * transkrip supaya yang mengetik melihatnya benar-benar masuk, dan
         * diteruskan ke model sebagai giliran user biasa - jadi koreksi yang
         * datang di menit kedua masih terpakai, bukan menunggu run kelar.
         *
         * Kenapa di awal langkah, bukan di tengah: pada titik ini `history`
         * berakhir dengan hasil tool langkah sebelumnya, dan giliran user
         * SETELAH hasil tool aman bagi provider. Kebalikannya - user
         * diselipkan di antara `assistant` yang meminta tool dan hasil
         * tool-nya - yang memicu 400 (lihat catatan `catatanStatus`).
         */
        {
          const kunciComposer = COMPOSER_AKTIF;
          const antriComposer = get().antrians[kunciComposer] ?? [];
          /*
           * Satu baris bisa ada di DUA daftar sekaligus: aksi antrean lain (dan
           * jalur pesan-selagi-sibuk di `send`) mencerminkan daftar per-composer ke
           * `antrian` untuk permukaan utama, jadi referensi objeknya sama. Tanpa
           * penyaringan di sini satu pesan bisa disuntikkan dua kali ke riwayat yang
           * sama. Disaring lewat identitas objek, karena itulah yang sama persis
           * saat dicerminkan.
           */
          const dipakai = new Set<AntrianPesan>();
          const antri: AntrianPesan[] = [];
          for (const a of [...get().antrian, ...antriComposer]) {
            if (dipakai.has(a)) continue;
            dipakai.add(a);
            antri.push(a);
          }
          if (antri.length > 0) {
            set((s) => ({
              antrian: [],
              antrians: { ...s.antrians, [kunciComposer]: [] },
            }));
            for (const a of antri) {
              const gambar = a.images && a.images.length > 0 ? a.images : undefined;
              set((s) => ({
                sessions: s.sessions.map((x) =>
                  x.id === sessionId
                    ? {
                        ...x,
                        messages: [
                          ...x.messages,
                          {
                            id: nextId('m'),
                            role: 'user' as const,
                            content: a.teks,
                            at: Date.now(),
                            images: gambar,
                          },
                        ].slice(-MAX_MSGS),
                      }
                    : x,
                ),
              }));
            }
            /*
             * LANE ANTREAN-LIVE (item C): yang masuk `history` di sini bukan teks
             * apa adanya, melainkan GILIRAN yang disusun `suntikKonteks.ts`
             * (`giliranAntreanKeRiwayat` -> `susunGiliran`): antrean -> tugas ->
             * permintaan, urutannya tetap konteks -> riwayat -> antrean -> tugas ->
             * permintaan, rahasia disensor, dan blok wajib (pekerjaan yang belum
             * selesai) tidak pernah dipotong. Siapa yang diproses diambil dari
             * `antreanPesan.giliranSelesaiPanel` (kepala antrean LANGSUNG diproses,
             * sisanya tetap menunggu) - aturan yang sama yang diuji
             * `scripts/uji-antrean-pesan.mjs`, tidak disalin ke berkas ini.
             *
             * Transkrip di atas tetap memuat SETIAP pesan apa adanya, satu kali;
             * giliran ini menambahkan pekerjaan yang belum selesai, bukan salinan
             * percakapan (konteks/riwayat sudah ada di `history`).
             */
            const giliran = suntikGiliranAntrean(antri, history, get().agentTodos);
            if (giliran.kepala === null) {
              // Hanya mungkin kalau baris antrean tidak punya teks sama sekali, dan
              // itu memang bisa terjadi pada baris bergambar. Dilaporkan, bukan
              // didiamkan: pesan yang hilang tanpa jejak itu keluhan aslinya.
              set({ toast: tx('A queued row had no text, so no turn was injected from it') });
            }
          }
        }

        /*
         * Approaching the step cap: ask for a hand-off instead of cutting off.
         *
         * When the loop hits MAX_AGENT_STEPS it used to just fail with "step
         * limit reached" - the user got a dead run with no idea what had been
         * done or what was left. opencode/Hermes inject a "summarize now" turn
         * before the cap: tools are effectively out, and the model must report
         * what it finished, what is unfinished, and what to do next. That turns
         * a hard stop into a useful hand-off. It is injected once, on the last
         * step, and only if the model has not already wrapped up.
         */
        if (langkah === MAX_AGENT_STEPS - 1 && !agentBatal) {
          history.push({
            role: 'user',
            content:
              'You are at the step limit for this run. Do NOT call any more tools. ' +
              'Write the hand-off now: what you completed, what is still unfinished, and ' +
              'the concrete next step someone should take. Be specific (files, commands).',
          });
        }
        /*
         * Automatic context compaction — the call site.
         *
         * This runs immediately before every step is sent to the provider, so
         * the estimate reflects exactly what is about to leave. It is throttled
         * by AUTO_COMPACT_COOLDOWN_STEPS: once the window is near the line,
         * compacting on every step would spend more on summaries than it saves.
         * Manual `/compact` is a separate action (compactContext) and is not
         * touched here.
         */
        {
          /*
           * Measure the REAL history, not the trimmed one.
           *
           * This used to read `perkiraanKonteks(ringkasRiwayat(history))`, and
           * that made automatic compaction unreachable. `ringkasRiwayat` caps the
           * list at `PAYLOAD_MAX_CHARS` (40k characters, ~10k tokens), while the
           * threshold below is a fraction of the MODEL's window — hundreds of
           * thousands of tokens. A trimmed figure can never reach a figure that
           * many times larger, so the condition stayed false no matter how long
           * the run got and compaction never fired once.
           *
           * The consequence lands exactly on heavy work: the conversation grows
           * until the request is truncated by `ringkasRiwayat` instead, which
           * silently drops the earliest messages — including the original task —
           * and the run either loses the thread or dies at the step limit. That
           * is the "long jobs just stop" symptom.
           *
           * Compaction must therefore look at what the conversation has actually
           * accumulated. Trimming stays where it is: it is a transport guard for
           * THIS request, not a substitute for summarising the history.
           */
          const dipakai = perkiraanKonteks(history);
          /* The reader's own window wins over the percentage: someone who set
             120k means 120k, not 80% of whatever model is selected. */
          const batas = batasAutoCompact(def.id);
          if (
            dipakai > batas &&
            langkah - autoCompactStep >= AUTO_COMPACT_COOLDOWN_STEPS
          ) {
            const hasil = await padatkanRiwayat(history, {
              provider: def.provider,
              model: def.id,
              baseUrl: cfg.baseUrl || undefined,
              effort: get().reasoningEffort ?? undefined,
            });
            if (hasil) {
              autoCompactStep = langkah;
              history.length = 0;
              history.push(...hasil.history);
              /*
               * Suntik ulang RENCANA setelah ringkasan - inilah yang bikin
               * opencode/Claude bisa kerja berat tanpa kehilangan arah.
               *
               * Auto-compact meringkas 191 pesan jadi satu blok. Model yang
               * ringkasannya bagus pun bisa kehilangan daftar tugas KONKRET yang
               * belum selesai, lalu "baca-baca" sampai guard no-progress
               * mematikannya di tengah - persis yang terjadi pada run toko (16
               * dari 40+ berkas, berhenti bukan karena error tapi karena lupa
               * sisa rencananya). opencode menghindari ini dengan memori
               * terstruktur (`.opencode-context.md`); padanan paling murah di
               * sini adalah menegaskan ulang todo yang BELUM `done` sebagai satu
               * pesan user tepat setelah ringkasan, supaya langkah berikutnya
               * punya daftar kerja yang jelas, bukan sekadar prosa ringkasan.
               */
              const sisaTodoCompact = useAi
                .getState()
                .agentTodos.filter((t) => t.status !== 'done');
              if (sisaTodoCompact.length > 0) {
                const daftar = sisaTodoCompact
                  .map((t) => `- [${t.status === 'in_progress' ? '~' : ' '}] ${t.content}`)
                  .join('\n');
                history.push({
                  role: 'user',
                  content:
                    `Pengingat rencana (bertahan melewati pemadatan konteks). ` +
                    `Masih ada ${sisaTodoCompact.length} tugas yang BELUM selesai:\n${daftar}\n\n` +
                    `Lanjutkan mengerjakan tugas yang belum \`done\` ini satu per satu dengan menulis berkasnya ` +
                    `LANGSUNG. Jangan mengulang pekerjaan yang sudah selesai, dan jangan hanya membaca-baca ` +
                    `berkas yang sudah ada - kerjakan item berikutnya.`,
                });
              }
              /*
               * A(ii): TUGAS ASLINYA juga disuntik ulang, bukan hanya sisa todo.
               *
               * Pemadatan mengganti puluhan pesan awal dengan satu ringkasan
               * buatan model - dan yang paling sering menguap dari ringkasan
               * adalah kalimat permintaan user itu sendiri: syarat isi, nama
               * berkas yang diminta, batasan ("jangan pakai framework"). Sisa
               * todo menjaga URUTAN kerja; kalimat ini menjaga SYARATnya.
               *
               * Yang ditulis adalah teks permintaan apa adanya (dipangkas 800
               * karakter), bukan ringkasan buatan aplikasi: menyaringnya di
               * sini berarti menebak bagian mana yang penting, dan run yang
               * kehilangan satu syarat halus akan menghasilkan berkas yang
               * "sudah jadi" tapi salah.
               */
              history.push({
                role: 'user',
                content:
                  `Tugas asli yang sedang dikerjakan (bertahan melewati pemadatan konteks):\n` +
                  `${tugasRun.replace(/\s+/g, ' ').trim().slice(0, 800)}`,
              });
              /* Bukti untuk harness: apa yang BENAR-BENAR ada di riwayat sesudah
                 pemadatan, bukan apa yang seharusnya ada. `tugasDisuntik` dicek
                 dengan mencari cuplikan kalimat tugas di dalam `history` itu
                 sendiri - kalau blok suntikan di atas suatu saat dipindah atau
                 dibatalkan, jejak ini ikut berubah jadi false, bukan tetap
                 melaporkan "berhasil". */
              {
                const cuplik = tugasRun.replace(/\s+/g, ' ').trim().slice(0, 60);
                jejakPemadatan.push({
                  langkah,
                  sebelum: hasil.sebelum,
                  sesudah: hasil.sesudah,
                  diringkas: hasil.diringkas,
                  tugasDisuntik: history.some((m) => String(m.content ?? '').includes(cuplik)),
                  tugasAsli: cuplik,
                  sisaTodo: sisaTodoCompact.length,
                });
              }
              /*
               * `langkahRiwayat` MUST be dropped in step with `history`.
               *
               * The wire body is built by walking `history` for POSITION and
               * `langkahRiwayat` for CONTENT (they are zipped by assistant
               * count - see the `pesanMentah` loop). Compaction removes messages
               * from `history`, so the two lists stop describing the same
               * conversation: the Nth assistant in `history` no longer matches
               * the Nth entry in `langkahRiwayat`, and each step then carries
               * another step's tool calls and reasoning.
               *
               * The result is a request whose tool calls do not line up with
               * their results - 400, permanently, on a conversation that was
               * working a moment earlier. It only ever appeared on LONG runs,
               * because that is the only time compaction fires.
               *
               * Clearing it is correct rather than merely safe: every step in
               * `langkahRiwayat` belongs to messages the summary just replaced,
               * and steps from here on are appended fresh as the run proceeds.
               */
              langkahRiwayat.length = 0;
              const hemat = Math.max(0, hasil.sebelum - hasil.sesudah);
              const notis: ChatMsg = {
                id: nextId('m'),
                role: 'assistant',
                content:
                  `[Konteks dipadatkan otomatis: ${hasil.diringkas} pesan lama diringkas menjadi satu ringkasan, ` +
                  `±${hemat.toLocaleString('id-ID')} token dibebaskan. Jika butuh detailnya, jalankan ulang tool terkait.]`,
                at: Date.now(),
              };
              set((s) => ({
                toast: tf('Context auto-compacted: {n} messages summarized', { n: hasil.diringkas }),
                sessions: s.sessions.map((x) => {
                  if (x.id !== sessionId) return x;
                  /*
                   * Put the notice just before the streaming answer, not after:
                   * the note describes history that came earlier, so it reads
                   * above the reply it helped make room for.
                   */
                  const idx = x.messages.findIndex((m) => m.id === botMsg.id);
                  const at = idx >= 0 ? idx : x.messages.length;
                  const msgs = [...x.messages.slice(0, at), notis, ...x.messages.slice(at)];
                  return { ...x, messages: msgs.slice(-MAX_MSGS) };
                }),
              }));
              persist(get());
            } else {
              /*
               * Jaring pengaman LAMA-a2 - TANPA panggilan model.
               *
               * `padatkanRiwayat` mengembalikan null ketika panggilan modelnya
               * GAGAL (jaringan, kuota, provider menolak) maupun ketika tidak ada
               * bahan. Sebelum ini riwayat dibiarkan utuh apa adanya, dan siklus
               * berikutnya mencoba lagi - sambil tetap di atas ambang. Yang
               * menutup celah itu bukan percobaan berikutnya, melainkan
               * `ringkasRiwayat` (pemangkas transport, jalan SESUDAH blok ini):
               * ia memotong pesan paling AWAL, jadi tugas asli dan sisa rencana
               * bisa hilang tanpa ada yang menyadarinya.
               *
               * `padatkanRiwayatMurni` tidak butuh model, jadi ia selalu bisa
               * jalan. Ia membatalkan dirinya kalau hasilnya tidak lebih kecil
               * (`dipadatkan: false`), jadi percobaan ini tidak pernah
               * memperburuk keadaan - dan item tugas yang belum selesai DIJAMIN
               * ada: dikutip verbatim di catatan DAN dikirim lagi sebagai pesan
               * penjaga di depan ekor riwayat.
               */
              const murni = padatkanRiwayatMurni(history, {
                todos: useAi.getState().agentTodos,
                batasToken: batas,
              });
              if (murni.dipadatkan) {
                autoCompactStep = langkah;
                history.length = 0;
                history.push(...murni.history);
                /* Sama alasannya dengan jalur model di atas: `langkahRiwayat`
                   zipped dengan `history` lewat jumlah asisten, jadi ia harus
                   dikosongkan bersamaan. */
                langkahRiwayat.length = 0;
                const hemat = Math.max(0, murni.sebelum - murni.sesudah);
                const notis: ChatMsg = {
                  id: nextId('m'),
                  role: 'assistant',
                  content:
                    `[Konteks dipadatkan otomatis (tanpa model): ${murni.diringkas} pesan lama diringkas menjadi satu catatan, ` +
                    `±${hemat.toLocaleString('id-ID')} token dibebaskan, ${murni.tugasBelum.length} tugas belum selesai dipertahankan. ` +
                    `Jika butuh detailnya, jalankan ulang tool terkait.]`,
                  at: Date.now(),
                };
                set((s) => ({
                  toast: tf('Context auto-compacted (no model): {n} messages summarized', { n: murni.diringkas }),
                  sessions: s.sessions.map((x) => {
                    if (x.id !== sessionId) return x;
                    const idx = x.messages.findIndex((m) => m.id === botMsg.id);
                    const at = idx >= 0 ? idx : x.messages.length;
                    const msgs = [...x.messages.slice(0, at), notis, ...x.messages.slice(at)];
                    return { ...x, messages: msgs.slice(-MAX_MSGS) };
                  }),
                }));
                {
                  const cuplik = (murni.tugasBelum[0] ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
                  jejakPemadatan.push({
                    langkah,
                    sebelum: murni.sebelum,
                    sesudah: murni.sesudah,
                    diringkas: murni.diringkas,
                    tugasDisuntik:
                      cuplik.length > 0 && history.some((m) => String(m.content ?? '').includes(cuplik)),
                    tugasAsli: cuplik,
                    sisaTodo: murni.tugasBelum.length,
                  });
                }
                persist(get());
              }
            }
            /*
             * No fallback to the stub here: if `padatkanRiwayat` returns null
             * the model call failed or there was nothing to summarize, and
             * silently rewriting the history into the old marker would hide a
             * real failure. `ringkasRiwayat` below still keeps the request
             * inside the window, so a failed summary degrades gracefully.
             */
          }
        }
        /*
         * Catatan status pekerjaan TIDAK disisipkan ke `history`.
         *
         * Dulu ia di-push sebagai pesan `user` tepat sebelum tiap langkah, dan
         * itu merusak bentuk percakapan. Pelanggarannya terlihat di payload
         * nyata yang ditolak gateway:
         *
         *   urutan peran: system -> user -> assistant -> user -> user -> user
         *                 -> user -> user -> assistant -> tool -> ...
         *   masalah: tool call di indeks 2 tanpa hasil tool
         *
         * Asisten di indeks 2 meminta sebuah tool, dan hasil tool untuknya baru
         * muncul setelah lima pesan `user`. Bagi gateway OpenAI-compatible itu
         * graf yang tidak sah: hasil tool wajib menjadi pesan BERIKUTNYA setelah
         * asisten yang memintanya. Karena bentuknya dilanggar, gateway menolak
         * dengan 400 - dan 400 itu lalu muncul sebagai "malformed JSON" pada
         * langkah berikutnya.
         *
         * Isinya tidak dihapus, hanya dipindahkan: catatan status dibawa sebagai
         * bagian dari langkah lanjutan (lihat `pesan.status`), sehingga ia tetap
         * sampai ke model tanpa menyelip di antara pasangan tool.
         */
        get().setAgentProgress({ agentPhase: 'thinking', agentCurrentTool: null, agentStepIndex: langkah + 1, agentStepLimit: MAX_AGENT_STEPS });
        let res: AgentStepResult;
        let faseTungguPulih = 0;
        let koreksiArgumenTool = false;
        /*
         * Extra output-token headroom for THIS step, added when a tool call was
         * cut off at the ceiling. A write of a big file is sent as a tool
         * argument, so one modest `maxOut` can truncate it; retrying with the
         * same budget would truncate again. Bumping it only for the retrying
         * step (not the whole run) keeps normal steps cheap while letting the
         * one oversized write through.
         */
        let tokenTambahan = 0;
        /*
         * Active model definition for this step, mutable so a provider failure
         * can switch to a fallback model without losing the run.
         */
        let activeDef = defLangkah;
        let activeCfg = hydraRung
          ? useStore.getState().settings.models.providers[hydraRung.provider] ?? {}
          : cfg;
        let sudahFallback = false;
        for (let retry = 0; ; retry++) {
          /*
           * PLAFON ANGGARAN MENIT: menunggu jatah, bukan menolak kirim.
           * `false` = user menekan Stop saat menunggu; keluar sebagai batal.
           */
          if (!(await jagaJendela(activeDef.provider))) {
            res = { content: '', toolCalls: [], cancelled: true };
            break;
          }
          const kunciPercobaan = activeDef.provider;
          catatPercobaan(kunciPercobaan);
          /*
           * Jejak untuk pesan akhir: model + provider yang dipakai, dan
           * berapa kali percobaan dikirim ulang untuk putaran ini.
           */
          jejakPercobaan += 1;
          {
            const label = `${activeDef.id} via ${activeDef.provider}`;
            if (!jejakKandidat.includes(label)) jejakKandidat.push(label);
          }
          res = await new Promise<AgentStepResult>((resolve) => {
            const attemptId = nextId(`attempt-${botMsg.id}`);
            /*
             * A retry starts the answer over, so the partial answer the FAILED
             * attempt already wrote has to go first.
             *
             * The guards above stop the old attempt's late chunks from landing,
             * but they cannot undo what already landed: by the time the provider
             * fails, the bubble holds whatever the dead attempt managed to say -
             * "Hai" - and the retry then writes the full answer from the start
             * on top of it. The reader gets "HaiHai.. Ada Ada yang mau mau",
             * which is the stutter this is fixing. Every chunk is appended to
             * `m.content`, so the only cure is to truncate that text before the
             * new attempt emits its first token.
             *
             * `retry > 0` - a first attempt has nothing to clear, and running
             * this on the happy path would erase the answer of a step that had
             * legitimately produced text before the provider hiccuped.
             */
            /*
             * The dead attempt's partial text is REMOVED from the bubble, not
             * thrown away.
             *
             * Clearing is required - the retry re-sends the same prompt and the
             * provider answers from the start, so surviving text would be
             * duplicated into a stutter ("HaiHai"). But deleting it outright
             * loses work the reader already saw, and on a long answer that read
             * as the reply being cut off and replaced. On a heavy run that
             * retries more than once it looked like the app kept destroying its
             * own output.
             *
             * Keeping it aside costs nothing: the reader still sees the answer
             * that lands, and the discarded attempt is available for diagnosis
             * instead of vanishing.
             */
            if (retry > 0) {
              const terbuang = useAi.getState().sessions
                .find((x) => x.id === sessionId)
                ?.messages.find((m) => m.id === botMsg.id)?.content;
              if (terbuang && terbuang.trim()) {
                catatanPercobaanGagal.set(botMsg.id, terbuang);
              }
              /*
               * Kosongkan JUGA `error`, bukan hanya `content`.
               *
               * Chunk `err` yang retryable (grep argumen rusak, stream terputus)
               * menyetel `m.error` lewat terapkanChunkKeState sebelum retry ini
               * berjalan. Kalau hanya `content` yang dibersihkan, chip merah dari
               * percobaan yang GAGAL tetap menempel sepanjang percobaan baru yang
               * SUKSES - persis "merah nyangkut padahal sudah pulih". Percobaan
               * baru menulis jawabannya dari nol, jadi error lama tidak lagi
               * berlaku dan harus ikut dihapus di sini.
               */
              set((s) => ({
                sessions: s.sessions.map((sess) => ({
                  ...sess,
                  messages: sess.messages.map((m) =>
                    m.id === botMsg.id ? { ...m, content: '', error: undefined } : m,
                  ),
                })),
              }));
            }
            /*
             * Percobaan lama dipensiunkan SEBELUM yang baru dipasang, dan
             * urutan dua baris ini yang menentukan.
             *
             * Percobaan lama dan baru mengirim teks yang sama dari awal - itu
             * memang arti sebuah retry. Keduanya dipetakan ke satu id pesan UI
             * (`activeAgentUiId`), jadi kalau potongan dari percobaan lama masih
             * lolos, awalan jawaban tertulis DUA KALI dan hasilnya terbaca
             * seperti gagap: "PerPeriksa erroriksa error di di ...".
             *
             * Bahayanya ada di sela antara kedua baris. Kalau `activeAgentAttempt`
             * dipasang lebih dulu, potongan lama yang tiba tepat di sela itu
             * lolos DUA penjaga sekaligus: ia bukan lagi id percobaan aktif, tapi
             * juga belum tercatat sebagai pensiun. Sekarang id lama sudah masuk
             * daftar pensiun sebelum percobaan baru ada, sehingga tidak ada satu
             * pun momen ketika potongan lama bisa dianggap sah.
             */
            if (activeAgentAttempt) retiredAgentAttempts.add(activeAgentAttempt);
            activeAgentAttempt = attemptId;
            activeAgentUiId = botMsg.id;
            activeAgentPermukaan = composerId === 'agents' ? 'agents' : 'editor';
            agentStepResolve = resolve;
            /*
             * A(i) subset per tugas + A(iv) gerbang rencana di langkah pertama.
             *
             * Rincian klasifikasinya ada di `subsetAlat.ts` (predikat murni,
             * bisa diuji di Node). Yang diputuskan di sini hanya bagian yang
             * butuh keadaan run: langkah ke-berapa, dan apakah rencana sudah
             * ada. Gerbang hanya menyala pada langkah PERTAMA tugas berat yang
             * rencananya masih kosong - setelah rencana ada, daftar alat penuh
             * kembali seperti biasa.
             */
            const alatAktif = [...useToolGate.getState().aktif];
            /*
             * Tanpa folder terbuka, tool ber-scope folder tidak dikirim sama
             * sekali: ia pasti ditolak backend, dan penolakan itu memakan
             * langkah run (lihat `ALAT_BUTUH_FOLDER`). Chat atau tanya-jawab
             * biasa tetap jalan penuh tanpa workspace.
             */
            const adaFolderRun = useStore.getState().workspace !== null;
            /*
             * The To-Do List switch, per surface, read once per step.
             *
             * The plan gate below asks the model to CALL `todo_write` on the
             * first step of a heavy task. If the reader turned that feature off
             * for this surface, forcing the call would spend a step on a tool
             * that now refuses — so the gate has to follow the switch, not just
             * the task's weight.
             */
            const convRun = useStore.getState().settings.conversation;
            const todoAktifRun =
              composerId === 'agents'
                ? convRun?.todoListSolo === true
                : convRun?.todoListIde === true;
            const tanyaAktifRun =
              composerId === 'agents'
                ? convRun?.questioningSolo === true
                : convRun?.questioningIde === true;
            const gerbangRencana =
              langkah === 0 &&
              beratRun &&
              todoAktifRun &&
              get().agentTodos.length === 0 &&
              gerbangRencanaSiap(alatAktif, adaFolderRun);
            const alatKirim = gerbangRencana
              ? alatRencanaPertama(alatAktif, adaFolderRun)
              : /* LAMA-a1: subset per kelas tugas, selalu <= 20 tool.
                   `pilihToolTugas` memakai aturan yang sama dengan
                   `alatUntukTugas` untuk memutuskan apa yang boleh dibuang
                   (menulis? jaringan? ada folder?), lalu memangkas KEMBAR -
                   `edit` vs `multi_edit` vs `replace_in_files` - supaya
                   himpunan dasar 17
                   tool tidak berubah jadi 23-26. Yang dipangkas TIDAK hilang:
                   `tool_search`/`tool_call` selalu ikut, jadi satu langkah lebih
                   jauh. Bukti kesetaraan kemampuan: scripts/cek-subset-tugas.mjs
                   (keluarga kemampuan sesudah wajib superset sebelum). */
                pilihToolTugas(tugasRun, alatAktif, adaFolderRun);
            /*
             * A switch that is OFF must remove the tool from the WIRE, not just
             * make it refuse.
             *
             * The tool's own guard already refuses when the switch is off, so
             * behaviour is correct either way — but a spec the model can see is
             * an invitation, and a model that calls a refusing tool burns a step
             * learning nothing. Removing it here means the model never sees a
             * capability the reader turned off, which is what the switch claims.
             */
            const alatSaring = alatKirim.filter(
              (n) => (n !== 'ask_user' || tanyaAktifRun) && (n !== 'todo_write' || todoAktifRun),
            );
            catatAlatTerakhir(
              tugasRun,
              langkah,
              beratRun,
              gerbangRencana,
              alatAktif,
              alatSaring,
              adaFolderRun,
            );
            const toolSpecs = agentToolSpecs({ alat: alatSaring });
            /*
             * The tool list rides in every request but is not part of the
             * message history, so a cap measured on messages alone lets the
             * body overshoot by however large the catalogue is. Measuring it
             * here - instead of reserving a fixed number - keeps the cap right
             * when tools are added or switched off, and for every provider:
             * the ceiling follows the actual request rather than a constant
             * that quietly goes stale.
             */
            const reserveTools = ukuranPayload([toolSpecs]) + 2048;
            /*
             * Anggaran riwayat harus menyisihkan BLOK TETAP yang selalu ikut
             * terkirim, bukan cuma katalog tool.
             *
             * `ukuranPayload(pesan)` mengukur PESAN saja, dan pesan itu memuat
             * system prompt plus seluruh riwayat. `capUntukPesan` lama hanya
             * mengurangi katalog tool (`reserveTools`), jadi ia mengandaikan
             * sisa `PAYLOAD_MAX_CHARS - reserveTools` tersedia untuk riwayat.
             * Padahal blok tetap - system prompt + kalimat pasca-potong yang
             * ditempel setelah pemotongan - sudah memakan hampir seluruhnya.
             * Bukti pada beban 44 giliran: blok tetap 23.793 char SUDAH MELEBIHI
             * cap 23.251 char, jadi cap tak pernah tercapai dan yang dikorbankan
             * selalu riwayat, sementara payload di kabel tetap lewat batas.
             *
             * Karena itu cap Untuk pesan dihitung SEBAGAI SATUAN YANG SAMA dengan
             * pengukuran `ringkasUkuran`/`ukuran()`, yaitu system-inclusive:
             *
             *   capUntukPesan = PAYLOAD_MAX_CHARS - reserveTools
             *
             * `reserveTools` menutup katalog tool (bentuk kabel `tools:`), sisanya
             * untuk pesan - dan pesan itu memang mengukur system prompt + riwayat.
             * Dulu `biayaTetap` (system prompt + envelope kalimat) ikut DIKURANGKAN
             * dari cap, padahal system prompt MASIH DIUKUR ulang oleh `ukuran()`;
             * system jadi terhitung dua kali, cap jatuh di bawah system prompt
             * sendiri (20.000 < 24.296) dan tak pernah mungkin tercapai.
             *
             * Anggaran riwayat yang sesungguhnya tetap dicatat jujur di bawah lewat
             * `sisaRiwayat`, bukan disembunyikan dengan diam-diam mengirim payload
             * di atas batas; kelebihan kabel tetap dijaga terpisah oleh A3.
             */
            const biayaTetap =
              ukuranPayload(history.filter((m) => m.role === 'system')) + KALIMAT_PASCA_POTONG_CHARS;
            const sisaRiwayat = PAYLOAD_MAX_CHARS - reserveTools - biayaTetap;
            if (sisaRiwayat < 20_000) {
              console.warn(
                `[aiStore] anggaran riwayat cuma ${sisaRiwayat} char ` +
                  `(PAYLOAD_MAX_CHARS=${PAYLOAD_MAX_CHARS} - reserveTools=${reserveTools} - biayaTetap=${biayaTetap}); ` +
                  'blok tetap (system prompt + kalimat pasca-potong) sudah memakan hampir seluruh anggaran model',
              );
            }
            const capUntukPesan = Math.max(20_000, PAYLOAD_MAX_CHARS - reserveTools);
            /*
             * Build the request from the STEP list, not from `history`.
             *
             * `history` is the conversation record (user turns, tool results,
             * assistant turns) and is what compaction and persistence need. What
             * the provider must receive is that same conversation IN ORDER, with
             * each assistant step written exactly once.
             *
             * The previous version sorted by a partition - all non-assistant
             * messages first, then every assistant appended at the end - and that
             * was wrong in a way that only shows up on the wire. The provider saw
             * a conversation where the user asked something, tools reported
             * results, and only THEN the assistant replied. Against a strict
             * OpenAI-compatible gateway that is an invalid message graph, and the
             * symptom is exactly what was reported live: the stream answers
             * nothing, no toolDone frame ever arrives, and the step promise never
             * resolves - so the bubble stays `streaming: true` and the step meter
             * stays at index 1 with no tool recorded.
             *
             * The fix is to walk `history` in its own order and derive each
             * assistant turn from `langkahRiwayat` at the point it happens, so
             * the wire order matches the order the conversation actually had.
             */
            const pesanMentah: AgentMsg[] = [];
            let langkahAsisten = 0;
            for (const m of history) {
              if (m.role !== 'assistant') {
                pesanMentah.push(m);
                continue;
              }
              /*
               * One assistant turn in `history` = one step in `langkahRiwayat`.
               * The step list is the authority on what was sent (it carries the
               * real toolCalls and reasoning); `history` is the authority on
               * POSITION. Walking them together keeps both.
               */
              const langkah = langkahRiwayat[langkahAsisten];
              langkahAsisten += 1;
              if (langkah) {
                pesanMentah.push({ ...langkah.pesan, role: 'assistant' });
              } else {
                /* History holds an assistant turn with no matching step (only
                   possible for turns written before this run). Keep it as-is
                   rather than dropping text the reader already saw. */
                pesanMentah.push(m);
              }
            }
            const aiPesan = bentukWireRiwayat(pesanMentah);
            /*
             * Pemotongan ukuran berjalan SEBELUM pemeriksaan bentuk terakhir.
             *
             * Urutan ini penting dan dulu salah. `ringkasUkuran` membuang pesan
             * dari depan dan memotong hasil tool menjadi stub - dua-duanya bisa
             * memecah pasangan assistant/tool. Kalau pemeriksaan bentuk berjalan
             * lebih dulu, kerusakan yang baru dibuat oleh pemotongan itu lolos
             * tanpa diperiksa, dan yang terkirim ke provider adalah
             * `assistant(x2) -> tool` - satu tool call tanpa hasil, yang
             * ditolak sebagai 400.
             *
             * Karena itu alurnya: potong dulu, rapikan bentuk sesudah.
             */
            const dipotong = ringkasRiwayat(aiPesan, capUntukPesan);
            const pesan = bentukWireRiwayat(dipotong);
            /*
             * Catatan status pekerjaan ditempel di pesan TERAKHIR, bukan
             * disisipkan sebagai giliran sendiri.
             *
             * Ia harus sampai ke model - daftar tugas dan kemajuan langkah itulah
             * yang menjaga rencana tetap terlihat - tetapi ia TIDAK BOLEH menjadi
             * pesan `user` di antara asisten yang meminta tool dan hasil tool-nya.
             * Pelanggaran itu terbukti dari payload nyata:
             *
             *   urutan peran: ... -> assistant -> user -> user -> user -> ...
             *   masalah: tool call di indeks 2 tanpa hasil tool
             *
             * Menempelkannya di ekor menjaga keduanya: isinya tetap terkirim,
             * dan pasangan assistant/tool tetap bersebelahan.
             */
            {
              const catatanStatus = potongCatatan(
                statusPekerjaan(
                  get().agentTodos,
                  get().agentSteps,
                  langkah + 1,
                  MAX_AGENT_STEPS,
                ),
              );
              const terakhir = pesan[pesan.length - 1];
              if (terakhir && terakhir.role !== 'assistant') {
                pesan[pesan.length - 1] = {
                  ...terakhir,
                  content: `${terakhir.content}\n\n${catatanStatus}`,
                };
              } else {
                pesan.push({ role: 'user', content: catatanStatus });
              }
            }
            if (gerbangRencana) {
              /*
               * Gerbang alat tanpa kalimat penjelas adalah jebakan: model
               * mencoba `write_file` yang tidak ada di daftar, gagal, lalu
               * menghabiskan langkah untuk menebak kenapa. Kalimat ini
               * menyebut apa yang harus dilakukan SEKARANG dan kenapa alat
               * tulis belum ada.
               */
              pesan.push({
                role: 'user',
                content: potongCatatan(
                  'Langkah pertama tugas ini: susun rencananya dulu. Panggil `todo_write` SEKARANG dengan daftar ' +
                    'tugas yang konkret (satu item = satu berkas atau satu langkah nyata yang bisa diperiksa). ' +
                    'Tool penulisan berkas baru muncul di langkah berikutnya, jadi jangan mencoba menulis dulu.',
                ),
              });
            }
            if (koreksiArgumenTool) {
              /*
               * Sebut NAMA tool + POTONGAN argumen yang salah lewat `res.error`
               * (openai.rs kini mencetak cuplikan `raw_args` di kalimat malformed).
               * Tanpa itu model cuma tahu ada argumen cacat, bukan panggilan mana
               * dan bagian mana yang rusak. Dibungkus `potongCatatan` agar tetap
               * di dalam envelope pasca-potong.
               */
              pesan.push({
                role: 'user',
                content: potongCatatan(
                  `${res.error}. The previous response had invalid tool-call arguments, so no tool was run. ` +
                    'Retry with complete, valid JSON object arguments.',
                ),
              });
            }
             cmd
              .aiToolChatStream({
                id: attemptId,
                provider: activeDef.provider,
                model: activeDef.id,
                messages: pesan,
                tools: toolSpecs,
                baseUrl: activeCfg.baseUrl || undefined,
                maxTokens: (activeDef.maxOut ?? 2048) + tokenTambahan,
                effort: get().reasoningEffort ?? undefined,
                /* Same session id on every step of this run, so the provider
                   keeps one cache for the conversation instead of treating each
                   step as a new, uncached prompt. */
                sessionId: get().activeSession()?.id,
              })
              .catch((e) => {
                if (!agentBatal) agentStopReason = 'provider';
                if (agentStepResolve === resolve) {
                  agentStepResolve = null;
                  resolve({
                    content: '',
                    toolCalls: [],
                    cancelled: false,
                    error: cmd.asZephyrError(e).message,
                  });
                }
              });
          });
          agentWatchdogDisarm();
          agentHardLimitDisarm();
          /*
           * Kuota SUKSES (2xx) dihitung terpisah dari percobaan: 429/5xx
           * memakai plafon percobaan (70), bukan plafon sukses (60).
           */
          if (!res.error) catatSukses(kunciPercobaan);

          // Retry only a failed provider request before any tool call is returned.
          // The history is untouched until the successful response below, so a
          // retry cannot replay a tool or duplicate a local write.
          const bolehRetry =
            !res.cancelled &&
            !agentBatal &&
            res.toolCalls.length === 0 &&
            !!res.error &&
            (isRetryableAgentToolResponseError(res.error) ||
              isRetryableAgentProviderError(res.error));
          const retryableToolResponse =
            !!res.error && isRetryableAgentToolResponseError(res.error);
          /*
           * Retry budget for a malformed/truncated tool call.
           *
           * DULU: malformed dapat SATU percobaan ulang, terpotong dapat dua.
           * Terukur di Fase 5 (421 detik, 70 percobaan kirim, 138 langkah):
           * agen menulis 9 dari 10 berkas, lalu MATI di `write_file` README
           * karena argumen JSON-nya cacat - dan satu percobaan ulang tidak
           * cukup. Penyebabnya bukan model "bodoh", tapi tiga hal yang
           * bertumpuk: (1) berkas besar dikirim sebagai argumen tool, (2) model
           * kadang mengirim JSON yang tidak tertutup, (3) jatah ulangnya habis
           * tepat pada berkas terakhir.
           *
           * Sekarang malformed dapat TIGA, dan setiap percobaan ulang menyertakan
           * cuplikan argumen yang salah (openai.rs) supaya model tahu apa yang
           * harus diperbaiki - bukan menebak. Terpotong tetap dua kali lipat
           * anggaran keluarannya, dan TIDAK memakai jatah yang sama karena
           * masalahnya berbeda (bukan JSON salah, tapi tidak muat).
           */
          const retryLimit = retryableToolResponse
            ? isTruncatedToolResponseError(res.error ?? '')
              ? 2
              : AGENT_MALFORMED_RETRY
            : AGENT_PROVIDER_RETRY_DELAYS.length;
          if (!bolehRetry || retry >= retryLimit) {
            /*
             * Kerja lama tidak boleh mati hanya karena provider down beberapa
             * menit. Dua retry cepat di atas untuk blip sesaat; kalau masih
             * gagal, masuk fase tunggu-pulih: jeda bertingkat (15s, 30s, 60s)
             * dengan status terlihat, lalu coba lagi. Total ~105 detik.
             * Hanya untuk error retryable SEBELUM tool dipanggil - history
             * belum berubah jadi tidak ada yang bisa ter-replay. Setelah 3
             * fase masih gagal, baru mati dengan error jujur. User bisa
             * Stop kapan saja (agentBatal / tungguRetryAgent membatalkan).
             */
            if (
              bolehRetry &&
              !retryableToolResponse &&
              faseTungguPulih < TUNGGU_PULIH_DELAYS.length
            ) {
              const lanjut = await tungguProviderPulihAgent(
                (p) => get().setAgentProgress({ ...p, agentStepIndex: langkah + 1, agentStepLimit: MAX_AGENT_STEPS }),
                res.error!,
                faseTungguPulih,
              );
              faseTungguPulih += 1;
              if (lanjut && !agentBatal) continue;
            }

            /*
             * Retry ladder and wait-recover both exhausted on a RETRYABLE
             * provider error (429/5xx). Before killing the run, try one
             * different model.
             *
             * WHY this is what big apps do and Zephyr did not: they hold a
             * fleet of upstreams and move to another when one coughs. Zephyr
             * had exactly one endpoint, so a single overloaded model ended
             * hours of work even though the SAME account could serve a
             * different model right now.
             *
             * Only for retryable provider errors, and only once per run: a
             * wrong-model or bad-key failure would just fail again on the
             * fallback and waste two round trips. Ordering prefers another
             * model under the SAME provider first (same key, same gateway,
             * only the model changes), then a different provider with a key
             * already configured. Model history is untouched, so no tool call
             * is replayed and no local write is duplicated.
             */
            if (bolehRetry && !retryableToolResponse && !sudahFallback) {
              /*
               * HydraFusion's own ladder comes FIRST when the plan is active.
               *
               * The static catalogue fallback (`pilihModelCadangan`) knows
               * nothing about the plan, so using it here would silently ignore
               * the rungs the reader's setting defines — and on a free-text
               * provider it refuses to switch at all ("the model IS their
               * input"), which is exactly the case HydraFusion exists to serve.
               * The ladder is bounded by the plan's cost cap, and past its last
               * rung the run fails honestly instead of spending more than the
               * reader allowed.
               */
              const idxSekarang = hydraRencana
                ? hydraRencana.tangga.findIndex(
                    (l) => l.provider === activeDef.provider && l.model === activeDef.id,
                  )
                : -1;
              const rungBerikut =
                hydraRencana &&
                idxSekarang >= 0 &&
                idxSekarang + 1 < hydraRencana.tangga.length &&
                hydraEskalasi.length < HYDRA_MAKS_ESKALASI &&
                idxSekarang + 1 < hydraRencana.batasRequest
                  ? hydraRencana.tangga[idxSekarang + 1]
                  : null;
              const cadangan = rungBerikut
                ? {
                    provider: rungBerikut.provider,
                    id: rungBerikut.model,
                    alasan: ` (HydraFusion rung "${rungBerikut.tier}")`,
                  }
                : hydraRencana
                  ? /* Plan active: never step outside its ladder. */
                    null
                  : pilihModelCadangan(
                      activeDef,
                      MODEL_FALLBACK,
                      (p) => useSettingsUi.getState().hasKey(p),
                    );
              if (cadangan) {
                sudahFallback = true;
                if (rungBerikut) {
                  hydraEskalasi.push(
                    `${activeDef.id} failed (${labelRetryAgent(res.error!)}) → ${rungBerikut.model} [${rungBerikut.tier}]`,
                  );
                  hydraDipakai = { provider: rungBerikut.provider, model: rungBerikut.model };
                  set({
                    hydraTahap: {
                      request: Math.min(hydraEskalasi.length + 1, hydraRencana!.batasRequest),
                      total: hydraRencana!.langkah.length,
                      jalur: hydraRencana!.jalur,
                      peran: 'draft',
                      provider: rungBerikut.provider,
                      model: rungBerikut.model,
                      catatan: rungBerikut.kenapa,
                    },
                  });
                }
                // Say the switch out loud: a silent model change would leave
                // the user reading a run that suddenly answers differently
                // with no idea a fallback happened.
                get().setAgentProgress({
                  agentPhase: 'thinking',
                  agentCurrentTool: `${activeDef.id} bermasalah (${labelRetryAgent(res.error!)}) - beralih ke ${cadangan.id}${cadangan.alasan}`,
                  agentStepIndex: langkah + 1,
                  agentStepLimit: MAX_AGENT_STEPS,
                });
                activeDef = findModel(cadangan.id, cadangan.provider);
                activeCfg = useStore.getState().settings.models.providers[cadangan.provider] ?? {};
                if (rungBerikut) {
                  hydraDipakai = { provider: rungBerikut.provider, model: rungBerikut.model };
                }
                /*
                 * Kandidat pengganti dicatat SEBELUM dicoba, bukan sesudah
                 * gagal: pesan akhir yang hanya mencatat kandidat yang sudah
                 * mati menyembunyikan kandidat terakhir yang belum sempat dicoba.
                 */
                {
                  const label = `${activeDef.id} via ${activeDef.provider}`;
                  if (!jejakKandidat.includes(label)) jejakKandidat.push(label);
                }
                if (agentBatal) break;
                continue;
              }
            }
            break;
          }

          koreksiArgumenTool = retryableToolResponse && !isTruncatedToolResponseError(res.error ?? '');
          /*
           * A truncated tool call is not a "write valid JSON" problem — the
           * JSON was fine, it just didn't fit. So instead of nagging the model,
           * give the retrying step real headroom (double the budget, capped) so
           * the same oversized write completes.
           */
          if (retryableToolResponse && isTruncatedToolResponseError(res.error ?? '')) {
            const dasar = (activeDef.maxOut ?? 2048) + tokenTambahan;
            tokenTambahan = Math.min(dasar * 2, 128000) - (activeDef.maxOut ?? 2048);
          }
          const retryNumber = retry + 1;
          get().setAgentProgress({
            agentPhase: 'thinking',
            agentCurrentTool: isTruncatedToolResponseError(res.error ?? '')
              ? 'Keluaran terpotong di batas token — mengulang dengan batas lebih besar'
              : retryableToolResponse
              ? 'Meminta ulang respons karena argumen tool tidak valid'
              : `Mencoba lagi (${retryNumber}/2) karena ${labelRetryAgent(res.error!)}`,
            agentStepIndex: langkah + 1,
            agentStepLimit: MAX_AGENT_STEPS,
          });
          // A failed provider attempt must not carry a read_image payload into
          // the next attempt. Images are scoped to the successful tool step,
          // never to the provider retry boundary.
          clearGambarMenunggu();
          /*
           * A tool-response retry (malformed or truncated args) used to re-ask
           * the provider immediately at 0 ms. That was temuan E2: re-asking the
           * instant a malformed answer arrives hammers the provider before the
           * rejection has even settled, and the fix is a small PAUSE, not the
           * provider's backoff ladder. So that path now waits `JEDA_..._MS`
           * instead of nothing; only a transient PROVIDER error (429/5xx) uses
           * the ladder, whose two delays are indexed by `retry` (0,1). Reading
           * that array for a tool-response retry would be out of bounds past
           * the first.
           */
          if (!(await tungguRetryAgent(retryableToolResponse ? JEDA_ULANG_ARGUMEN_CACAT_MS : AGENT_PROVIDER_RETRY_DELAYS[retry]))) break;
          if (agentBatal) break;
        }
        if (res.cancelled || agentBatal) break;
        if (res.error) {
          /*
           * Argumen tool rusak JANGAN membunuh seluruh run.
           *
           * `res.error` di sini sudah melewati ladder retry di atas. Untuk
           * error PROVIDER (429/5xx/koneksi) melempar memang benar - langkahnya
           * tak bisa diselesaikan. Tapi untuk error RESPONS-TOOL (model menulis
           * JSON argumen yang rusak untuk SATU panggilan, mis. grep) melempar
           * terlalu kejam: terbukti di run Kopi Senja, model sudah menulis 3
           * berkas dengan sukses lalu satu panggilan grep ber-JSON rusak
           * mematikan SELURUH giliran - persis "merah lalu berhenti padahal
           * belum selesai". opencode tidak mati di sini; ia memperlakukan
           * panggilan rusak sebagai satu langkah yang gagal lalu lanjut.
           *
           * Jadi: kalau errornya respons-tool - termasuk di LANGKAH PERTAMA,
           * yang dulu justru dilempar karena `langkah > 0` - catat sebagai hasil
           * tool yang gagal, sodok model untuk membetulkan panggilannya, dan
           * TERUSKAN loop, selama hitungan argumen-rusak BERTURUT-TURUT masih
           * di bawah batas (lihat `argumenRusakBerturut`). History tetap valid
           * karena tidak ada assistant tool-call yang tergantung tanpa hasil -
           * respons yang rusak tak pernah menghasilkan tool call. Error
           * provider sejati tetap dilempar seperti dulu.
           */
          const responsToolRusak = isRetryableAgentToolResponseError(res.error);
          if (responsToolRusak) argumenRusakBerturut += 1;
          /* Batasnya HITUNGAN BERTURUT-TURUT, bukan posisi langkah: rusak di
             langkah pertama kini ikut jalur ini seperti langkah lainnya, dan
             hanya rangkaian tiga kali gagal berturut-turut yang menyerah. */
          if (responsToolRusak && argumenRusakBerturut <= BATAS_ARGUMEN_RUSAK_BERTURUT) {
            set((s) => ({
              agentSteps: [
                ...s.agentSteps,
                {
                  kind: 'tool',
                  name: '(argumen rusak)',
                  args: '{}',
                  result: `Panggilan tool terakhir ber-JSON argumen rusak dan tidak dijalankan: ${res.error}`,
                  ok: false,
                  at: Date.now(),
                },
              ],
            }));
            /*
             * THE RECOVERY ESCALATES, like opencode's.
             *
             * Round 1 asks for valid JSON. Rounds 2+ also tell the model WHY the
             * call probably broke and what to do differently - because "write
             * valid JSON" repeated is not advice, and the failing call is almost
             * always a LARGE file sent as one argument. Saying "split it" is what
             * turns a dead run into a finished file; the same sentence twice is
             * what makes a model re-emit the same broken payload.
             */
            const besarKemungkinan =
              /write_file|multi_edit|replace_in_files/.test(String(res.error ?? '')) ||
              argumenRusakBerturut >= 2;
            history.push({
              role: 'user',
              content:
                `Rincian dari provider: ${res.error}. ` +
                'Panggilan tool terakhirmu punya JSON argumen yang tidak valid, jadi tidak ada tool yang berjalan. ' +
                'Jangan ulangi panggilan yang sama.' +
                (besarKemungkinan
                  ? ' Kalau argumennya besar (isi berkas panjang), JANGAN kirim sebagai satu panggilan raksasa: ' +
                    'tulis berkas itu dengan write_file yang lebih pendek, lalu tambah sisanya dengan multi_edit, ' +
                    'atau tulis beberapa berkas kecil. JSON yang tidak tertutup hampir selalu berarti isinya kepanjangan.'
                  : '') +
                ' Tulis ulang panggilan itu dengan objek JSON argumen yang lengkap dan valid, ' +
                'atau kalau tidak diperlukan, lanjutkan ke langkah berikutnya dari rencanamu.',
            });
            continue;
          }
          throw new Error(res.error);
        }
        /* Langkah ini berakhir TANPA error: rangkaian argumen rusak (kalau ada)
           terputus, jadi hitungannya kembali ke nol sebelum langkah berikutnya. */
        argumenRusakBerturut = 0;

        /*
         * Teks yang sudah dikatakan model di langkah SEBELUMNYA tidak boleh
         * hilang hanya karena langkah berikutnya dibuka tanpa kalimat.
         *
         * `res.content` kosong adalah keadaan yang normal: model yang memanggil
         * tool sering tidak menulis apa pun sebelum panggilan itu, terutama
         * ketika ia melanjutkan rencana yang sudah dijelaskan. Versi lama
         * menimpa `akhir` dengan nilai kosong itu, jadi penjelasan yang keluar
         * di langkah sebelumnya terhapus dari variabel yang dipakai sebagai
         * jawaban akhir.
         *
         * Akibatnya terlihat persis seperti yang dilaporkan: user melihat
         * deretan baris tool berjalan tanpa satu pun kalimat penjelas, lalu
         * giliran berakhir dengan jawaban yang isinya hanya langkah-langkah.
         *
         * Kalimat itu tetap ada di gelembung pesan (tiap potongan teks
         * ditempelkan ke `m.content` saat datang), jadi yang hilang cuma
         * salinannya di sini. Sekarang yang kosong TIDAK menimpa yang sudah
         * ada, sehingga kalimat sebelumnya ikut terbawa ke jawaban akhir.
         */
        if (res.content && res.content.trim()) akhir = res.content;
        /*
         * Token usage for this leg, carried into the run's accounting. `undefined`
         * means the provider did not report it, which is not the same as zero —
         * `jumlahkanPemakaian` skips those rather than counting them as free.
         */
        hydraPemakaian.push(res.usage);

        // A provider may return several speculative actions in one response.
        // Navigation is a single action: keep only its first browser open and
        // discard everything else from that response. For ordinary tasks,
        // suppress repeated opens of the same normalized URL while preserving
        // the order and all non-browser calls.
        /*
         * Setiap tool call yang DIBUANG di sini mengubah bentuk wire, dan
         * langkah yang disimpan ke `langkahRiwayat` harus memakai daftar yang
         * SUDAH disaring - bukan daftar aslinya.
         *
         * Penyebab 400 yang terbukti: model mengirim dua tool call dalam satu
         * balasan (`think` - kini sudah dihapus - dan `create_directory`),
 * penyaring di bawah membuang
         * salah satunya, tetapi `langkahRiwayat` masih menyimpan keduanya.
         * Payload yang terkirim lalu berbunyi:
         *
         *   assistant(x2) "I'll create the three files..."
         *   tool          "[pemikiran tercatat] ..."
         *   masalah: tool call di indeks 3 tanpa hasil tool
         *
         * Satu tool call tidak punya hasil, dan gateway menolak SELURUH body.
         * Karena itu daftar yang dipakai harus satu dan sama: apa yang dikirim
         * ke provider adalah apa yang benar-benar dijalankan.
         */
        const browserOpen = (tc: AgentToolCall) => tc.name === 'browser_open';
        const firstBrowser = res.toolCalls.findIndex(browserOpen);
        let callsToDispatch = res.toolCalls;
        if (navigationOnly && firstBrowser >= 0) {
          callsToDispatch = [res.toolCalls[firstBrowser]];
        } else if (!navigationOnly) {
          const seenBrowserUrls = new Set<string>();
          callsToDispatch = res.toolCalls.filter((tc) => {
            if (!browserOpen(tc)) return true;
            const url = normalizedBrowserUrl((tc.args as Record<string, unknown> | undefined)?.url);
            if (!url || seenBrowserUrls.has(url)) return false;
            seenBrowserUrls.add(url);
            return true;
          });
        }
        /*
         * Nama tool yang tidak dikenal tidak dijalankan, sehingga tidak akan
         * pernah punya hasil. Menyimpannya di `langkahRiwayat` menghasilkan tool
         * call yatim yang sama seperti di atas, jadi ia disaring di sini juga -
         * satu tempat, sebelum wire dan sebelum eksekusi.
         */
        callsToDispatch = callsToDispatch.filter((tc) =>
          AGENT_TOOLS.some((t) => t.spec.name === tc.name),
        );
        /*
         * Carry the turn's reasoning into the history.
         *
         * Dropping it made every step re-derive what it had already worked out,
         * because the next request showed the model its own conclusions with no
         * trace of how it reached them. Providers that expose reasoning expect
         * it back: Anthropic validates the signature on a thinking block, and
         * the OpenAI-compatible gateways accept `reasoning_content` on the
         * assistant turn. Attached only when non-empty — an empty string is not
         * the same as absent, and some routers reject the empty form.
         *
         * The text stored here is ONLY this step's text. The whole-run view is
         * built later from `langkahRiwayat`; appending the accumulated text
         * instead made step n carry n+1 copies of the earlier sentences, which
         * is the shape that pushes a model into repeating the tool it already
         * ran (see `bentukWireRiwayat`).
         */
        history.push({
          role: 'assistant',
          content: res.content,
          toolCalls: callsToDispatch,
          ...(res.reasoning ? { reasoning: res.reasoning } : {}),
          ...(res.reasoningSignature ? { reasoningSignature: res.reasoningSignature } : {}),
        });
        langkahRiwayat.push({
          pesan: {
            role: 'assistant',
            content: res.content,
            toolCalls: callsToDispatch,
            ...(res.reasoning ? { reasoning: res.reasoning } : {}),
            ...(res.reasoningSignature ? { reasoningSignature: res.reasoningSignature } : {}),
          },
          tampil: res.content,
        });
        if (callsToDispatch.length === 0) {
          /*
           * Model berhenti memanggil tool. Itu BELUM TENTU selesai.
           *
           * Inilah penyebab "cuma bikin index.html lalu berhenti" yang
           * dilaporkan: model menulis satu berkas, lalu mengirim satu giliran
           * berisi teks saja (tanpa tool call) - sering sekadar "oke, lanjut ke
           * berikutnya" - dan loop lama langsung `break`, mengakhiri run padahal
           * rencananya (todo_write) masih punya banyak item `pending`. opencode
           * dan Hermes tidak berhenti di sini: selama masih ada tugas yang belum
           * beres, mereka menyodok model untuk meneruskan.
           *
           * Aturannya: kalau ada todo yang BELUM `done`, jangan akhiri. Tempel
           * satu pesan user yang menagih lanjutan dan putar loop sekali lagi.
           * Dibatasi `BATAS_LANJUT_TANPA_TOOL` kali berturut-turut supaya model
           * yang benar-benar tidak mau lanjut (atau salah paham) tidak membuat
           * loop berputar sampai batas langkah - setelah itu dibiarkan selesai
           * dengan jujur, membawa apa pun yang sudah dikerjakannya.
           *
           * Tanpa todo, tidak ada penanda sisa pekerjaan yang bisa dipercaya,
           * jadi perilaku lama dipertahankan: satu giliran tanpa tool call =
           * selesai.
           */
          const sisaTodo = useAi.getState().agentTodos.filter((t) => t.status !== 'done');
          /*
           * A todo whose file ALREADY EXISTS ON DISK is not evidence of work
           * left undone.
           *
           * This is the fix for "the job is done but the agent keeps working".
           * The model writes every file, then forgets to call `todo_write` to
           * mark them done. The plan list stays full, the guard below reads that
           * as unfinished work, and the model is pushed to redo it - up to the
           * nudge limit. The files were already written, so every nudge was
           * wasted.
           *
           * The check is deliberately narrow, the same way `todosBohong` is:
           * only todos whose text NAMES a file that this turn actually wrote are
           * treated as finished. A todo about anything else ("run the tests")
           * still counts as outstanding, because nothing proves otherwise.
           */
          const todoSudahDitulis = (t: { content?: string }): boolean => {
            const calon = String(t.content ?? '').match(
              /[A-Za-z0-9_.\-/\\]+\.(?:md|js|ts|tsx|jsx|json|css|html|py|rs|toml|yml|yaml)/g,
            );
            if (!calon) return false;
            return calon.every(
              (nama) =>
                berkasDitulisGiliran.has(nama) || berkasDitulisGiliran.has(nama.replace(/^\.\//, '')),
            );
          };
          /*
           * Only todos that name a file NOT yet written count as outstanding.
           * A model that answers without calling a tool twice in a row has told
           * us it is done - the limit above is what enforces that, so no extra
           * counter is needed here.
           */
          const sisaTodoNyata = sisaTodo.filter((t) => !todoSudahDitulis(t));
          /*
           * A todo marked `done` is a CLAIM, and claims are checked.
           *
           * Measured in Fase 5: the plan had ten items, all marked done, and
           * `README.md` was never written. The model had marked "Tulis
           * README.md" as done without calling write_file, then reported "eight
           * files written" - and the run ended successfully with 7 files on
           * disk. The reader sees a confident summary and a missing file, which
           * is worse than an honest failure.
           *
           * The check is deliberately narrow: only todos whose text NAMES a file
           * that does not exist are reopened. A todo about anything else ("run
           * the tests") is left alone - this is not a general fact-checker, it
           * is a guard against the specific lie that a file exists.
           */
          const todosBohong: string[] = [];
          for (const t of useAi.getState().agentTodos) {
            if (t.status !== 'done') continue;
            /* Path-looking tokens in the todo text, e.g. `README.md`. */
            const calon = String(t.content ?? '').match(/[A-Za-z0-9_.\-/\\]+\.(?:md|js|ts|tsx|jsx|json|css|html|py|rs|toml|yml|yaml)/g);
            if (!calon) continue;
            for (const nama of calon) {
              const adaDi = berkasDitulisGiliran.has(nama) || berkasDitulisGiliran.has(nama.replace(/^\.\//, ''));
              if (!adaDi) {
                todosBohong.push(t.content);
                break;
              }
            }
          }
          if (todosBohong.length > 0 && lanjutTanpaTool < BATAS_LANJUT_TANPA_TOOL && !agentBatal) {
            /*
             * Reopen them as pending and demand the work. The model cannot
             * finish a run by writing a summary over a file it never created.
             */
            lanjutTanpaTool += 1;
            const daftar = todosBohong.map((c) => `- ${c}`).join('\n');
            history.push({
              role: 'user',
              content:
                `These items are marked done but the file they name was NEVER written this turn:\n${daftar}\n\n` +
                'Write them now with write_file (or multi_edit for an existing file), then mark them done again. ' +
                'A todo is only done when the tool result proves it - not when you intended to do it.',
            });
            set((s) => ({
              agentSteps: [
                ...s.agentSteps,
                {
                  kind: 'tool',
                  name: '(verifikasi todo)',
                  args: '{}',
                  result: `Tugas ditandai selesai padahal berkasnya belum ditulis: ${todosBohong.length} item. Diminta menulis sekarang.`,
                  ok: false,
                  at: Date.now(),
                },
              ],
            }));
            continue;
          }
          if (sisaTodoNyata.length > 0 && lanjutTanpaTool < BATAS_LANJUT_TANPA_TOOL && !agentBatal) {
            lanjutTanpaTool += 1;
            const daftar = sisaTodoNyata
              .map((t) => `- [${t.status === 'in_progress' ? '~' : ' '}] ${t.content}`)
              .join('\n');
            history.push({
              role: 'user',
              content:
                `Rencanamu belum selesai. Masih ada ${sisaTodo.length} tugas yang belum \`done\`:\n` +
                `${daftar}\n\n` +
                'Lanjutkan SEKARANG dengan memanggil tool untuk mengerjakan tugas berikutnya — ' +
                'jangan berhenti dan jangan hanya menjelaskan. Kalau sebuah tugas memang sudah ' +
                'selesai, tandai `done` lewat todo_write. Kalau SEMUA sudah benar-benar selesai, ' +
                'jalankan verifikasi akhir lalu tulis laporan penutup.',
            });
            set((s) => ({
              agentSteps: [
                ...s.agentSteps,
                {
                  kind: 'tool',
                  name: '(lanjut)',
                  args: '{}',
                  result: `Model berhenti padahal ${sisaTodo.length} tugas belum selesai; diminta meneruskan.`,
                  ok: true,
                  at: Date.now(),
                },
              ],
            }));
            continue;
          }
          /*
           * ── HydraFusion: the critique and the revision, on the AGENT path ──
           *
           * The loop just finished the WORK — it read files and called tools. On
           * the `kritik-revisi` route that work is the draft, and the two stages
           * the route is named after had never run here: the plan chose the model
           * and the ladder, and nothing else. So the route announced three stages
           * and executed one. This is where the other two happen.
           *
           * Only when the plan says so (`kritik-revisi`), only with something to
           * review, and never after a cancel. The review is an ISOLATED pass: its
           * own messages, no tools, so the critic cannot change the repository
           * while judging it.
           */
          if (
            hydraRencana &&
            hydraRencana.jalur === 'kritik-revisi' &&
            !agentBatal &&
            akhir.trim().length > 0 &&
            hydraKritik === null
          ) {
            const { kritikus, berbeda } = pilihKritikus(hydraDipakai, hydraRencana.tangga);
            const idKritik = `${HYDRA_ID_PREFIX}agent-kritik-${langkah}`;
            /*
             * Bounded execution, per leg. The provider's own timeout is generous
             * (it has to be: a long answer is not a hang), so a review that never
             * closes would pin the turn. This deadline abandons THAT LEG and
             * keeps the answer the run already produced — a critique is an
             * improvement, never a precondition.
             */
            const mulaiKritik = Date.now();
            const pengawasKritik = window.setTimeout(() => {
              if (legHarusBerhenti(agentBatal, mulaiKritik, BATAS_LEG_MS)) {
                void cmd.aiCancel(idKritik).catch(() => {});
              }
            }, BATAS_LEG_MS + 50);
            set({
              hydraTahap: {
                request: hydraEskalasi.length + 2,
                total: Math.min(hydraRencana.batasRequest, hydraEskalasi.length + 3),
                jalur: 'kritik-revisi',
                peran: 'kritik',
                provider: kritikus.provider,
                model: kritikus.model,
                catatan: berbeda
                  ? 'Independent review by another family.'
                  : 'Review by the same family (no other family on the ladder).',
              },
            });
            try {
              hydraSiapkan(idKritik, false);
              const pk = useStore.getState().settings.models.providers[kritikus.provider] ?? {};
              try {
                await cmd.aiToolChat({
                  provider: kritikus.provider,
                  model: kritikus.model,
                  messages: pesanKritik(content, akhir),
                  tools: [],
                  baseUrl: pk.baseUrl || undefined,
                  maxTokens: findModel(kritikus.model, kritikus.provider).maxOut ?? 2048,
                  effort: get().reasoningEffort ?? undefined,
                  sessionId: get().activeSession()?.id,
                });
              } finally {
                window.clearTimeout(pengawasKritik);
              }
              const b = hydraLihat(idKritik);
              hydraPemakaian.push(b?.usage);
              const teksKritik = (b?.teks ?? '').trim();
              const putusan = bacaPutusanKritik(teksKritik);
              hydraKritik = teksKritik;
              hydraPutusan = putusan;
              hydraEskalasi.push(
                `critique by ${kritikus.model}${berbeda ? '' : ' (same family)'}: ${putusan}`,
              );
              set((s) => ({
                agentSteps: [
                  ...s.agentSteps,
                  {
                    kind: 'tool',
                    name: '(hydra: critique)',
                    args: '{}',
                    result:
                      putusan === 'tak-terbaca'
                        ? 'The reviewer did not return a verdict; the answer stands.'
                        : `Reviewer verdict: ${putusan.toUpperCase()}.`,
                    ok: true,
                    at: Date.now(),
                  },
                ],
              }));
              /*
               * FIX verdict: the drafting model gets the review and produces the
               * final answer. This pass MAY use tools, because a real defect can
               * need a real edit.
               */
              if (putusan === 'fix' && !legHarusBerhenti(agentBatal, Date.now(), BATAS_LEG_MS)) {
                const idRevisi = `${HYDRA_ID_PREFIX}agent-revisi-${langkah}`;
                set({
                  hydraTahap: {
                    request: hydraEskalasi.length + 2,
                    total: Math.min(hydraRencana.batasRequest, hydraEskalasi.length + 3),
                    jalur: 'kritik-revisi',
                    peran: 'revisi',
                    provider: hydraDipakai.provider,
                    model: hydraDipakai.model,
                    catatan: 'Fixing the defects the review found.',
                  },
                });
                hydraSiapkan(idRevisi, false);
                const pd = useStore.getState().settings.models.providers[hydraDipakai.provider] ?? {};
                /* Same per-leg deadline as the critique: bounded, and abandoning
                   it keeps the answer the run already had. */
                const mulaiRevisi = Date.now();
                const pengawasRevisi = window.setTimeout(() => {
                  if (legHarusBerhenti(agentBatal, mulaiRevisi, BATAS_LEG_MS)) {
                    void cmd.aiCancel(idRevisi).catch(() => {});
                  }
                }, BATAS_LEG_MS + 50);
                try {
                  await cmd.aiToolChat({
                    provider: hydraDipakai.provider,
                    model: hydraDipakai.model,
                    messages: pesanRevisi(content, akhir, teksKritik),
                    tools: [],
                    baseUrl: pd.baseUrl || undefined,
                    maxTokens: findModel(hydraDipakai.model, hydraDipakai.provider).maxOut ?? 2048,
                    effort: get().reasoningEffort ?? undefined,
                    sessionId: get().activeSession()?.id,
                  });
                } finally {
                  window.clearTimeout(pengawasRevisi);
                }
                const br = hydraLihat(idRevisi);
                hydraPemakaian.push(br?.usage);
                const teksRevisi = (br?.teks ?? '').trim();
                if (teksRevisi) {
                  akhir = teksRevisi;
                  set((s) => ({
                    agentSteps: [
                      ...s.agentSteps,
                      {
                        kind: 'tool',
                        name: '(hydra: revision)',
                        args: '{}',
                        result: 'The drafting model revised its answer after the review.',
                        ok: true,
                        at: Date.now(),
                      },
                    ],
                  }));
                }
              }
            } catch (e) {
              /* A failed review costs the run its critique, never its answer. */
              const m = cmd.asZephyrError(e).message;
              hydraEskalasi.push(`critique skipped (${m})`);
              hydraKritik = '';
              hydraPutusan = 'gagal';
            } finally {
              hydraLupakan(idKritik);
              set({ hydraTahap: null });
            }
          }
          break;
        }
        /* Giliran yang memanggil tool berarti model masih bekerja: setel ulang
           penghitung sodokan supaya jeda berpikir yang wajar tidak menghabiskan
           jatah lanjutan. */
        lanjutTanpaTool = 0;

        /*
         * Start eligible calls together; dispatch below preserves order and all gates.
         *
         * Writes to DIFFERENT files are independent of each other the same way
         * reads are: two edits on two files cannot conflict, so waiting for
         * the first file's round-trip before starting the second only burns
         * provider time. Same-file writes stay serial (grouped by file below)
         * because order matters there — an edit after a write must see the
         * write. Anything without a single target file (shell, browser, git
         * writes, multi-file refactors) also stays serial.
         */
        const targetBerkas = (tc: AgentToolCall): string | null => {
          if (tc.name !== 'write_file') return null;
          const p = (tc.args as Record<string, unknown> | undefined)?.path;
          return typeof p === 'string' && p.trim() ? p.trim() : null;
        };
        const berkasDipakaiBatch = new Set<string>();
        /*
         * PURE predicate: does this single call MAY be run alongside others?
         *
         * It must not mutate anything - the caller walks the list and needs the
         * same answer on a re-check. The cross-call bookkeeping (which files a
         * batch touches) is applied by the caller after a call is accepted, in
         * the `while` below. The earlier version mutated `berkasDipakaiBatch`
         * inside this function and was called twice per element, so a writer's
         * second check returned `false` for its OWN earlier marking and the
         * batching silently depended on that accident.
         */
        const bolehParalelSendiri = (tc: AgentToolCall): boolean => {
          if (TOOL_BACA_DIPARALELKAN.has(tc.name)) return true;
          if (targetBerkas(tc)) return true; // a writer, gated below by file overlap
          /*
           * Read-only actions of otherwise-mutating tools.
           *
           * These reach the network or the disk but change nothing, so they are
           * safe to run alongside other reads - and a model that asks for
           * `git status` + `git diff` + `notes list` in one turn should not pay
           * for them one after another. This block used to sit BELOW an
           * unconditional `return false`, so it was dead code: the parallel
           * batch only ever contained TOOL_BACA tools.
           */
          const action = String((tc.args as Record<string, unknown> | undefined)?.action ?? '').trim();
          if (tc.name === 'git') return action === 'status' || action === 'diff' || action === 'log' || action === 'branches';
          if (tc.name === 'notes') return action === 'list';
          if (tc.name === 'schedule_command') return action === 'list';
          if (tc.name === 'worktree') return action === 'list';
          return false;
        };
        /*
         * Can `tc` join the batch that already touches `berkasDipakaiBatch`?
         * A read of a file written in the same batch must not race it (it would
         * sometimes read the pre-write content), and two writes to one file must
         * not overlap. This is where the shared file set is consulted, and it is
         * a pure read - the marking happens when the call is accepted.
         */
        const tumpangBerkas = (tc: AgentToolCall): boolean => {
          const baca = tc.name === 'read_file'
            ? (tc.args as Record<string, unknown> | undefined)?.path
            : null;
          if (typeof baca === 'string' && berkasDipakaiBatch.has(baca.trim())) return true;
          const tulis = targetBerkas(tc);
          return !!tulis && berkasDipakaiBatch.has(tulis);
        };
        const tandaiBerkas = (tc: AgentToolCall): void => {
          const f = targetBerkas(tc);
          if (f) berkasDipakaiBatch.add(f);
        };

        const prefetchedReadTools = new Map<string, Promise<string>>();
        for (let i = 0; i < callsToDispatch.length; i++) {
          if (!bolehParalelSendiri(callsToDispatch[i]) || tumpangBerkas(callsToDispatch[i])) continue;
          const batch: AgentToolCall[] = [];
          while (i < callsToDispatch.length) {
            const kandidat = callsToDispatch[i];
            if (!bolehParalelSendiri(kandidat) || tumpangBerkas(kandidat)) break;
            batch.push(kandidat);
            tandaiBerkas(kandidat);
            i += 1;
          }
          const runnable = batch.filter((candidate) =>
            useToolGate.getState().aktif.has(candidate.name) &&
            (get().approvalMode !== 'readonly' || !TOOL_TULIS.has(candidate.name)),
          );
          const settled = Promise.allSettled(
            runnable.map((candidate) => jalankanAgentToolCached(candidate.name, (candidate.args ?? {}) as Record<string, unknown>)),
          );
          for (let j = 0; j < runnable.length; j++) {
            const candidate = runnable[j];
            prefetchedReadTools.set(candidate.id, settled.then((results) => {
              const result = results[j];
              if (result.status === 'rejected') throw result.reason;
              return result.value;
            }));
          }
          i -= 1;
        }

        for (const tc of callsToDispatch) {
          if (agentBatal) break;
          const argsObj = (tc.args ?? {}) as Record<string, unknown>;
          /*
           * Anti-loop watchdog — observe only.
           *
           * The fingerprint is taken from the call AS REQUESTED, before any
           * tool actually runs, and this block never dispatches a tool of its
           * own: it counts and decides, nothing else. Counting the request
           * rather than the result is what catches the expensive failure mode —
           * a model re-issuing a file_read or a subagent on every step — even
           * while a previous identical call is still in flight, and it does so
           * without paying for the call first.
           */
          const hitungAksi = catatAksiBerulang(agenAksiBerulang, tc.name, argsObj);
          if (hitungAksi.hentikan) {
            /*
             * Nothing runs. The refused call is recorded as a tool message so
             * the provider pairing (assistant toolCalls -> tool results) stays
             * valid and the model sees why the loop ended, instead of reading a
             * silent gap as a reason to try again.
             */
            akhir =
              `Stopped: the same action repeated ${hitungAksi.jumlah} times without progress ` +
              `(\`${tc.name}\` ${JSON.stringify(argsObj).slice(0, 120)}). ` +
              'The call was not dispatched. Change the approach or report the blocker ' +
              'to the user instead of retrying.';
            history.push({ role: 'tool', toolCallId: tc.id, name: tc.name, content: akhir });
            set((s) => ({
              agentSteps: [
                ...s.agentSteps,
                { kind: 'tool', name: tc.name, args: JSON.stringify(argsObj), result: akhir.slice(0, 400), ok: false, at: Date.now() },
              ],
            }));
            agentStopReason = 'guard';
            /* Stop the RUN, not just this batch - see the note on the browser
               guard below. A bare `break` leaves the step loop alive and the
               model simply retries the same call on the next step. */
            agentBatal = true;
            break;
          }
          /*
           * Browser treadmill guard — observe only, never dispatches.
           *
           * After a page has already opened this turn, another browser/web call
           * that does not open a DIFFERENT url is circling: the content is
           * already on screen. A fresh `browser_open` with a new URL resets the
           * counter, so legitimate multi-tab work is untouched.
           */
          /*
           * Guard treadmill browser.
           *
           * Setiap pembukaan halaman baru harus diakui sebagai "pembuka
           * baru" di sini - kalau tidak, guard berhenti menghentikan langkah
           * yang membuka tiga alamat berbeda.
           */
          if (halamanTerbuka && TOOL_BROWSER.has(tc.name)) {
            /* `membukaBaru` berarti url yang BELUM pernah dibuka pada giliran
               ini, bukan sekadar url yang tidak kosong - lihat cekMuterBrowser.
               Membuka ulang halaman yang sama tidak lagi dihitung kemajuan,
               dan `browser_close` tidak lagi bisa mereset apa pun karena ia
               masuk lewat fungsi yang sama. */
            const Putaran = cekMuterBrowser(
              halamanTerbuka,
              browserMuter,
              urlBrowserTerbuka,
              tc.name,
              argsObj,
              browserSidikTerakhir,
            );
            browserMuter = Putaran.muter;
            browserSidikTerakhir = Putaran.sidik;
            if (Putaran.berhenti) {
              const sodokBrowser =
                `Peringatan: satu halaman SUDAH terbuka dan ${browserMuter} langkah browser berikutnya tidak ` +
                'menambah apa pun - isinya sudah ada di layar dan di riwayat. JANGAN membaca halaman itu lagi dan ' +
                'jangan mencoba alat pengambilan lain untuk halaman yang sama: pakai data yang SUDAH kamu punya, ' +
                'tulis hasilnya ke berkas hasil SEKARANG (write_file), lalu tutup dengan ringkasan singkat. ' +
                'Hanya kalau memang ada satu halaman LAIN yang belum pernah dibuka dan benar-benar diperlukan, ' +
                'buka url itu sekali lewat browser_open.';
              if (!sudahDiberiPeringatanBrowserMuter) {
                sudahDiberiPeringatanBrowserMuter = true;
                browserMuter = 0;
                browserSidikTerakhir = [];
                history.push({ role: 'tool', toolCallId: tc.id, name: tc.name, content: sodokBrowser });
                set((s) => ({
                  agentSteps: [
                    ...s.agentSteps,
                    { kind: 'tool', name: tc.name, args: JSON.stringify(argsObj), result: sodokBrowser.slice(0, 400), ok: false, at: Date.now() },
                  ],
                }));
                continue;
              }
              akhir =
                `Stopped: a page is already open, and ${browserMuter} further browser steps ` +
                'made no progress. Report what is on screen and stop; do not inspect it again.';
              history.push({ role: 'tool', toolCallId: tc.id, name: tc.name, content: akhir });
              set((s) => ({
                agentSteps: [
                  ...s.agentSteps,
                  { kind: 'tool', name: tc.name, args: JSON.stringify(argsObj), result: akhir.slice(0, 400), ok: false, at: Date.now() },
                ],
              }));
              agentStopReason = 'guard';
              /*
               * END THE RUN, not just this batch.
               *
               * `break` here leaves only the inner `for i` loop over the
               * current batch of tool calls. Control returns to the step loop,
               * which asks the provider for another step - and the model, told
               * only that this one call was stopped, simply tries again. That
               * is the "keeps looping" report: the guard fires on every step
               * and the run never ends, marching to MAX_AGENT_STEPS with the
               * page already on screen the whole time.
               *
               * `agentBatal` is what the step loop actually tests at the top
               * of each iteration, so setting it is what stops the treadmill.
               */
              agentBatal = true;
              break;
            }
          }
          /*
           * Tool yang benar-benar mengubah sesuatu.
           *
           * Dipakai oleh guard di bawah, jadi daftarnya HARUS lengkap: tool yang
           * lupa didaftarkan di sini akan dianggap "tidak melakukan apa-apa",
           * dan pekerjaan nyata bisa dipotong di tengah.
           *
           * Penghitung tanpa-kemajuan diperbarui SETELAH tool berjalan (lihat
           * `catatKemajuanTool` di bawah): memanggil tool penulis bukan bukti
           * kemajuan, karena panggilan yang GAGAL juga sampai ke sini. Terukur di
           * Fase 5: `bash_run` dipanggil berkali-kali dan semuanya gagal, tapi
           * setiap kegagalan mereset penghitung - run berputar 138 langkah tanpa
           * satu pun berkas baru.
           */
          if (TOOL_PENULIS.has(tc.name)) {
            /*
             * Menulis adalah KEMAJUAN NYATA, jadi watchdog aksi-berulang lupa
             * apa yang sudah dilihatnya - persis seperti ketika sebuah todo
             * mencapai `done` (lihat setAgentTodos).
             *
             * Tanpa ini sebuah run yang sehat bisa mati. Bukti dari run NADA:
             * model menulis berkas, lalu `list_directory` untuk memverifikasi,
             * tulis lagi, list lagi - enam kali verifikasi di sepanjang
             * giliran yang benar-benar menulis berkas. Peta sidik jari
             * menghitung keenam `list_directory` identik itu secara kumulatif
             * (ia hanya di-reset saat todo `done`, dan mr-vip tidak selalu
             * memelihara todo), menyentuh BATAS_BACA_SAMA, lalu MEMBUNUH run
             * padahal setiap pembacaan dipisahkan oleh tulisan nyata di antara-
             * nya. Itu treadmill palsu: verifikasi berulang di sela kerja yang
             * produktif, bukan loop yang mandek. Sebuah tulisan membuktikan
             * pembacaan itu bukan kemacetan, jadi hitungannya dilupakan.
             */
            agenAksiBerulang.clear();
            sudahDiberiPeringatanTanpaKemajuan = false;
            /*
             * Cache hasil tool read dibuang begitu sesuatu di disk berubah.
             *
             * Ini bug akar yang terpisah dan lebih merusak. `agentToolCache`
             * menyimpan hasil read-only (`list_directory`, `read_file`, `glob`)
             * dengan TTL tak terhingga dan hanya dibersihkan di AWAL dan AKHIR
             * seluruh run - tidak pernah saat sebuah tulisan terjadi di tengah.
             * Jadi setelah model menulis `jelajah.html` lalu me-`list_directory`
             * folder yang sama, ia menerima DAFTAR LAMA dari sebelum tulisan -
             * berkas barunya tampak hilang. Model menyimpulkan tulisannya gagal,
             * menulis lagi, me-list lagi (cache yang sama, masih hilang), dan
             * begitu seterusnya sampai watchdog aksi-berulang mematikan run.
             * Itulah `list_directory {"depth":"2","path":"D:/Testing/nada"}`
             * yang berhenti setelah enam panggilan identik.
             *
             * Sebuah tulisan membuat setiap pembacaan folder/berkas yang
             * tersimpan jadi basi, jadi cache dikosongkan. Panggilan read
             * berikutnya menyentuh disk sungguhan dan melihat tulisan tadi.
             */
            agentToolCache.clear();
            /* Catat berkas yang baru ditulis supaya pembacaan/pencarian ulang
               atasnya di langkah berikutnya terhitung sebagai bukan-kemajuan. */
            const ditulis = sebutBerkasTertulis(argsObj);
            if (ditulis) berkasDitulisGiliran.add(ditulis);
          } else if (TOOL_BACA_SET.has(tc.name) || TOOL_NET_SET.has(tc.name)) {
            /*
             * A read - of disk or of the web - is real work, not idleness.
             *
             * It must not RESET the counter (only a change proves forward
             * progress), but it must not ADVANCE it either. Advancing it is
             * what killed legitimate work: a research run that reads five
             * pages/search results in a row counted as "no progress" and was
             * stopped at four, mid-investigation. Reading is how the agent
             * gathers what it needs before it writes; only a run that reads
             * the SAME thing repeatedly (the identical-action watchdog) is a
             * loop, and that guard still fires.
             *
             * SATU pengecualian: membaca kembali berkas yang BARU DITULIS pada
             * giliran ini. Itu bukan mengumpulkan bahan - isinya keluaranmu
             * sendiri - dan terbukti jadi cara mr-vip memboroskan 116 dari 120
             * langkah (read_file/grep pada berkas yang baru ia tulis) sampai
             * rencananya tak pernah tuntas. Pembacaan seperti itu dihitung
             * sebagai diam, jadi guard tanpa-kemajuan menyodoknya kembali menulis.
             */
            const sasaran = sebutBerkasTertulis(argsObj);
            if (sasaran && berkasDitulisGiliran.has(sasaran)) {
              langkahTanpaKemajuan += 1;
            } else if (tc.name === 'web_fetch' || tc.name === 'web_search') {
              /* Bahan BARU = kemajuan. Lihat `webUrlBaruDilacak` di atas. */
              const kunci = String(
                (argsObj as Record<string, unknown> | null)?.url ??
                  (argsObj as Record<string, unknown> | null)?.query ??
                  (argsObj as Record<string, unknown> | null)?.q ??
                  '',
              ).trim();
              if (kunci && !webUrlBaruDilacak.has(kunci)) {
                webUrlBaruDilacak.add(kunci);
                langkahTanpaKemajuan = 0;
                sudahDiberiPeringatanTanpaKemajuan = false;
              }
            }
          } else {
            /*
             * Anything else is a passive step: it neither changed anything nor
             * read new material (e.g. a wait, a status poll). These are the
             * steps that count toward "no progress".
             */
            langkahTanpaKemajuan += 1;
          }
          get().setAgentProgress({ agentPhase: 'running-tool', agentCurrentTool: tc.name, agentStepIndex: langkah + 1, agentStepLimit: MAX_AGENT_STEPS });
          const mulaiTool = Date.now();
          /*
           * Shell menghasilkan perintah yang perlu diperiksa bahayanya SEBELUM
           * dijalankan, dan pemeriksaan itu butuh daftar perintah yang bisa
           * ditebak dari argumennya.
           *
           * `bash_run` dan `bash_background` adalah pengganti langsung
           * `shell_exec` dan `terminal_exec` setelah penggantian tool. Keduanya
           * memakai argumen `command`, jadi pembacaan `perintah` di bawah tetap
           * bekerja tanpa perubahan.
           */
          const namaShell = tc.name === 'bash_run';
          const perintah = namaShell ? String(argsObj.command ?? '') : '';
          /*
           * Read-only mode is a hard gate on the whole write set, not a shell
           * filter. `TOOL_TULIS` comes from agentTools so this refusal and the
           * spec filter in `agentToolSpecs` can never drift apart: a tool that
           * is hidden from a read-only caller is also refused here, and a write
           * tool that is never offered is refused anyway if the model calls it
           * from muscle memory. Both shell tools are covered twice over (they
           * are in the set and `namaShell` catches them), which is intentional.
           */
          const tulisDiblok = TOOL_TULIS.has(tc.name);
          const toolGateBlok = !useToolGate.getState().aktif.has(tc.name);
          /*
           * PLAN MODE IS A HARD GATE, not a sentence in the prompt.
           *
           * Measured: choosing Plan set approvalMode to 'work', which PERMITS
           * writes after a confirmation - so a model that ignored the "do not
           * change anything" instruction could edit files and run commands. The
           * mode was advisory while the button implied a guarantee, and the one
           * thing a reader uses Plan for is to look before anything is touched.
           *
           * The instruction in the system prompt stays (it shapes the answer),
           * but the refusal lives HERE, in the same gate as read-only, so no
           * prompt drift and no model mood can get around it. Reading and
           * searching remain open: that is what planning needs.
           */
          const planBlok = get().runMode === 'plan' && (tulisDiblok || namaShell);
          const readOnlyBlok = get().approvalMode === 'readonly' && (tulisDiblok || namaShell);

          const diizinkan =
            !isDestructive(perintah) && useStore.getState().izinPerintah(perintah);
          const izinTool = useToolGate.getState().tulisDiizinkan(tc.name);
          const tulisDisk = TOOL_DISK_TULIS.has(tc.name);
          /*
           * A tool that persists to disk needs consent in every mode except
           * `auto` (the explicit opt-in to unattended work). `editor_write` is
           * not in TOOL_DISK_TULIS on purpose: it only touches the buffer.
           */
          const perluSetujuDasar =
            (namaShell &&
              !diizinkan &&
              (get().approvalMode === 'ask' ||
                (get().approvalMode !== 'auto' && isDestructive(perintah)))) ||
            (tulisDisk && get().approvalMode !== 'auto' && !izinTool);

          /*
           * Per-tool rules are consulted BEFORE the mode, and can only make the
           * decision more permissive or more restrictive — never bypass the two
           * hard blocks above.
           *
           * `deny` and `allow` are absolute: they override `approvalMode` in
           * both directions, which is the whole point of having them (a rule
           * that only ever added confirmations would be a slower way of writing
           * `ask`). A call with NO matching rule keeps exactly the behaviour it
           * had before this existed.
           *
           * The `readOnlyBlok` check runs first and is not overridable: a rule
           * saying `allow bash_run` in read-only mode must NOT permit a write.
           * Read-only is a promise about the session, and a single regex was
           * not written with that promise in mind.
           */
          const aturan = useStore.getState().settings.agents?.toolRules;
          const hasilAturan = evaluasiUntukPanggilan(aturan, { name: tc.name, args: argsObj });
          const aturanBlok = hasilAturan.rule !== null && hasilAturan.action === 'deny';
          const perluSetuju =
            hasilAturan.rule !== null && hasilAturan.action === 'allow'
              ? false
              : hasilAturan.rule !== null && hasilAturan.action === 'confirm'
                ? true
                : perluSetujuDasar;

          let hasil: string;
          let ok = true;
          if (toolGateBlok) {
            hasil = `(refused: tool disabled in AI Tools: ${tc.name})`;
            ok = false;
          } else if (planBlok) {
            /*
             * The message has to be actionable: the model is told to PLAN, and
             * a bare refusal makes it retry the same call. Naming the way out
             * (present the plan, then the reader approves) is what turns the
             * refusal into the next step.
             */
            hasil = `(refused: Plan mode does not change anything - present the plan and let the user approve it before calling ${tc.name})`;
            ok = false;
          } else if (readOnlyBlok) {
            hasil = `(refused: read-only mode does not allow ${tc.name})`;
            ok = false;
          } else if (aturanBlok) {
            hasil = `(ditahan: aturan izin menolak ${tc.name} — ${hasilAturan.rule?.note || hasilAturan.rule?.match || 'cocok'})`;
            ok = false;
          } else if (perluSetuju) {
            get().setAgentProgress({ agentPhase: 'waiting-confirmation', agentCurrentTool: tc.name, agentStepIndex: langkah + 1, agentStepLimit: MAX_AGENT_STEPS });
            /*
             * Lewat `agentMintaIzin`, bukan Promise mentah.
             *
             * Versi lama membuat Promise di sini dan hanya tombol di AiPanel
             * yang bisa menyelesaikannya. Tanpa panel ter-mount, agen menunggu
             * SELAMANYA (terukur: 293 detik diam). `agentMintaIzin` membuka
             * panelnya sendiri dan punya batas waktu, jadi run selalu bergerak.
             */
            const disetujui = await get().agentMintaIzin(tc.name, JSON.stringify(argsObj), {
              destruktif: !!(namaShell && isDestructive(perintah)),
              tulis: tulisDisk,
            });
            if (!disetujui || agentBatal) {
              hasil = '(ditolak user)';
              ok = false;
            } else {
              try {
                hasil = await (prefetchedReadTools.get(tc.id) ?? jalankanAgentToolCached(tc.name, argsObj));
              } catch (e) {
                hasil = `ERROR: ${cmd.asZephyrError(e).message}`;
                ok = false;
              }
            }
          } else {
            try {
              hasil = await (prefetchedReadTools.get(tc.id) ?? jalankanAgentToolCached(tc.name, argsObj));
            } catch (e) {
              hasil = `ERROR: ${cmd.asZephyrError(e).message}`;
              ok = false;
            }
          }

          if (!ok && !hasil.startsWith('(ditolak')) {
            const namaTool = AGENT_TOOLS.some((t) => t.spec.name === tc.name)
              ? tc.name
              : `'${tc.name}' (unknown tool name — check the tool list)`;
            hasil +=
              `\n\n[HINT] Tool ${namaTool} failed. Do not repeat it with the same arguments.` +
              ` Read the error above, then try a different approach: read the file first,` +
              ` fix the arguments or use a different tool. If it is genuinely impossible,` +
              ` explain the blocker to the user.`;
          }

          /*
           * A cancelled run must NOT leave an assistant turn whose tool calls
           * have no results.
           *
           * `break` here used to skip the `history.push({role:'tool', …})` that
           * follows, while the assistant turn carrying `toolCalls` had already
           * been pushed before the tools ran. The history then ended with a tool
           * call nothing answers — the exact shape an OpenAI-compatible gateway
           * refuses with 400, on every request that comes after. Pressing Stop
           * mid-tool was enough to poison the rest of the conversation, and the
           * reader saw a permanent error with no way back.
           *
           * Answering the remaining calls with a cancellation result keeps the
           * pairing intact. The model reads it as "this tool never ran", which is
           * true, and the conversation stays usable instead of dying.
           */
          if (agentBatal) {
            history.push({
              role: 'tool',
              toolCallId: tc.id,
              name: tc.name,
              content: '(dibatalkan sebelum tool ini selesai dijalankan)',
            });
            break;
          }
          /*
           * izin-isi-web-mati: setelannya ada di TANGAN PENGGUNA, jadi
           * mengulang fetch dengan argumen apa pun hanya membuang-buang
           * iterasi - persis loop yang pernah terlihat di app.
           *
           * Peringatan pertama MENYURUH BERHENTI mencari di web dan menjawab
           * user, lengkap dengan cara menyalakan izinnya. Percobaan kedua
           * mengakhiri run: model tidak bisa menyalakan setelan itu sendiri,
           * jadi melanjutkan hanya mengulang kegagalan yang sama.
           *
           * `!ok` ikut diperiksa supaya membaca berkas yang MEMUAT teks
           * "izin-isi-web-mati" (mis. web.ts sendiri lewat read_file) tidak
           * dihitung sebagai penolakan.
           */
          if (!ok && hasil.includes('izin-isi-web-mati')) {
            izinWebMatiPercobaan += 1;
            if (izinWebMatiPercobaan === 1) {
              hasil =
                '(izin-isi-web-mati: fetching the web is DISABLED for this workspace.\n' +
                'It is a user setting (Settings > AI Tools > Web fetching, `izinIsiWeb`) ' +
                'and you cannot turn it on,\nso do NOT retry web_fetch, web_search, ' +
                'browser_open or download with any URL - every attempt\nreturns this ' +
                'same refusal.\nAnswer the user NOW: report that web access is off ' +
                'and how to enable it, then finish whatever\npart of the task can be ' +
                'done offline. If the whole task needs the web, say so plainly and stop.)';
            } else {
              akhir =
                'Stopped: web fetching is disabled (izinIsiWeb is off) and the attempt ' +
                'was retried.\nEnable it in Settings > AI Tools > Web fetching, then ' +
                'run the task again.';
              agentStopReason = 'guard';
              agentBatal = true;
            }
          }
          if (ok && tc.name === 'browser_open') {
            halamanTerbuka = true;
            /*
             * Record the page only once it actually opened. A call that failed
             * leaves nothing on screen, so treating it as "already opened"
             * would mark the next genuine attempt at that url as circling -
             * the guard would then stop a run that was making real progress.
             */
            const url = urlBrowserDinormalisasi(tc.name, argsObj);
            if (url && !urlBrowserTerbuka.includes(url)) urlBrowserTerbuka.push(url);
          }
          const selesaiPada = Date.now();
          /*
           * The one-line status the collapsed row shows.
           *
           * Both the reference product and Hermes answer "how much did that
           * touch?" without a click — "read · 12 lines · 20.7KB" tells the reader
           * whether opening the body is worth it. The numbers come from the
           * result text that is already in hand: a line count for reads, and for
           * edits the diff summary the patch tool already computes. Anything that
           * does not fit those shapes gets no status at all, which is the honest
           * answer.
           */
          const status: Partial<AgentToolRun> = {};
          if (hasil) {
            const baris = hasil.split('\n').length;
            if (baris > 1) status.lines = baris;
            status.bytes = hasil.length;

            /*
             * Pull the exit code out of the tool's own header.
             *
             * bash_run prefixes its result with `exit=N (N ms)` and, when the
             * command timed out, `exit=N (WAKTU HABIS) (N ms)`. That header is
             * for this parser, and it is stripped from the copy that reaches
             * the reader so the transcript never shows plumbing.
             */
            const meta = /^exit=(-?\d+)(?: \(WAKTU HABIS\))? \(\d+ ms\)\n/.exec(hasil);
            if (meta) {
              status.exitCode = Number(meta[1]);
              hasil = hasil.slice(meta[0].length);
            }
          }
          const run = {
            name: tc.name,
            args: JSON.stringify(argsObj),

            result: hasil,
            ok,
            at: selesaiPada,
            /* Time spent inside the tool, measured from before the dispatch
               above, so the badge reports the call and not the queue. */
            ms: selesaiPada - mulaiTool,
            ...status,
          };
          /*
           * Progress is judged AFTER the call, from its RESULT.
           *
           * Calling a write tool is not progress - a call that fails still got
           * here. Measured in Fase 5: `bash_run` was invoked repeatedly, every
           * invocation failed, and each failure reset the no-progress counter,
           * so the run spun 138 steps without a single new file and then stopped
           * with a message that never named the cause.
           *
           * The rule now: a failed call counts as progress only when the error
           * CHANGED (a new message means the model is correcting itself). The
           * exact same error twice in a row is a treadmill and counts as idle.
           */
          const galatSamaBerulang =
            !ok && hasil !== '' && sidikGagalTerakhir === sidikGagal(tc.name, hasil);
          sidikGagalTerakhir = ok ? '' : sidikGagal(tc.name, hasil);
          if (TOOL_PENULIS.has(tc.name) && !galatSamaBerulang) {
            /* A write that SUCCEEDED is real progress: clear the counter and
               forget the repeated-action fingerprints, exactly as a todo
               reaching `done` does. A write that failed with a new error is
               also progress of a sort - the model learned something - so it is
               treated the same way; only the identical failure is idle. */
            langkahTanpaKemajuan = 0;
            agenAksiBerulang.clear();
            sudahDiberiPeringatanTanpaKemajuan = false;
          }
          set((s) => ({
            agentSteps: [
              ...s.agentSteps,
              { kind: 'tool', name: run.name, args: run.args, result: hasil.slice(0, 400), ok, at: run.at },
            ],

            sessions: s.sessions.map((x) =>
              x.id === sessionId
                ? {
                    ...x,
                    messages: x.messages.map((m) => {
                      if (m.id !== botMsg.id) return m;
                      /*
                       * Stamp where this tool sits in the narration, so the
                       * transcript can interleave text and tool rows in the
                       * order they actually happened. The offset is the text
                       * length at append time; the renderer slices the final
                       * content at these points. No offset survives a message
                       * rebuild, so messages written before this existed keep
                       * rendering the old way (all tools, then all text).
                       */
                      /*
                       * Land any buffered text BEFORE reading the length.
                       *
                       * Text arrives in chunks buffered by a rAF flush (see
                       * chunkBuf/flushChunkBuf), so `m.content` can still be
                       * missing the words that were streamed just before this
                       * tool ran. Stamping `m.content.length` then points the
                       * offset at a position the narration has not reached yet:
                       * the slice for this tool comes out empty and the text it
                       * belongs to is handed to the NEXT row, which is exactly
                       * the reported symptom - narration cut off mid-sentence,
                       * a tool row wedged in the gap, then the sentence
                       * continuing below it.
                       *
                       * Flushing here makes `m.content` the text as it really
                       * stands at the moment of the call, so the offset and the
                       * prose on screen describe the same run. `m` is read
                       * inside the map callback, so it is re-read after the
                       * flush rather than captured stale.
                       */
                      flushChunkBuf();
                      const isiKini = useAi.getState().sessions.find((x) => x.id === sessionId)
                        ?.messages.find((x) => x.id === botMsg.id)?.content;
                      const runDenganPosisi = { ...run, atChar: (isiKini ?? m.content).length };
                      return { ...m, tools: [...(m.tools ?? []), runDenganPosisi] };
                    }),
                  }
                : x,
            ),
          }));
          history.push({ role: 'tool', toolCallId: tc.id, name: tc.name, content: hasil });

          if (hitungAksi.ingatkan) {
            /*
             * The model is repeating an identical call.
             *
             * Two mistakes were fixed here, and a live run showed both:
             *
             * ONE reminder. `ingatkan` fires only when the count EQUALS two, so
             * a call repeated eleven times was warned about exactly once — at
             * the second repeat, four seconds in, after which the loop ran
             * unwatched for another nine rounds. A reminder against a loop has
             * to keep arriving, because the whole failure mode is the model not
             * retaining it. It now fires on every repeat past the first.
             *
             * As a separate `user` message. It rode in the history as its own
             * turn, which a long conversation can push far from the result it
             * refers to; appended to the TOOL RESULT it cannot be missed,
             * because it is the last text before the model decides again.
             *
             * The wording names the escape hatch — the result is already in
             * hand — because "do not repeat" alone leaves a model with nothing
             * to do instead.
             */
            history[history.length - 1] = {
              role: 'tool',
              toolCallId: tc.id,
              name: tc.name,
              content:
                `${hasil}\n\n[You have run this exact call ${hitungAksi.jumlah} times this turn, ` +
                'with the same arguments. The result above is unchanged and you already have it — ' +
                'use it, or take a different approach. Do not call this again.]',
            };
          }

          /*
           * Navigation-only requests end at the first successful open. The
           * tool result has already been recorded, then the existing assistant
           * bubble is finalized below with one concise message. Do not let a
           * model-generated follow-up (read, fetch, click, or task_complete)
           * create another bubble or continue the loop.
           */
          const navigationResultOk =
            ok && !/navigation not requested|navigation requested but not verified|not verified/i.test(hasil);
          /*
           * Syarat "ini navigasi saja" bertumpu pada pesan USER.
           *
           * Versi lama memeriksa regex URL terpisah di sini, dan itu salah dua
           * arah sekaligus:
           *
           *   - ia memindai pesan user, bukan URL yang BARU SAJA DIBUKA. Pesan
           *     pertama yang menyebut URL di mana pun (mis. sebagai contoh
           *     berkas yang harus dibaca) membuat setiap `browser_open`
           *     berikutnya - yang mungkin bagian dari tugas panjang - mengakhiri
           *     seluruh pekerjaan.
           *   - regex-nya hanya mengenal `https://` dan `www.`, sehingga
           *     "buka google.com" yang ditolak pengklasifikasi tidak pernah
           *     berhenti.
           *
           * Karena itu aturannya disederhanakan: penghentian otomatis hanya
           * berlaku kalau SELURUH permintaan user memang navigasi (lewat
           * `isNavigationOnlyRequest`, yang sudah mengenal domain telanjang).
           * Kalau tidak, membuka halaman hanyalah satu langkah dari tugas yang
           * lebih besar, dan agen melanjutkan - dijaga oleh watchdog, bukan
           * dengan memotong pekerjaan yang sah.
           */
          if (
            navigationResultOk &&
            tc.name === 'browser_open' &&
            navigationOnly
          ) {
            /*
             * Opening a page IS the whole task here, so end the run at the
             * successful open instead of letting the model inspect what it just
             * displayed. This also covers requests the classifier deliberately
             * treats as ordinary work ("buka google.com di terminal"): the
             * words around the URL do not change that a URL was opened.
             *
             * The URL is never echoed back as the only words - a bare echo is
             * what makes a stop feel like a crash, so the message states where
             * the page went and that the task ends there.
             */
            const openedUrl = String(argsObj.url ?? '').trim();
            akhir = openedUrl
              ? `Halaman dibuka di pane browser: ${openedUrl}.\n\nTugas selesai - halaman sudah tampil, jadi tidak ada langkah lain yang dikerjakan. Beri tahu saya kalau ada yang ingin dicari atau dilakukan di sana.`
              : 'Halaman dibuka di pane browser.\n\nTugas selesai - halaman sudah tampil, jadi tidak ada langkah lain yang dikerjakan.';
            navigationOpened = true;
          }

            /*
             * Tandai pane browser sebagai sudah terisi, apa pun bentuk
             * permintaannya.
             *
             * Guard treadmill di atas HANYA aktif kalau `halamanTerbuka` true, dan
             * satu-satunya tempat yang menyetelnya dulu ada di cabang "navigation
             * only". Untuk permintaan biasa - "buka halaman ini lalu baca isinya",
             * "cek situs X" - bendera itu tidak pernah menyala, jadi guard-nya
             * tidak pernah hidup dan model bisa memanggil `browser_open` dan
             * `browser_read` berulang kali sampai MAX_AGENT_STEPS. Itu persis
             * keluhan "dia masih kerja terus, bukan berhenti".
             *
             * Bendera ini fakta, bukan keputusan: sebuah halaman memang sudah
             * terbuka di pane, apa pun niat yang membukanya.
             */
            if (
              navigationResultOk &&
              tc.name === 'browser_open'
            ) {
              halamanTerbuka = true;
              const urlDibuka = urlBrowserDinormalisasi(tc.name, argsObj);
              if (urlDibuka && !urlBrowserTerbuka.includes(urlDibuka)) {
                urlBrowserTerbuka.push(urlDibuka);
              }
            }

          /*
           * A tool result carries text only, so read_image parks the bytes it
           * loaded and they ride along on the next user turn. That turn is the
           * only message shape the providers accept an image on, so the picture
           * arrives one step later than the tool call that fetched it - which
           * is exactly when the model needs to look at it.
           */
          const gambarBaru = ambilGambarMenunggu();
          /*
           * Sinyal "selesai" tidak lagi datang dari tool `task_complete`.
           *
           * Tool itu tidak ada di katalog 51 tool, jadi kondisi lama di sini
           * TIDAK PERNAH bernilai true. Akibatnya loop tidak pernah berhenti
           * karena model menyatakan pekerjaannya selesai: ia berjalan sampai
           * model kebetulan berhenti memanggil tool, atau sampai menyentuh
           * batas langkah. Yang terlihat user: agen terus melangkah pada tugas
           * yang sudah beres.
           *
           * Yang benar-benar tersedia sebagai penanda selesai cuma dua:
           *
           *   - daftar tugas agen, kalau model memeliharanya. Semua tugas
           *     berstatus 'done' berarti pekerjaannya tuntas.
           *   - perintah itu sendiri tidak punya lagi langkah berarti, dan itu
           *     sudah tertangani oleh loop di bawah (tidak ada tool call lagi).
           *
           * Menghapus syarat lama tanpa menggantinya akan membuat loop
           * berjalan lebih lama, bukan lebih pendek - jadi penggantinya harus
           * benar-benar bisa terpenuhi.
           */
          if (tc.name === 'todo_write') {
            const todos = useAi.getState().agentTodos;
            if (todos.length > 0 && todos.every((t) => t.status === 'done')) {
              taskComplete = true;
            }
          }
          if (gambarBaru.length > 0) {
            history.push({
              role: 'user',
              content: `[image read by ${tc.name}: ${tc.args?.path ?? ''}]`,
              images: gambarBaru,
            });
          }
          if (taskComplete || navigationOpened) break;
        }
        if (taskComplete || navigationOpened || agentBatal) break;

        /*
         * Goal-satisfied guard — diperiksa sekali per LANGKAH, bukan per
         * panggilan tool.
         *
         * Perbedaan ini penting dan dulu salah. Model sering mengirim BEBERAPA
         * tool call dalam satu balasan (tiga `read_file` sekaligus), dan itu
         * satu langkah pemikiran yang wajar - bukan tiga langkah yang berputar.
         * Versi lama menaikkan penghitung di dalam loop per-panggilan, sehingga
         * satu balasan berisi empat bacaan langsung menyentuh batas dan
         * menghentikan agen pada langkah PERTAMA, padahal model baru mulai.
         *
         * Di tingkat langkah, artinya jujur: empat langkah berturut-turut yang
         * tidak mengubah apa pun.
         */
        if (langkahTanpaKemajuan >= BATAS_TANPA_KEMAJUAN) {
          if (!sudahDiberiPeringatanTanpaKemajuan) {
            /*
             * First trip: NUDGE, do not kill.
             *
             * The work may already be done - the files are on disk and the
             * model is only reading them back. Killing here ended successful
             * runs with a scary "stopped" message. Instead, hand the model a
             * clear instruction to conclude, and give it the next step to do
             * so. If that next step also changes nothing, the guard below
             * fires again with the flag set, and THEN it stops.
             */
            sudahDiberiPeringatanTanpaKemajuan = true;
            langkahTanpaKemajuan = 0;
            history.push({
              role: 'user',
              content:
                `You have read for ${BATAS_TANPA_KEMAJUAN} steps in a row without changing anything. ` +
                'Stop reading now: everything you need is already collected. ' +
                'Write the final answer for the user, or make the concrete change you were about to make. ' +
                'Do not read another file unless it is strictly required to finish.',
            });
            set((s) => ({
              agentSteps: [
                ...s.agentSteps,
                { kind: 'tool', name: '(reminder)', args: '{}', result: 'Asked the model to conclude instead of reading further.', ok: true, at: Date.now() },
              ],
            }));
            continue;
          }
          akhir =
            `Stopped: ${langkahTanpaKemajuan} steps in a row only read things and changed nothing. ` +
            'Everything needed to answer is already collected. Report findings to the user ' +
            'now instead of reading further.';
          /*
           * JANGAN matikan run kalau rencana belum selesai.
           *
           * Guard no-progress ini ada untuk menghentikan agen yang membaca
           * berkasnya sendiri tanpa henti. Tapi pada TUGAS BESAR ia jadi
           * bumerang: setelah auto-compact, model wajar membaca beberapa berkas
           * untuk memulihkan konteks sebelum menulis berkas berikutnya - dan
           * empat bacaan beruntun langsung kena guard. Itulah yang menghentikan
           * run toko di 16 dari 40+ berkas: BUKAN mandek, cuma sedang
           * mengumpulkan konteks di antara penulisan. opencode/Claude tidak
           * punya rem sekasar ini pada tugas yang jelas belum selesai.
           *
           * Jadi: kalau masih ada todo yang belum `done` DAN jatah sodokan belum
           * habis, perlakukan sama seperti "model berhenti padahal rencana belum
           * selesai" - tegaskan ulang sisa tugas dan SODOK untuk lanjut menulis,
           * jangan bunuh. Hanya kalau tidak ada todo tersisa (atau sodokan sudah
           * habis) guard benar-benar mengakhiri.
           */
          {
            const sisaTodoGuard = useAi
              .getState()
              .agentTodos.filter((t) => t.status !== 'done');
            if (sisaTodoGuard.length > 0 && lanjutTanpaTool < BATAS_LANJUT_TANPA_TOOL) {
              lanjutTanpaTool += 1;
              langkahTanpaKemajuan = 0;
              const daftar = sisaTodoGuard
                .map((t) => `- [${t.status === 'in_progress' ? '~' : ' '}] ${t.content}`)
                .join('\n');
              history.push({
                role: 'user',
                content:
                  `Berhenti membaca. Rencanamu BELUM selesai - masih ada ${sisaTodoGuard.length} tugas:\n` +
                  `${daftar}\n\n` +
                  `Kerjakan tugas berikutnya SEKARANG dengan menulis berkasnya langsung (write_file/edit). ` +
                  `Jangan membaca ulang berkas yang sudah ada. Kalau sebuah tugas memang sudah selesai, ` +
                  `tandai \`done\` lewat todo_write.`,
              });
              set((s) => ({
                agentSteps: [
                  ...s.agentSteps,
                  { kind: 'tool', name: '(lanjut)', args: '{}', result: `Membaca tanpa kemajuan, tapi ${sisaTodoGuard.length} tugas belum selesai; diminta lanjut menulis.`, ok: true, at: Date.now() },
                ],
              }));
              continue;
            }
          }
          set((s) => ({
            agentSteps: [
              ...s.agentSteps,
              { kind: 'tool', name: '(watchdog)', args: '{}', result: akhir.slice(0, 400), ok: false, at: Date.now() },
            ],
          }));
          agentStopReason = 'guard';
          /* Same reason as the other guards: `break` only leaves the step loop
             when the flag is set, so the flag is what actually ends the run. */
          agentBatal = true;
          break;
        }
      }
    } catch (e) {
      if (!agentBatal) agentStopReason = 'provider';
      const mentah = cmd.asZephyrError(e).message;
      const message = safeAgentFailureMessage(mentah);
      /*
       * Sebuah 4xx dijelaskan BENTUKNYA, bukan hanya statusnya.
       *
       * "Request rejected (400)" tidak memberi cara memperbaiki apa pun; yang
       * perlu diketahui adalah pesan mana yang melanggar bentuk. Rust mencatat
       * fakta itu saat menolak (urutan peran, asisten kosong, tool call tanpa
       * hasil, ukuran body) plus kalimat asli dari server, dan menempelkannya
       * di sini. Kegagalan mengambil catatannya tidak boleh menutupi error
       * aslinya, jadi kegagalan itu diabaikan.
       */
      let detail: string | null = null;
      if (/\b(?:400|413|422)\b/.test(mentah)) {
        detail = await cmd.aiPenolakanTerakhir().catch(() => null);
      }
      agentFailure = {
        category: classifyAgentFailure(message),
        message: detail ? `${message}\n\n${detail}` : message,
      };
    }

    /*
     * HydraFusion: close the stage strip and record the route that produced this
     * answer, in the same shape the chat path used so the settings row
     * ("HydraFusion last route") and the stage strip read identically whichever
     * path ran. `request` counts the rung actually used plus every escalation.
     */
    if (hydraRencana) {
      const pakai = jumlahkanPemakaian(hydraPemakaian);
      const ringkasHydra = {
        jalur: hydraRencana.jalur,
        provider: hydraDipakai.provider,
        model: hydraDipakai.model,
        request: 1 + hydraEskalasi.length,
        berhenti: agentFailure ? 'gagal' : agentBatal ? 'batal' : 'selesai',
        pemakaian: pakai,
        catatanTahap: [
          `rung: ${hydraDipakai.model} (${hydraRencana.tingkat})`,
          ...(hydraKritik !== null
            ? [`critique: ${hydraPutusan ?? 'tak-terbaca'}`]
            : hydraRencana.jalur === 'kritik-revisi'
              ? ['critique: not run (nothing to review)']
              : []),
        ],
      };
      set({
        hydraTahap: null,
        hydraTerakhir: {
          jalur: hydraRencana.jalur,
          tingkat: hydraRencana.tingkat,
          kategori: hydraRencana.kategori,
          provider: hydraDipakai.provider,
          model: hydraDipakai.model,
          alasan: hydraRencana.alasan,
          request: 1 + hydraEskalasi.length,
          berhenti: agentFailure ? 'gagal' : agentBatal ? 'batal' : 'selesai',
          catatanTahap: [
            `rung: ${hydraDipakai.model} (${hydraRencana.tingkat})`,
            ...(hydraKritik !== null
              ? [`critique: ${hydraPutusan ?? 'tak-terbaca'}`]
              : hydraRencana.jalur === 'kritik-revisi'
                ? ['critique: not run (nothing to review)']
                : []),
          ],
          eskalasi: hydraEskalasi,
          /*
           * Complete accounting: every leg's tokens, summed. The two counters are
           * the only cost figures that can be reported honestly here — Zephyr
           * does not know the provider's price list, so it does not invent a
           * money number. `0/0` means the provider reported no usage at all,
           * which is why the UI says so instead of showing "$0.00".
           */
          pemakaian: pakai,
        },
        /*
         * The same facts on the bubble itself, so the receipt sits under the
         * answer it explains. `hydraTerakhir` alone only describes the NEWEST
         * run: scrolling back would print the newest route beside every older
         * answer. Written only when this turn actually ran a plan.
         */
        sessions: get().sessions.map((x) =>
          x.id === sessionId
            ? {
                ...x,
                messages: x.messages.map((m) => (m.id === botMsg.id ? { ...m, hydra: ringkasHydra } : m)),
              }
            : x,
        ),
      });
    }

    const runWasCancelled = agentBatal;

    /*
     * Tell the OS the run is over, if the reader has looked away.
     *
     * Placed HERE because this is the single exit path of a run - the same
     * reason the cleanup below lives here. `catatSelesaiRun` decides whether it
     * is worth a notification at all (length of run, window focus), so this
     * stays a one-liner rather than growing a condition in the middle of the
     * exit sequence.
     *
     * Failure is silent by contract: the notification is a courtesy for work
     * that already finished, never the report of it.
     */
    try {
      const { catatSelesaiRun } = await import('./notifikasiAi');
      /*
       * The outcome decides which of the three SOUNDS plays, so it is computed
       * here from what the run actually ended with — not guessed inside the
       * notification module, which never sees the transcript.
       *
       * There are only two outcomes at this point: a run that stopped because
       * the reader must answer never reaches this exit (it is parked, not
       * finished) — that case is sounded at the moment it parks, see
       * `bunyiMenunggu`. So the choice here is "produced an answer" versus
       * "stopped without one".
       */
      const gagalTotal = agentFailure !== null && !akhir?.trim();
      const hasil: 'selesai' | 'berhenti' = runWasCancelled || gagalTotal ? 'berhenti' : 'selesai';
      /*
       * The title is the CHAT'S, not a constant.
       *
       * It used to be the literal "Zephyr — run finished", so every notification
       * looked identical: with two chats running you could not tell which one
       * had finished without opening the app. The session title is what the
       * reader named the conversation (or what the app derived from the first
       * message), which is exactly the label they recognise.
       *
       * `judulSesi` is read from the store at the moment the run ends rather
       * than captured at the start: a chat is often renamed mid-run, and the
       * name the reader sees in the sidebar is the one they should see here.
       */
      const sesiAktif = get().sessions.find((s) => s.id === get().activeId);
      const judulSesi = (sesiAktif?.title ?? '').trim();
      catatSelesaiRun(
        activeAgentUiId ?? '',
        judulSesi || 'Zephyr',
        runWasCancelled ? 'Stopped.' : akhir?.trim() || 'Done.',
        hasil,
      );
    } catch {
      /* no notification is not a failed run */
    }

    /*
     * `String(null)` menghasilkan "null", dan itu bukan salah satu alasan yang
     * dikenal. Akibatnya cabang terakhir di bawah menangkap SEMUA run yang
     * `agentBatal` tanpa alasan tercatat dan melaporkannya sebagai "Dihentikan
     * oleh pengguna" - padahal user tidak menekan apa pun. Terbukti di app
     * hidup: agent selesai membaca dua berkas dengan sukses, lalu bubble-nya
     * berakhir berbunyi "Cancelled: Dihentikan oleh pengguna." dan seluruh
     * jawabannya hilang dari layar.
     *
     * `agentBatal` sendiri dipakai loop sebagai "berhenti setelah langkah ini",
     * jadi ia bisa true tanpa ada pembatalan sama sekali. Yang menentukan
     * adalah ALASANnya; tanpa alasan, tidak ada yang boleh diklaim.
     */
    /*
     * `agentStopReason` dibaca lewat variabel bertipe lebar supaya TypeScript
     * tidak menyempitkannya berdasarkan alur `catch` di atas. Alasan 'user'
     * memang tidak pernah bisa muncul dari `catch`, tapi ia BISA muncul dari
     * `cancel()` - dan itulah satu-satunya penanda pembatalan yang sah.
     */
    const stopReason: string = agentStopReason ?? '';
    if (runWasCancelled && stopReason !== 'user') {
      /*
       * The mapping lives in agentStop.ts so it can be asserted in Node. A
       * non-null result overwrites whatever `catch` built; null means "leave it
       * alone" - which is what lets a real provider error keep its own message
       * instead of being replaced by a generic sentence.
       */
      const pesanStop = agentStopMessage(stopReason);
      if (pesanStop) agentFailure = pesanStop;
    } else if (runWasCancelled && stopReason === 'user') {
      agentFailure = { category: 'cancelled', message: 'Dihentikan oleh pengguna.' };
    }
    if (langkah >= MAX_AGENT_STEPS) {
      agentFailure = { category: 'timeout', message: `Batas ${MAX_AGENT_STEPS} langkah tool tercapai.` };
    }

    // Always replace the streaming assistant bubble with the real failure. Keep
    // any earlier answer as context, but never let it hide a later provider error.
    let finalError: string | null = null;
    if (agentFailure) {
      // Which failures leave a resume point.
      //
      // A provider failure and an idle timeout are both "we stopped mid-step,
      // but every step before this one is real work in `history`". Resuming
      // replays that history, so the agent picks up at the stalled step instead
      // of restarting the task. Both are safe to resume because the stall is a
      // property of the transport, not of the request: the same history that
      // stalled once is exactly what a resume would resend, which is why the
      // longer idle budget above is the actual fix and this is the safety net.
      //
      // Cancelled must NOT resume: the user ended the run, so it stays ended.
      // A guard trip (step limit) must not either: re-running it would hit the
      // same wall immediately, and "continue" would be a lie.
      //
      // Why `akhir` is NOT the test, proved with a real 360s timeout against a
      // provider that never answers: a run that times out on its FIRST step
      // produces no reply text at all, so `akhir` is empty and the guard closed
      // - the button never appeared exactly when it was most needed. What
      // matters is not whether text was produced, but whether there is real work
      // to resume: the opening user turn is in `history` from the start, so
      // anything beyond it (or a completed step) is work worth keeping.
      const adaKerjaNyata = history.length > 1 || langkah > 0;
      /*
       * `protocol` BELONGS HERE TOO.
       *
       * This is the category a malformed tool call lands in, and it was the one
       * failure that produced the most frustrating report: nine files written,
       * the tenth call's JSON broke, run over - with no way to continue because
       * only `provider` and `timeout` were resumable. The work is on disk and
       * the conversation is valid (a broken response produces no tool call, so
       * there is nothing dangling), which is exactly the shape a resume can
       * safely replay. Opencode resumes here; so does Zephyr now.
       *
       * `cancelled` still must not resume: the user ended it on purpose.
       */
      const bisaLanjut =
        (agentFailure.category === 'provider' ||
          agentFailure.category === 'timeout' ||
          agentFailure.category === 'protocol') &&
        adaKerjaNyata;
      /*
       * DAFTAR KANDIDAT + NOMOR PERCOBAAN disisipkan di sini, di pesan akhir.
       * Sebelum patch ini (2026-10-15) pesan akhir menyebut "provider error"
       * tanpa pernah menyebut provider mana pun, dan tanpa memberi tahu user
       * bahwa permintaan yang sama sudah dikirim ulang N kali - pengguna tidak
       * bisa membedakan "model salah" dari "provider sedang penuh".
       */
      const jejakTeks =
        jejakKandidat.length || jejakPercobaan
          ? `\n\nYang sudah dicoba: ${
              jejakKandidat.length ? jejakKandidat.join('; ') : '(tanpa kandidat tercatat)'
            }. Total percobaan kirim: ${jejakPercobaan} kali.`
          : '';
      finalError = `Agent stopped: ${agentFailureLabel(agentFailure.category)}: ${agentFailure.message}${jejakTeks}\n\nTugas dihentikan; perubahan yang sudah tersimpan tetap ada.${bisaLanjut ? ' Ketik "lanjut" atau tekan tombol Lanjut untuk meneruskan dari langkah terakhir.' : ''}`;
      const context = akhir.trim();
      akhir = context ? `${context}\n\n${finalError}` : finalError;
      if (bisaLanjut) {
        set({
          agentResume: {
            teks: content,
            history: [...history],
            images: agentImages.length ? agentImages : undefined,
            langkah,
            at: Date.now(),
          },
        });
        /*
         * AUTO-RESUME, like opencode, but bounded.
         *
         * A `protocol` stop (broken tool-call JSON) is the one failure where
         * continuing is almost always the right answer: the plan is unfinished,
         * the files written so far are real, and the next attempt has the error
         * text in front of it. Making the reader press "Continue" to get their
         * tenth file is exactly the papercut they reported.
         *
         * Bounded on purpose: at most two automatic resumes per run, and never
         * for a stop the reader caused. A run that keeps hitting the same wall
         * must still end honestly instead of looping invisibly - which is the
         * one thing worse than stopping.
         */
        if (agentFailure.category === 'protocol' && autoLanjut < AUTO_LANJUT_MAKS && !agentBatal) {
          autoLanjut += 1;
          const jumlah = autoLanjut;
          setTimeout(() => {
            const st = get();
            /* The reader may have started something else in the meantime; a
               background resume must never fight them for the composer. */
            if (st.agentBusy || st.pending || !st.agentResume) return;
            set({
              toast: `Argumen tool rusak - melanjutkan otomatis (${jumlah}/${AUTO_LANJUT_MAKS}).`,
            });
            void st.lanjutkanAgent();
          }, 600);
        }
      }
    }

    /*
     * D: tutup catatan konteks pekerjaan (jalur keluar run).
     *
     * Ditulis di SATU tempat - jalur keluar bersama ini - supaya catatan yang
     * ditinggalkan sama baiknya apakah run selesai sendiri, kena guard, atau
     * providernya gagal. Kegagalan menulis diabaikan di dalam; lihat
     * `catatHasilKonteks`.
     */
    await catatHasilKonteks(wsRun, {
      tugas: tugasRun,
      langkah,
      kategori: agentFailure ? agentFailure.category : null,
      berkas: [...berkasDitulisGiliran],
      todos: get().agentTodos,
    });

    // This is the single agent exit cleanup path. It also clears approval state
    // when an exit happens before a tool can answer its confirmation promise.
    /* Flush before the exit `set()` below: it computes the bubble's final text
       from `m.content`, so buffered text must already be there or it would be
       appended by a late rAF onto a message the UI has marked finished. */
    flushChunkBuf();
    agentWatchdogDisarm();
    // Without this the 15-minute timer outlives its run and fires in the middle
    // of a LATER one, killing a healthy agent.
    agentHardLimitDisarm();
    agentStepResolve = null;
    if (activeAgentAttempt) retiredAgentAttempts.add(activeAgentAttempt);
    activeAgentAttempt = null;
    activeAgentUiId = null;
    /*
     * Buang jejak percobaan dari run yang baru selesai.
     *
     * Kedua set ini hidup selama proses dan tidak pernah dikosongkan. Id
     * percobaan dibuat unik per run, jadi set yang tumbuh terus tidak
     * menyebabkan kebocoran perilaku - tapi ia juga berarti `cancelledAttempts`
     * menahan id yang sudah mati, dan `cancelledAttempts` hanya dihapus di satu
     * tempat (`onChunk` saat frame terminal lolos), yang mudah terlewat.
     * Membersihkannya di sini, di satu-satunya jalur keluar run, membuat
     * keadaannya tidak bergantung pada disiplin jalur lain.
     */
    retiredAgentAttempts.clear();
    cancelledAttempts.clear();
    agentConfirmResolve = null;
    finishAgentToolCache();
    catatanPercobaanGagal.clear();
    agentBatal = false;
    set((s) => ({
      agentBusy: false,
      agentNavigationOnly: false,
      pending: null,
      agentPhase: 'idle',
      agentCurrentTool: null,
      agentConfirm: null,
  agentTanya: null,
      agentStepIndex: 0,
      agentLastProgressAt: null,
      agentStartedAt: null,
      /*
       * A task the model marked in_progress is not running any more. Leaving it
       * that way made the list claim "Running" forever after a provider
       * failure, which reads as "still working" when the run is in fact dead -
       * the panel showed a spinner-free but permanently busy list. Reset it to
       * pending: it is unfinished, and pending is exactly that.
       */
      agentTodos: agentFailure ? s.agentTodos.map((t) => (t.status === 'in_progress' ? { ...t, status: 'pending' as const, startedAt: undefined, endedAt: undefined } : t)) : s.agentTodos,
      agentSteps: [...s.agentSteps, { kind: 'selesai', at: Date.now() }],
      sessions: s.sessions.map((x) =>
        x.id === sessionId
          ? {
              ...x,
              messages: x.messages.map((m) => {
                if (m.id !== botMsg.id) return m;
                /*
                 * Tiga sumber teks yang harus didamaikan, bukan saling
                 * menimpa:
                 *
                 *   m.content - apa yang SUDAH dilihat pembaca, ditambahkan
                 *               potongan demi potongan saat streaming.
                 *   akhir     - teks langkah TERAKHIR saja, yang hampir selalu
                 *               sudah menjadi bagian dari m.content.
                 *
                 * Versi lama memilih salah satu (`akhir.trim() ? akhir :
                 * m.content`). Kalau `akhir` adalah awalan dari yang sudah
                 * tergambar, memilih `akhir` justru MEMOTONG jawaban; dan kalau
                 * keduanya kebetulan sama, tidak ada bedanya. Yang tidak pernah
                 * benar adalah menganggap keduanya alternatif.
                 *
                 * Aturannya sekarang: yang sudah tergambar dipertahankan, dan
                 * `akhir` hanya dipakai kalau ia memang menambahkan sesuatu yang
                 * belum ada. Ini menjaga dua hal sekaligus - jawaban tidak
                 * terpotong, dan teks tidak tertulis dua kali.
                 */
                const tergambar = m.content.trim();
                let tampil: string;
                if (agentFailure) {
                  tampil = akhir === finalError && tergambar
                    ? `${tergambar}\n\n${finalError}`
                    : akhir;
                } else if (!akhir.trim() && !tergambar) {
                  /*
                   * A run that finished with WORK but no narration is not a
                   * blank turn, and must not render as one.
                   *
                   * This is the "bisu" case, seen live: the model ran ten tool
                   * calls — wrote three files, read them back — then stopped
                   * with an empty `res.content`, so `akhir` was empty, the
                   * bubble had no text, and the reader was shown a column of
                   * tool rows with nothing saying what had happened or whether
                   * it had worked.
                   *
                   * Saying it in Zephyr's own words is the honest answer: the
                   * steps DID run and their results are real. What is missing is
                   * only the model's summary, and reporting that is better than
                   * silence. The count and the files are taken from what
                   * actually executed, so the sentence cannot claim work that
                   * did not happen.
                   */
                  const selesai = get().agentSteps.filter((s) => s.kind === 'tool');
                  const gagal = selesai.filter((s) => s.ok === false).length;
                  const ditulis = [...new Set(
                    selesai
                      .filter((s) => s.ok !== false && /write_file|edit|multi_edit/.test(s.name || ''))
                      .map((s) => {
                        try {
                          const a = JSON.parse(s.args || '{}') as { path?: string };
                          return a.path ? a.path.replace(/^.*[\\/]/, '') : '';
                        } catch {
                          return '';
                        }
                      })
                      .filter(Boolean),
                  )];
                  const bagian = [`Selesai — ${selesai.length} langkah dijalankan`];
                  if (ditulis.length) bagian.push(`berkas: ${ditulis.join(', ')}`);
                  if (gagal) bagian.push(`${gagal} langkah gagal`);
                  bagian.push('(model tidak menulis ringkasan)');
                  tampil = bagian.join(' · ');
                } else if (!akhir.trim()) {
                  tampil = m.content;
                } else if (!tergambar) {
                  tampil = akhir;
                } else if (tergambar === akhir.trim()) {
                  /* Sudah sama persis: tidak menambah, tidak memotong. */
                  tampil = m.content;
                } else if (akhir.trim().startsWith(tergambar)) {
                  /*
                   * Yang tergambar adalah AWALAN dari jawaban lengkap. Ini yang
                   * terjadi ketika potongan terakhir belum sempat tiba: memakai
                   * `akhir` justru menyelesaikan jawaban, bukan menggandakannya.
                   */
                  tampil = akhir;
                } else if (tergambar.startsWith(akhir.trim())) {
                  /* Yang tergambar sudah memuat semuanya; `akhir` hanya ekornya. */
                  tampil = m.content;
                } else {
                  /*
                   * Keduanya punya isi yang tidak saling memuat. Ini keadaan
                   * yang tidak diharapkan, dan menebak akan menulis salah satu
                   * dua jawaban yang berbeda ke layar. Yang tergambar
                   * dipertahankan - pembaca sudah melihatnya, dan menghapus
                   * kalimat yang sudah dibaca lebih membingungkan daripada
                   * membiarkannya.
                   */
                  tampil = m.content;
                }
                return {
                  ...m,
                  content: tampil || '(no answer)',
                  streaming: false,
                  /*
                   * The structured field is only for the case the TEXT could not
                   * carry the reason - i.e. there is no bubble text at all.
                   *
                   * It used to be written unconditionally, and the result was
                   * proved on a real 360s timeout: the same paragraph appeared
                   * TWICE, once as the bubble and once as the error chip
                   * underneath, because the branch above had already appended
                   * `finalError` to `tampil`. Two renderings of one message
                   * read as two separate problems.
                   *
                   * When `tampil` is empty the bubble shows nothing but the
                   * `(no answer)` marker, so the chip is the only place the
                   * reason can appear - and it must, because a run that ends
                   * with no explanation is indistinguishable from a hang.
                   *
                   * `error` DITULIS EKSPLISIT, bukan ditambahkan bersyarat di
                   * atas `...m`. Ini perbaikan untuk "merah nyangkut setelah
                   * pulih": sebuah chunk `err` yang retryable (mis. grep dengan
                   * argumen rusak) menyetel `m.error` lewat terapkanChunkKeState
                   * di tengah run. Agent lalu me-retry, pulih, dan menyelesaikan
                   * tugasnya - tapi versi lama hanya MENAMBAH error kalau ada
                   * `finalError` baru, sehingga error lama yang dibawa `...m`
                   * tidak pernah dihapus. Hasilnya: run sukses (semua berkas
                   * jadi, server jalan) tapi bubble tetap merah "grep malformed".
                   * Menuliskannya eksplisit berarti run yang pulih membersihkan
                   * chip itu; hanya kegagalan nyata tanpa teks yang menyalakannya.
                   */
                  error: finalError && !tampil ? finalError : undefined,
                };
              }),
            }
          : x,
      ),
    }));
    persist(get());

    /*
     * Close the turn's checkpoint and attach it to the message it belongs to.
     *
     * Attached to the MESSAGE rather than kept in a store field, because the
     * button that restores it lives on that turn's row — a single "last
     * checkpoint" field would move to the newest turn the moment another one
     * ran, leaving the reader unable to undo an earlier one they were still
     * looking at.
     *
     * A turn that changed no files produces null, and null means no button:
     * offering "restore" on a read-only turn would be offering an action that
     * does nothing.
     */
    void import('./checkpoint').then((m) => {
      const cp = m.tutupCheckpoint();
      if (!cp) return;
      void import('./reviewUbah').then((r) => {
        /*
         * `reviewScope` decides whether this turn keeps an undo at all, and
         * `latest` also retires every older one. Both rules come from
         * `reviewUbah.ts` so the page's dropdown and the behaviour here cannot
         * disagree — a control that changes a stored value but not the code path
         * is the fake toggle this page exists to avoid.
         */
        const simpan = r.simpanCheckpoint();
        const dibuang = simpan
          ? new Set(
              r.checkpointYangDibuang(
                r.cakupanReview(),
                (get().sessions.find((x) => x.id === sessionId)?.messages ?? []).map((msg) => msg.id),
                botMsg.id,
              ),
            )
          : new Set<string>();

        set((s) => ({
          sessions: s.sessions.map((x) =>
            x.id === sessionId
              ? {
                  ...x,
                  messages: x.messages.map((msg) => {
                    if (msg.id === botMsg.id) return simpan ? { ...msg, checkpoint: cp } : msg;
                    if (dibuang.has(msg.id)) {
                      const { checkpoint: _buang, ...sisa } = msg;
                      return sisa;
                    }
                    return msg;
                  }),
                }
              : x,
          ),
        }));
        persist(get());

        if (!simpan) return;

        /*
         * Auto Fix Lints runs from the checkpoint's file list, not from a second
         * scan of the turn's steps.
         *
         * The checkpoint already IS the authoritative "what this turn changed"
         * list — it is built by the write path itself, so it cannot miss a file
         * the way a name filter over tool steps can. Reusing it also means the
         * fixer can never touch a file the undo button would not put back, which
         * keeps the two features describing the same turn.
         *
         * Deliberately AFTER `persist`: the turn is saved and readable before a
         * formatter touches the disk, so a crash mid-format cannot lose the
         * transcript that explains what happened.
         */
        void import('./autoFix')
          .then((m) => m.autoFixGiliran(composerId, cp.berkas.map((b) => b.path)))
          .catch(() => {});
      });
    });

    /*
     * Lifecycle: the run is over, so `session-end` hooks fire.
     *
     * Placed here, after the final state has been written and persisted, so a
     * hook that reads the transcript sees the finished one rather than a
     * half-written message. That ordering is the whole reason a hook runner is
     * useful at this point — a formatter or a notifier wants the answer that was
     * actually produced.
     *
     * Not fired for a CANCELLED run: the reader stopped it, and a hook that
     * formats or commits the result would be acting on work they just rejected.
     * That mirrors the rule the rest of this function already follows for the
     * error field and for speech.
     *
     * Fire-and-forget, and deliberately not awaited: the run is finished, the
     * reader has their answer, and a hook that takes thirty seconds must not
     * keep the panel looking busy. Its result is summarised into a toast rather
     * than into the transcript, because a hook's output is about the reader's
     * setup, not about what the model said.
     */
    if (!runWasCancelled) {
      void import('./hookRuntime')
        .then(async (m) => {
          const hasil = await m.jalankanHook('session-end');
          const ringkas = m.ringkasHook(hasil);
          if (!ringkas) return;
          const gagal = hasil.filter((h) => h.hasil.timed_out || h.hasil.code !== 0).length;
          set({ toast: gagal > 0 ? tx('A hook failed - see the Hooks panel') : tx('Hooks finished') });
        })
        .catch(() => {
          /* A hook runtime that cannot even load must not surface as a run
             failure; the answer the reader asked for already arrived. */
        });
    }

    /*
     * Tell the reader the run is over, if they are not looking at it.
     *
     * An agent run is exactly the kind of work people start and then leave:
     * "read these twelve files and write the report", "run the tests and fix
     * what fails". Waiting in front of it is wasted attention, and the thing
     * that makes leaving possible is a signal when it finishes.
     *
     * Only when the window is NOT focused. Notifying a reader who is watching
     * the answer appear is noise, and noise is what makes people turn
     * notifications off — after which the one that mattered is missed too.
     *
     * Cancelled runs say nothing: the reader stopped it deliberately, so they
     * already know, and a "finished" banner for work they killed would be a lie.
     * Failures DO notify, because a run that died while they were away is the
     * case where knowing soonest matters most.
     */
    if (!runWasCancelled) {
      const fokus = typeof document !== 'undefined' && document.hasFocus();
      if (!fokus) {
        void import('./notificationStore').then((m) => {
          const judul = agentFailure ? tx('Agent run failed') : tx('Agent run finished');
          const isi = agentFailure
            ? String(agentFailure.message).split('\n')[0].slice(0, 120)
            : (akhir || '').trim().split('\n')[0].slice(0, 120) || tx('No summary was produced.');
          /*
           * The button is the point of notifying at all.
           *
           * A reader who left the window gets "Agent run finished" and then has
           * to find the chat themselves. `ai.panel` is the registered command
           * that brings the chat back - the same one the Command Palette runs -
           * so the notification is a way BACK to the work, not just a report
           * that it happened. Failures get it too: the run that died is exactly
           * the one worth reopening.
           *
           * `runCommand` is the registry's own runner, imported lazily like the
           * store above, so this path adds nothing to the boot bundle.
           */
          const aksi = [
            { label: tx('Open chat'), command: 'ai.panel' },
          ];
          if (agentFailure) {
            m.notifyError(judul, { detail: isi, source: 'AI', actions: aksi });
          } else {
            m.notifyInfo(judul, { detail: isi, source: 'AI', actions: aksi });
          }
        });
      }
    }

    /*
     * Read the answer aloud, if the user asked for that.
     *
     * Placed HERE, after `streaming: false`, and not at the start: speaking text
     * as it streams would restart the utterance on every chunk, so the user would
     * hear the first sentence over and over and never reach the second.
     *
     * Skipped on a cancelled run - being told to stop and then having the partial
     * answer read out loud is the opposite of what was asked. Also skipped on a
     * failed run: an error is not something anyone wants spoken, and its text
     * ("provider unreachable") is worse out loud than on screen.
     *
     * Read through `getState()` rather than a captured store: this runs at the
     * end of a long async turn, and the settings may have been changed while the
     * model was still answering. The user's LAST choice is the one to honour.
     */
    // Failed provider/watchdog runs keep follow-ups visible and are never
    // automatically rerun. Successful runs retain the existing queue drain;
    // user cancellation also remains non-draining.
    if (!runWasCancelled && !agentFailure) {
      /* The queue of the surface that just finished, not the primary one's. */
      const daftar = get().antrians[COMPOSER_AKTIF] ?? [];
      const next = daftar[0];
      if (next && !(get().agentBusys[COMPOSER_AKTIF] ?? false)) {
        void get().kirimAntrian(0, COMPOSER_AKTIF);
      } else if (!next && !(get().agentBusys[COMPOSER_AKTIF] ?? false) && get().antrian.length > 0) {
        /*
         * LANE ANTREAN-LIVE (item C): pesan yang diketik SESUDAH drain langkah
         * terakhir tidak pernah lewat drain mana pun. Jalur lama membiarkannya
         * duduk di `antrian` sampai user mengirim lagi - persis keluhan "harus
         * nunggu run kelar". Aturan `antreanPesan.ts` berlaku juga di sini: begitu
         * giliran selesai, kepala antrean LANGSUNG diproses.
         *
         * Jadi sisa itu dipindahkan ke antrean permukaan yang baru selesai, lalu
         * kepalanya dikirim lewat `kirimAntrian` - jalur kirim yang sudah ada,
         * bukan jalur kedua - dan sisanya tetap menunggu dengan urutan utuh.
         */
        const selesai = giliranSelesaiPanel(get().antrian, { sibuk: true });
        if (selesai.langsungDiproses) {
          const pindah = get().antrian;
          set((s) => {
            const sesudah = [...(s.antrians[COMPOSER_AKTIF] ?? []), ...pindah];
            return {
              antrians: { ...s.antrians, [COMPOSER_AKTIF]: sesudah },
              ...(COMPOSER_AKTIF === '' ? { antrian: sesudah } : { antrian: [] }),
            };
          });
          void get().kirimAntrian(0, COMPOSER_AKTIF);
        }
      }
    } else {
      /*
       * Antrean dilewati. Ini disengaja: menjalankan ulang permintaan yang baru
       * saja gagal, atau yang baru saja dibatalkan user, bukan hal yang user
       * minta.
       *
       * Masalahnya, antrean yang berhenti tanpa penjelasan terbaca sebagai
       * kerusakan - user melihat pesannya duduk di sana dan tidak tahu harus
       * apa. Jadi di sini kita CUMA memberi tahu, tidak melakukan apa pun:
       * pesannya tetap di antrean supaya bisa dikirim manual.
       *
       * Pesannya sengaja bukan error. "Gagal" terbaca seperti kehilangan data;
       * "belum terkirim, masih menunggu" itu yang sebenarnya terjadi.
       */
      const sisa = get().antrian.length;
      if (sisa > 0) {
        const alasan = runWasCancelled ? 'dibatalkan' : 'berhenti karena gagal';
        set({
          toast: `${sisa} pesan masih menunggu di antrean karena langkah sebelumnya ${alasan}. Kirim manual kalau sudah siap.`,
        });
      }
    }
    clearGambarMenunggu();
    return !runWasCancelled && !agentFailure;
  },

  cancel: async () => {

    /*
     * Flush whatever the coalescer is still holding BEFORE cancelling.
     *
     * Text that already arrived must not be dropped just because the user
     * pressed Stop between two animation frames - that would show as the last
     * few words of an answer silently missing. The buffer is flushed here, not
     * after the flags are set, so the final partial text lands on the message
     * the user is cancelling.
     */
    flushChunkBuf();

    // read_image payloads belong to the run being cancelled. Clear them before
    // any later send can observe the queue, including chat-mode cancellation.
    clearGambarMenunggu();
    if (get().agentBusy) {
      get().setAgentProgress({ agentPhase: 'cancelling', agentCurrentTool: get().agentCurrentTool });
      agentBatal = true;
      agentStopReason = 'user';
      agentWatchdogDisarm();
      if (agentConfirmResolve) {
        const r = agentConfirmResolve;
        agentConfirmResolve = null;
        r(false);
      }

      const aktif = activeAgentAttempt;
      if (aktif) {
        cancelledAttempts.add(aktif);
        retiredAgentAttempts.add(aktif);
        /*
         * Filter out chunks that are still in flight.
         *
         * Setting the flag in Rust does not stop packets already sent;
         * a few text chunks can arrive after the Stop button is pressed and —
         * without this filtering — keep sticking to the already-cancelled
         * bubble. The id is removed again when the closing chunk arrives.
         */
        cancelled.add(aktif);
        lupakanDelta(aktif);
        try {
          await cmd.aiCancel(aktif);
        } catch {
          /* the step has already finished */
        }
      }

      /*
       * Release the step that is currently waiting.
       *
       * The agent loop waits on a single promise that is only resolved by the
       * "toolDone" chunk from Rust. That chunk only arrives after the HTTP request
       * finishes — and when a provider hangs, that means waiting until the
       * read timeout (90 seconds). Without releasing here, the Stop button only
       * sets a flag: the UI keeps showing Stop and the agent does not stop
       * until the provider answers on its own.
       *
       * The "cancelled" result makes the loop exit through the ordinary
       * `res.cancelled` path, so the final message and session saving still run.
       */
      const tunggu = agentStepResolve;
      agentStepResolve = null;
      if (tunggu) {
        tunggu({ content: '', toolCalls: [], cancelled: true });
      }

      /*
       * Close any bubble that is still marked streaming.
       *
       * Resolving the step is not enough on its own. When `agentStepResolve`
       * is ALREADY null — the step resolved earlier, or the run was started
       * outside the loop — the `if (tunggu)` above does nothing, and nothing
       * else on this path clears `streaming`. The bubble then spins forever:
       * reported as "no reply, it just keeps thinking", with `agentBusy` true
       * so every later send is refused too. The run's own exit block cannot be
       * relied on here, because the whole reason the reader pressed Stop is
       * that the run is not reaching its exit block.
       *
       * `streaming: false` on every assistant bubble (not just one id) because
       * this path does not know which attempt is the live one — `pending` is
       * null in agent mode. Closing a bubble that was already closed is a
       * no-op, so the broad sweep costs nothing and cannot leave a spinner on.
       * The content is kept as-is; an empty one gets a note so the bubble does
       * not read as a blank answer.
       */
      set((s) => ({
        agentConfirm: null,
        /*
         * Release the composer too. `streaming` and `agentBusy` are two halves
         * of one symptom — the spinner that never stops and the form that
         * refuses every later send — so leaving one set would only convert
         * "no reply" into "cannot type". They are cleared together here.
         */
        agentBusy: false,
        agentBusys: { ...s.agentBusys, '': false },
        agentPhase: 'idle',
        agentCurrentTool: null,
        agentStepIndex: 0,
        agentStartedAt: null,
        sessions: s.sessions.map((x) => ({
          ...x,
          messages: x.messages.map((m) =>
            m.role === 'assistant' && m.streaming
              ? { ...m, streaming: false, content: m.content || '(cancelled before any answer)' }
              : m,
          ),
        })),
      }));
      persist(get());
      return;
    }
    const id = get().pending;
    if (!id) return;

    cancelled.add(id);
    lupakanDelta(id);
    try {
      await cmd.aiCancel(id);
    } catch {
      /* done */
    }
    set((s) => ({
      pending: null,
      sessions: s.sessions.map((x) => ({
        ...x,
        messages: x.messages.map((m) =>
          m.id === id
            ? { ...m, streaming: false, content: m.content || '(cancelled before any answer)' }
            : m,
        ),
      })),
    }));
    persist(get());
  },

  onChunk: (c) => {
    if (subagentOnChunk(c)) return;

    /*
     * HydraFusion passes first, for the same reason the subagent bridge does:
     * an orchestrated run owns its own request ids. A buffered pass is consumed
     * here (its text is the draft, or the critique — neither belongs in the
     * bubble); a LIVE pass is recorded and then falls through, which is how a
     * single-request plan still streams token by token.
     */
    if (hydraCatat(c)) return;

    /*
     * Drop the duplicate delta some providers send for every token.
     *
     * THE BUG THIS FIXES: some OpenAI-compatible gateways (the custom router
     * this app ships against is one) emit each delta TWICE - chunk 0 is "1" and
     * chunk 1 is "1" again, chunk 2 is "," and chunk 3 is "," again. The result
     * is a transcript that stutters on every token: "11,,  22,,  33,," and
     * "SoSoalal link link YouTube YouTube--nyanya". Every guard above is about
     * two ATTEMPTS overlapping; this is one attempt, doubled at the source.
     *
     * The test is exact equality with the previous chunk for the same request.
     * That is safe for streaming text because a provider repeating a delta
     * verbatim on the very next frame carries no new information - two identical
     * consecutive tokens are possible in principle ("very very"), but they
     * arrive as ONE delta containing both words, not as two identical frames.
     * Anything that would be lost this way would already be lost to the
     * provider's own framing.
     *
     * Only `text` is checked. Reasoning deltas are separate and can legitimately
     * repeat a short token across frames.
     */
    /*
     * A TERMINAL frame must never be droppable by the text heuristic.
     *
     * The duplicate this guard targets is a repeated TEXT delta; a frame that
     * also carries `done`/`err`/`toolDone` is a different thing entirely - it is
     * the signal that ends the request. If the provider's last text token
     * happens to equal the previous frame AND rides along with the terminal
     * (a restated final token, or a verbatim-duplicated closing frame - the very
     * class this guard exists for), dropping it would leave the bubble
     * `streaming:true` and `pending` set forever in chat mode, which has no
     * watchdog to recover. The dedup therefore applies to text-only frames;
     * terminals always fall through.
     */
    const cTerminal = !!(c.done || c.err || c.toolDone);
    if (c.text && !cTerminal) {
      const sebelumnya = deltaTerakhir.get(c.id);
      if (sebelumnya === c.text) {
        deltaTerakhir.set(c.id, c.text);
        return;
      }
      deltaTerakhir.set(c.id, c.text);
    } else if (cTerminal) {
      /*
       * A terminal frame is NEVER dropped (see below), but if it restates the
       * previous text token verbatim - a frame-doubling gateway repeating its
       * closing frame - the text must not be applied a second time. Strip just
       * the duplicate text and let the terminal flags process normally.
       */
      if (c.text && deltaTerakhir.get(c.id) === c.text) {
        c = { ...c, text: undefined };
      }
      deltaTerakhir.delete(c.id);
    }

    /*
     * Id provider adalah id PERCOBAAN, bukan id pesan UI yang stabil.
     *
     * Setiap kali provider diulang (retry), percobaan lama dan baru mengirim
     * teks yang sama dari awal - itu memang arti sebuah retry. Keduanya
     * dipetakan ke satu id pesan UI, jadi kalau potongan lama masih lolos,
     * awalan jawaban tertulis dua kali dan hasilnya terbaca seperti gagap:
     * "PerPeriksa erroriksa error di di ...".
     *
     * Penjaga pertama menutup kasus yang sudah diketahui: id yang terdaftar
     * pensiun tidak pernah sah lagi.
     */
    const attempt = activeAgentAttempt;

    /*
     * Sebuah frame TERMINAL tidak boleh hilang tanpa melepaskan langkahnya.
     *
     * Penjaga di bawah ada untuk mencegah teks percobaan lama mendarat di bubble
     * yang salah, dan untuk itu mereka benar. Tapi mereka `return` tanpa pernah
     * menyentuh `agentStepResolve`. Kalau frame yang ditelan itu justru frame
     * PENUTUP (`toolDone`/`done`/`err`), loop tetap parkir di `await` dan tidak
     * ada apa pun yang membangunkannya - bubble tetap `streaming: true`, meter
     * tetap di indeks lama, dan hanya batas keras 15 menit yang mengakhiri.
     *
     * Ini satu-satunya jalur di `onChunk` yang bisa menelan terminal, jadi
     * penutupnya dipasang di sini: frame terminal yang akan dibuang tetap
     * melepaskan langkah yang sedang menunggu, dengan alasan yang jujur.
     */
    const terminalFrame = !!(c.toolDone || c.done || c.err);
    const lepaskanLangkahDitelan = (sebab: string) => {
      if (!terminalFrame || !agentStepResolve) return;
      /*
       * HANYA lepaskan langkah yang menunggu kalau frame penutup ini memang
       * MILIKNYA (c.id === attempt). Ini perbaikan untuk penghentian merah
       * palsu pada kerja berat.
       *
       * `agentStepResolve` selalu milik percobaan yang AKTIF sekarang. Ketiga
       * penjaga di bawah menelan frame dari percobaan yang BUKAN aktif:
       *   - retiredAgentAttempts.has(c.id): percobaan lama yang sudah pensiun,
       *   - c.id !== attempt: percobaan asing,
       *   - cancelledAttempts.has(c.id): percobaan yang dibatalkan.
       * Pada run berat dengan beberapa retry, frame penutup yang TERLAMBAT dari
       * percobaan lama kerap tiba justru ketika langkah BARU sedang streaming.
       * Versi lama melepaskan langkah baru itu dengan error "percobaan sudah
       * pensiun" - mematikan langkah sehat di tengah jalan. Itulah "merah terus"
       * yang dilaporkan: makin banyak langkah/retry (persis ciri kerja berat),
       * makin besar peluang frame basi mendarat saat langkah lain menunggu.
       *
       * Pengecualian yang benar: setelah user menekan Stop, percobaan AKTIF
       * sendiri masuk retired+cancelled (lihat `cancel`), jadi c.id === attempt
       * dan melepaskannya memang yang diinginkan. Syarat c.id === attempt
       * menangkap tepat kasus itu dan menolak frame dari percobaan lain.
       */
      if (c.id !== attempt) return;
      const r = agentStepResolve;
      agentStepResolve = null;
      agentWatchdogDisarm();
      r({ content: '', toolCalls: [], cancelled: agentBatal, error: agentBatal ? undefined : sebab });
    };

    if (retiredAgentAttempts.has(c.id)) {
      lepaskanLangkahDitelan(
        'Provider menutup langkah lewat percobaan yang sudah pensiun; langkah dihentikan agar agen tidak menunggu selamanya.',
      );
      return;
    }
    /*
     * Id percobaan asing: BUANG chunk-nya, tapi jangan matikan langkah yang
     * sedang berjalan hanya karena id-nya tidak persis sama.
     *
     * `attempt` adalah `activeAgentAttempt`, dan id yang datang dari Rust
     * dibentuk sebagai `attempt-<botMsgId>-<counter>`. Keduanya berasal dari
     * sumber berbeda dan terbukti bisa TIDAK sama: pada laporan "chat selalu
     * thinking", chunk yang tiba ber-id `attempt-m-mvas4ynf-5-mvas4yrh-6`
     * sementara sesi aktif ber-id `chat-mva37809-1` dengan pesan `m-mva7cwj2-*`.
     * Chunk itu dibuang, `toolDone`-nya ikut hilang, `agentStepResolve` tidak
     * pernah dipanggil, dan `agentBusy` bertahan sampai batas keras 45 menit -
     * persis gejala "nggak ada balasan, muter terus".
     *
     * Pembedaan yang dipakai: apakah id ini MASIH SATU KELUARGA dengan
     * percobaan yang aktif. Kalau ya, ia bagian dari langkah yang sedang
     * berjalan (langkah baru membuat keluarga baru) sehingga tetap diproses;
     * kalau tidak, ia sisa percobaan lain dan tetap dibuang seperti semula.
     *
     * Keluarga dibandingkan lewat awalan `attempt-<pesanId>` tanpa counter,
     * karena counter-nya memang berubah tiap langkah sementara pesan UI-nya
     * tetap sama selama satu langkah berjalan.
     */
    const keluarga = (s: string | null) => (s ?? '').replace(/-\d+$/, '');
    if (attempt && c.id !== attempt && keluarga(c.id) !== keluarga(attempt)) {
      retiredAgentAttempts.add(c.id);
      lepaskanLangkahDitelan(
        'Provider menutup langkah dari percobaan yang tidak dikenal; langkah dihentikan agar agen tidak menunggu selamanya.',
      );
      return;
    }
    if (cancelledAttempts.has(c.id)) {
      if (terminalFrame) cancelledAttempts.delete(c.id);
      lepaskanLangkahDitelan('Langkah dibatalkan sebelum provider menutupnya.');
      return;
    }
    c = { ...c, id: activeAgentUiId ?? c.id };

    /*
     * Drop chunks that arrive after a CHAT cancel, BEFORE buffering.
     *
     * Setting the flag in Rust does not stop packets already in flight, and the
     * user pressed Stop precisely so they would not appear. This guard used to
     * live further down; the buffering branch below returns early, so it has to
     * run here or those late packets get buffered and flushed onto the
     * already-cancelled bubble. Agent cancellation is handled earlier via
     * `cancelledAttempts`; this covers the chat path.
     */
    if (cancelled.has(c.id)) {
      if (c.done || c.err) cancelled.delete(c.id);
      return;
    }

    /*
     * Buffer pure text/reasoning deltas and let ONE store write serve the whole
     * animation frame. Terminal chunks (`done`/`err`/`toolDone`) skip this and
     * go straight through, after flushing whatever was still buffered so their
     * text is not stranded behind them.
     *
     * The dedup guard above already ran on the raw delta, so coalescing here
     * cannot hide a provider's duplicate frame.
     */
    const terminal = !!(c.done || c.err || c.toolDone);
    if (terminal) {
      flushChunkBuf();
    } else if (c.text || c.reasoning) {
      const buf = chunkBuf.get(c.id) ?? { text: '', reasoning: [] };
      /*
       * Text is always a true delta, so appending it is lossless. Reasoning is
       * NOT: some providers send it CUMULATIVE (a growing snapshot), and the
       * cumulative/delta heuristic downstream compares each frame against what
       * is already stored. Concatenating two snapshots ("A" then "AB") would
       * hand it "AAB" and double the text. Keep reasoning frames as a list so
       * the heuristic sees exactly the sequence the provider sent.
       */
      if (c.text) buf.text += c.text;
      if (c.reasoning) buf.reasoning.push(String(c.reasoning));
      chunkBuf.set(c.id, buf);
      if (c.text || c.reasoning) {
        agentNoProgressTandai();
        if (agentWatchdog) agentWatchdogArm();
      }
      jadwalkanFlushChunk();
      return;
    }

    /*
     * Watchdog idle hanya diperpanjang oleh frame yang MEMBAWA ISI.
     *
     * Dulu setiap frame memperpanjangnya, dan itu membuat watchdog tidak pernah
     * menembak pada kasus yang justru paling butuh: provider yang koneksinya
     * masih hidup tetapi tidak lagi mengirim apa-apa yang berguna. Stream yang
     * hanya mengeluarkan keep-alive, potongan usage, atau frame kosong akan
     * mengembalikan timer ke 360 detik setiap kali - selamanya. Yang akhirnya
     * menghentikan run cuma batas mutlak 15 menit, dan itulah "beberapa menit
     * lalu state kembali sendiri" yang dilaporkan.
     *
     * Basis timer diubah dari "ada frame" menjadi "ada perubahan konten", yang
     * memang definisi kemajuan. Provider sehat tetap mengirim token; yang diam
     * sekarang benar-benar dihitung diam.
     */
    const adaIsi = !!(c.text || c.reasoning);
    if (adaIsi) {
      agentNoProgressTandai();
      if (agentWatchdog) agentWatchdogArm();
    }

    if (c.toolDone) {
      agentWatchdogDisarm();
      /* Langkah selesai, jadi batas mutlaknya juga dibatalkan. Kalau tidak,
         timer 15 menit itu akan menembak di tengah langkah BERIKUTNYA dan
         menghentikan agen yang sedang berjalan normal. */
      agentHardLimitDisarm();
      cancelled.delete(c.id);

      /*
       * Tulis teksnya ke pesan SEBELUM kembali.
       *
       * `toolDone` mengembalikan lebih awal - jadi blok `set(...)` di bawah,
       * satu-satunya tempat `c.text` dituliskan ke pesan, tidak pernah
       * dijalankan untuk potongan terakhir. Provider yang mengirim teks dan
       * tool call dalam paket terakhir yang sama kehilangan seluruh kalimat
       * itu.
       *
       * Persis itu bentuk narasi antar tool: provider nyata mengirim satu
       * kalimat ("Aku cek dulu isi foldernya, lalu lanjut.") lalu tool call di
       * paket yang sama. Tanpa perbaikan ini, yang dilihat pembaca hanyalah
       * deretan baris tool tanpa satu pun kalimat penjelas - dan aturan narasi
       * di systemPrompt akan selalu tampak tidak dipatuhi, padahal modelnya
       * mematuhinya dan alat yang membuangnya ada di sini.
       *
       * Bukti dari app hidup: mock mengirim teks itu, chunk tiba di frontend,
       * tetapi `isi: ""` pada pesan assistant dan `calls: 0`.
       */
      if (c.text) {
        const tambahan = c.text;
        set((s) => ({
          sessions: s.sessions.map((sess) => ({
            ...sess,
            messages: sess.messages.map((m) => (m.id === c.id ? { ...m, content: m.content + tambahan } : m)),
          })),
        }));
      }

      const r = agentStepResolve;
      agentStepResolve = null;
      if (c.err) {
        if (!agentBatal) agentStopReason = 'provider';
        /*
         * Teks dan tool call yang SUDAH datang dibawa serta, jangan dibuang.
         *
         * `err` sering datang di paket terakhir yang SAMA dengan teks dan tool
         * call - bukan di paket kosong yang terpisah. Mengirim `content: ''`
         * dan `toolCalls: []` membuang kerja yang sudah diterima: teks narasi
         * lenyap dari pesan, dan tool call yang model minta tidak pernah
         * dijalankan. Yang tersisa hanya "(no answer)" tanpa alasan.
         *
         * Terbukti dari app hidup: chunk `toolDone` membawa
         * `calls=[{name:"skill_list"}]`, tetapi langkah agent berhenti di
         * `mulai` dan pesan assistant tetap kosong - tool call-nya ada, lalu
         * hilang di baris ini.
         *
         * `error` tetap disertakan supaya penyebabnya tidak hilang.
         */
        r?.({
          content: c.content ?? '',
          toolCalls: c.toolCalls ?? [],
          cancelled: false,
          error: c.err,
        });
        return;
      }
      r?.({
        content: c.content ?? '',
        toolCalls: c.toolCalls ?? [],
        cancelled: !!c.cancelled,
        /* Pemakaian token diteruskan apa adanya. `undefined` berarti provider
           tidak melaporkannya, dan subagent menyimpannya sebagai `null` -
           bukan nol - supaya "tidak dilaporkan" tidak terbaca sebagai "gratis". */
        usage: c.usage,
        /* The step's reasoning, so the loop can carry it into the history and
           send it back. Without this the accumulator in Rust holds it and the
           conversation never sees it. */
        reasoning: c.reasoning,
        reasoningSignature: c.reasoningSignature,
      });
      return;
    }

    // Every agent step must have a terminal result. Previously Rust's `err`
    // and a clean EOF without `toolDone` updated the UI but left the step
    // promise waiting until the watchdog, which looked like the agent had
    // silently stopped. Resolve it immediately with the real reason.
    if ((c.err || c.done) && agentStepResolve) {
      if (c.err && !agentBatal) agentStopReason = 'provider';
      agentWatchdogDisarm();
      const r = agentStepResolve;
      agentStepResolve = null;
      r({
        content: '',
        toolCalls: [],
        cancelled: false,
        error: c.err ?? 'Provider stream ended before the agent step completed.',
      });
    }

    /* Feed the debug log. Counted before the state write so a chunk that is
       dropped by a later guard still shows up as traffic. */
    if (c.text || c.reasoning) useAiDebug.getState().potong(c.id, (c.text?.length ?? 0) + (c.reasoning?.length ?? 0));
    if (c.done || c.err) {
      useAiDebug.getState().selesai(c.id, c.err ? 'error' : 'ok', 0, c.err ?? undefined);
    }

    /*
     * Penjaga pengulangan.
     *
     * Diperiksa SETIAP potongan, tapi sengaja murah: di bawah 400 karakter
     * langsung keluar, dan jawaban 216.000 karakter selesai diperiksa dalam
     * ~1ms. Tanpa penjaga ini, model yang masuk loop degeneratif menghabiskan
     * seluruh anggaran outputnya untuk mengulang satu fragmen, tetap ditagih,
     * dan tetap ditampilkan.
     *
     * Yang dibuang hanya fragmen yang benar-benar didominasi ulangan saat
     * jawabannya SUDAH selesai. Jawaban yang panjang dan berulang tapi masih
     * mengalir dibiarkan - user mungkin memang minta daftar panjang, dan
     * memotong di tengah hanya membuat outputnya setengah jadi.
     */
    if (c.text && !c.reasoning) {
      const akumulasi = teksAkumulasi(c.id) + c.text;
      simpanTeksAkumulasi(c.id, akumulasi);

      if (c.done || c.err) {
        hapusTeksAkumulasi(c.id);
        const periksa = mengulangPelarian(akumulasi);
        if (periksa.ya) {
          useAiDebug.getState().selesai(c.id, 'error', 0, periksa.alasan);
          /*
           * The discarded answer is kept aside before the bubble is replaced.
           *
           * Overwriting is deliberate and stays - replaying repeated bytes seeds
           * the loop into the NEXT request, so the text must not go back to the
           * provider. But discarding it entirely meant a reader whose long answer
           * tripped this guard saw their work replaced by a one-line notice with
           * nothing to check it against. Keeping a copy makes the claim
           * verifiable: if the guard was wrong, the text is right there.
           */
          catatanPercobaanGagal.set(c.id, akumulasi);
          set((s) => ({
            sessions: s.sessions.map((sess) => ({
              ...sess,
              messages: sess.messages.map((m) =>
                m.id === c.id
                  ? {
                      ...m,
                      content: REPETITION_LOOP_INTERRUPTED,
                      error: 'Balasan rusak menjadi pengulangan dan dihentikan.',
                      streaming: false,
                    }
                  : m,
              ),
            })),
          }));
          return;
        }
      } else if (periksaSedangMengulang(akumulasi)) {
        /* Loop sudah jelas sementara jawabannya masih mengalir: hentikan
         * sekarang, jangan tunggu sampai 16 ribu karakter. Kuota yang dihemat
         * di sini bisa puluhan ribu token. */
        const periksa = mengulangDominan(akumulasi);
        useAiDebug.getState().selesai(c.id, 'error', 0, periksa.alasan);
        hapusTeksAkumulasi(c.id);
        catatanPercobaanGagal.set(c.id, akumulasi);
        set((s) => ({
          sessions: s.sessions.map((sess) => ({
            ...sess,
            messages: sess.messages.map((m) =>
              m.id === c.id
                ? {
                    ...m,
                    content: REPETITION_LOOP_INTERRUPTED,
                    error: 'Balasan rusak menjadi pengulangan dan dihentikan.',
                    streaming: false,
                  }
                : m,
            ),
          })),
        }));
        get().cancel();
        return;
      }
    }
    terapkanChunkKeState(c);
    if (c.done || c.err) persist(get());

    /*
     * Drain the queue. Runs after the state settles, so the queued message is
     * sent the moment the previous answer ends — the user does not have to
     * press anything, and the composer stays empty until it goes.
     */
    if (c.done || c.err) {
      const s2 = get();
      const next = (s2.antrians[COMPOSER_AKTIF] ?? [])[0];
      if (next && !(s2.pendings[COMPOSER_AKTIF] ?? null) && !(s2.agentBusys[COMPOSER_AKTIF] ?? false)) {
        // Lewat `kirimAntrian` supaya satu-satunya jalur drain pada mode chat
        // sama dengan mode agent: item HANYA dihapus kalau `send` benar-benar
        // diterima. Kalau tidak (mis. belum ada API key), pesan tetap di
        // antrian dan tidak hilang diam-diam.
        void get().kirimAntrian(0, COMPOSER_AKTIF);
      }
    }
  },

  runInTerminal: async (command, opts) => {
    if (!opts?.confirmed && isDestructive(command)) {
      set({ confirmCmd: command });
      return false;
    }

    const t = useTerminal.getState();

    let pane = t
      .allPanes()
      .find((p) => p.status === 'live' && p.kind !== 'browser' && p.kind !== 'agent');
    if (!pane) {
      const id = await t.addPane('shell');
      if (!id) {
        set({ toast: tx('Could not open a terminal pane'), confirmCmd: null });
        return false;
      }

      await new Promise((r) => setTimeout(r, 700));
      pane = useTerminal.getState().findPane(id);
    }
    if (!pane) return false;
    useTerminal.getState().setVisible(true);
    try {

      const { writeChunked } = await import('./terminalClipboard');
      await writeChunked(pane.id, `${command.replace(/\r?\n/g, '\r')}\r`);
      set({ toast: tx('Command sent to the terminal'), confirmCmd: null });
      return true;
    } catch (e) {
      set({ toast: cmd.asZephyrError(e).message, confirmCmd: null });
      return false;
    }
  },
  };
});

/*
 * Publish this window's live store so a chunk callback can always reach the
 * instance the UI reads — see the note above `useAi`. Guarded so the FIRST
 * registration wins: if the module is evaluated twice, the store that mounted
 * first (and that React therefore renders) keeps the slot, instead of being
 * replaced by a later copy that nothing displays.
 */
if (typeof window !== 'undefined' && !window.__ZEPHYR_AI_STORE__) {
  window.__ZEPHYR_AI_STORE__ = useAi;
}

/*
 * Akumulasi teks per permintaan untuk penjaga pengulangan.
 *
 * Disimpan di luar state Zustand dengan sengaja: potongan datang puluhan kali
 * per detik, dan menaruh salinan penuh jawaban di state berarti menyalin
 * seluruh teks setiap potongan. Peta di tingkat modul memperbarui satu entri
 * saja, dan dibersihkan begitu jawabannya selesai supaya tidak menahan memori
 * percakapan lama.
 */
const akumulasiTeks = new Map<string, number | string>();

/*
 * The last text delta seen for each request, used to drop the duplicate the
 * provider sends on the very next frame.
 *
 * Keyed by the provider's attempt id, not the UI message id: the duplicate
 * arrives on the SAME attempt, so the attempt id is the exact scope of the
 * problem. Cleared when the request reports `done` or `err` so the map holds at
 * most one entry per live request.
 */
const deltaTerakhir = new Map<string, string>();

/*
 * Forget a request's duplicate-detection state.
 *
 * The map is only ever pruned on a TERMINAL frame, so a request that ends
 * without one — cancelled, errored out of the transport, killed by the step
 * watchdog — leaves its entry behind for the life of the page. One string per
 * abandoned request is small, but "small and unbounded" is how a long session
 * with many cancelled runs grows a map that is never read and never freed.
 *
 * Called from the places a request is known to be finished, terminal frame or
 * not.
 */
function lupakanDelta(id: string): void {
  deltaTerakhir.delete(id);
}

/*
 * Coalesce streamed text/reasoning onto one store write per animation frame.
 *
 * WHY: a fast provider emits many small deltas per frame (a token, sometimes a
 * character). Each one used to run a full `set()` that rebuilds every session
 * and message object, so React re-rendered on every delta instead of on every
 * frame - the main thread spent the whole stream reconciling state and the
 * transcript visibly stuttered or stalled.
 *
 * `text` and `reasoning` are appended here and flushed once per frame (rAF, with
 * a setTimeout fallback for when the window is hidden and rAF never fires).
 * Terminal chunks - `done`, `err`, `toolDone` - bypass the buffer entirely and
 * force a synchronous flush first, so the last characters are never stranded and
 * the agent step machine still sees its result on time.
 */
type BufChunk = { text: string; reasoning: string[] };
const chunkBuf = new Map<string, BufChunk>();
let chunkFlushHandle: number | null = null;
let chunkFlushViaTimeout = false;

function jadwalkanFlushChunk(): void {
  if (chunkFlushHandle !== null) return;
  /*
   * Use a timer when rAF cannot be trusted to fire: no rAF at all, OR the
   * document is hidden (Chromium suspends rAF for backgrounded windows, so a
   * stream running while the user is away would sit in the buffer until they
   * return - and could even be flushed after a watchdog already finalised the
   * run). A timer keeps the buffer bounded in both cases.
   */
  const rafTakBisaDiandalkan =
    typeof requestAnimationFrame !== 'function' ||
    (typeof document !== 'undefined' && document.visibilityState === 'hidden');
  if (!rafTakBisaDiandalkan) {
    chunkFlushHandle = requestAnimationFrame(() => {
      chunkFlushHandle = null;
      flushChunkBuf();
    });
  } else {
    /* A timer still bounds the delay so text cannot sit in the buffer
       indefinitely while nothing paints. */
    chunkFlushViaTimeout = true;
    chunkFlushHandle = setTimeout(() => {
      chunkFlushHandle = null;
      chunkFlushViaTimeout = false;
      flushChunkBuf();
    }, 16) as unknown as number;
  }
}

function batalkanFlushChunk(): void {
  if (chunkFlushHandle === null) return;
  if (chunkFlushViaTimeout) clearTimeout(chunkFlushHandle);
  else if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(chunkFlushHandle);
  chunkFlushHandle = null;
  chunkFlushViaTimeout = false;
}

/*
 * The single place a text/reasoning/done/err chunk mutates the store. Split out
 * of `onChunk` so the coalescer above and the direct terminal path below share
 * exactly one implementation - two copies would drift and the buffered frame
 * would stop matching the unbuffered one.
 */
/*
 * Fold ONE reasoning frame into an existing message.
 *
 * Extracted so a buffered frame can be applied one frame at a time (in order)
 * inside a single `set()`. Applying several frames verbatim, rather than a
 * pre-concatenated blob, is what keeps the cumulative/delta heuristic below
 * correct: a cumulative provider sending "A" then "AB" must be seen as two
 * frames, not as "AAB".
 *
 * Some providers send reasoning CUMULATIVE, not as a delta. Appending blindly
 * doubles the text: "TheThe user asks a simple one-s user asks a simple
 * one-sentence question" - which is exactly what came out of the live app.
 * Three cases, cheapest first:
 *
 *   - the frame is already the tail we have: nothing new, keep as is
 *   - the frame restates everything we have and adds more: it is the new full
 *     text, so replace
 *   - the frame is somewhere inside what we have: already seen, skip
 *   - otherwise: a genuine delta, append
 */
function terapkanReasoning(
  m: { reasoning?: string; reasoningMs?: number },
  inc: string,
): { reasoning?: string; reasoningMs?: number } {
  const cur = m.reasoning ?? '';
  const jam = m.reasoningMs === 0 ? Date.now() : m.reasoningMs;
  if (cur.endsWith(inc) || cur.includes(inc)) {
    return { ...m, reasoningMs: jam };
  }
  if (cur && inc.startsWith(cur)) {
    return { ...m, reasoning: inc, reasoningMs: jam };
  }
  return { ...m, reasoning: cur + inc, reasoningMs: jam };
}

function terapkanChunkKeState(c: AiChunk & { reasoningFrames?: string[] }): void {
  /*
   * A buffered frame carries its reasoning as an ordered list; a direct chunk
   * carries a single string. Normalise to a list so one map pass applies all.
   *
   * A `done` frame is excluded on purpose. Rust accumulates the whole turn's
   * reasoning and sends it back on that frame, so it is a REPEAT of what the
   * live frames already folded — treating it as one more delta would double the
   * global `reasoningText` counter, and would stamp the clock with a raw
   * timestamp on a message whose reasoning never streamed (nothing follows a
   * `done` frame to freeze it, so the header would print a fifty-year "Thought
   * for"). It is applied below as a BACKFILL instead, only where it is missing.
   */
  const frames = c.reasoningFrames ?? (c.reasoning && !c.done ? [String(c.reasoning)] : []);
  useAi.setState((s) => {
    /*
     * Dihitung sekali, di luar objek: frame TERMINAL-lah yang menghapus
     * `pending`, dan frame itu juga yang harus mencerminkan penghapusan itu ke
     * `pendings[composerId]` - lihat catatan pada kunci itu di bawah.
     */
    const sisaPending = c.done || c.err ? (s.pending === c.id ? null : s.pending) : s.pending;
    /*
     * Fold the reasoning frames ONCE, outside the message map, and keep the
     * running text so the global `reasoningText` counter uses the same
     * cumulative-aware result as the message body. Joining the raw frames here
     * would re-double a cumulative provider ("A" then "AB" -> "AAB") in the
     * counter even though the bubble is folded correctly.
     */
    let reasoningHasil = '';
    if (frames.length > 0) {
      let acc: { reasoning?: string; reasoningMs?: number } = { reasoning: '', reasoningMs: 0 };
      for (const inc of frames) acc = terapkanReasoning(acc, inc);
      reasoningHasil = acc.reasoning ?? '';
    }
    return {
      sessions: s.sessions.map((sess) => ({
        ...sess,
        messages: sess.messages.map((m) => {
          if (m.id !== c.id) return m;
          if (c.err) return { ...m, error: c.err, streaming: false };

          /*
           * Apply reasoning and text INDEPENDENTLY, then merge.
           *
           * They must not be branches of one another: a single coalesced frame
           * routinely carries the tail of the reasoning AND the first answer
           * token (the thinking->answer transition). An earlier version returned
           * after the reasoning branch, silently dropping that first token and
           * starting the answer mid-sentence. Both fields are applied here and
           * merged in one object.
           */
          let patch: Partial<ChatMsg> = {};

          if (frames.length > 0) {
            /*
             * The reasoning clock.
             *
             * `reasoningMs === 0` means "reasoning has not started yet" — the
             * first reasoning frame stamps it with the wall clock, and the
             * first answer token freezes the elapsed time. Everything after
             * that is ignored, so the header keeps the duration of the thinking
             * alone and not of the whole answer that followed it.
             */
            let next: { reasoning?: string; reasoningMs?: number } = {
              reasoning: m.reasoning,
              reasoningMs: m.reasoningMs,
            };
            for (const inc of frames) next = terapkanReasoning(next, inc);
            patch = { ...patch, ...next };
          }

          if (c.text) {
            /*
             * Freeze the clock on the first answer token.
             *
             * The value is a timestamp while thinking is in progress (anything
             * above 1e12 is a 13-digit epoch, a duration never is) and a
             * duration once frozen. Checking the magnitude is what keeps the
             * second answer token from re-measuring: without it the small
             * duration would be read as a timestamp again and the header would
             * print a fifty-year "Thought for".
             *
             * Read from the MERGED value, not from `m`: when the first reasoning
             * frame and the first answer token arrive in the SAME coalesced
             * frame, the reasoning branch has just stamped `patch.reasoningMs`
             * with the wall clock. Reading `m.reasoningMs` (still 0) here would
             * zero that stamp back out, and the "Thought for" duration would
             * never render for the whole answer.
             */
            const base = patch.reasoningMs ?? m.reasoningMs;
            const ms =
              typeof base === 'number' && base > 1e12 ? Date.now() - base : base;
            patch = { ...patch, content: m.content + c.text, reasoningMs: ms };
          }

          /*
           * Backfill the reasoning on the `done` frame.
           *
           * The live frames already folded it in the normal case, so this is a
           * no-op then. It matters when they did not: a provider that reports
           * its chain of thought only on the terminal frame, or a stream whose
           * reasoning arrived while the panel was not listening. Rust holds the
           * whole turn's text, so the message ends up with it either way, and
           * nothing is stamped on the clock — the duration belongs to the live
           * frames, and a `done` frame has no answer token left to freeze it.
           */
          if (c.done && c.reasoning && !m.reasoning) {
            patch = { ...patch, reasoning: c.reasoning };
          }
          if (c.done) {
            patch = {
              ...patch,
              streaming: false,
              ...(c.reasoningSignature ? { reasoningSignature: c.reasoningSignature } : {}),
            };
          }

          if (Object.keys(patch).length > 0) return { ...m, ...patch };
          return m;
        }),
      })),
      pending: sisaPending,

      /*
       * Dicerminkan di sini karena setter ini MENTAH: `onChunk` berjalan per
       * token dan sengaja melewati pembungkus `mirrorRun`, sehingga salinan
       * per-permukaan `pendings[composerId]` dulu tertinggal memegang id
       * request yang sudah selesai. Setiap pembaca peta per-permukaan lalu
       * melihat "sibuk" selamanya setelah satu turn - strip status tetap
       * 'Thinking' dan peluncuran berikutnya ditolak sebagai run yang masih
       * jalan. Hanya frame terminal yang mengubah nilai ini, jadi hanya frame
       * terminal yang membayar salinannya.
       */
      ...(c.done || c.err ? { pendings: { ...s.pendings, [COMPOSER_AKTIF]: sisaPending } } : {}),

      reasoningText: reasoningHasil ? (s.reasoningText ?? '') + reasoningHasil : s.reasoningText,
    };
  });
}

/*
 * Apply the buffered deltas, one store write per request id.
 *
 * Not literally "one write": a write is per id, and each maps over every
 * session. In practice the map holds a single entry (the main answer), so this
 * is one write per frame - the win over per-token writes. The per-id split is
 * what keeps the merge correct if more than one stream is live at once: each
 * write touches only the message that actually changed.
 */
function flushChunkBuf(): void {
  if (chunkBuf.size === 0) return;
  const entries = [...chunkBuf.entries()];
  chunkBuf.clear();
  batalkanFlushChunk();
  for (const [id, buf] of entries) {
    if (!buf.text && buf.reasoning.length === 0) continue;
    /*
     * Keep the AI debug panel fed. Buffered chunks return early from `onChunk`
     * (above the per-chunk `potong` call), so without this the panel would show
     * zero traffic for everything that went through the coalescer. Count the
     * bytes actually carried, once per flush instead of once per delta - the
     * panel's totals are what matter, not the frame count.
     */
    const chars = buf.text.length + buf.reasoning.reduce((n, r) => n + r.length, 0);
    useAiDebug.getState().potong(id, chars);
    terapkanChunkKeState({
      id,
      text: buf.text || undefined,
      reasoningFrames: buf.reasoning.length ? buf.reasoning : undefined,
    });
  }
}

/** Ambang sadar-kontek: di bawah ini pemeriksaan tidak layak dijalankan. */
const AMBANG_TENGAH = 1_200;

function teksAkumulasi(id: string): string {
  const v = akumulasiTeks.get(id);
  return typeof v === 'string' ? v : '';
}

function simpanTeksAkumulasi(id: string, teks: string): void {
  akumulasiTeks.set(id, teks);
}

function hapusTeksAkumulasi(id: string): void {
  akumulasiTeks.delete(id);
}

/**
 * Pemeriksaan ringan SELAMA jawaban mengalir.
 *
 * Dipakai lebih awal daripada penjaga akhir karena kuota yang dihemat di sini
 * bisa puluhan ribu token: loop yang jelas tidak perlu dibiarkan sampai
 * jawabannya "selesai" dulu. Sementara ini SENGAJA hanya memakai salah satu
 * lapis pengulangan, supaya tidak ada jawaban yang valid terpotong di tengah
 * hanya karena kebetulan berpola.
 */
function periksaSedangMengulang(teks: string): boolean {
  if (teks.length < AMBANG_TENGAH) return false;
  return mengulangDominan(teks).ya;
}

/* ------------------------------------------------------------------ */
/* LAMA-a2: pemadatan riwayat MURNI (tanpa panggilan model)            */
/* ------------------------------------------------------------------ */

/*
 * Kenapa ada varian MURNI di samping `padatkanRiwayat` yang sudah ada.
 *
 * `padatkanRiwayat` memanggil model untuk menulis ringkasan. Itu pintar, tapi
 * punya tiga sifat yang membuatnya tidak selalu bisa diandalkan - dan riwayat
 * yang MENDEKATI ambang tidak selalu punya waktu untuk satu panggilan model lagi:
 *
 *   1. Ia bisa GAGAL (catch -> null): jaringan, kuota, provider menolak. Saat
 *      gagal, riwayat dibiarkan utuh dan siklus berikutnya mencoba lagi - sambil
 *      tetap di atas ambang.
 *   2. Ia bisa membatalkan dirinya (`sesudah >= sebelum`): ringkasan model lebih
 *      panjang dari bahannya. Kejadian nyata, terukur di komentar di bawah ini.
 *   3. Ia tidak menjamin APA yang bertahan. Prompt-nya MEMINTA agar pekerjaan
 *      yang belum selesai dipertahankan, tetapi yang mengerjakan itu model:
 *      daftar tugas yang setengah jalan bisa hilang tanpa ada yang menyadarinya.
 *
 * Fungsi di bawah ini menutup ketiganya dengan sifat yang berlawanan: tanpanya
 * tidak ada model, tanpa jaringan, dan jaminannya diperiksa mesin - item tugas
 * yang belum selesai TIDAK PERNAH dibuang, ia dikutip ulang verbatim di catatan
 * DAN dikirim sebagai pesan terpisah di depan ekor riwayat.
 *
 * Ambang dan rasio (angka yang sama ditulis di docs/ANAK-AGEN-PERILAKU.md):
 *
 *   - Ambang padat  : AMBANG_PADAT_RASIO = AUTO_COMPACT_AT = 0,80 dari JENDELA
 *                     KONTEKS model, dan satuannya TOKEN - satuan yang sama dengan
 *                     meter konteks (`perkiraanKonteks`). Untuk model yang tidak
 *                     dikenal `jendelaKonteks` memakai 128.000 token
 *                     -> AMBANG_PADAT_TOKEN = 102.400 token.
 *                     Di atas ambang ini pemadatan perlu jalan.
 *                     (Jangan menghitung ambang dari PAYLOAD_MAX_CHARS: itu
 *                     KARAKTER 40.000 -> 32.000, sedangkan `perkiraanKonteks`
 *                     mengembalikan token; pemadatan jadi praktis tidak pernah
 *                     menyala karena 32.000 token baru tercapai di ~128.000
 *                     karakter. Pemanggil yang tahu modelnya boleh menurunkan
 *                     ambang lewat `batasToken`.)
 *   - Ekor utuh     : PADAT_SIMPAN_EKOR = AUTO_COMPACT_KEEP = 6 pesan terakhir
 *                     (dan tiap pesan di depan ekor yang lebih tua digemukkan
 *                     2x lipat ekor ini untuk dipadatkan, sama seperti
 *                     `ringkasRiwayat`).
 *   - Rasio ringkas : RASIO_RINGKAS_TARGET = 0,50 -> catatan ringkasan + kutipan
 *                     tugas/berkas harus <= 50% perkiraan token bahan yang
 *                     digantikan. Kalau ternyata TIDAK mengecil, pemadatan
 *                     murni membatalkan dirinya (`dipadatkan: false`) dan
 *                     riwayat asli dikembalikan - persis sikap `padatkanRiwayat`.
 */

/** Rasio ambang terhadap JENDELA KONTEKS model (0,80) - dipinjam dari contextBudget. */
export const AMBANG_PADAT_RASIO: number = AUTO_COMPACT_AT;

/**
 * Ambang: pemadatan perlu jalan bila perkiraan konteks melewati rasio ini.
 *
 * Satuannya TOKEN, sama seperti `perkiraanKonteks` dan `batasAutoCompact(model)`.
 * Default memakai jendela model tak dikenal (128.000 token, `jendelaKonteks`) -
 * jadi ambang default = 102.400 token, dan pemanggil yang tahu modelnya sebaiknya
 * mengirim `batasAutoCompact(modelId)` sebagai `batasToken`.
 */
export const AMBANG_PADAT_TOKEN: number = Math.round(128_000 * AMBANG_PADAT_RASIO);

/** Jumlah pesan terakhir yang selalu dikirim utuh. */
export const PADAT_SIMPAN_EKOR: number = AUTO_COMPACT_KEEP;

/** Target: hasil pemadatan <= rasio ini dari bahan yang digantikannya. */
export const RASIO_RINGKAS_TARGET = 0.5;

/** Batas jumlah butir keputusan / berkas / panjang kutipan di catatan. */
export const PADAT_BATAS_KEPUTUSAN = 12;
export const PADAT_BATAS_BERKAS = 20;
export const PADAT_BATAS_POTONGAN = 220;
export const PADAT_BATAS_BARIS_USER = 6;

export interface ItemTugasBelum {
  content: string;
  status: string;
}

export interface HasilPadatMurni {
  /** Riwayat untuk dikirim. Sama dengan masukan bila `dipadatkan: false`. */
  history: AgentMsg[];
  dipadatkan: boolean;
  /** Kenapa dipadatkan / kenapa tidak - dibaca manusia & harness. */
  alasan: string;
  /** Perkiraan token sebelum & sesudah. */
  sebelum: number;
  sesudah: number;
  /** Jumlah pesan lama yang digantikan catatan. */
  diringkas: number;
  keputusan: string[];
  /** WAJIB: semua item tugas yang belum selesai, apa adanya. */
  tugasBelum: string[];
  berkas: string[];
  catatan: string;
  /** Jejak langkah keputusan, satu baris per pemeriksaan. */
  jejak: string[];
}

const STATUS_SELESAI = new Set(['done', 'completed', 'complete', 'selesai']);

function belumSelesai(status: string): boolean {
  return !STATUS_SELESAI.has(String(status ?? '').toLowerCase());
}

function rapi(teks: string, batas: number = PADAT_BATAS_POTONGAN): string {
  const t = String(teks ?? '').replace(/\s+/g, ' ').trim();
  return t.length > batas ? `${t.slice(0, batas)}…` : t;
}

/** Tool yang argumennya menyebut path - sumber "berkas yang sedang digarap". */
const ALAT_BERKAS = new Set([
  'read_file', 'write_file', 'multi_edit', 'replace_in_files', 'delete_file', 'move_file', 'copy_file',
]);

const KUNCI_PATH = ['path', 'file_path', 'paths', 'files', 'old_path', 'new_path', 'target', 'from', 'to'];

/** Path yang disebut di argumen tool call. */
export function pathDariArgs(args: Record<string, unknown> | undefined): string[] {
  if (!args) return [];
  const hasil: string[] = [];
  for (const k of KUNCI_PATH) {
    const v = args[k];
    if (typeof v === 'string') hasil.push(v);
    else if (Array.isArray(v)) for (const x of v) if (typeof x === 'string') hasil.push(x);
  }
  return hasil.filter((p) => p.length > 1 && !/^https?:/i.test(p));
}

const POLA_PATH =
  /(?:[A-Za-z]:)?[\w.@-]*(?:\/[\w.@-]+)+\.\w{1,5}|[\w-]+\.(?:ts|tsx|js|jsx|mjs|cjs|rs|json|md|css|html|yml|yaml|toml|py|sh|ps1|txt|csv)\b/g;

/** Path yang disebut di dalam teks bebas (prosa asisten, log shell, catatan). */
export function pathDariTeks(teks: string): string[] {
  const hasil: string[] = [];
  const cocok = String(teks ?? '').match(POLA_PATH);
  if (!cocok) return hasil;
  for (const x of cocok) {
    const p = x.replace(/^\.\//, '');
    if (p.length > 2 && !p.startsWith('//') && !/^v?\d+\.\d+\.\d+$/.test(p)) hasil.push(p);
  }
  return hasil;
}

/**
 * TUGAS YANG BELUM SELESAI - inti jaminan LAMA-a2.
 *
 * Sumber, dari yang paling otoritatif:
 *   1. `todos` yang diberikan pemanggil (state `agentTodos` di store).
 *   2. Argumen `todo_write` di riwayat (rencana yang pernah ditulis model).
 *   3. Baris kotak centang di transkrip: `- [ ] ...`, `- [~] ...` (yang `[x]`
 *      dilewati karena sudah selesai).
 *
 * Tidak ada batas jumlah: membatasi daftar ini berarti membuang pekerjaan yang
 * belum selesai, dan itu justru yang dilarang.
 */
export function tugasBelumSelesaiRiwayat(
  history: readonly AgentMsg[],
  todos?: ReadonlyArray<ItemTugasBelum>,
): string[] {
  const hasil: string[] = [];
  const lihat = (isi: string) => {
    const t = rapi(isi, 300);
    if (t && !hasil.includes(t)) hasil.push(t);
  };

  for (const t of todos ?? []) {
    if (belumSelesai(t.status)) lihat(t.content);
  }

  for (const m of history) {
    for (const c of m.toolCalls ?? []) {
      if (c.name !== 'todo_write') continue;
      const list = ((c.args ?? {}) as Record<string, unknown>).todos;
      if (!Array.isArray(list)) continue;
      for (const it of list) {
        const item = (it ?? {}) as Record<string, unknown>;
        if (belumSelesai(String(item.status ?? 'pending'))) lihat(String(item.content ?? ''));
      }
    }
  }

  for (const m of history) {
    const teks = String(m.content ?? '');
    if (!teks.includes('[')) continue;
    for (const baris of teks.split('\n')) {
      const k = /^\s*[-*]\s*\[([ ~xX])\]\s*(.+?)\s*$/.exec(baris);
      if (!k) continue;
      if (k[1].toLowerCase() === 'x') continue;
      lihat(k[2]);
    }
  }

  return hasil;
}

/**
 * Berkas yang paling terakhir disentuh - "berkas yang sedang digarap".
 *
 * Dua sumber: argumen tool berkas (paling akurat) dan path yang disebut di teks.
 * Urutan kemunculan dipertahankan dengan asas "sebutan terakhir menang", lalu
 * `batas` item TERAKHIR yang dikembalikan: yang paling akhir disentuh biasanya
 * yang paling relevan untuk melanjutkan.
 */
export function berkasDisentuhRiwayat(history: readonly AgentMsg[], batas: number = PADAT_BATAS_BERKAS): string[] {
  const urut: string[] = [];
  const ambil = (p: string) => {
    const b = p.trim();
    if (!b) return;
    const i = urut.indexOf(b);
    if (i >= 0) urut.splice(i, 1);
    urut.push(b);
  };
  for (const m of history) {
    for (const c of m.toolCalls ?? []) {
      if (!ALAT_BERKAS.has(c.name)) continue;
      for (const p of pathDariArgs((c.args ?? {}) as Record<string, unknown>)) ambil(p);
    }
  }
  for (const m of history) {
    if (m.role === 'system') continue;
    for (const p of pathDariTeks(String(m.content ?? ''))) ambil(p);
  }
  return urut.length > batas ? urut.slice(urut.length - batas) : urut;
}

const POLA_KEPUTUSAN =
  /\b(keputusan|diputuskan|disepakati|sepakat|dipilih|pilih|karena|sebab|dilarang|jangan|wajib|harus|rencana|strategi|root cause|penyebab|kesimpulan|catatan penting|syarat)\b/i;

/**
 * KEPUTUSAN PENTING yang tidak boleh dibongkar ulang.
 *
 * Tujuan awal user selalu ikut (kalimat pertama pesan user pertama): itu keputusan
 * paling mahal untuk hilang. Sisanya baris-baris asisten yang memuat penanda
 * keputusan; yang diambil adalah yang PALING BARU, karena keputusan lama yang
 * sudah digantikan tidak perlu dibawa lagi.
 */
export function keputusanPentingRiwayat(
  history: readonly AgentMsg[],
  batas: number = PADAT_BATAS_KEPUTUSAN,
): string[] {
  const tujuan: string[] = [];
  const lain: string[] = [];
  const tambah = (daftar: string[], isi: string) => {
    const t = rapi(isi.replace(/^\s*(?:[-*#>]|\d+[.)])\s*/, ''));
    if (t.length >= 20 && !tujuan.includes(t) && !lain.includes(t)) daftar.push(t);
  };
  const userPertama = history.find((m) => m.role === 'user' && String(m.content ?? '').trim().length > 0);
  if (userPertama) tambah(tujuan, String(userPertama.content).split('\n')[0]);
  for (const m of history) {
    if (m.role !== 'assistant') continue;
    for (const baris of String(m.content ?? '').split('\n')) {
      if (POLA_KEPUTUSAN.test(baris)) tambah(lain, baris);
    }
  }
  const sisa = Math.max(0, batas - tujuan.length);
  return [...tujuan, ...lain.slice(lain.length > sisa ? lain.length - sisa : 0)];
}

/**
 * Catatan ringkasan. Tugas belum selesai dan berkas yang digarap DITULIS DI SINI
 * sebagai teks - jadi meski ada lapis lain yang memangkas pesan, isinya tetap ada
 * di dalam pesan ringkasan itu sendiri.
 */
export function catatanPadatMurni(input: {
  diringkas: number;
  keputusan: string[];
  tugasBelum: string[];
  berkas: string[];
}): string {
  const baris: string[] = [];
  baris.push(
    `[RINGKASAN RIWAYAT (murni, tanpa panggilan model): ${input.diringkas} pesan lama diringkas ` +
      `supaya percakapan tetap cepat. Kerjakan dari ringkasan ini. Kalau butuh detail yang tidak ada ` +
      `di sini, ULANGI tool yang bersangkutan - jangan mengarang isinya.]`,
  );
  if (input.keputusan.length) {
    baris.push('', 'KEPUTUSAN PENTING (jangan dibongkar ulang):');
    for (const k of input.keputusan) baris.push(`- ${k}`);
  }
  if (input.tugasBelum.length) {
    baris.push('', 'TUGAS BELUM SELESAI (WAJIB diteruskan, jangan dihapus, jangan diklaim selesai):');
    for (const t of input.tugasBelum) baris.push(`- [ ] ${t}`);
  }
  if (input.berkas.length) {
    baris.push('', 'BERKAS YANG SEDANG DIGARAP (yang paling akhir disebut di bawah):');
    for (const f of input.berkas) baris.push(`- ${f}`);
  }
  return baris.join('\n');
}

/** Perlu dipadatkan sekarang? (murni: hanya melihat perkiraan konteks) */
export function perluPadatRiwayatMurni(
  history: readonly AgentMsg[],
  batasToken: number = AMBANG_PADAT_TOKEN,
): boolean {
  return perkiraanKonteks([...history]) > batasToken;
}

/**
 * Padatkan riwayat TANPA panggilan model.
 *
 * Jaminan yang dipegang fungsi ini, dalam urutan kepentingan:
 *   1. Item tugas yang belum selesai tidak pernah hilang (dikutip di catatan DAN
 *      dikirim sebagai pesan tersendiri).
 *   2. Pemadatan yang tidak mengecil dibatalkan; riwayat asli dikembalikan.
 *   3. Riwayat `system` selalu utuh dan tetap di depan.
 *   4. Deterministik: masukan sama -> hasil sama, tanpa jam/jaringan/acak.
 */
export function padatkanRiwayatMurni(
  history: readonly AgentMsg[],
  opts: { todos?: ReadonlyArray<ItemTugasBelum>; paksa?: boolean; batasToken?: number } = {},
): HasilPadatMurni {
  const batasToken = opts.batasToken ?? AMBANG_PADAT_TOKEN;
  const asli = [...history];
  const sebelum = perkiraanKonteks(asli);
  const keputusan = keputusanPentingRiwayat(asli);
  const tugasBelum = tugasBelumSelesaiRiwayat(asli, opts.todos);
  const berkas = berkasDisentuhRiwayat(asli);
  const jejak: string[] = [
    `ambang: perkiraan=${sebelum} token; batas=${batasToken} token; paksa=${opts.paksa === true}; ekorUtuh=${PADAT_SIMPAN_EKOR}`,
    `ditemukan: keputusan=${keputusan.length} tugasBelum=${tugasBelum.length} berkas=${berkas.length}`,
  ];
  const hasil: HasilPadatMurni = {
    history: asli,
    dipadatkan: false,
    alasan: '',
    sebelum,
    sesudah: sebelum,
    diringkas: 0,
    keputusan,
    tugasBelum,
    berkas,
    catatan: '',
    jejak,
  };

  if (opts.paksa !== true && sebelum <= batasToken) {
    hasil.alasan = `riwayat masih di bawah ambang (${sebelum} <= ${batasToken} token): tidak dipadatkan`;
    jejak.push(hasil.alasan);
    return hasil;
  }

  const system = asli.filter((m) => m.role === 'system');
  const sisanya = asli.filter((m) => m.role !== 'system');
  if (sisanya.length <= PADAT_SIMPAN_EKOR) {
    hasil.alasan = `hanya ${sisanya.length} pesan non-system <= ekor utuh (${PADAT_SIMPAN_EKOR}): tidak ada bahan`;
    jejak.push(hasil.alasan);
    return hasil;
  }

  const batas = Math.max(0, sisanya.length - PADAT_SIMPAN_EKOR * 2);
  const lama = sisanya.slice(0, batas);
  const baru = sisanya.slice(batas);
  if (lama.length === 0) {
    hasil.alasan = 'tidak ada pesan lama yang bisa diringkas setelah menyisakan ekor utuh';
    jejak.push(hasil.alasan);
    return hasil;
  }

  const ringkasLama: AgentMsg[] = lama.map((m) => {
    const tanpaGambar = m.images?.length ? { ...m, images: undefined } : m;
    if (m.role === 'tool') return { ...tanpaGambar, content: potongHasilRiwayat(String(m.content ?? '')) };
    if (m.role === 'assistant') {
      const teks = String(m.content ?? '');
      return {
        ...tanpaGambar,
        content: teks.length > HISTORY_TOOL_CHARS ? `${teks.slice(0, HISTORY_TOOL_CHARS)}…` : teks,
        toolCalls: undefined,
      };
    }
    return tanpaGambar;
  });
  const utuh = baru.map((m, i, arr) =>
    i < arr.length - 1 && m.images?.length ? { ...m, images: undefined } : m,
  );

  const catatan = catatanPadatMurni({ diringkas: lama.length, keputusan, tugasBelum, berkas });
  const pesanCatatan: AgentMsg = { role: 'user', content: catatan };
  /* Pesan penjaga: kutipan tugas belum selesai ditaruh SENDIRI di depan ekor. */
  const penjaga: AgentMsg[] = tugasBelum.length
    ? [
        {
          role: 'user',
          content:
            `[TUGAS BELUM SELESAI - diteruskan dari riwayat yang diringkas. JANGAN diklaim selesai; ` +
            `kerjakan satu per satu.]\n` +
            tugasBelum.map((t) => `- [ ] ${t}`).join('\n'),
        },
      ]
    : [];

  const gabungan: AgentMsg[] = [...system, pesanCatatan, ...penjaga, ...ringkasLama, ...utuh];
  const sesudah = perkiraanKonteks(gabungan);
  jejak.push(`catatan=${catatan.length} karakter; pesanRingkas=${ringkasLama.length}; penjagaTugas=${penjaga.length}`);
  jejak.push(`ukuran: sebelum=${sebelum} sesudah=${sesudah} target=${Math.round(sebelum * RASIO_RINGKAS_TARGET)}`);

  if (sesudah >= sebelum) {
    /* Sama seperti `padatkanRiwayat`: pemadatan yang tidak mengecil bukan
       pemadatan. Riwayat asli dikembalikan utuh - termasuk tugas belum selesai. */
    hasil.alasan = `dibatalkan: hasil (${sesudah}) tidak lebih kecil dari aslinya (${sebelum})`;
    hasil.sesudah = sesudah;
    jejak.push(hasil.alasan);
    return hasil;
  }

  hasil.history = gabungan;
  hasil.dipadatkan = true;
  hasil.sesudah = sesudah;
  hasil.diringkas = lama.length;
  hasil.catatan = catatan;
  hasil.alasan =
    `${lama.length} pesan lama diringkas; ${sebelum} -> ${sesudah} token ` +
    `(tugas belum selesai yang dipertahankan: ${tugasBelum.length})`;
  jejak.push(hasil.alasan);
  return hasil;
}

