/*
 * The model / permission-mode / effort catalogue for the hosted CLI tabs
 * (Claude Code, Codex).
 *
 * These mirror what the real desktop apps surface in their composer menus — the
 * "Select a model" sheet, the Manual/Edit/Plan/Auto mode menu, the Effort dial
 * and the Ultracode toggle in the screenshots. The chosen `model` and `mode`
 * are passed straight to the CLI (`--model`, `--permission-mode`), so picking
 * one here is the same as typing the flag in a terminal. `id: 'default'` means
 * "add no flag", i.e. let the CLI use whatever default it is configured with.
 *
 * The MODEL list for Claude is a FALLBACK: the real set depends on the account
 * you logged the CLI into (Opus 5, Sonnet, Fable, …), so `aiCliStore` fetches
 * the live list from the backend (`cli_models`) on first open and only falls
 * back to this when the CLI cannot be asked.
 */

export interface CliModel {
  id: string;
  /** The bold line in the picker. */
  label: string;
  /** The dim subtitle under it. */
  sub: string;
}

export interface CliMode {
  id: string;
  label: string;
  sub: string;
  /** AiIkon glyph name for the row. */
  icon: string;
}

export interface CliCatalog {
  /** Short label shown on the composer's model chip. */
  defaultChip: string;
  models: CliModel[];
  modes: CliMode[];
  /** Whether this CLI exposes the Effort dial + Ultracode toggle. */
  hasEffort: boolean;
}

/*
 * Claude Code — the permission modes the CLI accepts on the command line, with
 * the exact wording and glyphs the desktop "Modes" menu uses:
 *   Manual · Edit automatically · Plan · Auto
 * The ids are Claude Code's `--permission-mode` values.
 */
export const CLAUDE_MODES: CliMode[] = [
  { id: 'default', label: 'Manual', sub: 'Claude will ask for approval before making each edit', icon: 'hand' },
  { id: 'acceptEdits', label: 'Edit automatically', sub: 'Claude will edit your selected text or the whole file', icon: 'code' },
  { id: 'plan', label: 'Plan', sub: 'Claude will explore the code and present a plan before editing', icon: 'list' },
  { id: 'bypassPermissions', label: 'Auto', sub: 'Claude will approve actions that pass a safety check and pause for anything risky', icon: 'bolt' },
];

/* The fallback model list for Claude, matching the desktop "Select a model"
   sheet. `cli_models` replaces this with the account's real set when it can. */
export const CLAUDE_MODELS: CliModel[] = [
  { id: 'default', label: 'Default (recommended)', sub: 'Use the default model' },
  { id: 'opus', label: 'Opus', sub: 'Most capable — hardest, longest-running tasks' },
  { id: 'sonnet', label: 'Sonnet', sub: 'Balanced speed and capability' },
  { id: 'haiku', label: 'Haiku', sub: 'Fastest, for lighter tasks' },
  { id: 'fable', label: 'Fable', sub: 'Most capable for the longest tasks' },
];

const CLAUDE: CliCatalog = {
  defaultChip: 'Default',
  models: CLAUDE_MODELS,
  modes: CLAUDE_MODES,
  hasEffort: true,
};

/*
 * Codex — model aliases accepted by `codex exec --model`. Codex has no
 * permission-mode flag in exec mode, so the mode menu is a single informational
 * row that maps to no flag.
 */
const CODEX: CliCatalog = {
  defaultChip: 'Custom',
  models: [
    { id: 'default', label: 'Default (recommended)', sub: 'Use the configured default' },
    { id: 'gpt-5-codex', label: 'GPT-5 Codex', sub: 'Codex-tuned, best for coding' },
    { id: 'gpt-5', label: 'GPT-5', sub: 'General purpose' },
    { id: 'o4-mini', label: 'o4-mini', sub: 'Fast and economical' },
  ],
  modes: [{ id: 'default', label: 'Auto', sub: 'Works within your approvals', icon: 'bolt' }],
  hasEffort: false,
};

const FALLBACK: CliCatalog = {
  defaultChip: 'Default',
  models: [{ id: 'default', label: 'Default', sub: 'Use the CLI default' }],
  modes: [{ id: 'default', label: 'Auto', sub: '', icon: 'bolt' }],
  hasEffort: false,
};

export function catalogFor(agentId: string): CliCatalog {
  if (agentId === 'claude') return CLAUDE;
  if (agentId === 'codex') return CODEX;
  return FALLBACK;
}

/** The chip label for a chosen model id, falling back to the CLI's default. */
export function modelChip(agentId: string, modelId: string): string {
  const cat = catalogFor(agentId);
  if (modelId === 'default') return cat.defaultChip;
  const m = cat.models.find((x) => x.id === modelId);
  return m ? m.label : cat.defaultChip;
}

export const EFFORT_LEVELS = ['Low', 'Medium', 'High', 'Max', 'Ultra'] as const;
export type EffortLevel = (typeof EFFORT_LEVELS)[number];
