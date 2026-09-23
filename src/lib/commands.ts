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

export function asZephyrError(e: unknown): ZephyrError {
  if (typeof e === 'object' && e !== null && 'code' in e && 'message' in e) {
    return e as ZephyrError;
  }
  return { code: 'Internal', message: String(e) };
}

export const getAppInfo = () => invoke<AppInfo>('get_app_info');
export const getSettings = () => invoke<Settings>('get_settings');
export const setSettings = (patch: Record<string, unknown>) =>
  invoke<void>('set_settings', { patch });
export const setWindowSize = (width: number, height: number) =>
  invoke<void>('set_window_size', { width, height });

export const extRegistryList = (query: string) =>
  invoke<RegistryEntry[]>('ext_registry_list', { query });

export const extRegistryRead = () => invoke<string>('ext_registry_read');

export const extRegistrySave = (teks: string) =>
  invoke<void>('ext_registry_save', { teks });

export const extRegistryInstalled = () =>
  invoke<{ id: string; version: string; enabled: boolean }[]>(
    'ext_registry_installed',
  );

export const extRegistryUrlDiizinkan = (url: string) =>
  invoke<boolean>('ext_registry_url_diizinkan', { url });
export const listRecents = () => invoke<RecentEntry[]>('list_recents');

export const takeBrokenConfig = () => invoke<string>('take_broken_config');

export const getKeybindings = () => invoke<unknown[]>('get_keybindings');
export const setKeybindings = (bindings: unknown[]) =>
  invoke<void>('set_keybindings', { bindings });

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

export const fsRead = (path: string, encoding?: Encoding) =>
  invoke<ReadResult>('fs_read', { path, encoding });

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

export const fileDialogOpen = (multiple = false) =>
  invoke<string[] | null>('file_dialog_open', { multiple });
export const fileDialogSave = (defaultPath?: string) =>
  invoke<string | null>('file_dialog_save', { defaultPath });
export const folderDialogOpen = () => invoke<string | null>('folder_dialog_open');

export const bgImageRead = (path: string) =>
  invoke<{ data_url: string; bytes: number; kind: string }>('bg_image_read', { path });

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

export const listWorkspaceFiles = (limit?: number) =>
  invoke<QuickFile[]>('list_workspace_files', { limit });

export const browserProbe = (url: string) => invoke<ProbeResult>('browser_probe', { url });

export interface RagHit {
  content: string;
  sourceFile: string;
  score: number;
}

export const ragSearch = (baseUrl: string, project: string, query: string, k: number) =>
  invoke<RagHit[]>('rag_search', { baseUrl, project, query, k });

export const listShells = () => invoke<ShellInfo[]>('list_shells');

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

export const ptyInterrupt = (id: string) => invoke<number>('pty_interrupt', { id });

export const sshList = () => invoke<SshHost[]>('ssh_list');
export const sshAdd = (config: SshConfigInput) => invoke<void>('ssh_add', { config });
export const sshUpdate = (config: SshConfigInput) => invoke<void>('ssh_update', { config });
export const sshDelete = (id: string) => invoke<void>('ssh_delete', { id });
export const sshSavePassword = (id: string, password: string) =>
  invoke<SshHost>('ssh_save_password', { id, password });
export const sshClearPassword = (id: string) =>
  invoke<SshHost>('ssh_clear_password', { id });

export const sshConnect = (configId: string, cols?: number, rows?: number) =>
  invoke<string>('ssh_connect', { configId, cols, rows });
export const sshDisconnect = (paneId: string) =>
  invoke<void>('ssh_disconnect', { paneId });

export const getPublicModels = () => invoke<PublicModel[]>('get_public_models');

export const setModelKey = (provider: string, key: string) =>
  invoke<void>('set_model_key', { provider, key });
export const testModelConnection = (provider: string, baseUrl?: string) =>
  invoke<ModelTestResult>('test_model_connection', { provider, baseUrl });

export const listModels = (provider: string, baseUrl?: string) =>
  invoke<string[]>('list_models', { provider, baseUrl });

export const resetSettings = () => invoke<void>('reset_settings');

export const aiChat = (opts: {
  id: string;
  provider: string;
  model: string;
  messages: AiMessage[];
  baseUrl?: string;
  maxTokens?: number;

  effort?: 'minimal' | 'low' | 'medium' | 'high' | 'ultra';
}) => invoke<void>('ai_chat', opts);

export const aiCancel = (id: string) => invoke<boolean>('ai_cancel', { id });

export const aiToolChat = (opts: {
  provider: string;
  model: string;
  messages: AgentMsg[];
  tools: AgentToolSpec[];
  baseUrl?: string;
  maxTokens?: number;
  effort?: 'minimal' | 'low' | 'medium' | 'high' | 'ultra';
}) => invoke<AiToolResult>('ai_tool_chat', opts);

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

export interface CliAgent {
  id: string;
  label: string;
  bin: string;
  path: string | null;
  terpasang: boolean;

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

export const cliAgentsDetect = () => invoke<CliAgent[]>('cli_agents_detect');

export const cliAgentRun = (opts: { id: string; prompt: string; cwd?: string }) =>
  invoke<CliRunResult>('cli_agent_run', opts);

export interface GambarData {
  base64: string;
  lebar: number;
  tinggi: number;
  bytes: number;
}

export const bacaGambar = (path: string) => invoke<GambarData>('baca_gambar', { path });

export const gitInit = (path?: string) => invoke<void>('git_init', { path });
export const gitStatus = () => invoke<GitStatusResult>('git_status');
export const gitStage = (paths: string[]) => invoke<void>('git_stage', { paths });
export const gitUnstage = (paths: string[]) => invoke<void>('git_unstage', { paths });

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

export const ghStatus = () => invoke<GhStatus>('gh_status');

export const ghSetPat = (token: string) => invoke<GhUser>('gh_set_pat', { token });

export const ghLoginDevice = () => invoke<DeviceLogin>('gh_login_device');
export const ghLogout = () => invoke<void>('gh_logout');
export const ghTest = () => invoke<GhTestResult>('gh_test');

export const mcpStatus = () => invoke<McpStatus>('mcp_status');

export const mcpStart = () => invoke<number>('mcp_start');
export const mcpStop = () => invoke<boolean>('mcp_stop');

export const mcpReply = (reqId: string, result: unknown) =>
  invoke<boolean>('mcp_reply', { reqId, result });
export const mcpRotateToken = () => invoke<string>('mcp_rotate_token');
export const mcpWriteCli = (ids: string[]) => invoke<CliWriteResult[]>('mcp_write_cli', { ids });
export const mcpRemoveCli = (ids: string[]) => invoke<CliWriteResult[]>('mcp_remove_cli', { ids });
export const mcpCliStatus = () => invoke<CliStatus[]>('mcp_cli_status');

export const extensionsList = () => invoke<ExtensionInfo[]>('extensions_list');
export const extensionsLoad = (id: string) => invoke<ExtensionLoad>('extensions_load', { id });

export const extensionsAdd = (path: string) => invoke<ExtensionInfo>('extensions_add', { path });
export const extensionsRemove = (id: string) => invoke<boolean>('extensions_remove', { id });

export const extensionsFolder = () => invoke<string>('extensions_folder');

export const extensionsInstall = (path: string) =>
  invoke<ExtInstallHasil>('extensions_install', { path });

export const extensionsUninstall = (id: string) => invoke<boolean>('extensions_uninstall', { id });

export const extensionsSetEnabled = (id: string, on: boolean) =>
  invoke<boolean>('extensions_set_enabled', { id, on });

export const extensionsReadContrib = (id: string, rel: string) =>
  invoke<Record<string, unknown>>('extensions_read_contrib', { id, rel });
export const extensionsReadMain = (id: string, rel: string) =>
  invoke<string>('extensions_read_main', { id, rel });

export const extensionsReadFiles = (id: string) =>
  invoke<Record<string, string>>('extensions_read_files', { id });

export const extensionsManifests = () => invoke<ExtManifestStatus[]>('extensions_manifests');

export const extensionsWriteBundled = (id: string) =>
  invoke<string>('extensions_write_bundled', { id });

export const extensionsBundledIds = () => invoke<string[]>('extensions_bundled_ids');

export const extensionsDownloadVsix = (url: string, id: string) =>
  invoke<string>('extensions_download_vsix', { url, id });

export const extWhich = (runtime: string) =>
  invoke<string | null>('ext_which', { runtime });

export const extExec = (opts: {
  extId: string;
  runtime: string;
  bin: string;
  args: string[];
  cwd?: string | null;
  timeoutMs?: number;
}) => invoke<ExtExecResult>('ext_exec', opts);

export const getDiagnostics = () => invoke<Diagnostics>('get_diagnostics');

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

export const selfTest = () => invoke<SelfTestItem[]>('self_test');

export const logFrontend = (level: 'error' | 'warn' | 'info', message: string) =>
  invoke<void>('log_frontend', { level, message });

export const perfMark = (name: string, durMs?: number) =>
  invoke<void>('perf_mark', { name, durMs });

export const debugPanic = () => invoke<void>('debug_panic');

export const tasksLoad = (root?: string) => invoke<TasksFile>('tasks_load', { root });

export const tasksMatchers = () => invoke<string[]>('tasks_matchers');

export const tasksMatchLine = (matcher: string, line: string, root?: string) =>
  invoke<TaskProblem | null>('tasks_match_line', { matcher, line, root });

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

export const tasksWait = (id: string, timeoutMs?: number) =>
  invoke<TaskRun>('tasks_wait', { id, timeoutMs });

export const tasksKill = (id: string) => invoke<boolean>('tasks_kill', { id });

export const tasksRuns = () => invoke<TaskRun[]>('tasks_runs');

export const tasksClearRuns = () => invoke<number>('tasks_clear_runs');

export const tasksDetectPort = (line: string) =>
  invoke<{ port: number; https: boolean } | null>('tasks_detect_port', { line });

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

export const historyList = (path: string) => invoke<HistoryInfo>('history_list', { path });

export const historyRead = (path: string, id: string) =>
  invoke<string>('history_read', { path, id });

export const historyClear = (path: string) => invoke<number>('history_clear', { path });

export const historyPrune = (path: string, maxPerFile: number, maxDays: number) =>
  invoke<number>('history_prune', { path, maxPerFile, maxDays });

export const historyStats = () =>
  invoke<{ root: string; folder: number; snapshot: number; byte: number }>('history_stats');

export const searchGrep = (opts: SearchOpts, rgPath?: string) =>
  invoke<SearchSummary>('search_grep', { opts, rgPath });

export const searchCancel = () => invoke<boolean>('search_cancel');

export const searchRgInfo = (rgPath?: string) =>
  invoke<{ ada: boolean; path: string; versi: string }>('search_rg_info', { rgPath });

export const searchReplace = (files: string[], opts: SearchOpts, replacement: string) =>
  invoke<ReplaceHasil[]>('search_replace', { files, opts, replacement });

export const dapLoad = () => invoke<LaunchFile>('dap_load');

export const dapAdapters = () => invoke<AdapterSpec[]>('dap_adapters');

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

export const dapStop = () => invoke<boolean>('dap_stop');
export const dapStatus = () => invoke<Record<string, unknown>>('dap_status');

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

export const cliArgsAwal = () => invoke<CliArgs>('cli_args_awal');

export const cliParse = (argv: string[], cwd: string) =>
  invoke<CliArgs>('cli_parse', { argv, cwd });

export const cliWaitSelesai = (token: string) => invoke<boolean>('cli_wait_selesai', { token });

export const cliWaitBuat = (token: string) => invoke<string>('cli_wait_buat', { token });

export const cliWaitAktif = (token: string) => invoke<boolean>('cli_wait_aktif', { token });

export const cliTeks = (mode: 'help' | 'version' | 'banner', warna: boolean, kolom?: number) =>
  invoke<string>('cli_teks', { mode, warna, kolom });

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

export const workspaceSettingsAsal = (key: string, root?: string) =>
  invoke<string>('workspace_settings_asal', { key, root });
export const workspaceSetSettings = (patch: Record<string, unknown>) =>
  invoke<Record<string, unknown>>('workspace_set_settings', { patch });
export const workspaceBolehEksekusi = () => invoke<boolean>('workspace_boleh_eksekusi');

export const snippetsLoad = (lang: string) => invoke<SnippetSet>('snippets_load', { lang });

export const snippetsUserFile = (lang: string) => invoke<string>('snippets_user_file', { lang });

export const snippetsUserList = () => invoke<string[]>('snippets_user_list');

export const snippetsBuiltinLangs = () => invoke<string[]>('snippets_builtin_langs');

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

export const agentContext = () => invoke<string>('agent_context');

export const memoryRead = () => invoke<MemoryState>('memory_read');
export const memoryWrite = (opts: {
  section: 'memory' | 'user';
  action: 'add' | 'replace' | 'remove';
  content?: string;

  oldText?: string;
}) => invoke<string>('memory_write', opts);

export const cronList = () => invoke<CronJob[]>('cron_list');
export const cronCreate = (opts: {
  name: string;
  command: string;

  everyMinutes?: number;
  atHour?: number;
}) => invoke<CronJob>('cron_create', opts);
export const cronDelete = (id: string) => invoke<void>('cron_delete', { id });
export const cronToggle = (id: string, enabled: boolean) =>
  invoke<void>('cron_toggle', { id, enabled });
export const cronDue = () => invoke<CronJob[]>('cron_due');
export const cronMarkRun = (id: string) => invoke<void>('cron_mark_run', { id });
