export type Encoding = 'utf8' | 'utf8-bom' | 'ansi' | 'utf16le' | 'utf16be';
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

  arch?: string;

  webview?: string;

  portable?: boolean;

  exeDir?: string;

  profile?: string;
}

export interface PerfMark {
  name: string;
  atMs: number;
  durMs: number | null;
}

export interface Diagnostics {
  version: string;
  uptimeMs: number;

  ramBytes: number;

  ramTotalBytes: number;

  ramPeakBytes: number;
  ptyCount: number;

  mcpPort: number;
  logFile: string;
  logBytes: number;
  debug: boolean;
  panicked: boolean;
  lastPanic: string;
  marks: PerfMark[];
  counters: Record<string, number>;

  os: string;

  hostRamBytes: number;

  cpuCount: number;

  domains: DomainStatus[];
}

export interface DomainStatus {

  id: string;

  level: 'ok' | 'warn' | 'off';

  detail: string;
}

export interface SelfTestItem {
  name: string;
  ok: boolean;
  ms: number;
  detail: string;
}

export interface GitProgress {
  op: string;
  phase: 'start' | 'done' | 'error';
}

export interface ReadResult {
  content: string;
  detectedEncoding: Encoding;
  lineEnding: LineEnding;

  readOnly: boolean;

  bytes: number;

  note: string;
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

export interface DirNode {
  name: string;
  path: string;
  isDir: boolean;
  hasChildren: boolean;
}

export interface SearchHit {
  path: string;
  name: string;

  line: number;

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

export interface QuickFile {

  path: string;

  rel: string;
  name: string;
}

export interface ProbeResult {
  url: string;
  reachable: boolean;
  status: number | null;
  embeddable: boolean;
  reason: string;

  header: string | null;
  ms: number;
}

export type FsChangeKind = 'create' | 'remove' | 'modify';

export type PtyKind = 'shell' | 'private' | 'cmd' | 'bash' | 'wsl' | 'pwsh' | 'agent' | 'ssh';

export type PaneKind = PtyKind | 'browser';

export interface ShellInfo {
  id: string;
  label: string;
  path: string;
}

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

export interface SshHost {
  id: string;
  name: string;
  host: string;
  port: number;
  user: string;
  auth: 'key' | 'password';
  keyPath: string;
  savePassword: boolean;
  hasPassword: boolean;
}

export interface SshConfigInput {
  id?: string;
  name: string;
  host: string;
  port: number;
  user: string;
  auth: 'key' | 'password';
  keyPath?: string;
  savePassword?: boolean;
}

export type PaneStatus = 'live' | 'exited' | 'connecting' | 'error';

export interface PaneMeta {
  id: string;
  kind: PaneKind;

  agent?: { name: string; label: string };
  title: string;

  sessionId?: string;
  status: PaneStatus;
  cwd: string | null;
  pid?: number | null;

  url?: string;

  exitCode?: number | null;
}

export interface TerminalTab {
  id: string;
  title: string;
  panes: PaneMeta[];
  layout: 'grid' | 'split';
  activePaneId: string | null;
}

export interface PublicModel {
  provider: string;
  hasKey: boolean;

  preview: string;
}

export interface ModelTestResult {
  ok: boolean;
  message: string;
  status: number | null;
  ms: number;
}

export type AiRole = 'user' | 'assistant' | 'system';

export interface AiMessage {
  role: AiRole;
  content: string;

  image?: string;

  images?: string[];

  reasoning?: string;
}

export interface ChatMsg extends AiMessage {
  id: string;

  at: number;

  streaming?: boolean;

  error?: string;

  model?: string;

  attached?: { path: string; bytes: number; truncated: boolean };

  images?: string[];

  tools?: AgentToolRun[];
}

export interface AgentToolRun {
  name: string;
  args: string;
  result: string;
  ok: boolean;

  at: number;
}

export interface ChatSession {
  id: string;
  title: string;
  model: string;
  provider: string;
  messages: ChatMsg[];
  createdAt: number;

  approval?: ApprovalMode;
}

export type ApprovalMode =

  | 'ask'
  /** jalankan semuanya tanpa tanya */
  | 'auto'
  /** tolak semua terminal_exec dan editor_write */
  | 'readonly'
  /** kerja langsung: aman dijalankan, destruktif tetap ditanya */
  | 'work';

export interface AiChunk {
  id: string;
  text?: string;
  err?: string;
  done?: boolean;

  toolDone?: boolean;

  content?: string;

  toolCalls?: AgentToolCall[];

  cancelled?: boolean;

  reasoning?: string;
}

export interface GitChange {

  path: string;

  status: string;
  staged: boolean;
  isNew: boolean;
  isDeleted: boolean;

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
  parents?: string[];
}

export interface GitUser {
  name: string | null;
  email: string | null;
}

export type GhMethod = 'none' | 'pat' | 'oauth';

export interface GhStatus {
  signedIn: boolean;
  method: GhMethod;
  user: string | null;

  avatarUrl: string | null;
  scopes: string[];

  expiresAt: number | null;

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

export interface GhLoginEvent {
  state: 'pending' | 'success' | 'error';
  message?: string;
}

export interface McpStatus {
  running: boolean;

  port: number;

  requestedPort: number;
  token: string;
  uptimeMs: number;
  enabled: boolean;
}

export interface McpAction {

  reqId?: string;
  type: string;
  payload?: Record<string, unknown>;
}

export interface CliWriteResult {
  id: string;
  label: string;
  path: string;
  ok: boolean;

  backup: boolean;
  message: string;
}

export interface CliStatus {
  id: string;
  label: string;
  path: string;
  exists: boolean;
  registered: boolean;
}

export interface McpServer {
  id: string;
  label: string;
  url: string;
  token: string;
}

export interface McpToolSpec {
  name: string;
  description: string;
  schema: Record<string, unknown>;
}

export interface ExtCommand {

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

  builtin: boolean;
  main: string;

  mainBytes: number;
  commands: ExtCommand[];

  error: string | null;
}

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

export interface ContribTheme {
  label: string;
  path: string;
  kind: 'dark' | 'light';
}
export interface ContribKeymap {
  label: string;
  path: string;
}
export interface ContribSnippet {
  language: string;
  path: string;
}
export interface ContribLanguage {
  id: string;

  extensions: string[];

  cmLang: string;

  legacyMode: string;
  label: string;
}
export interface ContribIconTheme {
  label: string;
  path: string;
}

export interface ExtContributes {
  themes: ContribTheme[];
  keymaps: ContribKeymap[];
  snippets: ContribSnippet[];
  languages: ContribLanguage[];
  iconThemes: ContribIconTheme[];
  commands: ExtCommand[];
}

export interface ExtManifest {
  id: string;
  name: string;
  publisher: string;
  version: string;
  description: string;
  icon: string;
  categories: string[];

  engine: string;
  engineOk: boolean;
  main: string;
  contributes: ExtContributes;
  raw: Record<string, unknown>;

  manifestFile: string;
}

export interface ExtManifestStatus {
  manifest: ExtManifest | null;
  enabled: boolean;

  tercatat: boolean;
  path: string;
  error: string | null;

  iconPath?: string | null;
}

export interface ExtInstallHasil {
  id: string;
  name: string;
  version: string;
  path: string;

  perluReload: boolean;
  manifest: ExtManifest;
}

export interface RegistryEntry {
  id: string;
  name: string;
  publisher: string;
  version: string;
  description: string;
  categories: string[];

  logo: string;

  iconUrl: string;

  logoColor: string;

  url: string;
  downloadCount: number;
  rating: number;

  languages: string[];
}

export interface ExtExecResult {

  code: number | null;
  stdout: string;
  stderr: string;

  truncated: boolean;
  durationMs: number;
  killed: boolean;
}

export interface ExtTrust {

  runtimes: Record<string, string>;
  grantedAt: string;
}

export interface AgentToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface AgentMsg {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;

  toolCallId?: string;

  toolCalls?: AgentToolCall[];

  name?: string;

  images?: string[];
}

export interface AgentToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface AiToolResult {
  content: string;
  toolCalls: AgentToolCall[];
  done: boolean;
}

export type ExtKategori =
  | 'Themes'
  | 'Keymaps'
  | 'Snippets'
  | 'Languages'
  | 'Icon Themes'
  | 'Other';

export interface Tab {
  id: string;
  path: string | null;
  name: string;
  encoding: Encoding;
  lineEnding: LineEnding;
  unsaved: boolean;
  content: string;
  lang: LangId;

  loaded?: boolean;

  readOnly?: boolean;

  note?: string;

  bytes?: number;

  existed?: boolean;

  groupId?: string | null;
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
  | 'dart'
  | 'ruby'
  | 'lua'
  | 'perl'
  | 'swift'
  | 'kotlin'
  | 'scala'
  | 'plain';

export type ActivityId =
  | 'explorer'
  | 'search'
  | 'outline'
  | 'scm'
  // fase 22: Run & Debug
  | 'debug'
  | 'ai'
  | 'terminal'
  | 'extensions'
  | 'settings';

export interface GeneralSettings {
  theme: 'dark' | 'light' | 'system';
  fontFamily: string;
  fontSize: number;
  lineHeight: number;

  uiLang: string;
  zoom: number;
  restoreSession: boolean;
  checkUpdates: boolean;

    lowRam?: boolean;
    ramEkstrem?: boolean;

  multilineKey?: 'auto' | 'csiu' | 'lf' | 'backslash';

  aiPanel?: 'bottom' | 'right';

  layout?: 'editor' | 'terminal';
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

  breadcrumbs: boolean;

  stickyScroll: boolean;

  stickyScrollMaxLines: number;

  minimapRenderCharacters: boolean;

  indentGuides: boolean;

  colorDecorators: boolean;

  unicodeHighlight: boolean;

  bracketPairColorization: boolean;

  snippetSuggestions: 'top' | 'bottom' | 'inline' | 'none';

  ghostText: boolean;
}

export interface ThemeSettings {
  current: string;
  accent?: string;
}

export interface BackgroundSettings {

  image?: string;

  opacity?: number;

  size?: 'fill' | 'fit' | 'center';

  transparan?: boolean;
}

export interface Settings {
  general: GeneralSettings;
  editor: EditorSettings;
  theme: ThemeSettings;
  background?: BackgroundSettings;

  sidebar: 'left' | 'right' | 'top' | 'bottom';
  layout: 'default' | 'focus' | 'term' | 'quad';
  shortcuts: Record<string, string>;
  models: {
      activeProvider: string;
      providers: Record<string, { baseUrl?: string; model?: string }>;

      answerLang: string;

      ragEnabled: boolean;

      ragUrl: string;

      ragProject: string;

      ragK: number;
    };

  allowCommands: string[];

  aiPrompt: {

    identitas: string;

    caraKerja: string;

    aturan: string;

    instruksi: string;
  };
  agents: {
    maxPanes: number;
    order: string[];
    startCommands: Record<string, string[]>;
    attachActiveFile: boolean;
  };

  subagent: {

    maxParallel: number;

    maxSteps: number;

    allowWrite: boolean;

    showPanel: boolean;

    autoCollapse: boolean;

    model: string;
    provider: string;
  };
  extensions: {
    enabled: string[];

    trust: Record<string, ExtTrust>;

    registryUrl?: string;
  };

  accessibility?: {

    reducedMotion: boolean;

    screenReader: boolean;

    autoFocusDialog: boolean;

    toastDurasiMin: number;
  };
  git: {
    userName?: string;
    userEmail?: string;
    defaultBranch: string;
    pullBeforePush: boolean;

    github?: {
      method?: GhMethod;
      user?: string | null;
      scopes?: string[];
      expiresAt?: number | null;

      clientId?: string;
    };
  };
  mcp: { enabled: boolean; port: number; token: string; writeToCli: string[] };
  ssh: { recentHosts?: string[] };

  panel: { visibleTabs: string[]; activeTab: string; height: number };

  lsp: {
    enabled: boolean;
    idleSeconds: number;
    servers: Record<string, { enabled?: boolean; cmd?: string[]; initOptions?: Record<string, unknown> }>;
  };

  history: {
    enabled: boolean;

    maxPerFile: number;

    maxDays: number;
  };
  update?: {
    lastSeenVersion: string;
    pendingNotes: string;
    seenAnnouncements: string[];
  };
}

export const DEFAULT_SETTINGS: Settings = {
  general: {
    theme: 'dark',
    fontFamily: "Consolas, 'Cascadia Mono', 'Segoe UI Mono', monospace",
    fontSize: 13,
    lineHeight: 1.5,
    uiLang: 'en',
    zoom: 100,
    restoreSession: true,
    checkUpdates: true,
    lowRam: false,
  ramEkstrem: false,
    multilineKey: 'auto',

    aiPanel: 'bottom',
    layout: 'editor',
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

    breadcrumbs: true,
    stickyScroll: false,
    stickyScrollMaxLines: 3,
    minimapRenderCharacters: false,
    indentGuides: true,
    colorDecorators: true,
    unicodeHighlight: true,
    bracketPairColorization: true,

    snippetSuggestions: 'inline',
    ghostText: false,
  },
  theme: { current: 'zephyr-dark', accent: '#3884ff' },
  background: { image: '', opacity: 100, size: 'fill', transparan: true },
  sidebar: 'left',
  layout: 'default',
  shortcuts: {},
  models: { activeProvider: 'custom', providers: {}, answerLang: 'follow', ragEnabled: false, ragUrl: 'http://localhost:7777', ragProject: '', ragK: 4 },
  agents: { maxPanes: 6, order: [], startCommands: {}, attachActiveFile: false },

  subagent: { maxParallel: 4, maxSteps: 15, allowWrite: false, showPanel: true, autoCollapse: true, model: '', provider: '' },
  aiPrompt: { identitas: '', caraKerja: '', aturan: '', instruksi: '' },
  allowCommands: [],
  extensions: { enabled: [], trust: {} },

  accessibility: {
    reducedMotion: false,
    screenReader: false,
    autoFocusDialog: true,
    toastDurasiMin: 3200,
  },
  git: { defaultBranch: 'main', pullBeforePush: true },
  mcp: { enabled: false, port: 9222, token: '', writeToCli: [] },
  ssh: { recentHosts: [] },
  panel: {
    visibleTabs: ['problems', 'output', 'debug', 'terminal', 'ports'],
    activeTab: 'terminal',
    height: 260,
  },
  lsp: { enabled: true, idleSeconds: 300, servers: {} },

  history: { enabled: true, maxPerFile: 50, maxDays: 30 },
  update: { lastSeenVersion: '', pendingNotes: '', seenAnnouncements: [] },
};

export interface TaskDef {
  label: string;

  kind: string;
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;

  group: string;
  isDefault: boolean;
  problemMatchers: string[];
  dependsOn: string[];

  dependsOrder: string;

  reveal: string;

  panel: string;
  isBackground: boolean;
  background: {
    activeOnStart: boolean;
    beginsPattern: string;
    endsPattern: string;
  };

  warnings: string[];
}

export interface TasksFile {
  version: string;
  tasks: TaskDef[];

  path: string;
  errors: string[];
}

export interface TaskProblem {
  file: string;
  line: number;
  column: number;
  severity: string;
  message: string;
  code: string;

  matcher: string;
}

export interface TaskRun {
  id: string;
  label: string;

  status: string;
  exitCode: number | null;
  pid: number | null;
  startedMs: number;
  endedMs: number | null;
  problems: TaskProblem[];
  lines: number;
  active: boolean;
  cwd: string;
}

export interface Snapshot {

  id: string;
  timestampMs: number;

  reason: string;
  size: number;
}

export interface HistoryInfo {

  dir: string;
  snapshots: Snapshot[];

  skip: string;
}

export interface TimelineEntry {
  kind: 'snapshot' | 'commit';

  id: string;
  timestampMs: number;
  label: string;
  detail: string;

  reason?: string;
  size?: number;
}

export interface SearchOpts {
  query: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;

  include: string;

  exclude: string;
  respectGitignore: boolean;
  includeHidden: boolean;
  maxResults?: number;

  root?: string;
}

export interface RgHit {
  path: string;

  line: number;

  col: number;
  matchLen: number;
  preview: string;

  ranges: [number, number][];
}

export interface SearchSummary {
  hits: number;
  files: number;

  truncated: boolean;
  elapsedMs: number;

  rg: string;

  error: string;
}

export interface ReplaceHasil {
  path: string;
  jumlah: number;

  snapshot: string;
  error: string;
}

export interface DebugConfig {
  name: string;
  type: string;
  request: string;
  program?: string;
  cwd?: string;
  args: string[];
  env: Record<string, string>;
  stopOnEntry: boolean;

  [k: string]: unknown;
}

export interface InvalidEntry {
  index: number;
  name: string;
  reason: string;
}

export interface LaunchFile {

  path: string;
  version: string;
  configurations: DebugConfig[];
  invalid: InvalidEntry[];
}

export interface AdapterSpec {
  id: string;
  cmd: string[];
  tcp: boolean;

  missing: string;
}

export interface Snippet {

  name: string;

  prefix: string;

  body: string;
  description: string;
  lang: string;

  sumber: string;
}

export interface SnippetFileRusak {
  path: string;
  alasan: string;
}

export interface SnippetSet {
  lang: string;
  snippets: Snippet[];
  userPath: string;
  userAda: boolean;

  rusak: SnippetFileRusak[];
}

export type TrustLevel = 'unknown' | 'trusted' | 'restricted';

export interface WsRoot {
  path: string;
  name: string;
  isRepo: boolean;
  trust: TrustLevel;
}

export interface WorkspaceInfo {
  roots: WsRoot[];

  activeRoot: string;

  file: string;

  trusted: boolean;

  perluTanya: boolean;

  alasan: string;
}

export type CliTarget =
  | { folder: string }
  | { file: { path: string; line: number | null; col: number | null } }
  | { diff: { kiri: string; kanan: string } };

export interface CliArgs {
  targets: CliTarget[];
  newWindow: boolean;
  wait: boolean;

  waitToken: string | null;
  help: boolean;
  version: boolean;

  errors: string[];

  kosong: boolean;
}
