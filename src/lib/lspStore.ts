// lspStore.ts — state runtime language server (fase 21).
//
// Tanggung jawab:
//   * LAZY START: `ensureFor(path)` dipanggil saat file dibuka; server hanya
//     hidup untuk bahasa yang benar-benar dipakai.
//   * Sinkronisasi dokumen: didOpen/didChange/didClose dengan nomor versi.
//     Versi WAJIB naik monoton per dokumen — tsserver menolak didChange yang
//     versinya tidak lebih besar dan berhenti mengirim diagnostics.
//   * Diagnostics dari `publishDiagnostics` → problemsStore (fase 20).
//   * IDLE REAP: interval memanggil `lsp_reap` di Rust; kebijakannya di sini
//     supaya UI (yang tahu file mana masih dibuka) yang menentukan.
//
// Semua request LSP lewat `req()` di sini, tidak ada komponen yang memanggil
// invoke('lsp_request') sendiri (AGENTS.md §4: IPC hanya lewat lib/commands.ts).

import { create } from 'zustand';
import * as cmd from './commands';
import { useStore } from './store';
import { useProblems, type Diagnostic } from './problemsStore';
import { logOutput } from './outputStore';
import {
  DEFAULT_LSP_SETTINGS,
  LSP_SERVERS,
  effectiveSpec,
  pathToUri,
  serverForPath,
  severityFromLsp,
  uriToPath,
  type LspServerDef,
  type LspSettings,
} from './lsp';

/** Satu dokumen yang sudah didOpen ke sebuah server. */
interface DocState {
  serverId: string;
  version: number;
}

interface LspState {
  /** serverId (kunci registry Rust) per definisi, mis. typescript::d:\zephyr */
  aktif: Record<string, { id: string; pid: number; caps: Record<string, unknown> }>;
  /** path file → dokumen terbuka */
  docs: Record<string, DocState>;
  /** pesan status terakhir (ditampilkan di Settings / Output) */
  lspError: string | null;
  /** true saat sebuah server sedang di-start (mencegah start ganda) */
  starting: Record<string, boolean>;
  /** hasil probe binary per server id */
  probe: Record<string, { ok: boolean; exe?: string; error?: string }>;
}

interface LspActions {
  settings: () => LspSettings;
  /** Pastikan server untuk file ini hidup; kembalikan id server atau null. */
  ensureFor: (path: string) => Promise<string | null>;
  /** Kirim didOpen (idempoten). */
  openDoc: (path: string, text: string, langId: string) => Promise<void>;
  /** Kirim didChange dengan seluruh isi (full sync — sederhana & aman). */
  changeDoc: (path: string, text: string) => Promise<void>;
  closeDoc: (path: string) => Promise<void>;
  /** Request LSP untuk file tertentu. */
  req: (path: string, method: string, params: Record<string, unknown>) => Promise<unknown>;
  /** Notifikasi LSP untuk file tertentu. */
  notify: (path: string, method: string, params: Record<string, unknown>) => Promise<void>;
  /** Tangani event dari Rust. */
  onEvent: (ev: Record<string, unknown>) => void;
  stopAll: () => Promise<void>;
  stop: (serverId: string) => Promise<void>;
  reap: () => Promise<string[]>;
  status: () => Promise<unknown[]>;
  probeAll: () => Promise<void>;
  setIdle: (serverId: string, secs: number) => Promise<void>;
}

const S = () => useStore.getState();

/** Kunci registry Rust: `<serverId>::<root lowercase>`. */
const kunci = (def: LspServerDef, root: string) => `${def.id}::${root.toLowerCase()}`;

export const useLsp = create<LspState & LspActions>((set, get) => ({
  aktif: {},
  docs: {},
  lspError: null,
  starting: {},
  probe: {},

  settings: () => {
    const s = S().settings as unknown as { lsp?: LspSettings };
    return s.lsp ?? DEFAULT_LSP_SETTINGS;
  },

  ensureFor: async (path) => {
    const cfg = get().settings();
    if (!cfg.enabled) return null;

    const def = serverForPath(path);
    if (!def) return null;

    const spec = effectiveSpec(def, cfg);
    if (!spec.enabled) return null;

    // Root = workspace kalau ada, kalau tidak folder file itu sendiri.
    const root = S().workspace || path.replace(/[\\/][^\\/]*$/, '');
    const id = kunci(def, root);

    if (get().aktif[id]) return id;
    if (get().starting[id]) {
      // Tunggu start yang sedang jalan (maks 20s) supaya tidak spawn dobel.
      for (let i = 0; i < 100; i++) {
        await new Promise((r) => setTimeout(r, 200));
        if (get().aktif[id]) return id;
        if (!get().starting[id]) break;
      }
      return get().aktif[id] ? id : null;
    }

    set((s) => ({ starting: { ...s.starting, [id]: true } }));
    try {
      const res = (await cmd.lspStart(spec, root, spec.initOptions ?? null, cfg.idleSeconds)) as {
        id: string;
        pid: number;
        capabilities?: Record<string, unknown>;
        cmd?: string;
        reused?: boolean;
      };
      set((s) => ({
        aktif: { ...s.aktif, [res.id]: { id: res.id, pid: res.pid, caps: res.capabilities ?? {} } },
        lspError: null,
      }));
      if (!res.reused) {
        logOutput('lsp', `[${def.id}] start pid ${res.pid} — ${res.cmd ?? spec.cmd.join(' ')}`);
      }
      return res.id;
    } catch (e) {
      const msg = cmd.asZephyrError(e).message;
      set({ lspError: msg });
      logOutput('lsp', `[${def.id}] GAGAL start: ${msg}`);
      return null;
    } finally {
      set((s) => {
        const n = { ...s.starting };
        delete n[id];
        return { starting: n };
      });
    }
  },

  openDoc: async (path, text, langId) => {
    const serverId = await get().ensureFor(path);
    if (!serverId) return;
    if (get().docs[path]) {
      // Sudah terbuka: cukup sinkronkan isinya.
      await get().changeDoc(path, text);
      return;
    }
    set((s) => ({ docs: { ...s.docs, [path]: { serverId, version: 1 } } }));
    await cmd.lspNotify(serverId, 'textDocument/didOpen', {
      textDocument: { uri: pathToUri(path), languageId: langId, version: 1, text },
    });
  },

  changeDoc: async (path, text) => {
    const doc = get().docs[path];
    if (!doc) return;
    // Versi harus NAIK; tsserver mengabaikan didChange dengan versi lama.
    const version = doc.version + 1;
    set((s) => ({ docs: { ...s.docs, [path]: { ...doc, version } } }));
    await cmd.lspNotify(doc.serverId, 'textDocument/didChange', {
      textDocument: { uri: pathToUri(path), version },
      // Full sync: kirim seluruh isi. Incremental butuh pemetaan range yang
      // rawan desync; untuk file ukuran editor biasa ini cukup.
      contentChanges: [{ text }],
    });
  },

  closeDoc: async (path) => {
    const doc = get().docs[path];
    if (!doc) return;
    set((s) => {
      const n = { ...s.docs };
      delete n[path];
      return { docs: n };
    });
    try {
      await cmd.lspNotify(doc.serverId, 'textDocument/didClose', {
        textDocument: { uri: pathToUri(path) },
      });
    } catch {
      /* server mungkin sudah mati — tidak masalah */
    }
    // Diagnostik file yang ditutup tidak lagi relevan.
    useProblems.getState().removeFile(path);
  },

  req: async (path, method, params) => {
    const doc = get().docs[path];
    const serverId = doc?.serverId ?? (await get().ensureFor(path));
    if (!serverId) throw new Error('language server tidak aktif untuk file ini');
    return cmd.lspRequest(serverId, method, params);
  },

  notify: async (path, method, params) => {
    const doc = get().docs[path];
    const serverId = doc?.serverId ?? (await get().ensureFor(path));
    if (!serverId) return;
    await cmd.lspNotify(serverId, method, params);
  },

  onEvent: (ev) => {
    const kind = String(ev.kind ?? '');
    const server = String(ev.server ?? '');

    if (kind === 'stderr') {
      logOutput('lsp', `[${server}] ${String(ev.text ?? '')}`);
      return;
    }

    if (kind === 'exit') {
      set((s) => {
        const aktif = { ...s.aktif };
        delete aktif[server];
        const docs: Record<string, DocState> = {};
        for (const [p, d] of Object.entries(s.docs)) {
          if (d.serverId !== server) docs[p] = d;
        }
        return { aktif, docs };
      });
      logOutput('lsp', `[${server}] proses berhenti`);
      // Diagnostik dari server yang mati dibersihkan supaya Problems tidak
      // menampilkan hasil basi.
      useProblems.getState().clearSource('LSP');
      return;
    }

    if (kind === 'ready') {
      logOutput('lsp', `[${server}] siap (pid ${String(ev.pid ?? '?')})`);
      return;
    }

    if (kind !== 'notification') return;

    const method = String(ev.method ?? '');
    const params = (ev.params ?? {}) as Record<string, unknown>;

    if (method === 'textDocument/publishDiagnostics') {
      const uri = String(params.uri ?? '');
      const file = uriToPath(uri);
      const raw = Array.isArray(params.diagnostics) ? params.diagnostics : [];
      const list: Diagnostic[] = raw.map((d) => {
        const o = d as Record<string, unknown>;
        const range = (o.range ?? {}) as Record<string, Record<string, number>>;
        const start = range.start ?? { line: 0, character: 0 };
        const end = range.end ?? start;
        return {
          file,
          // LSP 0-based, editor 1-based.
          line: (start.line ?? 0) + 1,
          column: (start.character ?? 0) + 1,
          endLine: (end.line ?? 0) + 1,
          endColumn: (end.character ?? 0) + 1,
          severity: severityFromLsp(o.severity as number | undefined),
          message: String(o.message ?? ''),
          source: 'LSP',
          code: o.code === undefined || o.code === null ? undefined : String(o.code),
        };
      });
      useProblems.getState().setDiagnostics(file, list);
      return;
    }

    if (method === 'window/logMessage' || method === 'window/showMessage') {
      const msg = String(params.message ?? '');
      if (msg.trim()) logOutput('lsp', `[${server}] ${msg}`);
      return;
    }

    // Progress indexing dsb. dicatat ringkas saja.
    if (method === '$/progress') {
      const val = (params.value ?? {}) as Record<string, unknown>;
      const t = String(val.title ?? val.message ?? '');
      if (t) logOutput('lsp', `[${server}] ${t}`);
    }
  },

  stop: async (serverId) => {
    await cmd.lspStop(serverId);
    set((s) => {
      const aktif = { ...s.aktif };
      delete aktif[serverId];
      const docs: Record<string, DocState> = {};
      for (const [p, d] of Object.entries(s.docs)) {
        if (d.serverId !== serverId) docs[p] = d;
      }
      return { aktif, docs };
    });
  },

  stopAll: async () => {
    await cmd.lspStopAll();
    set({ aktif: {}, docs: {} });
    useProblems.getState().clearSource('LSP');
  },

  reap: async () => {
    const mati = await cmd.lspReap();
    if (mati.length > 0) {
      set((s) => {
        const aktif = { ...s.aktif };
        for (const id of mati) delete aktif[id];
        return { aktif };
      });
      for (const id of mati) logOutput('lsp', `[${id}] dimatikan karena idle`);
    }
    return mati;
  },

  status: () => cmd.lspStatus(),

  probeAll: async () => {
    const cfg = get().settings();
    const root = S().workspace ?? '';
    const out: LspState['probe'] = {};
    for (const def of LSP_SERVERS) {
      const spec = effectiveSpec(def, cfg);
      try {
        out[def.id] = (await cmd.lspProbe(spec, root)) as {
          ok: boolean;
          exe?: string;
          error?: string;
        };
      } catch (e) {
        out[def.id] = { ok: false, error: cmd.asZephyrError(e).message };
      }
    }
    set({ probe: out });
  },

  setIdle: (serverId, secs) => cmd.lspSetIdle(serverId, secs),
}));
