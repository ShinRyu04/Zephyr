import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { AiChunk, FsChangeKind, GhLoginEvent, GitProgress, McpAction } from './types';

export const EV = {
  workspaceOpened: 'workspace-opened',
  fsChanged: 'fs-changed',
  ptyOutput: 'pty-output',
  ptyExit: 'pty-exit',
  sshStatus: 'ssh-status',
  aiChunk: 'ai-chunk',
  ghLogin: 'gh-login',
  gitProgress: 'git-progress',
  mcpAction: 'mcp-action',
  mcpScreenshot: 'mcp-screenshot',
  mcpConnect: 'mcp-connect',
  settingsChanged: 'settings-changed',
  windowResized: 'window-resized',
  fileDropped: 'file-dropped',
  ramUsage: 'ram-usage',
  lspEvent: 'lsp-event',
  cliChatChunk: 'cli-chat-chunk',
} as const;

/**
 * One structured event from a hosted CLI, relayed inside a `cli-chat-chunk`.
 *
 * The backend (`cli_chat.rs`) parses each CLI's native newline-JSON dialect
 * (Claude `stream-json`, Codex `--json`) into this one shape so the frontend
 * renders thinking / tool calls / diffs the same way regardless of agent. When
 * `event` is present, the top-level `text` is absent (and vice versa).
 */
export type CliEvent =
  | { kind: 'text'; text: string }
  | { kind: 'thinking'; text: string }
  | { kind: 'error'; text: string }
  | {
      kind: 'tool';
      tool: {
        /** Stable id to match a `running` start with its `ok`/`fail` close. */
        callId: string;
        /** Tool name, e.g. "Bash", "Edit", "Read", "command_execution". */
        name: string;
        /** Human target: the command text or the file path. */
        title?: string;
        /** Raw args as pretty JSON, or the command text. */
        input?: string;
        status: 'running' | 'ok' | 'fail';
        /** tool_result / aggregated_output (may be partial). */
        output?: string;
        exitCode?: number | null;
        /** For a file edit: the diff halves + path, so the UI can draw a diff. */
        diffOld?: string;
        diffNew?: string;
        path?: string;
      };
    };

export interface CliChatChunk {
  id: string;
  text?: string;
  stderr?: string;
  done?: boolean;
  cancelled?: boolean;
  /** A structured event (thinking / text / tool / error). */
  event?: CliEvent;
}

export function onCliChatChunk(cb: (chunk: CliChatChunk) => void): Promise<UnlistenFn> {
  return listen<CliChatChunk>(EV.cliChatChunk, (e) => cb(e.payload));
}

export function onLspEvent(
  cb: (ev: Record<string, unknown>) => void,
): Promise<UnlistenFn> {
  return listen<Record<string, unknown>>(EV.lspEvent, (e) => cb(e.payload));
}

export function onRamUsage(cb: (bytes: number) => void): Promise<UnlistenFn> {
  return listen<{ bytes: number }>(EV.ramUsage, (e) => cb(e.payload.bytes));
}

export function onWorkspaceOpened(cb: (path: string) => void): Promise<UnlistenFn> {
  return listen<{ path: string }>(EV.workspaceOpened, (e) => cb(e.payload.path));
}

export function onSettingsChanged(cb: (key: string) => void): Promise<UnlistenFn> {
  return listen<{ key: string }>(EV.settingsChanged, (e) => cb(e.payload.key));
}

export function onFsChanged(
  cb: (p: { path: string; dir: string; kind: FsChangeKind }) => void,
): Promise<UnlistenFn> {
  return listen<{ path: string; dir: string; kind: FsChangeKind }>(EV.fsChanged, (e) =>
    cb(e.payload),
  );
}

export function onPtyOutput(cb: (id: string, data: string) => void): Promise<UnlistenFn> {
  return listen<{ id: string; data: string }>(EV.ptyOutput, (e) =>
    cb(e.payload.id, e.payload.data),
  );
}

export function onPtyExit(cb: (id: string, code: number | null) => void): Promise<UnlistenFn> {
  return listen<{ id: string; code?: number | null }>(EV.ptyExit, (e) =>
    cb(e.payload.id, e.payload.code ?? null),
  );
}

declare global {
  interface Window {
    __ZEPHYR_AI_LISTENER_PROMISE__?: Promise<UnlistenFn>;
    __ZEPHYR_AI_CALLBACK__?: (c: AiChunk) => void;
  }
}

export function onAiChunk(cb: (c: AiChunk) => void): Promise<UnlistenFn> {
  if (typeof window !== 'undefined') {
    window.__ZEPHYR_AI_CALLBACK__ = cb;
    if (!window.__ZEPHYR_AI_LISTENER_PROMISE__) {
      window.__ZEPHYR_AI_LISTENER_PROMISE__ = listen<AiChunk>(EV.aiChunk, (e) => {
        window.__ZEPHYR_AI_CALLBACK__?.(e.payload);
      });
    }
    return window.__ZEPHYR_AI_LISTENER_PROMISE__;
  }
  return listen<AiChunk>(EV.aiChunk, (e) => cb(e.payload));
}

export function onGhLogin(cb: (e: GhLoginEvent) => void): Promise<UnlistenFn> {
  return listen<GhLoginEvent>(EV.ghLogin, (e) => cb(e.payload));
}

export function onMcpAction(cb: (a: McpAction) => void): Promise<UnlistenFn> {
  return listen<McpAction>(EV.mcpAction, (e) => cb(e.payload));
}

export function onMcpScreenshot(
  cb: (p: { paneId: string; path: string }) => void,
): Promise<UnlistenFn> {
  return listen<{ paneId: string; path: string }>(EV.mcpScreenshot, (e) => cb(e.payload));
}

export function onMcpConnect(
  cb: (p: { client: string; userAgent: string }) => void,
): Promise<UnlistenFn> {
  return listen<{ client: string; userAgent: string }>(EV.mcpConnect, (e) => cb(e.payload));
}

export function onGitProgress(cb: (p: GitProgress) => void): Promise<UnlistenFn> {
  return listen<GitProgress>(EV.gitProgress, (e) => cb(e.payload));
}

export function onWindowResized(
  cb: (p: { width: number; height: number }) => void,
): Promise<UnlistenFn> {
  return listen<{ width: number; height: number }>(EV.windowResized, (e) => cb(e.payload));
}

export function onFileDropped(cb: (paths: string[]) => void): Promise<UnlistenFn> {
  return listen<{ paths: string[] }>(EV.fileDropped, (e) => cb(e.payload.paths));
}
