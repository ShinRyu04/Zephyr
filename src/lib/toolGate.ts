import { create } from 'zustand';
import { AGENT_TOOLS } from './agentTools';

const AGENT_TOOL_NAMES = AGENT_TOOLS.map((tool) => tool.spec.name);
const LEGACY_TOOL_NAMES = new Set([
  'file_read', 'file_list', 'editor_read',
  'file_write', 'file_edit', 'file_patch', 'editor_write',
  'get_problems', 'get_output', 'list_panes',
  'shell_exec', 'terminal_exec', 'terminal_read',
  'web_search', 'web_fetch', 'subagent_run',
  'todo_write', 'todo_read',
  'cron_create', 'cron_list', 'cron_delete',
  'skill_list', 'skill_view', 'skill_write', 'skill_delete', 'memory_read', 'memory_write',
  'mcp_call', 'browser_open', 'browser_read', 'browser_click', 'browser_type', 'browser_nav', 'browser_list',
]);

const EXTRA_GROUPS: Record<ToolGroupId, string[]> = {
  files: ['search_text', 'find_files', 'read_image', 'open_file', 'workspace', 'worktree'],
  edit: ['editor_save', 'file_delete', 'file_move', 'file_copy', 'dir_create', 'replace_in_files'],
  search: ['get_output'],
  shell: ['terminal_kill', 'terminal_wait', 'pane_control', 'focus_pane', 'ssh'],
  web: ['browser_download_url', 'system_browser_open', 'browser_close'],
  agents: ['subagent_list'],
  tasks: [],
  schedule: ['schedule_command'],
  notes: ['settings', 'extensions'],
  mcp: [],
};

function makeToolGroups(base: ToolGroup[]): ToolGroup[] {
  const seen = new Set<string>();
  const groups = base.map((group) => {
    const candidates = [...group.tools, ...(EXTRA_GROUPS[group.id] ?? [])];
    const tools = candidates.filter((name) => {
      if (!AGENT_TOOL_NAMES.includes(name) || seen.has(name)) return false;
      seen.add(name);
      return true;
    });
    return { ...group, tools };
  });
  const ungrouped = AGENT_TOOL_NAMES.filter((name) => !seen.has(name));
  if (ungrouped.length > 0) groups[0].tools.push(...ungrouped);
  return groups;
}

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
export const TOOL_GROUPS: ToolGroup[] = makeToolGroups([
  { id: 'files', tools: ['file_read', 'file_list', 'editor_read'] },
  { id: 'edit', tools: ['file_write', 'file_edit', 'file_patch', 'editor_write'] },
  { id: 'search', tools: ['get_problems', 'get_output', 'list_panes'] },
  { id: 'shell', tools: ['shell_exec', 'terminal_exec', 'terminal_read', 'start_server', 'server_status', 'server_stop', 'run_tests', 'debug'] },
  { id: 'web', tools: ['web_search', 'web_fetch'] },
  { id: 'agents', tools: ['subagent_run'] },
  { id: 'tasks', tools: ['todo_write', 'todo_read', 'run_task', 'panel_focus', 'lsp_query', 'snippets', 'keybindings'] },
  { id: 'schedule', tools: ['cron_create', 'cron_list', 'cron_delete'] },
  { id: 'notes', tools: ['skill_list', 'skill_view', 'skill_write', 'skill_delete', 'memory_read', 'memory_write'] },
  { id: 'mcp', tools: ['mcp_call', 'browser_open', 'browser_read', 'browser_click', 'browser_type', 'browser_nav', 'browser_list'] },
]);

/** Every tool the gate knows about, derived from the executable catalogue. */
export const SEMUA_TOOL: string[] = [...AGENT_TOOL_NAMES];

/**
 * The subset of write tools that PERSIST to disk.
 *
 * `TOOL_TULIS` in agentTools is the wider "changes something" set: it also
 * covers `run_tests`, `panel_focus`, `git`, `settings`, layout and scheduling
 * tools. Only the names here can put bytes on disk, so only these need the
 * user's consent before the call is dispatched. `editor_write` is deliberately
 * ABSENT: it rewrites the live buffer of an already-open tab and never saves,
 * so the user still has to press save — and the dirty dot already surfaces it.
 * Prompting for it would train people to click through the dialog, which is
 * exactly what makes the real write prompt worthless.
 *
 * This lives next to the tool catalogue because both the main agent loop
 * (aiStore) and the subagent loop (subagentStore) must agree on it; keeping
 * one exported constant is what stops the two lists from drifting.
 */
export const TOOL_DISK_TULIS: Set<string> = new Set([
  'file_write',
  'file_edit',
  'file_patch',
  'editor_save',
  'file_delete',
  'file_move',
  'file_copy',
  'dir_create',
  'replace_in_files',
]);

/** True when the named tool can write to disk without the user saving first. */
export function menulisKeDisk(nama: string): boolean {
  return TOOL_DISK_TULIS.has(nama);
}

/**
 * What each tool does, in one line, for the tool list.
 *
 * The list used to show a bare name, which is enough for someone who already
 * knows the tool and useless for anyone deciding whether to leave it on. TEDI
 * prints the name and then the thing it acts on — "MCP TEDI READ terminal",
 * "MCP TEDI SH Get-CimInstance ..." — so a reader can tell a read from a write
 * without opening documentation. The strings here are deliberately about the
 * OBJECT (what it touches), not the verb: the verb is already in the name.
 */
export const TOOL_DESKRIPSI: Record<string, string> = {
  file_read: 'path',
  file_list: 'folder',
  editor_read: 'active buffer',
  file_write: 'path + contents',
  file_edit: 'old text → new text',
  file_patch: 'unified diff',
  editor_write: 'active buffer',
  get_problems: 'diagnostics',
  get_output: 'panel channel',
  list_panes: 'open panes',
  shell_exec: 'command → exit code + output',
  terminal_exec: 'command → live pane',
  terminal_read: 'pane scrollback',
  web_search: 'query',
  web_fetch: 'url',
  subagent_run: 'task list (parallel)',
  todo_write: 'task list',
  todo_read: '—',
  cron_create: 'schedule + prompt',
  cron_list: '—',
  cron_delete: 'id',
  skill_list: '—',
  skill_view: 'skill name',
  skill_write: 'skill name + body',
  skill_delete: 'skill name',
  memory_read: '—',
  memory_write: 'entry',
  mcp_call: 'server + tool + args',
  browser_open: 'url → page text',
  browser_read: 'open page',
  browser_click: 'css selector',
  browser_type: 'selector + text',
  browser_nav: 'back | forward | reload | url',
  browser_list: '—',
};

for (const name of SEMUA_TOOL) {
  if (!TOOL_DESKRIPSI[name]) TOOL_DESKRIPSI[name] = 'agent tool';
}

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
  /** Tools the user has permanently opted in to writing to disk with. */
  tulisIzin: Set<string>;

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

  /**
   * Per-tool consent for DISK WRITES, separate from the command allow-list.
   *
   * `settings.allowCommands` holds shell command prefixes and is matched with
   * `startsWith`; reusing it here would let a command name whitelist a file
   * write, which is not what the user agreed to. Empty means "nothing opted
   * in", so every write prompts until the user chooses otherwise.
   */
  tulisDiizinkan: (nama: string) => boolean;
  izinkanTulis: (nama: string, izin: boolean) => void;
}

export const useToolGate = create<ToolGateState>((set, get) => ({
  aktif: new Set(SEMUA_TOOL),
  cari: '',
  buka: false,
  tutup: new Set(TERTUTUP_AWAL),
  tulisIzin: new Set<string>(),

  tulisDiizinkan: (nama) => get().tulisIzin.has(nama),

  izinkanTulis: (nama, izin) =>
    set((s) => {
      const next = new Set(s.tulisIzin);
      if (izin) next.add(nama);
      else next.delete(nama);
      return { tulisIzin: next };
    }),

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
    const additions = SEMUA_TOOL.filter((n) => !LEGACY_TOOL_NAMES.has(n));
    const isLegacySettings = !sah.some((n) => additions.includes(n));
    // Older settings stored only enabled names and therefore cannot express a
    // deliberate choice about tools introduced later. Preserve those choices,
    // while enabling newly catalogued tools. Once a new tool is present in the
    // persisted list, omissions are explicit and the list is respected exactly.
    const effective = isLegacySettings ? [...new Set([...sah, ...additions])] : sah;
    set({ aktif: new Set(effective) });
  },
}));
