// commandRegistry.ts — daftar SEMUA action yang bisa dipanggil dari Command
// Palette (fase 12).
//
// Satu sumber kebenaran: palette, MCP `run_command`, dan (nanti) menu konteks
// memakai daftar ini. Tiap entri punya `run()` sendiri sehingga palette tidak
// perlu tahu store mana yang dipakai.
//
// `keybinding` sengaja TIDAK disimpan di sini — binding hidup di
// lib/shortcuts.ts (bisa di-remap user). Yang ditampilkan palette diambil dari
// sana lewat `effectiveBinding(actionId)` supaya tidak ada dua sumber.

import { useStore } from './store';
import { useTerminal } from './terminalStore';
import { useAi } from './aiStore';
import { useGit } from './gitStore';
import { useMcp } from './mcpStore';
import { useExplorer } from './explorerStore';
import { useSettingsUi } from './settingsStore';
import { useExtensions } from './extensionStore';
import { commandsEkstensi } from './extLoader';
import { useNotif, notifyError, notifyInfo, notifyWarn } from './notificationStore';
import { useKb } from './keybindingStore';
import { usePanel } from './panelStore';
import { useOutput } from './outputStore';
import { useProblems } from './problemsStore';
import { useLsp } from './lspStore';
import { serverForPath } from './lsp';
import { THEMES, semuaTema } from './themes';
import { keHex6 } from './cmColor';
import type { EditorSettings } from './types';
import { flushTab, getActiveView, revealPosition } from './editorRegistry';

export type CmdGroup =
  | 'File'
  | 'Edit'
  | 'View'
  | 'Terminal'
  | 'Git'
  | 'AI'
  | 'MCP'
  | 'Settings'
  | 'Extensions';

export interface CommandDef {
  id: string;
  /** label yang dicari user, mis. "Terminal: New Shell" */
  title: string;
  group: CmdGroup;
  /** kata kunci tambahan untuk pencarian (tidak ditampilkan) */
  keywords?: string;
  /** id action di lib/shortcuts.ts bila punya keybinding */
  action?: string;
  /** false = entri disembunyikan (mis. butuh workspace) */
  enabled?: () => boolean;
  run: () => void | Promise<void>;
}

const S = () => useStore.getState();
const T = () => useTerminal.getState();

/** FASE 21: tab aktif + view CodeMirror-nya (dipakai command LSP). */
const konteksLsp = () => {
  const s = S();
  const tab = s.tabs.find((t) => t.id === s.activeTabId);
  return { path: tab?.path ?? null, view: getActiveView() };
};

/** Command LSP hanya aktif kalau file yang terbuka punya language server. */
const lspSiap = () => {
  const { path } = konteksLsp();
  return !!path && !!serverForPath(path) && useLsp.getState().settings().enabled;
};

/** Buka satu panel sidebar + pastikan sidebar terlihat. */
function openSide(
  activity: 'explorer' | 'search' | 'scm' | 'ai' | 'terminal' | 'extensions',
) {
  const s = S();
  s.setSettingsOpen(false);
  s.setActivity(activity);
  if (!s.sidebarVisible) s.toggleSidebar();
}

function openSettingsSection(section: Parameters<ReturnType<typeof useSettingsUi.getState>['setSection']>[0]) {
  const s = S();
  s.setActivity('settings');
  s.setSettingsOpen(true);
  useSettingsUi.getState().setSection(section);
  if (!s.sidebarVisible) s.toggleSidebar();
}

export const COMMANDS: CommandDef[] = [
  // ── File ──
  {
    id: 'file.new',
    title: 'File: New Untitled',
    group: 'File',
    action: 'file.new',
    keywords: 'baru buat',
    run: () => S().newUntitled(),
  },
  {
    id: 'file.open',
    title: 'File: Open File…',
    group: 'File',
    action: 'file.open',
    keywords: 'buka',
    run: () => S().openFileDialog(),
  },
  {
    id: 'explorer.openFolder',
    title: 'Explorer: Open Folder…',
    group: 'File',
    action: 'file.openFolder',
    keywords: 'workspace buka folder',
    run: () => S().openFolderDialog(),
  },
  {
    id: 'file.save',
    title: 'File: Save',
    group: 'File',
    action: 'file.save',
    keywords: 'simpan',
    enabled: () => !!S().activeTabId,
    run: async () => {
      const id = S().activeTabId;
      if (!id) return;
      flushTab(id);
      await S().saveTab(id);
    },
  },
  {
    id: 'file.saveAs',
    title: 'File: Save As…',
    group: 'File',
    action: 'file.saveAs',
    keywords: 'simpan sebagai',
    enabled: () => !!S().activeTabId,
    run: async () => {
      const id = S().activeTabId;
      if (!id) return;
      flushTab(id);
      await S().saveTabAs(id);
    },
  },
  {
    id: 'file.closeTab',
    title: 'File: Close Tab',
    group: 'File',
    action: 'file.closeTab',
    keywords: 'tutup',
    enabled: () => !!S().activeTabId,
    run: () => {
      const id = S().activeTabId;
      if (id) S().requestCloseTab(id);
    },
  },
  {
    id: 'file.closeWorkspace',
    title: 'Explorer: Close Folder',
    group: 'File',
    keywords: 'tutup workspace',
    enabled: () => !!S().workspace,
    run: () => S().closeWorkspace(),
  },

  // ── View ──
  {
    id: 'view.explorer',
    title: 'View: Focus Explorer',
    group: 'View',
    action: 'view.explorer',
    keywords: 'file tree',
    run: () => openSide('explorer'),
  },
  {
    id: 'view.search',
    title: 'View: Search in Files',
    group: 'View',
    action: 'edit.findInFiles',
    keywords: 'cari grep',
    run: () => {
      openSide('search');
      window.setTimeout(() => {
        document.querySelector<HTMLInputElement>('.search-input')?.focus();
      }, 60);
    },
  },
  {
    id: 'view.sidebar',
    title: 'View: Toggle Sidebar',
    group: 'View',
    action: 'view.sidebar',
    keywords: 'panel kiri',
    run: () => S().toggleSidebar(),
  },
  {
    id: 'view.panel',
    title: 'View: Toggle Bottom Panel',
    group: 'View',
    action: 'view.panel',
    keywords: 'terminal ai bawah',
    run: () => T().toggleVisible(),
  },
  {
    id: 'view.zoomIn',
    title: 'View: Zoom In',
    group: 'View',
    action: 'view.zoomIn',
    run: () =>
      S().applySettings({ general: { zoom: Math.min(200, S().settings.general.zoom + 10) } }),
  },
  {
    id: 'view.zoomOut',
    title: 'View: Zoom Out',
    group: 'View',
    action: 'view.zoomOut',
    run: () =>
      S().applySettings({ general: { zoom: Math.max(50, S().settings.general.zoom - 10) } }),
  },
  {
    id: 'view.zoomReset',
    title: 'View: Reset Zoom',
    group: 'View',
    action: 'view.zoomReset',
    run: () => S().applySettings({ general: { zoom: 100 } }),
  },
  {
    id: 'view.nextTab',
    title: 'View: Next Editor Tab',
    group: 'View',
    action: 'view.nextTab',
    enabled: () => S().tabs.length > 1,
    run: () => S().cycleTab(1),
  },
  {
    id: 'view.prevTab',
    title: 'View: Previous Editor Tab',
    group: 'View',
    action: 'view.prevTab',
    enabled: () => S().tabs.length > 1,
    run: () => S().cycleTab(-1),
  },
  {
    id: 'view.maximizePanel',
    title: 'View: Maximize Bottom Panel',
    group: 'View',
    keywords: 'perbesar terminal',
    run: () => {
      const t = T();
      if (!t.visible) t.setVisible(true);
      t.toggleMaximized();
    },
  },
  {
    id: 'shortcut.list',
    title: 'Help: Show Keyboard Shortcuts',
    group: 'View',
    keywords: 'shortcut list keybinding tabel',
    run: () => openSettingsSection('shortcuts'),
  },

  // ── Terminal ──
  {
    id: 'terminal.new',
    title: 'Terminal: New Shell',
    group: 'Terminal',
    action: 'terminal.new',
    keywords: 'powershell pane baru',
    run: async () => {
      await T().addPane('shell');
    },
  },
  {
    id: 'terminal.newPrivate',
    title: 'Terminal: New Private Terminal',
    group: 'Terminal',
    keywords: 'privat incognito',
    run: async () => {
      await T().addPane('private');
    },
  },
  {
    id: 'terminal.newAgent',
    title: 'Terminal: New AI Agent Pane…',
    group: 'Terminal',
    keywords: 'opencode claude codex gemini copilot',
    run: () => {
      T().setVisible(true);
      T().setAgentPickerOpen(true);
    },
  },
  {
    id: 'terminal.splitBrowser',
    title: 'Terminal: Split With Browser',
    group: 'Terminal',
    keywords: 'browser preview iframe localhost',
    run: async () => {
      // Shell dulu bila tab masih kosong supaya benar-benar jadi split 50/50.
      const t = T();
      if ((t.activeTab()?.panes.length ?? 0) === 0) await t.addPane('shell');
      await t.addPane('browser');
    },
  },
  {
    id: 'terminal.toggle',
    title: 'Terminal: Toggle Panel',
    group: 'Terminal',
    action: 'terminal.toggle',
    run: () => {
      const t = T();
      if (t.allPanes().length === 0) void t.addPane('shell');
      else t.toggleVisible();
    },
  },
  {
    id: 'terminal.newTab',
    title: 'Terminal: New Tab',
    group: 'Terminal',
    keywords: 'tab terminal',
    run: () => {
      T().newTab();
      void T().addPane('shell');
    },
  },
  {
    id: 'terminal.closePane',
    title: 'Terminal: Close Active Pane',
    group: 'Terminal',
    enabled: () => !!T().activeTab()?.activePaneId,
    run: () => {
      const id = T().activeTab()?.activePaneId;
      if (id) void T().closePane(id);
    },
  },
  {
    id: 'terminal.list',
    title: 'Terminal: Show Session List',
    group: 'Terminal',
    keywords: 'daftar sesi pid',
    run: () => openSide('terminal'),
  },

  // ── Git ──
  {
    id: 'git.panel',
    title: 'Git: Open Source Control',
    group: 'Git',
    action: 'git.panel',
    keywords: 'scm status',
    run: () => openSide('scm'),
  },
  {
    id: 'git.commit',
    title: 'Git: Commit Staged Changes',
    group: 'Git',
    keywords: 'commit',
    enabled: () => !!useGit.getState().status?.isRepo,
    run: async () => {
      openSide('scm');
      const g = useGit.getState();
      const staged = (g.status?.changes ?? []).filter((c) => c.staged).length;
      if (staged === 0 || !g.message.trim()) {
        // Jangan pura-pura commit: fokuskan kotak pesan & katakan alasannya.
        useGit.setState({
          scmError:
            staged === 0
              ? 'Tidak ada perubahan ter-stage — stage dulu lalu ulangi.'
              : 'Pesan commit masih kosong.',
        });
        window.setTimeout(() => {
          document.querySelector<HTMLTextAreaElement>('[data-testid="scm-message"]')?.focus();
        }, 80);
        return;
      }
      await g.commit();
    },
  },
  {
    id: 'git.refresh',
    title: 'Git: Refresh Status',
    group: 'Git',
    enabled: () => !!useGit.getState().status?.isRepo,
    run: () => useGit.getState().refreshAll(),
  },
  {
    id: 'git.sync',
    title: 'Git: Sync (Pull lalu Push)',
    group: 'Git',
    keywords: 'push pull',
    enabled: () => !!useGit.getState().status?.hasRemote,
    run: () => useGit.getState().sync(),
  },

  // ── AI ──
  {
    id: 'ai.focus',
    title: 'AI: Focus Chat Panel',
    group: 'AI',
    action: 'ai.panel',
    keywords: 'chat prompt',
    run: () => {
      const s = S();
      s.setSettingsOpen(false);
      T().setVisible(true);
      T().setDock('ai');
      window.setTimeout(() => window.dispatchEvent(new Event('zephyr-ai-focus')), 60);
    },
  },
  {
    id: 'ai.newChat',
    title: 'AI: New Chat',
    group: 'AI',
    keywords: 'sesi baru',
    run: () => {
      useAi.getState().newChat();
      T().setVisible(true);
      T().setDock('ai');
    },
  },
  {
    id: 'ai.models',
    title: 'AI: Configure Models & API Keys',
    group: 'AI',
    keywords: 'api key provider',
    run: () => openSettingsSection('models'),
  },

  // ── MCP ──
  {
    id: 'mcp.panel',
    title: 'MCP: Control Zephyr from your AI CLI',
    group: 'MCP',
    keywords: 'mcp 9222 register cli agent',
    run: () => openSettingsSection('mcp'),
  },
  {
    id: 'mcp.toggle',
    title: 'MCP: Toggle Server (port 9222)',
    group: 'MCP',
    keywords: 'nyalakan matikan server',
    run: async () => {
      const m = useMcp.getState();
      openSettingsSection('mcp');
      await m.toggleServer(!m.status?.running);
    },
  },
  {
    id: 'mcp.copyToken',
    title: 'MCP: Copy Bearer Token',
    group: 'MCP',
    keywords: 'token salin',
    run: () => useMcp.getState().copyToken(),
  },

  // ── Settings ──
  {
    id: 'view.settings',
    title: 'Settings: Open',
    group: 'Settings',
    action: 'view.settings',
    keywords: 'preferensi pengaturan',
    run: () => openSettingsSection('general'),
  },
  {
    id: 'settings.theme',
    title: 'Settings: Color Theme',
    group: 'Settings',
    keywords: 'tema warna dark light',
    run: () => openSettingsSection('theme'),
  },
  {
    id: 'settings.extensions',
    title: 'Settings: Extensions',
    group: 'Settings',
    keywords: 'ekstensi',
    run: () => openSettingsSection('extensions'),
  },
  // ── Extensions & tema (fase 13) ──
  {
    id: 'theme.next',
    title: 'Preferences: Color Theme (siklus berikutnya)',
    group: 'Settings',
    keywords: 'tema ganti dark light nord tokyo gruvbox',
    run: async () => {
      const s = S();
      const cur = s.settings.theme.current;
      // semuaTema() ikut memutar tema dari ekstensi aktif (fase 19).
      const daftar = semuaTema();
      const i = daftar.findIndex((t) => t.id === cur);
      const next = daftar[(i + 1 + daftar.length) % daftar.length];
      await s.applySettings({
        theme: { current: next.id },
        general: { theme: next.kind === 'light' ? 'light' : 'dark' },
      });
      s.setStatus(`Tema: ${next.label}`);
    },
  },
  {
    id: 'theme.toggleDarkLight',
    title: 'Preferences: Toggle Dark/Light',
    group: 'Settings',
    keywords: 'terang gelap mode',
    run: async () => {
      const s = S();
      const toLight = s.settings.general.theme !== 'light';
      await s.applySettings({
        general: { theme: toLight ? 'light' : 'dark' },
        theme: { current: toLight ? 'zephyr-light' : 'zephyr-dark' },
      });
    },
  },
  {
    id: 'extensions.marketplace',
    title: 'Extensions: Open Marketplace',
    group: 'Extensions',
    keywords: 'marketplace toko pasang install',
    run: () => {
      openSettingsSection('extensions');
      useExtensions.getState().setMarketOpen(true);
    },
  },
  {
    id: 'extensions.openFolder',
    title: 'Extensions: Open Extensions Folder',
    group: 'Extensions',
    keywords: 'folder ekstensi appdata',
    run: () => useExtensions.getState().openFolder(),
  },
  {
    id: 'extensions.refresh',
    title: 'Extensions: Reload List',
    group: 'Extensions',
    keywords: 'muat ulang scan',
    run: () => useExtensions.getState().refresh(),
  },
  {
    id: 'explorer.revealActive',
    title: 'Explorer: Reveal Active File',
    group: 'File',
    keywords: 'tampilkan di folder',
    enabled: () => !!S().tabs.find((t) => t.id === S().activeTabId)?.path,
    run: async () => {
      const p = S().tabs.find((t) => t.id === S().activeTabId)?.path;
      if (p) await useExplorer.getState().reveal(p);
    },
  },

  // ── Notifications (fase 27) ──
  {
    id: 'notifications.show',
    title: 'Notifications: Show Notifications',
    group: 'View',
    keywords: 'notifikasi lonceng riwayat pemberitahuan',
    run: () => useNotif.getState().setCenterOpen(true),
  },
  {
    id: 'notifications.clear',
    title: 'Notifications: Clear Notifications',
    group: 'View',
    keywords: 'notifikasi bersihkan hapus riwayat',
    run: () => useNotif.getState().clear(),
  },
  {
    id: 'notifications.toggleDnd',
    title: 'Notifications: Toggle Do Not Disturb',
    group: 'View',
    keywords: 'notifikasi dnd redam senyap jangan ganggu',
    run: () => useNotif.getState().toggleDnd(),
  },

  // ── FASE 18: command yang dibutuhkan menu bar ──
  // Yang fiturnya SUDAH ADA didaftarkan di sini supaya item menu benar-benar
  // bekerja. Yang belum ada (debug.*, problems.*, nav.*) SENGAJA tidak
  // didaftarkan — menu menampilkannya sebagai disabled (syarat 18.1), bukan
  // disembunyikan, supaya user tahu apa yang direncanakan.
  {
    id: 'file.openFolder',
    title: 'File: Open Folder…',
    group: 'File',
    action: 'file.openFolder',
    keywords: 'buka folder workspace',
    run: () => S().openFolderDialog(),
  },
  {
    id: 'file.saveAll',
    title: 'File: Save All',
    group: 'File',
    keywords: 'simpan semua',
    enabled: () => S().tabs.some((t) => t.unsaved),
    run: async () => {
      const s = S();
      for (const t of s.tabs.filter((x) => x.unsaved)) {
        flushTab(t.id);
        await s.saveTab(t.id);
      }
    },
  },
  {
    id: 'editor.closeAll',
    title: 'View: Close All Editors',
    group: 'View',
    keywords: 'tutup semua tab editor',
    enabled: () => S().tabs.length > 0,
    run: () => {
      for (const t of S().tabs.slice()) S().requestCloseTab(t.id);
    },
  },
  {
    id: 'edit.find',
    title: 'Edit: Find',
    group: 'Edit',
    action: 'edit.find',
    keywords: 'cari temukan',
    run: () => S().setFindOpen(true),
  },
  {
    id: 'edit.replace',
    title: 'Edit: Replace',
    group: 'Edit',
    keywords: 'ganti replace',
    run: () => {
      S().setFindOpen(true);
      // FindBar punya toggle replace sendiri; buka barisnya lewat klik tombol
      // yang sama supaya tidak ada dua jalur state.
      window.setTimeout(() => {
        document.querySelector<HTMLButtonElement>('.find-toggle')?.click();
      }, 80);
    },
  },
  {
    id: 'edit.findInFiles',
    title: 'Edit: Find in Files',
    group: 'Edit',
    action: 'edit.findInFiles',
    keywords: 'cari workspace global search',
    run: () => {
      openSide('search');
      window.setTimeout(() => {
        document.querySelector<HTMLInputElement>('.search-input')?.focus();
      }, 60);
    },
  },
  {
    id: 'view.palette',
    title: 'View: Command Palette…',
    group: 'View',
    action: 'view.palette',
    keywords: 'palette perintah',
    // paletteStore TIDAK boleh diimport di sini: paletteStore → commandRegistry
    // sudah membentuk lingkaran (pelajaran fase 13 dengan mcpStore). Pakai
    // event window yang ditangkap App.tsx.
    run: () => window.dispatchEvent(new Event('zephyr-palette-open')),
  },
  {
    id: 'view.quickOpen',
    title: 'View: Quick Open File…',
    group: 'View',
    action: 'view.quickOpen',
    keywords: 'buka cepat file',
    run: () => window.dispatchEvent(new Event('zephyr-quickopen')),
  },
  {
    id: 'ai.panel',
    title: 'AI: Toggle AI Panel',
    group: 'AI',
    action: 'ai.panel',
    keywords: 'ai chat panel',
    run: () => {
      const s = S();
      const t = T();
      s.setSettingsOpen(false);
      s.setActivity('ai');
      if (!s.sidebarVisible) s.toggleSidebar();
      if (t.visible && t.dock === 'ai') t.setVisible(false);
      else {
        t.setVisible(true);
        t.setDock('ai');
      }
    },
  },
  {
    id: 'extensions.focus',
    title: 'Extensions: Show Installed',
    group: 'Extensions',
    keywords: 'ekstensi buka installed marketplace',
    // fase 19: Extensions punya panel sendiri di ActivityBar KIRI (19.1).
    // Dulu ini membuka Settings → Extensions; sekarang Settings tetap ada
    // untuk daftar bawaan, tapi Ctrl+Shift+X ke panel yang benar.
    run: () => openSide('extensions'),
  },
  {
    id: 'extensions.installFromFolder',
    title: 'Extensions: Install from Folder…',
    group: 'Extensions',
    keywords: 'pasang ekstensi folder',
    run: async () => {
      openSide('extensions');
      const { useExt19 } = await import('./extensionsStore19');
      await useExt19.getState().installDariDialog(true);
    },
  },
  {
    id: 'extensions.installFromZext',
    title: 'Extensions: Install from .zext…',
    group: 'Extensions',
    keywords: 'pasang ekstensi arsip zip zext',
    run: async () => {
      openSide('extensions');
      const { useExt19 } = await import('./extensionsStore19');
      await useExt19.getState().installDariDialog(false);
    },
  },
  {
    id: 'extensions.settings',
    title: 'Extensions: Bawaan Zephyr (Settings)',
    group: 'Extensions',
    keywords: 'ekstensi bawaan builtin settings',
    run: () => openSettingsSection('extensions'),
  },
  {
    id: 'workbench.reloadWindow',
    title: 'Developer: Reload Window',
    group: 'View',
    keywords: 'muat ulang jendela reload',
    run: () => {
      window.location.reload();
    },
  },
  {
    id: 'terminal.kill',
    title: 'Terminal: Kill Active Pane',
    group: 'Terminal',
    keywords: 'bunuh matikan pane',
    enabled: () => T().allPanes().length > 0,
    run: async () => {
      const t = T();
      const tab = t.terminalTabs.find((x) => x.id === t.activeTabId);
      const id = tab?.activePaneId ?? t.allPanes()[0]?.id;
      if (id) await t.killPane(id);
    },
  },
  {
    id: 'terminal.clear',
    title: 'Terminal: Clear Active Pane',
    group: 'Terminal',
    keywords: 'bersihkan layar clear',
    enabled: () => T().allPanes().length > 0,
    run: async () => {
      const t = T();
      const tab = t.terminalTabs.find((x) => x.id === t.activeTabId);
      const id = tab?.activePaneId ?? t.allPanes()[0]?.id;
      if (id) {
        const { clearTerm } = await import('./xtermRegistry');
        clearTerm(id);
      }
    },
  },
  {
    id: 'window.fullscreen',
    title: 'View: Toggle Full Screen',
    group: 'View',
    keywords: 'fullscreen layar penuh',
    run: async () => {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const w = getCurrentWindow();
      await w.setFullscreen(!(await w.isFullscreen()));
    },
  },
  {
    id: 'editor.wordWrap.toggle',
    title: 'View: Toggle Word Wrap',
    group: 'View',
    keywords: 'wrap lipat baris',
    run: () => S().applySettings({ editor: { wordWrap: !S().settings.editor.wordWrap } }),
  },
  // ── fase 24: editor extras ──
  // Satu command per fitur, semuanya lewat applySettings supaya nilainya
  // langsung tersimpan ke disk (%APPDATA%\zephyr\settings.json) dan bertahan
  // setelah restart — tidak ada state UI terpisah yang bisa jadi tidak sinkron.
  ...(
    [
      ['editor.breadcrumbs.toggle', 'View: Toggle Breadcrumbs', 'breadcrumbs', 'jalur simbol path'],
      ['editor.stickyScroll.toggle', 'View: Toggle Sticky Scroll', 'stickyScroll', 'header menempel'],
      ['editor.minimap.toggle', 'View: Toggle Minimap', 'minimap', 'peta gulir kanan'],
      [
        'editor.indentGuides.toggle',
        'View: Toggle Indent Guides',
        'indentGuides',
        'garis indentasi',
      ],
      [
        'editor.colorDecorators.toggle',
        'View: Toggle Color Decorators',
        'colorDecorators',
        'swatch warna hex rgb',
      ],
      [
        'editor.unicodeHighlight.toggle',
        'View: Toggle Unicode Highlight',
        'unicodeHighlight',
        'karakter ambigu',
      ],
      [
        'editor.bracketPairColorization.toggle',
        'View: Toggle Bracket Pair Colorization',
        'bracketPairColorization',
        'warna bracket kedalaman',
      ],
    ] as const
  ).map(([id, title, kunci, keywords]) => ({
    id,
    title,
    group: 'View' as const,
    keywords,
    run: () =>
      S().applySettings({
        editor: { [kunci]: !S().settings.editor[kunci] } as Partial<EditorSettings>,
      }),
  })),
  {
    id: 'editor.documentColors',
    title: 'Color: Document Colors',
    group: 'View',
    keywords: 'warna hex rgb hsl daftar dokumen',
    enabled: () => !!getActiveView(),
    run: () => {
      const view = getActiveView();
      if (!view) return;
      // Dihitung dari SELURUH dokumen (bukan viewport): ini daftar, bukan
      // dekorasi — user memintanya sekali dan berharap lengkap.
      const teks = view.state.doc.toString();
      const hitung = new Map<string, number>();
      const re =
        /#[0-9a-fA-F]{3,8}\b|\brgba?\(\s*[^)\n]{1,60}\)|\bhsla?\(\s*[^)\n]{1,60}\)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(teks)) !== null) {
        const hex = keHex6(m[0]);
        if (!hex) continue;
        hitung.set(hex, (hitung.get(hex) ?? 0) + 1);
      }
      if (hitung.size === 0) {
        notifyInfo('Tidak ada warna di dokumen ini');
        return;
      }
      const urut = [...hitung.entries()].sort((a, b) => b[1] - a[1]);
      notifyInfo(
        `${hitung.size} warna: ${urut
          .slice(0, 8)
          .map(([h, n]) => `${h}×${n}`)
          .join(', ')}${urut.length > 8 ? ', …' : ''}`,
      );
    },
  },
  {
    id: 'workbench.openGlobalKeybindings',
    title: 'Preferences: Keyboard Shortcuts',
    group: 'Settings',
    keywords: 'keybinding shortcut chord remap',
    run: () => useKb.getState().setEditorOpen(true),
  },
  {
    id: 'help.about',
    title: 'Help: About Zephyr',
    group: 'Settings',
    keywords: 'tentang versi diagnostics',
    run: () => openSettingsSection('about'),
  },
  {
    id: 'help.docs',
    title: 'Help: Documentation',
    group: 'Settings',
    keywords: 'dokumentasi bantuan',
    run: async () => {
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      await openUrl('https://github.com/ShinRyu04/Zephyr').catch(() => {});
    },
  },
  {
    id: 'help.checkUpdates',
    title: 'Help: Check for Updates…',
    group: 'Settings',
    keywords: 'update pembaruan versi baru',
    run: async () => {
      const { useUpdater } = await import('./updaterStore');
      await useUpdater.getState().check();
      openSettingsSection('about');
    },
  },
  // ── FASE 20: panel bawah (Problems/Output/Debug/Terminal/Ports) ──
  {
    id: 'workbench.action.togglePanel',
    title: 'View: Toggle Panel',
    group: 'View',
    action: 'view.panel',
    keywords: 'panel bawah buka tutup',
    run: () => T().toggleVisible(),
  },
  {
    id: 'workbench.action.focusPanel',
    title: 'View: Focus Panel',
    group: 'View',
    keywords: 'fokus panel bawah',
    run: () => usePanel.getState().focusTab(usePanel.getState().activeTab),
  },
  {
    id: 'workbench.action.toggleMaximizedPanel',
    title: 'View: Toggle Maximized Panel',
    group: 'View',
    keywords: 'perbesar panel maximize',
    run: () => {
      const t = T();
      if (!t.visible) t.setVisible(true);
      t.toggleMaximized();
    },
  },
  {
    id: 'problemsPanel.focus',
    title: 'View: Show Problems',
    group: 'View',
    keywords: 'masalah diagnostik error warning',
    run: () => usePanel.getState().focusTab('problems'),
  },
  {
    id: 'outputPanel.focus',
    title: 'View: Show Output',
    group: 'View',
    keywords: 'output log channel',
    run: () => usePanel.getState().focusTab('output'),
  },
  {
    id: 'debugConsolePanel.focus',
    title: 'View: Focus Debug Console',
    group: 'View',
    keywords: 'debug console repl',
    run: () => usePanel.getState().focusTab('debug'),
  },
  {
    id: 'terminalPanel.focus',
    title: 'View: Show Terminal',
    group: 'Terminal',
    keywords: 'terminal panel bawah',
    run: () => usePanel.getState().focusTab('terminal'),
  },
  {
    id: 'portsPanel.focus',
    title: 'View: Show Ports',
    group: 'View',
    keywords: 'port forward',
    run: () => usePanel.getState().focusTab('ports'),
  },
  {
    id: 'panel.clearOutput',
    title: 'Output: Clear Active Channel',
    group: 'View',
    keywords: 'bersihkan output log',
    run: () => useOutput.getState().clear(useOutput.getState().activeChannel),
  },
  {
    id: 'panel.toggleWrap',
    title: 'Output: Toggle Word Wrap',
    group: 'View',
    keywords: 'wrap lipat output',
    run: () => useOutput.getState().toggleWrap(),
  },
  {
    id: 'panel.toggleScrollLock',
    title: 'Output: Toggle Scroll Lock',
    group: 'View',
    keywords: 'scroll lock auto',
    run: () => useOutput.getState().toggleAutoScroll(),
  },
  {
    id: 'panel.nextTab',
    title: 'View: Next Panel Tab',
    group: 'View',
    keywords: 'tab panel berikutnya',
    run: () => usePanel.getState().cycleTab(1),
  },
  {
    id: 'panel.prevTab',
    title: 'View: Previous Panel Tab',
    group: 'View',
    keywords: 'tab panel sebelumnya',
    run: () => usePanel.getState().cycleTab(-1),
  },
  // ── FASE 21: LSP (IntelliSense, navigasi, refactor) ──
  {
    id: 'editor.gotoDefinition',
    title: 'Go: Go to Definition',
    group: 'Edit',
    keywords: 'definisi lompat f12 lsp',
    enabled: () => lspSiap(),
    run: async () => {
      const { path, view } = konteksLsp();
      if (!path || !view) return;
      const { lspDefinition } = await import('./lspCm');
      try {
        const loc = await lspDefinition(path, view, view.state.selection.main.head);
        if (!loc) {
          notifyWarn('Definisi tidak ditemukan', { source: 'LSP' });
          return;
        }
        await S().openPath(loc.file);
        window.setTimeout(() => revealPosition(loc.line, loc.column), 90);
      } catch (e) {
        notifyError('Go to Definition gagal', { source: 'LSP', detail: String(e) });
      }
    },
  },
  {
    id: 'editor.findReferences',
    title: 'Go: Find All References',
    group: 'Edit',
    keywords: 'referensi shift f12 lsp',
    enabled: () => lspSiap(),
    run: async () => {
      const { path, view } = konteksLsp();
      if (!path || !view) return;
      const { lspReferences } = await import('./lspCm');
      try {
        const refs = await lspReferences(path, view, view.state.selection.main.head);
        if (refs.length === 0) {
          notifyWarn('Tidak ada referensi', { source: 'LSP' });
          return;
        }
        // Hasil ditampilkan di Problems (fase 20) sebagai severity 'info'
        // dengan source "references" — reuse tabel yang sudah ada, bukan panel
        // baru; brief fase 21 mengizinkannya.
        const byFile = new Map<string, typeof refs>();
        for (const r of refs) {
          byFile.set(r.file, [...(byFile.get(r.file) ?? []), r]);
        }
        useProblems.getState().clearSource('references');
        for (const [file, list] of byFile) {
          const lama = useProblems.getState().forFile(file).filter((d) => d.source !== 'references');
          useProblems.getState().setDiagnostics(file, [
            ...lama,
            ...list.map((r) => ({
              file: r.file,
              line: r.line,
              column: r.column,
              severity: 'info' as const,
              message: `referensi ${r.line}:${r.column}`,
              source: 'references',
            })),
          ]);
        }
        usePanel.getState().focusTab('problems');
        notifyInfo(`${refs.length} referensi di ${byFile.size} file`, { source: 'LSP' });
      } catch (e) {
        notifyError('Find References gagal', { source: 'LSP', detail: String(e) });
      }
    },
  },
  {
    id: 'editor.formatDocument',
    title: 'Edit: Format Document',
    group: 'Edit',
    keywords: 'format rapikan lsp',
    enabled: () => lspSiap(),
    run: async () => {
      const { path, view } = konteksLsp();
      if (!path || !view) return;
      const { lspFormat } = await import('./lspCm');
      const ed = S().settings.editor;
      try {
        const n = await lspFormat(path, view, ed.tabSize, ed.insertSpaces);
        notifyInfo(n > 0 ? `Dokumen diformat (${n} perubahan)` : 'Sudah rapi', { source: 'LSP' });
      } catch (e) {
        notifyError('Format gagal', { source: 'LSP', detail: String(e) });
      }
    },
  },
  {
    id: 'editor.renameSymbol',
    title: 'Edit: Rename Symbol',
    group: 'Edit',
    keywords: 'rename ganti nama f2 lsp',
    enabled: () => lspSiap(),
    run: () => {
      // Input rename dirender oleh RenameInput (komponen) supaya tidak memakai
      // window.prompt — dialog native diberantas di fase 27.
      window.dispatchEvent(new Event('zephyr-lsp-rename'));
    },
  },
  {
    id: 'editor.quickFix',
    title: 'Edit: Quick Fix',
    group: 'Edit',
    keywords: 'quick fix code action lampu lsp',
    enabled: () => lspSiap(),
    run: () => window.dispatchEvent(new Event('zephyr-lsp-codeaction')),
  },
  {
    id: 'editor.gotoSymbol',
    title: 'Go: Go to Symbol in File',
    group: 'Edit',
    keywords: 'symbol simbol daftar lsp',
    enabled: () => lspSiap(),
    run: () => window.dispatchEvent(new Event('zephyr-lsp-symbols')),
  },
  {
    id: 'lsp.restart',
    title: 'LSP: Restart Language Servers',
    group: 'Settings',
    keywords: 'lsp restart ulang language server',
    run: async () => {
      await useLsp.getState().stopAll();
      notifyInfo('Semua language server dimatikan; akan start lagi saat file dibuka', {
        source: 'LSP',
      });
    },
  },
  {
    id: 'lsp.showOutput',
    title: 'LSP: Show Output',
    group: 'Settings',
    keywords: 'lsp log output',
    run: () => {
      useOutput.getState().setActiveChannel('lsp');
      usePanel.getState().focusTab('output');
    },
  },
  {
    id: 'lsp.status',
    title: 'LSP: Show Running Servers',
    group: 'Settings',
    keywords: 'lsp status server hidup',
    run: async () => {
      const list = (await useLsp.getState().status()) as {
        id: string;
        pid: number;
        idle: number;
        openDocs?: number;
        open_docs?: number;
      }[];
      if (list.length === 0) {
        notifyInfo('Tidak ada language server yang hidup', { source: 'LSP' });
        return;
      }
      for (const s of list) {
        useOutput
          .getState()
          .append(
            'lsp',
            `${s.id} — pid ${s.pid}, idle ${s.idle}s, ${s.open_docs ?? s.openDocs ?? 0} dokumen`,
          );
      }
      useOutput.getState().setActiveChannel('lsp');
      usePanel.getState().focusTab('output');
    },
  },
  // Tema per nama: menu View → Theme butuh satu command per tema supaya
  // pilihannya langsung, bukan lewat "next theme".
  ...THEMES.map((t) => ({
    id: `theme.${t.id}`,
    title: `Theme: ${t.label}`,
    group: 'Settings' as const,
    keywords: `tema warna ${t.kind}`,
    run: () =>
      S().applySettings({
        theme: { current: t.id },
        general: { theme: t.kind === 'light' ? ('light' as const) : ('dark' as const) },
      }),
  })),
];

export const COMMAND_BY_ID = new Map(COMMANDS.map((c) => [c.id, c]));

/**
 * Command dari manifest ekstensi AKTIF (fase 13).
 *
 * v1 manifest-only: kode ekstensi tidak dieksekusi, jadi `run()` di sini
 * jujur — ia melaporkan asal command lewat status bar, bukan berpura-pura
 * menjalankan logika yang tidak ada. Yang dibuktikan V6: entri manifest
 * benar-benar sampai ke palette dan bisa dipanggil.
 */
export function extensionCommands(): CommandDef[] {
  // Dua sumber: paket gaya package.json (fase 13, extensionStore) dan paket
  // native zephyr-extension.json (fase 19, extLoader). Keduanya sudah memakai
  // namespace `ext.<id>.<nama>` dari parse_commands di Rust, jadi id-nya tidak
  // bisa menimpa command inti; dedupe di sini hanya untuk kasus satu paket
  // terdaftar di dua jalur.
  const out = new Map<string, CommandDef>();

  const buat = (
    id: string,
    title: string,
    extId: string,
    extName: string,
    description: string,
  ): CommandDef => ({
    id,
    title,
    group: 'Extensions' as CmdGroup,
    keywords: `${extId} ${extName} ${description} ekstensi`,
    run: () => {
      S().setStatus(`${title} — dari ekstensi ${extName} (manifest v1)`);
      useExtensions.setState({
        extInfo: `Command "${title}" dijalankan dari ekstensi ${extName}`,
      });
    },
  });

  for (const c of useExtensions.getState().commands()) {
    out.set(c.id, buat(c.id, c.title, c.extId, c.extName, c.description));
  }
  for (const c of commandsEkstensi()) {
    if (out.has(c.id)) continue;
    out.set(c.id, buat(c.id, c.title, c.extId, c.extId, c.description));
  }
  return Array.from(out.values());
}

/** Command yang boleh tampil sekarang (mis. butuh workspace/tab aktif). */
export function availableCommands(): CommandDef[] {
  const core = COMMANDS.filter((c) => (c.enabled ? c.enabled() : true));
  return [...core, ...extensionCommands()];
}

/** Cari satu command (inti ATAU dari ekstensi) berdasarkan id. */
export function findCommand(id: string): CommandDef | undefined {
  return COMMAND_BY_ID.get(id) ?? extensionCommands().find((c) => c.id === id);
}

/** FASE 27: jalankan command by id. Dipakai tombol aksi notifikasi supaya
 *  toast tidak perlu tahu apa pun tentang implementasi tiap domain.
 *  Mengembalikan false bila id tidak dikenal (mis. ekstensi sudah dimatikan). */
export async function runCommand(id: string): Promise<boolean> {
  const c = findCommand(id);
  if (!c) return false;
  await c.run();
  return true;
}
