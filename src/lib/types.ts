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

// ── explorer / search (fase 04) ──

export interface DirNode {
  name: string;
  path: string;
  isDir: boolean;
  hasChildren: boolean;
}

export interface SearchHit {
  path: string;
  name: string;
  /** 1-based */
  line: number;
  /** 1-based, dihitung dalam karakter */
  col: number;
  matchLen: number;
  preview: string;
  before?: string | null;
  after?: string | null;
}

export interface SearchResult {
  hits: SearchHit[];
  filesScanned: number;
  truncated: boolean;
}

/** Satu file untuk Quick Open palette (fase 12). */
export interface QuickFile {
  /** path absolut */
  path: string;
  /** path relatif ke root workspace, separator '/' */
  rel: string;
  name: string;
}

/** Hasil `browser_probe` (fase 12): boleh di-embed atau tidak. */
export interface ProbeResult {
  url: string;
  reachable: boolean;
  status: number | null;
  embeddable: boolean;
  reason: string;
  /** header yang menjadi dasar keputusan (transparansi ke user) */
  header: string | null;
  ms: number;
}

export type FsChangeKind = 'create' | 'remove' | 'modify';

// ── terminal / pty (fase 05) + multi-pane & agent (fase 06) ──

/** Jenis proses yang bisa di-spawn lewat pty. */
export type PtyKind = 'shell' | 'private' | 'cmd' | 'bash' | 'wsl' | 'pwsh' | 'agent' | 'ssh';

/** Jenis pane di grid terminal. 'browser' tidak punya PTY. */
export type PaneKind = PtyKind | 'browser';

export interface ShellInfo {
  id: string;
  label: string;
  path: string;
}

/** CLI agent yang terdeteksi di mesin (fase 06). */
export interface AgentInfo {
  id: string;
  label: string;
  path: string;
  version: string | null;
}

export interface PtyInfo {
  id: string;
  kind: string;
  shell: string;
  pid: number | null;
  alive: boolean;
}

export type PaneStatus = 'live' | 'exited' | 'connecting' | 'error';

/** Satu pane dalam TerminalTab (ARCHITECTURE.md §5). */
export interface PaneMeta {
  id: string;
  kind: PaneKind;
  /** hanya untuk kind 'agent' */
  agent?: { name: string; label: string };
  title: string;
  /** id sesi PTY — sama dengan `id` (browser: undefined) */
  sessionId?: string;
  status: PaneStatus;
  cwd: string | null;
  pid?: number | null;
  /** hanya untuk kind 'browser' */
  url?: string;
}

/** Satu tab terminal berisi 1..maxPanes pane. */
export interface TerminalTab {
  id: string;
  title: string;
  panes: PaneMeta[];
  layout: 'grid' | 'split';
  activePaneId: string | null;
}

// ── models / API key (fase 08) ──

/** Status key satu provider. TIDAK memuat key asli — hanya mask. */
export interface PublicModel {
  provider: string;
  hasKey: boolean;
  /** mis. "sk-a…4f2a"; kosong bila belum ada key */
  preview: string;
}

export interface ModelTestResult {
  ok: boolean;
  message: string;
  status: number | null;
  ms: number;
}

// ── AI panel (fase 09) ──

export type AiRole = 'user' | 'assistant' | 'system';

/** Pesan yang dikirim ke Rust (bentuk minimal yang dimengerti adapter). */
export interface AiMessage {
  role: AiRole;
  content: string;
}

/** Pesan di UI: AiMessage + metadata tampilan. */
export interface ChatMsg extends AiMessage {
  id: string;
  /** epoch ms */
  at: number;
  /** true saat token masih mengalir */
  streaming?: boolean;
  /** pesan error dari provider (ditampilkan sebagai bubble merah) */
  error?: string;
  /** model yang menjawab (untuk logo di bubble) */
  model?: string;
  /** file yang dilampirkan bersama pesan user */
  attached?: { path: string; bytes: number; truncated: boolean };
}

/** Satu percakapan. History dibatasi 200 pesan (prompt fase 09). */
export interface ChatSession {
  id: string;
  title: string;
  model: string;
  provider: string;
  messages: ChatMsg[];
  createdAt: number;
}

/** Payload event `ai-chunk` dari Rust. */
export interface AiChunk {
  id: string;
  text?: string;
  err?: string;
  done?: boolean;
}

// ── Source Control / git (fase 10) ──

/** Satu entri perubahan. `staged` menentukan grup di UI. */
export interface GitChange {
  /** path relatif root repo, separator '/' */
  path: string;
  /** M A D R C U T ? */
  status: string;
  staged: boolean;
  isNew: boolean;
  isDeleted: boolean;
  /** nama lama saat rename */
  origPath: string | null;
}

export interface GitStatusResult {
  isRepo: boolean;
  repoRoot: string | null;
  branch: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  changes: GitChange[];
  hasRemote: boolean;
  conflicted: boolean;
}

export interface GitBranches {
  current: string | null;
  locals: string[];
  remotes: string[];
}

export interface GitCommitInfo {
  hash7: string;
  subject: string;
  author: string;
  date: string;
  refs: string;
}

export interface GitUser {
  name: string | null;
  email: string | null;
}

// ── GitHub auth (fase 10) ──

export type GhMethod = 'none' | 'pat' | 'oauth';

export interface GhStatus {
  signedIn: boolean;
  method: GhMethod;
  user: string | null;
  scopes: string[];
  /** epoch detik; null = tidak kadaluarsa */
  expiresAt: number | null;
  /** true = clientId terisi → tombol OAuth aktif */
  oauthConfigured: boolean;
  expired: boolean;
}

export interface GhUser {
  user: string;
  scopes: string[];
}

export interface DeviceLogin {
  userCode: string;
  verificationUri: string;
  expiresAt: number;
  interval: number;
}

export interface GhTestResult {
  ok: boolean;
  user: string | null;
  message: string;
  status: number | null;
}

/** Payload event `gh-login` (bentuk sama dengan ssh-status). */
export interface GhLoginEvent {
  state: 'pending' | 'success' | 'error';
  message?: string;
}

// ── MCP server 9222 (fase 11) ──

/** Status server MCP dari Rust (`mcp_status`). */
export interface McpStatus {
  running: boolean;
  /** port yang benar-benar listening (bisa 9223 bila 9222 dipakai) */
  port: number;
  /** port yang diminta di settings */
  requestedPort: number;
  token: string;
  uptimeMs: number;
  enabled: boolean;
}

/** Payload event `mcp-action`: permintaan Rust yang dijawab frontend. */
export interface McpAction {
  /** dikembalikan lewat `mcp_reply`; kosong untuk notifikasi satu arah */
  reqId?: string;
  type: string;
  payload?: Record<string, unknown>;
}

/** Hasil menulis/menghapus entri zephyr di config satu AI CLI. */
export interface CliWriteResult {
  id: string;
  label: string;
  path: string;
  ok: boolean;
  /** true = file lama disalin ke <nama>.bak */
  backup: boolean;
  message: string;
}

/** Apakah config satu CLI sudah memuat entri zephyr. */
export interface CliStatus {
  id: string;
  label: string;
  path: string;
  exists: boolean;
  registered: boolean;
}

// ── extensions (fase 13) ──

/** Satu command yang dikontribusikan manifest ekstensi. */
export interface ExtCommand {
  /** selalu di-prefix `ext.<extId>.` supaya tidak menimpa command inti */
  id: string;
  title: string;
  description: string;
}

export interface ExtensionInfo {
  id: string;
  name: string;
  version: string;
  description: string;
  enabled: boolean;
  path: string;
  /** true = ekstensi bawaan (internal, tidak bisa dilepas) */
  builtin: boolean;
  main: string;
  /** ukuran file main; -1 = tidak ada */
  mainBytes: number;
  commands: ExtCommand[];
  /** alasan ekstensi tidak bisa dipakai (manifest rusak / >1MB) */
  error: string | null;
}

/** Hasil `extensions_load`. `executed` SELALU false di v1 (manifest-only). */
export interface ExtensionLoad {
  id: string;
  name: string;
  version: string;
  main: string;
  mainBytes: number;
  commands: ExtCommand[];
  manifest: Record<string, unknown>;
  executed: boolean;
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
  showWhitespace: boolean;
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
  git: {
    userName?: string;
    userEmail?: string;
    defaultBranch: string;
    pullBeforePush: boolean;
    /** fase 10: metadata login GitHub — token TIDAK di sini (secrets.json) */
    github?: {
      method?: GhMethod;
      user?: string | null;
      scopes?: string[];
      expiresAt?: number | null;
      /** Client ID OAuth App milik user; kosong = tombol OAuth mati */
      clientId?: string;
    };
  };
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
    showWhitespace: false,
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
