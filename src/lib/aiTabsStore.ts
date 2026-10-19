import { create } from 'zustand';
import * as cmd from './commands';
import { useStore } from './store';
import { disposeHandle } from './xtermRegistry';

/*
 * The AI panel's top tab strip — VSCode/Copilot style.
 *
 * Tab "chat" is Zephyr's own AI panel. The other tabs host an external coding
 * CLI (Claude Code, Codex, …) the way VSCode surfaces an installed extension:
 * they only appear when the CLI is actually detected on PATH, and selecting one
 * spawns the CLI once in its own hidden PTY and renders it with the shared
 * <XtermPane/>. Login is the CLI's OWN job (its OAuth / `/login`), so a session
 * started here is in sync with the same CLI run from a terminal — Zephyr never
 * handles the credentials itself.
 *
 * Cara A (host the CLI as-is): the tab shows the CLI's own TUI, not a Zephyr
 * re-skin. That is exactly what VSCode does, and it keeps every CLI feature and
 * update working without Zephyr parsing their output.
 */

/* Which detected CLIs get a tab, and in what order. `list_agents` can return
   many agents (gemini, grok, gh, …); the panel strip mirrors the reference,
   which only promotes the two coding CLIs. The rest stay reachable from the
   terminal's agent picker as before. */
/*
 * Which detected CLIs get a tab in the AI PANEL strip, and in what order.
 *
 * Deliberately a SHORT list: `claude` and `codex` only.
 *
 * `list_agents()` detects many CLIs (opencode, gemini, gh, hermes, dsh, omp,
 * qoder, …) and they are all reachable from the TERMINAL - both the left
 * sidebar's "AGENT CLIS DETECTED" list and the bottom terminal's `+` menu. That
 * is where they belong: the terminal hosts their TUI as-is.
 *
 * The AI panel strip is a different surface. Each tab there needs its own chat
 * adapter (`CliChat` for Claude, `CodexChat` for Codex) to render the CLI's
 * conversation; the others have no such adapter, so promoting them here would
 * open a tab that cannot draw anything. The reader said this plainly: the right
 * column is for Agent / Claude Code / Codex only, and the rest should not be
 * there until they are built.
 *
 * Widening this list is a real feature - add the adapter first, then the id.
 */
const TAB_PANEL: readonly string[] = ['claude', 'codex'];

/** A CLI tab descriptor. */
export interface CliTab {
  id: string;
  label: string;
}

/** The tab list for the CLIs present in `agents`. Pure, so it can be tested. */
export function cliTabs(agents: readonly { id: string; label: string }[]): CliTab[] {
  const ada = new Set(agents.map((a) => a.id));
  const keluar: CliTab[] = [];
  for (const id of TAB_PANEL) {
    if (!ada.has(id)) continue;
    const info = agents.find((a) => a.id === id);
    keluar.push({ id, label: info?.label || id });
  }
  return keluar;
}

export type AiTabId = 'chat' | string;

interface CliSession {
  /** The PTY/pane id, also the xterm handle id. */
  paneId: string;
  /** The resolved binary path, for the title / debugging. */
  path: string;
}

interface AiTabsState {
  active: AiTabId;
  /** agentId -> live PTY session, spawned lazily on first open. */
  sessions: Record<string, CliSession>;
  /** agentId currently being spawned, to avoid a double spawn. */
  spawning: string | null;
  error: string | null;

  setActive: (id: AiTabId) => void;
  /** Spawn the CLI for `agentId` if not already running. */
  ensureSession: (agentId: string) => Promise<void>;
  /** Kill a CLI session and drop its terminal. */
  killSession: (agentId: string) => void;
}

let seq = 0;
const nextPaneId = () => `aicli-${Date.now().toString(36)}-${(seq++).toString(36)}`;

export const useAiTabs = create<AiTabsState>((set, get) => ({
  active: 'chat',
  sessions: {},
  spawning: null,
  error: null,

  setActive: (id) => set({ active: id, error: null }),

  ensureSession: async (agentId) => {
    if (get().sessions[agentId] || get().spawning === agentId) return;

    /* The CLI must be detected first. `terminalStore` already loads the agent
       catalogue (`list_agents`) at startup; read it from there rather than
       detecting twice. */
    const { useTerminal } = await import('./terminalStore');
    let info = useTerminal.getState().agents.find((a) => a.id === agentId);
    if (!info) {
      /*
       * The catalogue may simply not be loaded yet. Asking again is cheap (one
       * PATH scan) and it is the difference between "not installed" and a tab
       * that works: before this, a click that landed before the startup scan
       * finished reported a missing CLI that was in fact on PATH.
       */
      await useTerminal.getState().loadAgents();
      info = useTerminal.getState().agents.find((a) => a.id === agentId);
    }
    if (!info) {
      set({ error: `${agentId} is not installed` });
      return;
    }

    set({ spawning: agentId, error: null });
    const paneId = nextPaneId();
    const workspace = useStore.getState().workspace || undefined;
    try {
      await cmd.ptySpawn({
        id: paneId,
        kind: 'agent',
        command: info.path,
        args: [],
        cwd: workspace,
        cols: 80,
        rows: 24,
      });
      set((s) => ({
        sessions: { ...s.sessions, [agentId]: { paneId, path: info.path } },
        spawning: null,
      }));
    } catch (e) {
      set({ spawning: null, error: cmd.asZephyrError(e).message });
    }
  },

  killSession: (agentId) => {
    const sess = get().sessions[agentId];
    if (!sess) return;
    void cmd.ptyKill(sess.paneId).catch(() => {});
    disposeHandle(sess.paneId);
    set((s) => {
      const rest = { ...s.sessions };
      delete rest[agentId];
      return { sessions: rest };
    });
  },
}));
