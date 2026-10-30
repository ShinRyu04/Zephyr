export type Encoding = 'utf8' | 'utf8-bom' | 'ansi' | 'utf16le' | 'utf16be';
export type LineEnding = 'crlf' | 'lf';

/*
 * Tier model di composer (D1, parity Qoder): Auto / Efficient / Fast /
 * Ultimate. Bukan nama model — tiap tier dipetakan ke model konkret milik
 * provider aktif di `modelCatalog.tsx` SEBELUM request keluar. "Auto" tidak
 * disimpan sebagai apa pun (null di store): model pilihan user yang menang.
 */
export type ModelTier = 'auto' | 'efficient' | 'fast' | 'ultimate';

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

/** A workspace directory, relative to the root (`list_workspace_folders`). */
export interface QuickFolder {
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

/*
 * `error` is the watcher itself failing to start, not a change on disk. Rust
 * has always been able to send it (`explorer.rs`), but the type never allowed
 * it, so the frontend had no way to name — let alone react to — the event.
 */
export type FsChangeKind = 'create' | 'remove' | 'modify' | 'error';

export type PtyKind = 'shell' | 'private' | 'cmd' | 'bash' | 'wsl' | 'pwsh' | 'agent' | 'ssh';

/**
 * Jenis pane di panel terminal. Browser TIDAK termasuk: browser sekarang hidup
 * sebagai tab di area editor (`components/editor/BrowserTab.tsx`), jadi pane di
 * sini selalu punya proses PTY.
 */
export type PaneKind = PtyKind;

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

  exitCode?: number | null;

  /**
   * Shell integration (OSC 633). `lastExit` adalah kode keluar perintah
   * TERAKHIR yang dijalankan di pane ini; `undefined` berarti shell belum
   * memberi tahu apa pun (integrasi mati atau shell tanpa dukungan).
   */
  lastExit?: number;
  /** Perintah terakhir menurut OSC 633 `E` (tidak semua shell mengirimnya). */
  lastCommand?: string;
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
   * Reasoning per langkah, satu segmen per fase "pikir" di loop agent.
   *
   * Isi totalnya sama dengan `reasoning` (yang tetap dipelihara untuk echo ke
   * provider dan blok reasoning lama), tetapi terpotong per posisi tool, jadi
   * transcript bisa menampilkan "Thought · 3s" di antara baris tool seperti
   * produk rujukan. `undefined` pada transkrip lama = satu blok saja.
   */
  reasoningSegmen?: ReasoningSegmen[];

  /*
   * Turn ini diproduksi dalam run mode 'plan': agen diminta menyusun rencana
   * dan BERHENTI sebelum mengubah apa pun. Di permukaan Agent window, pesan
   * dengan tanda ini dirender sebagai kartu "Plan" (header + salin + badan
   * ter-clamp + "View full plan"), bukan jawaban biasa.
   */
  plan?: boolean;

  /*
   * Pesan ini adalah RENCANA Experts Mode (id run-nya disimpan di sini).
   *
   * Dirender sebagai kartu rencana ala Qoder: daftar tugas + tombol mulai.
   * Data tugasnya hidup di `expertsStore` (dipersist ke localStorage), bukan
   * di pesan — pesan hanya membawa penunjuknya, jadi kartu yang sama tetap
   * hidup setelah reload tanpa menduplikasi state ke dua tempat.
   */
  expertsPlan?: string;

  /*
   * Token counts the provider reported for THIS turn.
   *
   * Kept on the message (not only in the HydraFusion receipt) because the Task
   * Summary needs a figure that survives scrolling and a reload: "how full is
   * the context right now" is answered by the newest turn that actually carried
   * a number. `undefined` means "the provider did not report it" - that is not
   * zero, and the panel must not render it as 0%.
   */
  usage?: { input: number; output: number };

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

  /*
   * The files THIS run changed, frozen when the run ended.
   *
   * A snapshot rather than a live read on purpose. The transcript's card used
   * to be built from `diffStore` at render time and pinned to the end of the
   * list, so it followed the chat forever and always described the newest run -
   * a reader scrolling back saw one card claiming to be every turn's work.
   * Carried on the message, it belongs to the turn that produced it: it stays
   * where it was inserted and scrolls away with the rest of the history, which
   * is what the reference does.
   *
   * Absent on a read-only turn - there is nothing to summarise, and an empty
   * card is worse than none.
   */
  perubahan?: {
    path: string;
    /** File name with its extension. */
    nama: string;
    /** Name without the extension - the bold part of the row. */
    judul: string;
    /** Directory part; empty for a file at the workspace root. */
    dir: string;
    tambah: number;
    hapus: number;
    gagal: boolean;
  }[];

  /*
   * What HydraFusion decided for THIS turn, when it routed it.
   *
   * Carried on the message rather than read from `hydraTerakhir` because that
   * store field only describes the LAST run: scrolling back would show the
   * newest route beside every older answer, which is a lie about what produced
   * them. Present only on assistant turns HydraFusion actually routed.
   */
  hydra?: {
    jalur: string;
    provider: string;
    model: string;
    request: number;
    berhenti: string;
    pemakaian?: { input: number; output: number };
    catatanTahap: string[];
  };
}

/*
 * Satu fase reasoning dalam satu giliran agent, untuk timeline kronologis.
 *
 * Frame reasoning datang per langkah loop (pikir -> teks -> tool -> pikir …).
 * `hinggaTool` menandai posisi segmen: 0 = pikiran pembuka, k = pikiran di
 * antara tool k-1 dan tool k, `tools.length` = pikiran terakhir sebelum
 * jawaban akhir. Renderer menyisipkannya ke garis waktu di posisi itu.
 */
export interface ReasoningSegmen {
  hinggaTool: number;
  teks: string;
  /*
   * Konvensi jam yang sama dengan `reasoningMs`: epoch ms selama segmen masih
   * mengalir (di atas 1e12), lalu membeku menjadi durasi saat teks langkah
   * itu mulai datang atau giliran tamat.
   */
  ms: number;
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

  /*
   * Mode yang MENEMANI sesi ini ('agent' | 'experts' | 'chat') — dicap saat
   * pesan dikirim di mode tersebut. Qoder: tiap chat mengingat mode-nya —
   * membuka chat lama memindahkan chip mode kembali ke mode chat itu.
   */
  mode?: string;
  /**
   * The workspace the conversation belongs to, recorded when the session is
   * created or first used.
   *
   * The Agents window groups its session list by workspace, the way VS Code
   * does, and without this field there is nothing to group by — sessions carry
   * no other link to a folder. Sessions persisted before this field existed
   * have `undefined`, and read as belonging to whichever workspace is active
   * (see AgentsSessions), so nothing disappears from the list.
   */
  workspace?: string;

  /*
   * Pinned conversations sort above everything else in the Agents list.
   *
   * Optional because every transcript written before this existed has no such
   * field; `undefined` means "not pinned", which is the correct default and
   * keeps old data loading without a migration.
   */
  pinned?: boolean;

  /*
   * Unread marker for the session lists.
   *
   * `unread` is set when a run finishes in a conversation the reader is not
   * looking at, and cleared the moment that conversation is selected. It is a
   * convenience flag, not a source of truth: `undefined` reads as "read" so
   * every transcript written before this field existed loads unchanged.
   *
   * `lastReadAt` records when the marker was last cleared. It is only used to
   * sort/annotate; nothing depends on it being present.
   */
  unread?: boolean;
  lastReadAt?: number;

  /**
   * Background agents this conversation started that have not been dismissed.
   *
   * Stored on the session (see `SesiLatar`) so the running ring, the unread
   * badge and the status section survive closing the panel. Optional and
   * pruned in `loadSessions`: transcripts written before this existed simply
   * have none.
   */
  latar?: SesiLatar[];

  approval?: ApprovalMode;
}

/**
 * A background agent that outlives the run that started it.
 *
 * Written by `subagentStore`/`scheduleStore` into the session's own
 * `latar` list, because "this chat still has work running" is a property of the
 * conversation - the reader closes the panel, comes back, and the ring, the
 * badge and the section all have to agree about it without the component that
 * started the work being mounted any more.
 *
 * Deliberately a SNAPSHOT, not a live handle: the subagent itself lives in its
 * own in-memory store, which a restarted window does not have. What is stored
 * here is only what the list needs to say (what it is, when it started, how it
 * ended), so a stale entry after a restart is visibly finished ('hilang' or
 * whatever outcome was last written) rather than pretending to run.
 */
export interface SesiLatar {
  id: string;
  jenis: 'subagent' | 'jadwal';
  nama: string;
  mulai: number;
  selesai?: number;
  status: 'jalan' | 'selesai' | 'gagal' | 'batal' | 'menunggu';
  /** Unseen since it finished - cleared when the session is opened. */
  belumDibaca?: boolean;
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

/*
 * Multi-repo Source Control: satu workspace bisa memuat beberapa repo, dan
 * panel memilih salah satunya. `relative` adalah path repo terhadap workspace
 * ("" untuk workspace itu sendiri) sehingga UI tidak perlu memotong string
 * path absolut untuk memberi label.
 */
export interface ScmRepo {
  path: string;
  name: string;
  relative: string;
  branch: string | null;
}

export interface ScmRepoList {
  repos: ScmRepo[];
  active: string | null;
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

/** One file inside a commit (Committed Changes list). */
export interface GitCommitFile {
  path: string;
  status: string;
  add: number;
  del: number;
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
  /**
   * Environment variables for a stdio server (NAME -> value).
   *
   * Part of the `mcpServers` document every MCP server publishes, and the only
   * way a server that needs a key starts at all.
   */
  env?: Record<string, string>;
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
   * but its adapter registry is fixed — node (js-debug), python (debugpy),
   * codelldb, dlv, java-debug and netcoredbg — and nothing reads
   * `program`/`runtime` out of a manifest, so an adapter a
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
  view?:
    | 'ai-chat'
    | 'chat-settings'
    | 'search-editor'
    | 'extensions'
    | 'tools'
    | 'diff-view'
    | 'plan'
    | 'subagent'
    | 'browser'
    | 'experts-task'
    | 'experts-canvas';

  /*
   * Alamat satu tugas Experts ("Task N: <judul>").
   *
   * Berbeda dari view view lain, `experts-task` TIDAK satu-instance: tiap
   * worker dalam satu run Experts boleh membuka tabnya sendiri bersamaan,
   * seperti Qoder yang menamparkan Task 1..N sebaris di bar tab. Tab yang
   * sama (view + ekspertId sama) tetap dipakai ulang, bukan ditumpuk.
   */
  ekspertId?: string;

  /*
   * The address a `browser` tab is showing. Only meaningful on `view:'browser'`
   * tabs; it is what lets `bukaViewAi('browser', { url })` say WHICH page the
   * single Browser tab should now load. Every other tab leaves it undefined.
   */
  url?: string;

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
  | 'csharp'
  | 'php'
  | 'r'
  | 'julia'
  | 'haskell'
  | 'elixir'
  | 'plain';

export type ActivityId =
  | 'explorer'
  | 'search'
  | 'outline'
  | 'scm'
  /*
   * The browser lives in the EDITOR area as a tab, and this rail entry is only
   * its front door - the same relationship `extensions` and `tools` have. It
   * sits between Source Control and Run & Debug because it is neither a
   * file-centric view (explorer/search/scm) nor a machine-side tool.
   */
  | 'browser'
  // phase 22: Run & Debug
  | 'debug'
  | 'ai'
  | 'terminal'
  | 'extensions'
  /*
   * `wiki` USED to be here: a Repo Wiki / Atlas surface for documenting this
   * codebase. It was removed because the feature did not earn its place in a
   * rail meant for the editor's own views - the generated pages aged quietly
   * and the cards duplicated what the agent already reads from the files.
   *
   * The value stays in the union so a saved profile that names it still parses;
   * `setActivity` coerces an unknown activity to Explorer, so an old session
   * lands somewhere real instead of a blank column.
   */
  | 'wiki'
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
  minimizeToTray?: boolean;    defaultTerminal?: 'default' | 'pwsh' | 'powershell' | 'cmd' | 'bash' | 'wsl';
    /**
     * Shell integration (OSC 633): pane PowerShell di-dot-source dengan skrip
     * kecil supaya Zephyr tahu folder kerja dan kode keluar tiap perintah.
     * Opsional karena profil lama belum punya key ini.
     */
    shellIntegration?: boolean;
    /**
     * Simpan buffer yang belum di-save ke localStorage dan pulihkan saat app
     * dibuka lagi. Nama "hot exit" sama dengan istilah editor lain; mati
     * berarti menutup jendela sama dengan membuang perubahan.
     */
    hotExit?: boolean;
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

  /**
   * Whether the first-run wizard has been completed.
   *
   * Absent means "not yet", which is what a fresh install looks like - so the
   * wizard opens on day one and never again. It is written when the reader
   * presses Done, and NOT when the window is closed: a wizard that can be
   * dismissed without recording that it was seen reappears forever, and one that
   * records a mere glance has been read by nobody.
   */
  onboarded?: boolean;
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

export interface TerminalProfile {
  id: string;
  name: string;
  /** Shell id from `list_shells` (pwsh/powershell/cmd/bash/wsl) or a full path. */
  shell: string;
  /** Starting folder; empty means the workspace root. */
  cwd?: string;
  /** Typed into the shell once it is up (e.g. `npm run dev`). */
  command?: string;
  /** Spawn clean: no history, scrollback dropped on close. */
  private?: boolean;
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
      /* `fullUrl`: the reader typed the WHOLE endpoint, not a base URL, so
         `list_models`/chat must not append `/models` or `/chat/completions`.
         Saved per provider (camelCase, same as `baseUrl`) and read by Rust in
         `secrets.rs` when the caller passes no explicit flag. */
      providers: Record<string, { baseUrl?: string; model?: string; fullUrl?: boolean }>;

      answerLang: string;

      answerStyle: string;

      ragEnabled: boolean;

      ragUrl: string;

      ragProject: string;

      ragK: number;

      /**
       * Models the READER added, as opposed to the ones the catalogue ships.
       *
       * Kept separate from `providers[].model` on purpose: that field is "which
       * model answers this turn" (one value per provider), while this is a LIST
       * of endpoints the reader has discovered or typed. A model detected from a
       * gateway belongs here even if it is not the active one - that is the
       * whole point of detecting it.
       *
       * `baseUrl` is stored per entry because a custom model usually comes from
       * a gateway whose URL is not the provider's default; without it the row
       * would be unusable the moment the provider default changes.
       */
      custom?: {
        id: string;
        label: string;
        provider: string;
        baseUrl?: string;
        ctx?: number;
        /** Detected from the provider's own model list, not typed by hand. */
        terdeteksi?: boolean;
      }[];
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

    /**
     * The agent selected in the composer: `''` / `'agent'` for the built-in
     * Agent, `'chat'` for Chat, or a `CustomAgent` id.
     *
     * Global rather than per-workspace on purpose - the reader switches agents
     * the way they switch models, and a switch that came back after re-opening
     * a folder would feel like the picker had not taken.
     */
    agentAktif?: string;

    /*
     * `chatAvatar` was removed: the transcript no longer renders avatars, so a
     * switch that could only turn on something that does not exist was dead
     * weight.
     *
     * `userAvatarPath` stays in the schema because old profiles still carry it.
     * Nothing reads or writes it any more; dropping the field would make those
     * profiles fail validation for a value nobody uses.
     */
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
  /**
   * Named terminal profiles.
   *
   * A profile is the answer to "open my dev shell": a shell, a folder and a
   * command, named once. Without it the reader re-creates the same pane by
   * hand (open terminal, cd, run) several times a day, and the shell picker
   * only ever offers bare shells.
   *
   * Optional in the schema: profiles written by a newer version must not make
   * an older profile file invalid.
   */
  terminalProfiles?: TerminalProfile[];

  /**
   * Editor overrides per language, keyed by the identifier
   * `bahasaDariPath` returns ("typescript", "python", "markdown", …).
   *
   * One global tab size is wrong for most real projects: Python wants 4,
   * JSON/YAML 2, and Makefile wants a tab. This is the same idea as VS Code's
   * `"[typescript]": { … }` blocks, kept to the handful of settings where the
   * difference actually matters — tab size, spaces, wrapping and the minimap.
   */
  perLanguage?: Record<
    string,
    {
      tabSize?: number;
      insertSpaces?: boolean;
      wordWrap?: boolean;
      minimap?: boolean;
    }
  >;

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
   * Computer Use — kontrol desktop oleh agent. ENGINE-nya BELUM ada: yang
   * hidup di batch ini hanya pengaturannya (Agent Customizations > Computer
   * Use) dan tombol di composer. Field ini disiapkan supaya engine yang akan
   * datang tinggal membaca flag yang sama.
   */
  computerUse: {
    enabled: boolean;
    showButton: boolean;
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
    /**
     * Nyalakan server MCP 9222 sendiri saat aplikasi dibuka.
     *
     * MCP adalah fitur unggulan Zephyr, tapi sebelumnya harus dinyalakan dengan
     * tangan setiap kali aplikasi dibuka - dan server yang mati tidak bisa
     * dipakai klien mana pun, jadi fitur andalannya praktis tidak pernah hidup.
     * `enabled` di atas adalah keadaan SAAT INI (ditulis oleh start/stop);
     * `autostart` adalah NIAT untuk sesi berikutnya, dan sengaja dipisah supaya
     * mematikan server sekali tidak ikut mematikan autostart.
     *
     * Harus sama dengan `settings.rs default_settings()`.
     */
    autostart: boolean;
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

  /*
   * How the agent opens and captures web pages.
   *
   * Separate from `izinIsiWeb` / `allowlistWeb` (the SECURITY gate): those decide
   * WHETHER a page may load at all. This block decides WHERE it opens and
   * whether a screenshot is taken afterwards, which is a preference, not a
   * permission.
   *
   * `bawaan` is the browser AI tasks use by default; `urlLokal` and `urlLuar`
   * override it per link kind, because "open my own dev server inside the app"
   * and "open a public link in my browser" are different promises.
   */
  browser?: {
    /* Engine kontrol browser oleh agent (tool browser_open/read/click/type).
       Off = tool browser ditolak di gerbang katalog. */
    enabled?: boolean;
    bawaan?: 'builtin' | 'sistem';
    autoScreenshot?: boolean;
    urlLokal?: 'builtin' | 'sistem';
    urlLuar?: 'builtin' | 'sistem';
  };

  /*
   * Conversation behaviour — the page TRAE calls "Conversation".
   *
   * WHY THESE LIVE IN SETTINGS AND NOT IN A STORE: they describe what the app is
   * allowed to do on the reader's behalf (use lists, fix lint, review diffs, open
   * a terminal, notify). A setting that disappears when a window closes is not a
   * setting, so it is persisted with everything else.
   *
   * WHY EVERY FEATURE HAS TWO SWITCHES (Ide / Solo): Zephyr runs a conversation in
   * two different places — the EDITOR (the AI panel attached to the main window)
   * and OPEN IN AGENTS (an external agent CLI in a pane). They are separate
   * execution paths with separate failure modes, so a reader who wants auto-fix
   * for their editor session is not automatically asking for it in an external
   * agent's pane. One switch for both would be a promise the app cannot keep.
   *
   * `reviewScope` is a tri-state, not a boolean, because "review every change"
   * and "review only the latest turn" are both useful and mean different things;
   * `none` is the third option TRAE offers and is the only way to say "write
   * straight to disk".
   */
  conversation?: {
    /** Let the agent keep a to-do list while it works. */
    todoListIde: boolean;
    todoListSolo: boolean;
    /** Run the project's linter/fixer on files the agent changed. */
    autoFixIde: boolean;
    autoFixSolo: boolean;
    /** Let the agent stop and ask when the task is ambiguous. */
    questioningIde: boolean;
    questioningSolo: boolean;
    /** Which AI-generated changes to put in front of the reader. */
    reviewScope: 'all' | 'latest' | 'none';
    /** Move to the next changed hunk after a keep/undo decision. */
    reviewJump: boolean;
    /** Which terminal an agent command runs in. */
    terminalEnv: 'efficient' | 'system';
    /** When the agent's terminal opens on its own. */
    terminalAutoOpen: 'always' | 'background' | 'never';
    /** Notify when a run finishes or fails. */
    notifBanner: boolean;
    notifSound: boolean;
    /** 0-100. */
    notifVolume: number;
    /** Only notify for runs longer than this - short ones are over before the reader looks away. */
    notifAmbang: 'always' | '5s' | '20s';
    /** Per-outcome sound choice. */
    soundCompleted: string;
    soundWaiting: string;
    soundStopped: string;
  };

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
   * `izinIsiWeb` NYALA secara bawaan: agen boleh langsung membuka link yang
   * diberikan user tanpa dialog izin per panggilan. Hanya `false` eksplisit
   * yang mematikannya, jadi settings.json lama yang tidak punya key ini
   * berperilaku sama dengan instalasi baru. `allowlistWeb` kosong = semua host
   * boleh. `allowlistWeb` berisi HOST tanpa skema ("example.com", bukan
   * "https://example.com"); sebuah entri juga membuka subdomainnya
   * (`hostDiAllowlist` mencocokkan suffix). Keduanya hanya bisa diubah lewat
   * settings.json.
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
  computerUse: { enabled: false, showButton: false },

  /*
   * HydraFusion defaults. `enabled: false` and `maxRequests: 3` must match
   * `settings.rs default_settings()`: the Rust side is what an existing profile
   * actually receives on load, so a disagreement here would show a switch that
   * does not describe the value in use.
   */
  hydrafusion: { enabled: false, tiers: { cheap: '', mid: '', strong: '' }, maxRequests: 3 },

  /*
   * Conversation defaults — every switch OFF, every choice at its most
   * conservative value.
   *
   * WHY OFF BY DEFAULT: each of these lets the app act on the reader's files or
   * interrupt them. Auto-fix REWRITES code, reviewScope `all` makes every edit a
   * checkpoint, and `terminalAutoOpen: 'always'` takes over a pane. None of that
   * may happen because someone opened a settings page, so the defaults are the
   * quiet ones and the reader opts in.
   *
   * SATU pengecualian, dan arahnya berlawanan: `questioningIde` /
   * `questioningSolo` menyala secara default. Keduanya tidak menyentuh berkas
   * dan tidak merebut apa pun - justru sebaliknya: agen berhenti dan BERTANYA
   * sebelum melakukan hal yang tidak bisa dibatalkan. Mematikannya adalah
   * pilihan yang boleh diambil pembaca; menyalakannya adalah sikap aman.
   */
  conversation: {
    todoListIde: false,
    todoListSolo: false,
    autoFixIde: false,
    autoFixSolo: false,
    questioningIde: true,
    questioningSolo: true,
    reviewScope: 'all',
    reviewJump: true,
    terminalEnv: 'efficient',
    terminalAutoOpen: 'never',
    notifBanner: true,
    notifSound: false,
    notifVolume: 100,
    notifAmbang: '5s',
    soundCompleted: 'default',
    soundWaiting: 'default',
    soundStopped: 'default',
  },

  allowCommands: [],
  extensions: { enabled: [], trust: {} },

  accessibility: {
    reducedMotion: false,
    screenReader: false,
    autoFocusDialog: true,
    toastDurasiMin: 1000,
  },
  git: { defaultBranch: 'main', pullBeforePush: true },
  mcp: { enabled: false, autostart: false, port: 9222, token: '', writeToCli: [], allowTerminalControl: false, maxToolsPerServer: 40 },
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
