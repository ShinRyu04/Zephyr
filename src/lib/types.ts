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

  /**
   * The signature that must ride with `reasoning`.
   *
   * Anthropic validates it against the thinking block it arrived with, so the
   * pair travels together or not at all — a block sent without its signature is
   * rejected, which is why the reasoning used to be dropped from the history
   * instead of echoed.
   */
  reasoningSignature?: string;
}

export interface ChatMsg extends AiMessage {
  id: string;

  at: number;

  streaming?: boolean;

  error?: string;

  /**
   * The opaque signature that must accompany `reasoning` when it is sent back.
   *
   * Anthropic returns it in a delta of its own once the thinking block closes,
   * and rejects a thinking block returned without it. Carried on the message
   * because the chat's history is rebuilt from these messages every turn.
   */
  reasoningSignature?: string;

  model?: string;

  attached?: { path: string; bytes: number; truncated: boolean };

  images?: string[];

  tools?: AgentToolRun[];

  /*
   * How long the model spent reasoning, in milliseconds.
   *
   * Recorded separately from the reasoning text because the two arrive
   * independently: the text streams in chunks and the clock runs on the Rust
   * side, so the block header can state a duration even when the provider sent
   * no reasoning at all, and it can state it without counting characters.
   */
  reasoningMs?: number;
}

export interface AgentToolRun {
  name: string;
  args: string;
  result: string;
  ok: boolean;

  at: number;

  /*
   * How long the call took, in milliseconds.
   *
   * Optional: runs written before this field existed are rehydrated from disk
   * without it, and a missing value has to render as "no badge" rather than as
   * "0ms", which would read as a tool that did nothing.
   */
  ms?: number;

  /*
   * What the call actually produced, in the same units the tool reported it.
   *
   * The collapsed row carries a one-line summary,
   * "read · 12 lines · 20.7KB", "1 replacement · L72", "+7 −3", so the reader
   * can tell a 12-line read from a 400-line one without opening either. The
   * fields are optional because every transcript written before this existed
   * has none of them, and the row has to render cleanly with no status at all
   * rather than inventing one.
   */
  lines?: number;
  bytes?: number;
  additions?: number;
  deletions?: number;
  atLine?: number;

  /*
   * How a shell call ended, kept apart from its output.
   *
   * A command's exit code is the single most useful fact about it and it used
   * to be buried in the result text ,  "exit code: 1" on line one of a 400-line
   * blob. Stored as its own field it becomes a badge on the collapsed row, and
   * stderr can be split out so a failure shows its error instead of its noise.
   */
  exitCode?: number;
  stderr?: string;

  /*
   * Where this call sits inside the message text, so the transcript can
   * interleave narration and tool rows in the order they happened instead of
   * stacking every tool above every text. The value is a character offset into
   * the message's content at the moment the run is appended; the renderer
   * slices the text at those offsets. Optional: transcripts written before
   * this existed have no offsets and render the old way (tools, then text).
   */
  atChar?: number;
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
  /** run everything without asking */
  | 'auto'
  /** reject all terminal_exec and editor_write */
  | 'readonly'
  /** work straight away: safe to run, destructive still asks */
  | 'work';

export interface AiChunk {
  id: string;
  text?: string;
  err?: string;
  done?: boolean;
  /** Token counts the provider reported for this call. */
  usage?: { input: number; output: number };

  toolDone?: boolean;

  content?: string;

  toolCalls?: AgentToolCall[];

  cancelled?: boolean;

  reasoning?: string;

  /**
   * The opaque signature that must accompany `reasoning` when it is sent back.
   *
   * Anthropic returns it once the thinking block closes, in a delta of its own,
   * and rejects a thinking block returned without it — which is why the
   * signature is carried all the way to the history rather than only the text.
   */
  reasoningSignature?: string;
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

export interface ContribGrammar {
  language: string;
  scopeName: string;
  path: string;
}

export interface ExtContributes {
  themes: ContribTheme[];
  keymaps: ContribKeymap[];
  snippets: ContribSnippet[];
  languages: ContribLanguage[];
  iconThemes: ContribIconTheme[];
  commands: ExtCommand[];

  /*
   * TextMate grammars are listed here because VS Code extensions contain them,
   * but Zephyr has no TextMate engine: highlighting comes from the bundled
   * CodeMirror languages. Kept so the field is not lost on re-serialise and so
   * the loader can warn the user honestly instead of failing silently.
   */
  grammars?: ContribGrammar[];
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

  /**
   * The model's own reasoning for this turn.
   *
   * Kept on the message so it can be sent BACK on the next request. Without it
   * the conversation drops the model's chain of thought at every step: the
   * provider is asked to continue a task while being shown only the conclusions,
   * not the reasoning that led there — so a multi-step run re-derives what it
   * already worked out, or contradicts it. Providers that support it expect
   * their own reasoning returned to them; a signature may also be attached,
   * which the adapter must echo exactly or the provider rejects the turn.
   */
  reasoning?: string;

  /**
   * Provider-specific opaque blob that must accompany `reasoning`.
   *
   * Anthropic returns a signature with each thinking block and validates it on
   * the way back in. It is not readable and must not be modified — it is stored
   * and echoed verbatim, which is why it travels separately from the text.
   */
  reasoningSignature?: string;
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
  // phase 22: Run & Debug
  | 'debug'
  | 'ai'
  | 'terminal'
  | 'extensions'
  | 'devenv'
  | 'api'
  | 'sftp'
  | 'tests'
  // One rail entry for the four workspace tools. They were four separate
  // icons, which crowded the rail for views that share a purpose: they all
  // act on the local machine rather than on the open file.
  | 'tools'
  | 'settings';

export type DevenvServer = 'nginx' | 'apache' | 'none';
export type DevenvServiceId = 'nginx' | 'apache' | 'mysql' | 'postgres' | 'redis' | 'cron';

export interface DevenvRuntime {
  /** Version currently selected for this runtime. Empty means "global". */
  aktif: string;
  /** Every version detected on the machine. */
  daftar: string[];
  /** Absolute path of the binary, when the user pointed at one manually. */
  path?: string;
}

export interface DevenvService {
  autoStart: boolean;
  versi: string;
  port: number;
  /** Every version found next to the active one, so the row can switch. */
  versions?: string[];
  /** Executable the row resolved to, shown in the tooltip. */
  path?: string;
  /** Windows service name when the tool runs under the service manager. */
  windowsService?: string;
}

export interface DevenvProject {
  nama: string;
  path: string;
  php: string;
  node: string;
  /** Built by the Rust scan from the configured domain. */
  url?: string;
  /** composer.json / package.json found in the project folder. */
  composer?: boolean;
  package?: boolean;
}

export interface DevenvSettings {
  rootFolder: string;
  domain: string;
  server: DevenvServer;
  runtimes: Partial<Record<'node' | 'php' | 'python' | 'rust' | 'git', DevenvRuntime>>;
  services: Partial<Record<DevenvServiceId, DevenvService>>;
  projects: DevenvProject[];
}

export interface GeneralSettings {
  theme: 'dark' | 'light' | 'system';
  fontFamily: string;
  fontSize: number;
  lineHeight: number;

  uiLang: string;
  zoom: number;
  restoreSession: boolean;
  checkUpdates: boolean;

  /*
   * Added in 1.2.0. All four are optional because a settings file written by an
   * older version has none of them, and `deep_merge` MERGES rather than
   * replaces - so the Rust defaults are what actually get used on upgrade, and
   * these `?` marks are a promise that the UI must fall back rather than assume.
   */
  confirmExit?: boolean;
  minimizeToTray?: boolean;
  defaultTerminal?: 'default' | 'pwsh' | 'powershell' | 'cmd' | 'bash' | 'wsl';
  /* A full path to the shell binary. Empty means "use defaultTerminal". */
  shellPath?: string;

    lowRam?: boolean;

  multilineKey?: 'auto' | 'csiu' | 'lf' | 'backslash';

  /*
   * Where the AI chat lives.
   *   'bottom' - a tab inside the terminal panel (legacy)
   *   'right'  - a dedicated right column, VSCode Secondary Sidebar style
   *   'editor' - a tab in the editor area (Copilot "Move Chat into Editor Area")
   *   'window' - a separate floating Zephyr window (Copilot "Move into New Window")
   */
  aiPanel?: 'bottom' | 'right' | 'editor' | 'window';

  layout?: 'editor' | 'terminal';

  /*
   * Panel-visibility preferences, saved by the "Customize Layout" menu.
   *
   * Declared here rather than left to a cast so the type checker can see it.
   * These used to be written to `layout` above - an object over a string - which
   * froze `layout === 'terminal'` at false for anyone who opened that menu.
   *
   * Every field is optional because a settings file written before this key
   * existed has none of them, and because `deep_merge` merges rather than
   * replaces: a partial object is a legitimate shape, not a broken one.
   */
  layoutPrefs?: {
    menuBar?: boolean;
    activityBar?: boolean;
    sidebar?: boolean;
    panel?: boolean;
    statusBar?: boolean;
    posisiSidebar?: 'left' | 'right' | 'top' | 'bottom';
    kerapatan?: string;
    subKanan?: boolean;
  };
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
  /**
   * Vim keybindings. Ketika menyala, tombol arah dan mode normal/insert
   * mengikuti vim, dan itu MENGALAHKAN keymap editor biasa - bukan menyamping
   * dengannya.
   */
  vimMode: boolean;
  /**
   * Menyimpan otomatis tanpa Ctrl+S.
   *
   * `off` sengaja jadi default: menyimpan berkas tanpa diminta adalah tindakan
   * yang mengubah disk, dan sebuah editor tidak boleh mengambil alih keputusan
   * itu pada profil baru.
   *
   * `afterDelay` menyimpan berkas yang baru berubah setelah jeda tenang;
   * `onFocusChange` menyimpannya saat jendela kehilangan fokus.
   */
  autoSave: 'off' | 'afterDelay' | 'onFocusChange';
  /**
   * Jeda tenang sebelum simpan otomatis, dalam milidetik.
   *
   * "Tenang" berarti timer di-reset setiap perubahan baru: yang diukur bukan
   * jarak sejak ketikan pertama, melainkan sejak ketikan TERAKHIR. Menyimpan
   * di tengah ketikan menghasilkan banyak tulisan disk untuk satu kalimat.
   */
  autoSaveDelay: number;

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

      answerStyle: string;

      ragEnabled: boolean;

      ragUrl: string;

      ragProject: string;

      ragK: number;
    };

  allowCommands: string[];

  agents: {
    maxPanes: number;
    order: string[];
    startCommands: Record<string, string[]>;
    attachActiveFile: boolean;
    /**
     * Standing instructions appended to the system prompt on every turn, on top
     * of whatever persona is active. Kept separate from a persona because this
     * travels with the user, not with an identity: switching personas must not
     * lose it, and neither persona nor this text may overwrite the other - they
     * are stacked layers, not alternatives.
     */
    customInstructions: string;

    /*
     * Chat avatars.
     *
     * ONE switch for both sides rather than one each: the reason to turn them
     * off is visual clutter, and nobody wants the robot gone while their own
     * face stays. A single switch is also the honest shape of the promise -
     * "show avatars in chat" - which is what the setting is called.
     *
     * `undefined` means ON, and that is deliberate: the Rust default is what
     * actually applies on upgrade, so the UI must treat a missing value as the
     * wanted state rather than as "off". Reading it as `!== false` instead of
     * `=== true` is what makes that true.
     *
     * `userAvatarPath` is a path on disk, not image bytes - settings.json stays
     * small and the cache stays out of it.
     */
    chatAvatar?: boolean;
    userAvatarPath?: string;
  };

  /**
   * Rules: the write guard that refuses a save matching a known-bad pattern.
   *
   * OFF by default. This setting can refuse a write, and a feature that says no
   * to a save has to be opted into - the same reasoning as MCP's terminal control.
   * The default here and the default in `rulesRuntime.ts` must agree: if they
   * drift, the Settings page shows one thing and the write path enforces another,
   * which is the worst of both - a dead switch and a surprise.
   *
   * `disabled` holds the ids of rules the user switched OFF individually, not the
   * ones switched on. Storing the negative means a rule added in a later version
   * arrives enabled instead of silently missing, and the list stays short because
   * most users disable a few and leave the rest alone.
   */
  rules?: {
    /** Master switch. Off means the write path runs no checks at all. */
    enabled?: boolean;
    /** Rule ids the user turned off, by id from `rulesCatalog.ts`. */
    disabled?: string[];
  };

  /**
   * Voice: reading replies aloud, and dictating a message.
   *
   * Everything is optional because these fields are new. An `undefined` must
   * behave exactly as the Rust default does, or an existing install starts
   * behaving differently the moment the UI reads a value the file does not yet
   * have - the same trap `chatAvatar` documents above.
   *
   * `inputLang` is a BCP-47 tag (`en-US`), and it drives speech RECOGNITION:
   * the browser's recognizer is built for one language at a time and does not
   * switch on its own, so dictating English with `id-ID` set produces confident
   * nonsense rather than an error. It also seeds the spoken voice when `voiceId`
   * is empty.
   *
   * `voiceId` is a platform voice URI, not an index: indices shift between
   * sessions and would silently speak in the wrong voice after a restart.
   */
  voice?: {
    /** Master switch. Off hides the controls rather than leaving dead buttons. */
    enabled?: boolean;
    /** Speak each new answer without being asked. */
    speakReplies?: boolean;
    /** BCP-47 tag for dictation, and the fallback for the spoken voice. */
    inputLang?: string;
    /** Platform voice URI. Empty means "let the platform choose". */
    voiceId?: string;
    /** 0.5 to 2. Slow is the accessible end, so the range is wide. */
    rate?: number;
    pitch?: number;
    volume?: number;
    /** Say the answer without reading code blocks aloud. */
    skipCode?: boolean;
    /** Use provider neural TTS instead of the WebView voice. Off by default: it bills per character. */
    neuralEnabled?: boolean;
    /** Which provider speaks. Empty means the active chat provider. Key comes from that provider's saved key. */
    neuralProvider?: string;
    /** Own server URL for voice. Empty means the chat provider's base URL. Fill for a local TTS server. */
    neuralBaseUrl?: string;
    /** TTS model id, typed by hand. Empty means the per-provider default. */
    neuralModel?: string;
    /** Provider voice id. Empty means the provider default. */
    neuralVoiceId?: string;
    /** Pick the neural voice from the answer language. On by default. */
    neuralFollowLang?: boolean;
    /** 0 to 2. Above 1 boosts, which the WebView slider cannot do. */
    neuralVolume?: number;
  };
  /**
   * Microphone: dictating a message.
   *
   * Split out of `voice`, which now only covers the AI speaking back.
   * `inputLang` still lives under `voice` on disk for existing installs and is
   * read as the fallback when `mic.lang` is unset.
   */
  mic?: {
    /** Master switch. Off hides the mic button in the composer. */
    enabled?: boolean;
    /** Which provider transcribes. Empty means the active chat provider. */
    provider?: string;
    /** Own server URL for dictation. Empty means the chat provider's base URL. */
    baseUrl?: string;
    /** STT model id, typed by hand. Empty means the per-provider default. */
    model?: string;
    /** BCP-47 tag the recogniser listens for. Falls back to `voice.inputLang`. */
    lang?: string;
    /** Send the transcript to the AI as soon as dictation stops. */
    autoSend?: boolean;
  };

  subagent: {

    maxParallel: number;

    maxSteps: number;

    allowWrite: boolean;

    showPanel: boolean;

    autoCollapse: boolean;

    model: string;
    provider: string;
    /** Seconds a subagent may sit idle before its step is abandoned. */
    idleSecs: number;
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
  mcp: {
    enabled: boolean;
    port: number;
    token: string;
    writeToCli: string[];
    /**
     * Izinkan agen LUAR (lewat MCP) mengendalikan terminal lewat `terminal_exec`.
     *
     * Bawaannya `false`, dan memang harus begitu: ini memberi klien MCP mana
     * pun kemampuan menjalankan perintah di mesin user. Rust sudah membaca
     * pengaturan ini sejak lama, tapi TIDAK ADA satu pun tempat di UI untuk
     * menyetelnya - jadi fiturnya terkunci mati permanen, dan tidak ada cara
     * menghidupkannya selain menyunting berkas pengaturan sendiri. Sakelarnya
     * ditambahkan di halaman MCP.
     */
    allowTerminalControl: boolean;
  };
  ssh: { recentHosts?: string[] };

  panel: { visibleTabs: string[]; activeTab: string; height: number };

  lsp: {
    enabled: boolean;
    idleSeconds: number;
    servers: Record<string, { enabled?: boolean; cmd?: string[]; initOptions?: Record<string, unknown> }>;
  };

  tests: {
    /** 'auto' detects the framework from the project; anything else pins it. */
    framework: 'auto' | 'vitest' | 'jest' | 'pytest' | 'cargo' | 'go';
    /** Run the suite as soon as the workspace is opened. */
    autoRunOnOpen: boolean;
    /** Run a single test file when it is saved. */
    runOnSave: boolean;
    /** Kill a run that takes longer than this many seconds. */
    timeoutSeconds: number;
  };

  devenv: DevenvSettings;

  history: {
    enabled: boolean;

    maxPerFile: number;

    maxDays: number;

    /** Ceiling on snapshots across ALL files, oldest pruned first. */
    maxTotal: number;
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
    multilineKey: 'auto',

    aiPanel: 'right',
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
    vimMode: false,
    autoSave: 'off',
    autoSaveDelay: 1000,
  },
  theme: { current: 'zephyr-dark', accent: '#3884ff' },
  background: { image: '', opacity: 100, size: 'fill', transparan: true },
  sidebar: 'left',
  layout: 'default',
  shortcuts: {},
  models: { activeProvider: 'custom', providers: {}, answerLang: 'follow', answerStyle: 'short', ragEnabled: false, ragUrl: 'http://localhost:7777', ragProject: '', ragK: 4 },
  agents: { maxPanes: 6, order: [], startCommands: {}, attachActiveFile: false, customInstructions: '' },

  subagent: { maxParallel: 4, maxSteps: 15, allowWrite: false, showPanel: true, autoCollapse: true, model: '', provider: '', idleSecs: 90 },

  allowCommands: [],
  extensions: { enabled: [], trust: {} },

  accessibility: {
    reducedMotion: false,
    screenReader: false,
    autoFocusDialog: true,
    toastDurasiMin: 3200,
  },
  git: { defaultBranch: 'main', pullBeforePush: true },
  mcp: { enabled: false, port: 9222, token: '', writeToCli: [], allowTerminalControl: false },
  ssh: { recentHosts: [] },
  panel: {
    // `tests` is deliberately absent: the Test Explorer panel is opt-in and
    // stays hidden until the user shows it from the panel tab menu, so a fresh
    // install opens with the everyday tabs only.
    visibleTabs: ['problems', 'output', 'debug', 'terminal', 'ports'],
    activeTab: 'terminal',
    height: 260,
  },
  lsp: { enabled: true, idleSeconds: 300, servers: {} },

  history: { enabled: true, maxPerFile: 200, maxDays: 30, maxTotal: 2000 },
  tests: { framework: 'auto', autoRunOnOpen: false, runOnSave: false, timeoutSeconds: 300 },
  devenv: {
    rootFolder: 'D:\\DevEnv',
    domain: '.test',
    server: 'nginx',
    runtimes: {},
    services: {},
    projects: [],
  },
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
