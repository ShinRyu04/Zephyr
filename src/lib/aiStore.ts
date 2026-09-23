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
import { subagentOnChunk } from './subagentStore';
import * as cmd from './commands';
import { useStore } from './store';
import { findModel, PROVIDER_BY_ID } from './modelCatalog';
import { agentToolSpecs, jalankanAgentTool } from './agentTools';
import type { AiChunk, AiMessage, AgentMsg, AgentToolCall, ApprovalMode, ChatMsg, ChatSession, PublicModel } from './types';

const LS_KEY = 'zephyr.ai.sessions.v1';
/** Batas history per sesi (prompt fase 09: max 200 msg). */
export const MAX_MSGS = 200;
/** Batas isi file yang dilampirkan (12KB, prompt fase 09). */
export const ATTACH_LIMIT = 12 * 1024;
/** fase 15.5: batas panjang satu pesan user. Di atas ini pesan DIPOTONG
 *  dengan catatan — provider akan menolak / memotong sendiri secara diam-diam,
 *  dan itu lebih membingungkan daripada pemberitahuan jujur. */
export const MSG_LIMIT = 8 * 1024;
/** 1.1.10: batas gambar lampiran per pesan. Lebih dari ini bikin request
 *  ke provider membengkak dan sering ditolak (payload base64 besar). */
export const MAX_IMAGES = 10;
/** Batas ukuran satu gambar (3,5 MB) — sama seperti tombol "+ gambar". */
export const IMAGE_MAX_BYTES = 3_500_000;
/** Batas hasil tool yang ditulis ke localStorage (bukan batas tampilan). */
export const PERSIST_TOOL_CHARS = 4000;

/**
 * Identitas + instruksi bahasa jawaban AI (Settings → Model AI).
 * Identitas SELALU dikirim supaya model memperkenalkan diri sebagai Zephyr AI
 * apa pun provider/key yang dipakai; instruksi bahasa menyusul bila disetel.
 */
import { systemPromptFor, IDENTITY_REMINDER, aturanProyek } from './systemPrompt';


/**
 * Konteks tambahan dari Rust (memori + daftar skill) yang ditempel ke system
 * prompt. Di-cache singkat: satu percakapan biasanya memanggil ini berkali-kali
 * (tiap langkah agent) padahal isinya jarang berubah dalam hitungan detik.
 * Cache juga membuat kegagalan IPC tidak mematikan percakapan — kalau Rust
 * tidak bisa dihubungi, percakapan jalan tanpa konteks tambahan.
 */
let ctxCache: { at: number; teks: string } | null = null;
const CTX_TTL_MS = 5000;

export async function konteksAgent(): Promise<string> {
  const now = Date.now();
  if (ctxCache && now - ctxCache.at < CTX_TTL_MS) return ctxCache.teks;
  try {
    const teks = await cmd.agentContext();
    ctxCache = { at: now, teks };
    return teks;
  } catch {
    // Jangan cache kegagalan — percobaan berikutnya boleh berhasil.
    return ctxCache?.teks ?? '';
  }
}

/** Paksa muat ulang konteks (dipakai setelah skill/memori ditulis agent). */
export function resetKonteksAgent() {
  ctxCache = null;
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

/** Hasil satu langkah agent streaming (item 21). */
interface AgentStepResult {
  content: string;
  toolCalls: AgentToolCall[];
  cancelled: boolean;
  error?: string;
}

/** Satu tugas yang ditampilkan di panel Todo (item 24). */
export interface AgentTodo {
  content: string;
  status: 'pending' | 'in_progress' | 'done';
}

/** Batas jumlah tugas — lebih dari ini panelnya jadi tidak terbaca. */
export const MAX_TODOS = 20;

/** Resolver persetujuan tool yang menunggu keputusan user (di luar state). */
let agentConfirmResolve: ((ok: boolean) => void) | null = null;
/** Resolver langkah agent yang sedang streaming — dipanggil dari onChunk. */
let agentStepResolve: ((r: AgentStepResult) => void) | null = null;
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

/**
 * Judul sesi dari pesan pertama user (A-9): baris pertama saja, buang
 * penanda markdown di depan, potong di batas kata — bukan di tengah kata.
 */
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

/** T1.1: tingkat usaha penalaran yang bisa dipilih user. */
export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high' | 'ultra';

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
    /** gambar (data URL) menunggu dikirim bersama pesan berikutnya.
     *  1.1.10: array, maks MAX_IMAGES. Urutan = urutan tampil di strip. */
    draftImages: string[];
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
  /** persetujuan perintah agent: ask | work (kerja langsung) | auto | readonly */
  approvalMode: ApprovalMode;
  /** loop agent sedang berjalan */
  agentBusy: boolean;
  /** log langkah task aktif */
  agentSteps: AgentStep[];
  /** tool yang menunggu persetujuan user (modal di AiPanel) */
  agentConfirm: { tool: string; argsText: string; isDestructive: boolean } | null;
  /** 1.1.10 (item 24): daftar tugas yang di-update agent selama bekerja. */
  agentTodos: AgentTodo[];
  /** T1.1: tingkat penalaran yang diminta (null = default provider). */
  reasoningEffort: ReasoningEffort | null;
  /** T1.1: teks penalaran terakhir yang dikirim provider (null = tidak ada). */
  reasoningText: string | null;
}

interface AiActions {
  init: () => Promise<void>;
  loadKeys: () => Promise<void>;
  hasKey: (provider?: string) => boolean;

  setModel: (modelId: string) => Promise<void>;
  setModelMenuOpen: (v: boolean) => void;
  setDraft: (v: string) => void;
    setAttachActive: (v: boolean) => void;
    /** Tambah gambar lampiran; mengembalikan false kalau sudah penuh. */
    addDraftImage: (dataUrl: string) => boolean;
    removeDraftImage: (index: number) => void;
    clearDraftImages: () => void;
    setToast: (v: string | null) => void;
  setConfirmCmd: (v: string | null) => void;

  setAgentMode: (m: 'chat' | 'agent') => void;
  setApprovalMode: (m: ApprovalMode) => void;
  /** Jawaban modal persetujuan tool agent. */
  agentPutuskan: (setujui: boolean) => void;
  /** 1.1.10 (item 24): ganti daftar tugas agent. Balikannya = jumlah diterima. */
  setAgentTodos: (list: unknown[]) => number;
  /** T1.1: set tingkat penalaran (null = default provider). */
  setReasoningEffort: (e: ReasoningEffort | null) => void;
  /** Loop agent (dipanggil send() saat agentMode='agent'). */
  sendAgent: (text: string) => Promise<void>;

  newChat: () => string;
    selectChat: (id: string) => void;
    deleteChat: (id: string) => void;
    /** 1.1.10: hapus semua riwayat chat, mulai dari sesi kosong. */
    clearAllChats: () => void;
    /** Dialog "hapus semua" sedang terbuka (dipakai ClearChatsDialog). */
    clearAllOpen: boolean;
    setClearAllOpen: (v: boolean) => void;
    /** Ulangi jawaban AI terakhir (tombol ↻). */
    regenerate: () => Promise<void>;
    activeSession: () => ChatSession | null;
    /** Salin seluruh sesi aktif ke clipboard sebagai markdown. */
    exportChat: () => Promise<void>;

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
      messages: s.messages.slice(-MAX_MSGS).map((m) => ({
        ...m,
        // Hasil tool bisa puluhan KB per perintah; yang disimpan cukup
        // potongannya — blok collapsible di UI tetap berfungsi.
        tools: m.tools?.map((t) => ({ ...t, result: t.result.slice(0, PERSIST_TOOL_CHARS) })),
      })),
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
    draftImages: [],
    lastTruncated: null,
  keys: [],
  modelMenuOpen: false,
  confirmCmd: null,
  toast: null,
  clearAllOpen: false,

  agentMode: 'chat',
  // 1.1.10 (item 22): "kerja langsung" jadi default — perintah aman jalan
  // sendiri, yang destruktif tetap minta izin. Dulu default 'ask' membuat
  // setiap terminal_exec menggantung menunggu klik.
  approvalMode: boot.sessions.find((s) => s.id === boot.activeId)?.approval ?? 'work',
  agentBusy: false,
  agentSteps: [],
  agentConfirm: null,
  agentTodos: [],
  reasoningEffort: null,
  reasoningText: null,

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
  setAgentMode: (m) => set({ agentMode: m }),
  setApprovalMode: (m) => {
    // Simpan pilihan terakhir di sesi aktif supaya berpindah sesi tidak
    // mengembalikan mode ke default (item 22).
    set((s) => ({
      approvalMode: m,
      sessions: s.sessions.map((x) => (x.id === s.activeId ? { ...x, approval: m } : x)),
    }));
    persist(get());
  },
  setAgentTodos: (list) => {
    // Bentuk dari model tidak bisa dipercaya: item tanpa teks dibuang, status
    // tak dikenal dianggap pending. Daftar kosong = tugas baru, jadi panelnya
    // ikut kosong alih-alih menyisakan daftar lama.
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

  /** T1.1: tingkat penalaran. null = jangan kirim parameter apa pun. */
  setReasoningEffort: (e) => set({ reasoningEffort: e }),
  agentPutuskan: (setujui) => {
    if (agentConfirmResolve) {
      const r = agentConfirmResolve;
      agentConfirmResolve = null;
      r(setujui);
    }
    set({ agentConfirm: null });
  },

  newChat: () => {
    const st = get();
    const s = makeSession(st.model, st.provider);
    // Sesi baru mewarisi mode persetujuan yang sedang dipakai.
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
      // 1.1.10: kalau yang dihapus adalah sesi AKTIF, buka sesi BARU kosong
      // (dulu: lompat ke sesi terakhir — user mengeluh "chat numpuk" dan
      // menghapus tidak terasa seperti mulai dari awal).
      const activeId = s.activeId === id ? null : s.activeId;
      return { sessions, activeId };
    });
    if (!get().activeId) get().newChat();
    persist(get());
  },

  /** 1.1.10: hapus SEMUA riwayat dan mulai dari satu sesi kosong. */
  clearAllChats: () => {
    set({ sessions: [], activeId: null, clearAllOpen: false });
    get().newChat();
    set({ toast: 'Riwayat chat dibersihkan' });
  },

  setClearAllOpen: (v) => set({ clearAllOpen: v }),

  /** Ulangi jawaban terakhir: hapus balasan AI terakhir lalu kirim ulang
   *  pertanyaan user terakhir. Dipakai tombol ↻ di bubble. */
  regenerate: async () => {
    if (get().pending) return;
    const s = get().activeSession();
    if (!s) return;
    const last = [...s.messages].reverse().find((m) => m.role === 'user' && !m.error);
    if (!last) return;
    // Buang pesan setelah pertanyaan terakhir (biasanya jawaban AI yang mau diganti).
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
    const raw = (text ?? get().draft).trim();
    const imgs = get().draftImages;
    if (!raw && imgs.length === 0) return;
    // Mode agent: jalankan tool loop, bukan streaming chat biasa.
    if (get().agentMode === 'agent') {
      if (!raw) return;
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

    // Lampiran file aktif (opsional) + at-mention @file (A-2). Keduanya
    // menempelkan isi file ke prompt sebagai konteks.
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
    // Parsing @file — ganti penyebutan file dengan isi sebenarnya (A-2).
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
        // RAG mati / salah config: jangan blokir chat, beri tahu saja.
        set({ toast: cmd.asZephyrError(e).message });
      }
    }
        const userMsg: ChatMsg = {
          id: nextId('m'),
          role: 'user',
          content,
          at: Date.now(),
          attached,
          // 1.1.10: banyak gambar. `image` diisi gambar pertama supaya
          // kode lama (ekspor, render) tetap jalan.
          images: imgs.length > 0 ? imgs : undefined,
          image: imgs[0],
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
              .filter((m) => !m.error && (m.content.trim() || m.images?.length || m.image))
              .map((m) => {
                const banyak = m.images?.length ? m.images : m.image ? [m.image] : [];
                return {
                  role: m.role,
                  content: m.content,
                  ...(banyak.length ? { images: banyak } : {}),
                };
              });
    // Bahasa jawaban AI (Settings → Model AI): instruksi dikirim sebagai pesan
    // system di awal tiap percakapan supaya model konsisten menjawab dalam
    // bahasa pilihan. 'follow' = biarkan model mengikuti bahasa pertanyaan.
    const bhsJawab = useStore.getState().settings.models.answerLang ?? 'follow';
    {
      // Memori + daftar skill + konteks proyek ikut di system prompt.
      // Kegagalan diabaikan: percakapan tetap jalan tanpa konteks tambahan.
      const [ekstra, aturan] = await Promise.all([konteksAgent(), aturanProyek()]);
      history.unshift({ role: 'system', content: systemPromptFor(bhsJawab, ekstra, aturan) });
    }
    // Konteks RAG disisipkan sebagai pesan "user" terpisah sebelum pertanyaan
    // asli, supaya model melihatnya tanpa dicampur ke riwayat chat (dan tanpa
    // membebani payload bila RAG kosong).
    if (ragContext) history.push({ role: 'user', content: ragContext });
            history.push({
              role: 'user',
              content: payloadContent + IDENTITY_REMINDER,
              ...(imgs.length ? { images: imgs } : {}),
            });

    set((s) => ({
      sessions: s.sessions.map((x) =>
        x.id === sessionId
          ? {
              ...x,
              // Judul sesi = baris pertama pesan user, dipotong rapi (A-9).
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

    // T1.2/T1.5: jalur CLI. Kalau user memilih CLI (akun langganan), prompt
    // dikirim ke CLI itu alih-alih ke adapter API. Zephyr tidak menyentuh
    // token CLI — ia hanya menjalankan prosesnya.
    const { useCliAgent } = await import('./cliAgentStore');
    const cliAktif = useCliAgent.getState().aktif;
    if (cliAktif) {
      const cwd = useStore.getState().workspace ?? undefined;
      await useCliAgent.getState().jalankan(content, cwd);
      const runs = useCliAgent.getState().runs;
      const terakhir = runs[runs.length - 1];
      const teks = terakhir?.output ?? '(tidak ada output)';
      // Hasil CLI menggantikan bubble bot yang tadi dibuat (bubble itu sudah
      // menampilkan status streaming).
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
    const bhsJawab = useStore.getState().settings.models.answerLang ?? 'follow';
    {
      // Mode agent dapat konteks lebih kaya: daftar skill + memori + profil
      // user, supaya ia tahu skill apa yang bisa dibuka dan apa yang sudah
      // diketahui dari sesi sebelumnya.
      const [ekstra, aturan] = await Promise.all([konteksAgent(), aturanProyek()]);
      history.unshift({ role: 'system', content: systemPromptFor(bhsJawab, ekstra, aturan) });
    }
    history.push({ role: 'user', content: content + IDENTITY_REMINDER });

    let akhir = '';
    let langkah = 0;
    try {
      for (; langkah < MAX_AGENT_STEPS; langkah++) {
        if (agentBatal) break;
        set((s) => ({
          agentSteps: [...s.agentSteps, { kind: 'mulai', at: Date.now() }],
          // Langkah kedua dan seterusnya menempel di bubble yang sama —
          // beri pemisah supaya narasi antar langkah tidak menyambung.
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

        // 1.1.10 (item 21): langkah ini STREAMING. Teks yang tumbuh di-append
        // ke bubble bot lewat onChunk; hasil akhir (teks penuh + tool call)
        // datang lewat ai-chunk bertanda toolDone.
        const res = await new Promise<AgentStepResult>((resolve) => {
          agentStepResolve = resolve;
          cmd
            .aiToolChatStream({
              id: botMsg.id,
              provider: def.provider,
              model: def.id,
              messages: history,
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
        if (res.error) throw new Error(res.error);
        if (res.cancelled || agentBatal) break;

        akhir = res.content;
        history.push({ role: 'assistant', content: res.content, toolCalls: res.toolCalls });
        if (res.toolCalls.length === 0) break;

        for (const tc of res.toolCalls) {
          if (agentBatal) break;
          const argsObj = (tc.args ?? {}) as Record<string, unknown>;
          const perintah =
            tc.name === 'terminal_exec' ? String(argsObj.command ?? '') : '';
          const readOnlyBlok =
            get().approvalMode === 'readonly' &&
            (tc.name === 'terminal_exec' || tc.name === 'editor_write');
          // 'ask' menahan semua terminal_exec; 'work' (kerja langsung) hanya
          // menahan yang destruktif; 'auto' tidak menahan apa pun.
          //
          // T4.5: daftar izin permanen (Settings → Prompt AI → Izin perintah)
          // melewati pertanyaan untuk perintah yang sudah disetujui user.
          // Perintah DESTRUKTIF tetap ditanya walau ada di daftar — pengaman
          // terakhir tidak boleh bisa dimatikan lewat daftar izin.
          const diizinkan =
            !isDestructive(perintah) && useStore.getState().izinPerintah(perintah);
          const perluSetuju =
            tc.name === 'terminal_exec' &&
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
          const run = {
            name: tc.name,
            args: JSON.stringify(argsObj),
            // 1.1.10 (item 23): hasil tool TIDAK lagi dipotong 400 karakter —
            // blok collapsible di bubble butuh isi utuh supaya bisa dibaca.
            result: hasil,
            ok,
            at: Date.now(),
          };
          set((s) => ({
            agentSteps: [
              ...s.agentSteps,
              { kind: 'tool', name: run.name, args: run.args, result: hasil.slice(0, 400), ok, at: run.at },
            ],
            // Salinan lengkap menempel di bubble jawaban (item 23).
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
                // Teks yang sudah tumbuh di bubble selama streaming dipertahankan;
                // `akhir` = teks langkah terakhir saja, jadi hanya dipakai kalau
                // tidak ada satu pun potongan yang sampai ke UI.
                const tampil = m.content.trim() ? m.content : akhir;
                return { ...m, content: tampil || '(tidak ada jawaban)', streaming: false };
              }),
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
      // Hentikan langkah yang sedang streaming di Rust juga — kalau tidak,
      // thread-nya terus membaca sampai provider menutup koneksi.
      const aktif = get().activeSession()?.messages.slice(-1)[0]?.id;
      if (aktif) {
        try {
          await cmd.aiCancel(aktif);
        } catch {
          /* langkah sudah selesai */
        }
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
    // T2.1: subagent paralel memakai jalur event yang SAMA (`ai-chunk`) tapi
    // id unik per subagent. Diteruskan lebih dulu supaya resolver milik
    // subagent yang mengambil, bukan resolver agent utama.
    if (subagentOnChunk(c)) return;

    // 1.1.10 (item 21): akhir satu langkah agent. Teks yang sudah menempel di
    // bubble tetap dipakai; di sini hanya diteruskan ke loop agent.
    if (c.toolDone) {
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
          // T1.1: penalaran menempel di pesan yang sama, terpisah dari jawaban.
          if (c.reasoning)
            return { ...m, reasoning: (m.reasoning ?? '') + c.reasoning };
          if (c.text) return { ...m, content: m.content + c.text };
          if (c.done) return { ...m, streaming: false };
          return m;
        }),
      })),
      pending: c.done || c.err ? (s.pending === c.id ? null : s.pending) : s.pending,
      // Blok "Reasoned" hidup: tampilkan selama potongan penalaran mengalir.
      reasoningText: c.reasoning ? (s.reasoningText ?? '') + c.reasoning : s.reasoningText,
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
