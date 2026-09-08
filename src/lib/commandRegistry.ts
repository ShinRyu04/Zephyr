










import { useStore } from './store';
import { useTerminal } from './terminalStore';
import { useAi } from './aiStore';
import { useGit } from './gitStore';
import { useMcp } from './mcpStore';
import { useExplorer } from './explorerStore';
import { useSettingsUi } from './settingsStore';
import { useExtensions } from './extensionStore';
import { commandsEkstensi } from './extLoader';
import { sandboxCommands, runEkstensiCommand } from './extHost';
import { useNotif, notifyError, notifyInfo, notifyWarn } from './notificationStore';
import { useKb } from './keybindingStore';
import { usePanel } from './panelStore';
import { useLayout } from './editorLayoutStore';
import { useTasks, channelUntuk } from './tasksStore';
import { useHistory } from './historyStore';
import { useDebug } from './debugStore';
import { useWs } from './workspaceStore';
import { sisipkanSnippet, useSnip } from './snippetStore';


import { umumkan as umumkanA11y } from './a11yStore';
import {
  fileDialogOpen as fileDialogOpenCmd,
  fileDialogSave as fileDialogSaveCmd,
  folderDialogOpen as folderDialogOpenCmd,
} from './commands';
import { useOutput } from './outputStore';
import { useProblems } from './problemsStore';
import { useLsp } from './lspStore';
import { serverForPath } from './lsp';
import { THEMES, semuaTema } from './themes';
import { keHex6 } from './cmColor';
import type { EditorSettings } from './types';
import { flushTab, getActiveView, revealPosition } from './editorRegistry';
import { clipboardWrite, clipboardRead } from './clipboard';
import { undo, redo, selectAll, selectLine, toggleComment, toggleBlockComment, selectParentSyntax } from '@codemirror/commands';
import { selectSelectionMatches, gotoLine } from '@codemirror/search';
import { EditorSelection, type SelectionRange } from '@codemirror/state';

export type CmdGroup =
  | 'File'
  | 'Edit'
  | 'View'
  | 'Terminal'
  | 'Git'
  | 'AI'
  | 'MCP'
  | 'Settings'
  | 'Extensions'
  | 'Tasks'
  | 'Debug'
  | 'Snippets';

export interface CommandDef {
  id: string;
   
  title: string;
  group: CmdGroup;
   
  keywords?: string;
   
  action?: string;
   
  enabled?: () => boolean;
  run: () => void | Promise<void>;
}

const S = () => useStore.getState();
const T = () => useTerminal.getState();

 
const konteksLsp = () => {
  const s = S();
  const tab = s.tabs.find((t) => t.id === s.activeTabId);
  return { path: tab?.path ?? null, view: getActiveView() };
};

const lompatMasalah = (arah: 1 | -1) => {
  const s = S();
  const tab = s.tabs.find((t) => t.id === s.activeTabId);
  if (!tab?.path) return;
  const v = getActiveView();
  const baris = v ? v.state.doc.lineAt(v.state.selection.main.head).number : 1;
  const diags = useProblems
    .getState()
    .all()
    .filter((d) => d.file === tab.path)
    .sort((a, b) => a.line - b.line || a.column - b.column);
  if (!diags.length) {
    notifyInfo('Tidak ada masalah di file ini', { source: 'editor' });
    return;
  }
  const idx = diags.findIndex((d) => d.line > baris || (d.line === baris && d.column > 0));
  let target: (typeof diags)[number];
  if (arah === 1) target = idx === -1 ? diags[0] : diags[idx];
  else target = idx <= 0 ? diags[diags.length - 1] : diags[idx - 1];
  revealPosition(target.line, target.column);
  v?.focus();
};

 
const lspSiap = () => {
  const { path } = konteksLsp();
  return !!path && !!serverForPath(path) && useLsp.getState().settings().enabled;
};

 
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
    id: 'view.splitEditorRight',
    title: 'View: Split Editor Right',
    group: 'View',
    keywords: 'layout grup dua kolom berdampingan',
    run: () => useLayout.getState().splitKanan(),
  },
  {
    id: 'view.joinEditorGroups',
    title: 'View: Join Editor Groups',
    group: 'View',
    keywords: 'gabung layout satu kolom',
    enabled: () => useLayout.getState().split,
    run: () => useLayout.getState().gabungKanan(),
  },
  {
    id: 'shortcut.list',
    title: 'Help: Show Keyboard Shortcuts',
    group: 'View',
    keywords: 'shortcut list keybinding tabel',
    run: () => openSettingsSection('shortcuts'),
  },

  
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
  
  {
    id: 'theme.next',
    title: 'Preferences: Color Theme (siklus berikutnya)',
    group: 'Settings',
    keywords: 'tema ganti dark light nord tokyo gruvbox',
    run: async () => {
      const s = S();
      const cur = s.settings.theme.current;
      
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
  
  
  
  
  {
    id: 'tasks.runBuild',
    title: 'Tasks: Run Build Task',
    group: 'Tasks',
    keywords: 'build compile jalankan ctrl+shift+b',
    enabled: () => useTasks.getState().buildDefault() !== null,
    run: async () => {
      usePanel.getState().focusTab('output');
      await useTasks.getState().jalankanBuild();
    },
  },
  {
    id: 'tasks.runTask',
    title: 'Tasks: Run Task',
    group: 'Tasks',
    keywords: 'task jalankan run',
    enabled: () => useTasks.getState().daftar().length > 0,
    run: async () => {
      
      
      window.dispatchEvent(
        new CustomEvent('zephyr-palette-open', { detail: { query: 'Task: ' } }),
      );
    },
  },
  {
    id: 'tasks.terminate',
    title: 'Tasks: Terminate Task',
    group: 'Tasks',
    keywords: 'stop kill hentikan task',
    enabled: () => useTasks.getState().runsAktif().length > 0,
    run: async () => {
      const n = await useTasks.getState().hentikanSemua();
      notifyInfo(`${n} task dihentikan`, { source: 'Tasks' });
    },
  },
  {
    id: 'tasks.reload',
    title: 'Tasks: Reload tasks.json',
    group: 'Tasks',
    keywords: 'refresh muat ulang task',
    run: async () => {
      const f = await useTasks.getState().muat();
      if (f) notifyInfo(`${f.tasks.length} task dimuat`, { source: 'Tasks' });
    },
  },
  {
    id: 'tasks.showOutput',
    title: 'Tasks: Show Task Output',
    group: 'Tasks',
    keywords: 'output log task',
    enabled: () => useTasks.getState().runs.length > 0,
    run: () => {
      const T = useTasks.getState();
      const terakhir = T.runs[T.runs.length - 1];
      usePanel.getState().focusTab('output');
      if (terakhir) useOutput.getState().setActiveChannel(channelUntuk(terakhir.label));
    },
  },
  
  {
    id: 'timeline.focus',
    title: 'Timeline: Focus',
    group: 'View',
    keywords: 'history riwayat snapshot timeline',
    run: () => {
      const s = S();
      s.setSettingsOpen(false);
      s.setActivity('explorer');
      if (!s.sidebarVisible) s.toggleSidebar();
      const p = s.tabs.find((t) => t.id === s.activeTabId)?.path;
      if (p) void useHistory.getState().muat(p);
    },
  },
  {
    id: 'timeline.snapshot',
    title: 'Timeline: Snapshot Sekarang',
    group: 'View',
    keywords: 'history simpan versi manual',
    enabled: () => {
      const s = S();
      return !!s.tabs.find((t) => t.id === s.activeTabId)?.path;
    },
    run: async () => {
      const s = S();
      const p = s.tabs.find((t) => t.id === s.activeTabId)?.path;
      if (!p) return;
      const id = await useHistory.getState().snapshotSave(p, 'manual');
      if (id) notifyInfo('Snapshot dibuat', { source: 'history' });
      else notifyWarn('Snapshot dilewati (isi sama / file besar / biner)', { source: 'history' });
    },
  },
  {
    id: 'timeline.restore',
    title: 'Timeline: Restore from History',
    group: 'View',
    keywords: 'history kembalikan versi lama',
    enabled: () => useHistory.getState().timeline.some((t) => t.kind === 'snapshot'),
    run: async () => {
      const H = useHistory.getState();
      const snap = H.timeline.find((t) => t.kind === 'snapshot');
      if (!snap) {
        notifyWarn('Belum ada snapshot untuk file ini', { source: 'history' });
        return;
      }
      await H.restore(snap.id);
    },
  },
  {
    id: 'timeline.clear',
    title: 'Timeline: Hapus Riwayat File Ini',
    group: 'View',
    keywords: 'history bersihkan hapus snapshot',
    enabled: () => (useHistory.getState().info?.snapshots.length ?? 0) > 0,
    run: async () => {
      await useHistory.getState().bersihkan();
    },
  },
  
  {
    id: 'debug.focus',
    title: 'Debug: Fokus Run & Debug',
    group: 'Debug',
    keywords: 'debug run breakpoint launch',
    run: () => {
      const s = S();
      s.setSettingsOpen(false);
      s.setActivity('debug');
      if (!s.sidebarVisible) s.toggleSidebar();
      void useDebug.getState().muatLaunch();
      void useDebug.getState().muatAdapters();
    },
  },
  {
    id: 'debug.start',
    title: 'Debug: Start Debugging',
    group: 'Debug',
    keywords: 'debug jalankan f5 launch',
    run: async () => {
      const D = useDebug.getState();
      
      
      if (D.state === 'stopped') {
        await D.kontrol('continue');
        return;
      }
      if (D.state !== 'inactive') return;
      if (!D.launch) await D.muatLaunch();
      await useDebug.getState().start();
    },
  },
  {
    id: 'debug.stop',
    title: 'Debug: Stop',
    group: 'Debug',
    keywords: 'debug hentikan shift f5',
    enabled: () => useDebug.getState().state !== 'inactive',
    run: async () => {
      await useDebug.getState().stop();
    },
  },
  {
    id: 'debug.restart',
    title: 'Debug: Restart',
    group: 'Debug',
    keywords: 'debug ulangi restart',
    enabled: () => useDebug.getState().state !== 'inactive',
    run: async () => {
      await useDebug.getState().restart();
    },
  },
  {
    id: 'debug.pause',
    title: 'Debug: Pause',
    group: 'Debug',
    keywords: 'debug jeda f6',
    enabled: () => useDebug.getState().state === 'running',
    run: async () => {
      await useDebug.getState().kontrol('pause');
    },
  },
  {
    id: 'debug.stepOver',
    title: 'Debug: Step Over',
    group: 'Debug',
    keywords: 'debug langkah f10',
    enabled: () => useDebug.getState().state === 'stopped',
    run: async () => {
      await useDebug.getState().kontrol('next');
    },
  },
  {
    id: 'debug.stepInto',
    title: 'Debug: Step Into',
    group: 'Debug',
    keywords: 'debug masuk f11',
    enabled: () => useDebug.getState().state === 'stopped',
    run: async () => {
      await useDebug.getState().kontrol('stepIn');
    },
  },
  {
    id: 'debug.stepOut',
    title: 'Debug: Step Out',
    group: 'Debug',
    keywords: 'debug keluar shift f11',
    enabled: () => useDebug.getState().state === 'stopped',
    run: async () => {
      await useDebug.getState().kontrol('stepOut');
    },
  },
  {
    id: 'debug.toggleBreakpoint',
    title: 'Debug: Toggle Breakpoint',
    group: 'Debug',
    keywords: 'debug breakpoint f9 titik henti',
    enabled: () => {
      const s = S();
      return !!s.tabs.find((t) => t.id === s.activeTabId)?.path;
    },
    run: async () => {
      const s = S();
      const p = s.tabs.find((t) => t.id === s.activeTabId)?.path;
      if (!p) return;
      
      
      const { activeLine } = await import('./editorRegistry');
      const line = activeLine();
      if (line < 1) {
        notifyWarn('Tidak ada kursor di editor', { source: 'debug' });
        return;
      }
      await useDebug.getState().toggleBreakpoint(p, line);
    },
  },
  {
    id: 'debug.clearBreakpoints',
    title: 'Debug: Hapus Semua Breakpoint',
    group: 'Debug',
    keywords: 'debug bersihkan breakpoint',
    enabled: () => useDebug.getState().breakpoints.length > 0,
    run: async () => {
      await useDebug.getState().hapusSemuaBreakpoint();
    },
  },
  
  {
    id: 'a11y.toggleScreenReaderMode',
    title: 'Accessibility: Toggle Screen Reader Mode',
    group: 'Settings',
    keywords: 'aksesibilitas screen reader narrator nvda pembaca layar a11y',
    run: async () => {
      const s = S();
      const a = s.settings.accessibility;
      const baru = !a?.screenReader;
      await s.applySettings({
        accessibility: {
          reducedMotion: !!a?.reducedMotion,
          screenReader: baru,
          autoFocusDialog: a?.autoFocusDialog ?? true,
          toastDurasiMin: a?.toastDurasiMin ?? 3200,
        },
      });
      umumkanA11y(
        baru
          ? 'Mode screen reader aktif. Terminal dan editor dioptimalkan untuk pembaca layar.'
          : 'Mode screen reader nonaktif.',
      );
    },
  },
  {
    id: 'a11y.toggleReducedMotion',
    title: 'Accessibility: Toggle Reduced Motion',
    group: 'Settings',
    keywords: 'aksesibilitas animasi transisi kurangi gerak motion a11y',
    run: async () => {
      const s = S();
      const a = s.settings.accessibility;
      const baru = !a?.reducedMotion;
      await s.applySettings({
        accessibility: {
          reducedMotion: baru,
          screenReader: !!a?.screenReader,
          autoFocusDialog: a?.autoFocusDialog ?? true,
          toastDurasiMin: a?.toastDurasiMin ?? 3200,
        },
      });
      umumkanA11y(baru ? 'Animasi dikurangi.' : 'Animasi dinyalakan.');
    },
  },
  {
    id: 'a11y.highContrast',
    title: 'Accessibility: Tema High Contrast',
    group: 'Settings',
    keywords: 'aksesibilitas kontras tinggi tema low vision aaa a11y',
    run: async () => {
      const s = S();
      
      const kembali = s.settings.theme.current === 'high-contrast';
      await s.applySettings({
        theme: { current: kembali ? 'zephyr-dark' : 'high-contrast' },
        general: { theme: 'dark' },
      });
      umumkanA11y(kembali ? 'Tema Zephyr Dark.' : 'Tema High Contrast aktif.');
    },
  },
  {
    id: 'a11y.focusEditor',
    title: 'Accessibility: Fokus ke Editor',
    group: 'View',
    keywords: 'fokus editor keyboard a11y lompat',
    enabled: () => !!getActiveView(),
    run: () => {
      const v = getActiveView();
      v?.focus();
      umumkanA11y('Fokus di editor.');
    },
  },
  {
    id: 'a11y.announceStatus',
    title: 'Accessibility: Bacakan Status Editor',
    group: 'View',
    keywords: 'bacakan status baris kolom posisi a11y screen reader',
    run: () => {
      const s = S();
      const tab = s.tabs.find((t) => t.id === s.activeTabId);
      const v = getActiveView();
      if (!tab || !v) {
        umumkanA11y('Tidak ada file yang terbuka.', 'assertive');
        return;
      }
      const sel = v.state.selection.main;
      const baris = v.state.doc.lineAt(sel.head);
      const total = v.state.doc.lines;
      const kotor = tab.unsaved ? ', belum disimpan' : '';
      umumkanA11y(
        `${tab.name}${kotor}. Baris ${baris.number} dari ${total}, kolom ${
          sel.head - baris.from + 1
        }.`,
      );
    },
  },
  
  {
    id: 'snippets.insert',
    title: 'Snippets: Insert Snippet',
    group: 'Snippets',
    keywords: 'snippet sisip template potongan kode',
    
    enabled: () => !!S().activeTabId,
    run: async () => {
      const tab = S().tabs.find((t) => t.id === S().activeTabId);
      if (!tab) return;
      
      
      
      await useSnip.getState().muat(tab.lang);
      window.dispatchEvent(
        new CustomEvent('zephyr-palette-open', { detail: { query: 'Snippet: ' } }),
      );
    },
  },
  {
    id: 'snippets.configureUser',
    title: 'Snippets: Configure User Snippets',
    group: 'Snippets',
    keywords: 'snippet user konfigurasi edit json bahasa',
    run: async () => {
      const s = S();
      const tab = s.tabs.find((t) => t.id === s.activeTabId);
      
      
      
      const lang = tab?.lang && tab.lang !== 'plain' ? tab.lang : 'global';
      const p = await useSnip.getState().bukaFileUser(lang);
      if (p) await s.openPath(p);
    },
  },
  {
    id: 'snippets.reload',
    title: 'Snippets: Muat Ulang Snippet',
    group: 'Snippets',
    keywords: 'snippet reload refresh muat ulang',
    run: async () => {
      const s = S();
      useSnip.getState().bersihkanCache();
      const tab = s.tabs.find((t) => t.id === s.activeTabId);
      await useSnip.getState().muat(tab?.lang ?? 'global', true);
      await useSnip.getState().muatDaftar();
    },
  },
  
  {
    id: 'workspace.addFolder',
    title: 'Workspace: Tambah Folder ke Workspace',
    group: 'File',
    keywords: 'workspace root folder multi tambah add',
    run: async () => {
      const dir = await folderDialogOpenCmd();
      if (!dir) return;
      await useWs.getState().tambahRoot(dir);
    },
  },
  {
    id: 'workspace.removeFolder',
    title: 'Workspace: Hapus Folder Aktif dari Workspace',
    group: 'File',
    keywords: 'workspace root folder hapus remove',
    
    
    enabled: () => useWs.getState().roots.length > 1,
    run: async () => {
      const aktif = useWs.getState().activeRoot;
      if (aktif) await useWs.getState().hapusRoot(aktif);
    },
  },
  {
    id: 'workspace.openFile',
    title: 'Workspace: Buka File .code-workspace',
    group: 'File',
    keywords: 'workspace code-workspace buka open multi root',
    run: async () => {
      const picked = await fileDialogOpenCmd(false);
      const p = picked?.[0];
      if (!p) return;
      await useWs.getState().bukaFile(p);
    },
  },
  {
    id: 'workspace.saveAs',
    title: 'Workspace: Save Workspace As…',
    group: 'File',
    keywords: 'workspace simpan save as code-workspace',
    enabled: () => useWs.getState().roots.length > 0,
    run: async () => {
      const ws = useWs.getState();
      const usul = ws.file || `${S().workspace ?? ''}/zephyr.code-workspace`;
      const p = await fileDialogSaveCmd(usul);
      if (!p) return;
      await ws.simpanFile(p);
    },
  },
  {
    id: 'workspace.manageTrust',
    title: 'Workspace: Manage Workspace Trust',
    group: 'File',
    keywords: 'trust restricted keamanan security percaya folder',
    run: () => {
      const ws = useWs.getState();
      ws.tanya(ws.activeRoot || null);
    },
  },
  {
    id: 'workspace.trustList',
    title: 'Workspace: Daftar Folder Tepercaya',
    group: 'File',
    keywords: 'trust daftar list security settings',
    run: async () => {
      const s = S();
      s.setActivity('settings');
      s.setSettingsOpen(true);
      await useWs.getState().muatDaftarTrust();
    },
  },
  {
    id: 'editor.undo',
    title: 'Edit: Undo',
    group: 'Edit',
    keywords: 'undo batal',
    enabled: () => !!getActiveView(),
    run: () => {
      const v = getActiveView();
      if (v) undo(v);
    },
  },
  {
    id: 'editor.redo',
    title: 'Edit: Redo',
    group: 'Edit',
    keywords: 'redo ulangi',
    enabled: () => !!getActiveView(),
    run: () => {
      const v = getActiveView();
      if (v) redo(v);
    },
  },
  {
    id: 'editor.clip.cut',
    title: 'Edit: Cut',
    group: 'Edit',
    keywords: 'potong gunting clipboard',
    enabled: () => !!getActiveView(),
    run: async () => {
      const v = getActiveView();
      if (!v) return;
      const { from, to } = v.state.selection.main;
      const txt = v.state.sliceDoc(from, to);
      if (!txt) return;
      await clipboardWrite(txt);
      v.dispatch({ changes: { from, to } });
      v.focus();
    },
  },
  {
    id: 'editor.clip.copy',
    title: 'Edit: Copy',
    group: 'Edit',
    keywords: 'salin clipboard',
    enabled: () => !!getActiveView(),
    run: async () => {
      const v = getActiveView();
      if (!v) return;
      const { from, to } = v.state.selection.main;
      const txt = v.state.sliceDoc(from, to);
      if (!txt) return;
      await clipboardWrite(txt);
      notifyInfo('Disalin ke clipboard', { source: 'editor' });
    },
  },
  {
    id: 'editor.clip.paste',
    title: 'Edit: Paste',
    group: 'Edit',
    keywords: 'tempel clipboard',
    enabled: () => !!getActiveView(),
    run: async () => {
      const v = getActiveView();
      if (!v) return;
      const txt = await clipboardRead();
      if (!txt) return;
      const { from, to } = v.state.selection.main;
      v.dispatch({ changes: { from, to, insert: txt } });
      v.focus();
    },
  },
  {
    id: 'editor.comment.toggle',
    title: 'Edit: Toggle Line Comment',
    group: 'Edit',
    keywords: 'komentar baris',
    enabled: () => !!getActiveView(),
    run: () => {
      const v = getActiveView();
      if (v) toggleComment(v);
    },
  },
  {
    id: 'editor.blockComment.toggle',
    title: 'Edit: Toggle Block Comment',
    group: 'Edit',
    keywords: 'komentar blok',
    enabled: () => !!getActiveView(),
    run: () => {
      const v = getActiveView();
      if (v) toggleBlockComment(v);
    },
  },
  {
    id: 'editor.selectAll',
    title: 'Selection: Select All',
    group: 'Edit',
    keywords: 'pilih semua select all',
    enabled: () => !!getActiveView(),
    run: () => {
      const v = getActiveView();
      if (v) selectAll(v);
    },
  },
  {
    id: 'editor.select.expand',
    title: 'Selection: Expand Selection',
    group: 'Edit',
    keywords: 'perluas pilihan expand',
    enabled: () => !!getActiveView(),
    run: () => {
      const v = getActiveView();
      if (v) selectParentSyntax(v);
    },
  },
  {
    id: 'editor.select.shrink',
    title: 'Selection: Shrink Selection',
    group: 'Edit',
    keywords: 'persempit pilihan shrink',
    enabled: () => !!getActiveView(),
    run: () => {
      const v = getActiveView();
      if (!v) return;
      const { from, to } = v.state.selection.main;
      if (from === to) return;
      const head = v.state.selection.main.head;
      const anchor = v.state.selection.main.anchor;
      const dir = head > anchor ? -1 : 1;
      const nh = head + dir;
      if (nh === anchor) return;
      v.dispatch({ selection: { anchor, head: nh } });
      v.focus();
    },
  },
  {
    id: 'editor.cursor.above',
    title: 'Selection: Add Cursor Above',
    group: 'Edit',
    keywords: 'kursor tambah atas',
    enabled: () => !!getActiveView(),
    run: () => {
      const v = getActiveView();
      if (!v) return;
      const { state } = v;
      const ranges = state.selection.ranges;
      const extra: SelectionRange[] = [];
      for (const r of ranges) {
        const line = state.doc.lineAt(r.head);
        const target = state.doc.line(Math.max(1, line.number - 1));
        if (target.number === line.number) continue;
        const col = Math.min(r.head - line.from, target.length);
        extra.push(EditorSelection.cursor(target.from + col));
      }
      if (extra.length) v.dispatch({ selection: EditorSelection.create([...ranges, ...extra]) });
      v.focus();
    },
  },
  {
    id: 'editor.cursor.below',
    title: 'Selection: Add Cursor Below',
    group: 'Edit',
    keywords: 'kursor tambah bawah',
    enabled: () => !!getActiveView(),
    run: () => {
      const v = getActiveView();
      if (!v) return;
      const { state } = v;
      const ranges = state.selection.ranges;
      const extra: SelectionRange[] = [];
      for (const r of ranges) {
        const line = state.doc.lineAt(r.head);
        const target = state.doc.line(Math.min(state.doc.lines, line.number + 1));
        if (target.number === line.number) continue;
        const col = Math.min(r.head - line.from, target.length);
        extra.push(EditorSelection.cursor(target.from + col));
      }
      if (extra.length) v.dispatch({ selection: EditorSelection.create([...ranges, ...extra]) });
      v.focus();
    },
  },
  {
    id: 'editor.cursor.lineEnds',
    title: 'Selection: Add Cursor to Line Ends',
    group: 'Edit',
    keywords: 'kursor akhir baris',
    enabled: () => !!getActiveView(),
    run: () => {
      const v = getActiveView();
      if (!v) return;
      const { state } = v;
      const lines = new Set<number>();
      for (const r of state.selection.ranges) {
        const a = state.doc.lineAt(r.from).number;
        const b = state.doc.lineAt(r.to).number;
        for (let n = a; n <= b; n++) lines.add(n);
      }
      const extra: SelectionRange[] = [];
      for (const n of lines) extra.push(EditorSelection.cursor(state.doc.line(n).to));
      if (extra.length) v.dispatch({ selection: EditorSelection.create(extra) });
      v.focus();
    },
  },
  {
    id: 'editor.select.line',
    title: 'Selection: Select Current Line',
    group: 'Edit',
    keywords: 'pilih baris',
    enabled: () => !!getActiveView(),
    run: () => {
      const v = getActiveView();
      if (v) selectLine(v);
    },
  },
  {
    id: 'editor.select.occurrences',
    title: 'Selection: Select All Occurrences',
    group: 'Edit',
    keywords: 'pilih semua kemunculan',
    enabled: () => !!getActiveView(),
    run: () => {
      const v = getActiveView();
      if (v) selectSelectionMatches(v);
    },
  },
  {
    id: 'editor.gotoLine',
    title: 'Go: Go to Line…',
    group: 'Edit',
    keywords: 'lompat baris goto line',
    enabled: () => !!getActiveView(),
    run: () => {
      const v = getActiveView();
      if (v) gotoLine(v);
    },
  },
  {
    id: 'editor.nextError',
    title: 'Go: Next Problem',
    group: 'Edit',
    keywords: 'error berikutnya next problem',
    enabled: () => !!S().tabs.find((t) => t.id === S().activeTabId)?.path,
    run: () => lompatMasalah(1),
  },
  {
    id: 'editor.prevError',
    title: 'Go: Previous Problem',
    group: 'Edit',
    keywords: 'error sebelumnya prev problem',
    enabled: () => !!S().tabs.find((t) => t.id === S().activeTabId)?.path,
    run: () => lompatMasalah(-1),
  },
  {
    id: 'editor.reopen',
    title: 'File: Reopen Closed Editor',
    group: 'File',
    keywords: 'buka kembali tab ditutup reopen',
    enabled: () => !!S().lastClosed,
    run: () => {
      const p = S().lastClosed?.path;
      if (p) void S().openPath(p);
    },
  },
  {
    id: 'explorer.closeFolder',
    title: 'File: Close Folder',
    group: 'File',
    keywords: 'tutup folder workspace',
    enabled: () => !!S().workspace,
    run: () => S().closeWorkspace(),
  },
  {
    id: 'nav.back',
    title: 'Go: Back',
    group: 'View',
    keywords: 'kembali mundur back',
    enabled: () => S().navBack.length > 0,
    run: () => {
      const s = S();
      const loc = s.navBack[s.navBack.length - 1];
      if (!loc) return;
      const cur = s.tabs.find((t) => t.id === s.activeTabId);
      s.setNavBack(s.navBack.slice(0, -1));
      if (cur?.path) {
        s.setNavForward([
          ...s.navForward,
          { path: cur.path, line: s.cursor.line, col: s.cursor.col },
        ]);
      }
      s.setNavSuppress(true);
      void s.openPathAt(loc.path, loc.line, loc.col);
      s.setNavSuppress(false);
    },
  },
  {
    id: 'nav.forward',
    title: 'Go: Forward',
    group: 'View',
    keywords: 'maju lanjut forward',
    enabled: () => S().navForward.length > 0,
    run: () => {
      const s = S();
      const loc = s.navForward[s.navForward.length - 1];
      if (!loc) return;
      const cur = s.tabs.find((t) => t.id === s.activeTabId);
      s.setNavForward(s.navForward.slice(0, -1));
      if (cur?.path) {
        s.setNavBack([
          ...s.navBack,
          { path: cur.path, line: s.cursor.line, col: s.cursor.col },
        ]);
      }
      s.setNavSuppress(true);
      void s.openPathAt(loc.path, loc.line, loc.col);
      s.setNavSuppress(false);
    },
  },
  {
    id: 'editor.breadcrumbs.toggle',
    title: 'View: Toggle Breadcrumbs',
    group: 'View',
    keywords: 'breadcrumbs toggle',
    run: () => S().applySettings({ editor: { breadcrumbs: !S().settings.editor.breadcrumbs } }),
  },
  {
    id: 'editor.stickyScroll.toggle',
    title: 'View: Toggle Sticky Scroll',
    group: 'View',
    keywords: 'sticky scroll toggle',
    run: () => S().applySettings({ editor: { stickyScroll: !S().settings.editor.stickyScroll } }),
  },
  {
    id: 'editor.minimap.toggle',
    title: 'View: Toggle Minimap',
    group: 'View',
    keywords: 'minimap toggle',
    run: () => S().applySettings({ editor: { minimap: !S().settings.editor.minimap } }),
  },
  {
    id: 'editor.indentGuides.toggle',
    title: 'View: Toggle Indent Guides',
    group: 'View',
    keywords: 'indent guides toggle',
    run: () => S().applySettings({ editor: { indentGuides: !S().settings.editor.indentGuides } }),
  },
  {
    id: 'editor.colorDecorators.toggle',
    title: 'View: Toggle Color Decorators',
    group: 'View',
    keywords: 'color decorators toggle',
    run: () => S().applySettings({ editor: { colorDecorators: !S().settings.editor.colorDecorators } }),
  },
  {
    id: 'editor.unicodeHighlight.toggle',
    title: 'View: Toggle Unicode Highlight',
    group: 'View',
    keywords: 'unicode highlight toggle',
    run: () => S().applySettings({ editor: { unicodeHighlight: !S().settings.editor.unicodeHighlight } }),
  },
  {
    id: 'editor.bracketPairColorization.toggle',
    title: 'View: Toggle Bracket Pair Colorization',
    group: 'View',
    keywords: 'bracket pair colorization toggle',
    run: () =>
      S().applySettings({ editor: { bracketPairColorization: !S().settings.editor.bracketPairColorization } }),
  },
  {
    id: 'theme.zephyr-dark',
    title: 'Theme: Zephyr Dark',
    group: 'View',
    keywords: 'tema gelap zephyr dark',
    run: () => S().applySettings({ general: { theme: 'dark' }, theme: { current: 'zephyr-dark' } }),
  },
  {
    id: 'theme.zephyr-light',
    title: 'Theme: Zephyr Light',
    group: 'View',
    keywords: 'tema terang zephyr light',
    run: () => S().applySettings({ general: { theme: 'light' }, theme: { current: 'zephyr-light' } }),
  },
  {
    id: 'theme.nord',
    title: 'Theme: Nord',
    group: 'View',
    keywords: 'tema nord',
    run: () => S().applySettings({ general: { theme: 'dark' }, theme: { current: 'nord' } }),
  },
  {
    id: 'theme.tokyo-night',
    title: 'Theme: Tokyo Night',
    group: 'View',
    keywords: 'tema tokyo night',
    run: () => S().applySettings({ general: { theme: 'dark' }, theme: { current: 'tokyo-night' } }),
  },
  {
    id: 'theme.gruvbox',
    title: 'Theme: Gruvbox',
    group: 'View',
    keywords: 'tema gruvbox',
    run: () => S().applySettings({ general: { theme: 'dark' }, theme: { current: 'gruvbox-dark' } }),
  },
  {
    id: 'theme.one-dark-pro',
    title: 'Theme: One Dark Pro',
    group: 'View',
    keywords: 'tema one dark pro',
    run: () => S().applySettings({ general: { theme: 'dark' }, theme: { current: 'one-dark' } }),
  },
  {
    id: 'window.close',
    title: 'File: Exit',
    group: 'File',
    keywords: 'keluar tutup exit window',
    run: async () => {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().close();
    },
  },
  {
    id: 'window.new',
    title: 'File: New Window',
    group: 'File',
    keywords: 'jendela baru window new',
    run: async () => {
      const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
      new WebviewWindow(`zephyr-${Date.now()}`, {
        url: 'index.html',
        title: 'Zephyr',
        width: 1440,
        height: 900,
        minWidth: 800,
        minHeight: 520,
      });
    },
  },
];

 
export function taskCommands(): CommandDef[] {
  const T = useTasks.getState();
  const recent = T.recent;
  const urut = [...T.daftar()].sort((a, b) => {
    const ia = recent.indexOf(a.label);
    const ib = recent.indexOf(b.label);
    if (ia === ib) return a.label.localeCompare(b.label);
    if (ia < 0) return 1;
    if (ib < 0) return -1;
    return ia - ib;
  });
  return urut.map((t) => ({
    id: `task.${t.label}`,
    title: `Task: ${t.label}`,
    group: 'Tasks' as const,
    keywords: `${t.group} ${t.command} ${t.kind}`.trim(),
    description: t.command || `dependsOn: ${t.dependsOn.join(', ')}`,
    run: async () => {
      usePanel.getState().focusTab('output');
      await useTasks.getState().jalankan(t.label);
    },
  }));
}

 
export function extensionCommands(): CommandDef[] {
  
  
  
  
  
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
  for (const c of sandboxCommands()) {
    if (out.has(c.id)) continue;
    out.set(c.id, {
      id: c.id,
      title: c.title,
      group: 'Extensions' as CmdGroup,
      keywords: `${c.extId} ${c.title} ekstensi sandbox`,
      run: () => {
        void runEkstensiCommand(c.extId, c.id, []).catch((e) =>
          useNotif
            .getState()
            .notify({ severity: 'error', message: `Ekstensi ${c.extId}: ${c.title}`, detail: String(e.message || e), source: 'extensions' }),
        );
      },
    });
  }
  return Array.from(out.values());
}

 
 
export function snippetCommands(): CommandDef[] {
  const view = getActiveView();
  if (!view) return [];
  const tab = S().tabs.find((t) => t.id === S().activeTabId);
  if (!tab) return [];
  const lang = tab.lang;
  const daftar = useSnip.getState().untuk(lang);
  return daftar.slice(0, 200).map((s) => ({
    id: `snippet.${s.lang}.${s.prefix}`,
    title: `Snippet: ${s.prefix} — ${s.name}`,
    group: 'Snippets' as const,
    keywords: `${s.description} ${s.sumber} ${s.lang}`.trim(),
    description: s.description || undefined,
    run: async () => {
      const v = getActiveView();
      if (!v) return;
      await sisipkanSnippet(v, s, tab.path ?? '');
    },
  }));
}

export function availableCommands(): CommandDef[] {
  const core = COMMANDS.filter((c) => (c.enabled ? c.enabled() : true));
  return [...core, ...taskCommands(), ...extensionCommands(), ...snippetCommands()];
}

export const COMMAND_BY_ID = new Map(COMMANDS.map((c) => [c.id, c]));

 
export function findCommand(id: string): CommandDef | undefined {
  return (
    COMMAND_BY_ID.get(id) ??
    taskCommands().find((c) => c.id === id) ??
    extensionCommands().find((c) => c.id === id)
  );
}

 
export async function runCommand(id: string): Promise<boolean> {
  const c = findCommand(id);
  if (!c) return false;
  await c.run();
  return true;
}
