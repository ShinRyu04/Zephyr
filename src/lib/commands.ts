// commands.ts — SATU-SATUNYA jembatan ke Rust (AGENTS.md §4).
// Komponen tidak boleh memanggil invoke() langsung.

import { invoke } from '@tauri-apps/api/core';
import type {
  AppInfo,
  Encoding,
  LineEnding,
  ReadResult,
  RecentEntry,
  SessionTab,
  Settings,
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
