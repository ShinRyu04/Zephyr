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
  /* Mintalah jendela editor (utama) membuka file di tab — dikirim dari
     jendela Agents (menu klik kanan "Open in New Tab" di pohon File). */
  openFileInEditor: 'open-file-in-editor',
} as const;

/**
 * One structured event from a hosted CLI, relayed inside a `cli-chat-chunk`.
 *
 * The backend (`cli_chat.rs`) parses each CLI's native newline-JSON dialect
 * (Claude `stream-json`, Codex `--json`) into this one shape so the frontend
 * renders thinking / tool calls / diffs the same way regardless of agent. When
 * `event` is present, the top-level `text` is absent (and vice versa).
 */
/**
 * Every event can belong to a subagent.
 *
 * The tag lives at the top level rather than inside `tool` because a subagent
 * produces text and thinking too, not only tool calls — grouping only the tool
 * rows would leave its prose misattributed to the main agent. Applied as an
 * intersection so each variant keeps its own required fields.
 */
type MilikSarang = {
  /**
   * The `Task` call this event belongs to, when a subagent produced it.
   *
   * With `--forward-subagent-text` the CLI relays a subagent's own text,
   * thinking and tool calls as ordinary lines tagged with
   * `parent_tool_use_id` — the id of the `Task` call that spawned it. Carried
   * through so the transcript can group a subagent's work under its call
   * instead of showing one silent `Task` row for minutes and then a summary.
   *
   * Absent on everything the main agent produced.
   */
  parentId?: string;
};

export type CliEvent = MilikSarang &
  (
  | { kind: 'text'; text: string }
  | { kind: 'thinking'; text: string }
  | { kind: 'error'; text: string }
  /**
   * The CLI's own session id, from its init line.
   *
   * Held so the next prompt can continue this conversation with `--resume`.
   * Without it the panel has no handle on the session the CLI created, and every
   * prompt would start fresh.
   */
  | { kind: 'session'; sessionId: string }
  /**
   * Token counts and cost for the run, from the CLI's closing `result` line.
   *
   * The only frame that reports them; discarding it left the context meter at
   * 0% however full the conversation became.
   */
  | { kind: 'usage'; input: number; output: number; cost: number; turns: number }
  /*
   * A task-list snapshot from TodoWrite / TaskCreate / TaskUpdate.
   *
   * Sent as its own event kind rather than as a tool row: the checklist IS how
   * that call should be represented, so the backend never emits a tool row for
   * it. The list is complete on every send (TodoWrite's contract), which is why
   * the consumer replaces rather than merges.
   */
  | {
      kind: 'todo';
      items: {
        content: string;
        activeForm: string;
        status: string;
        id: string;
      }[];
    }
  /*
   * A subagent's lifecycle, from the CLI's own `system` task lines.
   *
   * Four phases (`started` / `progress` / `updated` / `notification`) all keyed
   * by `taskId`, and the UI merges them into one card. `progress` arrives many
   * times with CUMULATIVE `tokens` / `toolUses` / `durationMs`, so a consumer
   * must replace, never add — accumulating would multiply a card's token count
   * by the number of progress lines (20 of them in a measured two-agent run).
   *
   * This is the ONLY source for a card's duration and token count: the tagged
   * transcript rows carry no such numbers.
   */
  | {
      kind: 'task';
      taskId: string;
      phase: 'started' | 'progress' | 'updated' | 'notification' | string;
      /** The spawning call's id — joins the card to its tagged rows. */
      toolUseId?: string;
      description?: string;
      subagentType?: string;
      /** The full instruction the agent was given — only on `started`. */
      prompt?: string;
      /** 1 = spawned by the main agent; higher = by another subagent. */
      spawnDepth?: number;
      /** Still running after its parent returned. */
      background?: boolean;
      tokens?: number;
      toolUses?: number;
      durationMs?: number;
      lastTool?: string;
      status?: string;
      summary?: string;
    }
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
    }
  );

export interface CliChatChunk {
  id: string;
  text?: string;
  stderr?: string;
  done?: boolean;
  cancelled?: boolean;
  /** A structured event (thinking / text / tool / error). */
  event?: CliEvent;
  /**
   * Token counts the provider reported for this run.
   *
   * Cumulative for the turn, so the consumer REPLACES rather than adds. Sent on
   * several frames as the turn progresses; the last one is the answer.
   */
  usage?: { input: number; output: number };
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

/** Jendela editor meminta file dibuka di tab (dikirim dari jendela Agents). */
export function onOpenFileInEditor(cb: (path: string) => void): Promise<UnlistenFn> {
  return listen<{ path: string }>(EV.openFileInEditor, (e) => cb(e.payload.path));
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
    /** Every live consumer, not just the newest one — see `onAiChunk`. */
    __ZEPHYR_AI_CALLBACKS__?: Set<(c: AiChunk) => void>;
    /** @deprecated kept so existing diagnostics keep working; mirrors the newest. */
    __ZEPHYR_AI_CALLBACK__?: (c: AiChunk) => void;
  }
}

/**
 * Subscribe to `ai-chunk`.
 *
 * The Tauri listener is installed ONCE per window (the call below is a no-op
 * after the first) but must serve EVERY subscriber. It used to hold a single
 * `__ZEPHYR_AI_CALLBACK__` slot that each caller overwrote, so only the last
 * registrant ever received a chunk and every earlier one was silently dropped.
 *
 * The subscription is kept as a Set and each entry is invoked on every chunk.
 * That alone was not enough: a caller can be bound to a DIFFERENT `useAi`
 * instance than the one the UI reads (Vite can hand out two copies of the store
 * module across an HMR boundary, and each `create()` is its own store). In that
 * state the chunk is delivered to a live function that writes to a store
 * nothing renders - measured as `cb !== store.getState().onChunk` with the
 * listener demonstrably firing. The symptom was the reported one: an agents
 * chat stuck on "thinking" with no reply and no error, because `agentBusy` was
 * only ever cleared inside the store that never saw the chunk.
 *
 * `useAiChunkListener` therefore registers a callback that re-reads the live
 * store on every chunk instead of closing over one instance.
 */
export function onAiChunk(cb: (c: AiChunk) => void): Promise<UnlistenFn> {
  if (typeof window !== 'undefined') {
    const daftar = (window.__ZEPHYR_AI_CALLBACKS__ ??= new Set());
    daftar.add(cb);
    window.__ZEPHYR_AI_CALLBACK__ = cb;
    if (!window.__ZEPHYR_AI_LISTENER_PROMISE__) {
      window.__ZEPHYR_AI_LISTENER_PROMISE__ = listen<AiChunk>(EV.aiChunk, (e) => {
        for (const f of window.__ZEPHYR_AI_CALLBACKS__ ?? []) {
          try {
            f(e.payload);
          } catch {
            /* One bad consumer must not stop the others. */
          }
        }
      });
    }
    const janji = window.__ZEPHYR_AI_LISTENER_PROMISE__;
    return janji.then((un) => () => {
      window.__ZEPHYR_AI_CALLBACKS__?.delete(cb);
      /*
       * Also drop the cached promise when the last consumer leaves.
       *
       * Without this the window is left with a promise that resolves to an
       * ALREADY-CALLED unlisten while `__ZEPHYR_AI_CALLBACKS__` goes empty: the
       * next mount sees a truthy `__ZEPHYR_AI_LISTENER_PROMISE__`, installs no
       * new Tauri listener, and every later chunk is delivered to nobody. That
       * is precisely the reported failure - a raw `ai-chunk` listener proved
       * the events still arrived, while the store's `onChunk` was never
       * entered. Clearing the slot makes the next subscriber re-install.
       *
       * Only when empty: a component unmounting must not tear the listener out
       * from under the others.
       */
      if ((window.__ZEPHYR_AI_CALLBACKS__?.size ?? 0) === 0) {
        window.__ZEPHYR_AI_LISTENER_PROMISE__ = undefined;
        un();
      }
    });
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
