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
  /** Optional: a session.json from before this field existed has no `pinned`. */
  pinned?: boolean;
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

  /*
   * What this turn changed on disk, and how to undo it.
   *
   * Present only on an assistant message whose run wrote at least one file —
   * a read-only turn has nothing to restore, and a button that does nothing is
   * worse than no button. Carried on the message rather than in a store field
   * so the undo sits on the turn it belongs to rather than always on the newest
   * one.
   */
  checkpoint?: import('./checkpoint').Checkpoint;
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
  /** URL server yang sudah hidup (transport http). */
  url: string;
  token: string;
  /**
   * Perintah yang dijalankan Zephyr sendiri (transport stdio).
   *
   * Server MCP dari katalog hampir semuanya didistribusikan begini -
   * `npx -y @modelcontextprotocol/server-x` - dan bicara lewat stdin/stdout,
   * bukan lewat URL. Dua transport hidup berdampingan: `command` menang kalau
   * terisi, `url` dipakai kalau tidak.
   */
  command?: string;
  args?: string[];
  /** Direktori kerja perintah (opsional; kosong = direktori app). */
  cwd?: string;
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

/**
 * One `contributes.debuggers` / `contributes.debugAdapters` entry.
 *
 * `type` is the string a `launch.json` configuration names, and the only key
 * Zephyr's debug registry is looked up by (`dap::adapter_bawaan` in
 * `src-tauri/src/dap.rs`). The rest is carried so the panel can name the
 * adapter and say what it would need to be started with.
 */
export interface ContribDebugger {
  type: string;
  label: string;
  program: string;
  runtime: string;
  languages: string[];
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
   * Debug adapters are listed here because VS Code extensions declare them,
   * and the panel has a category for them. Zephyr DOES speak DAP (`dap.rs`),
   * but its adapter registry is fixed — node (js-debug) and python (debugpy) —
   * and nothing reads `program`/`runtime` out of a manifest, so an adapter a
   * package ships is detected and reported, never started. Kept on the
   * manifest so the field survives re-serialise and the panel can show it
   * instead of the contribution vanishing at parse time.
   */
  debugAdapters?: ContribDebugger[];

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

/**
 * One line of an install report: a contribution, and what Zephyr does with it.
 */
export interface ExtKontribItem {
  kind: string;
  label: string;
  detail: string;
}

/**
 * What a package actually changes here.
 *
 * `didukung` is what the app applies, with the counts read from the files
 * themselves (UI colours, code colours, icons, key bindings, snippet packs);
 * `diabaikan` is what it cannot apply, each entry with the reason in words;
 * `ringkasan` is one line per kind, e.g. "1 theme: 12 UI colors + 11 code
 * colors". It travels with every install result and every status, because
 * "Installed" on its own is not evidence that anything moved.
 */
export interface ExtPengaruh {
  didukung: ExtKontribItem[];
  diabaikan: ExtKontribItem[];
  ringkasan: string[];
}

export interface ExtManifestStatus {
  manifest: ExtManifest | null;
  enabled: boolean;

  tercatat: boolean;
  path: string;
  error: string | null;

  /** What this package can do here; empty `didukung` = installed and inert. */
  pengaruh: ExtPengaruh;

  iconPath?: string | null;
}

export interface ExtInstallHasil {
  id: string;
  name: string;
  version: string;
  path: string;

  perluReload: boolean;
  manifest: ExtManifest;

  /** What the install changed, and what in the package was skipped. */
  pengaruh: ExtPengaruh;
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

  /*
   * A tab that is a VIEW, not a file: the AI chat and the Chat Settings page.
   *
   * They behave like VSCode's built-in tabs (Settings, Welcome, a Copilot chat
   * editor) — they open in the editor area, sit in the tab bar with a real tab
   * you can click back to, and closing the tab is what closes the view. Before
   * this they were store flags that swapped the whole editor area for a
   * full-bleed page, which is why they read as "maximize" rather than as a tab:
   * there was no tab row, no tab to return to, and nothing in the strip to
   * close.
   *
   * `path` stays null on these — they have no file — so every path-keyed code
   * path (save, reload from disk, rename, watch) treats them as untitled and
   * skips them. `view` is what routes them to their own component; a tab with
   * no `view` and no path is still the ordinary untitled buffer.
   */
  view?: 'ai-chat' | 'chat-settings' | 'search-editor';

  loaded?: boolean;

  readOnly?: boolean;

  note?: string;

  bytes?: number;

  existed?: boolean;

  groupId?: string | null;

  /*
   * A PREVIEW tab: opened by a single click, shown in italics, and replaced by
   * the next preview instead of piling up.
   *
   * Without this, browsing a folder by clicking down a list left one tab per
   * file visited — a column of tabs that all have to be closed by hand, and
   * the file the reader actually wanted is somewhere in the middle of them.
   * The reference editors solve it the same way: one reusable slot, promoted
   * to a real tab the moment the reader commits to the file (edits it, or
   * double-clicks it in the tree).
   *
   * Only ONE tab is ever a preview, and it is always the last one, so the slot
   * is found by scanning from the end.
   */
  preview?: boolean;

  /*
   * A pinned tab: never reused as a preview slot, and kept at the head of the
   * strip when tabs are reordered or restored.
   *
   * Distinct from "not a preview". A file opened deliberately is neither
   * preview nor pinned; `pinned` is the reader saying "keep this one where I
   * put it", which survives a session restart.
   */
  pinned?: boolean;
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
   * Where the AI chat lives. The legacy 'bottom' home (a tab inside the
   * terminal panel) is RETIRED — see `normalisasiSettings`, which rewrites a
   * saved 'bottom' to 'right' on load.
   *   'right'  - a dedicated right column, VSCode Secondary Sidebar style
   *   'editor' - a tab in the editor area (Copilot "Move Chat into Editor Area")
   *   'window' - a separate floating Zephyr window (Copilot "Move into New Window")
   */
  aiPanel?: 'right' | 'editor' | 'window';

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

  /*
   * External formatters, run in order on save.
   *
   * Each entry is a shell command that receives the file's text on stdin and
   * returns the new text on stdout — the shape `prettier`, `gofmt`,
   * `clang-format`, `black`, `rustfmt` and `eslint --fix` all accept, so one
   * mechanism covers every one of them.
   *
   * Chained rather than exclusive because real setups chain: `gofmt` then
   * `goimports`, `prettier` then `eslint --fix`. Run AFTER the language
   * server's own formatting, so a project formatter has the last word.
   */
  formatters?: import('./formatters').FormatterCmd[];
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

  /*
   * Code folding.
   *
   * The gutter chevron and its keybindings. Default ON, unlike `minimap` and
   * `stickyScroll`, because folding is a navigation aid for reading a file the
   * reader did not write — which is most of what an editor is used for — and
   * the gutter arrow is invisible until a foldable range exists.
   *
   * The phase-03 scaffold deliberately left `foldGutter` out to save RAM, with
   * a comment saying so; that comment was removed in a later cleanup and the
   * setting never existed, so the feature simply was not there. It is behind a
   * setting now, which is what that decision should have been: the cost is
   * paid only by readers who want the feature.
   */
  codeFolding: boolean;

  /*
   * Show the diagnostic MESSAGE at the end of the offending line, not just the
   * gutter mark and the squiggle.
   *
   * Default OFF, unlike `codeFolding`. The lens puts model- or compiler-written
   * prose into the middle of the code, and on a file with many warnings that is
   * more noise than signal. It is opt-in because the reader who wants it knows
   * they want it, while the reader who does not would find it intrusive.
   */
  diagLens: boolean;

  /*
   * Show `git blame` at the end of every line, coalesced per commit.
   *
   * Default OFF, and unlike `codeFolding` that is not a close call: it needs a
   * git repository, it shells out to `git blame` for the whole file, and the
   * answer is only wanted while asking "why is this line like this". A buffer
   * is unreadable with blame on, so it is a mode you enter and leave.
   */
  gitBlame: boolean;

  /*
   * Line numbers.
   *
   * `relative` shows the distance from the cursor line instead of the absolute
   * number, with the cursor line keeping its real number. It is the convention
   * modal editors train, because `5j` needs you to know the distance, not the
   * absolute line — so it is a three-state choice rather than a boolean.
   *
   * `'off'` removes the gutter entirely, which is worth having on its own: a
   * narrow pane loses 4-5 columns to numbers nobody reads.
   */
  lineNumbers: 'on' | 'relative' | 'off';

  /*
   * Blank lines kept above and below the cursor while scrolling.
   *
   * Without a margin the cursor can sit on the last visible line, and the next
   * few lines — which is where the code you are about to read lives — are off
   * screen. The reference editors default this to 3.
   */
  scrollMargin: number;

  /*
   * Scrolling past the last line, so the final line can be brought to the
   * middle of the window instead of stopping at the bottom.
   */
  scrollPastEnd: boolean;

  /*
   * Clicking in the empty area below the last line moves the cursor there,
   * rather than placing it at the end of the nearest line.
   */
  autoscrollOnClick: boolean;

  /*
   * Confine the text column to a readable width and centre it.
   *
   * For prose and long-form review: at 1920px a full-width paragraph is a
   * 250-character measure, and the eye loses the line on the way back. `0`
   * means full width.
   *
   * Distinct from Zen mode, which hides the surrounding chrome — this keeps
   * every panel visible and only narrows the text.
   */
  centeredWidth: number;

  /*
   * Run the language server's "fix all" action when the file is saved.
   *
   * Default OFF, and deliberately NOT bundled with `formatOnSave`. Formatting
   * only reflows text; a fix REWRITES the reader's code — removes unused
   * imports, rewrites a `var`, reorders members. That is editing on the
   * reader's behalf, so it is a separate decision they have to make.
   */
  fixAllOnSave: boolean;

  /*
   * Coloured bars in the gutter marking lines added, modified or deleted
   * against HEAD.
   *
   * Default OFF. It answers "what have I changed since the last commit", which
   * is a question about reviewing — and a review is a mode you enter, not a
   * state the editor should sit in. It also costs one `git diff` per save.
   */
  gitGutter: boolean;

  /*
   * Inlay hints: inferred types and parameter names, drawn faintly inside the
   * code by the language server.
   *
   * Default OFF. They are genuinely useful and genuinely intrusive: every
   * `let` gains a type annotation the reader did not write, which is welcome
   * while reading unfamiliar code and noise while editing code you know. Zed,
   * VS Code and rust-analyzer all default them off for that reason.
   */
  inlayHints: boolean;

  /*
   * Semantic tokens: highlighting from the language server layered over the
   * parser's own.
   *
   * Default OFF, and the reason is cost rather than taste. The tokens are a
   * request per visible range per settle, and the result repaints the buffer —
   * on a large file that is noticeable during typing. It is also the least
   * necessary of the language features: the parser already colours most of
   * what the eye needs, and the server's extra is a refinement of it.
   */
  semanticTokens: boolean;

  /*
   * Debugger inline values: the locals, shown next to the line execution is
   * stopped on.
   *
   * Default OFF, and unlike the other language features it is not about taste:
   * the values only exist while a debug session is paused, so on almost every
   * file at almost every moment there is nothing to draw. It is a switch for
   * readers who step through code and want the value in front of them rather
   * than in the Variables panel.
   */
  debugInlineValues: boolean;
}

export interface ThemeSettings {
  current: string;
  accent?: string;

  /*
   * Per-token colour overrides from the Theme Builder.
   *
   * Applied as INLINE custom properties on `:root`, which is the one place that
   * beats both `:root` and `[data-theme='…']`. That means an override needs no
   * theme file and no stylesheet change — and it also means it SURVIVES a theme
   * switch, because switching rewrites `data-theme` and leaves the inline style
   * alone.
   *
   * That is deliberate rather than accidental: a reader who tuned three colours
   * expects them to stay tuned when they change the base theme, and the builder
   * has an explicit "clear" for when they do not.
   *
   * Kept out of the theme catalogue: a built-in entry cannot carry this, because
   * the whole point is that it layers ON TOP of whichever theme is active
   * instead of replacing it.
   */
  overrides?: Record<string, string>;
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

    /*
     * Ordered per-tool permission rules, evaluated before `approvalMode`.
     *
     * FIRST MATCH WINS. The order is the precedence, so the list reads top to
     * bottom as the decision it makes — and a blanket rule belongs at the top,
     * because a rule below one that already matched never fires. See
     * `toolRules.ts` for why this is preferred over "most specific wins".
     *
     * Empty by default: with no rules the decision falls through to
     * `approvalMode`, which is exactly the behaviour before this existed.
     */
    toolRules?: import('./toolRules').ToolRule[];

    /*
     * CLI agents the reader added themselves.
     *
     * The four built-in recipes (codex, claude, gemini, opencode) are
     * hardcoded in Rust. That is fine until someone wants a fifth — a private
     * wrapper, a fork, a CLI that did not exist when this shipped — and there
     * is no way to add one. This is the way.
     *
     * `bin` is looked up on PATH like the built-ins; `promptArgs` is what the
     * CLI needs before the prompt (codex wants `exec`, claude wants `-p`).
     * Kept as a list rather than merged into the Rust table so an upgrade
     * cannot silently drop a reader's entry.
     */
    cliAgents?: {
      id: string;
      label: string;
      bin: string;
      promptArgs: string[];
    }[];
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

  /*
   * HydraFusion — adaptive model orchestration for the main chat.
   *
   * Off by default: it spends MORE requests than a plain turn when it escalates
   * or critiques, and a switch that quietly multiplies the reader's bill is not
   * a default anyone should inherit. `tiers` maps its three rungs to concrete
   * `provider/model` refs — empty means "derive them from the model catalog",
   * which is what the settings page suggests. `maxRequests` is the cost cap: how
   * many requests ONE run may spend.
   *
   * Registered in `settings.rs default_settings()` too, and that is not
   * optional: a key missing there never reaches the frontend as a default, so
   * the feature would read as off no matter what this file says.
   */
  hydrafusion?: {
    enabled?: boolean;
    tiers?: { cheap?: string; mid?: string; strong?: string };
    maxRequests?: number;
  };
  extensions: {
    enabled: string[];

    trust: Record<string, ExtTrust>;

    /** The reader's own index, read as the FIRST source when present.
     *  Superseded by `registryUrls`; kept so an existing settings.json keeps
     *  working without a migration. */
    registryUrl?: string;

    /*
     * Registry sources, in priority order.
     *
     * A list rather than one URL because a marketplace needs several at once:
     * the bundled index, a team's private one, a public mirror. With a single
     * field, pointing it at your own index silently removed the public one.
     *
     * Order is priority for the first entry on a duplicate id.
     */
    registryUrls?: string[];
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
    /**
     * Berapa tool per server MCP pihak ketiga yang dikirim ke model.
     *
     * Tanpa batas, satu server dengan ratusan tool menaruh seluruh skemanya di
     * setiap permintaan - konteks tergerus dan tool Zephyr sendiri tenggelam.
     * `0` berarti tanpa batas, untuk server tepercaya yang memang perlu semua.
     * Ini harus sama dengan `settings.rs default_settings()`.
     */
    maxToolsPerServer: number;
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

  /*
   * Pagar isi web — dipakai SEMUA tool web (browser_open, browser_read,
   * web_fetch, download) lewat `kebijakanDariSetelan` di
   * `zephyrTools/kebijakanIsiWeb.ts`, yang membaca keduanya dari objek settings
   * ini apa adanya.
   *
   * Keduanya opsional dan FAIL-CLOSED: tidak ada = izin mati dan allowlist
   * kosong (tolak semua), sama dengan default di `settings.rs default_settings()`.
   * `allowlistWeb` berisi HOST tanpa skema ("example.com", bukan
   * "https://example.com"); sebuah entri juga membuka subdomainnya
   * (`hostDiAllowlist` mencocokkan suffix). Disunting dari Chat Settings >
   * Konten web, bukan dari settings.json.
   */
  izinIsiWeb?: boolean;
  allowlistWeb?: string[];
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
    codeFolding: true,
    diagLens: false,
    gitBlame: false,
    lineNumbers: 'on',
    scrollMargin: 3,
    scrollPastEnd: false,
    autoscrollOnClick: true,
    /* 0 = full width. Off by default: the panels are already arranged around a
       full-width editor, and narrowing it unasked would move every line the
       reader is looking at. */
    centeredWidth: 0,
    fixAllOnSave: false,
    gitGutter: false,
    inlayHints: false,
    semanticTokens: false,
    debugInlineValues: false,
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

  /*
   * HydraFusion defaults. `enabled: false` and `maxRequests: 3` must match
   * `settings.rs default_settings()`: the Rust side is what an existing profile
   * actually receives on load, so a disagreement here would show a switch that
   * does not describe the value in use.
   */
  hydrafusion: { enabled: false, tiers: { cheap: '', mid: '', strong: '' }, maxRequests: 3 },

  allowCommands: [],
  extensions: { enabled: [], trust: {} },

  accessibility: {
    reducedMotion: false,
    screenReader: false,
    autoFocusDialog: true,
    toastDurasiMin: 3200,
  },
  git: { defaultBranch: 'main', pullBeforePush: true },
  mcp: { enabled: false, port: 9222, token: '', writeToCli: [], allowTerminalControl: false, maxToolsPerServer: 40 },
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
