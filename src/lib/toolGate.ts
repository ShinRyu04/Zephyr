import { create } from 'zustand';

/*
 * Tool gate for the in-editor agent.
 *
 * The agent exposes a wide catalogue — shell, file writes, browser control,
 * cron, sub-agents — and not every session should hand all of it to the model.
 * This store is the single place that decides which tools may be called, so a
 * user can narrow the surface without editing a config file.
 *
 * State lives in memory and mirrors to `settings.ai.tools` through the caller;
 * the store itself stays synchronous so the menu can toggle rows without a
 * round-trip.
 */

/** Catalogue groups, in the order the menu lists them. */
export type ToolGroupId = 'files' | 'edit' | 'search' | 'shell' | 'web' | 'agents' | 'tasks' | 'schedule' | 'notes' | 'mcp';

export interface ToolGroup {
  id: ToolGroupId;
  /** Tool names as they appear in `agentTools.ts` — the join key. */
  tools: string[];
}

/*
 * Groups map tool names to the headings a reader expects.
 *
 * They follow the shape of the work rather than the module layout: `file_read`
 * and `file_list` are one idea to anyone scanning the list, and splitting them
 * across "files" and "search" would make the counts meaningless.
 */
export const TOOL_GROUPS: ToolGroup[] = [
  { id: 'files', tools: ['file_read', 'file_list', 'editor_read'] },
  { id: 'edit', tools: ['file_write', 'file_edit', 'file_patch', 'editor_write'] },
  { id: 'search', tools: ['get_problems', 'get_output', 'list_panes'] },
  { id: 'shell', tools: ['shell_exec', 'terminal_exec', 'terminal_read'] },
  { id: 'web', tools: ['web_search', 'web_fetch'] },
  { id: 'agents', tools: ['subagent_run'] },
  { id: 'tasks', tools: ['todo_write', 'todo_read'] },
  { id: 'schedule', tools: ['cron_create', 'cron_list', 'cron_delete'] },
  { id: 'notes', tools: ['skill_list', 'skill_view', 'skill_write', 'skill_delete', 'memory_read', 'memory_write'] },
  { id: 'mcp', tools: ['mcp_call', 'browser_open', 'browser_read', 'browser_click', 'browser_type', 'browser_nav', 'browser_list'] },
];

/** Every tool the gate knows about. */
export const SEMUA_TOOL: string[] = TOOL_GROUPS.flatMap((g) => g.tools);

/** Groups collapsed in the menu; the rest start open. */
const TERTUTUP_AWAL: ToolGroupId[] = ['mcp'];

interface ToolGateState {
  /** Tools the model may call. Everything absent is refused. */
  aktif: Set<string>;
  /** User-typed filter in the menu header. */
  cari: string;
  /** Whether the floating menu is on screen. */
  buka: boolean;
  /** Collapsed group ids. */
  tutup: Set<ToolGroupId>;

  setBuka: (v: boolean) => void;
  toggle: () => void;
  setCari: (v: string) => void;
  /** Flip one tool. */
  balik: (nama: string) => void;
  /** Enable every tool in a group, or disable them all. */
  setGrup: (id: ToolGroupId, nyala: boolean) => void;
  semua: (nyala: boolean) => void;
  lipat: (id: ToolGroupId) => void;
  /** Hydrate from persisted settings; unknown names are ignored. */
  dari: (nama: string[]) => void;
}

export const useToolGate = create<ToolGateState>((set, get) => ({
  aktif: new Set(SEMUA_TOOL),
  cari: '',
  buka: false,
  tutup: new Set(TERTUTUP_AWAL),

  setBuka: (v) => set({ buka: v }),
  toggle: () => set({ buka: !get().buka }),
  setCari: (v) => set({ cari: v }),

  balik: (nama) =>
    set((s) => {
      const next = new Set(s.aktif);
      if (next.has(nama)) next.delete(nama);
      else next.add(nama);
      return { aktif: next };
    }),

  setGrup: (id, nyala) =>
    set((s) => {
      const grup = TOOL_GROUPS.find((g) => g.id === id);
      if (!grup) return {};
      const next = new Set(s.aktif);
      for (const t of grup.tools) {
        if (nyala) next.add(t);
        else next.delete(t);
      }
      return { aktif: next };
    }),

  semua: (nyala) => set({ aktif: new Set(nyala ? SEMUA_TOOL : []) }),

  lipat: (id) =>
    set((s) => {
      const next = new Set(s.tutup);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { tutup: next };
    }),

  /*
   * An empty persisted list means "nothing was ever chosen", not "deny all" —
   * a fresh profile must start with the full catalogue or the agent answers
   * every request with a permission error. Only a non-empty list narrows.
   */
  dari: (nama) => {
    if (!Array.isArray(nama) || nama.length === 0) return;
    const sah = nama.filter((n) => SEMUA_TOOL.includes(n));
    if (sah.length === 0) return;
    set({ aktif: new Set(sah) });
  },
}));
