// keybindings.ts — registry chord + resolver (fase 18.2).
//
// SATU SUMBER KEBENARAN untuk semua chord. Menu bar (18.1), Command Palette
// (fase 12), dan editor Keyboard Shortcuts (18.4) semuanya membaca dari sini,
// jadi kalau user me-remap satu chord, ketiganya ikut berubah tanpa duplikasi.
//
// PEMBAGIAN LAYER (18.2) — ini yang menentukan siapa menangani apa:
//   'app'      resolver global di App.tsx → commandRegistry
//   'editor'   DISERAHKAN ke CodeMirror keymap. Resolver global TIDAK
//              mencegatnya saat fokus di editor — jangan reimplement logika
//              editor di resolver.
//   'terminal' xterm memakan keydown lebih dulu (copy/paste/scroll).
//   'stub'     fiturnya belum ada (debugger, LSP). Menu tetap menampilkannya
//              sebagai disabled; menekan chord-nya tidak melakukan apa pun
//              dan TIDAK error.
//
// CHORD SEQUENCE: "Ctrl+K Ctrl+S" = dua chord dipisah spasi. `Ctrl+K` sendiri
// tidak pernah memicu apa pun (ia prefix); chord kedua menyelesaikannya.

import { normalizeBinding } from './shortcuts';

export type Layer = 'app' | 'editor' | 'terminal' | 'stub';

/** Konteks tempat binding berlaku. Konflik chord diselesaikan lewat ini,
 *  BUKAN lewat urutan daftar (syarat 18.2). */
export type WhenCtx = 'global' | 'editorFocus' | 'terminalFocus' | 'debugActive';

export interface KeyBinding {
  /** satu chord ("Ctrl+S") atau sequence ("Ctrl+K Ctrl+S") */
  chord: string;
  command: string;
  when: WhenCtx;
  layer: Layer;
  /** label untuk tabel Keyboard Shortcuts bila command belum ada di registry */
  label?: string;
}

/** Normalisasi sequence: tiap chord dinormalkan, dipisah satu spasi. */
export function normalizeChord(chord: string): string {
  return chord
    .trim()
    .split(/\s+/)
    .map((c) => normalizeBinding(c))
    .filter(Boolean)
    .join(' ');
}

/** Tampilan untuk UI: "Ctrl+K Ctrl+S" apa adanya, "" → "—". */
export function displayChord(chord: string): string {
  return chord ? chord : '—';
}

// ─────────────────── tabel default (18.3) ───────────────────
//
// Hanya chord yang BENAR-BENAR ada jalurnya di Zephyr sekarang yang berlayer
// 'app'/'editor'/'terminal'. Sisanya 'stub' — didaftarkan supaya menu bar
// lengkap seperti VS Code dan supaya tabel Keyboard Shortcuts jujur soal apa
// yang belum ada, bukan disembunyikan.

const D = (
  chord: string,
  command: string,
  layer: Layer,
  when: WhenCtx = 'global',
  label?: string,
): KeyBinding => ({ chord: normalizeChord(chord), command, when, layer, label });

export const DEFAULT_BINDINGS: KeyBinding[] = [
  // ── General ──
  D('Ctrl+Shift+P', 'view.palette', 'app'),
  D('F1', 'view.palette', 'app'),
  D('Ctrl+P', 'view.quickOpen', 'app'),
  D('Ctrl+,', 'view.settings', 'app'),
  D('Ctrl+K Ctrl+S', 'workbench.openGlobalKeybindings', 'app', 'global', 'Keyboard Shortcuts'),

  // ── File ──
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
  D('Ctrl+Shift+T', 'editor.reopen', 'stub', 'global', 'Reopen Closed Editor'),

  // ── Edit (CodeMirror) ──
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
  // fase 21: format & navigasi simbol sekarang NYATA (lewat LSP).
  D('Shift+Alt+F', 'editor.formatDocument', 'app', 'editorFocus'),
  D('F12', 'editor.gotoDefinition', 'app', 'editorFocus'),
  D('Shift+F12', 'editor.findReferences', 'app', 'editorFocus'),
  D('F2', 'editor.renameSymbol', 'app', 'editorFocus'),
  D('Ctrl+.', 'editor.quickFix', 'app', 'editorFocus'),
  D('Ctrl+Space', 'editor.triggerSuggest', 'editor', 'editorFocus'),

  // ── Selection ──
  D('Ctrl+Shift+L', 'editor.select.occurrences', 'editor', 'editorFocus'),
  D('Ctrl+Alt+Up', 'editor.cursor.above', 'editor', 'editorFocus'),
  D('Ctrl+Alt+Down', 'editor.cursor.below', 'editor', 'editorFocus'),
  D('Shift+Alt+Right', 'editor.select.expand', 'stub', 'editorFocus', 'Expand Selection'),
  D('Shift+Alt+Left', 'editor.select.shrink', 'stub', 'editorFocus', 'Shrink Selection'),
  D('Shift+Alt+I', 'editor.cursor.lineEnds', 'stub', 'editorFocus', 'Add Cursor to Line Ends'),

  // ── View / panel ──
  D('Ctrl+B', 'view.sidebar', 'app'),
  D('Ctrl+J', 'workbench.action.togglePanel', 'app'),
  D('Ctrl+`', 'terminalPanel.focus', 'app'),
  D('Ctrl+Shift+`', 'terminal.new', 'app'),
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
  // fase 20: tab panel bawah — dulu 'stub', sekarang nyata.
  D('Ctrl+Shift+U', 'outputPanel.focus', 'app'),
  D('Ctrl+Shift+M', 'problemsPanel.focus', 'app'),
  D('Ctrl+Shift+Y', 'debugConsolePanel.focus', 'app'),
  D('Ctrl+PageDown', 'panel.nextTab', 'app'),
  D('Ctrl+PageUp', 'panel.prevTab', 'app'),
  D('Ctrl+Shift+D', 'debug.focus', 'stub', 'global', 'Focus Run & Debug'),

  // ── Go ──
  D('Ctrl+G', 'editor.gotoLine', 'stub', 'editorFocus', 'Go to Line'),
  D('Ctrl+Shift+O', 'editor.gotoSymbol', 'app', 'editorFocus'),
  D('Alt+Left', 'nav.back', 'stub', 'global', 'Go Back'),
  D('Alt+Right', 'nav.forward', 'stub', 'global', 'Go Forward'),
  D('F8', 'editor.nextError', 'stub', 'global', 'Next Problem'),
  D('Shift+F8', 'editor.prevError', 'stub', 'global', 'Previous Problem'),

  // ── Run / Debug (semua stub sampai fase 22) ──
  // F11 SENGAJA didaftarkan dua kali dengan `when` berbeda: saat debugActive
  // ia step-into, di luar itu fullscreen. Resolver memilih yang paling
  // spesifik — inilah gunanya context key (catatan konflik 18.3).
  D('F5', 'debug.start', 'stub', 'global', 'Start Debugging'),
  D('Shift+F5', 'debug.stop', 'stub', 'debugActive', 'Stop Debugging'),
  D('F10', 'debug.stepOver', 'stub', 'debugActive', 'Step Over'),
  D('F11', 'debug.stepInto', 'stub', 'debugActive', 'Step Into'),
  D('Shift+F11', 'debug.stepOut', 'stub', 'debugActive', 'Step Out'),
  D('F9', 'debug.toggleBreakpoint', 'stub', 'global', 'Toggle Breakpoint'),

  // ── Terminal (xterm yang menangani) ──
  D('Ctrl+Shift+C', 'terminal.copy', 'terminal', 'terminalFocus'),
  D('Ctrl+Shift+V', 'terminal.paste', 'terminal', 'terminalFocus'),
  D('Ctrl+Up', 'terminal.scrollLineUp', 'terminal', 'terminalFocus'),
  D('Ctrl+Down', 'terminal.scrollLineDown', 'terminal', 'terminalFocus'),

  // ── Notifications (fase 27) ──
  D('Ctrl+Shift+B', 'notifications.show', 'app'),

  // ── Help ──
  D('Ctrl+K Ctrl+I', 'help.about', 'app', 'global', 'About Zephyr'),
];

/** Satu override dari `keybindings.json` (18.4). */
export interface UserBinding {
  key: string;
  command: string;
  when?: WhenCtx;
  /** true = hapus binding default untuk command ini */
  remove?: boolean;
}

/**
 * Gabung default ⊕ user. User MENANG: entri user untuk `command` yang sama
 * menggantikan chord default-nya (bukan menambah entri kedua) — kalau tidak,
 * satu command akan punya dua chord dan tabel jadi membingungkan.
 */
export function mergeBindings(user: UserBinding[]): KeyBinding[] {
  const out = DEFAULT_BINDINGS.map((b) => ({ ...b }));
  for (const u of user) {
    if (!u || !u.command) continue;
    const idx = out.findIndex((b) => b.command === u.command);
    if (u.remove) {
      if (idx >= 0) out.splice(idx, 1);
      continue;
    }
    const chord = normalizeChord(u.key ?? '');
    if (!chord) continue;
    if (idx >= 0) {
      out[idx] = { ...out[idx], chord, when: u.when ?? out[idx].when };
    } else {
      // Command yang tidak ada di default (mis. dari ekstensi) tetap boleh
      // diberi chord oleh user.
      out.push({ chord, command: u.command, when: u.when ?? 'global', layer: 'app' });
    }
  }
  return out;
}

/** Chord efektif untuk satu command ('' = tidak ada). */
export function chordFor(command: string, bindings: KeyBinding[]): string {
  return bindings.find((b) => b.command === command)?.chord ?? '';
}

/** Semua chord yang merupakan PREFIX dari sequence (mis. "Ctrl+K"). */
export function prefixSet(bindings: KeyBinding[]): Set<string> {
  const s = new Set<string>();
  for (const b of bindings) {
    const parts = b.chord.split(' ');
    for (let i = 1; i < parts.length; i++) s.add(parts.slice(0, i).join(' '));
  }
  return s;
}

/**
 * Cari binding yang cocok untuk sequence yang sedang ditekan.
 *
 * `ctx` = daftar context key yang AKTIF sekarang. Pemenangnya yang paling
 * spesifik: binding dengan `when` non-global menang atas `when: 'global'`.
 * Ini yang membuat F11 = step-into saat debug dan fullscreen di luar itu.
 */
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

/** Konflik: command lain yang memakai chord sama DAN when sama. */
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
