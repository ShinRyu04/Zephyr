// editorRegistry.ts — jembatan non-React ke EditorView aktif.
// Dipakai FindBar & shortcut global (Ctrl+S) untuk memaksa flush
// konten yang masih tertahan debounce 300ms.

import { EditorView } from '@codemirror/view';

let activeView: EditorView | null = null;
const flushers = new Map<string, () => void>();

export function setActiveView(v: EditorView | null): void {
  activeView = v;
}

export function getActiveView(): EditorView | null {
  return activeView;
}

export function registerFlush(tabId: string, fn: () => void): void {
  flushers.set(tabId, fn);
}

export function unregisterFlush(tabId: string): void {
  flushers.delete(tabId);
}

/** Paksa sinkron konten tab ke store sebelum disimpan ke disk. */
export function flushTab(tabId: string | null): void {
  if (!tabId) return;
  flushers.get(tabId)?.();
}

export function flushAll(): void {
  for (const fn of flushers.values()) fn();
}

/** Lompat ke baris/kolom (1-based) di editor aktif dan sorot barisnya.
 *  Dipakai panel Search (fase 04). */
export function revealPosition(line: number, col = 1): boolean {
  const view = activeView;
  if (!view) return false;
  const total = view.state.doc.lines;
  const lineNo = Math.min(Math.max(1, line), total);
  const l = view.state.doc.line(lineNo);
  const pos = Math.min(l.from + Math.max(0, col - 1), l.to);

  view.dispatch({
    selection: { anchor: pos, head: pos },
    effects: EditorView.scrollIntoView(pos, { y: 'center' }),
    scrollIntoView: true,
  });
  view.focus();
  return true;
}
