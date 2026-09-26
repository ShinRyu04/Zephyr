import { create } from 'zustand';
import { subagentOnChunk } from './subagentStore';
import * as cmd from './commands';
import { useStore } from './store';
import { findModel, PROVIDER_BY_ID } from './modelCatalog';
import { agentToolSpecs, jalankanAgentTool, AGENT_TOOLS } from './agentTools';
import type { AiChunk, AiMessage, AgentMsg, AgentToolCall, ApprovalMode, ChatMsg, ChatSession, PublicModel } from './types';

const LS_KEY = 'zephyr.ai.sessions.v1';

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
let ctxCache: { at: number; teks: string } | null = null;
const CTX_TTL_MS = 60_000;

export async function konteksAgent(): Promise<string> {
  const now = Date.now();
  if (ctxCache && now - ctxCache.at < CTX_TTL_MS) return ctxCache.teks;
  try {
    const [dariRust, proyek] = await Promise.all([
      cmd.agentContext(),
      import('./projectContext').then((m) => m.ringkasanProyek()),
    ]);
    const teks = [dariRust, proyek].filter((s) => s && s.trim()).join('\n\n');
    ctxCache = { at: now, teks };
    return teks;
  } catch {
    return ctxCache?.teks ?? '';
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
            ? `${isi.slice(0, HISTORY_TOOL_CHARS)}\n[… hasil dipotong, ${isi.length - HISTORY_TOOL_CHARS} karakter lagi tidak dikirim]`
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
      ? `[${jumlahTool} langkah sebelumnya diringkas agar percakapan tetap cepat. ` +
        `Kalau butuh detailnya, jalankan ulang tool yang relevan — jangan mengarang isinya.]`
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

export const MAX_AGENT_STEPS = 25;

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
    baris.push('## Rencana: belum ada. Kalau tugas butuh 3+ langkah, tulis rencananya ke todo_write.');
  }

  // Hanya langkah tool yang relevan; ambil 8 terakhir supaya prompt ringkas.
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
        `## Perhatian: ${gagal.length} langkah terakhir GAGAL. ` +
          'Jangan ulangi dengan cara yang sama — pakai pendekatan berbeda atau jelaskan penghambatnya.',
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
 * Watchdog langkah agent.
 *
 * Provider bisa menggantung: koneksi terbuka, header terkirim, lalu tidak ada
 * byte lagi dan tidak ada penutup stream. Saat itu Rust tidak pernah mengirim
 * "toolDone", jadi promise langkah di frontend menunggu selamanya dan
 * `agentBusy` tetap true. Efeknya luas: tombol Stop tidak mengembalikan UI,
 * dan subagent tidak bisa dijalankan karena form menolak saat agentBusy true.
 *
 * Watchdog menyetel ulang timer tiap kali ada chunk. Kalau benar-benar sepi
 * lebih dari AGENT_IDLE_MS, langkah dianggap gagal dan status agent dilepas.
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
    // Kalau tidak ada langkah yang menunggu (mis. menggantung di luar loop),
    // paksa status agent lepas supaya UI dan subagent tidak terkunci.
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
  if (!baris) return 'Chat baru';
  if (baris.length <= 48) return baris;
  const potong = baris.slice(0, 48);
  const spasi = potong.lastIndexOf(' ');
  return (spasi > 24 ? potong.slice(0, spasi) : potong) + '…';
}

function makeSession(model: string, provider: string): ChatSession {
  return {
    id: nextId('chat'),
    title: 'Chat baru',
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
   * Samakan provider/model panel AI dengan settings.models.activeProvider.
   *
   * Dropdown "Model aktif" di Settings cuma menulis ke settings, sedangkan
   * panel AI punya salinan sendiri (aiStore.provider). Tanpa penyelarasan,
   * memilih provider baru baru terasa setelah app di-restart — jadi aksi ini
   * dipanggil applySettings setiap kali models.activeProvider berubah.
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
   * Padatkan konteks sesi aktif secara manual.
   *
   * Menyimpan sejumlah pesan terakhir dan mengganti sisanya dengan satu pesan
   * ringkasan, supaya sesi panjang tidak membanjiri jendela konteks. Mengembalikan
   * jumlah pesan yang dipadatkan.
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
    /* kuota penuh — chat tetap jalan di memori */
  }
}

const boot = loadSessions();

/** Mode agent terakhir yang dipilih user, dipertahankan antar sesi. */
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

    // Status agent tidak pernah boleh nyangkut dari sesi sebelumnya. Kalau
    // app ditutup saat agent berjalan, atau provider menggantung, nilai ini
    // bisa tersisa true dan memblokir kirim chat maupun subagent.
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
      /* non-fatal: jatuh ke pemilihan tanpa info key */
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
      /* non-fatal: badge status jadi "belum ada key" */
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

    // Provider yang belum dikenal biarkan apa adanya: menormalkan sekarang
    // justru bisa memindahkan panel ke provider yang salah.
    if (!PROVIDER_BY_ID.has(target)) return;

    const dariSettings = models.providers?.[target]?.model;
    const providerSama = target === get().provider;
    const modelSama = !dariSettings || dariSettings === get().model;

    // Kalau provider DAN model sudah sama, tidak ada yang perlu diubah.
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
    setAttachActive: (v) => set({ attachActive: v }),
    addDraftImage: (dataUrl) => {
      const now = get().draftImages;
      if (now.length >= MAX_IMAGES) {
        set({ toast: `Maksimal ${MAX_IMAGES} gambar per pesan` });
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
      toast: `${lama.length} pesan dipadatkan`,
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
    set({ toast: 'Riwayat chat dibersihkan' });
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
      set({ toast: 'Tidak ada pesan untuk diekspor' });
      return;
    }
    const def = findModel(s.model, s.provider);
    const lines: string[] = [`# ${s.title}`, '', `**Model:** ${def.label} (${def.providerLabel})`, ''];
    for (const m of s.messages) {
      if (m.error) continue;
      lines.push(`## ${m.role === 'user' ? 'User' : def.label}`, '');
      if (m.image) lines.push('_[lampiran gambar — tidak ikut diekspor]_', '');
      lines.push(m.content, '');
    }
    const md = lines.join('\n');
    const { clipboardWrite } = await import('./clipboard');
    await clipboardWrite(md);
    set({ toast: `Chat diekspor (${md.length} karakter) — disalin ke clipboard` });
  },

  send: async (text) => {
    get().sinkronProvider();
    const raw = (text ?? get().draft).trim();
    const imgs = get().draftImages;
    if (!raw && imgs.length === 0) return;

    if (get().agentMode === 'agent') {
      if (!raw) return;
      await get().sendAgent(raw);
      return;
    }
    if (get().pending) {
      set({ toast: 'Masih menunggu jawaban — batalkan dulu' });
      return;
    }

    let content = raw;
    if (raw.length > MSG_LIMIT) {
      content =
        `${raw.slice(0, MSG_LIMIT)}\n\n[dipotong: pesan ${raw.length} karakter, ` +
        `dikirim ${MSG_LIMIT} karakter pertama]`;
      set({
        toast: `Pesan ${raw.length} karakter dipotong ke ${MSG_LIMIT}`,
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
        set({ toast: `${label} belum ada key — pindah ke ${labelPindah} yang sudah kamu isi` });
        return;
      }
      set({
        toast: `Isi API key ${label} di Settings → Model AI (atau pilih provider yang sudah kamu isi)`,
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
        `Anggap file ini konteks kerja aktif.\n` +
        `File: ${tab.path ?? tab.name}${truncated ? ' (dipotong 12KB pertama)' : ''}\n` +
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
        set({ toast: `File "${nama}" tidak terbuka di editor` });
        continue;
      }
      payloadContent =
        payloadContent.replace(m[0], `(@file: ${path})`) +
        `\n\n--- isi ${path}${truncated ? ' (dipotong 12KB)' : ''} ---\n` +
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
            'Konteks RAG dari project ini (jawab berdasarkan ini kalau relevan):\n\n' +
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
      const teks = terakhir?.output ?? '(tidak ada output)';

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
      set({ toast: 'Masih ada tugas agent berjalan — Stop dulu' });
      return;
    }

    const agentImages = get().draftImages;
    let content = raw;
    if (raw.length > MSG_LIMIT) {
      content =
        `${raw.slice(0, MSG_LIMIT)}\n\n[dipotong: pesan ${raw.length} karakter, ` +
        `dikirim ${MSG_LIMIT} karakter pertama]`;
      set({
        toast: `Pesan ${raw.length} karakter dipotong ke ${MSG_LIMIT}`,
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
        set({ toast: `${label} belum ada key — pindah ke ${labelPindah} yang sudah kamu isi` });
        return;
      }
      set({
        toast: `Isi API key ${label} di Settings → Model AI (atau pilih provider yang sudah kamu isi)`,
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
            `[KONTEKS EDITOR] File yang sedang dibuka user: ${tabAktif.path}` +
            `${tabAktif.unsaved ? ' (ada perubahan belum disimpan di buffer)' : ''}. ` +
            'Kalau instruksi menyebut "file ini", "fungsi ini", atau "di sini", ' +
            'maksudnya file tersebut. Pakai tool editor_read/editor_write untuk isinya.',
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
            hasil = `(ditolak: mode read-only tidak mengizinkan ${tc.name})`;
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
              : `'${tc.name}' (nama tool tidak dikenal — periksa daftar tool)`;
            hasil +=
              `\n\n[PETUNJUK] Tool ${namaTool} gagal. Jangan ulangi dengan argumen yang sama.` +
              ` Periksa pesan error di atas, lalu coba pendekatan lain: baca file dulu,` +
              ` perbaiki argumen, atau pakai tool berbeda. Kalau memang tidak mungkin,` +
              ` jelaskan ke user apa yang menghambat.`;
          }

          if (agentBatal) break;
          const run = {
            name: tc.name,
            args: JSON.stringify(argsObj),

            result: hasil,
            ok,
            at: Date.now(),
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
      if (!akhir) akhir = `Gagal menjalankan agent: ${cmd.asZephyrError(e).message}`;
    }

    if (agentBatal) {
      if (!akhir) akhir = '(dibatalkan user)';
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
                 * `akhir` berasal dari `toolDone` Rust dan sudah dibersihkan
                 * dari blok tool-call XML (lihat adapters/xml_tools.rs).
                 * `m.content` adalah akumulasi potongan streaming mentah yang
                 * masih memuat tag XML itu, jadi untuk pesan yang memakai tool
                 * jawaban final harus menang; kalau tidak, tag mentah ikut
                 * tersimpan ke disk. Untuk narasi biasa (tanpa tool) `akhir`
                 * sama dengan teksnya, jadi tidak ada yang hilang.
                 */
                const tampil = akhir.trim() ? akhir : m.content;
                return { ...m, content: tampil || '(tidak ada jawaban)', streaming: false };
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
         * Saring potongan yang masih di jalan.
         *
         * Menyetel flag di Rust tidak menghentikan paket yang sudah dikirim;
         * beberapa potongan teks bisa tiba setelah tombol Stop ditekan dan —
         * tanpa penyaringan ini — terus menempel ke bubble yang sudah
         * dibatalkan. Id dihapus lagi saat chunk penutup tiba.
         */
        cancelled.add(aktif);
        try {
          await cmd.aiCancel(aktif);
        } catch {
          /* langkah sudah selesai */
        }
      }

      /*
       * Lepaskan langkah yang sedang menunggu.
       *
       * Loop agent menunggu satu promise yang hanya diselesaikan oleh chunk
       * "toolDone" dari Rust. Chunk itu baru datang setelah permintaan HTTP
       * selesai — dan saat provider menggantung, itu berarti menunggu sampai
       * timeout baca (90 detik). Tanpa pelepasan di sini, tombol Stop hanya
       * menyetel flag: UI tetap menampilkan Stop dan agent tidak berhenti
       * sampai provider menjawab sendiri.
       *
       * Hasil "cancelled" membuat loop keluar lewat jalur `res.cancelled`
       * biasa, jadi pesan akhir dan penyimpanan sesi tetap berjalan.
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
            ? { ...m, streaming: false, content: m.content || '(dibatalkan sebelum ada jawaban)' }
            : m,
        ),
      })),
    }));
    persist(get());
  },

  onChunk: (c) => {

    if (subagentOnChunk(c)) return;

    // Ada aktivitas dari provider: tunda watchdog idle.
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
        set({ toast: 'Tidak bisa membuka pane terminal', confirmCmd: null });
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
      set({ toast: 'Perintah dikirim ke terminal', confirmCmd: null });
      return true;
    } catch (e) {
      set({ toast: cmd.asZephyrError(e).message, confirmCmd: null });
      return false;
    }
  },
}));
