// commands.ts — SATU-SATUNYA jembatan ke Rust (AGENTS.md §4).
// Komponen tidak boleh memanggil invoke() langsung.

import { invoke } from '@tauri-apps/api/core';
import type {
  AgentInfo,
  AppInfo,
  DirNode,
  Encoding,
  LineEnding,
  PtyInfo,
  PublicModel,
  ModelTestResult,
  ReadResult,
  RecentEntry,
  SearchResult,
  SessionTab,
  Settings,
  ShellInfo,
  StatResult,
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
export const workspaceOpen = (path: string) => invoke<void>('workspace_open', { path });
export const workspaceClose = () => invoke<void>('workspace_close');

// ── fs / editor ──

export const fsRead = (path: string, encoding?: Encoding) =>
  invoke<ReadResult>('fs_read', { path, encoding });
export const fsWrite = (
  path: string,
  content: string,
  encoding?: Encoding,
  lineEnding?: LineEnding,
) => invoke<void>('fs_write', { path, content, encoding, lineEnding });
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
