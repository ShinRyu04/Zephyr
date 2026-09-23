// commands.ts — SATU-SATUNYA jembatan ke Rust (AGENTS.md §4).
// Komponen tidak boleh memanggil invoke() langsung.

import { invoke } from '@tauri-apps/api/core';
import type {
  AgentInfo,
  AiMessage,
  AppInfo,
  CliArgs,
  CliStatus,
  CliWriteResult,
  SnippetSet,
  WorkspaceInfo,
  DeviceLogin,
  Diagnostics,
  SelfTestItem,
  DirNode,
  Encoding,
  GhStatus,
  GhTestResult,
  GhUser,
  GitBranches,
  GitCommitInfo,
  GitStatusResult,
  GitUser,
  LineEnding,
  McpStatus,
  PtyInfo,
  ProbeResult,
  PublicModel,
  QuickFile,
  ExtensionInfo,
  ExtInstallHasil,
  ExtManifestStatus,
  ExtensionLoad,
  ModelTestResult,
  ReadResult,
  RecentEntry,
  SearchResult,
  SessionTab,
  Settings,
  ShellInfo,
  StatResult,
  HistoryInfo,
  SearchOpts,
  SearchSummary,
  SshConfigInput,
  SshHost,
  ReplaceHasil,
  ExtExecResult,
  AgentMsg,
  AgentToolSpec,
  AiToolResult,
  DebugConfig,
  LaunchFile,
  AdapterSpec,
  TaskProblem,
  TaskRun,
  TasksFile,
  RegistryEntry,
  ZephyrError,
} from './types';

/** Normalisasi error dari Rust ({code,message}) agar selalu bertipe sama. */
export function asZephyrError(e: unknown): ZephyrError {
  if (typeof e === 'object' && e !== null && 'code' in e && 'message' in e) {
    return e as ZephyrError;
  }
  return { code: 'Internal', message: String(e) };
}

// ── app / settings ──

export const getAppInfo = () => invoke<AppInfo>('get_app_info');
export const getSettings = () => invoke<Settings>('get_settings');
export const setSettings = (patch: Record<string, unknown>) =>
  invoke<void>('set_settings', { patch });
export const setWindowSize = (width: number, height: number) =>
  invoke<void>('set_window_size', { width, height });
/**
 * Registry native Zephyr (menggantikan proxy Open VSX).
 *
 * Backend `ext_registry_list` membaca index format Zephyr sendiri dari
 * bundled + `%APPDATA%\zephyr\registry.json` + URL remote. Frontend tidak
 * lagi `fetch()` ke open-vsx.org — dulu hampir semua hasilnya ekstensi VS
 * Code penuh yang lalu disembunyikan atau gagal dipasang.
 */
export const extRegistryList = (query: string) =>
  invoke<RegistryEntry[]>('ext_registry_list', { query });
/** Baca registry user sebagai teks (dipakai editor di Settings). */
export const extRegistryRead = () => invoke<string>('ext_registry_read');
/** Tulis registry user (harus valid; Rust memvalidasi sebelum disimpan). */
export const extRegistrySave = (teks: string) =>
  invoke<void>('ext_registry_save', { teks });
/** Daftar id+versi yang sudah terpasang (membedakan tombol pasang/terpasang). */
export const extRegistryInstalled = () =>
  invoke<{ id: string; version: string; enabled: boolean }[]>(
    'ext_registry_installed',
  );
/** Apakah sebuah URL unduh .zext diizinkan oleh allowlist backend. */
export const extRegistryUrlDiizinkan = (url: string) =>
  invoke<boolean>('ext_registry_url_diizinkan', { url });
export const listRecents = () => invoke<RecentEntry[]>('list_recents');
/** fase 16.3: path file config rusak yang di-backup Rust ('' = tidak ada). */
export const takeBrokenConfig = () => invoke<string>('take_broken_config');
/** fase 18.4: override chord user dari %APPDATA%\zephyr\keybindings.json. */
export const getKeybindings = () => invoke<unknown[]>('get_keybindings');
export const setKeybindings = (bindings: unknown[]) =>
  invoke<void>('set_keybindings', { bindings });
// ── fase 21: Language Server Protocol ──
export const lspStart = (
  spec: { id: string; cmd: string[]; lang: string },
  root: string,
  initOptions: unknown,
  idleSecs?: number,
) => invoke<unknown>('lsp_start', { spec, root, initOptions, idleSecs });
export const lspRequest = (server: string, method: string, params: unknown) =>
  invoke<unknown>('lsp_request', { server, method, params });
export const lspNotify = (server: string, method: string, params: unknown) =>
  invoke<void>('lsp_notify', { server, method, params });
export const lspStop = (server: string) => invoke<boolean>('lsp_stop', { server });
export const lspStopAll = () => invoke<number>('lsp_stop_all');
export const lspStatus = () => invoke<unknown[]>('lsp_status');
export const lspReap = () => invoke<string[]>('lsp_reap');
export const lspSetIdle = (server: string, secs: number) =>
  invoke<void>('lsp_set_idle', { server, secs });
export const lspProbe = (spec: { id: string; cmd: string[]; lang: string }, root?: string) =>
  invoke<unknown>('lsp_probe', { spec, root });
export const workspaceOpen = (path: string) => invoke<void>('workspace_open', { path });
export const workspaceClose = () => invoke<void>('workspace_close');

// ── fs / editor ──

export const fsRead = (path: string, encoding?: Encoding) =>
  invoke<ReadResult>('fs_read', { path, encoding });
/** fase 15.1: `wasExisting` = tab ini dibaca dari disk. Bila filenya sudah
 *  lenyap, Rust menolak (NotFound) supaya UI bisa bertanya "buat baru?".
 *  `allowMissing` = jawaban "ya, buat baru". */
export const fsWrite = (
  path: string,
  content: string,
  encoding?: Encoding,
  lineEnding?: LineEnding,
  opts?: { wasExisting?: boolean; allowMissing?: boolean },
) =>
  invoke<void>('fs_write', {
    path,
    content,
    encoding,
    lineEnding,
    wasExisting: opts?.wasExisting ?? false,
    allowMissing: opts?.allowMissing ?? false,
  });
export const fsExists = (path: string) => invoke<boolean>('fs_exists', { path });
export const fsStat = (path: string) => invoke<StatResult>('fs_stat', { path });
export const fsCreateFile = (path: string, content?: string) =>
  invoke<void>('fs_create_file', { path, content });
export const fsCreateDir = (path: string) => invoke<void>('fs_create_dir', { path });
export const fsDelete = (paths: string[], recursive = false) =>
  invoke<void>('fs_delete', { paths, recursive });
export const fsRename = (from: string, to: string) => invoke<void>('fs_rename', { from, to });
export const sessionLoad = () => invoke<SessionTab[]>('session_load');
export const sessionSave = (tabs: SessionTab[]) => invoke<void>('session_save', { tabs });

// ── dialog native ──

export const fileDialogOpen = (multiple = false) =>
  invoke<string[] | null>('file_dialog_open', { multiple });
export const fileDialogSave = (defaultPath?: string) =>
  invoke<string | null>('file_dialog_save', { defaultPath });
export const folderDialogOpen = () => invoke<string | null>('folder_dialog_open');

/** Baca gambar dari disk sebagai data URL untuk latar belakang kustom. */
export const bgImageRead = (path: string) =>
  invoke<{ data_url: string; bytes: number; kind: string }>('bg_image_read', { path });

// ── explorer / search (fase 04) ──

export const scanDir = (path: string) => invoke<DirNode[]>('scan_dir', { path });
export const fsWatch = (path: string) => invoke<void>('fs_watch', { path });
export const fsUnwatch = () => invoke<void>('fs_unwatch');
export const searchFiles = (
  query: string,
  opts: { glob?: string; caseSensitive?: boolean; regex?: boolean } = {},
) =>
  invoke<SearchResult>('search_files', {
    query,
    glob: opts.glob,
    caseSensitive: opts.caseSensitive ?? false,
    regex: opts.regex ?? false,
  });
export const replaceInFile = (
  path: string,
  query: string,
  replacement: string,
  opts: { caseSensitive?: boolean; regex?: boolean } = {},
) =>
  invoke<number>('replace_in_file', {
    path,
    query,
    replacement,
    caseSensitive: opts.caseSensitive ?? false,
    regex: opts.regex ?? false,
  });
export const revealPath = (path: string) => invoke<void>('reveal_path', { path });
/** fase 12: daftar file workspace untuk Quick Open (Ctrl+P). */
export const listWorkspaceFiles = (limit?: number) =>
  invoke<QuickFile[]>('list_workspace_files', { limit });
/** fase 12: cek apakah URL boleh di-embed di iframe (header dibaca Rust). */
export const browserProbe = (url: string) => invoke<ProbeResult>('browser_probe', { url });

// ── RAG lokal (fase 34) ──
// Bukan fetch biasa: server enowx-rag (localhost:7777) tidak kirim CORS,
// jadi request lewat Rust (ureq) seperti browser_probe.

export interface RagHit {
  content: string;
  sourceFile: string;
  score: number;
}
/** Cari konteks project di server RAG. Gagal = Err (toast), bukan diam. */
export const ragSearch = (baseUrl: string, project: string, query: string, k: number) =>
  invoke<RagHit[]>('rag_search', { baseUrl, project, query, k });

// ── terminal / pty (fase 05) ──

export const listShells = () => invoke<ShellInfo[]>('list_shells');
/** fase 06: CLI agent yang terdeteksi di mesin. */
export const listAgents = () => invoke<AgentInfo[]>('list_agents');
export const ptySpawn = (opts: {
  id: string;
  kind?: string;
  command?: string;
  args?: string[];
  cwd?: string | null;
  cols?: number;
  rows?: number;
}) => invoke<number>('pty_spawn', opts);
export const ptyWrite = (id: string, data: string) => invoke<void>('pty_write', { id, data });
export const ptyResize = (id: string, cols: number, rows: number) =>
  invoke<void>('pty_resize', { id, cols, rows });
export const ptyKill = (id: string) => invoke<void>('pty_kill', { id });
export const ptyList = () => invoke<PtyInfo[]>('pty_list');
export const ptySetPaused = (paused: boolean) => invoke<void>('pty_set_paused', { paused });
/** Ctrl+C sungguhan (CTRL_C_EVENT), bukan sekadar byte 0x03. */
export const ptyInterrupt = (id: string) => invoke<number>('pty_interrupt', { id });

// ── SSH ──

export const sshList = () => invoke<SshHost[]>('ssh_list');
export const sshAdd = (config: SshConfigInput) => invoke<void>('ssh_add', { config });
export const sshUpdate = (config: SshConfigInput) => invoke<void>('ssh_update', { config });
export const sshDelete = (id: string) => invoke<void>('ssh_delete', { id });
export const sshSavePassword = (id: string, password: string) =>
  invoke<SshHost>('ssh_save_password', { id, password });
export const sshClearPassword = (id: string) =>
  invoke<SshHost>('ssh_clear_password', { id });
/** Connect → kembalikan paneId sesi ssh di panel terminal. */
export const sshConnect = (configId: string, cols?: number, rows?: number) =>
  invoke<string>('ssh_connect', { configId, cols, rows });
export const sshDisconnect = (paneId: string) =>
  invoke<void>('ssh_disconnect', { paneId });

// ── settings lanjutan (fase 08) ──

/** Status API key per provider — TIDAK memuat key asli. */
export const getPublicModels = () => invoke<PublicModel[]>('get_public_models');
/** Simpan/ganti key. `key` kosong = hapus. */
export const setModelKey = (provider: string, key: string) =>
  invoke<void>('set_model_key', { provider, key });
export const testModelConnection = (provider: string, baseUrl?: string) =>
  invoke<ModelTestResult>('test_model_connection', { provider, baseUrl });

/** Ambil daftar model dari provider (Settings → Model AI → Refresh). */
export const listModels = (provider: string, baseUrl?: string) =>
  invoke<string[]>('list_models', { provider, baseUrl });
/** Hapus settings.json (secrets.json TIDAK disentuh). */
export const resetSettings = () => invoke<void>('reset_settings');

// ── AI panel (fase 09) ──

/** Mulai chat streaming. Jawaban datang lewat event `ai-chunk` dengan id
 *  yang sama. Key dibaca di Rust — TIDAK dikirim dari sini. */
export const aiChat = (opts: {
  id: string;
  provider: string;
  model: string;
  messages: AiMessage[];
  baseUrl?: string;
  maxTokens?: number;
  /** T1.1: tingkat penalaran (minimal|low|medium|high|ultra). Kosong = default provider. */
  effort?: 'minimal' | 'low' | 'medium' | 'high' | 'ultra';
}) => invoke<void>('ai_chat', opts);

/** Batalkan streaming. false = id sudah tidak berjalan. */
export const aiCancel = (id: string) => invoke<boolean>('ai_cancel', { id });

/** Satu langkah loop agent — non-streaming, bisa memuat tool calls. */
export const aiToolChat = (opts: {
  provider: string;
  model: string;
  messages: AgentMsg[];
  tools: AgentToolSpec[];
  baseUrl?: string;
  maxTokens?: number;
  effort?: 'minimal' | 'low' | 'medium' | 'high' | 'ultra';
}) => invoke<AiToolResult>('ai_tool_chat', opts);

/** Satu langkah loop agent STREAMING: teks lewat `ai-chunk`, hasil akhir
 *  lewat `ai-chunk` dengan `toolDone: true`. */
export const aiToolChatStream = (opts: {
  id: string;
  provider: string;
  model: string;
  messages: AgentMsg[];
  tools: AgentToolSpec[];
  baseUrl?: string;
  maxTokens?: number;
  effort?: 'minimal' | 'low' | 'medium' | 'high' | 'ultra';
}) => invoke<void>('ai_tool_chat_stream', opts);

// ── CLI AI agent (T1.2/T1.5) ──
//
// Jalur B: Zephyr TIDAK membaca token CLI. Ia hanya (a) mendeteksi CLI mana
// yang terpasang + sudah login, dan (b) menjalankan prompt lewat CLI itu.
// Konsekuensinya: kesalahan Zephyr tidak bisa merusak sesi login user.

/** Satu CLI AI yang dikenal Zephyr. */
export interface CliAgent {
  id: string;
  label: string;
  bin: string;
  path: string | null;
  terpasang: boolean;
  /** sesi login milik CLI ada (file kredensialnya ADA — isinya tak dibaca) */
  login: boolean;
  promptArgs: string[];
  catatan: string;
}

export interface CliRunResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number | null;
  timeout: boolean;
}

/** Deteksi CLI AI di PATH + status login. */
export const cliAgentsDetect = () => invoke<CliAgent[]>('cli_agents_detect');

/** Jalankan satu prompt lewat CLI non-interaktif. */
export const cliAgentRun = (opts: { id: string; prompt: string; cwd?: string }) =>
  invoke<CliRunResult>('cli_agent_run', opts);

// ── Pratinjau gambar (T3.4) ──

/** Data gambar untuk pratinjau (base64 + dimensi). */
export interface GambarData {
  base64: string;
  lebar: number;
  tinggi: number;
  bytes: number;
}

/** Baca file gambar untuk pratinjau. */
export const bacaGambar = (path: string) => invoke<GambarData>('baca_gambar', { path });

// ── Source Control / git (fase 10) ──

export const gitInit = (path?: string) => invoke<void>('git_init', { path });
export const gitStatus = () => invoke<GitStatusResult>('git_status');
export const gitStage = (paths: string[]) => invoke<void>('git_stage', { paths });
export const gitUnstage = (paths: string[]) => invoke<void>('git_unstage', { paths });
/** → hash pendek commit baru */
export const gitCommit = (message: string) => invoke<string>('git_commit', { message });
export const gitPush = (setUpstream = false) =>
  invoke<string>('git_push', { setUpstream });
export const gitPull = (rebase = false) => invoke<string>('git_pull', { rebase });
export const gitFetch = () => invoke<string>('git_fetch');
export const gitBranches = () => invoke<GitBranches>('git_branches');
export const gitCheckout = (branch: string) => invoke<void>('git_checkout', { branch });
export const gitCreateBranch = (name: string, from?: string) =>
  invoke<void>('git_create_branch', { name, from });
export const gitDeleteBranch = (name: string) => invoke<void>('git_delete_branch', { name });
export const gitDiff = (path: string, staged = false) =>
  invoke<string>('git_diff', { path, staged });
export const gitDiscard = (paths: string[]) => invoke<void>('git_discard', { paths });
export const gitLog = (n = 20) => invoke<GitCommitInfo[]>('git_log', { n });
export const gitConfigGetUser = () => invoke<GitUser>('git_config_get_user');

// ── GitHub auth (fase 10). Token TIDAK pernah menyeberang ke frontend. ──

export const ghStatus = () => invoke<GhStatus>('gh_status');
/** Simpan PAT setelah divalidasi Rust ke GitHub. Token salah → error. */
export const ghSetPat = (token: string) => invoke<GhUser>('gh_set_pat', { token });
/** Mulai device flow; hasil akhir datang lewat event `gh-login`. */
export const ghLoginDevice = () => invoke<DeviceLogin>('gh_login_device');
export const ghLogout = () => invoke<void>('gh_logout');
export const ghTest = () => invoke<GhTestResult>('gh_test');

// ── MCP server 9222 (fase 11) ──

export const mcpStatus = () => invoke<McpStatus>('mcp_status');
/** Nyalakan server; → port yang benar-benar dipakai (9222 atau 9223). */
export const mcpStart = () => invoke<number>('mcp_start');
export const mcpStop = () => invoke<boolean>('mcp_stop');
/** Jawaban frontend untuk satu `mcp-action`. */
export const mcpReply = (reqId: string, result: unknown) =>
  invoke<boolean>('mcp_reply', { reqId, result });
export const mcpRotateToken = () => invoke<string>('mcp_rotate_token');
export const mcpWriteCli = (ids: string[]) => invoke<CliWriteResult[]>('mcp_write_cli', { ids });
export const mcpRemoveCli = (ids: string[]) => invoke<CliWriteResult[]>('mcp_remove_cli', { ids });
export const mcpCliStatus = () => invoke<CliStatus[]>('mcp_cli_status');

// ── extensions (fase 13) ──

export const extensionsList = () => invoke<ExtensionInfo[]>('extensions_list');
export const extensionsLoad = (id: string) => invoke<ExtensionLoad>('extensions_load', { id });
/** Daftarkan folder ekstensi dari luar (user memilih package.json-nya). */
export const extensionsAdd = (path: string) => invoke<ExtensionInfo>('extensions_add', { path });
export const extensionsRemove = (id: string) => invoke<boolean>('extensions_remove', { id });
/** → path %APPDATA%\zephyr\extensions (dibuat bila belum ada). */
export const extensionsFolder = () => invoke<string>('extensions_folder');

// ── extensions native fase 19 (manifest `zephyr-extension.json`) ──

/** Pasang dari folder, file `.zext` (zip), atau manifest-nya langsung. */
export const extensionsInstall = (path: string) =>
  invoke<ExtInstallHasil>('extensions_install', { path });
/** Hapus folder + entri installed.json (hanya di dalam extensions/). */
export const extensionsUninstall = (id: string) => invoke<boolean>('extensions_uninstall', { id });
/** Enable/disable tanpa menghapus file. */
export const extensionsSetEnabled = (id: string, on: boolean) =>
  invoke<boolean>('extensions_set_enabled', { id, on });
/** Baca file kontribusi (tema/keymap/snippet) — path wajib di dalam ekstensi. */
export const extensionsReadContrib = (id: string, rel: string) =>
  invoke<Record<string, unknown>>('extensions_read_contrib', { id, rel });
export const extensionsReadMain = (id: string, rel: string) =>
  invoke<string>('extensions_read_main', { id, rel });

/** Semua file JS/JSON ekstensi (relpath -> isi) untuk require('./...') relatif. */
export const extensionsReadFiles = (id: string) =>
  invoke<Record<string, string>>('extensions_read_files', { id });
/** Manifest + status semua ekstensi terpasang (dipakai loader 19.5). */
export const extensionsManifests = () => invoke<ExtManifestStatus[]>('extensions_manifests');
/** Tulis paket bundled ke folder staging → path untuk `extensions_install`. */
export const extensionsWriteBundled = (id: string) =>
  invoke<string>('extensions_write_bundled', { id });
/** Id paket bundled yang tersedia offline. */
export const extensionsBundledIds = () => invoke<string[]>('extensions_bundled_ids');
/** Unduh .vsix dari registry remote ke folder temp → path untuk `extensions_install`. */
export const extensionsDownloadVsix = (url: string, id: string) =>
  invoke<string>('extensions_download_vsix', { url, id });

// ── izin runtime eksternal ekstensi ──

/** Resolve path binary sebuah runtime lewat PATH. null = tidak ketemu. */
export const extWhich = (runtime: string) =>
  invoke<string | null>('ext_which', { runtime });
/**
 * Jalankan binary yang SUDAH di-whitelist untuk ekstensi ini. Rust memeriksa
 * ulang izin dari settings — path yang tidak cocok dengan grant ditolak.
 */
export const extExec = (opts: {
  extId: string;
  runtime: string;
  bin: string;
  args: string[];
  cwd?: string | null;
  timeoutMs?: number;
}) => invoke<ExtExecResult>('ext_exec', opts);

// ── diagnostics / logging (fase 14) ──

/** Angka yang benar-benar diukur di proses Rust (RAM, uptime, log, marks). */
export const getDiagnostics = () => invoke<Diagnostics>('get_diagnostics');
/** T4.8: rekam request AI (nyalakan, ambil, bersihkan). */
export const aiCaptureSet = (on: boolean) => invoke<boolean>('ai_capture_set', { on });
export const aiCaptureGet = () =>
  invoke<[
    boolean,
    {
      atMs: number;
      provider: string;
      model: string;
      url: string;
      headers: [string, string][];
      body: unknown;
      chars: number;
    }[],
  ]>('ai_capture_get');
export const aiCaptureClear = () => invoke<void>('ai_capture_clear');
/** fase 16.5: mini-test nyata per domain (fs/pty/git/mcp/log). */
export const selfTest = () => invoke<SelfTestItem[]>('self_test');
/** Kirim error frontend ke file log yang sama dengan Rust. */
export const logFrontend = (level: 'error' | 'warn' | 'info', message: string) =>
  invoke<void>('log_frontend', { level, message });
/** Catat penanda perf dari frontend (mis. 'ui-ready'). */
export const perfMark = (name: string, durMs?: number) =>
  invoke<void>('perf_mark', { name, durMs });
/** HANYA build debug: memicu panic untuk menguji panic hook (V7 fase 14). */
export const debugPanic = () => invoke<void>('debug_panic');

// ─────────────────── tasks (fase 23) ───────────────────

/** Baca + validasi tasks.json (.zephyr/ lalu .vscode/). */
export const tasksLoad = (root?: string) => invoke<TasksFile>('tasks_load', { root });
/** Nama preset problem matcher yang tersedia. */
export const tasksMatchers = () => invoke<string[]>('tasks_matchers');
/** Uji satu baris terhadap sebuah matcher (diagnosa/harness). */
export const tasksMatchLine = (matcher: string, line: string, root?: string) =>
  invoke<TaskProblem | null>('tasks_match_line', { matcher, line, root });
/**
 * Jalankan satu task. Output/masalah/port mengalir lewat event
 * `task-output` / `task-problem` / `task-port` / `task-exit`.
 */
export const tasksRun = (a: {
  id: string;
  label: string;
  kind: string;
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
  problemMatchers?: string[];
  isBackground?: boolean;
  beginsPattern?: string;
  endsPattern?: string;
}) => invoke<string>('tasks_run', a);
/** Tunggu sebuah run selesai. */
export const tasksWait = (id: string, timeoutMs?: number) =>
  invoke<TaskRun>('tasks_wait', { id, timeoutMs });
/** Hentikan run beserta seluruh pohon prosesnya. */
export const tasksKill = (id: string) => invoke<boolean>('tasks_kill', { id });
/** Daftar run yang tercatat di Rust. */
export const tasksRuns = () => invoke<TaskRun[]>('tasks_runs');
/** Buang riwayat run yang sudah selesai. */
export const tasksClearRuns = () => invoke<number>('tasks_clear_runs');
/** Deteksi port dari sebuah baris output (harness). */
export const tasksDetectPort = (line: string) =>
  invoke<{ port: number; https: boolean } | null>('tasks_detect_port', { line });

// ─────────────────── local history (fase 26) ───────────────────

/**
 * Simpan snapshot sebuah file. `id` kosong berarti di-skip — alasannya di
 * field `skip` (isi identik, file besar, atau biner).
 */
export const historySnapshot = (
  path: string,
  reason: 'save' | 'before-rename' | 'manual' | 'before-restore' = 'save',
  maxPerFile?: number,
  maxDays?: number,
) =>
  invoke<{ id: string; skip: string; dibuang?: number; total?: number }>('history_snapshot', {
    path,
    reason,
    maxPerFile,
    maxDays,
  });
/** Daftar snapshot sebuah file (terbaru di depan). */
export const historyList = (path: string) => invoke<HistoryInfo>('history_list', { path });
/** Isi satu snapshot — untuk diff & restore. */
export const historyRead = (path: string, id: string) =>
  invoke<string>('history_read', { path, id });
/** Hapus seluruh history sebuah file. */
export const historyClear = (path: string) => invoke<number>('history_clear', { path });
/** Pangkas paksa memakai batas tertentu (dipakai saat setting berubah). */
export const historyPrune = (path: string, maxPerFile: number, maxDays: number) =>
  invoke<number>('history_prune', { path, maxPerFile, maxDays });
/** Statistik pemakaian disk seluruh history. */
export const historyStats = () =>
  invoke<{ root: string; folder: number; snapshot: number; byte: number }>('history_stats');

// ─────────────────── global search via ripgrep (fase 25) ───────────────────

/**
 * Jalankan pencarian ripgrep. Hasil MENGALIR lewat event `search-hit`;
 * nilai kembaliannya hanya ringkasan (jumlah, waktu, error).
 */
export const searchGrep = (opts: SearchOpts, rgPath?: string) =>
  invoke<SearchSummary>('search_grep', { opts, rgPath });
/** Batalkan pencarian yang sedang jalan. */
export const searchCancel = () => invoke<boolean>('search_cancel');
/** Info binary rg (ada/tidak, jalur, versi) untuk Settings. */
export const searchRgInfo = (rgPath?: string) =>
  invoke<{ ada: boolean; path: string; versi: string }>('search_rg_info', { rgPath });
/**
 * Replace di banyak file. Setiap file di-snapshot ke Local History lebih dulu
 * (reason `before-replace`) supaya bisa di-undo.
 */
export const searchReplace = (files: string[], opts: SearchOpts, replacement: string) =>
  invoke<ReplaceHasil[]>('search_replace', { files, opts, replacement });

// ─────────────────── debugger DAP (fase 22) ───────────────────

/** Baca launch.json dari .zephyr/ atau .vscode/. */
export const dapLoad = () => invoke<LaunchFile>('dap_load');
/** Daftar adapter + status install-nya (untuk UI & pesan V5). */
export const dapAdapters = () => invoke<AdapterSpec[]>('dap_adapters');
/**
 * Mulai sesi debug. Rust yang mengurus urutan DAP wajib
 * (initialize → initialized → setBreakpoints → configurationDone → launch).
 */
export const dapStart = (config: DebugConfig, breakpoints: { path: string; line: number }[]) =>
  invoke<{
    pid: number;
    adapter: string;
    transport: string;
    port: number | null;
    capabilities: Record<string, unknown>;
    breakpoints: { path: string; body: { breakpoints?: unknown[] } }[];
    launch: unknown;
  }>('dap_start', { config, breakpoints });
/** Hentikan sesi + seluruh pohon proses debuggee. */
export const dapStop = () => invoke<boolean>('dap_stop');
export const dapStatus = () => invoke<Record<string, unknown>>('dap_status');
/** continue | next | stepIn | stepOut | pause */
export const dapKontrol = (aksi: string, threadId: number) =>
  invoke<Record<string, unknown>>('dap_kontrol', { aksi, threadId });
export const dapThreads = () => invoke<Record<string, unknown>>('dap_threads');
export const dapStack = (threadId: number) =>
  invoke<Record<string, unknown>>('dap_stack', { threadId });
export const dapScopes = (frameId: number) =>
  invoke<Record<string, unknown>>('dap_scopes', { frameId });
export const dapVariables = (variablesReference: number) =>
  invoke<Record<string, unknown>>('dap_variables', { variablesReference });
export const dapEvaluate = (expression: string, frameId?: number, context?: string) =>
  invoke<Record<string, unknown>>('dap_evaluate', { expression, frameId, context });
export const dapSetVariable = (variablesReference: number, name: string, value: string) =>
  invoke<Record<string, unknown>>('dap_set_variable', { variablesReference, name, value });
export const dapSetBreakpoints = (path: string, lines: number[]) =>
  invoke<Record<string, unknown>>('dap_set_breakpoints', { path, lines });
export const dapLoadedSources = () => invoke<Record<string, unknown>>('dap_loaded_sources');

// ── CLI launcher (fase 28) ──

/** Argumen CLI instance PERTAMA (event `cli-args` hanya dari instance kedua). */
export const cliArgsAwal = () => invoke<CliArgs>('cli_args_awal');
/** Parse argv lewat jalur produk — dipakai harness verify28. */
export const cliParse = (argv: string[], cwd: string) =>
  invoke<CliArgs>('cli_parse', { argv, cwd });
/** Hapus penanda `--wait` → proses `zephyr --wait` di terminal lanjut. */
export const cliWaitSelesai = (token: string) => invoke<boolean>('cli_wait_selesai', { token });
/** Buat penanda `--wait` (shim CLI; juga dipakai harness). */
export const cliWaitBuat = (token: string) => invoke<string>('cli_wait_buat', { token });
/** true = penanda masih ada, artinya proses CLI masih menunggu. */
export const cliWaitAktif = (token: string) => invoke<boolean>('cli_wait_aktif', { token });
/** Teks banner/help/version; `warna:false` = plain untuk pipe. */
export const cliTeks = (mode: 'help' | 'version' | 'banner', warna: boolean, kolom?: number) =>
  invoke<string>('cli_teks', { mode, warna, kolom });

// ── multi-root workspace + trust (fase 29) ──

export const workspaceInfo = () => invoke<WorkspaceInfo>('workspace_info');
export const workspaceSetTrust = (path: string, trust: boolean) =>
  invoke<WorkspaceInfo>('workspace_set_trust', { path, trust });
export const workspaceForgetTrust = (path: string) =>
  invoke<WorkspaceInfo>('workspace_forget_trust', { path });
export const workspaceTrustList = () =>
  invoke<{ path: string; trust: string }[]>('workspace_trust_list');
export const workspaceAddRoot = (path: string) =>
  invoke<WorkspaceInfo>('workspace_add_root', { path });
export const workspaceRemoveRoot = (path: string) =>
  invoke<WorkspaceInfo>('workspace_remove_root', { path });
export const workspaceSetActiveRoot = (path: string) =>
  invoke<WorkspaceInfo>('workspace_set_active_root', { path });
export const workspaceOpenFile = (path: string) =>
  invoke<WorkspaceInfo>('workspace_open_file', { path });
export const workspaceSaveFile = (path: string, settings?: Record<string, unknown>) =>
  invoke<string>('workspace_save_file', { path, settings });
export const workspaceSettingsEfektif = (root?: string) =>
  invoke<Record<string, unknown>>('workspace_settings_efektif', { root });
/** dari scope mana sebuah kunci berasal: default|user|workspace|folder */
export const workspaceSettingsAsal = (key: string, root?: string) =>
  invoke<string>('workspace_settings_asal', { key, root });
export const workspaceSetSettings = (patch: Record<string, unknown>) =>
  invoke<Record<string, unknown>>('workspace_set_settings', { patch });
export const workspaceBolehEksekusi = () => invoke<boolean>('workspace_boleh_eksekusi');

// ── snippets (fase 30) ──

/** Muat snippet untuk sebuah bahasa (sudah termasuk induk + global). */
export const snippetsLoad = (lang: string) => invoke<SnippetSet>('snippets_load', { lang });
/** Path file snippet user; dibuat berisi template bila belum ada. */
export const snippetsUserFile = (lang: string) => invoke<string>('snippets_user_file', { lang });
/** Bahasa yang sudah punya file snippet user. */
export const snippetsUserList = () => invoke<string[]>('snippets_user_list');
/** Bahasa yang punya snippet bawaan. */
export const snippetsBuiltinLangs = () => invoke<string[]>('snippets_builtin_langs');

// ── skill + memori + cron agent (1.1.11) ──

export interface SkillInfo {
  name: string;
  description: string;
  scope: 'global' | 'workspace';
  path: string;
  bytes: number;
}

export interface MemoryState {
  memory: string;
  user: string;
  memory_limit: number;
  user_limit: number;
  memory_chars: number;
  user_chars: number;
}

export interface CronJob {
  id: string;
  name: string;
  command: string;
  every_minutes: number;
  at_hour: number | null;
  enabled: boolean;
  last_run: number | null;
}

export const skillsList = () => invoke<SkillInfo[]>('skills_list');
export const skillRead = (name: string) => invoke<string>('skill_read', { name });
export const skillWrite = (opts: {
  name: string;
  description: string;
  content: string;
  scope?: string;
}) => invoke<string>('skill_write', opts);
export const skillDelete = (name: string) => invoke<void>('skill_delete', { name });
/** Daftar skill + memori + profil user untuk system prompt agent. */
export const agentContext = () => invoke<string>('agent_context');

export const memoryRead = () => invoke<MemoryState>('memory_read');
export const memoryWrite = (opts: {
  section: 'memory' | 'user';
  action: 'add' | 'replace' | 'remove';
  content?: string;
  /** Tauri v2 mengubah nama argumen Rust `old_text` → `oldText` di JS. */
  oldText?: string;
}) => invoke<string>('memory_write', opts);

export const cronList = () => invoke<CronJob[]>('cron_list');
export const cronCreate = (opts: {
  name: string;
  command: string;
  /** Tauri v2: `every_minutes` di Rust = `everyMinutes` di JS. */
  everyMinutes?: number;
  atHour?: number;
}) => invoke<CronJob>('cron_create', opts);
export const cronDelete = (id: string) => invoke<void>('cron_delete', { id });
export const cronToggle = (id: string, enabled: boolean) =>
  invoke<void>('cron_toggle', { id, enabled });
export const cronDue = () => invoke<CronJob[]>('cron_due');
export const cronMarkRun = (id: string) => invoke<void>('cron_mark_run', { id });
