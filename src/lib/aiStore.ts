// aiStore.ts — state panel AI (fase 09).
//
// Dipisah dari store utama (seperti explorerStore/terminalStore) supaya chat
// yang ramai tidak memicu render editor/terminal.
//
// Yang dipegang di sini:
//   * daftar sesi chat + sesi aktif (history persist di localStorage,
//     max 200 pesan per sesi — batas dari prompt fase 09)
//   * model aktif (disimpan juga ke settings.models supaya konsisten dengan
//     Settings → Model AI)
//   * streaming: satu request aktif; potongan `ai-chunk` di-append ke pesan
//     assistant terakhir
//   * status key per provider (dari Rust, hanya hasKey/preview)
//
// API key TIDAK PERNAH ada di store ini.

import { create } from 'zustand';
import * as cmd from './commands';
import { useStore } from './store';
import { findModel, PROVIDER_BY_ID } from './modelCatalog';
import { agentToolSpecs, jalankanAgentTool } from './agentTools';
import type { AiChunk, AiMessage, AgentMsg, ChatMsg, ChatSession, PublicModel } from './types';

const LS_KEY = 'zephyr.ai.sessions.v1';
/** Batas history per sesi (prompt fase 09: max 200 msg). */
export const MAX_MSGS = 200;
/** Batas isi file yang dilampirkan (12KB, prompt fase 09). */
export const ATTACH_LIMIT = 12 * 1024;
/** fase 15.5: batas panjang satu pesan user. Di atas ini pesan DIPOTONG
 *  dengan catatan — provider akan menolak / memotong sendiri secara diam-diam,
 *  dan itu lebih membingungkan daripada pemberitahuan jujur. */
export const MSG_LIMIT = 8 * 1024;

/**
 * Instruksi bahasa jawaban AI (Settings → Model AI).
 * Mengembalikan '' kalau 'follow' (biarkan model mengikuti bahasa pertanyaan).
 * Instruksi ditulis dalam bahasa sasarannya sendiri supaya tidak bergantung
 * pada pemahaman model terhadap bahasa Indonesia.
 */
export function systemPromptFor(answerLang: string): string {
  if (!answerLang || answerLang === 'follow') return '';
  if (answerLang === 'id') return 'Selalu jawab dalam bahasa Indonesia.';
  if (answerLang === 'en') return 'Always answer in English.';
  // Bahasa bebas (custom): dipakai apa adanya — model modern mengerti nama
  // bahasa dalam konteks ini.
  return `Selalu jawab dalam bahasa ${answerLang}.`;
}

let seq = 0;
const nextId = (p: string) => `${p}-${Date.now().toString(36)}-${++seq}`;

// ── mode agent ──

/** Maks langkah tool per tugas agent — penjaga biaya & loop tak berujung. */
export const MAX_AGENT_STEPS = 25;

/** Satu baris log aktivitas agent untuk task aktif (UI, bukan persisted). */
export interface AgentStep {
  kind: 'mulai' | 'tool' | 'selesai';
  name?: string;
  args?: string;
  result?: string;
  ok?: boolean;
  at: number;
}

/** Resolver persetujuan tool yang menunggu keputusan user (di luar state). */
let agentConfirmResolve: ((ok: boolean) => void) | null = null;
/** Flag batal — loop agent memeriksa tiap langkah. */
let agentBatal = false;

/** Request yang sudah dibatalkan user. Chunk yang masih tiba untuk id ini
 *  diabaikan — Rust bisa sudah mengirim beberapa potongan sebelum flag batal
 *  terbaca thread streaming. */
const cancelled = new Set<string>();

/** Perintah yang tidak boleh dikirim ke terminal tanpa konfirmasi. */
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

/** true = perintah berpotensi merusak, minta konfirmasi dulu. */
export function isDestructive(command: string): boolean {
  return DESTRUCTIVE.some((re) => re.test(command));
}

/** Ambil blok kode shell terakhir dari teks markdown.
 *  Hanya bahasa yang memang perintah: bash/sh/shell/ps1/powershell/cmd/bat. */
export function extractCommand(markdown: string): string | null {
  const re = /```(bash|sh|shell|zsh|ps1|powershell|pwsh|cmd|bat|console|terminal)?\s*\n([\s\S]*?)```/gi;
  let last: string | null = null;
  for (;;) {
    const m = re.exec(markdown);
    if (!m) break;
    const lang = (m[1] ?? '').toLowerCase();
    // Fence tanpa bahasa dianggap perintah HANYA kalau isinya satu baris
    // pendek — kalau tidak, itu biasanya cuplikan kode biasa.
    const body = m[2].trim();
    if (!body) continue;
    const isCmdLang = lang !== '' && lang !== 'console' ? true : body.split('\n').length <= 3;
    if (isCmdLang) last = body;
  }
  return last;
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
        // Pesan yang tersimpan saat streaming belum selesai tidak boleh
        // kembali sebagai "sedang mengalir" setelah restart.
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

interface AiState {
  sessions: ChatSession[];
  activeId: string | null;
  /** model aktif (id dari katalog atau nama bebas untuk provider custom) */
  model: string;
  provider: string;
  /** id request yang sedang streaming; null = idle */
  pending: string | null;
  /** draft input (di store supaya Ctrl+I & "Analisis error TS" bisa mengisi) */
  draft: string;
  /** lampirkan file aktif ke pesan berikutnya */
  attachActive: boolean;
  /** fase 15.5: laporan pemotongan pesan terakhir (null = tidak ada).
   *  Dipisah dari `toast` karena toast bisa tertimpa pesan lain (mis. guard
   *  API key) sebelum user/harness membacanya. */
  lastTruncated: { from: number; to: number } | null;
  keys: PublicModel[];
  /** dropdown model terbuka */
  modelMenuOpen: boolean;
  /** konfirmasi kirim perintah berbahaya ke terminal */
  confirmCmd: string | null;
  toast: string | null;

  // ── mode agent ──

  /** 'chat' = streaming biasa; 'agent' = tool loop. */
  agentMode: 'chat' | 'agent';
  /** persetujuan perintah agent: ask (default) | auto | readonly */
  approvalMode: 'ask' | 'auto' | 'readonly';
  /** loop agent sedang berjalan */
  agentBusy: boolean;
  /** log langkah task aktif */
  agentSteps: AgentStep[];
  /** tool yang menunggu persetujuan user (modal di AiPanel) */
  agentConfirm: { tool: string; argsText: string; isDestructive: boolean } | null;
}

interface AiActions {
  init: () => Promise<void>;
  loadKeys: () => Promise<void>;
  hasKey: (provider?: string) => boolean;

  setModel: (modelId: string) => Promise<void>;
  setModelMenuOpen: (v: boolean) => void;
  setDraft: (v: string) => void;
  setAttachActive: (v: boolean) => void;
  setToast: (v: string | null) => void;
  setConfirmCmd: (v: string | null) => void;

  setAgentMode: (m: 'chat' | 'agent') => void;
  setApprovalMode: (m: 'ask' | 'auto' | 'readonly') => void;
  /** Jawaban modal persetujuan tool agent. */
  agentPutuskan: (setujui: boolean) => void;
  /** Loop agent (dipanggil send() saat agentMode='agent'). */
  sendAgent: (text: string) => Promise<void>;

  newChat: () => string;
  selectChat: (id: string) => void;
  deleteChat: (id: string) => void;
  activeSession: () => ChatSession | null;

  /** Kirim draft (atau teks tertentu) ke provider. */
  send: (text?: string) => Promise<void>;
  cancel: () => Promise<void>;
  /** Handler event `ai-chunk` — dipasang sekali di App.tsx. */
  onChunk: (c: AiChunk) => void;
  /** Kirim perintah ke pane terminal aktif (buat pane bila belum ada). */
  runInTerminal: (command: string, opts?: { confirmed?: boolean }) => Promise<boolean>;
}

export type AiStore = AiState & AiActions;

/** Simpan ke localStorage (dibatasi supaya tidak membengkak). */
function persist(state: AiState) {
  try {
    const sessions = state.sessions.slice(-20).map((s) => ({
      ...s,
      messages: s.messages.slice(-MAX_MSGS),
    }));
    localStorage.setItem(LS_KEY, JSON.stringify({ sessions, activeId: state.activeId }));
  } catch {
    /* kuota penuh — chat tetap jalan di memori */
  }
}

const boot = loadSessions();

export const useAi = create<AiStore>((set, get) => ({
  sessions: boot.sessions,
  activeId: boot.activeId,
  model: 'gemini-3.6-flash',
  provider: 'gemini',
  pending: null,
  draft: '',
  attachActive: false,
  lastTruncated: null,
  keys: [],
  modelMenuOpen: false,
  confirmCmd: null,
  toast: null,

  agentMode: 'chat',
  approvalMode: 'ask',
  agentBusy: false,
  agentSteps: [],
  agentConfirm: null,

  init: async () => {
    // Model aktif mengikuti Settings → Model AI kalau sudah pernah dipilih.
    const st = useStore.getState().settings.models;
    const prov = PROVIDER_BY_ID.get(st.activeProvider) ? st.activeProvider : 'gemini';
    const model = st.providers[prov]?.model || (PROVIDER_BY_ID.get(prov)?.models[0].id ?? 'gemini-3.6-flash');
    set({
      provider: prov,
      model,
      attachActive: useStore.getState().settings.agents.attachActiveFile,
    });
    if (get().sessions.length === 0) get().newChat();
    await get().loadKeys();
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

  setModel: async (modelId) => {
    const def = findModel(modelId, get().provider);
    set({ model: def.id, provider: def.provider, modelMenuOpen: false });
    // Sesi aktif mencatat model terakhir yang dipakai.
    set((s) => ({
      sessions: s.sessions.map((x) =>
        x.id === s.activeId ? { ...x, model: def.id, provider: def.provider } : x,
      ),
    }));
    persist(get());
    // Simpan ke settings supaya Settings → Model AI ikut berubah.
    const models = useStore.getState().settings.models;
    await useStore.getState().applySettings({
      models: {
        activeProvider: def.provider,
        providers: {
          ...models.providers,
          [def.provider]: { ...(models.providers[def.provider] ?? {}), model: def.id },
        },
      },
    });
  },

  setModelMenuOpen: (v) => set({ modelMenuOpen: v }),
  setDraft: (v) => set({ draft: v }),
  setAttachActive: (v) => set({ attachActive: v }),
  setToast: (v) => set({ toast: v }),
  setConfirmCmd: (v) => set({ confirmCmd: v }),
  setAgentMode: (m) => set({ agentMode: m }),
  setApprovalMode: (m) => set({ approvalMode: m }),
  agentPutuskan: (setujui) => {
    if (agentConfirmResolve) {
      const r = agentConfirmResolve;
      agentConfirmResolve = null;
      r(setujui);
    }
    set({ agentConfirm: null });
  },

  newChat: () => {
    const s = makeSession(get().model, get().provider);
    set((st) => ({ sessions: [...st.sessions, s], activeId: s.id, draft: '' }));
    persist(get());
    return s.id;
  },

  selectChat: (id) => {
    set({ activeId: id });
    persist(get());
  },

  deleteChat: (id) => {
    set((s) => {
      const sessions = s.sessions.filter((x) => x.id !== id);
      const activeId = s.activeId === id ? (sessions[sessions.length - 1]?.id ?? null) : s.activeId;
      return { sessions, activeId };
    });
    if (get().sessions.length === 0) get().newChat();
    persist(get());
  },

  activeSession: () => get().sessions.find((s) => s.id === get().activeId) ?? null,

  send: async (text) => {
    const raw = (text ?? get().draft).trim();
    if (!raw) return;
    // Mode agent: jalankan tool loop, bukan streaming chat biasa.
    if (get().agentMode === 'agent') {
      await get().sendAgent(raw);
      return;
    }
    if (get().pending) {
      set({ toast: 'Masih menunggu jawaban — batalkan dulu' });
      return;
    }

    // fase 15.5: pesan raksasa dipotong DI SINI dengan catatan yang terlihat,
    // bukan dibiarkan ditolak provider dengan error 400 yang tidak jelas.
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

    // V2: tanpa API key jangan kirim apa pun, jangan crash.
    await get().loadKeys();
    if (!get().hasKey()) {
      const label = PROVIDER_BY_ID.get(get().provider)?.label ?? get().provider;
      set({ toast: `Isi API key ${label} di Settings → Model AI` });
      return;
    }

    let sessionId = get().activeId;
    if (!sessionId) sessionId = get().newChat();

    // Lampiran file aktif (opsional).
    let attached: ChatMsg['attached'];
    let payloadContent = content;
    if (get().attachActive) {
      const st = useStore.getState();
      const tab = st.tabs.find((t) => t.id === st.activeTabId);
      if (tab) {
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
    }

    const reqId = nextId('req');
    const userMsg: ChatMsg = {
      id: nextId('m'),
      role: 'user',
      content,
      at: Date.now(),
      attached,
    };
    const botMsg: ChatMsg = {
      id: reqId, // id pesan assistant = id request supaya chunk mudah dicocokkan
      role: 'assistant',
      content: '',
      at: Date.now(),
      streaming: true,
      model: get().model,
    };

    // Riwayat yang dikirim: seluruh pesan sebelumnya + pesan baru (versi
    // payload dengan lampiran), tanpa pesan yang error.
    const prev = get().activeSession()?.messages ?? [];
    const history: AiMessage[] = prev
      .filter((m) => !m.error && m.content.trim())
      .map((m) => ({ role: m.role, content: m.content }));
    // Bahasa jawaban AI (Settings → Model AI): instruksi dikirim sebagai pesan
    // system di awal tiap percakapan supaya model konsisten menjawab dalam
    // bahasa pilihan. 'follow' = biarkan model mengikuti bahasa pertanyaan.
    const sys = systemPromptFor(useStore.getState().settings.models.answerLang ?? 'follow');
    if (sys) history.unshift({ role: 'system', content: sys });
    history.push({ role: 'user', content: payloadContent });

    set((s) => ({
      sessions: s.sessions.map((x) =>
        x.id === sessionId
          ? {
              ...x,
              // Judul sesi = kalimat pertama user (dipotong).
              title: x.messages.length === 0 ? content.slice(0, 42) : x.title,
              messages: [...x.messages, userMsg, botMsg].slice(-MAX_MSGS),
            }
          : x,
      ),
      draft: text ? s.draft : '',
      pending: reqId,
      toast: null,
    }));
    persist(get());

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
      });
    } catch (e) {
      const msg = cmd.asZephyrError(e).message;
      get().onChunk({ id: reqId, err: msg });
      get().onChunk({ id: reqId, done: true });
    }
  },

  sendAgent: async (raw) => {
    if (get().pending || get().agentBusy) {
      set({ toast: 'Masih ada tugas agent berjalan — Stop dulu' });
      return;
    }
    // Sama seperti send(): pesan raksasa dipotong dengan catatan jelas.
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
      set({ toast: `Isi API key ${label} di Settings → Model AI` });
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
      streaming: false,
      model: get().model,
    };
    set((s) => ({
      sessions: s.sessions.map((x) =>
        x.id === sessionId
          ? {
              ...x,
              title: x.messages.length === 0 ? content.slice(0, 42) : x.title,
              messages: [...x.messages, userMsg, botMsg].slice(-MAX_MSGS),
            }
          : x,
      ),
      draft: '',
      toast: null,
      agentSteps: [],
      agentBusy: true,
      agentConfirm: null,
    }));
    persist(get());
    agentBatal = false;

    const def = findModel(get().model, get().provider);
    const cfg = useStore.getState().settings.models.providers[def.provider] ?? {};

    // Riwayat untuk model: user/assistant dari sesi (tool context per tugas,
    // tidak dipersist — lihat catatan di header file).
    const history: AgentMsg[] = [];
    const prev = (get().activeSession()?.messages ?? []).filter(
      (m) => !m.error && m.content.trim() && m.id !== botMsg.id,
    );
    for (const m of prev) {
      if (m.role === 'user' || m.role === 'assistant') {
        history.push({ role: m.role, content: m.content });
      }
    }
    const sys = systemPromptFor(useStore.getState().settings.models.answerLang ?? 'follow');
    if (sys) history.unshift({ role: 'system', content: sys });
    history.push({ role: 'user', content });

    let akhir = '';
    let langkah = 0;
    try {
      for (; langkah < MAX_AGENT_STEPS; langkah++) {
        if (agentBatal) break;
        set((s) => ({
          agentSteps: [...s.agentSteps, { kind: 'mulai', at: Date.now() }],
        }));

        const res = await cmd.aiToolChat({
          provider: def.provider,
          model: def.id,
          messages: history,
          tools: agentToolSpecs(),
          baseUrl: cfg.baseUrl || undefined,
          maxTokens: def.maxOut ?? 2048,
        });
        akhir = res.content;
        history.push({ role: 'assistant', content: res.content, toolCalls: res.toolCalls });
        if (res.done || res.toolCalls.length === 0) break;

        for (const tc of res.toolCalls) {
          if (agentBatal) break;
          const argsObj = (tc.args ?? {}) as Record<string, unknown>;
          const perintah =
            tc.name === 'terminal_exec' ? String(argsObj.command ?? '') : '';
          const readOnlyBlok =
            get().approvalMode === 'readonly' &&
            (tc.name === 'terminal_exec' || tc.name === 'editor_write');
          const perluSetuju =
            tc.name === 'terminal_exec' &&
            (get().approvalMode === 'ask' || isDestructive(perintah));

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
                isDestructive: tc.name === 'terminal_exec' && isDestructive(perintah),
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
                hasil = `ERROR: ${(e as Error).message ?? String(e)}`;
                ok = false;
              }
            }
          } else {
            try {
              hasil = await jalankanAgentTool(tc.name, argsObj);
            } catch (e) {
              hasil = `ERROR: ${(e as Error).message ?? String(e)}`;
              ok = false;
            }
          }

          if (agentBatal) break;
          set((s) => ({
            agentSteps: [
              ...s.agentSteps,
              {
                kind: 'tool',
                name: tc.name,
                args: JSON.stringify(argsObj),
                result: hasil.slice(0, 400),
                ok,
                at: Date.now(),
              },
            ],
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
              messages: x.messages.map((m) =>
                m.id === botMsg.id
                  ? { ...m, content: akhir || '(tidak ada jawaban)', streaming: false }
                  : m,
              ),
            }
          : x,
      ),
    }));
    persist(get());
  },

  cancel: async () => {
    // Loop agent: tandai batal; modal persetujuan yang terbuka ikut ditutup.
    if (get().agentBusy) {
      agentBatal = true;
      if (agentConfirmResolve) {
        const r = agentConfirmResolve;
        agentConfirmResolve = null;
        r(false);
      }
      set({ agentConfirm: null });
      return;
    }
    const id = get().pending;
    if (!id) return;
    // Tandai dulu supaya chunk yang MASIH DI JALAN (sudah dikirim Rust
    // sebelum flag batal terbaca) tidak ikut di-append. Tanpa ini teks
    // sempat bertambah beberapa token setelah user menekan Stop.
    cancelled.add(id);
    try {
      await cmd.aiCancel(id);
    } catch {
      /* sudah selesai */
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
    // Request yang sudah dibatalkan: buang teksnya, cukup tutup statusnya.
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
          if (c.text) return { ...m, content: m.content + c.text };
          if (c.done) return { ...m, streaming: false };
          return m;
        }),
      })),
      pending: c.done || c.err ? (s.pending === c.id ? null : s.pending) : s.pending,
    }));
    if (c.done || c.err) persist(get());
  },

  runInTerminal: async (command, opts) => {
    if (!opts?.confirmed && isDestructive(command)) {
      set({ confirmCmd: command });
      return false;
    }
    const { useTerminal } = await import('./terminalStore');
    const t = useTerminal.getState();
    // Cari pane shell yang masih hidup; kalau tidak ada, buat baru.
    let pane = t
      .allPanes()
      .find((p) => p.status === 'live' && p.kind !== 'browser' && p.kind !== 'agent');
    if (!pane) {
      const id = await t.addPane('shell');
      if (!id) {
        set({ toast: 'Tidak bisa membuka pane terminal', confirmCmd: null });
        return false;
      }
      // Beri shell waktu menampilkan prompt sebelum perintah dikirim.
      await new Promise((r) => setTimeout(r, 700));
      pane = useTerminal.getState().findPane(id);
    }
    if (!pane) return false;
    useTerminal.getState().setVisible(true);
    try {
      // '\r' = Enter di ConPTY. Perintah multi-baris dikirim baris per baris.
      // fase 15.2: lewat writeChunked supaya blok kode panjang tidak korup
      // di ConPTY (sama seperti paste).
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
