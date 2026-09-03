// mcpStore.ts — state panel MCP + PELAKSANA permintaan `mcp-action` (fase 11).
//
// Alur satu method MCP yang butuh UI:
//   AI CLI --HTTP--> Rust (mcp_server) --event mcp-action--> handleAction()
//   handleAction() menyentuh zustand (tab/pane/settings) lalu menjawab
//   lewat cmd.mcpReply(reqId, result). Rust menunggu maksimal 8 detik.
//
// CATATAN: listener `mcp-action` WAJIB dipasang sekali per proses (guard modul
// di App.tsx) — sama seperti pty-output & ai-chunk. StrictMode dev memasang
// effect dua kali; kalau ikut, setiap permintaan dieksekusi dobel (dua tab
// terbuka untuk satu editor_open) dan `mcp_reply` kedua ditolak.

import { create } from 'zustand';
import * as cmd from './commands';
import { useStore } from './store';
import { useTerminal } from './terminalStore';
import { useAi } from './aiStore';
import { useGit } from './gitStore';
import { useSettingsUi } from './settingsStore';
import { useExtensions } from './extensionStore';
import { useProblems } from './problemsStore';
import { useOutput } from './outputStore';
import { flushTab } from './editorRegistry';
import { readBuffer } from './xtermRegistry';
import type { CliStatus, CliWriteResult, McpAction, McpStatus, PaneKind } from './types';

interface McpState {
  status: McpStatus | null;
  clis: CliStatus[];
  busy: boolean;
  /** true = token ditampilkan apa adanya (ikon mata) */
  reveal: boolean;
  mcpError: string | null;
  mcpInfo: string | null;
  /** CLI yang dicentang di tabel "Dikontrol oleh" */
  checked: string[];
  /** hasil terakhir tombol [Tulis ke CLI] */
  lastWrite: CliWriteResult[];
  /** aksi MCP terakhir yang dieksekusi (ditampilkan di panel + verifikasi) */
  lastAction: { type: string; at: number; detail: string } | null;
  /** jumlah permintaan MCP yang sudah dilayani sesi ini */
  served: number;
  /** path screenshot terakhir dari `screenshot_pane` */
  lastShot: string | null;
  /** log koneksi/aktivitas MCP terbaru (paling baru di depan, maks 20).
   *  Ini bukti nyata "MCP connected" yang diminta fase 12 — bukan klaim. */
  log: { at: number; text: string; kind: 'connect' | 'action' | 'server' }[];
  /** toast singkat: user harus sadar saat agent mengambil screenshot */
  toast: string | null;
}

interface McpActions {
  init: () => Promise<void>;
  refresh: () => Promise<void>;
  refreshClis: () => Promise<void>;
  toggleServer: (on: boolean) => Promise<void>;
  rotateToken: () => Promise<void>;
  setReveal: (v: boolean) => void;
  setChecked: (ids: string[]) => void;
  toggleChecked: (id: string) => void;
  writeToCli: () => Promise<void>;
  removeFromCli: () => Promise<void>;
  copyToken: () => Promise<void>;
  setError: (m: string | null) => void;
  setInfo: (m: string | null) => void;
  setToast: (m: string | null) => void;
  /** Tambah satu baris log aktivitas (dipakai handleAction & toggleServer). */
  pushLog: (text: string, kind: 'connect' | 'action' | 'server') => void;
  clearLog: () => void;
  /** Dipanggil listener event: jalankan permintaan lalu jawab ke Rust. */
  handleAction: (a: McpAction) => Promise<void>;
}

export type McpStore = McpState & McpActions;

export const useMcp = create<McpStore>((set, get) => ({
  status: null,
  clis: [],
  busy: false,
  reveal: false,
  mcpError: null,
  mcpInfo: null,
  checked: [],
  lastWrite: [],
  lastAction: null,
  served: 0,
  lastShot: null,
  log: [],
  toast: null,

  init: async () => {
    await get().refresh();
    await get().refreshClis();
    // Centang awal mengikuti settings.mcp.writeToCli (fase 08).
    const saved = useStore.getState().settings.mcp.writeToCli ?? [];
    if (saved.length > 0) set({ checked: [...saved] });
  },

  refresh: async () => {
    try {
      set({ status: await cmd.mcpStatus() });
    } catch (e) {
      set({ mcpError: cmd.asZephyrError(e).message });
    }
  },

  refreshClis: async () => {
    try {
      set({ clis: await cmd.mcpCliStatus() });
    } catch (e) {
      set({ mcpError: cmd.asZephyrError(e).message });
    }
  },

  toggleServer: async (on) => {
    set({ busy: true, mcpError: null, mcpInfo: null });
    try {
      if (on) {
        const port = await cmd.mcpStart();
        const want = useStore.getState().settings.mcp.port;
        set({
          mcpInfo:
            port === want
              ? `Server MCP jalan di 127.0.0.1:${port}`
              : `Port ${want} dipakai program lain — MCP jalan di ${port}`,
        });
        get().pushLog(`server hidup di 127.0.0.1:${port}`, 'server');
      } else {
        await cmd.mcpStop();
        set({ mcpInfo: 'Server MCP dimatikan; port tidak lagi listening' });
        get().pushLog('server dimatikan', 'server');
      }
      // settings.mcp.enabled diubah di Rust → tarik ulang ke store.
      await useStore.getState().reloadSettings();
      await get().refresh();
    } catch (e) {
      set({ mcpError: cmd.asZephyrError(e).message });
    } finally {
      set({ busy: false });
    }
  },

  rotateToken: async () => {
    set({ busy: true, mcpError: null });
    try {
      await cmd.mcpRotateToken();
      await get().refresh();
      await get().refreshClis();
      set({
        mcpInfo: 'Token baru dibuat. CLI yang sudah didaftari perlu ditulis ulang.',
      });
    } catch (e) {
      set({ mcpError: cmd.asZephyrError(e).message });
    } finally {
      set({ busy: false });
    }
  },

  setReveal: (v) => set({ reveal: v }),
  setChecked: (ids) => set({ checked: ids }),
  /** Centang/lepas satu CLI. Pilihan langsung disimpan ke settings.mcp.writeToCli
   *  supaya panel ingat setelah restart (bukan hanya saat [Tulis ke CLI]). */
  toggleChecked: (id) => {
    const next = get().checked.includes(id)
      ? get().checked.filter((x) => x !== id)
      : [...get().checked, id];
    set({ checked: next });
    void useStore.getState().applySettings({ mcp: { writeToCli: next } });
  },

  writeToCli: async () => {
    const ids = get().checked;
    if (ids.length === 0) {
      set({ mcpError: 'Centang dulu CLI yang mau didaftari' });
      return;
    }
    set({ busy: true, mcpError: null, mcpInfo: null });
    try {
      const res = await cmd.mcpWriteCli(ids);
      set({ lastWrite: res });
      // Simpan pilihan supaya panel ingat setelah restart.
      await useStore.getState().applySettings({ mcp: { writeToCli: ids } });
      await get().refreshClis();
      const gagal = res.filter((r) => !r.ok);
      set({
        mcpInfo:
          gagal.length === 0
            ? `${res.length} config CLI diperbarui (file lama disalin ke .bak)`
            : `${res.length - gagal.length} berhasil, ${gagal.length} gagal`,
        mcpError: gagal.length > 0 ? gagal.map((g) => `${g.label}: ${g.message}`).join('; ') : null,
      });
    } catch (e) {
      set({ mcpError: cmd.asZephyrError(e).message });
    } finally {
      set({ busy: false });
    }
  },

  removeFromCli: async () => {
    const ids = get().checked;
    if (ids.length === 0) {
      set({ mcpError: 'Centang dulu CLI yang mau dilepas' });
      return;
    }
    set({ busy: true, mcpError: null, mcpInfo: null });
    try {
      const res = await cmd.mcpRemoveCli(ids);
      set({ lastWrite: res });
      await get().refreshClis();
      set({ mcpInfo: `Entri zephyr dilepas dari ${res.filter((r) => r.ok).length} config` });
    } catch (e) {
      set({ mcpError: cmd.asZephyrError(e).message });
    } finally {
      set({ busy: false });
    }
  },

  copyToken: async () => {
    const tok = get().status?.token ?? '';
    if (!tok) return;
    try {
      const { clipboardWrite } = await import('./clipboard');
      await clipboardWrite(tok);
      set({ mcpInfo: 'Token disalin ke clipboard' });
    } catch (e) {
      set({ mcpError: cmd.asZephyrError(e).message });
    }
  },

  setError: (m) => set({ mcpError: m }),
  setInfo: (m) => set({ mcpInfo: m }),
  setToast: (m) => set({ toast: m }),

  pushLog: (text, kind) =>
    set((s) => ({ log: [{ at: Date.now(), text, kind }, ...s.log].slice(0, 20) })),
  clearLog: () => set({ log: [] }),

  handleAction: async (a) => {
    // Notifikasi satu arah (mis. port-fallback) tidak punya reqId.
    if (!a.reqId) {
      if (a.type === 'port-fallback') {
        const p = a.payload as { requested?: number; port?: number } | undefined;
        set({
          mcpInfo: `Port ${p?.requested ?? '?'} dipakai program lain — MCP pindah ke ${p?.port ?? '?'}`,
        });
        void get().refresh();
      }
      return;
    }
    let result: unknown;
    try {
      result = await runAction(a.type, (a.payload ?? {}) as Record<string, unknown>);
      const detail = describe(a.type, a.payload);
      set((s) => ({
        served: s.served + 1,
        lastAction: { type: a.type, at: Date.now(), detail },
      }));
      // Health check pertama dari sebuah agent = bukti "MCP connected".
      // `counts` hanya dipanggil oleh GET /health, jadi itu penandanya.
      if (a.type === 'counts') {
        const sudah = get().log.some((l) => l.kind === 'connect');
        get().pushLog(sudah ? 'health check dari AI CLI' : 'MCP connected: AI CLI menyapa /health', 'connect');
      } else {
        get().pushLog(detail, 'action');
      }
      // Agent mengambil screenshot pane: user WAJIB tahu.
      if (a.type === 'pane_text') {
        const pid = String((a.payload as { paneId?: string } | undefined)?.paneId ?? '');
        set({ toast: `AI CLI mengambil screenshot pane ${pid.slice(0, 18)}…` });
      }
    } catch (e) {
      const msg = cmd.asZephyrError(e).message;
      result = { error: msg };
      get().pushLog(`${a.type} gagal: ${msg}`, 'action');
    }
    try {
      await cmd.mcpReply(a.reqId, result);
    } catch {
      /* Rust sudah timeout — tidak ada yang bisa dilakukan */
    }
  },
}));

function describe(type: string, payload?: Record<string, unknown>): string {
  const p = payload ?? {};
  const bits = ['paneId', 'tabId', 'path', 'id', 'type']
    .map((k) => (p[k] === undefined ? null : `${k}=${String(p[k])}`))
    .filter(Boolean);
  return bits.length > 0 ? `${type} (${bits.join(', ')})` : type;
}

const str = (p: Record<string, unknown>, k: string): string => String(p[k] ?? '');

/** Ekstensi (fase 13): daftar nyata dari Rust lewat extensionStore. */

/**
 * Pelaksana satu permintaan MCP di sisi UI. Melempar Error = jawaban error
 * JSON-RPC ke agent (bukan crash).
 */
async function runAction(type: string, p: Record<string, unknown>): Promise<unknown> {
  const s = () => useStore.getState();
  const t = () => useTerminal.getState();

  switch (type) {
    // dipakai /health
    case 'counts':
      return {
        panes: t().terminalTabs.reduce((n, tab) => n + tab.panes.length, 0),
        editors: s().tabs.length,
      };

    case 'list_panes':
      return t().terminalTabs.flatMap((tab) =>
        tab.panes.map((pane) => ({
          paneId: pane.id,
          tabId: tab.id,
          type: pane.kind,
          title: pane.title,
          agent: pane.agent?.name ?? null,
          pid: pane.pid ?? null,
          running: pane.status === 'live',
          cwd: pane.cwd,
          url: pane.url ?? null,
        })),
      );

    case 'list_editors':
      return s().tabs.map((tab) => {
        const active = tab.id === s().activeTabId;
        return {
          tabId: tab.id,
          path: tab.path,
          name: tab.name,
          dirty: tab.unsaved,
          active,
          lang: tab.lang,
          // Posisi kursor hanya diketahui untuk tab yang aktif.
          line: active ? s().cursor.line : 1,
          col: active ? s().cursor.col : 1,
          bytes: tab.content.length,
        };
      });

    case 'get_window': {
      const tab = t().activeTab();
      const editor = s().tabs.find((x) => x.id === s().activeTabId);
      return {
        focusedPaneId: tab?.activePaneId ?? null,
        title: editor ? `${editor.unsaved ? '● ' : ''}${editor.name} — Zephyr` : 'Zephyr',
        workspace: s().workspace,
        layout: {
          activity: s().activity,
          sidebarVisible: s().sidebarVisible,
          terminalVisible: t().visible,
          terminalMaximized: t().maximized,
          dock: t().dock,
          settingsOpen: s().settingsOpen,
          paneLayout: tab?.layout ?? null,
        },
        activeTabId: s().activeTabId,
      };
    }

    case 'list_extensions': {
      // fase 13: daftar nyata dari Rust (bawaan + folder), bukan konstanta.
      const ex = useExtensions.getState();
      if (ex.list.length === 0) await ex.refresh();
      return useExtensions.getState().list.map((e) => ({
        id: e.id,
        name: e.name,
        enabled: e.enabled,
        version: e.version,
        builtin: e.builtin,
        commands: e.commands.map((c) => c.id),
      }));
    }

    case 'reload_settings':
      await s().reloadSettings();
      return { ok: true };

    case 'pane_new': {
      const kind = (str(p, 'type') || 'shell') as PaneKind;
      if (!['shell', 'private', 'agent', 'browser', 'cmd', 'bash', 'wsl', 'pwsh'].includes(kind)) {
        throw new Error(`type pane '${kind}' tidak dikenal`);
      }
      const agentId = p.agent ? String(p.agent) : undefined;
      const id = await t().addPane(kind, agentId ? { agentId } : undefined);
      if (!id) throw new Error(t().terminalError ?? t().toast ?? 'pane tidak bisa dibuat');
      return { paneId: id, type: kind };
    }

    case 'pane_close': {
      const paneId = str(p, 'paneId');
      if (!t().findPane(paneId)) throw new Error(`pane ${paneId} tidak ada`);
      await t().closePane(paneId);
      return { ok: true, paneId };
    }

    case 'pane_text': {
      const paneId = str(p, 'paneId');
      if (!t().findPane(paneId)) throw new Error(`pane ${paneId} tidak ada`);
      return { paneId, text: readBuffer(paneId, 500) };
    }

    // ── fase 20: panel bawah, BACA-SAJA ──
    // Sengaja tidak ada set_problems/append_output dari MCP: menulis
    // diagnostik dari luar akan membuat Problems tidak lagi mencerminkan
    // keadaan nyata language server (fase 21).
    case 'get_problems': {
      const sev = typeof p.severity === 'string' ? p.severity : null;
      const semua = useProblems.getState().all();
      const list = sev ? semua.filter((d) => d.severity === sev) : semua;
      const { errors, warnings } = useProblems.getState().counts();
      return {
        counts: { errors, warnings },
        total: list.length,
        problems: list.slice(0, 500).map((d) => ({
          file: d.file,
          line: d.line,
          column: d.column,
          severity: d.severity,
          message: d.message,
          source: d.source,
          code: d.code ?? null,
        })),
      };
    }

    case 'get_output': {
      const o = useOutput.getState();
      const id = typeof p.channel === 'string' && p.channel ? p.channel : o.activeChannel;
      const ch = o.channels.find((c) => c.id === id);
      if (!ch) {
        throw new Error(`channel ${id} tidak ada (tersedia: ${o.channels.map((c) => c.id).join(', ')})`);
      }
      const tail = typeof p.tail === 'number' && p.tail > 0 ? Math.min(p.tail, 2000) : 200;
      return {
        channel: ch.id,
        label: ch.label,
        total: ch.lines.length,
        lines: ch.lines.slice(-tail),
      };
    }

    case 'editor_open': {
      const path = str(p, 'path');
      await s().openPath(path);
      const tab = s().tabs.find((x) => x.path?.toLowerCase() === path.toLowerCase());
      if (!tab) throw new Error(s().statusMessage || `tidak bisa membuka ${path}`);
      // Fokuskan tab + pastikan halaman Settings tidak menutupi editor.
      s().setSettingsOpen(false);
      s().setActiveTab(tab.id);
      return { tabId: tab.id, path: tab.path, name: tab.name, lang: tab.lang };
    }

    case 'editor_close': {
      const tabId = str(p, 'tabId');
      if (!s().tabs.some((x) => x.id === tabId)) throw new Error(`tab ${tabId} tidak ada`);
      s().forceCloseTab(tabId);
      return { ok: true, tabId };
    }

    case 'editor_write': {
      const tabId = str(p, 'tabId');
      const content = String(p.content ?? '');
      const tab = s().tabs.find((x) => x.id === tabId);
      if (!tab) throw new Error(`tab ${tabId} tidak ada`);
      // KONTRAK: buffer saja. Disk TIDAK disentuh — user yang menyimpan.
      s().updateTabContent(tabId, content);
      const after = s().tabs.find((x) => x.id === tabId);
      return {
        tabId,
        bytes: content.length,
        dirty: after?.unsaved ?? false,
        savedToDisk: false,
      };
    }

    case 'editor_insert': {
      const tabId = str(p, 'tabId');
      const text = String(p.text ?? '');
      // Ambil isi TERBARU dari CodeMirror dulu; store bisa tertinggal
      // beberapa ketikan karena update-nya di-debounce.
      flushTab(tabId);
      const tab = s().tabs.find((x) => x.id === tabId);
      if (!tab) throw new Error(`tab ${tabId} tidak ada`);
      const at =
        typeof p.at === 'number' && p.at >= 0 && p.at <= tab.content.length
          ? (p.at as number)
          : tab.content.length;
      const next = tab.content.slice(0, at) + text + tab.content.slice(at);
      s().updateTabContent(tabId, next);
      const after = s().tabs.find((x) => x.id === tabId);
      return { tabId, at, bytes: next.length, dirty: after?.unsaved ?? false, savedToDisk: false };
    }

    case 'run_command':
      return runEditorCommand(str(p, 'id'));

    default:
      throw new Error(`aksi UI '${type}' tidak dikenal`);
  }
}

/** id command yang bisa dipanggil `run_command`. */
async function runEditorCommand(id: string): Promise<unknown> {
  const s = useStore.getState();
  const t = useTerminal.getState();

  switch (id) {
    case 'commandPalette.open':
      // Palette penuh ada sejak fase 12, tapi mcpStore TIDAK boleh import
      // paletteStore: paletteStore → commandRegistry → mcpStore = lingkaran.
      // Jalur yang dipakai: event window, ditangkap App.tsx.
      window.dispatchEvent(new Event('zephyr-palette-open'));
      return { ok: true, id };

    case 'terminal.new': {
      const paneId = await t.addPane('shell');
      if (!paneId) throw new Error(t.terminalError ?? t.toast ?? 'pane gagal dibuat');
      return { ok: true, id, paneId };
    }

    case 'terminal.toggle':
      t.toggleVisible();
      return { ok: true, id, visible: useTerminal.getState().visible };

    case 'ai.focus':
      s.setSettingsOpen(false);
      s.setActivity('ai');
      if (!s.sidebarVisible) s.toggleSidebar();
      t.setVisible(true);
      t.setDock('ai');
      window.setTimeout(() => window.dispatchEvent(new Event('zephyr-ai-focus')), 60);
      return { ok: true, id, dock: 'ai' };

    case 'ai.send':
      await useAi.getState().send();
      return { ok: true, id };

    case 'git.commit': {
      const g = useGit.getState();
      if (!g.status?.isRepo) throw new Error('folder ini bukan repo git');
      const staged = (g.status.changes ?? []).filter((c) => c.staged).length;
      if (staged === 0) throw new Error('tidak ada perubahan ter-stage');
      if (!g.message.trim()) throw new Error('pesan commit masih kosong');
      await g.commit();
      const err = useGit.getState().scmError;
      if (err) throw new Error(err);
      return { ok: true, id, hash: useGit.getState().log[0]?.hash7 ?? null };
    }

    case 'git.panel':
      s.setSettingsOpen(false);
      s.setActivity('scm');
      if (!s.sidebarVisible) s.toggleSidebar();
      return { ok: true, id };

    case 'explorer.openFolder':
      // Dialog native menunggu klik user; MCP tidak boleh menggantung 8 detik.
      void s.openFolderDialog();
      return { ok: true, id, note: 'dialog pilih folder dibuka untuk user' };

    case 'view.explorer':
      s.setSettingsOpen(false);
      s.setActivity('explorer');
      if (!s.sidebarVisible) s.toggleSidebar();
      return { ok: true, id };

    case 'view.settings':
      s.setActivity('settings');
      s.setSettingsOpen(true);
      if (!s.sidebarVisible) s.toggleSidebar();
      return { ok: true, id };

    case 'view.mcp':
      s.setActivity('settings');
      s.setSettingsOpen(true);
      useSettingsUi.getState().setSection('mcp');
      if (!s.sidebarVisible) s.toggleSidebar();
      return { ok: true, id };

    case 'editor.save': {
      if (!s.activeTabId) throw new Error('tidak ada tab aktif');
      flushTab(s.activeTabId);
      const ok = await s.saveTab(s.activeTabId);
      if (!ok) throw new Error(useStore.getState().statusMessage || 'gagal menyimpan');
      return { ok: true, id, tabId: s.activeTabId };
    }

    default:
      throw new Error(
        `command '${id}' tidak dikenal (tersedia: commandPalette.open, terminal.new, terminal.toggle, ai.focus, ai.send, git.commit, git.panel, explorer.openFolder, view.explorer, view.settings, view.mcp, editor.save)`,
      );
  }
}

