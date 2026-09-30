import { create } from 'zustand';
import { subagentOnChunk } from './subagentStore';
import * as cmd from './commands';
import { useStore } from './store';
import { findModel, PROVIDER_BY_ID } from './modelCatalog';
import { useAiDebug } from './aiDebugStore';
import { agentToolSpecs, jalankanAgentTool, AGENT_TOOLS } from './agentTools';
import type { AiChunk, AiMessage, AgentMsg, AgentToolCall, ApprovalMode, ChatMsg, ChatSession, PublicModel } from './types';

const LS_KEY = 'zephyr.ai.sessions.v1';

// Old session titles from versions before the UI was standardised to English — mapped
// back when loaded so already-saved history also shows up in English.
const JUDUL_LAMA = new Set(['Chat baru', 'New Chat', 'Neuer Chat', 'Nueva conversación']);

export const MAX_MSGS = 200;

export const ATTACH_LIMIT = 12 * 1024;

export const MSG_LIMIT = 8 * 1024;

export const MAX_IMAGES = 10;

export const IMAGE_MAX_BYTES = 3_500_000;

export const PERSIST_TOOL_CHARS = 4000;

export const HISTORY_KEEP_STEPS = 8;

export const HISTORY_TOOL_CHARS = 1200;

import { systemPromptFor, identityReminder, aturanProyek } from './systemPrompt';

import { useCliAgent } from './cliAgentStore';
import { useTerminal } from './terminalStore';
import { useProblems } from './problemsStore';
import { tx, tf } from './i18n';
let ctxCache: { at: number; teks: string } | null = null;
const CTX_TTL_MS = 60_000;

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
        content: teks.length > 800 ? `${teks.slice(0, 800)}…` : teks,
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

let seq = 0;
const nextId = (p: string) => `${p}-${Date.now().toString(36)}-${++seq}`;

export const MAX_AGENT_STEPS = 60;

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
}

export interface AgentTodo {
  content: string;
  status: 'pending' | 'in_progress' | 'done';
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

let agentStepResolve: ((r: AgentStepResult) => void) | null = null;

let agentBatal = false;

const cancelled = new Set<string>();

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
const AGENT_IDLE_MS = 90_000;
let agentWatchdog: ReturnType<typeof setTimeout> | null = null;

function agentWatchdogArm() {
  if (agentWatchdog) clearTimeout(agentWatchdog);
  agentWatchdog = setTimeout(() => {
    agentWatchdog = null;
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
      useAi.setState({ agentBusy: false, pending: null, agentConfirm: null });
    }
  }, AGENT_IDLE_MS);
}

function agentWatchdogDisarm() {
  if (agentWatchdog) clearTimeout(agentWatchdog);
  agentWatchdog = null;
}

const DESTRUCTIVE = [
  /\brm\s+-[a-z]*[rf]/i,
  /\bdel\s+\/[sq]/i,
  /\brmdir\s+\/s/i,
  /\bRemove-Item\b[^\n]*-Recurse/i,
  /\bgit\s+push\b[^\n]*--force/i,
  /\bgit\s+reset\b[^\n]*--hard/i,
  /\bgit\s+clean\b[^\n]*-[a-z]*f/i,
  /\bformat\s+[a-z]:/i,
  /\bmkfs\b/i,
  /\bdd\s+if=/i,
  /\bShutdown\b|\bRestart-Computer\b/i,
  /\bDROP\s+(TABLE|DATABASE)\b/i,
];

export function isDestructive(command: string): boolean {
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
  antrian: { teks: string; images: string[] }[];

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

  agentSteps: AgentStep[];

  agentConfirm: { tool: string; argsText: string; isDestructive: boolean } | null;

  agentTodos: AgentTodo[];

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

  setAgentTodos: (list: unknown[]) => number;

  setReasoningEffort: (e: ReasoningEffort | null) => void;

  sendAgent: (text: string) => Promise<void>;

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

  send: (text?: string) => Promise<void>;

  /* Drop one queued message, or clear the whole queue. */
  buangAntrian: (idx: number) => void;
  kosongkanAntrian: () => void;
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
    return localStorage.getItem('zephyr.ai.mode') === 'agent' ? 'agent' : 'chat';
  } catch {
    return 'chat';
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
  agentSteps: [],
  agentConfirm: null,
  agentTodos: [],
  reasoningEffort: null,
  reasoningText: null,

  init: async () => {

    // The agent status must never get stuck from a previous session. If the
    // app was closed while the agent was running, or a provider hung, this value
    // can be left true and block both sending chat and subagents.
    agentWatchdogDisarm();
    agentBatal = false;
    agentStepResolve = null;
    agentConfirmResolve = null;
    set({ pending: null, agentBusy: false, agentConfirm: null });

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
      st.providers[prov]?.model || (PROVIDER_BY_ID.get(prov)?.models[0].id ?? 'custom-model');
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
      dariSettings || PROVIDER_BY_ID.get(target)?.models[0].id || get().model;
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

  buangAntrian: (idx) => set((s) => ({ antrian: s.antrian.filter((_, i) => i !== idx) })),
  kosongkanAntrian: () => set({ antrian: [] }),
    setAttachActive: (v) => set({ attachActive: v }),
    addDraftImage: (dataUrl) => {
      const now = get().draftImages;
      if (now.length >= MAX_IMAGES) {
        set({ toast: tf('Too many images - the limit is {n} per message', { n: MAX_IMAGES }) });
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

    const bersih: AgentTodo[] = [];
    for (const raw of Array.isArray(list) ? list : []) {
      if (bersih.length >= MAX_TODOS) break;
      const o = raw as { content?: unknown; status?: unknown };
      const content = String(o?.content ?? '').trim();
      if (!content) continue;
      const s = String(o?.status ?? 'pending');
      bersih.push({
        content,
        status: s === 'done' || s === 'in_progress' ? s : 'pending',
      });
    }
    set({ agentTodos: bersih });
    return bersih.length;
  },

  setReasoningEffort: (e) => set({ reasoningEffort: e }),
  agentPutuskan: (setujui) => {
    if (agentConfirmResolve) {
      const r = agentConfirmResolve;
      agentConfirmResolve = null;
      r(setujui);
    }
    set({ agentConfirm: null });
  },

  compactContext: (keep = 6) => {
    const id = get().activeId;
    if (!id) return 0;
    const sesi = get().activeSession();
    if (!sesi) return 0;
    const msgs = sesi.messages;
    if (msgs.length <= keep) return 0;

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
    await get().send(last.content);
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

  send: async (text) => {
    get().sinkronProvider();
    const raw = (text ?? get().draft).trim();
    const imgs = get().draftImages;
    if (!raw && imgs.length === 0) return;

    if (get().agentMode === 'agent') {
      if (!raw) return;
      if (get().agentBusy) {
        // Park it instead of refusing: the composer accepts the message and it
        // goes out as soon as the running task finishes.
        set((s) => ({ antrian: [...s.antrian, { teks: raw, images: imgs }] }));
        set({ draft: '', draftImages: [], toast: tx('Added to the queue') });
        return;
      }
      await get().sendAgent(raw);
      return;
    }
    if (get().pending) {
      // Same rule in chat mode: queue it rather than dropping the text.
      set((s) => ({ antrian: [...s.antrian, { teks: raw, images: imgs }] }));
      set({ draft: '', draftImages: [], toast: tx('Added to the queue') });
      return;
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
        return;
      }
      set({
        toast: tf('Add an API key for {name} in Settings, or pick a provider that already has one', { name: label }),
      });
      return;
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
    {

      const [ekstra, aturan] = await Promise.all([konteksAgent(), aturanProyek()]);

      const ai = get();
      history.unshift({
        role: 'system',
        content: systemPromptFor(bhsJawab, ekstra, aturan, ai.model, ai.provider),
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
      return;
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
  },

  sendAgent: async (raw) => {
    get().sinkronProvider();
    if (get().pending || get().agentBusy) {
      set({ toast: tx('An agent task is still running - stop it first') });
      return;
    }

    const agentImages = get().draftImages;
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
        return;
      }
      set({
        toast: tf('Add an API key for {name} in Settings, or pick a provider that already has one', { name: label }),
      });
      return;
    }

    let sessionId = get().activeId;
    if (!sessionId) sessionId = get().newChat();

    const userMsg: ChatMsg = { id: nextId('m'), role: 'user', content, at: Date.now() };
    const botMsg: ChatMsg = {
      id: nextId('m'),
      role: 'assistant',
      content: '',
      at: Date.now(),
      streaming: true,
      model: get().model,
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
      agentConfirm: null,
      agentTodos: [],
    }));
    persist(get());
    agentBatal = false;

    const def = findModel(get().model, get().provider);
    const cfg = useStore.getState().settings.models.providers[def.provider] ?? {};

    const history: AgentMsg[] = [];
    const prev = (get().activeSession()?.messages ?? []).filter(
      (m) => !m.error && m.content.trim() && m.id !== botMsg.id,
    );
    for (const m of prev) {
      if (m.role === 'user' || m.role === 'assistant') {
        history.push({ role: m.role, content: m.content });
      }
    }
    const bhsJawab = useStore.getState().settings.models.answerLang ?? 'follow';
    {

      const [ekstra, aturan] = await Promise.all([konteksAgent(), aturanProyek()]);
      const ai = get();
      history.unshift({
        role: 'system',
        content: systemPromptFor(bhsJawab, ekstra, aturan, ai.model, ai.provider),
      });
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
    let langkah = 0;
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
        for (let i = history.length - 1; i >= 0; i--) {
          if (history[i].role === 'user' && history[i].content.startsWith('# Status pekerjaanmu')) {
            history.splice(i, 1);
          }
        }
        history.push({
          role: 'user',
          content: statusPekerjaan(get().agentTodos, get().agentSteps, langkah + 1, MAX_AGENT_STEPS),
        });
        const res = await new Promise<AgentStepResult>((resolve) => {
          agentStepResolve = resolve;
          cmd
            .aiToolChatStream({
              id: botMsg.id,
              provider: def.provider,
              model: def.id,
              messages: ringkasRiwayat(history),
              tools: agentToolSpecs(),
              baseUrl: cfg.baseUrl || undefined,
              maxTokens: def.maxOut ?? 2048,
              effort: get().reasoningEffort ?? undefined,
            })
            .catch((e) => {
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
        if (res.error) throw new Error(res.error);
        if (res.cancelled || agentBatal) break;

        akhir = res.content;
        history.push({ role: 'assistant', content: res.content, toolCalls: res.toolCalls });
        if (res.toolCalls.length === 0) break;

        for (const tc of res.toolCalls) {
          if (agentBatal) break;
          const mulaiTool = Date.now();
          const argsObj = (tc.args ?? {}) as Record<string, unknown>;
          const namaShell = tc.name === 'terminal_exec' || tc.name === 'shell_exec';
          const perintah = namaShell ? String(argsObj.command ?? '') : '';
          const readOnlyBlok =
            get().approvalMode === 'readonly' &&
            (namaShell || tc.name === 'editor_write');

          const diizinkan =
            !isDestructive(perintah) && useStore.getState().izinPerintah(perintah);
          const perluSetuju =
            namaShell &&
            !diizinkan &&
            (get().approvalMode === 'ask' ||
              (get().approvalMode !== 'auto' && isDestructive(perintah)));

          let hasil: string;
          let ok = true;
          if (readOnlyBlok) {
            hasil = `(refused: read-only mode does not allow ${tc.name})`;
            ok = false;
          } else if (perluSetuju) {
            set({
              agentConfirm: {
                tool: tc.name,
                argsText: JSON.stringify(argsObj),
                isDestructive: namaShell && isDestructive(perintah),
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
                hasil = await jalankanAgentTool(tc.name, argsObj);
              } catch (e) {
                hasil = `ERROR: ${cmd.asZephyrError(e).message}`;
                ok = false;
              }
            }
          } else {
            try {
              hasil = await jalankanAgentTool(tc.name, argsObj);
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
          const run = {
            name: tc.name,
            args: JSON.stringify(argsObj),

            result: hasil,
            ok,
            at: selesaiPada,
            /* Time spent inside the tool, measured from before the dispatch
               above, so the badge reports the call and not the queue. */
            ms: selesaiPada - mulaiTool,
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
        }
      }
    } catch (e) {
      if (!akhir) akhir = `Failed to run the agent: ${cmd.asZephyrError(e).message}`;
    }

    if (agentBatal) {
      if (!akhir) akhir = '(cancelled by the user)';
      agentBatal = false;
    }
    if (langkah >= MAX_AGENT_STEPS) {
      akhir = `${akhir || ''}\n\n[Batas ${MAX_AGENT_STEPS} langkah tool tercapai — tugas dihentikan]`;
    }

    set((s) => ({
      agentBusy: false,
      agentSteps: [...s.agentSteps, { kind: 'selesai', at: Date.now() }],
      sessions: s.sessions.map((x) =>
        x.id === sessionId
          ? {
              ...x,
              messages: x.messages.map((m) => {
                if (m.id !== botMsg.id) return m;

                /*
                 * `akhir` comes from Rust's `toolDone` and has already been cleaned
                 * of the tool-call XML blocks (see adapters/xml_tools.rs).
                 * `m.content` is the accumulation of raw streaming chunks that
                 * still contains those XML tags, so for a message that uses tools
                 * the final answer must win; otherwise the raw tags get
                 * saved to disk too. For ordinary narration (no tools) `akhir`
                 * equals the text, so nothing is lost.
                 */
                const tampil = akhir.trim() ? akhir : m.content;
                return { ...m, content: tampil || '(no answer)', streaming: false };
              }),
            }
          : x,
      ),
    }));
    persist(get());
  },

  cancel: async () => {

    if (get().agentBusy) {
      agentBatal = true;
      agentWatchdogDisarm();
      if (agentConfirmResolve) {
        const r = agentConfirmResolve;
        agentConfirmResolve = null;
        r(false);
      }

      const aktif = get().activeSession()?.messages.slice(-1)[0]?.id;
      if (aktif) {
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

    // There is activity from the provider: postpone the idle watchdog.
    if (agentWatchdog) agentWatchdogArm();

    if (c.toolDone) {
      agentWatchdogDisarm();
      cancelled.delete(c.id);
      const r = agentStepResolve;
      agentStepResolve = null;
      if (c.err) {
        r?.({ content: '', toolCalls: [], cancelled: false, error: c.err });
        return;
      }
      r?.({
        content: c.content ?? '',
        toolCalls: c.toolCalls ?? [],
        cancelled: !!c.cancelled,
      });
      return;
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
    set((s) => ({
      sessions: s.sessions.map((sess) => ({
        ...sess,
        messages: sess.messages.map((m) => {
          if (m.id !== c.id) return m;
          if (c.err) return { ...m, error: c.err, streaming: false };

          if (c.reasoning)
            return { ...m, reasoning: (m.reasoning ?? '') + c.reasoning };
          if (c.text) return { ...m, content: m.content + c.text };
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
        set((s3) => ({ antrian: s3.antrian.slice(1) }));
        void get().send(next.teks);
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
