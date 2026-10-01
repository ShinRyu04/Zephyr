/*
 * Grouping layer for the AI tool picker.
 *
 * `toolGate.ts` owns WHICH tools are active (the `aktif` set, the persisted
 * selection, the disk-write consent). It answers "may the model call this?".
 * That gate says nothing about how the catalogue should be *presented*: with a
 * flat list of names the menu is a wall of rows and the user cannot tell a file
 * tool from a browser tool at a glance.
 *
 * This module is that missing presentation layer and nothing else. It is pure:
 * no React, no Tauri, no store import, no side effects — so it can be unit
 * tested on its own and reused by any picker (agent menu, subagent tool subset,
 * settings screens) without dragging the app state along. Where a caller needs
 * a one-line description it passes one in; the gate remains the owner of the
 * live tool list (`SEMUA_TOOL`) and the descriptions (`TOOL_DESKRIPSI`).
 */

/** Whether a group is on by default, or has to be opted into. */
export type ToolSection = 'Core' | 'Optional';

/** One row in the picker: the tool name plus the labels the UI renders. */
export type ToolDescriptor = {
  name: string;
  description: string;
  section: ToolSection;
  group: string;
};

/**
 * Derive the picker group from a tool NAME alone.
 *
 * The group is derived, never looked up in a hand-maintained table, for one
 * reason: a static assignment has to be edited every time a tool is added to
 * `agentTools.ts`, and a forgotten entry silently drops the new tool into
 * whatever fallback the table happens to have. Deriving from the name means a
 * tool that follows the naming convention (`browser_*`, `file_*`, `lsp_*`, ...)
 * lands in the right heading the moment it exists, with no registration step
 * and no second list to keep in sync.
 *
 * The rules are ordered from the most specific to the most general, because
 * several of them can match the same name and the first match wins.
 */
export function builtinGroup(name: string): string {
  if (name.startsWith('file_')) return 'Files';
  if (name.startsWith('search_') || name === 'find_files') return 'Search';
  if (name.startsWith('shell_')) return 'Shell';
  // Web tools carry no shared prefix, so they are matched by exact name.
  if (name === 'web_search' || name === 'web_fetch' || name === 'read_image') return 'Web';
  if (name === 'subagent_run' || name === 'subagent_batch' || name === 'task_complete') return 'Sub-agents';
  if (name.startsWith('todo_')) return 'Tasks';
  if (name.startsWith('notes_')) return 'Notes';
  /*
   * `schedule_command` and the `cron_*` family are one idea to the user: the
   * scheduler and the cron store back the same job list, so they share a group.
   * The keyword test is deliberately a `contains` rather than a prefix, because
   * a future `reschedule_*` or `unschedule_*` should follow the same rule.
   *
   * This sits above the `browser_`/`skill_` rules but below the prefixed core
   * groups, and it must stay reachable: a cron tool is classified by this line
   * before any later rule can claim it.
   */
  if (name.startsWith('cron_')) return 'Cron';
  if (name.includes('schedule')) return 'Schedule';
  if (name.startsWith('browser_')) return 'Browser';
  if (name.startsWith('skill_')) return 'Skills';
  if (name.startsWith('memory_')) return 'Memory';
  if (name.startsWith('ssh_')) return 'SSH';
  if (name.startsWith('debug_')) return 'Debug';
  if (name.startsWith('lsp_')) return 'Language';
  if (name.startsWith('mcp_')) return 'MCP';
  if (
    name.startsWith('clipboard_') ||
    name === 'screenshot_ui' ||
    name === 'ask_user' ||
    name === 'plan_mode'
  ) {
    return 'Utility';
  }
  // A tool that matches no convention still has to appear somewhere; 'Other'
  // keeps it visible in the picker instead of hiding it from the user.
  return 'Other';
}

/** Groups that are on by default; everything else the user opts into. */
const CORE_GROUPS: ReadonlySet<string> = new Set([
  'Files',
  'Search',
  'Shell',
  'Web',
  'Sub-agents',
  'Tasks',
  'Notes',
  'Schedule',
]);

/**
 * Which section a group belongs to.
 *
 * The split is about the shape of the work, not about risk: the core groups
 * are the ones an editing session needs before it can do anything (read, find,
 * run, fetch, delegate, track, remember, schedule), and the rest are surface
 * area that a session may never touch. Being in Optional does not disable
 * anything by itself — `toolGate` still decides what is actually callable.
 */
export function catalogGroup(name: string): ToolSection {
  return CORE_GROUPS.has(builtinGroup(name)) ? 'Core' : 'Optional';
}

/**
 * Display order of the groups, independent of the order rows arrive in.
 *
 * A caller usually builds rows from a name list in whatever order that list
 * happens to have, so the menu cannot rely on insertion order. This is the
 * single ordering table; an unknown group name (a caller that invents one)
 * sorts after the known ones rather than being dropped.
 */
export const GROUP_ORDER: string[] = [
  'Files',
  'Search',
  'Shell',
  'Web',
  'Sub-agents',
  'Tasks',
  'Notes',
  'Schedule',
  'Cron',
  'Browser',
  'Skills',
  'Memory',
  'MCP',
  'SSH',
  'Debug',
  'Language',
  'Utility',
  'Other',
];

const SECTION_ORDER: ToolSection[] = ['Core', 'Optional'];

/** A named heading inside a section. */
export type ToolGroup = { group: string; tools: ToolDescriptor[] };

/** One section of the picker, with its groups. */
export type ToolSectionGroup = { section: ToolSection; tools: ToolDescriptor[]; groups: ToolGroup[] };

function groupRank(group: string): number {
  const index = GROUP_ORDER.indexOf(group);
  return index === -1 ? GROUP_ORDER.length : index;
}

function sectionRank(section: ToolSection): number {
  return SECTION_ORDER.indexOf(section);
}

function compareRows(a: ToolDescriptor, b: ToolDescriptor): number {
  return (
    sectionRank(a.section) - sectionRank(b.section) ||
    groupRank(a.group) - groupRank(b.group) ||
    a.name.localeCompare(b.name)
  );
}

/**
 * Order rows into sections, then groups, then tools.
 *
 * Everything is built from `rows`: a group or a section with no tools in it is
 * never emitted, so the menu cannot show an empty heading. Each section also
 * carries a flat `tools` list, because a caller that renders a section without
 * headings (or counts rows, or drives a "select all in section" control) would
 * otherwise have to re-flatten `groups` itself.
 */
export function sectionTools(rows: ToolDescriptor[]): ToolSectionGroup[] {
  const sorted = [...rows].sort(compareRows);
  const sections: ToolSectionGroup[] = [];
  for (const row of sorted) {
    let section = sections.find((s) => s.section === row.section);
    if (!section) {
      section = { section: row.section, tools: [], groups: [] };
      sections.push(section);
    }
    section.tools.push(row);
    let group = section.groups.find((g) => g.group === row.group);
    if (!group) {
      group = { group: row.group, tools: [] };
      section.groups.push(group);
    }
    group.tools.push(row);
  }
  return sections;
}

/**
 * Build rows from tool names.
 *
 * This is the entry point a picker uses: it hands over the names it wants to
 * show (from the gate, from a subagent's allowlist, from a search result) and
 * gets rows back that are already described and classified. `descriptionOf` is
 * optional so a caller without descriptions gets `''` instead of having to
 * fabricate one; only rows that were asked for are produced — an unknown name
 * is still a row, because a tool the picker knows about but this module does
 * not must not disappear from the menu.
 */
export function describeTools(
  names: readonly string[],
  descriptionOf?: (name: string) => string,
): ToolDescriptor[] {
  return names
    .map((name) => ({
      name,
      description: descriptionOf ? descriptionOf(name) : '',
      section: catalogGroup(name),
      group: builtinGroup(name),
    }))
    .sort(compareRows);
}

/**
 * Drop the names the caller has switched off.
 *
 * Returns a plain array and never throws: an empty result is a normal state
 * (the user turned everything off, or a filter matched nothing), and a picker
 * that has to wrap this in a try/catch to render "no tools" would be paying for
 * a failure that is not one.
 */
export function applyToolFilter(names: readonly string[], disabled: ReadonlySet<string>): string[] {
  return names.filter((name) => !disabled.has(name));
}

/** How many rows fall in each section, plus the total. */
export function toolCounts(rows: ToolDescriptor[]): { core: number; optional: number; total: number } {
  let core = 0;
  let optional = 0;
  for (const row of rows) {
    if (row.section === 'Core') core += 1;
    else optional += 1;
  }
  return { core, optional, total: core + optional };
}
