import { create } from 'zustand';
import { getCurrentWindow } from '@tauri-apps/api/window';
import * as cmd from './commands';
import { detectLang } from './lang';
import { kunciPath, pathSama } from './pathKey';
import { revealPosition } from './editorRegistry';
import { applyTheme } from './themes';
import { catatanUntukBahasa } from './i18n';

import { terapkanA11y } from './a11yStore';
import { retheme, reSrMode } from './xtermRegistry';

import { useLayout } from './editorLayoutStore';
import { useExplorer } from './explorerStore';
import { usePanel } from './panelStore';
import { useTerminal } from './terminalStore';
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

  /**
   * Which tab the Tools view should show. Another part of the app sets this
   * when it wants a specific tool opened (the palette's "Run tests" command,
   * the Dev Environment's own "open settings" link); the Tools view reads it
   * once and clears it back to null.
   */
  toolsTab: string | null;
  setToolsTab: (v: string | null) => void;

  aiWidth: number;

  aiMax: boolean;

  /* Whether the right-hand AI column is shown. Lets the ActivityBar icon toggle
     it without changing the saved `aiPanel` position. */
  aiKolomVisible: boolean;

  sidebarHeight: number;
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

  settings: Settings;
  settingsLoaded: boolean;

  appInfo: AppInfo | null;
  updateBanner: { version: string; notes: string } | null;

  donateOpen: boolean;
  navBack: NavLoc[];
  navForward: NavLoc[];
  navSuppress: boolean;
  lastClosed: { path: string } | null;

  settingsOpen: boolean;

  /*
   * Dua permukaan yang dulu memakai seluruh area editor kini melayang:
   * Extensions dan Dev Tools. Flag-nya terpisah dari `settingsOpen` karena
   * ketiganya bisa dibuka dari rail yang sama dan tidak boleh saling
   * menutup tanpa perintah.
   */
  extensionsOpen: boolean;
  toolsOpen: boolean;

  activeTheme: string;
}

interface StoreActions {
  setActivity: (a: ActivityId) => void;
  toggleSidebar: () => void;
  setSidebarVisible: (v: boolean) => void;
  setSidebarWidth: (w: number) => void;

  setAiWidth: (w: number) => void;

  setAiMax: (v: boolean) => void;
  setAiKolomVisible: (v: boolean) => void;
  toggleAiKolom: () => void;
  setSidebarHeight: (h: number) => void;
  setRamBytes: (b: number) => void;
  setStatus: (m: string) => void;
  setCursor: (line: number, col: number) => void;
  setFindOpen: (open: boolean) => void;

  setSettingsOpen: (open: boolean) => void;
  setExtensionsOpen: (open: boolean) => void;
  setToolsOpen: (open: boolean) => void;
  setUpdateBanner: (b: { version: string; notes: string } | null) => void;
  setDonateOpen: (v: boolean) => void;
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
  openPath: (
    path: string,
    /**
     * `preview: false` opens a permanent tab. Omit it for the browsing default
     * — see the note on the implementation for why the default is preview.
     */
    opts?: { preview?: boolean },
  ) => Promise<void>;

  /** Retire every preview tab except `kecuali`. */
  tutupPreviewLama: (kecuali?: string) => void;

  /** Pin or unpin a tab; pinning also clears the preview flag. */
  togglePin: (id: string) => void;

  /** Make a preview tab permanent (double-click). */
  promoteTab: (id: string) => void;
  newUntitled: () => void;

  /*
   * Open one of the AI views as an editor tab, or bring its tab forward if it
   * is already open. Same shape as VSCode's "Move Chat into Editor Area": there
   * is at most ONE chat tab and ONE Chat Settings tab, so pressing the button
   * twice focuses rather than stacking duplicates.
   */
  bukaViewAi: (view: 'ai-chat' | 'chat-settings' | 'search-editor' | 'extensions' | 'tools') => void;

  setActiveTab: (id: string) => void;
  updateTabContent: (id: string, content: string) => void;
  saveTab: (id: string) => Promise<boolean>;
  saveTabAs: (id: string) => Promise<boolean>;

  formatTab: (id: string) => Promise<number>;

  /**
   * Apply the language server's "fix all" action to one buffer.
   *
   * `diterapkan` is the number of edits written into the buffer; `ditawarkan`
   * is how many actions the server returned. They are reported separately
   * because "the server offered nothing" and "the server offered a fix that
   * changed nothing" are different facts, and a caller deciding whether to say
   * anything needs to tell them apart.
   */
  fixAllTab: (id: string) => Promise<{ diterapkan: number; ditawarkan: number; lain: string[] }>;

  requestCloseTab: (id: string) => void;
  forceCloseTab: (id: string) => void;
  reorderTab: (from: number, to: number) => void;

  openPathAt: (
    path: string,
    line: number,
    col?: number,
    /** `preview: true` for a browse-to-line; default pins. */
    opts?: { preview?: boolean },
  ) => Promise<void>;

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

  izinPerintah: (command: string) => boolean;
  applySettings: (patch: Record<string, unknown>) => Promise<void>;
  applyLayout: (mode: 'default' | 'focus' | 'term' | 'quad', opsi?: { sidebar?: boolean; panel?: boolean }) => Promise<void>;
  reloadSettings: () => Promise<void>;
}

export type Store = StoreState & StoreActions;

let idSeq = 0;
const nextId = () => `t${++idSeq}`;

const baseName = (p: string) => p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || p;

/**
 * The in-flight `bootstrap()`.
 *
 * A caller that arrives while a load is already running must AWAIT that load,
 * not return immediately. Returning early is what broke the "Open in Agents"
 * window: its root called `bootstrap()`, a second caller had already claimed
 * the flag, the call returned in 1ms having done nothing, and the window
 * rendered with `settingsLoaded: false` and no workspace — so the Changes and
 * Files columns were empty while every other part of the UI looked fine.
 */
let bootstrapBerjalan: Promise<void> | null = null;

/**
 * Fills in settings keys that a file from an older version does not have, and
 * repairs the `general.layout` collision.
 *
 * Why this is needed at all: `deep_merge` on the Rust side MERGES. It never
 * fills a missing key from the Rust defaults, so a new setting added in a later
 * version stays ABSENT on an upgraded install until the user happens to change
 * it. The UI then reads `undefined` where it expects a boolean, and a switch
 * that should default to ON shows as off - the screen quietly misrepresents the
 * app's real behaviour.
 *
 * Two jobs here, and only these two:
 *
 * 1. DEFAULT THE NEW KEYS, matching `settings.rs` exactly. If these two ever
 *    disagree, the file and the screen disagree, which is worse than either.
 *
 * 2. REPAIR `general.layout`. An older build wrote the layout-preferences OBJECT
 *    to this key, and the type is `'editor' | 'terminal'`, read by `App.tsx` as
 *    `=== 'terminal'`. An object there makes that comparison permanently false.
 *    The object is moved to `layoutPrefs` and the key set back to a valid
 *    string, so anyone who hit that bug is fixed by upgrading rather than left
 *    stuck with a key that can never compare true again.
 *
 * Deliberately NOT a general-purpose schema validator: it touches only what is
 * known to be wrong, so it cannot silently rewrite a setting someone chose.
 */
function normalisasiSettings<T>(s: T): T {
  const root = s as Record<string, unknown>;
  const g = (root.general ?? {}) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};

  if (typeof g.confirmExit !== 'boolean') patch.confirmExit = true;
  if (typeof g.minimizeToTray !== 'boolean') patch.minimizeToTray = false;
  if (typeof g.defaultTerminal !== 'string') patch.defaultTerminal = 'default';
  if (typeof g.shellPath !== 'string') patch.shellPath = '';
  if (typeof g.chatAvatar !== 'boolean') patch.chatAvatar = true;
  if (typeof g.userAvatarPath !== 'string') patch.userAvatarPath = '';

  /* The legacy bottom-dock AI home is retired: the user never wants the chat to
     collapse into the terminal panel again. Any saved `bottom` is rewritten to
     the right column so an old profile cannot reopen in that mode. */
  if (g.aiPanel === 'bottom') patch.aiPanel = 'right';

  if (g.layout !== undefined && typeof g.layout === 'object' && g.layout !== null) {
    const lama = g.layout as Record<string, unknown>;
    /* `layoutPrefs` wins if it already exists: it is the newer home and was
       written by a build that had already stopped clobbering. */
    patch.layoutPrefs = g.layoutPrefs ?? lama;
    /* Back to a valid string. 'editor' rather than 'terminal' because the
       terminal-first layout is the special case, and restoring it for someone
       who never chose it would move their window on upgrade. */
    patch.layout = 'editor';
  }

  if (!Object.keys(patch).length) return s;
  return { ...root, general: { ...g, ...patch } } as T;
}

const opening = new Set<string>();

/*
 * Settings disk-write coalescing. See `applySettings` for why this exists.
 *
 * 350ms is chosen against human typing: long enough that a burst of keystrokes
 * becomes one write, short enough that a user who changes one control and
 * immediately closes the window has almost certainly had it land. `beforeunload`
 * in `flushSetelanTerakhir` covers the rest.
 */
const TUNDA_SETELAN_MS = 350;
let timerSetelan: ReturnType<typeof setTimeout> | null = null;
let gabungTertunda: Record<string, unknown> = {};
/* Tail of the serialisation chain: the next write waits for this. */
let antrianTulis: Promise<void> = Promise.resolve();

async function flushSetelan(): Promise<void> {
  if (timerSetelan) {
    clearTimeout(timerSetelan);
    timerSetelan = null;
  }
  const patch = gabungTertunda;
  if (!Object.keys(patch).length) return;
  gabungTertunda = {};

  /*
   * `catch` on the CALLER, not inside the queued function: without it a failed
   * write rejects `antrianTulis` and every later write chains onto a rejected
   * promise, so one error stops settings from ever saving again for the rest of
   * the session.
   */
  antrianTulis = antrianTulis.then(async () => {
    await cmd.setSettings(patch);
    const s = await cmd.getSettings();
    useStore.setState({ settings: normalisasiSettings(s) });

    useStore.setState({ activeTheme: applyTheme(s.general, s.theme, s.background) });
    retheme();
    terapkanA11y(s.accessibility);
    reSrMode();
    /*
     * The AI panel keeps its own copy of the provider, so changes to "Active
     * model" must be forwarded - otherwise the new choice only applies after a
     * restart. Dynamic import: aiStore imports the store at module level, so
     * calling it directly here would create a cycle.
     */
    void import('./aiStore')
      .then((m) => m.useAi.getState().sinkronProvider())
      .catch(() => {
        /* non-fatal: the selection is still saved in settings */
      });
  });
  return antrianTulis;
}

/**
 * Flush any pending settings write NOW.
 *
 * Called before the window closes. Without it a change made in the last 350ms
 * is held in memory only, and the process dies with it - the user sees their
 * setting revert on the next launch, with nothing to explain it.
 */
export function flushSetelanTerakhir(): Promise<void> {
  return flushSetelan();
}

/*
 * Cross-window settings sync.
 *
 * Every panel (Settings, Extensions, Tools, AI Models, Chat Settings, Agent
 * Customizations) now lives in its OWN OS window, which means its own WebView
 * and its own copy of every zustand store. Both copies write the same
 * `settings.json` through the Rust side, so the FILE is always consistent - but
 * the editor window's in-memory copy is not, and a theme or language changed in
 * the Settings window would not repaint the editor until it was restarted.
 *
 * The Rust side already emits `settings-changed` after every write
 * (`settings.rs`, `patch_settings`); nothing was listening. This is that
 * listener. It is bound once per window, guarded in module scope for the same
 * reason the event bindings in App.tsx are: React StrictMode mounts the root
 * twice, and an unguarded `listen()` leaves a second handler behind that the
 * cleanup of the first mount can no longer reach.
 *
 * THE RELOAD IS DEBOUNCED, and deliberately so: `flushSetelan` writes a burst of
 * keystrokes as one patch, but a slider drag still produces several writes in a
 * row, and each one would otherwise trigger a full `getSettings()` round trip
 * plus a theme re-apply. 120ms is under the perceptible threshold for "the
 * other window caught up" and long enough to collapse a drag.
 */
let sinkronSetelanTerpasang = false;
let timerSinkronSetelan: ReturnType<typeof setTimeout> | null = null;

export function pasangSinkronSetelan(): void {
  if (sinkronSetelanTerpasang) return;
  sinkronSetelanTerpasang = true;

  void import('./events')
    .then((m) =>
      m.onSettingsChanged(() => {
        if (timerSinkronSetelan) clearTimeout(timerSinkronSetelan);
        timerSinkronSetelan = setTimeout(() => {
          timerSinkronSetelan = null;
          void useStore.getState().reloadSettings();
        }, 120);
      }),
    )
    .catch(() => {
      /* Non-Tauri origin (browser harness): there is no event bus to bind. The
         flag stays set, because retrying on every mount would just fail again. */
    });
}

export const MAX_LOADED_TABS = 12;

export function maxLoadedTabs(): number {
  // RAM-saver mode: keep only 3 tabs' content in memory (down from 12).
  return useStore.getState().settings.general.lowRam ? 3 : MAX_LOADED_TABS;
}

const touchOrder: string[] = [];

function touchTab(id: string): void {
  const i = touchOrder.indexOf(id);
  if (i >= 0) touchOrder.splice(i, 1);
  touchOrder.push(id);
}

// Setiap tab yang ditutup WAJIB lewat sini: tanpa ini `touchOrder` tumbuh selamanya
// karena id yang sudah mati tidak pernah dibuang.
function lupakanTab(id: string): void {
  const i = touchOrder.indexOf(id);
  if (i >= 0) touchOrder.splice(i, 1);
}

/*
 * Timer auto save, satu per tab.
 *
 * Disimpan di Map dan bukan di state: nilainya tidak pernah dirender, dan
 * menaruhnya di state berarti setiap ketikan memicu render baru. Kuncinya id
 * tab supaya tab yang berbeda punya jeda masing-masing, dan tab yang ditutup
 * bisa membatalkan timernya sendiri.
 */
const autoSaveTimers = new Map<string, number>();

function batalAutoSave(id: string): void {
  const t = autoSaveTimers.get(id);
  if (t !== undefined) {
    window.clearTimeout(t);
    autoSaveTimers.delete(id);
  }
}

/*
 * Tab ini boleh disimpan otomatis atau tidak.
 *
 * Read-only dan untitled sengaja dikecualikan: read-only adalah file yang
 * memang tidak boleh ditulisi, dan tab tanpa path akan membuka dialog "save
 * as" - dialog yang muncul sendiri tanpa user memintanya jauh lebih
 * mengganggu daripada manfaat auto save-nya.
 */
function bisaAutoSave(t: Tab | undefined): t is Tab {
  return !!t && t.readOnly !== true && !!t.path && t.loaded !== false;
}

/*
 * Jadwalkan auto save untuk SATU tab.
 *
 * Dipanggil setiap kali tab ditandai dirty, jadi timer lama selalu dibatalkan
 * lebih dulu - itu yang membuat jeda benar-benar dihitung dari perubahan
 * TERAKHIR, bukan dari yang pertama.
 */
function jadwalkanAutoSave(id: string): void {
  batalAutoSave(id);
  const editor = useStore.getState().settings.editor;
  if (editor.autoSave !== 'afterDelay') return;
  const delay = Math.max(200, editor.autoSaveDelay || 1000);
  autoSaveTimers.set(
    id,
    window.setTimeout(() => {
      autoSaveTimers.delete(id);
      const tab = useStore.getState().tabs.find((t) => t.id === id);
      if (!bisaAutoSave(tab) || !tab.unsaved) return;
      // Lewat saveTab, bukan fsWrite langsung: format on save, snapshot
      // riwayat, dan penanganan error semuanya hidup di jalur itu.
      void useStore.getState().saveTab(id);
    }, delay),
  );
}

/*
 * Simpan semua tab yang masih kotor - jalur `onFocusChange`.
 *
 * Dipanggil saat jendela kehilangan fokus atau disembunyikan, jadi ditunda ke
 * microtask berikutnya agar pemanggilnya (event handler) tidak menunggu I/O.
 */
function simpanSemuaKotor(): void {
  const { tabs } = useStore.getState();
  for (const t of tabs) {
    if (!t.unsaved) continue;
    if (!bisaAutoSave(t)) continue;
    void useStore.getState().saveTab(t.id);
  }
}

/** Dipakai main.tsx / App: pasang listener blur+visibilitychange sekali saja. */
export function pasangAutoSaveFokus(): () => void {
  const onBlur = () => {
    if (useStore.getState().settings.editor.autoSave === 'onFocusChange') simpanSemuaKotor();
  };
  const onVisible = () => {
    if (document.visibilityState !== 'hidden') return;
    if (useStore.getState().settings.editor.autoSave === 'onFocusChange') simpanSemuaKotor();
  };
  window.addEventListener('blur', onBlur);
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    window.removeEventListener('blur', onBlur);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

function mergeDalam(base: unknown, patch: unknown): unknown {
  if (
    base !== null && typeof base === 'object' && !Array.isArray(base) &&
    patch !== null && typeof patch === 'object' && !Array.isArray(patch)
  ) {
    const hasil: Record<string, unknown> = { ...(base as Record<string, unknown>) };
    for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
      if (v === null) { delete hasil[k]; continue; }
      hasil[k] = k in hasil ? mergeDalam(hasil[k], v) : v;
    }
    return hasil;
  }
  return patch;
}

export const useStore = create<Store>((set, get) => ({
  activity: 'explorer',
  sidebarVisible: true,
  sidebarWidth: 260,
  toolsTab: null,
  aiWidth: 480,
  aiMax: false,
  aiKolomVisible: true,
  sidebarHeight: 200,
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
  ai: { model: '', messages: [] },

  settings: DEFAULT_SETTINGS,
  settingsLoaded: false,
  appInfo: null,
  updateBanner: null,
  donateOpen: false,
  navBack: [],
  navForward: [],
  navSuppress: false,
  lastClosed: null,
  settingsOpen: false,
  extensionsOpen: false,
  toolsOpen: false,
  activeTheme: 'zephyr-dark',

  /*
   * `'settings'` is not a side-bar activity any more, and it is not a popup
   * either - it is its own window.
   *
   * Ten call sites across the app ask for it (`setActivity('settings')` from
   * the command palette, the MCP panel, Dev Environment, the agent's window
   * tools...). Making every one of them remember to open a window was a bug
   * waiting to happen: the activity would switch, the side bar would go blank,
   * and nothing would open. Opening it HERE keeps all of them working without
   * touching any of them.
   *
   * The popup flags are cleared rather than set. They still exist in the store
   * because saved state and older call sites reference them, but nothing renders
   * them any more - leaving one true would be a flag that lies about the screen.
   */
  setActivity: (a) => {
    if (a === 'settings') {
      set({ activity: a, settingsOpen: false, extensionsOpen: false, toolsOpen: false });
      /* Dynamic import: `bukaPanel` imports this module, so a static import
         here would close the cycle store -> bukaPanel -> store. */
      void import('./bukaPanel').then((m) => m.bukaPanel('settings'));
      return;
    }
    set({ activity: a });
  },
  setToolsTab: (v) => set({ toolsTab: v }),
  toggleSidebar: () => set((s) => ({ sidebarVisible: !s.sidebarVisible })),
  setSidebarVisible: (v) => set({ sidebarVisible: v }),
  setSidebarWidth: (w) => set({ sidebarWidth: Math.max(180, Math.min(600, w)) }),

  setAiWidth: (w) => set({ aiWidth: Math.max(320, Math.min(1000, w)) }),
  setAiMax: (v) => set({ aiMax: v }),
  setAiKolomVisible: (v) => set({ aiKolomVisible: v }),
  toggleAiKolom: () => set((s) => ({ aiKolomVisible: !s.aiKolomVisible })),
  setSidebarHeight: (h) => set({ sidebarHeight: Math.max(120, Math.min(480, h)) }),
  setRamBytes: (b) => set({ ramBytes: b }),
  setStatus: (m) => set({ statusMessage: m }),
  setCursor: (line, col) => set({ cursor: { line, col } }),
  setFindOpen: (open) => set({ findOpen: open }),
  /*
   * The three popup flags are now DEAD, and these setters keep their names only
   * because a dozen call sites still use them.
   *
   * Passing `true` opens the panel's WINDOW; passing `false` just clears the
   * flag. That way no legacy caller can end up doing nothing - which is the
   * failure mode of a renamed API: the door compiles, the reader presses it, and
   * nothing happens.
   *
   * The flags themselves are always false. They stay in the store because saved
   * state and older code reference them, but nothing renders them; a `true` here
   * would be a flag that lies about the screen, and if anything ever rendered it
   * again the reader would get the popup AND the window ("ada 2").
   */
  setSettingsOpen: (open) => {
    set((s) => ({
      settingsOpen: false,
      extensionsOpen: false,
      toolsOpen: false,
      activity: open ? 'settings' : s.activity === 'settings' ? 'explorer' : s.activity,
    }));
    if (open) void import('./bukaPanel').then((m) => m.bukaPanel('settings'));
  },
  setExtensionsOpen: (open) => {
    set({ extensionsOpen: false, settingsOpen: false, toolsOpen: false });
    if (open) void import('./bukaPanel').then((m) => m.bukaPanel('extensions'));
  },
  setToolsOpen: (open) => {
    set({ toolsOpen: false, settingsOpen: false, extensionsOpen: false });
    if (open) void import('./bukaPanel').then((m) => m.bukaPanel('tools'));
  },
  setUpdateBanner: (b) => set({ updateBanner: b }),
  setDonateOpen: (v) => set({ donateOpen: v }),
  setNavBack: (v) => set({ navBack: v }),
  setNavForward: (v) => set({ navForward: v }),
  setNavSuppress: (v) => set({ navSuppress: v }),
  setLastClosed: (v) => set({ lastClosed: v }),

  bootstrap: async () => {

    /*
     * A second caller AWAITS the first load instead of returning instantly.
     *
     * React StrictMode mounts the root twice, and a pop-out window's root and
     * its lazy children can both reach for settings. With a bare `return`, the
     * loser of that race resolved immediately — before any settings existed —
     * and whatever it was about to do with them ran against an empty store.
     * Handing back the in-flight promise makes every caller wait for the same
     * result.
     *
     * The flag is also released on failure so a transient IPC failure (common
     * right after a window is created) can be retried rather than locking the
     * window out of settings forever.
     */
    if (bootstrapBerjalan) return bootstrapBerjalan;

    bootstrapBerjalan = (async () => {
    try {
      const s = await cmd.getSettings();
      set({ settings: normalisasiSettings(s), settingsLoaded: true });
      void import('./aiStore').then((m) => m.useAi.getState().sinkronProvider());
      set({ activeTheme: applyTheme(s.general, s.theme, s.background) });
      retheme();
      terapkanA11y(s.accessibility);
      reSrMode();

      if (s.panel) {

        usePanel.getState().hydrate(s.panel.visibleTabs, s.panel.activeTab);
        if (typeof s.panel.height === 'number' && s.panel.height > 0) {

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
        set({
          updateBanner: {
            version: info.version,
            notes: catatanUntukBahasa(upd.pendingNotes, get().settings.general.uiLang),
          },
        });
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

      /*
       * The folder first, so the restored files open INTO it.
       *
       * Opening a tab before the workspace exists leaves `workspace` null while
       * the file loads, and everything that keys off the workspace — the
       * explorer root, the git status, the agent's project context — settles on
       * "no folder". Doing it in this order means the first restored tab is
       * already in the right project.
       */
      if (saved.workspace) await get().openWorkspace(saved.workspace);

      let restored = 0;
      set({ navSuppress: true });
      for (const t of saved.tabs) {
        try {
          /* Restoring is not browsing: every file the reader had open comes
             back as a real tab, never as a preview slot that a later click
             could replace. `pinned` is carried over so a tab the reader had
             fixed in place is still fixed after a restart. */
          await get().openPath(t.path, { preview: false });
          if (t.pinned) {
            const tab = get().tabs.find((x) => x.path && pathSama(x.path, t.path));
            if (tab) set((s) => ({ tabs: s.tabs.map((x) => (x.id === tab.id ? { ...x, pinned: true } : x)) }));
          }
          restored++;
        } catch {

        }
      }
      set({ navSuppress: false });
      const missing = saved.tabs.length - restored;
      if (restored > 0) {
        set({
          statusMessage:
            missing > 0
              ? `Restore ${restored} tab, ${missing} files not found`
              : `Restore ${restored} tab`,
        });
      }
    } catch {

    }
    })().finally(() => {
      /* Cleared so a later caller after a FAILURE can try again; on success the
         store already reports `settingsLoaded`, which is what callers check. */
      bootstrapBerjalan = null;
    });

    return bootstrapBerjalan;
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
    set({ workspace: dir, statusMessage: `Workspace: ${baseName(dir)}` });    /*
     * Drop the Quick Open index. The new root alone would invalidate it, but
     * clearing here means the very next Ctrl+P cannot answer for the previous
     * tree even for an instant — which is exactly when a reader would notice.
     */
    void cmd.clearWorkspaceFileIndex().catch(() => {});

    void import('./aiStore').then((m) => m.resetKonteksAgent());
    /*
     * Move the chat surfaces to THIS folder's conversation.
     *
     * Reported bug, verbatim: "buka folder Zephyr, ganti ke ZephyrDesktop, tapi
     * sesi dari Zephyr pindah ke ZephyrDesktop". Switching folders changed
     * `workspace` but never touched `activeId`, so the open conversation kept
     * belonging to the old project while the title bar and the list header named
     * the new one. From the reader's side the session looked MOVED, and the
     * transcript on screen was another project's history.
     *
     * `ikutiWorkspace` picks this folder's newest session (or starts a fresh,
     * correctly-stamped chat) and points every surface at it.
     */
    void import('./aiStore').then((m) => m.useAi.getState().ikutiWorkspace(dir));
    void import('./systemPrompt').then((m) => m.resetAturanProyek());
    void import('./projectContext').then((m) => m.resetRingkasanProyek());


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

    useExplorer.setState({ children: {}, expanded: {}, selected: [], anchor: null });
    set({ workspace: null, statusMessage: 'Workspace closed' });
    /* Same reason as opening one: no workspace means no index, and leaving the
       old one in place would let Ctrl+P answer for a tree nobody has open. */
    void cmd.clearWorkspaceFileIndex().catch(() => {});
    void import('./aiStore').then((m) => m.resetKonteksAgent());
    void import('./systemPrompt').then((m) => m.resetAturanProyek());
    void import('./projectContext').then((m) => m.resetRingkasanProyek());
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
      /* Deliberate: the reader chose these in a dialog, so none of them is a
         preview. A preview slot would let the next tree click replace the file
         they just went and picked. */
      for (const p of picked) await get().openPath(p, { preview: false });
    } catch (e) {
      set({ statusMessage: cmd.asZephyrError(e).message });
    }
  },

  openPath: async (path, opts) => {
    /*
     * Default for `preview` is TRUE, and that is deliberate.
     *
     * The feature only works if browsing is the default and committing is the
     * exception. The other way round — every caller opting in — would need
     * every tree, search hit, go-to-definition and debugger jump to remember
     * to ask, and the first one that forgot would silently return the tab
     * herd. Callers that know the open is deliberate (a file dialog, a drop,
     * a CLI request) pass `{ preview: false }`, and there are few of those.
     *
     * A preview never replaces a tab that is dirty, pinned, or read-only, nor
     * one for the same path — those are handled before this point.
     */
    const preview = opts?.preview !== false;

    /*
     * Promote a preview tab that an already-open file is occupying.
     *
     * Only a deliberate open (preview: false) asks for this; a preview open
     * keeps the slot evictable on purpose, which is what makes browsing cheap.
     */
    const promoteKalauDiminta = (id: string) => {
      if (opts?.preview === false) get().promoteTab(id);
    };

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

      /*
       * A deliberate open must ALSO promote a preview that is already sitting
       * there, and this is the common case rather than a corner: the single
       * click that shows a file previews it, and the double click that follows
       * finds that file already open, landing right here. Without the promote,
       * the user's second, deliberate click would do nothing visible and the
       * tab would stay evictable — replaced by the next file they merely glance
       * at, and gone from the strip after the next restart, since previews are
       * not persisted. `preview: false` means "keep this open"; honour it.
       */
      promoteKalauDiminta(existing.id);

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
        // Same rule as the pre-read branch above: a request to keep the file
        // open must not be lost just because someone else won the race to add it.
        promoteKalauDiminta(again.id);
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
        preview,
      };
      set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }));
      touchTab(tab.id);

      /*
       * After inserting, collapse any earlier preview.
       *
       * Done here rather than before the read so the replacement happens in
       * one visible step: the reader sees the old preview swapped for the new
       * file, not an empty slot followed by a new tab. Only a tab that is
       * still a preview, still clean and still unpinned is removed — anything
       * else has become a real tab and must stay.
       */
      if (preview) get().tutupPreviewLama(tab.id);

      get().unloadColdTabs();
      void get().persistSession();
    } finally {
      opening.delete(kunci);
    }
  },

  /**
   * Drop every preview tab except `kecuali`.
   *
   * Isolated as its own action because two callers need it: opening a new
   * preview, and pinning the current one (which must first retire any OTHER
   * stale preview so the strip keeps exactly one). Sharing one implementation
   * means the "still clean, still unpinned" rule cannot drift between them.
   */
  tutupPreviewLama: (kecuali) => {
    set((s) => {
      const buang = new Set(
        s.tabs.filter((t) => t.preview && t.id !== kecuali && !t.unsaved && !t.pinned).map((t) => t.id),
      );
      if (buang.size === 0) return {};
      const tabs = s.tabs.filter((t) => !buang.has(t.id));
      const activeTabId =
        s.activeTabId && buang.has(s.activeTabId) ? (tabs[tabs.length - 1]?.id ?? null) : s.activeTabId;
      return { tabs, activeTabId };
    });
  },

  /**
   * Pin or unpin a tab.
   *
   * Pinning also clears `preview`, because the two are answers to the same
   * question ("may this slot be reused?"). A tab that is both would be pinned
   * against replacement and eligible for it at once.
   */
  togglePin: (id) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id ? { ...t, pinned: !t.pinned, preview: t.pinned ? t.preview : false } : t,
      ),
    }));
    void get().persistSession();
  },

  /** Make a preview tab permanent without pinning it (double-click). */
  promoteTab: (id) => {
    set((s) => {
      const t = s.tabs.find((x) => x.id === id);
      if (!t?.preview) return {};
      return { tabs: s.tabs.map((x) => (x.id === id ? { ...x, preview: false } : x)) };
    });
    void get().persistSession();
  },

  bukaViewAi: (view) => {
    /* Already open: just bring it forward. Reopening must not add a second tab
       — the reader pressed a button they already pressed, and two chat tabs
       would be two conversations pretending to be one. */
    const ada = get().tabs.find((t) => t.view === view);
    if (ada) {
      set({ activeTabId: ada.id });
      const fokus = useLayout.getState().fokus;
      set((s) => ({
        tabs: s.tabs.map((t) => (t.id === ada.id ? { ...t, groupId: fokus } : t)),
      }));
      return;
    }

    const tab: Tab = {
      id: nextId(),
      path: null,
      name:
        view === 'ai-chat'
          ? 'Chat'
          : view === 'chat-settings'
            ? 'Chat Settings'
            : view === 'extensions'
              ? 'Extensions'
              : view === 'tools'
                ? 'Tools'
                : 'Search Results',
      encoding: 'utf8' as Encoding,
      lineEnding: 'crlf' as LineEnding,
      unsaved: false,
      content: '',
      lang: 'plain',
      loaded: true,
      view,
      groupId: useLayout.getState().fokus,
    };

    /*
     * If the editor is currently empty, reset the layout first: an empty editor
     * area has had `useLayout.reset()` run against it, and this tab has to land
     * in the same group a file would have landed in.
     */
    if (get().tabs.length === 0) useLayout.getState().reset();

    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }));
    touchTab(tab.id);
    void get().persistSession();
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

    // Buang id yang tab-nya sudah tidak ada lagi, supaya daftar ini tidak menumpuk sampah.
    const hidup = new Set(tabs.map((t) => t.id));
    for (let i = touchOrder.length - 1; i >= 0; i--) {
      if (!hidup.has(touchOrder[i])) touchOrder.splice(i, 1);
    }

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
          ? `Tab terlalu banyak, ${lepas.size} tabs released from memory (contents reload when reopened)`
          : s.statusMessage,
    }));
  },

  updateTabContent: (id, content) => {
    /*
     * Editing PROMOTES a preview tab.
     *
     * This is the whole contract of a preview: it is a look, not a commitment.
     * The moment the reader types in it, they have committed, and a tab that
     * would be silently replaced while holding unsaved edits is the one way
     * this feature could lose work. Promoting on the first character removes
     * that possibility rather than trying to guard against it later.
     */
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id && t.loaded !== false && !t.readOnly
          ? {
              ...t,
              content,
              unsaved: t.content !== content ? true : t.unsaved,
              preview: t.content !== content ? false : t.preview,
            }
          : t,
      ),
    }));
    // Titik dirty tunggal untuk seluruh aplikasi: editor, AI, MCP, dan restore
    // sesi semuanya menulis lewat sini, jadi cukup satu kait untuk menjadwalkan
    // auto save tanpa berpikir dari mana perubahannya datang.
    const sesudah = useStore.getState().tabs.find((t) => t.id === id);
    if (sesudah?.unsaved && bisaAutoSave(sesudah)) jadwalkanAutoSave(id);
  },

  saveTab: async (id) => {
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab) return false;
    if (!tab.path) return get().saveTabAs(id);

    if (tab.loaded === false) {
      await get().ensureTabLoaded(id);
      const again = get().tabs.find((t) => t.id === id);
      if (!again || again.loaded === false) {
        set({ statusMessage: 'The tab has not reloaded yet ,  open it before saving' });
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

      /*
       * Fix-all runs BEFORE formatting, and both before the write.
       *
       * Order matters: a fix can introduce formatting that the formatter then
       * normalises, while formatting first would leave the fixes unformatted.
       * This is the order the reference editors use, and it is the order that
       * makes the result idempotent — running it twice changes nothing more.
       *
       * Failures are swallowed on purpose. A save must not be blocked because
       * a language server is slow, absent, or unhappy: the reader asked for the
       * file to be written, and losing that because ESLint timed out would be
       * the wrong trade. The status line only reports what actually happened.
       */
      if (get().settings.editor.fixAllOnSave && tab.path) {
        const hasil = await get().fixAllTab(id);
        if (hasil.diterapkan > 0) {
          set({ statusMessage: `Perbaikan otomatis: ${hasil.diterapkan} perubahan · ${cur.name}` });
        }
      }

      if (get().settings.editor.formatOnSave) {
        const diformat = await get().formatTab(id);
        if (diformat > 0) {
          set({ statusMessage: `Diformat (${diformat} perubahan) · ${cur.name}` });
        }
      }

      /* Re-read: both steps above write into the buffer through
         `updateTabContent`, so `cur.content` captured before them is stale.
         This can legitimately come back undefined — fixAll and format both
         await LSP round-trips, and the tab can be closed while they are in
         flight. Without the guard the next line throws and the reader gets
         "Save failed: Cannot read properties of undefined", which names a
         cause that has nothing to do with what happened. */
      const sesudahFormat = get().tabs.find((t) => t.id === id);
      if (!sesudahFormat) return false;

      window.dispatchEvent(
        new CustomEvent('zephyr-history-snapshot', {
          detail: { path: cur.path as string, reason: 'save' },
        }),
      );
      await cmd.fsWrite(sesudahFormat.path as string, sesudahFormat.content, sesudahFormat.encoding, sesudahFormat.lineEnding, {
        wasExisting: cur.existed === true,
      });
      // Timer dibatalkan di sini, bukan hanya saat tab ditutup: tab yang sudah
      // bersih tidak perlu disimpan lagi, dan menutup tab nanti tidak boleh
      // menyisakan timer yang menunjuk ke id yang sudah tidak ada.
      batalAutoSave(id);
      set((s) => ({
        tabs: s.tabs.map((t) => (t.id === id ? { ...t, unsaved: false, existed: true } : t)),
        statusMessage: `Saved: ${cur.name}`,
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
      set({ statusMessage: `Save failed: ${err.message}` });
      return false;
    }
  },

  /**
   * Apply the language server's "fix all" action to this buffer.
   *
   * Runs over the whole document with the file's CURRENT diagnostics attached.
   *
   * Two things this deliberately does NOT do:
   *
   *   * it does not touch other files. A `source.fixAll` for one file can
   *     return edits for its imports' files too. Those are collected into
   *     `lain` and reported, but not applied — this editor writes ONE buffer
   *     on save, and silently rewriting a file the reader is not looking at
   *     while they pressed Ctrl+S on a different one is not something a save
   *     should do.
   *   * it does not throw. Called from `saveTab`, a language server that is
   *     absent, still starting, or unhappy must not stop the write.
   */
  fixAllTab: async (id) => {
    const kosong = { diterapkan: 0, ditawarkan: 0, lain: [] as string[] };
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab?.path) return kosong;
    if (get().activeTabId !== id) return kosong;

    const { getActiveView } = await import('./editorRegistry');
    const view = getActiveView();
    if (!view) return kosong;

    /* Diagnostics for THIS file, which is what most servers read to decide
       which fixes to offer. An empty list makes ESLint answer with nothing. */
    const { useProblems } = await import('./problemsStore');
    const diags = useProblems.getState().all().filter((d) => pathSama(d.file, tab.path as string));

    try {
      const { lspFixAll } = await import('./lspCm');
      const hasil = await lspFixAll(tab.path, view, diags);
      if (hasil.diterapkan > 0) get().updateTabContent(id, view.state.doc.toString());
      return hasil;
    } catch {
      return kosong;
    }
  },

  formatTab: async (id) => {
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab?.path) return 0;

    if (get().activeTabId !== id) return 0;
    const { getActiveView } = await import('./editorRegistry');
    const view = getActiveView();
    if (!view) return 0;
    const ed = get().settings.editor;
    let diubah = 0;
    try {
      /*
       * The language server formats first, then the external chain runs on the
       * result. That order gives the PROJECT's formatter the last word, which
       * is what a reader with a `.prettierrc` or a repo-local script expects —
       * the server's opinion is a baseline, theirs is the decision.
       */
      const { lspFormat } = await import('./lspCm');
      const n = await lspFormat(tab.path, view, ed.tabSize, ed.insertSpaces);
      if (n > 0) diubah += n;

      const daftar = ed.formatters ?? [];
      if (daftar.length > 0) {
        const { rangkaiFormat } = await import('./formatters');
        const hasil = await rangkaiFormat(
          view.state.doc.toString(),
          tab.path,
          daftar,
          async (command, input) => {
            const r = await cmd.formatText(command, input, get().workspace ?? undefined, tab.path ?? undefined);
            return { ok: r.ok, out: r.out, err: r.err };
          },
        );
        if (hasil.teks !== view.state.doc.toString()) {
          /* Replace the whole document in one transaction, so undo treats the
             format as one step rather than one per line. */
          view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: hasil.teks } });
          diubah += 1;
        }
        if (hasil.gagal.length > 0) {
          /* Named, so a reader whose formatter is not on PATH can see which
             one and why — instead of a silent no-op that looks like the
             setting is broken. */
          set({
            statusMessage: `Formatter gagal: ${hasil.gagal.map((g) => g.cmd).join(', ')} — ${hasil.gagal[0].pesan}`,
          });
        }
      }

      if (diubah > 0) get().updateTabContent(id, view.state.doc.toString());
      return diubah;
    } catch {
      return diubah;
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
        statusMessage: `Saved: ${baseName(target)}`,
      }));
      void get().persistSession();
      return true;
    } catch (e) {
      set({ statusMessage: `Save failed: ${cmd.asZephyrError(e).message}` });
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

    // Tab yang ditutup tidak boleh menyimpan dirinya sendiri setelah hilang:
    // timer yang masih hidup akan menulis ke disk untuk tab yang barusan
    // dibuang, atau lebih buruk lagi menyimpan isi yang sudah tidak dipakai.
    batalAutoSave(id);
    const tabTutup = get().tabs.find((t) => t.id === id);
    if (tabTutup?.path) {
      void import('./cliStore').then((m) => m.useCli.getState().lepasWait(tabTutup.path as string));
      set({ lastClosed: { path: tabTutup.path } });
    }
    lupakanTab(id);
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

      if (tabs.length === 0) {
        touchOrder.length = 0;
        useLayout.getState().reset();
      }
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

  /*
   * Membuka berkas pada baris tertentu - dan TIDAK melempar kalau gagal.
   *
   * Sebelumnya `await get().openPath(path)` dibiarkan melempar. Itu terlihat
   * aman, karena pemanggilnya memakai `void` - tapi `void` hanya membuang
   * HASIL promise, bukan PENOLAKANNYA. Satu berkas yang tidak ada menghasilkan
   * unhandledrejection, dan itu naik ke renderer.
   *
   * Yang membuatnya merusak: pemanggil paling sering adalah jawaban MODEL
   * sendiri. Model yang sedang menulis tiga berkas menyebut `situs/styles.css`
   * di kalimatnya SEBELUM berkasnya ada - jadi rujukan ke berkas yang belum
   * ditulis adalah keadaan NORMAL, bukan kasus tepi. Setiap kali itu terjadi,
   * loop agent yang sedang berjalan mati, dan model tampak berhenti di tengah
   * kalimat:
   *
   *   assistant: "...Menulis `situs/styles.css`.Men"   <- terpotong
   *   log      : unhandledrejection NotFound: situs/styles.css is missing
   *
   * Karena itu kegagalan ditelan di sini, di titik paling dalam. Membukanya
   * gagal memang bukan hal yang bisa ditindaklanjuti pemanggil - berkasnya
   * belum ada, dan tidak ada yang bisa dilakukan selain membiarkan agent
   * melanjutkan tulisannya.
   */
  openPathAt: async (path, line, col = 1, opts?: { preview?: boolean }) => {
    try {
      /* Good to a specific LINE, so it came from a search hit, a reference, a
         diagnostic or the debugger — the reader is going somewhere to look at
         something. That is a deliberate open, not a browse, so it pins by
         default. Callers that are genuinely browsing pass `preview: true`. */
      await get().openPath(path, { preview: opts?.preview === true ? true : false });
    } catch {
      return;
    }

    await new Promise((r) => requestAnimationFrame(() => r(null)));
    revealPosition(line, col);
  },

  renamePathInTabs: (from, to) => {
    const fromNorm = from.replace(/[\\/]+$/, '');
    const fromKey = `${kunciPath(fromNorm)}\\`;
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (!t.path) return t;
        const key = kunciPath(t.path);
        if (key === kunciPath(fromNorm)) {
          return { ...t, path: to, name: baseName(to), lang: detectLang(to) };
        }
        if (key.startsWith(fromKey)) {
          // Suffix diambil dari path aslinya berdasarkan jumlah segmen, bukan jumlah karakter,
          // supaya tab ber-delimiter '/' tetap ikut ter-rename; separator hasil mengikuti `to`.
          const segmen = t.path.replace(/[\\/]+$/, '').split(/[\\/]/).slice(fromNorm.split(/[\\/]/).length);
          const next = segmen.length > 0 ? `${to.replace(/[\\/]+$/, '')}\\${segmen.join('\\')}` : to;
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

    /*
     * HANYA tab yang sudah tersimpan yang boleh ditutup tanpa bertanya.
     *
     * Dulu di sini semuanya lewat `forceCloseTab`, dan itu membuang tab yang
     * BELUM DISIMPAN tanpa satu pun peringatan. Jalurnya nyata dan mudah
     * dijangkau: menghapus atau mengganti nama folder di explorer, dan menutup
     * workspace, keduanya memanggil fungsi ini. User yang menyunting berkas
     * lalu menghapus foldernya kehilangan tulisannya dalam diam - dan tulisannya
     * tidak bisa dikembalikan, karena tabnya sudah lepas dari disk.
     *
     * Tab yang belum disimpan dikumpulkan dulu, lalu SATU pertanyaan diajukan
     * untuk semuanya. Bertanya satu per satu untuk folder berisi sepuluh berkas
     * berarti sepuluh dialog berturut-turut, dan user akan menekan "buang" tanpa
     * membaca.
     */
    const kotor = doomed.filter((id) => get().tabs.find((t) => t.id === id)?.unsaved);
    const bersih = doomed.filter((id) => !kotor.includes(id));

    for (const id of bersih) get().forceCloseTab(id);

    if (kotor.length > 0) {
      set({ confirm: { tabIds: kotor, intent: 'close-tab' } });
    }
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

  /*
   * The single gate for closing the window. Returns true when the close may go
   * ahead, false when it must be cancelled and a dialog shown.
   *
   * Two settings live here rather than in the App handler, because this is the
   * one place that runs for EVERY close - the title bar button, Alt+F4, and the
   * close from the taskbar all arrive here, and a check placed in the handler
   * would have to be repeated for each.
   *
   * Unsaved files always win, even with `confirmExit` off. Turning off "ask
   * before closing" must not silently discard edits: that is data loss, and it
   * is not what the switch promises. The switch only decides whether a CLEAN
   * window still asks.
   */
  requestCloseWindow: () => {
    const s = get();
    const dirty = s.tabs.filter((t) => t.unsaved);
    if (dirty.length > 0) {
      set({ confirm: { tabIds: dirty.map((t) => t.id), intent: 'close-window' } });
      return false;
    }

    /*
     * Clean window, nothing to save. If "keep running in the tray" is on, the
     * close is turned into a HIDE - the window goes away, the process does not.
     * Returning false stops the destroy from happening; the app then stays alive
     * with its tray icon, which is what the switch promises.
     *
     * `?.` on the settings: this runs during close, and a partial settings
     * object must not throw here. A throw would leave the window unclosable,
     * which is far worse than skipping a confirmation.
     */
    const g = s.settings?.general;
    if (g?.minimizeToTray) {
      void getCurrentWindow().hide();
      return false;
    }

    /*
     * `?? true`: absent means on. That matches the Rust default, and it is the
     * safe direction for a setting whose whole job is to prevent an accident.
     */
    if (g?.confirmExit ?? true) {
      set({ confirm: { tabIds: [], intent: 'close-window' } });
      return false;
    }

    return true;
  },

  setSaveIssue: (i) => set({ saveIssue: i }),

  resolveSaveIssue: async (choice) => {
    const issue = get().saveIssue;
    if (!issue) return;
    set({ saveIssue: null });
    if (choice === 'cancel') {
      set({ statusMessage: 'Save cancelled' });
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
          statusMessage: `Saved as UTF-8: ${tab.name}`,
        }));
      } else {
        await cmd.fsWrite(tab.path, tab.content, tab.encoding, tab.lineEnding, {
          allowMissing: true,
        });
        set((s) => ({
          tabs: s.tabs.map((t) =>
            t.id === issue.tabId ? { ...t, unsaved: false, existed: true } : t,
          ),
          statusMessage: `Recreated: ${tab.name}`,
        }));
      }
    } catch (e) {
      set({ statusMessage: `Save failed: ${cmd.asZephyrError(e).message}` });
    }
  },

  persistSession: async () => {
    try {
      const tabs = get()
        .tabs.filter((t) => t.path)
        /*
         * Preview tabs are NOT persisted.
         *
         * A preview is a transient look at a file the reader clicked past on
         * their way somewhere else. Restoring it would reopen a file they had
         * already moved on from, in a slot whose whole purpose is to be
         * replaced — and on the next launch nothing would replace it, so it
         * would just sit there as an unexplained extra tab.
         */
        .filter((t) => !t.preview)
        .map((t) => ({ path: t.path as string, encoding: t.encoding, pinned: !!t.pinned }));
      /*
       * The folder goes with the tabs.
       *
       * It used to be dropped here, which is why the workspace was gone after
       * every reload: the editor came back with its files but no folder for
       * them to belong to, and the explorer, the Changes list and the agent's
       * context all start from the workspace.
       */
      await cmd.sessionSave({ tabs, workspace: get().workspace });
    } catch {

    }
  },

  izinPerintah: (command) => {
    const daftar = get().settings.allowCommands ?? [];
    const cmd = command.trim().replace(/\s+/g, ' ');
    if (!cmd || daftar.length === 0) return false;
    return daftar.some((izin) => {
      const p = izin.trim().replace(/\s+/g, ' ');
      if (!p) return false;
      if (!cmd.startsWith(p)) return false;

      return cmd.length === p.length || cmd[p.length] === ' ';
    });
  },

  /*
   * Settings writes are DEBOUNCED and SERIALISED, for two separate reasons that
   * both showed up as the same complaint: a setting that reverts on its own.
   *
   * 1. DEBOUNCE. Applying on every call meant one disk write per keystroke in
   *    every settings text field. More importantly, the Rust side is
   *    read-modify-write (`settings.rs:357-378` reads the whole file, merges,
   *    writes it back), so two calls in flight together each read the SAME base
   *    and the second write wins with only its own patch. The result is a
   *    setting that silently lost its previous value.
   *
   * 2. SERIALISE. Even coalesced, the last call must FINISH before the next
   *    starts, otherwise the same lost-update happens. `antrianTulis` holds the
   *    tail of the chain, so writes run one after another.
   *
   * The state update stays IMMEDIATE: the merge is computed and applied to the
   * store on the spot, so the UI never lags a keystroke. Only the disk write is
   * delayed - and the merge is recomputed from CURRENT state when it runs, so
   * the delayed write carries every change made in the meantime rather than
   * just the one that scheduled it.
   *
   * CONSEQUENCE, and the trap this comment exists to close: the returned
   * promise resolves as soon as the STATE merged, which is BEFORE anything
   * reached the file. Code that writes and then immediately asks the backend to
   * read that setting back must `await flushSetelanTerakhir()` (exported right
   * below `flushSetelan`) in between, or it will be answered from the previous
   * file contents. `extensionStore.toggle` shipped exactly that bug: the
   * extension switch was written, read back too early, and flipped itself on
   * again in the UI.
   */
  applySettings: (patch) => {
    const sebelumnya = get().settings;
    set({ settings: mergeDalam(sebelumnya, patch) as typeof sebelumnya });

    /* Merge into the pending payload so a burst becomes one write carrying all
       of it. This is what makes the debounce safe: nothing is dropped, only
       combined. */
    gabungTertunda = mergeDalam(gabungTertunda, patch) as Record<string, unknown>;

    if (timerSetelan) clearTimeout(timerSetelan);
    timerSetelan = setTimeout(() => {
      void flushSetelan();
    }, TUNDA_SETELAN_MS);

    return Promise.resolve();
  },

  applyLayout: async (mode: 'default' | 'focus' | 'term' | 'quad', opsi?: { sidebar?: boolean; panel?: boolean }) => {
    const st = useStore.getState();

    const term = useTerminal.getState();
    let sidebar: 'left' | 'right' | undefined;
    let sbVisible = st.sidebarVisible;
    let panelVisible = term.visible;
    if (mode === 'focus') { sbVisible = false; panelVisible = false; }
    else if (mode === 'term') { sbVisible = false; panelVisible = true; }
    else if (mode === 'quad') { sbVisible = true; panelVisible = true; sidebar = 'left'; }
    else if (mode === 'default') { sidebar = 'left'; sbVisible = true; panelVisible = true; }
    if (opsi?.sidebar !== undefined) sbVisible = opsi.sidebar;
    if (opsi?.panel !== undefined) panelVisible = opsi.panel;
    st.setSidebarVisible(sbVisible);
    term.setVisible(panelVisible);
    const patch: Record<string, unknown> = { layout: mode };
    if (sidebar) patch.sidebar = sidebar;
    await st.applySettings(patch);
  },

  reloadSettings: async () => {
    try {
      const s = await cmd.getSettings();
      set({ settings: s });
      set({ activeTheme: applyTheme(s.general, s.theme, s.background) });
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
