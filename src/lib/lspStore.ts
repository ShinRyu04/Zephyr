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

interface DocState {
  serverId: string;
  version: number;
}

interface LspState {
  
  aktif: Record<string, { id: string; pid: number; caps: Record<string, unknown> }>;
  
  docs: Record<string, DocState>;
  
  lspError: string | null;
  
  starting: Record<string, boolean>;
  
  probe: Record<string, { ok: boolean; exe?: string; error?: string }>;
}

interface LspActions {
  settings: () => LspSettings;
  
  ensureFor: (path: string) => Promise<string | null>;
  
  openDoc: (path: string, text: string, langId: string) => Promise<void>;
  
  changeDoc: (path: string, text: string) => Promise<void>;
  closeDoc: (path: string) => Promise<void>;
  
  req: (path: string, method: string, params: Record<string, unknown>) => Promise<unknown>;
  
  notify: (path: string, method: string, params: Record<string, unknown>) => Promise<void>;
  
  onEvent: (ev: Record<string, unknown>) => void;
  stopAll: () => Promise<void>;
  stop: (serverId: string) => Promise<void>;
  reap: () => Promise<string[]>;
  status: () => Promise<unknown[]>;
  probeAll: () => Promise<void>;
  setIdle: (serverId: string, secs: number) => Promise<void>;
}

const S = () => useStore.getState();

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

    const root = S().workspace || path.replace(/[\\/][^\\/]*$/, '');
    const id = kunci(def, root);

    if (get().aktif[id]) return id;
    if (get().starting[id]) {
      
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
    
    const version = doc.version + 1;
    set((s) => ({ docs: { ...s.docs, [path]: { ...doc, version } } }));
    await cmd.lspNotify(doc.serverId, 'textDocument/didChange', {
      textDocument: { uri: pathToUri(path), version },
      
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
