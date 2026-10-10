import { create } from 'zustand';
import { subagentOnChunk } from './subagentStore';
import {
  mengulangDominan,
  mengulangPelarian,
  REPETITION_LOOP_INTERRUPTED,
} from './repeatDetect';
import * as cmd from './commands';
import { useStore } from './store';
import { findModel, isPlaceholderModel, MODEL_FALLBACK, PROVIDER_BY_ID } from './modelCatalog';
import { useSettingsUi } from './settingsStore';
import { expandPromptBody } from './promptLibrary';
import { stopLoop, startLoop, parseInterval, formatInterval, MAX_LOOP_RUNS, type LoopState } from './loopJadwal';
import { activeSelection } from './editorRegistry';
import { useAiDebug } from './aiDebugStore';
import { useToolGate, TOOL_DISK_TULIS } from './toolGate';
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

// Old session titles from versions before the UI was standardised to English — mapped
// back when loaded so already-saved history also shows up in English.
const JUDUL_LAMA = new Set(['Chat baru', 'New Chat', 'Neuer Chat', 'Nueva conversación']);

export const MAX_MSGS = 200;

export const ATTACH_LIMIT = 12 * 1024;

export const MSG_LIMIT = 8 * 1024;

export const MAX_IMAGES = 10;

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

import { systemPromptFor, identityReminder, aturanProyek } from './systemPrompt';

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
  'write_file', 'edit', 'multi_edit', 'replace_in_files', 'create_directory',
  'copy_file', 'move_file', 'delete_file',
  'bash_run', 'bash_background', 'bash_kill', 'mcp__zephyr__sh', 'sh',
  'browser_open', 'browser_click', 'browser_type', 'browser_nav', 'browser_close',
  'system_browser_open', 'browser_download_url', 'open_preview',
  'subagent_run', 'subagent_kirim', 'subagent_batal',
  'todo_write', 'schedule_command', 'cancel_schedule', 'notes_write',
  'set_setting', 'run_command', 'ssh', 'worktree', 'extension', 'pane',
  'workspace', 'focus_pane', 'suggest_command',
]);
const TOOL_BROWSER = new Set([
  'browser_open',
  'browser_read',
  'browser_nav',
  'browser_click',
  'browser_type',
  'browser_close',
  'browser_list',
  'system_browser_open',
  'web_fetch',
  'web_search',
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
}

function urlBrowserDinormalisasi(nama: string, args: Record<string, unknown>): string {
  if (nama !== 'browser_open' && nama !== 'system_browser_open') return '';
  return String(args.url ?? '')
    .trim()
    .toLowerCase()
    .replace(/\/+$/, '');
}

export function cekMuterBrowser(
  terbuka: boolean,
  muter: number,
  urlSudahTerbuka: readonly string[],
  nama: string,
  args: Record<string, unknown>,
): HasilMuterBrowser {
  /* Sebelum ada halaman, atau untuk tool yang bukan browser: bukan muter, dan
     penghitung tidak boleh disentuh. */
  if (!terbuka || !TOOL_BROWSER.has(nama)) return { muter, berhenti: false };

  const url = urlBrowserDinormalisasi(nama, args);
  if (url && !urlSudahTerbuka.includes(url)) {
    /* Halaman yang belum pernah dibuka: ini kemajuan sungguhan, termasuk
       ketika dipanggil lewat browser_close lalu browser_open lagi. */
    return { muter: 0, berhenti: false };
  }

  const berikut = muter + 1;
  return { muter: berikut, berhenti: berikut >= BATAS_BROWSER_MUTER };
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
      ? `- Active workspace: ${workspace.replace(/\\/g, '/')}`
      : '- Active workspace: none open (no workspace folder is open - ask the user to open one instead of assuming a path)',
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

export function ringkasRiwayat(history: AgentMsg[], cap: number = PAYLOAD_MAX_CHARS): AgentMsg[] {
  const system = history.filter((m) => m.role === 'system');
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
      const isi = String(m.content ?? '');
      return {
        ...tanpaGambar,
        content:
          isi.length > HISTORY_TOOL_CHARS
            ? `${isi.slice(0, HISTORY_TOOL_CHARS)}\n[… result truncated, ${isi.length - HISTORY_TOOL_CHARS} more characters are not sent]`
            : isi,
      };
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
  return { history: baruHistory, sebelum, sesudah: perkiraanKonteks(baruHistory), diringkas: lama.length };
}

let seq = 0;
const nextId = (p: string) => `${p}-${Date.now().toString(36)}-${++seq}`;

// Multi-file tasks commonly need more than 60 tool turns. Keep a finite
// safety cap, but do not stop a healthy agent halfway through a normal task.
export const MAX_AGENT_STEPS = 120;

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

export const MAX_TODOS = 20;

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
 * Penunggu jawaban `ask_user`.
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
const AGENT_IDLE_MS = 360_000;
let agentWatchdog: ReturnType<typeof setTimeout> | null = null;

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
const AGENT_HARD_LIMIT_MS = 15 * 60_000;
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
      error: 'Satu langkah melebihi batas 15 menit dan dihentikan.',
    });
    // If no step is waiting (the run hung outside the loop), release the UI
    // directly - the resolved step can no longer do it from inside the loop.
    if (!r) {
      useAi.setState({
        agentBusy: false,
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
 * Shortened from [15s, 30s, 60s] (~105s) to a ~26s total. The long ladder made
 * a transient gateway hiccup look like the app had frozen: the user stared at
 * "waiting for provider" for over a minute. opencode/Hermes recover in a few
 * seconds and treat a longer outage as an error the user should see (and can
 * act on by switching model), rather than a silence. The behaviour is the same
 * - retry on the same step, then fall back to another model - just without the
 * minute-long dead wait.
 */
const TUNGGU_PULIH_DELAYS = [3000, 8000, 15000] as const;

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
      useAi.setState({ agentBusy: false, pending: null, agentConfirm: null, agentPhase: 'idle', agentCurrentTool: null, agentStepIndex: 0, agentStepLimit: MAX_AGENT_STEPS, agentLastProgressAt: null, agentStartedAt: null });
    }
  }, AGENT_IDLE_MS);
}

function agentWatchdogDisarm() {
  if (agentWatchdog) clearTimeout(agentWatchdog);
  agentWatchdog = null;
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
     * Per-surface ids are restored too, but any that lost its chat (trimmed to
     * the last 20, or deleted on another window) falls back to the primary —
     * a surface pointing at a missing session would render an empty transcript
     * with no way to tell why.
     */
    const activeIds: Record<string, string | null> = { '': activeId };
    for (const [k, v] of Object.entries(parsed.activeIds ?? {})) {
      if (k === '') continue;
      activeIds[k] = sessions.some((s) => s.id === v) ? v : activeId;
    }
    return { sessions, activeId, activeIds };
  } catch {
    return { sessions: [], activeId: null, activeIds: {} };
  }
}

export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high' | 'ultra';

export type AgentPhase = 'idle' | 'thinking' | 'running-tool' | 'waiting-confirmation' | 'cancelling';

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
   * Pertanyaan yang sedang menunggu jawaban user, diisi tool `ask_user`.
   *
   * `pilihan` boleh kosong: kalau ada isinya, UI menampilkan tombol pilihan
   * cepat di samping kotak ketik bebas.
   */
  agentTanya: { pertanyaan: string; pilihan: string[] } | null;

  agentTodos: AgentTodo[];
  /**
   * Kartu saran perintah dari tool `suggest_command`.
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

  setModel: (modelId: string) => Promise<void>;
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
  setTipsVisible: (v: boolean) => void;
  setApprovalMode: (m: ApprovalMode) => void;

  agentPutuskan: (setujui: boolean) => void;
  setAgentProgress: (progress: Partial<AgentProgress>) => void;

  /**
   * Ajukan pertanyaan ke user dan tunggu jawabannya.
   *
   * Mengembalikan jawaban yang diketik user, atau `null` kalau pertanyaannya
   * dibatalkan (ditutup tanpa dijawab). Dipakai tool `ask_user`: model yang
   * menemukan instruksi ambigu berhenti dan bertanya, alih-alih menebak lalu
   * mengerjakan hal yang salah.
   */
  agentAjukanTanya: (pertanyaan: string, pilihan?: string[]) => Promise<string | null>;
  /** Jawab pertanyaan yang sedang menunggu. Dipanggil dari UI. */
  jawabTanya: (jawaban: string | null) => void;

  setAgentTodos: (list: unknown[]) => number;

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
  compactContext: (keep?: number) => number;

  newChat: (id?: string) => string;
    selectChat: (id: string, composerId?: string) => void;
    deleteChat: (id: string) => void;

    clearAllChats: () => void;

    clearAllOpen: boolean;
    setClearAllOpen: (v: boolean) => void;

    regenerate: () => Promise<void>;
    activeSession: () => ChatSession | null;

    exportChat: () => Promise<void>;

  send: (text?: string, images?: string[], composerId?: string) => Promise<boolean>;

  /* Drop one queued message, or clear the whole queue. */
  buangAntrian: (idx: number | string) => void;
  kosongkanAntrian: () => void;

  /** Set (or clear, with null) the loop for a chat. The timer is armed here. */
  setLoop: (sessionId: string, loop: LoopState | null) => void;
  /** Stop the loop for a chat and forget it. */
  hentikanLoop: (sessionId: string) => void;
  /**
   * Handle `/loop` and `/goal`. Returns true when the command was consumed, so
   * the caller stops and sends nothing to the provider.
   */
  jalankanPerintahKerja: (teks: string, sessionId: string) => boolean;
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
  kirimAntrian: (idx: number | string) => Promise<boolean>;
  /**
   * Move one queued message one place up or down the line.
   *
   * The queue is a plain list, so reordering it only has to move the entry the
   * user pointed at and leave the rest where they are. The ends are quiet
   * no-ops because the panel already disables the button there; the guard is
   * what makes a stray call harmless rather than a way to install undefined.
   */
  naikkanAntrian: (idx: number | string) => void;
  turunkanAntrian: (idx: number | string) => void;
  /*
   * Rewrite one queued message in place.
   *
   * Editing beats delete-and-retype: the queue slot keeps its position, so a
   * reader fixing a typo in the fifth message does not have to rebuild the
   * other four. Blank input is refused rather than saved, so a cleared field is
   * not a way to lose the message by accident.
   */
  ubahAntrian: (idx: number | string, teks: string) => void;
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

/** Last agent mode the user picked, kept across sessions. */
function bootAgentMode(): 'chat' | 'agent' {
  try {
    // New sessions start in Agent mode so a prompt can actually inspect and
    // change the project. Users can still switch to Chat from the composer.
    return localStorage.getItem('zephyr.ai.mode') === 'chat' ? 'chat' : 'agent';
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


export const useAi = create<AiStore>((set, get) => ({
  sessions: boot.sessions,
  activeId: boot.activeId,
  activeIds: boot.activeIds,
  model: 'custom-model',
  provider: 'custom',
  pending: null,
  antrian: [],
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

  approvalMode: boot.sessions.find((s) => s.id === boot.activeId)?.approval ?? 'auto',
  agentBusy: false,
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
    let prov: string;
    if (aktif && adaKey.includes(aktif)) {

      prov = aktif;
    } else if (adaKey.length > 0) {

      prov = adaKey[0];
    } else if (aktif && dikenal(aktif)) {
      prov = aktif;
    } else {
      prov = 'custom';
    }

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
    const models = useStore.getState().settings.models;
    const target = models?.activeProvider;
    if (!target) return;

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

  setModel: async (modelId) => {
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

    const def = findModel(modelId, get().provider);
    set({ model: def.id, provider: def.provider, modelMenuOpen: false });

    set((s) => ({
      sessions: s.sessions.map((x) =>
        x.id === s.activeId ? { ...x, model: def.id, provider: def.provider } : x,
      ),
    }));
    persist(get());

    const models = useStore.getState().settings.models;
    const providers = models?.providers ?? {};
    await useStore.getState().applySettings({
      models: {
        activeProvider: def.provider,
        providers: {
          ...providers,
          [def.provider]: { ...(providers[def.provider] ?? {}), model: def.id },
        },
      },
    });
  },

  setModelMenuOpen: (v) => set({ modelMenuOpen: v }),
  setDraft: (v, id = '') => set((s) => ({ drafts: { ...s.drafts, [id]: v } })),
  draftOf: (id) => get().drafts[id] ?? '',

  buangAntrian: (idx) =>
    set((s) => ({
      antrian: s.antrian.filter((a, i) => !cocokAntrian(a, i, idx)),
    })),
  naikkanAntrian: (idx) =>
    set((s) => {
      const pos = posisiAntrian(s.antrian, idx);
      if (pos <= 0 || pos >= s.antrian.length) return {};
      const arr = s.antrian.slice();
      [arr[pos - 1], arr[pos]] = [arr[pos], arr[pos - 1]];
      return { antrian: arr };
    }),
  turunkanAntrian: (idx) =>
    set((s) => {
      const pos = posisiAntrian(s.antrian, idx);
      if (pos < 0 || pos >= s.antrian.length - 1) return {};
      const arr = s.antrian.slice();
      [arr[pos], arr[pos + 1]] = [arr[pos + 1], arr[pos]];
      return { antrian: arr };
    }),
  ubahAntrian: (idx, teks) =>
    set((s) => {
      const pos = posisiAntrian(s.antrian, idx);
      const sekarang = s.antrian[pos];
      if (!sekarang) return {};
      const bersih = (teks ?? '').trim();
      if (!bersih) return {};
      return {
        antrian: s.antrian.map((a, i) => (i === pos ? { ...a, teks: bersih } : a)),
      };
    }),
  kosongkanAntrian: () => set({ antrian: [] }),

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
  kirimAntrian: async (idx) => {
    const pos = posisiAntrian(get().antrian, idx);
    const item = get().antrian[pos];
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
    const terkirim = await get().send(item.teks, item.images);
    if (terkirim) {
      /* Removed by IDENTITY, so two identical texts in the queue do not both
         disappear when only one of them was sent. */
      set((s) => ({ antrian: s.antrian.filter((entry) => entry !== item) }));
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
   * ceiling so a pathological provider cannot wedge the button forever. If
   * the ceiling is hit the message is queued instead, which is always safe.
   */
  kirimSekarang: async (teks, images, composerId = '') => {
    const teksBersih = (teks ?? '').trim();
    // "lanjut" with a pending checkpoint continues the interrupted run from
    // where it stopped instead of starting a new one on top of the failure.
    if (/^\s*lanjut(kan)?\s*[.!?…]*\s*$/i.test(teksBersih ?? '') && get().agentResume && !get().agentBusy && !get().pending) {
      await get().lanjutkanAgent();
      return;
    }
    const imgs = images ?? get().draftImages;
    if (!teksBersih && imgs.length === 0) return;
    if (!get().pending && !get().agentBusy) {
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
       * The old run refused to unwind in time. Queue rather than fire a
       * second request: a stuck provider thread plus a live one is not worth
       * the risk of two answers writing the same session.
       */
      set((s) => ({ antrian: [...s.antrian, { teks: teksBersih, images: imgs }] }));
      set({ toast: tf('The current run is still stopping - message queued', {}) });
      return;
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
      let bytes = 0;
      const match = /^data:[^;,]+;base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl);
      if (match) {
        const encoded = match[1].replace(/\s/g, '');
        const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
        bytes = Math.max(0, Math.floor(encoded.length * 3 / 4) - padding);
      } else if (dataUrl.startsWith('data:')) {
        bytes = new TextEncoder().encode(dataUrl).byteLength;
      }
      if (bytes > IMAGE_MAX_BYTES) {
        set({ toast: tf('Image is larger than 3.5 MB and was not attached', {}) });
        return false;
      }
      set({ draftImages: [...now, dataUrl] });
      return true;
    },
    removeDraftImage: (index) =>
      set((s) => ({ draftImages: s.draftImages.filter((_, i) => i !== index) })),
    clearDraftImages: () => set({ draftImages: [] }),
    setToast: (v) => set({ toast: v }),
  setConfirmCmd: (v) => set({ confirmCmd: v }),
  setAgentMode: (m) => {
    set({ agentMode: m });
    try {
      localStorage.setItem('zephyr.ai.mode', m);
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
  /*
   * Pick the run mode and apply the approval level it implies.
   *
   * The three modes map to real behaviour: Autopilot runs everything (approval
   * 'auto'); Interactive and Plan both pause for risky actions (approval
   * 'work'), and Plan additionally injects a "present a plan, change nothing"
   * instruction read by `sendAgent`. Switching to agent mode here when it was
   * 'chat' is deliberate — these modes only mean anything to the agent, so
   * choosing one is also choosing to run as an agent.
   */
  setRunMode: (m) => {
    set((s) => ({
      runMode: m,
      agentMode: 'agent',
      approvalMode: m === 'autopilot' ? 'auto' : 'work',
      sessions: s.sessions.map((x) =>
        x.id === s.activeId ? { ...x, approval: m === 'autopilot' ? 'auto' : 'work' } : x,
      ),
    }));
    try {
      localStorage.setItem('zephyr.ai.runMode', m);
      localStorage.setItem('zephyr.ai.mode', 'agent');
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
    for (const raw of Array.isArray(list) ? list : []) {
      if (bersih.length >= MAX_TODOS) break;
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
    if (adaBaruSelesai) agenAksiBerulang.clear();
    return bersih.length;
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

  compactContext: (keep = 4) => {
    const id = get().activeId;
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
    const s = makeSession(st.model, st.provider);

    s.approval = st.approvalMode;
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

  clearAllChats: () => {
    /* Every surface loses its chat here, not just the primary — the sessions
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

  exportChat: async () => {
    const s = get().activeSession();
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
    const { clipboardWrite } = await import('./clipboard');
    await clipboardWrite(md);
    set({ toast: tf('Chat exported ({n} characters) - copied to the clipboard', { n: md.length }) });
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
    jalankanPerintahKerja: (teks: string, sessionId: string): boolean => {
    const m = /^\/(loop|goal)\s*([\s\S]*)$/.exec(teks.trim());
    if (!m) return false;

    const cmd = m[1].toLowerCase();
    const arg = m[2].trim();
    const st = get();

    if (cmd === 'loop') {
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
        enqueue: (text) => void get().kirimSekarang(text),
      });
      set({ toast: tf('Looping every {interval}. /loop stop to end it.', { interval: formatInterval(everyMs) }) });
      return true;
    }

    /* cmd === 'goal' */
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
      if (sid && get().jalankanPerintahKerja(diketik, sid)) {
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
        set((s) => ({ antrian: [...s.antrian, { id: idAntrian(), teks: diketik, images: imgs }] }));
        set({ drafts: {}, draftImages: [], toast: tx('Added to the queue') });
        return true;
      }
      return get().sendAgent(raw, imgs, tampil, composerId);
    }
    if (get().pending) {
      // Same rule in chat mode: queue it rather than dropping the text.
      set((s) => ({ antrian: [...s.antrian, { id: idAntrian(), teks: diketik, images: imgs }] }));
      set({ drafts: {}, draftImages: [], toast: tx('Added to the queue') });
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
        toast: tf('Add an API key for {name} in Settings, or pick a provider that already has one', { name: label }),
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
        const history: AiMessage[] = prev
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
                };
              });

    const bhsJawab = useStore.getState().settings.models.answerLang ?? 'follow';
    const gayaJawab = useStore.getState().settings.models.answerStyle ?? 'short';
    {

      const [ekstra, aturan] = await Promise.all([konteksAgent(), aturanProyek()]);

      const ai = get();
      history.unshift({
        role: 'system',
        content: systemPromptFor(bhsJawab, ekstra, aturan, ai.model, ai.provider, gayaJawab),
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
            'tells you to proceed.',
        });
      }
    }

    if (ragContext) history.push({ role: 'user', content: ragContext });
            history.push({
              role: 'user',
              content: payloadContent + identityReminder(get().model),
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
      drafts: text ? s.drafts : {},
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

    const def = findModel(get().model, get().provider);
    const cfg = useStore.getState().settings.models.providers[def.provider] ?? {};

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
    get().sinkronProvider();
    clearGambarMenunggu();
    if (get().pending || get().agentBusy) {
      return gagalKirimToast(tx('An agent task is still running - stop it first'));
    }
    const agentImages = explicitImages ?? get().draftImages;
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
        tf('Add an API key for {name} in Settings, or pick a provider that already has one', { name: label }),
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
      drafts: {},
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
    resetAgentToolCache();
    persist(get());
    agentBatal = false;
    agentStopReason = null;
    resetAutoCompact();

    const def = findModel(get().model, get().provider);
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
    const prev = (get().activeSession()?.messages ?? []).filter(
      (m) => !m.error && (m.content.trim() || m.images?.length || m.image) && m.id !== botMsg.id,
    );
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
        const [ekstra, aturan] = await Promise.all([konteksAgent(), aturanProyek()]);
        const ai = get();
        history.unshift({
          role: 'system',
          content: systemPromptFor(bhsJawab, ekstra, aturan, ai.model, ai.provider, gayaJawab),
        });
      } catch {
        history.unshift({
          role: 'system',
          content: systemPromptFor(bhsJawab, '', '', get().model, get().provider, gayaJawab),
        });
      }
    }

    history.push({
      role: 'user',
      content: content + identityReminder(get().model),
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

    let akhir = '';
    let taskComplete = false;
    let navigationOpened = false;
    // A resumed run keeps counting from its checkpoint so the step meter and
    // the max-step guard see the real position, not a fresh zero.
    let langkah = langkahAwal;
    let agentFailure: { category: AgentFailureCategory; message: string } | null = null;
    /* Anti-loop fingerprints; see `catatAksiBerulang` for the why. */
    agenAksiBerulang.clear();
    /* Set once a page actually opened, then counts circling browser calls. */
    let halamanTerbuka = false;
    let browserMuter = 0;
    /* Pages already opened this turn. This is what separates "open a different
       page" (progress) from "open the same page again" (circling). Without it,
       a close/open/read cycle resets both counters every round and runs to
       MAX_AGENT_STEPS. See cekMuterBrowser. */
    const urlBrowserTerbuka: string[] = [];
    /* Consecutive read-only steps with nothing new; see the goal-satisfied guard. */
    let langkahTanpaKemajuan = 0;
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
    try {
      for (; langkah < MAX_AGENT_STEPS; langkah++) {
        if (agentBatal) break;
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
        agentHardLimitArm();

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
          const keluar = ringkasRiwayat(history);
          const dipakai = perkiraanKonteks(keluar);
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
        for (let i = history.length - 1; i >= 0; i--) {
          if (history[i].role === 'user' && history[i].content.startsWith('# Status pekerjaanmu')) {
            history.splice(i, 1);
          }
        }
        history.push({
          role: 'user',
          content: statusPekerjaan(get().agentTodos, get().agentSteps, langkah + 1, MAX_AGENT_STEPS),
        });
        get().setAgentProgress({ agentPhase: 'thinking', agentCurrentTool: null, agentStepIndex: langkah + 1, agentStepLimit: MAX_AGENT_STEPS });
        let res: AgentStepResult;
        let faseTungguPulih = 0;
        /*
         * Active model definition for this step, mutable so a provider failure
         * can switch to a fallback model without losing the run.
         */
        let activeDef = def;
        let activeCfg = cfg;
        let sudahFallback = false;
        for (let retry = 0; ; retry++) {
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
            if (retry > 0) {
              set((s) => ({
                sessions: s.sessions.map((sess) => ({
                  ...sess,
                  messages: sess.messages.map((m) =>
                    m.id === botMsg.id ? { ...m, content: '' } : m,
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
            agentStepResolve = resolve;
            const toolSpecs = agentToolSpecs({ alat: [...useToolGate.getState().aktif] });
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
            const capUntukPesan = Math.max(20_000, PAYLOAD_MAX_CHARS - reserveTools);
            cmd
              .aiToolChatStream({
                id: attemptId,
                provider: activeDef.provider,
                model: activeDef.id,
                messages: ringkasRiwayat(history, capUntukPesan),
                tools: toolSpecs,
                baseUrl: activeCfg.baseUrl || undefined,
                maxTokens: activeDef.maxOut ?? 2048,
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

          // Retry only a failed provider request before any tool call is returned.
          // The history is untouched until the successful response below, so a
          // retry cannot replay a tool or duplicate a local write.
          const bolehRetry =
            !res.cancelled &&
            !agentBatal &&
            res.toolCalls.length === 0 &&
            !!res.error &&
            isRetryableAgentProviderError(res.error);
          if (!bolehRetry || retry >= AGENT_PROVIDER_RETRY_DELAYS.length) {
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
            if (bolehRetry && faseTungguPulih < TUNGGU_PULIH_DELAYS.length) {
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
            if (bolehRetry && !sudahFallback) {
              const cadangan = pilihModelCadangan(
                activeDef,
                MODEL_FALLBACK,
                (p) => useSettingsUi.getState().hasKey(p),
              );
              if (cadangan) {
                sudahFallback = true;
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
                if (agentBatal) break;
                continue;
              }
            }
            break;
          }

          const retryNumber = retry + 1;
          get().setAgentProgress({
            agentPhase: 'thinking',
            agentCurrentTool: `Mencoba lagi (${retryNumber}/2) karena ${labelRetryAgent(res.error!)}`,
            agentStepIndex: langkah + 1,
            agentStepLimit: MAX_AGENT_STEPS,
          });
          // A failed provider attempt must not carry a read_image payload into
          // the next attempt. Images are scoped to the successful tool step,
          // never to the provider retry boundary.
          clearGambarMenunggu();
          if (!(await tungguRetryAgent(AGENT_PROVIDER_RETRY_DELAYS[retry]))) break;
          if (agentBatal) break;
        }
        if (res.cancelled || agentBatal) break;
        if (res.error) throw new Error(res.error);

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

        // A provider may return several speculative actions in one response.
        // Navigation is a single action: keep only its first browser open and
        // discard everything else from that response. For ordinary tasks,
        // suppress repeated opens of the same normalized URL while preserving
        // the order and all non-browser calls.
        const browserOpen = (tc: AgentToolCall) => tc.name === 'browser_open' || tc.name === 'system_browser_open';
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
         * Carry the turn's reasoning into the history.
         *
         * Dropping it made every step re-derive what it had already worked out,
         * because the next request showed the model its own conclusions with no
         * trace of how it reached them. Providers that expose reasoning expect
         * it back: Anthropic validates the signature on a thinking block, and
         * the OpenAI-compatible gateways accept `reasoning_content` on the
         * assistant turn. Attached only when non-empty — an empty string is not
         * the same as absent, and some routers reject the empty form.
         */
        history.push({
          role: 'assistant',
          content: res.content,
          toolCalls: callsToDispatch,
          ...(res.reasoning ? { reasoning: res.reasoning } : {}),
          ...(res.reasoningSignature ? { reasoningSignature: res.reasoningSignature } : {}),
        });
        if (callsToDispatch.length === 0) break;

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
          if (tc.name !== 'write_file' && tc.name !== 'edit') return null;
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
           * `system_browser_open` diperlakukan SAMA dengan `browser_open` di
           * sini. Sebelumnya ia hanya ikut dihitung sebagai "muter" tapi tidak
           * pernah diakui sebagai pembuka baru, sehingga membuka tiga alamat
           * berbeda lewat browser sistem akan dihentikan sebagai putaran -
           * padahal setiap langkah membuka halaman baru.
           */
          if (halamanTerbuka && TOOL_BROWSER.has(tc.name)) {
            /* `membukaBaru` berarti url yang BELUM pernah dibuka pada giliran
               ini, bukan sekadar url yang tidak kosong - lihat cekMuterBrowser.
               Membuka ulang halaman yang sama tidak lagi dihitung kemajuan,
               dan `browser_close` tidak lagi bisa mereset apa pun karena ia
               masuk lewat fungsi yang sama. */
            const Putaran = cekMuterBrowser(halamanTerbuka, browserMuter, urlBrowserTerbuka, tc.name, argsObj);
            browserMuter = Putaran.muter;
            if (Putaran.berhenti) {
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
           */
          if (TOOL_PENULIS.has(tc.name)) {
            langkahTanpaKemajuan = 0;
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
             */
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
          const namaShell = tc.name === 'bash_run' || tc.name === 'bash_background';
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
          const perluSetuju =
            (namaShell &&
              !diizinkan &&
              (get().approvalMode === 'ask' ||
                (get().approvalMode !== 'auto' && isDestructive(perintah)))) ||
            (tulisDisk && get().approvalMode !== 'auto' && !izinTool);

          let hasil: string;
          let ok = true;
          if (toolGateBlok) {
            hasil = `(refused: tool disabled in AI Tools: ${tc.name})`;
            ok = false;
          } else if (readOnlyBlok) {
            hasil = `(refused: read-only mode does not allow ${tc.name})`;
            ok = false;
          } else if (perluSetuju) {
            get().setAgentProgress({ agentPhase: 'waiting-confirmation', agentCurrentTool: tc.name, agentStepIndex: langkah + 1, agentStepLimit: MAX_AGENT_STEPS });
            set({
              agentConfirm: {
                tool: tc.name,
                argsText: JSON.stringify(argsObj),
                isDestructive: namaShell && isDestructive(perintah),
                // A disk write is not a shell command: the card words the
                // prompt differently so the user knows bytes will land.
                isWrite: tulisDisk,
              },
            });
            const disetujui = await new Promise<boolean>((resolve) => {
              agentConfirmResolve = resolve;
            });
            agentConfirmResolve = null;
            set({ agentConfirm: null });
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

          if (agentBatal) break;
          if (ok && (tc.name === 'browser_open' || tc.name === 'system_browser_open')) {
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
                      const runDenganPosisi = { ...run, atChar: m.content.length };
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
            (tc.name === 'browser_open' || tc.name === 'system_browser_open') &&
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
        if (taskComplete || navigationOpened) break;

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
      const message = safeAgentFailureMessage(cmd.asZephyrError(e).message);
      agentFailure = { category: classifyAgentFailure(message), message };
    }

    const runWasCancelled = agentBatal;
    const stopReason = String(agentStopReason);
    if (runWasCancelled && stopReason !== 'user') {
      /*
       * The mapping lives in agentStop.ts so it can be asserted in Node. A
       * non-null result overwrites whatever `catch` built; null means "leave it
       * alone" - which is what lets a real provider error keep its own message
       * instead of being replaced by a generic sentence.
       */
      const pesanStop = agentStopMessage(stopReason);
      if (pesanStop) agentFailure = pesanStop;
    } else if (runWasCancelled) {
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
      const bisaLanjut =
        (agentFailure.category === 'provider' || agentFailure.category === 'timeout') &&
        adaKerjaNyata;
      finalError = `Agent stopped: ${agentFailureLabel(agentFailure.category)}: ${agentFailure.message}\n\nTugas dihentikan; perubahan yang sudah tersimpan tetap ada.${bisaLanjut ? ' Ketik "lanjut" atau tekan tombol Lanjut untuk meneruskan dari langkah terakhir.' : ''}`;
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
      }
    }

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
    agentConfirmResolve = null;
    finishAgentToolCache();
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
                   */
                  ...(finalError && !tampil ? { error: finalError } : {}),
                };
              }),
            }
          : x,
      ),
    }));
    persist(get());

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
    /* Speech output was removed from Zephyr, so there is no auto-read here any
       more: `voice.speakReplies` no longer has a reader. See the Voice section's
       removal note in the settings store. */

    // Failed provider/watchdog runs keep follow-ups visible and are never
    // automatically rerun. Successful runs retain the existing queue drain;
    // user cancellation also remains non-draining.
    if (!runWasCancelled && !agentFailure) {
      const next = get().antrian[0];
      if (next && !get().agentBusy) {
        void get().kirimAntrian(0);
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

      set({ agentConfirm: null });
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
    if (retiredAgentAttempts.has(c.id)) return;
    if (attempt && c.id !== attempt) return;

    /*
     * Penjaga kedua menutup sisa lubangnya.
     *
     * `c.id !== attempt` hanya tahu percobaan mana yang SEDANG aktif. Satu id
     * percobaan yang tidak pernah tercatat - misalnya id yang dipakai Rust untuk
     * percobaan berikutnya sementara frontend belum sempat mencatatnya - akan
     * lolos, dan potongannya menambah teks yang sudah ada.
     *
     * Yang membedakan percobaan sah dari sisa percobaan lama bukan nomor idnya,
     * melainkan apakah teks itu datang dari percobaan yang DIHARAPKAN. Karena
     * percobaan aktif dicatat saat dibuat, setiap id lain yang menyasar pesan
     * yang sama adalah penulisan kedua atas jawaban yang sama: ia dicatat
     * pensiun lalu dibuang, SEBELUM menyentuh state.
     *
     * Dibuang sebelum, bukan dibersihkan sesudah, karena yang dihindari adalah
     * teksnya sempat muncul - menghapusnya kemudian tidak menolong pembaca yang
     * sudah melihat kata itu dua kali.
     */
    if (attempt && c.id !== attempt) {
      retiredAgentAttempts.add(c.id);
      return;
    }
    if (cancelledAttempts.has(c.id)) {
      if (c.toolDone || c.done || c.err) cancelledAttempts.delete(c.id);
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
      if (agentWatchdog) agentWatchdogArm();
      jadwalkanFlushChunk();
      return;
    }

    // There is activity from the provider: postpone the idle watchdog.
    if (agentWatchdog) agentWatchdogArm();

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
      const next = s2.antrian[0];
      if (next && !s2.pending && !s2.agentBusy) {
        // Lewat `kirimAntrian` supaya satu-satunya jalur drain pada mode chat
        // sama dengan mode agent: item HANYA dihapus kalau `send` benar-benar
        // diterima. Kalau tidak (mis. belum ada API key), pesan tetap di
        // antrian dan tidak hilang diam-diam.
        void get().kirimAntrian(0);
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
}));

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
      pending: c.done || c.err ? (s.pending === c.id ? null : s.pending) : s.pending,

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
