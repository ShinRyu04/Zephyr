import { create } from 'zustand';

/**
 * "Agent Customizations" - deliberately NOT part of Settings.
 *
 * VSCode Copilot keeps "Agent Customizations" as a panel separate from the
 * editor's own Settings page: it is about what the agent knows and can do
 * (tools, MCP, instructions, agents, skills, hooks), not about the editor.
 *
 * IT IS A WINDOW NOW. It used to be a floating card (`AgentCustomModal`), which
 * meant this store owned its visibility. It does not any more: the window either
 * exists or it does not, and the platform is the authority on that. `buka` still
 * exists and still opens the panel, because several call sites ask for it by
 * this name and renaming them is how one gets missed and silently opens nothing.
 *
 * `section` stays: the window renders the same page, and this is the section
 * that page should show. It is written BEFORE the window opens, so a fresh
 * window lands on the right pane. A window that is already open is told through
 * a Tauri event instead - it is a separate WebView and cannot see this store.
 */
export type AgentCustomSection =
  | 'overview'
  | 'plugins'
  | 'mcp'
  | 'skills'
  | 'instructions'
  | 'agents'
  | 'hooks'
  | 'browser'
  | 'conversations'
  | 'permissions'
  | 'tools'
  | 'migrations';

interface AgentCustomState {
  /** Always false: there is no in-app card to show. Kept for older callers. */
  open: boolean;
  section: AgentCustomSection;
  buka: (section?: AgentCustomSection) => void;
  tutup: () => void;
  setSection: (s: AgentCustomSection) => void;
}

export const useAgentCustom = create<AgentCustomState>((set) => ({
  open: false,
  section: 'overview',
  buka: (section) => {
    set({ open: false, ...(section ? { section } : {}) });
    void import('./bukaPanel').then((m) => m.bukaPanel('agent-custom', section));
  },
  /* Closing a window from another window is the platform's job (the title bar's
     ✕); this stays a no-op so the shape of the store does not change under the
     callers that still call it. */
  tutup: () => set({ open: false }),
  setSection: (section) => set({ section }),
}));
