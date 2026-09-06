



import { create } from 'zustand';
import { getCurrentWindow } from '@tauri-apps/api/window';
import * as cmd from './commands';
import { detectLang } from './lang';
import { kunciPath, pathSama } from './pathKey';
import { revealPosition } from './editorRegistry';
import { applyTheme } from './themes';



import { terapkanA11y } from './a11yStore';
import { retheme, reSrMode } from './xtermRegistry';



import { useLayout } from './editorLayoutStore';
import {
  DEFAULT_SETTINGS,
  type ActivityId,
  type AppInfo,
  type Encoding,
  type LineEnding,
  type RecentEntry,
  type Settings,
  type Tab,
} from './types';

 
export interface ConfirmState {
   
  tabIds: string[];
   
  intent: 'close-tab' | 'close-window';
}

 
export interface SaveIssue {
  kind: 'missing' | 'utf16';
  tabId: string;
  path: string;
  name: string;
}

export interface NavLoc {
  path: string;
  line: number;
  col: number;
}

interface StoreState {
  
  activity: ActivityId;
  sidebarVisible: boolean;
  sidebarWidth: number;
  ramBytes: number;
  statusMessage: string;
  cursor: { line: number; col: number };

  
  workspace: string | null;
  recents: RecentEntry[];
  tabs: Tab[];
  activeTabId: string | null;
  untitledSeq: number;
  findOpen: boolean;
  confirm: ConfirmState | null;
   
  saveIssue: SaveIssue | null;

  
  terminalTabs: never[];
  ai: { model: string; messages: never[] };
  mcp: { enabled: boolean; running: boolean; port: number };

  settings: Settings;
  settingsLoaded: boolean;
   
  appInfo: AppInfo | null;
  updateBanner: { version: string; notes: string } | null;
  navBack: NavLoc[];
  navForward: NavLoc[];
  navSuppress: boolean;
  lastClosed: { path: string } | null;
   
  settingsOpen: boolean;
   
  activeTheme: string;
}

interface StoreActions {
  setActivity: (a: ActivityId) => void;
  toggleSidebar: () => void;
  setSidebarWidth: (w: number) => void;
  setRamBytes: (b: number) => void;
  setStatus: (m: string) => void;
  setCursor: (line: number, col: number) => void;
  setFindOpen: (open: boolean) => void;
   
  setSettingsOpen: (open: boolean) => void;
  setUpdateBanner: (b: { version: string; notes: string } | null) => void;
  setNavBack: (v: NavLoc[]) => void;
  setNavForward: (v: NavLoc[]) => void;
  setNavSuppress: (v: boolean) => void;
  setLastClosed: (v: { path: string } | null) => void;

  bootstrap: () => Promise<void>;
  openFolderDialog: () => Promise<void>;
  openWorkspace: (dir: string) => Promise<void>;
   
  syncWorkspaceLokal: (dir: string) => Promise<void>;
  closeWorkspace: () => Promise<void>;
  refreshRecents: () => Promise<void>;
  openFileDialog: () => Promise<void>;
  openPath: (path: string) => Promise<void>;
  newUntitled: () => void;

  setActiveTab: (id: string) => void;
  updateTabContent: (id: string, content: string) => void;
  saveTab: (id: string) => Promise<boolean>;
  saveTabAs: (id: string) => Promise<boolean>;
   
  requestCloseTab: (id: string) => void;
  forceCloseTab: (id: string) => void;
  reorderTab: (from: number, to: number) => void;

  
   
  openPathAt: (path: string, line: number, col?: number) => Promise<void>;
   
  renamePathInTabs: (from: string, to: string) => void;
   
  closeTabsUnder: (paths: string[]) => void;
   
  reloadTabFromDisk: (path: string) => Promise<void>;

   
  cycleTab: (delta: number) => void;

   
  ensureTabLoaded: (id: string) => Promise<void>;
   
  unloadColdTabs: () => void;

  resolveConfirm: (choice: 'save' | 'discard' | 'cancel') => Promise<void>;
  requestCloseWindow: () => boolean;

   
  setSaveIssue: (i: SaveIssue | null) => void;
  resolveSaveIssue: (choice: 'ok' | 'cancel') => Promise<void>;

  persistSession: () => Promise<void>;
  applySettings: (patch: Record<string, unknown>) => Promise<void>;
   
  reloadSettings: () => Promise<void>;
}

export type Store = StoreState & StoreActions;

let idSeq = 0;
const nextId = () => `t${++idSeq}`;

const baseName = (p: string) => p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || p;

 
let bootstrapStarted = false;

 
const opening = new Set<string>();

 
export const MAX_LOADED_TABS = 12;

 
export function maxLoadedTabs(): number {
  return useStore.getState().settings.general.lowRam ? 8 : MAX_LOADED_TABS;
}

 
const touchOrder: string[] = [];

function touchTab(id: string): void {
  const i = touchOrder.indexOf(id);
  if (i >= 0) touchOrder.splice(i, 1);
  touchOrder.push(id);
}

export const useStore = create<Store>((set, get) => ({
  activity: 'explorer',
  sidebarVisible: true,
  sidebarWidth: 260,
  ramBytes: 0,
  statusMessage: '',
  cursor: { line: 1, col: 1 },

  workspace: null,
  recents: [],
  tabs: [],
  activeTabId: null,
  untitledSeq: 0,
  findOpen: false,
  confirm: null,
  saveIssue: null,

  terminalTabs: [],
  ai: { model: 'gemini-3.6-flash', messages: [] },
  mcp: { enabled: false, running: false, port: 9222 },

  settings: DEFAULT_SETTINGS,
  settingsLoaded: false,
  appInfo: null,
  updateBanner: null,
  navBack: [],
  navForward: [],
  navSuppress: false,
  lastClosed: null,
  settingsOpen: false,
  activeTheme: 'zephyr-dark',

  
  setActivity: (a) => set({ activity: a }),
  toggleSidebar: () => set((s) => ({ sidebarVisible: !s.sidebarVisible })),
  setSidebarWidth: (w) => set({ sidebarWidth: Math.max(180, Math.min(600, w)) }),
  setRamBytes: (b) => set({ ramBytes: b }),
  setStatus: (m) => set({ statusMessage: m }),
  setCursor: (line, col) => set({ cursor: { line, col } }),
  setFindOpen: (open) => set({ findOpen: open }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setUpdateBanner: (b) => set({ updateBanner: b }),
  setNavBack: (v) => set({ navBack: v }),
  setNavForward: (v) => set({ navForward: v }),
  setNavSuppress: (v) => set({ navSuppress: v }),
  setLastClosed: (v) => set({ lastClosed: v }),

  
  bootstrap: async () => {
    
    if (bootstrapStarted) return;
    bootstrapStarted = true;

    try {
      const s = await cmd.getSettings();
      set({ settings: s, settingsLoaded: true });
      set({ activeTheme: applyTheme(s.general, s.theme) });
      retheme(); 
      terapkanA11y(s.accessibility); 
      reSrMode(); 
      
      
      
      if (s.panel) {
        const { usePanel } = await import('./panelStore');
        usePanel.getState().hydrate(s.panel.visibleTabs, s.panel.activeTab);
        if (typeof s.panel.height === 'number' && s.panel.height > 0) {
          const { useTerminal } = await import('./terminalStore');
          useTerminal.getState().setHeight(s.panel.height);
        }
      }
    } catch (e) {
      set({ settingsLoaded: true, statusMessage: cmd.asZephyrError(e).message });
    }

    
    try {
      const info = await cmd.getAppInfo();
      set({ appInfo: info });
      const upd = get().settings.update;
      if (upd && upd.lastSeenVersion && upd.lastSeenVersion !== info.version) {
        set({ updateBanner: { version: info.version, notes: upd.pendingNotes || '' } });
      }
      if (upd && upd.lastSeenVersion !== info.version) {
        await cmd
          .setSettings({
            update: { lastSeenVersion: info.version, pendingNotes: '' },
          })
          .catch(() => {});
        set({
          settings: {
            ...get().settings,
            update: { ...upd, lastSeenVersion: info.version, pendingNotes: '' },
          },
        });
      }
    } catch {
       
    }

    
    await get().refreshRecents();

    if (!get().settings.general.restoreSession) return;

    try {
      const saved = await cmd.sessionLoad();
      let restored = 0;
      set({ navSuppress: true });
      for (const t of saved) {
        try {
          await get().openPath(t.path);
          restored++;
        } catch {
          
        }
      }
      set({ navSuppress: false });
      const missing = saved.length - restored;
      if (restored > 0) {
        set({
          statusMessage:
            missing > 0
              ? `Restore ${restored} tab, ${missing} file tidak ditemukan`
              : `Restore ${restored} tab`,
        });
      }
    } catch {
       
    }
  },

  openFolderDialog: async () => {
    try {
      const dir = await cmd.folderDialogOpen();
      if (!dir) return;
      await get().openWorkspace(dir);
    } catch (e) {
      set({ statusMessage: cmd.asZephyrError(e).message });
    }
  },

   
  openWorkspace: async (dir) => {
    try {
      await cmd.workspaceOpen(dir);
      await get().syncWorkspaceLokal(dir);
    } catch (e) {
      set({ statusMessage: cmd.asZephyrError(e).message });
    }
  },

   
  syncWorkspaceLokal: async (dir) => {
    set({ workspace: dir, statusMessage: `Workspace: ${baseName(dir)}` });

    
    const { useExplorer } = await import('./explorerStore');
    const ex = useExplorer.getState();
    useExplorer.setState({ children: {}, expanded: {}, selected: [], anchor: null });
    await ex.loadDir(dir, true);
    try {
      await cmd.fsWatch(dir);
    } catch {
       
    }
    await get().refreshRecents();
  },

  closeWorkspace: async () => {
    try {
      await cmd.fsUnwatch();
      await cmd.workspaceClose();
    } catch {
       
    }
    const { useExplorer } = await import('./explorerStore');
    useExplorer.setState({ children: {}, expanded: {}, selected: [], anchor: null });
    set({ workspace: null, statusMessage: 'Workspace ditutup' });
    await get().refreshRecents();
  },

  refreshRecents: async () => {
    try {
      set({ recents: await cmd.listRecents() });
    } catch {
       
    }
  },

  openFileDialog: async () => {
    try {
      const picked = await cmd.fileDialogOpen(true);
      if (!picked || picked.length === 0) return;
      for (const p of picked) await get().openPath(p);
    } catch (e) {
      set({ statusMessage: cmd.asZephyrError(e).message });
    }
  },

  openPath: async (path) => {
    const s0 = get();
    if (!s0.navSuppress && s0.activeTabId) {
      const tabAktif = s0.tabs.find((t) => t.id === s0.activeTabId);
      if (tabAktif?.path && tabAktif.path !== path) {
        const loc: NavLoc = { path: tabAktif.path, line: s0.cursor.line, col: s0.cursor.col };
        set((st) => ({
          navBack: [...st.navBack.slice(-49), loc],
          navForward: [],
        }));
      }
    }
    const existing = get().tabs.find((t) => t.path && pathSama(t.path, path));
    if (existing) {
      set({ activeTabId: existing.id });
      
      
      const fokus = useLayout.getState().fokus;
      set((s) => ({
        tabs: s.tabs.map((t) => (t.id === existing.id ? { ...t, groupId: fokus } : t)),
      }));
      touchTab(existing.id);
      void get().ensureTabLoaded(existing.id);
      return;
    }
    
    const kunci = kunciPath(path);
    if (opening.has(kunci)) return;
    opening.add(kunci);

    try {
      const res = await cmd.fsRead(path);
      
      const again = get().tabs.find((t) => t.path && pathSama(t.path, path));
      if (again) {
        set({ activeTabId: again.id });
        return;
      }
      
      
      if (get().tabs.length === 0) useLayout.getState().reset();
      const tab: Tab = {
        id: nextId(),
        path,
        name: baseName(path),
        encoding: res.detectedEncoding,
        lineEnding: res.lineEnding,
        unsaved: false,
        content: res.content,
        lang: detectLang(path),
        loaded: true,
        readOnly: res.readOnly,
        note: res.note,
        bytes: res.bytes,
        existed: true,
        groupId: useLayout.getState().fokus,
      };
      set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }));
      touchTab(tab.id);
      
      get().unloadColdTabs();
      void get().persistSession();
    } finally {
      opening.delete(kunci);
    }
  },

  newUntitled: () => {
    const n = get().untitledSeq + 1;
    const tab: Tab = {
      id: nextId(),
      path: null,
      name: `untitled-${n}`,
      encoding: 'utf8' as Encoding,
      lineEnding: 'crlf' as LineEnding,
      unsaved: false,
      content: '',
      lang: 'plain',
      loaded: true,
      groupId: useLayout.getState().fokus,
    };
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id, untitledSeq: n }));
    touchTab(tab.id);
  },

  setActiveTab: (id) => {
    const s = get();
    const prev = s.tabs.find((t) => t.id === s.activeTabId);
    const next = s.tabs.find((t) => t.id === id);
    const prevPath = prev?.path ?? null;
    const nextPath = next?.path ?? null;
    if (!s.navSuppress && prevPath && nextPath && prevPath !== nextPath) {
      const loc: NavLoc = { path: prevPath, line: s.cursor.line, col: s.cursor.col };
      set((st) => ({
        navBack: [...st.navBack.slice(-49), loc],
        navForward: [],
      }));
    }
    set({ activeTabId: id });
    touchTab(id);
    
    
    const gid = get().tabs.find((t) => t.id === id)?.groupId;
    if (gid) useLayout.getState().fokusGroup(gid);
    
    void get().ensureTabLoaded(id);
  },

   
  ensureTabLoaded: async (id) => {
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab || tab.loaded !== false || !tab.path) return;
    try {
      const res = await cmd.fsRead(tab.path);
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === id
            ? {
                ...t,
                content: res.content,
                encoding: res.detectedEncoding,
                lineEnding: res.lineEnding,
                loaded: true,
                readOnly: res.readOnly,
                note: res.note,
                bytes: res.bytes,
                existed: true,
              }
            : t,
        ),
      }));
    } catch (e) {
      
      set({ statusMessage: cmd.asZephyrError(e).message });
    }
  },

   
  unloadColdTabs: () => {
    const { tabs, activeTabId } = get();
    const batas = maxLoadedTabs();
    const loaded = tabs.filter((t) => t.loaded !== false);
    if (loaded.length <= batas) return;

    const lepas = new Set<string>();
    let target = loaded.length - batas;
    for (const id of touchOrder) {
      if (target <= 0) break;
      if (id === activeTabId) continue;
      const t = tabs.find((x) => x.id === id);
      if (!t || t.loaded === false || !t.path || t.unsaved) continue;
      lepas.add(id);
      target--;
    }
    
    
    if (target > 0) {
      for (const t of tabs) {
        if (target <= 0) break;
        if (t.id === activeTabId || t.loaded === false || !t.path || t.unsaved) continue;
        if (lepas.has(t.id)) continue;
        lepas.add(t.id);
        target--;
      }
    }
    if (lepas.size === 0) return;

    set((s) => ({
      tabs: s.tabs.map((t) => (lepas.has(t.id) ? { ...t, content: '', loaded: false } : t)),
      statusMessage:
        s.tabs.length > batas
          ? `Tab terlalu banyak — ${lepas.size} tab dilepas dari memori (isi dibaca ulang saat dibuka)`
          : s.statusMessage,
    }));
  },

  updateTabContent: (id, content) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        
        
        
        
        t.id === id && t.loaded !== false && !t.readOnly
          ? { ...t, content, unsaved: t.content !== content ? true : t.unsaved }
          : t,
      ),
    })),

  saveTab: async (id) => {
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab) return false;
    if (!tab.path) return get().saveTabAs(id);
    
    
    if (tab.loaded === false) {
      await get().ensureTabLoaded(id);
      const again = get().tabs.find((t) => t.id === id);
      if (!again || again.loaded === false) {
        set({ statusMessage: 'Tab belum dimuat ulang — buka dulu sebelum menyimpan' });
        return false;
      }
    }
    const cur = get().tabs.find((t) => t.id === id) as Tab;
    
    
    if (cur.encoding === 'utf16le' || cur.encoding === 'utf16be') {
      set({
        saveIssue: {
          kind: 'utf16',
          tabId: id,
          path: cur.path as string,
          name: cur.name,
        },
      });
      return false;
    }
    try {
      
      
      
      
      
      
      window.dispatchEvent(
        new CustomEvent('zephyr-history-snapshot', {
          detail: { path: cur.path as string, reason: 'save' },
        }),
      );
      await cmd.fsWrite(cur.path as string, cur.content, cur.encoding, cur.lineEnding, {
        wasExisting: cur.existed === true,
      });
      set((s) => ({
        tabs: s.tabs.map((t) => (t.id === id ? { ...t, unsaved: false, existed: true } : t)),
        statusMessage: `Disimpan: ${cur.name}`,
      }));
      return true;
    } catch (e) {
      const err = cmd.asZephyrError(e);
      
      
      if (err.code === 'NotFound' && cur.existed) {
        set({
          saveIssue: {
            kind: 'missing',
            tabId: id,
            path: cur.path as string,
            name: cur.name,
          },
        });
        return false;
      }
      set({ statusMessage: `Gagal simpan: ${err.message}` });
      return false;
    }
  },

  saveTabAs: async (id) => {
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab) return false;
    try {
      const target = await cmd.fileDialogSave(tab.path ?? tab.name);
      if (!target) return false;
      
      
      const enc = tab.encoding === 'utf16le' || tab.encoding === 'utf16be' ? 'utf8' : tab.encoding;
      await cmd.fsWrite(target, tab.content, enc, tab.lineEnding);
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === id
            ? {
                ...t,
                path: target,
                name: baseName(target),
                unsaved: false,
                lang: detectLang(target),
                encoding: enc,
                readOnly: false,
                note: '',
                existed: true,
              }
            : t,
        ),
        statusMessage: `Disimpan: ${baseName(target)}`,
      }));
      void get().persistSession();
      return true;
    } catch (e) {
      set({ statusMessage: `Gagal simpan: ${cmd.asZephyrError(e).message}` });
      return false;
    }
  },

  requestCloseTab: (id) => {
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab) return;
    if (tab.unsaved) {
      set({ confirm: { tabIds: [id], intent: 'close-tab' } });
      return;
    }
    get().forceCloseTab(id);
  },

  forceCloseTab: (id) => {
    
    
    
    
    const tabTutup = get().tabs.find((t) => t.id === id);
    if (tabTutup?.path) {
      void import('./cliStore').then((m) => m.useCli.getState().lepasWait(tabTutup.path as string));
      set({ lastClosed: { path: tabTutup.path } });
    }
    set((s) => {
      const idx = s.tabs.findIndex((t) => t.id === id);
      const tabs = s.tabs.filter((t) => t.id !== id);
      let activeTabId = s.activeTabId;
      if (s.activeTabId === id) {
        const neighbour = tabs[Math.min(idx, tabs.length - 1)];
        activeTabId = neighbour ? neighbour.id : null;
      }
      
      
      const gid = s.tabs.find((t) => t.id === id)?.groupId;
      if (gid) useLayout.getState().setGroupTab(gid, null);
      
      
      
      if (tabs.length === 0) useLayout.getState().reset();
      return { tabs, activeTabId };
    });
    void get().persistSession();
  },

  reorderTab: (from, to) =>
    set((s) => {
      if (from === to || from < 0 || to < 0 || from >= s.tabs.length || to >= s.tabs.length) {
        return {};
      }
      const tabs = [...s.tabs];
      const [moved] = tabs.splice(from, 1);
      tabs.splice(to, 0, moved);
      return { tabs };
    }),

  

  openPathAt: async (path, line, col = 1) => {
    await get().openPath(path);
    
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    revealPosition(line, col);
  },

  renamePathInTabs: (from, to) => {
    const fromNorm = from.replace(/[\\/]+$/, '');
    const prefix = `${fromNorm.toLowerCase()}\\`;
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (!t.path) return t;
        const lower = t.path.toLowerCase();
        if (lower === fromNorm.toLowerCase()) {
          return { ...t, path: to, name: baseName(to), lang: detectLang(to) };
        }
        if (lower.startsWith(prefix)) {
          const suffix = t.path.slice(fromNorm.length);
          const next = `${to}${suffix}`;
          return { ...t, path: next, name: baseName(next), lang: detectLang(next) };
        }
        return t;
      }),
    }));
    void get().persistSession();
  },

  closeTabsUnder: (paths) => {
    const targets = paths.map((p) => p.replace(/[\\/]+$/, '').toLowerCase());
    const doomed = get()
      .tabs.filter((t) => {
        if (!t.path) return false;
        const lower = t.path.toLowerCase();
        return targets.some((x) => lower === x || lower.startsWith(`${x}\\`));
      })
      .map((t) => t.id);
    for (const id of doomed) get().forceCloseTab(id);
  },

   
  cycleTab: (delta) => {
    const { tabs, activeTabId } = get();
    if (tabs.length < 2) return;
    const i = tabs.findIndex((t) => t.id === activeTabId);
    const next = (((i < 0 ? 0 : i) + delta) % tabs.length + tabs.length) % tabs.length;
    get().setActiveTab(tabs[next].id);
  },

  reloadTabFromDisk: async (path) => {
    const tab = get().tabs.find((t) => t.path?.toLowerCase() === path.toLowerCase());
    if (!tab) return;
    try {
      const res = await cmd.fsRead(tab.path as string);
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === tab.id
            ? {
                ...t,
                content: res.content,
                encoding: res.detectedEncoding,
                lineEnding: res.lineEnding,
                unsaved: false,
                readOnly: res.readOnly,
                note: res.note,
                bytes: res.bytes,
                existed: true,
              }
            : t,
        ),
      }));
    } catch (e) {
      set({ statusMessage: cmd.asZephyrError(e).message });
    }
  },

  resolveConfirm: async (choice) => {
    const c = get().confirm;
    if (!c) return;

    if (choice === 'cancel') {
      set({ confirm: null });
      return;
    }

    const [current, ...rest] = c.tabIds;
    if (choice === 'save') {
      const ok = await get().saveTab(current);
      if (!ok) {
        set({ confirm: null }); 
        return;
      }
    }
    get().forceCloseTab(current);

    if (rest.length > 0) {
      set({ confirm: { tabIds: rest, intent: c.intent } });
      return;
    }

    set({ confirm: null });
    if (c.intent === 'close-window') {
      await getCurrentWindow().destroy();
    }
  },

   
  requestCloseWindow: () => {
    const dirty = get().tabs.filter((t) => t.unsaved);
    if (dirty.length === 0) return true;
    set({ confirm: { tabIds: dirty.map((t) => t.id), intent: 'close-window' } });
    return false;
  },

  setSaveIssue: (i) => set({ saveIssue: i }),

   
  resolveSaveIssue: async (choice) => {
    const issue = get().saveIssue;
    if (!issue) return;
    set({ saveIssue: null });
    if (choice === 'cancel') {
      set({ statusMessage: 'Simpan dibatalkan' });
      return;
    }
    const tab = get().tabs.find((t) => t.id === issue.tabId);
    if (!tab || !tab.path) return;
    try {
      if (issue.kind === 'utf16') {
        await cmd.fsWrite(tab.path, tab.content, 'utf8', tab.lineEnding, { allowMissing: true });
        set((s) => ({
          tabs: s.tabs.map((t) =>
            t.id === issue.tabId
              ? { ...t, unsaved: false, encoding: 'utf8', readOnly: false, note: '', existed: true }
              : t,
          ),
          statusMessage: `Disimpan sebagai UTF-8: ${tab.name}`,
        }));
      } else {
        await cmd.fsWrite(tab.path, tab.content, tab.encoding, tab.lineEnding, {
          allowMissing: true,
        });
        set((s) => ({
          tabs: s.tabs.map((t) =>
            t.id === issue.tabId ? { ...t, unsaved: false, existed: true } : t,
          ),
          statusMessage: `Dibuat ulang: ${tab.name}`,
        }));
      }
    } catch (e) {
      set({ statusMessage: `Gagal simpan: ${cmd.asZephyrError(e).message}` });
    }
  },

  persistSession: async () => {
    try {
      const tabs = get()
        .tabs.filter((t) => t.path)
        .map((t) => ({ path: t.path as string, encoding: t.encoding }));
      await cmd.sessionSave(tabs);
    } catch {
       
    }
  },

  applySettings: async (patch) => {
    try {
      await cmd.setSettings(patch);
      const s = await cmd.getSettings();
      set({ settings: s });
      
      set({ activeTheme: applyTheme(s.general, s.theme) });
      retheme(); 
      terapkanA11y(s.accessibility); 
      reSrMode(); 
    } catch (e) {
      set({ statusMessage: cmd.asZephyrError(e).message });
    }
  },

  reloadSettings: async () => {
    try {
      const s = await cmd.getSettings();
      set({ settings: s });
      set({ activeTheme: applyTheme(s.general, s.theme) });
      retheme(); 
      terapkanA11y(s.accessibility); 
      reSrMode(); 
    } catch (e) {
      set({ statusMessage: cmd.asZephyrError(e).message });
    }
  },
}));

 
export const useActiveTab = (): Tab | null => {
  const id = useStore((s) => s.activeTabId);
  const tabs = useStore((s) => s.tabs);
  return tabs.find((t) => t.id === id) ?? null;
};
