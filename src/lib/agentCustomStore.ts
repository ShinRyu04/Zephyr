import { create } from 'zustand';

/**
 * Popup "Agent Customizations", a modal of its own — deliberately NOT part of
 * Settings.
 *
 * VSCode Copilot keeps "Agent Customizations" as a floating panel separate from
 * the editor's own Settings page: it is about what the agent knows and can do
 * (tools, MCP, instructions, agents, skills, hooks), not about the editor. This
 * store only tracks whether that modal is open and which section is active, so
 * it never collides with `settingsOpen` (which drives the editor-area Settings).
 */
export type AgentCustomSection =
  | 'overview'
  | 'plugins'
  | 'mcp'
  | 'skills'
  | 'instructions'
  | 'agents'
  | 'hooks'
  | 'tools'
  | 'migrations';

interface AgentCustomState {
  open: boolean;
  section: AgentCustomSection;
  buka: (section?: AgentCustomSection) => void;
  tutup: () => void;
  setSection: (s: AgentCustomSection) => void;
}

export const useAgentCustom = create<AgentCustomState>((set) => ({
  open: false,
  section: 'overview',
  buka: (section) => set({ open: true, ...(section ? { section } : {}) }),
  tutup: () => set({ open: false }),
  setSection: (section) => set({ section }),
}));
