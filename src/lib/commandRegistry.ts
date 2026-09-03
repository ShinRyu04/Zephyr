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
import { useNotif } from './notificationStore';
import { THEMES } from './themes';
import { flushTab } from './editorRegistry';

export type CmdGroup =
  | 'File'
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

/** Buka satu panel sidebar + pastikan sidebar terlihat. */
function openSide(activity: 'explorer' | 'search' | 'scm' | 'ai' | 'terminal') {
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
      const i = THEMES.findIndex((t) => t.id === cur);
      const next = THEMES[(i + 1 + THEMES.length) % THEMES.length];
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
  return useExtensions.getState().commands().map((c) => ({
    id: c.id,
    title: c.title,
    group: 'Extensions' as CmdGroup,
    keywords: `${c.extId} ${c.extName} ${c.description} ekstensi`,
    run: () => {
      S().setStatus(`${c.title} — dari ekstensi ${c.extName} (manifest v1)`);
      useExtensions.setState({
        extInfo: `Command "${c.title}" dijalankan dari ekstensi ${c.extName}`,
      });
    },
  }));
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
