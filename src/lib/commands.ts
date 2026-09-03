// commands.ts — SATU-SATUNYA jembatan ke Rust (AGENTS.md §4).
// Komponen tidak boleh memanggil invoke() langsung.

import { invoke } from '@tauri-apps/api/core';
import type {
  AgentInfo,
  AiMessage,
  AppInfo,
  CliStatus,
  CliWriteResult,
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
  TaskProblem,
  TaskRun,
  TasksFile,
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

// ── settings lanjutan (fase 08) ──

/** Status API key per provider — TIDAK memuat key asli. */
export const getPublicModels = () => invoke<PublicModel[]>('get_public_models');
/** Simpan/ganti key. `key` kosong = hapus. */
export const setModelKey = (provider: string, key: string) =>
  invoke<void>('set_model_key', { provider, key });
export const testModelConnection = (provider: string, baseUrl?: string) =>
  invoke<ModelTestResult>('test_model_connection', { provider, baseUrl });
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
}) => invoke<void>('ai_chat', opts);

/** Batalkan streaming. false = id sudah tidak berjalan. */
export const aiCancel = (id: string) => invoke<boolean>('ai_cancel', { id });

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
/** Muat manifest + file entry (≤1MB). Kode TIDAK dieksekusi (manifest-only v1). */
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
/** Manifest + status semua ekstensi terpasang (dipakai loader 19.5). */
export const extensionsManifests = () => invoke<ExtManifestStatus[]>('extensions_manifests');
/** Tulis paket bundled ke folder staging → path untuk `extensions_install`. */
export const extensionsWriteBundled = (id: string) =>
  invoke<string>('extensions_write_bundled', { id });
/** Id paket bundled yang tersedia offline. */
export const extensionsBundledIds = () => invoke<string[]>('extensions_bundled_ids');

// ── diagnostics / logging (fase 14) ──

/** Angka yang benar-benar diukur di proses Rust (RAM, uptime, log, marks). */
export const getDiagnostics = () => invoke<Diagnostics>('get_diagnostics');
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
