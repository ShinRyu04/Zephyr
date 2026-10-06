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
export const CLI_TABS: { id: string; label: string }[] = [
  { id: 'claude', label: 'Claude Code' },
  { id: 'codex', label: 'Codex' },
];

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
    const info = useTerminal.getState().agents.find((a) => a.id === agentId);
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
