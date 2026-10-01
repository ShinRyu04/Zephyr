/*
 * Leaf module: the id set of commands that exist.
 *
 * It has no imports on purpose. `commandRegistry.ts` registers every
 * COMMANDS entry here, and `keybindings.ts` asks whether an extension's
 * keymap entry targets a real command. Importing commandRegistry.ts from
 * keybindings.ts would close the cycle
 *
 *   keybindings.ts -> commandRegistry.ts -> keybindingStore.ts -> keybindings.ts
 *
 * which used to drop the default shortcuts; this module keeps that direction
 * one-way.
 *
 * Registering is not gated on `enabled()`: a command is real even when it is
 * unavailable right now (no active tab, not a git repo), and refusing the
 * binding would make the chord vanish from the UI whenever the context was
 * missing.
 */

/** Every registered command id. */
export const COMMAND_IDS = new Set<string>();

export function daftarkanCommandId(id: string): void {
  if (id) COMMAND_IDS.add(id);
}

export function commandIdAda(id: string): boolean {
  return COMMAND_IDS.has(id);
}
