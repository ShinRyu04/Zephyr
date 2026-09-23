import { normalizeBinding } from './shortcuts';

export type Layer = 'app' | 'editor' | 'terminal' | 'stub';

export type WhenCtx = 'global' | 'editorFocus' | 'terminalFocus' | 'debugActive';

export interface KeyBinding {
  
  chord: string;
  command: string;
  when: WhenCtx;
  layer: Layer;
  
  label?: string;
  
  source?: string;
}

export function normalizeChord(chord: string): string {
  return chord
    .trim()
    .split(/\s+/)
    .map((c) => normalizeBinding(c))
    .filter(Boolean)
    .join(' ');
}

export function displayChord(chord: string): string {
  return chord ? chord : '—';
}

const D = (
  chord: string,
  command: string,
  layer: Layer,
  when: WhenCtx = 'global',
  label?: string,
): KeyBinding => ({ chord: normalizeChord(chord), command, when, layer, label });

export const DEFAULT_BINDINGS: KeyBinding[] = [
  
  D('Ctrl+Shift+P', 'view.palette', 'app'),
  D('F1', 'view.palette', 'app'),
  D('Ctrl+P', 'view.quickOpen', 'app'),
  D('Ctrl+,', 'view.settings', 'app'),
  D('Ctrl+K Ctrl+S', 'workbench.openGlobalKeybindings', 'app', 'global', 'Keyboard Shortcuts'),

  D('Ctrl+N', 'file.new', 'app'),
  D('Ctrl+O', 'file.open', 'app'),
  D('Ctrl+Shift+O', 'file.openFolder', 'app'),
  D('Ctrl+S', 'file.save', 'app'),
  D('Ctrl+Shift+S', 'file.saveAs', 'app'),
  D('Ctrl+K S', 'file.saveAll', 'app'),
  D('Ctrl+W', 'file.closeTab', 'app'),
  D('Ctrl+K Ctrl+W', 'editor.closeAll', 'app'),
  D('Ctrl+K F', 'explorer.closeFolder', 'app'),
  D('Ctrl+K P', 'file.copyPath', 'app'),
  D('Ctrl+K R', 'explorer.revealActive', 'app'),
  D('Ctrl+Shift+N', 'window.new', 'stub', 'global', 'New Window'),

  D('Ctrl+Z', 'editor.undo', 'editor', 'editorFocus'),
  D('Ctrl+Y', 'editor.redo', 'editor', 'editorFocus'),
  D('Ctrl+X', 'editor.clip.cut', 'editor', 'editorFocus'),
  D('Ctrl+C', 'editor.clip.copy', 'editor', 'editorFocus'),
  D('Ctrl+V', 'editor.clip.paste', 'editor', 'editorFocus'),
  D('Ctrl+F', 'edit.find', 'app'),
  D('Ctrl+H', 'edit.replace', 'app'),
  D('F3', 'editor.findNext', 'editor', 'editorFocus'),
  D('Shift+F3', 'editor.findPrevious', 'editor', 'editorFocus'),
  D('Ctrl+/', 'editor.comment.toggle', 'editor', 'editorFocus'),
  D('Alt+Up', 'editor.line.moveUp', 'editor', 'editorFocus'),
  D('Alt+Down', 'editor.line.moveDown', 'editor', 'editorFocus'),
  D('Ctrl+Shift+K', 'editor.line.delete', 'editor', 'editorFocus'),
  D('Ctrl+Enter', 'editor.line.insertBelow', 'editor', 'editorFocus'),
  D('Ctrl+Shift+\\', 'editor.jumpToBracket', 'editor', 'editorFocus'),
  D('Ctrl+D', 'editor.addSelectionToNextFindMatch', 'editor', 'editorFocus'),
  D('Ctrl+L', 'editor.select.line', 'editor', 'editorFocus'),
  D('Ctrl+A', 'editor.selectAll', 'editor', 'editorFocus'),
  D('Alt+Z', 'editor.wordWrap.toggle', 'app'),
  D('Shift+Alt+A', 'editor.blockComment.toggle', 'stub', 'editorFocus', 'Toggle Block Comment'),
  
  D('Shift+Alt+F', 'editor.formatDocument', 'app', 'editorFocus'),
  D('F12', 'editor.gotoDefinition', 'app', 'editorFocus'),
  D('Shift+F12', 'editor.findReferences', 'app', 'editorFocus'),
  D('F2', 'editor.renameSymbol', 'app', 'editorFocus'),
  D('Ctrl+.', 'editor.quickFix', 'app', 'editorFocus'),
  D('Ctrl+Space', 'editor.triggerSuggest', 'editor', 'editorFocus'),

  D('Ctrl+Shift+L', 'editor.select.occurrences', 'editor', 'editorFocus'),
  D('Ctrl+Alt+Up', 'editor.cursor.above', 'editor', 'editorFocus'),
  D('Ctrl+Alt+Down', 'editor.cursor.below', 'editor', 'editorFocus'),
  D('Shift+Alt+Right', 'editor.select.expand', 'stub', 'editorFocus', 'Expand Selection'),
  D('Shift+Alt+Left', 'editor.select.shrink', 'stub', 'editorFocus', 'Shrink Selection'),
  D('Shift+Alt+I', 'editor.cursor.lineEnds', 'stub', 'editorFocus', 'Add Cursor to Line Ends'),

  D('Ctrl+B', 'view.sidebar', 'app'),
  D('Ctrl+J', 'workbench.action.togglePanel', 'app'),
  D('Ctrl+`', 'terminalPanel.focus', 'app'),
  D('Ctrl+Shift+`', 'terminal.new', 'app'),
  
  D('Ctrl+\\', 'view.splitEditorRight', 'app'),
  D('Ctrl+Shift+E', 'view.explorer', 'app'),
  D('Ctrl+Shift+F', 'edit.findInFiles', 'app'),
  D('Ctrl+Shift+G', 'git.panel', 'app'),
  D('Ctrl+Shift+A', 'ai.panel', 'app'),
  D('Ctrl+Shift+X', 'extensions.focus', 'app'),
  D('Ctrl+=', 'view.zoomIn', 'app'),
  D('Ctrl+-', 'view.zoomOut', 'app'),
  D('Ctrl+0', 'view.zoomReset', 'app'),
  D('Ctrl+Tab', 'view.nextTab', 'app'),
  D('Ctrl+Shift+Tab', 'view.prevTab', 'app'),
  D('F11', 'window.fullscreen', 'app'),
  
  D('Ctrl+Shift+U', 'outputPanel.focus', 'app'),
  D('Ctrl+Shift+M', 'problemsPanel.focus', 'app'),
  D('Ctrl+Shift+Y', 'debugConsolePanel.focus', 'app'),
  D('Ctrl+PageDown', 'panel.nextTab', 'app'),
  D('Ctrl+PageUp', 'panel.prevTab', 'app'),
  
  D('Ctrl+G', 'editor.gotoLine', 'stub', 'editorFocus', 'Go to Line'),
  D('Ctrl+Shift+O', 'editor.gotoSymbol', 'app', 'editorFocus'),
  D('Alt+Left', 'nav.back', 'stub', 'global', 'Go Back'),
  D('Alt+Right', 'nav.forward', 'stub', 'global', 'Go Forward'),
  D('F8', 'editor.nextError', 'stub', 'global', 'Next Problem'),
  D('Shift+F8', 'editor.prevError', 'stub', 'global', 'Previous Problem'),

  D('F5', 'debug.start', 'app', 'global', 'Start Debugging'),
  D('Shift+F5', 'debug.stop', 'app', 'debugActive', 'Stop Debugging'),
  D('Ctrl+Shift+F5', 'debug.restart', 'app', 'debugActive', 'Restart Debugging'),
  D('F6', 'debug.pause', 'app', 'debugActive', 'Pause'),
  D('F10', 'debug.stepOver', 'app', 'debugActive', 'Step Over'),
  D('F11', 'debug.stepInto', 'app', 'debugActive', 'Step Into'),
  D('Shift+F11', 'debug.stepOut', 'app', 'debugActive', 'Step Out'),
  D('F9', 'debug.toggleBreakpoint', 'app', 'global', 'Toggle Breakpoint'),
  D('Ctrl+Shift+D', 'debug.focus', 'app', 'global', 'Run & Debug'),

  D('Ctrl+Shift+C', 'terminal.copy', 'terminal', 'terminalFocus'),
  D('Ctrl+Shift+V', 'terminal.paste', 'terminal', 'terminalFocus'),
  D('Ctrl+Up', 'terminal.scrollLineUp', 'terminal', 'terminalFocus'),
  D('Ctrl+Down', 'terminal.scrollLineDown', 'terminal', 'terminalFocus'),

  D('Ctrl+Shift+B', 'notifications.show', 'app'),

  D('Ctrl+K Ctrl+I', 'help.about', 'app', 'global', 'About Zephyr'),
];

export interface UserBinding {
  key: string;
  command: string;
  when?: WhenCtx;
  
  remove?: boolean;
}

export function mergeBindings(
  user: UserBinding[],
  ext: Array<{ key: string; command: string; source: string }> = [],
): KeyBinding[] {
  const out = DEFAULT_BINDINGS.map((b) => ({ ...b }));

  for (const e of ext) {
    const chord = normalizeChord(e.key ?? '');
    if (!chord || !e.command) continue;
    
    for (const b of out) {
      if (b.command !== e.command && b.chord === chord) b.chord = '';
    }
    const idx = out.findIndex((b) => b.command === e.command);
    if (idx >= 0) {
      out[idx] = { ...out[idx], chord, source: e.source };
    } else {
      out.push({
        chord,
        command: e.command,
        when: 'global',
        layer: 'app',
        source: e.source,
      });
    }
  }
  
  const bersih = out.filter((b) => b.chord !== '');
  out.length = 0;
  out.push(...bersih);

  for (const u of user) {
    if (!u || !u.command) continue;
    const idx = out.findIndex((b) => b.command === u.command);
    if (u.remove) {
      if (idx >= 0) out.splice(idx, 1);
      continue;
    }
    const chord = normalizeChord(u.key ?? '');
    if (!chord) continue;
    
    for (const b of out) {
      if (b.command === u.command && b.chord === chord && b !== out[idx]) b.chord = '';
    }
    const lama = out.filter((b) => b.command === u.command && b !== out[idx] && b.chord);
    for (const l of lama) l.chord = '';
    if (idx >= 0) {
      
      out[idx] = { ...out[idx], chord, when: u.when ?? out[idx].when, source: undefined };
    } else {
      
      out.push({ chord, command: u.command, when: u.when ?? 'global', layer: 'app' });
    }
  }
  
  const akhir = out.filter((b) => b.chord !== '');
  out.length = 0;
  out.push(...akhir);
  return out;
}

export function chordFor(command: string, bindings: KeyBinding[]): string {
  return bindings.find((b) => b.command === command)?.chord ?? '';
}

export function prefixSet(bindings: KeyBinding[]): Set<string> {
  const s = new Set<string>();
  for (const b of bindings) {
    const parts = b.chord.split(' ');
    for (let i = 1; i < parts.length; i++) s.add(parts.slice(0, i).join(' '));
  }
  return s;
}

export function resolveBinding(
  sequence: string,
  bindings: KeyBinding[],
  ctx: Set<WhenCtx>,
): KeyBinding | null {
  const cocok = bindings.filter((b) => b.chord === sequence);
  if (cocok.length === 0) return null;
  const spesifik = cocok.filter((b) => b.when !== 'global' && ctx.has(b.when));
  if (spesifik.length > 0) return spesifik[0];
  const global = cocok.find((b) => b.when === 'global');
  return global ?? null;
}

export function chordConflicts(
  command: string,
  chord: string,
  when: WhenCtx,
  bindings: KeyBinding[],
): string[] {
  const c = normalizeChord(chord);
  if (!c) return [];
  return bindings
    .filter((b) => b.command !== command && b.chord === c && b.when === when)
    .map((b) => b.command);
}
