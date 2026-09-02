// events.ts — nama event Rust→frontend (ARCHITECTURE.md §3).
// kebab-case, tanpa titik. Satu tempat agar tidak ada typo tersebar.

import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { AiChunk, FsChangeKind } from './types';

export const EV = {
  workspaceOpened: 'workspace-opened',
  fsChanged: 'fs-changed',
  ptyOutput: 'pty-output',
  ptyExit: 'pty-exit',
  sshStatus: 'ssh-status',
  aiChunk: 'ai-chunk',
  gitProgress: 'git-progress',
  mcpAction: 'mcp-action',
  mcpScreenshot: 'mcp-screenshot',
  settingsChanged: 'settings-changed',
  windowResized: 'window-resized',
  fileDropped: 'file-dropped',
  ramUsage: 'ram-usage',
} as const;

export function onRamUsage(cb: (bytes: number) => void): Promise<UnlistenFn> {
  return listen<{ bytes: number }>(EV.ramUsage, (e) => cb(e.payload.bytes));
}

export function onWorkspaceOpened(cb: (path: string) => void): Promise<UnlistenFn> {
  return listen<{ path: string }>(EV.workspaceOpened, (e) => cb(e.payload.path));
}

export function onSettingsChanged(cb: (key: string) => void): Promise<UnlistenFn> {
  return listen<{ key: string }>(EV.settingsChanged, (e) => cb(e.payload.key));
}

/** fase 04: perubahan file dari luar app (watcher). */
export function onFsChanged(
  cb: (p: { path: string; dir: string; kind: FsChangeKind }) => void,
): Promise<UnlistenFn> {
  return listen<{ path: string; dir: string; kind: FsChangeKind }>(EV.fsChanged, (e) =>
    cb(e.payload),
  );
}

/** fase 05: output terminal (sudah digabung per 16ms di Rust). */
export function onPtyOutput(cb: (id: string, data: string) => void): Promise<UnlistenFn> {
  return listen<{ id: string; data: string }>(EV.ptyOutput, (e) =>
    cb(e.payload.id, e.payload.data),
  );
}

/** fase 05: proses shell berakhir sendiri (exit / EOF). */
export function onPtyExit(cb: (id: string) => void): Promise<UnlistenFn> {
  return listen<{ id: string }>(EV.ptyExit, (e) => cb(e.payload.id));
}

/** fase 09: potongan jawaban AI (text / err / done). */
export function onAiChunk(cb: (c: AiChunk) => void): Promise<UnlistenFn> {
  return listen<AiChunk>(EV.aiChunk, (e) => cb(e.payload));
}
