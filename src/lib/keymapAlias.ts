/*
 * Command-name translation for extension keymaps.
 *
 * A keymap pack written for VS Code names its commands the way VS Code does
 * (`workbench.action.quickOpen`, `editor.action.formatDocument`). Zephyr's
 * registry uses its own ids (`view.quickOpen`, `editor.formatDocument`), so a
 * pack installed unchanged bound chords to names nothing answers: the chord was
 * swallowed and the pack looked broken. This table maps the names that have a
 * real counterpart here; anything NOT in the table is left alone and reported by
 * the loader as `tidakDidukung`, because inventing a target would be worse than
 * saying the app has no such command.
 *
 * This module is a LEAF: it imports nothing, so extLoader.ts (writer) and
 * keybindings.ts (validator) can both use it without closing a module cycle.
 */

export const ALIAS_PERINTAH: Record<string, string> = {
  'workbench.action.quickOpen': 'view.quickOpen',
  'workbench.action.files.save': 'file.save',
  'workbench.action.closeActiveEditor': 'file.closeTab',
  'workbench.action.closeAllEditors': 'editor.closeAll',
  'workbench.action.toggleSidebar': 'view.sidebar',
  'workbench.action.togglePanel': 'workbench.action.togglePanel',
  'workbench.action.showCommands': 'view.palette',
  'workbench.action.splitEditorRight': 'view.splitEditorRight',
  'workbench.action.findInFiles': 'edit.findInFiles',
  'workbench.action.replaceInFiles': 'edit.replace',
  'workbench.action.files.newFile': 'file.new',
  'workbench.action.terminal.kill': 'terminal.kill',
  'workbench.action.terminal.focusFind': 'edit.find',
  'workbench.action.quickOpenRecent': 'view.nextTab',
  'editor.action.formatDocument': 'editor.formatDocument',
  'editor.action.rename': 'editor.renameSymbol',
};

/** The Zephyr command id for an extension's command name (identity when known). */
export const perintahKeymap = (id: string): string => ALIAS_PERINTAH[id] ?? id;

/** True when the name had to be translated, i.e. it is not a Zephyr id itself. */
export const dialihkan = (id: string): boolean => ALIAS_PERINTAH[id] !== undefined;
