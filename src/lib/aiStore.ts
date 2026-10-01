import { create } from 'zustand';
import { subagentOnChunk } from './subagentStore';
import {
  mengulangDominan,
  mengulangPelarian,
  REPETITION_LOOP_INTERRUPTED,
} from './repeatDetect';
import * as cmd from './commands';
import { useStore } from './store';
import { findModel, PROVIDER_BY_ID } from './modelCatalog';
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
  jendelaKonteks,
  AUTO_COMPACT_AT,
  AUTO_COMPACT_KEEP,
  AUTO_COMPACT_COOLDOWN_STEPS,
} from './contextBudget';
import type { AiChunk, AiMessage, AgentMsg, AgentToolCall, AgentToolRun, ApprovalMode, ChatMsg, ChatSession, PublicModel } from './types';

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
let ctxCache: { at: number; teks: string } | null = null;
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
  const safe = new Set(['file_read', 'file_list', 'scan_dir', 'editor_read', 'terminal_read', 'memory_read', 'skill_list', 'skill_view', 'todo_read']);
  const safeAction = (name === 'notes' && action === 'list') || (name === 'schedule_command' && action === 'list') || (name === 'worktree' && action === 'list');
  const exactTsc = name === 'shell_exec' && String(args.command ?? '').trim() === 'npx tsc --noEmit';
  if (!safe.has(name) && !readGit && !safeAction && !exactTsc) return null;
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
const BATAS_AKSI_INGAT = 2;

function sidikAksi(name: string, args: Record<string, unknown>): string {
  return `${name}:${stableToolJson(args)}`;
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
  return {
    jumlah,
    ingatkan: jumlah === BATAS_AKSI_INGAT,
    hentikan: jumlah >= BATAS_AKSI_SAMA,
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
  const ttl = name === 'terminal_read' ? TERMINAL_READ_CACHE_TTL_MS : Infinity;
  if (prior && (now - prior.at < ttl)) return prior.result !== undefined ? prior.result : prior.promise;
  const promise = jalankanAgentTool(name, args);
  const entry: AgentToolCacheEntry = { promise, at: now };
  agentToolCache.set(key, entry);
  try {
    const result = await promise;
    // Only successful results are reusable. In particular, a failed tsc run is
    // not cached, so a later call can observe the fixed workspace.
    if (name !== 'shell_exec' || /^__meta exit=0(?:\\s|$)/.test(result)) entry.result = result;
    else agentToolCache.delete(key);
    return result;
  } catch (error) {
    agentToolCache.delete(key);
    throw error;
  }
}

/*
 * Live editor state, rebuilt on every agent turn instead of cached. The model
 * needs to know which file is in front of the user right now, what the terminal
 * is showing, and what the diagnostics say. Without it the agent asks "which
 * file?" on a question the user already answered by opening a tab, and it
 * cannot connect a failing command in the terminal to the task it was given.
 */
function konteksEditor(): string {
  const s = useStore.getState() as unknown as {
    tabs?: { id: string; path?: string; title?: string; unsaved?: boolean }[];
    activeTabId?: string | null;
  };
  const baris: string[] = [];
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
 * hunting for it with terminal_read costs a round trip every time. Only panes
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
  const now = Date.now();
  const hidup = konteksEditor();
  const kegagalan = await konteksKegagalan();
  const gabung = (...blok: string[]) => blok.filter((s) => s && s.trim()).join('\n\n');
  try {
    // The Rust context and the project summary are cached because they are
    // expensive; the live blocks above are not, since they change with every click.
    if (ctxCache && now - ctxCache.at < CTX_TTL_MS) {
      return gabung(ctxCache.teks, hidup, kegagalan);
    }
    const [dariRust, proyek] = await Promise.all([
      cmd.agentContext(),
      import('./projectContext').then((m) => m.ringkasanProyek()),
    ]);
    const teks = gabung(dariRust, proyek);
    ctxCache = { at: now, teks };
    return gabung(teks, hidup, kegagalan);
  } catch {
    return gabung(ctxCache?.teks ?? '', hidup, kegagalan);
  }
}

export function resetKonteksAgent() {
  ctxCache = null;
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

export function ringkasRiwayat(history: AgentMsg[]): AgentMsg[] {
  const system = history.filter((m) => m.role === 'system');
  const sisanya = history.filter((m) => m.role !== 'system');
  if (sisanya.length === 0) return history;

  const batas = Math.max(0, sisanya.length - HISTORY_KEEP_STEPS * 2);
  const lama = sisanya.slice(0, batas);
  const baru = sisanya.slice(batas);

  const ringkas = lama.map((m) => {
    if (m.role === 'tool') {
      const isi = String(m.content ?? '');
      return {
        ...m,
        content:
          isi.length > HISTORY_TOOL_CHARS
            ? `${isi.slice(0, HISTORY_TOOL_CHARS)}\n[… result truncated, ${isi.length - HISTORY_TOOL_CHARS} more characters are not sent]`
            : isi,
      };
    }
    if (m.role === 'assistant') {
      const teks = String(m.content ?? '');
      return {
        ...m,
        content: teks.length > HISTORY_TOOL_CHARS ? `${teks.slice(0, HISTORY_TOOL_CHARS)}…` : teks,
        toolCalls: undefined,
      };
    }
    return m;
  });

  const jumlahTool = lama.filter((m) => m.role === 'tool').length;
  const catatan =
    jumlahTool > 0
      ? `[${jumlahTool} earlier steps were summarized to keep the conversation fast. ` +
        `If you need the detail, re-run the relevant tool — do not invent its contents.]`
      : '';

  return [
    ...system,
    ...(catatan ? [{ role: 'user' as const, content: catatan }] : []),
    ...ringkas,
    ...baru,
  ];
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
 */
export function isNavigationOnlyRequest(text: string): boolean {
  const source = String(text ?? '').trim();
  if (!source || !/https?:\/\/[^\s<>)]+|\bwww\.[^\s<>)]+/i.test(source)) return false;

  // A URL is not enough to make this a navigation request. In particular, do
  // not turn a coding/terminal instruction into a browser action merely because
  // it happens to quote a URL. The short Indonesian "coba jalankan ini" form is
  // the one intentional exception: users commonly use it to mean "open this".
  const executionOrInspection =
    /\b(?:terminal|shell|powershell|command|script|perintah|execute|run\s+command|download|fetch|read|check|inspect|click|test|verify)\b/i.test(source) ||
    /\b(?:terminal|powershell|perintah|jalankan\s+(?:script|perintah)|unduh|download|ambil|baca|cek|periksa|inspeksi|klik|uji|verifikasi)\b/i.test(source);
  if (executionOrInspection) return false;

  const explicitNavigation = /\b(?:open|navigate|visit|go\s+to|buka|navigasi|kunjungi|pergi\s+ke)\b/i.test(source);
  const cobaJalankan = /\bcoba\s+jalankan\s+ini\b/i.test(source);
  return explicitNavigation || cobaJalankan;
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
}

export interface AgentTodo {
  content: string;
  status: 'pending' | 'in_progress' | 'done';
  startedAt?: number;
  endedAt?: number;
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
let agentStopReason: 'user' | 'watchdog' | 'provider' | 'hard-limit' | null = null;

type AgentFailureCategory = 'provider' | 'tool' | 'timeout' | 'cancelled' | 'protocol' | 'unknown';

function classifyAgentFailure(error: string, reason = agentStopReason): AgentFailureCategory {
  const text = error.toLowerCase();
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
// Rust's receive idle timeout is 180s. Give Rust time to report that failure,
// while keeping the frontend watchdog bounded below the 300s total request limit.
const AGENT_IDLE_MS = 210_000;
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
    agentStopReason = 'hard-limit';
    agentBatal = true;
    agentStepResolve = null;
    agentConfirmResolve = null;
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

function agentWatchdogArm() {
  if (agentWatchdog) clearTimeout(agentWatchdog);
  agentWatchdog = setTimeout(() => {
    agentWatchdog = null;
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
      useAi.setState({ agentBusy: false, pending: null, agentConfirm: null, agentPhase: 'idle', agentCurrentTool: null, agentStepIndex: 0, agentStepLimit: MAX_AGENT_STEPS, agentLastProgressAt: null });
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

function loadSessions(): { sessions: ChatSession[]; activeId: string | null } {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { sessions: [], activeId: null };
    const parsed = JSON.parse(raw) as { sessions?: ChatSession[]; activeId?: string };
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
    return { sessions, activeId };
  } catch {
    return { sessions: [], activeId: null };
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
}

interface AiState {
  sessions: ChatSession[];
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

  draft: string;

    attachActive: boolean;

    draftImages: string[];

  lastTruncated: { from: number; to: number } | null;
  keys: PublicModel[];

  modelMenuOpen: boolean;

  confirmCmd: string | null;
  toast: string | null;

  agentMode: 'chat' | 'agent';

  approvalMode: ApprovalMode;

  agentBusy: boolean;

  /** True only for the current explicit URL-navigation request. */
  agentNavigationOnly: boolean;

  agentPhase: AgentPhase;
  agentCurrentTool: string | null;
  agentStepIndex: number;
  agentStepLimit: number;
  agentLastProgressAt: number | null;

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

  promptHistory: string[];
  promptHistoryIdx: number;

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
  setDraft: (v: string) => void;
    setAttachActive: (v: boolean) => void;

    addDraftImage: (dataUrl: string) => boolean;
    removeDraftImage: (index: number) => void;
    clearDraftImages: () => void;
    setToast: (v: string | null) => void;
  setConfirmCmd: (v: string | null) => void;

  setAgentMode: (m: 'chat' | 'agent') => void;
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

  historyUp: () => string | null;
  historyDown: () => string | null;
  addPromptHistory: (prompt: string) => void;
  clearPromptHistory: () => void;

  setReasoningEffort: (e: ReasoningEffort | null) => void;

  sendAgent: (text: string, images?: string[]) => Promise<boolean>;

  /**
   * Manually compact the active session's context.
   *
   * Keeps the last N messages and replaces the rest with a single summary
   * message, so a long session does not flood the context window. Returns
   * the number of messages that were compacted.
   */
  compactContext: (keep?: number) => number;

  newChat: () => string;
    selectChat: (id: string) => void;
    deleteChat: (id: string) => void;

    clearAllChats: () => void;

    clearAllOpen: boolean;
    setClearAllOpen: (v: boolean) => void;

    regenerate: () => Promise<void>;
    activeSession: () => ChatSession | null;

    exportChat: () => Promise<void>;

  send: (text?: string, images?: string[]) => Promise<boolean>;

  /* Drop one queued message, or clear the whole queue. */
  buangAntrian: (idx: number | string) => void;
  kosongkanAntrian: () => void;
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
  kirimSekarang: (teks: string, images?: string[]) => Promise<void>;
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
    localStorage.setItem(LS_KEY, JSON.stringify({ sessions, activeId: state.activeId }));
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


export const useAi = create<AiStore>((set, get) => ({
  sessions: boot.sessions,
  activeId: boot.activeId,
  model: 'custom-model',
  provider: 'custom',
  pending: null,
  antrian: [],
  draft: '',
    attachActive: false,
    draftImages: [],
    lastTruncated: null,
  keys: [],
  modelMenuOpen: false,
  confirmCmd: null,
  toast: null,
  clearAllOpen: false,

  agentMode: bootAgentMode(),

  approvalMode: boot.sessions.find((s) => s.id === boot.activeId)?.approval ?? 'work',
  agentBusy: false,
  agentNavigationOnly: false,
  agentPhase: 'idle',
  agentCurrentTool: null,
  agentStepIndex: 0,
  agentStepLimit: MAX_AGENT_STEPS,
  agentLastProgressAt: null,
  agentSteps: [],
  agentConfirm: null,
  agentTanya: null,
  agentTodos: [],
  promptHistory: [],
  promptHistoryIdx: -1,
  reasoningEffort: null,
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
    set({ pending: null, agentBusy: false, agentConfirm: null, agentPhase: 'idle', agentCurrentTool: null, agentStepIndex: 0, agentStepLimit: MAX_AGENT_STEPS, agentLastProgressAt: null });

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

    const model =
      st.providers[prov]?.model || (PROVIDER_BY_ID.get(prov)?.models?.[0]?.id ?? 'custom-model');
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

    const model =
      dariSettings || PROVIDER_BY_ID.get(target)?.models?.[0]?.id || get().model;
    set({ provider: target, model });
    const sid = get().activeId;
    if (sid) {
      set((s) => ({
        sessions: s.sessions.map((x) => (x.id === sid ? { ...x, provider: target, model } : x)),
      }));
    }
  },

  setModel: async (modelId) => {
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
  setDraft: (v) => set({ draft: v }),

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
  kirimAntrian: async (idx) => {
    const pos = posisiAntrian(get().antrian, idx);
    const item = get().antrian[pos];
    if (!item) return false;
    await get().send(item.teks, item.images);
    const accepted = get().hasKey() && !get().toast;
    if (accepted) {
      set((s) => ({ antrian: s.antrian.filter((entry) => entry !== item) }));
    }
    return accepted;
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
  kirimSekarang: async (teks, images) => {
    const teksBersih = (teks ?? '').trim();
    const imgs = images ?? get().draftImages;
    if (!teksBersih && imgs.length === 0) return;
    if (!get().pending && !get().agentBusy) {
      await get().send(teksBersih, imgs);
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
      const o = raw as { content?: unknown; status?: unknown };
      const content = String(o?.content ?? '').trim();
      if (!content) continue;
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

      const prev = sebelum.find((x) => x.content === content);
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

      bersih.push({ content, status, startedAt, endedAt });
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

  setReasoningEffort: (e) => set({ reasoningEffort: e }),
  setAgentProgress: (progress) => set(() => ({
    ...progress,
    agentLastProgressAt: progress.agentLastProgressAt !== undefined
      ? progress.agentLastProgressAt
      : progress.agentPhase === 'idle' ? null : Date.now(),
  })),
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

  newChat: () => {
    const st = get();
    const s = makeSession(st.model, st.provider);

    s.approval = st.approvalMode;
    set((x) => ({ sessions: [...x.sessions, s], activeId: s.id, draft: '' }));
    persist(get());
    return s.id;
  },

  selectChat: (id) => {
    const s = get().sessions.find((x) => x.id === id);
    set({ activeId: id, approvalMode: s?.approval ?? get().approvalMode });
    persist(get());
  },

  deleteChat: (id) => {
    set((s) => {
      const sessions = s.sessions.filter((x) => x.id !== id);

      const activeId = s.activeId === id ? null : s.activeId;
      return { sessions, activeId };
    });
    if (!get().activeId) get().newChat();
    persist(get());
  },

  clearAllChats: () => {
    set({ sessions: [], activeId: null, clearAllOpen: false });
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

  send: async (text, images): Promise<boolean> => {
    get().sinkronProvider();
    const raw = (text ?? get().draft).trim();
    const imgs = images ?? get().draftImages;
    if (!raw && imgs.length === 0) return false;

    if (raw) get().addPromptHistory(raw);

    if (get().agentMode === 'agent') {
      if (get().agentBusy) {
        // Park it instead of refusing: the composer accepts the message and it
        // goes out as soon as the running task finishes.
        set((s) => ({ antrian: [...s.antrian, { id: idAntrian(), teks: raw, images: imgs }] }));
        set({ draft: '', draftImages: [], toast: tx('Added to the queue') });
        return true;
      }
      return get().sendAgent(raw, imgs);
    }
    if (get().pending) {
      // Same rule in chat mode: queue it rather than dropping the text.
      set((s) => ({ antrian: [...s.antrian, { id: idAntrian(), teks: raw, images: imgs }] }));
      set({ draft: '', draftImages: [], toast: tx('Added to the queue') });
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

    let sessionId = get().activeId;
    if (!sessionId) sessionId = get().newChat();

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
          content,
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
      draft: text ? s.draft : '',
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
    try {
      await cmd.aiChat({
        id: reqId,
        provider: def.provider,
        model: def.id,
        messages: history,
        baseUrl: cfg.baseUrl || undefined,
        maxTokens: def.maxOut ?? 2048,
        effort: get().reasoningEffort ?? undefined,
      });
    } catch (e) {
      const msg = cmd.asZephyrError(e).message;
      get().onChunk({ id: reqId, err: msg });
      get().onChunk({ id: reqId, done: true });
    }
    return true;
  },

  sendAgent: async (raw, explicitImages) => {
    get().sinkronProvider();
    clearGambarMenunggu();
    if (get().pending || get().agentBusy) {
      set({ toast: tx('An agent task is still running - stop it first') });
      return false;
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
        set({ toast: tf('No key for {from} - switched to {to}, which has one', { from: label, to: labelPindah }) });
        return false;
      }
      set({
        toast: tf('Add an API key for {name} in Settings, or pick a provider that already has one', { name: label }),
      });
      return false;
    }

    let sessionId = get().activeId;
    if (!sessionId) sessionId = get().newChat();

    const userMsg: ChatMsg = {
      id: nextId('m'),
      role: 'user',
      content,
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
      draft: '',
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
      agentConfirm: null,
  agentTanya: null,
      agentTodos: [],
    }));
    resetAgentToolCache();
    persist(get());
    agentBatal = false;
    agentStopReason = null;
    resetAutoCompact();

    const def = findModel(get().model, get().provider);
    const cfg = useStore.getState().settings.models.providers[def.provider] ?? {};

    const history: AgentMsg[] = [];
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
            'it means that file. Use the editor_read/editor_write tools for its contents.',
        });
      }
    }

    let akhir = '';
    let taskComplete = false;
    let navigationOpened = false;
    let langkah = 0;
    let agentFailure: { category: AgentFailureCategory; message: string } | null = null;
    /* Anti-loop fingerprints; see `catatAksiBerulang` for the why. */
    agenAksiBerulang.clear();
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
          const batas = jendelaKonteks(def.id) * AUTO_COMPACT_AT;
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
        for (let retry = 0; ; retry++) {
          res = await new Promise<AgentStepResult>((resolve) => {
            const attemptId = nextId(`attempt-${botMsg.id}`);
            if (activeAgentAttempt) retiredAgentAttempts.add(activeAgentAttempt);
            activeAgentAttempt = attemptId;
            activeAgentUiId = botMsg.id;
            agentStepResolve = resolve;
            cmd
              .aiToolChatStream({
                id: attemptId,
                provider: def.provider,
                model: def.id,
                messages: ringkasRiwayat(history),
                tools: agentToolSpecs({ alat: [...useToolGate.getState().aktif] }),
                baseUrl: cfg.baseUrl || undefined,
                maxTokens: def.maxOut ?? 2048,
                effort: get().reasoningEffort ?? undefined,
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
          if (!bolehRetry || retry >= AGENT_PROVIDER_RETRY_DELAYS.length) break;

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

        akhir = res.content;

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
        history.push({ role: 'assistant', content: res.content, toolCalls: callsToDispatch });
        if (callsToDispatch.length === 0) break;

        /* Start eligible read calls together; dispatch below preserves order and all gates. */
        const PARALLEL_READ_TOOLS = new Set([
          'file_read', 'file_list', 'editor_read', 'terminal_read', 'memory_read',
          'skill_list', 'skill_view', 'todo_read',
        ]);
        const canParallelize = (tc: AgentToolCall): boolean => {
          if (PARALLEL_READ_TOOLS.has(tc.name)) return true;
          const action = String((tc.args as Record<string, unknown> | undefined)?.action ?? '').trim();
          if (tc.name === 'git') return action === 'status' || action === 'diff' || action === 'log' || action === 'branches';
          if (tc.name === 'notes') return action === 'list';
          if (tc.name === 'schedule_command') return action === 'list';
          if (tc.name === 'worktree') return action === 'list';
          return false;
        };
        const prefetchedReadTools = new Map<string, Promise<string>>();
        for (let i = 0; i < callsToDispatch.length; i++) {
          if (!canParallelize(callsToDispatch[i])) continue;
          const batch: AgentToolCall[] = [];
          while (i < callsToDispatch.length && canParallelize(callsToDispatch[i])) batch.push(callsToDispatch[i++]);
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
            agentStopReason = 'watchdog';
            break;
          }
          get().setAgentProgress({ agentPhase: 'running-tool', agentCurrentTool: tc.name, agentStepIndex: langkah + 1, agentStepLimit: MAX_AGENT_STEPS });
          const mulaiTool = Date.now();
          const namaShell = tc.name === 'terminal_exec' || tc.name === 'shell_exec';
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
          const selesaiPada = Date.now();
          /*
           * The one-line status the collapsed row shows.
           *
           * TEDI and Hermes both answer "how much did that touch?" without a
           * click — "read · 12 lines · 20.7KB" tells the reader whether opening
           * the body is worth it. The numbers come from the result text that is
           * already in hand: a line count for reads, and for edits the diff
           * summary the patch tool already computes. Anything that does not fit
           * those shapes gets no status at all, which is the honest answer.
           */
          const status: Partial<AgentToolRun> = {};
          if (hasil) {
            const baris = hasil.split('\n').length;
            if (baris > 1) status.lines = baris;
            status.bytes = hasil.length;

            /*
             * Pull the exit code out of the tool's own header.
             *
             * shell_exec prefixes its result with `__meta exit=N ms=N`; that
             * line is for this parser, and it is stripped from the copy that
             * reaches the reader so the transcript never shows plumbing.
             */
            const meta = /^__meta exit=(-?\d+)(?: ms=(\d+))?(?: timeout=1)?\n/.exec(hasil);
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
                    messages: x.messages.map((m) =>
                      m.id === botMsg.id ? { ...m, tools: [...(m.tools ?? []), run] } : m,
                    ),
                  }
                : x,
            ),
          }));
          history.push({ role: 'tool', toolCallId: tc.id, name: tc.name, content: hasil });

          if (hitungAksi.ingatkan) {
            /*
             * Second identical call in this turn: the model is looping, but a
             * reminder is cheaper and less destructive than a stop. The line
             * rides along after the tool result so it is the last thing the
             * model reads before deciding its next move, and it names the
             * escape hatches (use the result already in hand, or change
             * approach) instead of just forbidding the repeat.
             */
            history.push({
              role: 'user',
              content:
                'You have already run this exact call. Do not repeat it - either use the result you have or take a different approach.',
            });
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
          if (
            navigationOnly &&
            navigationResultOk &&
            (tc.name === 'browser_open' || tc.name === 'system_browser_open')
          ) {
            const openedUrl = String(argsObj.url ?? '').trim();
            akhir = `Opened ${openedUrl || 'the URL'}.`;
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
          if (tc.name === 'task_complete') {
            taskComplete = true;
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
      }
    } catch (e) {
      if (!agentBatal) agentStopReason = 'provider';
      const message = safeAgentFailureMessage(cmd.asZephyrError(e).message);
      agentFailure = { category: classifyAgentFailure(message), message };
    }

    const runWasCancelled = agentBatal;
    const stopReason = String(agentStopReason);
    if (runWasCancelled && stopReason !== 'user') {
      const message = stopReason === 'watchdog'
        ? 'Provider berhenti menjawab sebelum langkah selesai.'
        : 'Agent step stopped unexpectedly.';
      agentFailure = { category: classifyAgentFailure(message, agentStopReason), message };
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
      finalError = `Agent stopped: ${agentFailureLabel(agentFailure.category)}: ${agentFailure.message}\n\nTugas dihentikan; perubahan yang sudah tersimpan tetap ada.`;
      const context = akhir.trim();
      akhir = context ? `${context}\n\n${finalError}` : finalError;
    }

    // This is the single agent exit cleanup path. It also clears approval state
    // when an exit happens before a tool can answer its confirmation promise.
    agentWatchdogDisarm();
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
      agentSteps: [...s.agentSteps, { kind: 'selesai', at: Date.now() }],
      sessions: s.sessions.map((x) =>
        x.id === sessionId
          ? {
              ...x,
              messages: x.messages.map((m) => {
                if (m.id !== botMsg.id) return m;
                const tampil = agentFailure
                  ? (akhir === finalError && m.content.trim() ? `${m.content.trim()}\n\n${finalError}` : akhir)
                  : (akhir.trim() ? akhir : m.content);
                return {
                  ...m,
                  content: tampil || '(no answer)',
                  streaming: false,
                  ...(finalError ? { error: finalError } : {}),
                };
              }),
            }
          : x,
      ),
    }));
    persist(get());

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

    // Agent provider ids are attempt ids, never the stable UI message id.
    // Once a retry starts, packets from the previous blocking worker are stale.
    const attempt = activeAgentAttempt;
    if (retiredAgentAttempts.has(c.id)) return;
    if (attempt && c.id !== attempt) return;
    if (cancelledAttempts.has(c.id)) {
      if (c.toolDone || c.done || c.err) cancelledAttempts.delete(c.id);
      return;
    }
    c = { ...c, id: activeAgentUiId ?? c.id };

    // There is activity from the provider: postpone the idle watchdog.
    if (agentWatchdog) agentWatchdogArm();

    if (c.toolDone) {
      agentWatchdogDisarm();
      /* Langkah selesai, jadi batas mutlaknya juga dibatalkan. Kalau tidak,
         timer 15 menit itu akan menembak di tengah langkah BERIKUTNYA dan
         menghentikan agen yang sedang berjalan normal. */
      agentHardLimitDisarm();
      cancelled.delete(c.id);
      const r = agentStepResolve;
      agentStepResolve = null;
      if (c.err) {
        if (!agentBatal) agentStopReason = 'provider';
        r?.({ content: '', toolCalls: [], cancelled: false, error: c.err });
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

    if (cancelled.has(c.id)) {
      if (c.done || c.err) cancelled.delete(c.id);
      return;
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
    set((s) => ({
      sessions: s.sessions.map((sess) => ({
        ...sess,
        messages: sess.messages.map((m) => {
          if (m.id !== c.id) return m;
          if (c.err) return { ...m, error: c.err, streaming: false };

          /*
           * The reasoning clock.
           *
           * `reasoningMs === 0` means "reasoning has not started yet" — the
           * first reasoning chunk stamps it with the wall clock, and the first
           * answer token freezes the elapsed time. Everything after that is
           * ignored, so the header keeps the duration of the thinking alone and
           * not of the whole answer that followed it.
           */
          if (c.reasoning) {
            const mulai = m.reasoningMs === 0 ? Date.now() : undefined;
            return {
              ...m,
              reasoning: (m.reasoning ?? '') + c.reasoning,
              reasoningMs: m.reasoningMs === 0 ? (mulai ?? Date.now()) : m.reasoningMs,
            };
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
             */
            const ms =
              typeof m.reasoningMs === 'number' && m.reasoningMs > 1e12
                ? Date.now() - m.reasoningMs
                : m.reasoningMs;
            return { ...m, content: m.content + c.text, reasoningMs: ms };
          }
          if (c.done) return { ...m, streaming: false };
          return m;
        }),
      })),
      pending: c.done || c.err ? (s.pending === c.id ? null : s.pending) : s.pending,

      reasoningText: c.reasoning ? (s.reasoningText ?? '') + c.reasoning : s.reasoningText,
    }));
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
