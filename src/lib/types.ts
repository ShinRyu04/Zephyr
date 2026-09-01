// types.ts — tipe bersama frontend. Bentuk mengikuti ARCHITECTURE.md §5.
// Wajib sinkron dengan serde di src-tauri (fs_utils.rs, settings.rs).

export type Encoding = 'utf8' | 'utf8-bom' | 'ansi';
export type LineEnding = 'crlf' | 'lf';

export type ErrorCode =
  | 'NotFound'
  | 'InvalidInput'
  | 'Permission'
  | 'WorkspaceOutside'
  | 'Git'
  | 'Pty'
  | 'Ssh'
  | 'Mcp'
  | 'Encoding'
  | 'Io'
  | 'Internal';

export interface ZephyrError {
  code: ErrorCode;
  message: string;
}

export interface AppInfo {
  version: string;
  identifier: string;
  dataDir: string;
}

export interface ReadResult {
  content: string;
  detectedEncoding: Encoding;
  lineEnding: LineEnding;
}

export interface StatResult {
  size: number;
  isDir: boolean;
  mtime: number;
}

export interface RecentEntry {
  path: string;
  lastOpened: number;
}

export interface SessionTab {
  path: string;
  encoding: Encoding;
}

/** Tab editor. `path: null` = untitled (belum pernah disimpan). */
export interface Tab {
  id: string;
  path: string | null;
  name: string;
  encoding: Encoding;
  lineEnding: LineEnding;
  unsaved: boolean;
  content: string;
  lang: LangId;
}

export type LangId =
  | 'javascript'
  | 'typescript'
  | 'jsx'
  | 'tsx'
  | 'json'
  | 'html'
  | 'css'
  | 'markdown'
  | 'python'
  | 'rust'
  | 'go'
  | 'sql'
  | 'yaml'
  | 'toml'
  | 'xml'
  | 'java'
  | 'cpp'
  | 'c'
  | 'shell'
  | 'ini'
  | 'plain';

export type ActivityId = 'explorer' | 'search' | 'scm' | 'ai' | 'terminal' | 'settings';

// ── Settings (subset yang dipakai sampai fase 03; sisanya menyusul) ──

export interface GeneralSettings {
  theme: 'dark' | 'light' | 'system';
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  uiLang: 'id' | 'en';
  zoom: number;
  restoreSession: boolean;
  checkUpdates: boolean;
}

export interface EditorSettings {
  tabSize: number;
  insertSpaces: boolean;
  wordWrap: boolean;
  minimap: boolean;
  cursorStyle: 'line' | 'block' | 'underline';
  smoothScroll: boolean;
  formatOnSave: boolean;
}

export interface ThemeSettings {
  current: string;
  accent?: string;
}

export interface Settings {
  general: GeneralSettings;
  editor: EditorSettings;
  theme: ThemeSettings;
  shortcuts: Record<string, string>;
  models: { activeProvider: string; providers: Record<string, { baseUrl?: string; model?: string }> };
  agents: {
    maxPanes: number;
    order: string[];
    startCommands: Record<string, string[]>;
    attachActiveFile: boolean;
  };
  extensions: { enabled: string[] };
  git: { userName?: string; userEmail?: string; defaultBranch: string; pullBeforePush: boolean };
  mcp: { enabled: boolean; port: number; token: string; writeToCli: string[] };
  ssh: { recentHosts?: string[] };
}

/** Default frontend — cermin dari default_settings() di settings.rs. */
export const DEFAULT_SETTINGS: Settings = {
  general: {
    theme: 'dark',
    fontFamily: "Consolas, 'Cascadia Mono', 'Segoe UI Mono', monospace",
    fontSize: 13,
    lineHeight: 1.5,
    uiLang: 'id',
    zoom: 100,
    restoreSession: true,
    checkUpdates: false,
  },
  editor: {
    tabSize: 2,
    insertSpaces: true,
    wordWrap: false,
    minimap: false,
    cursorStyle: 'line',
    smoothScroll: false,
    formatOnSave: false,
  },
  theme: { current: 'zephyr-dark', accent: '#3884ff' },
  shortcuts: {},
  models: { activeProvider: 'gemini', providers: {} },
  agents: { maxPanes: 6, order: [], startCommands: {}, attachActiveFile: false },
  extensions: { enabled: [] },
  git: { defaultBranch: 'main', pullBeforePush: true },
  mcp: { enabled: false, port: 9222, token: '', writeToCli: [] },
  ssh: { recentHosts: [] },
};
