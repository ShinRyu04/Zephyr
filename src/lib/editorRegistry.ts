import { EditorView } from '@codemirror/view';

let activeView: EditorView | null = null;
const flushers = new Map<string, () => void>();

export function setActiveView(v: EditorView | null): void {
  activeView = v;
}

export function getActiveView(): EditorView | null {
  return activeView;
}

export function activeLine(): number {
  const view = activeView;
  if (!view) return 0;
  return view.state.doc.lineAt(view.state.selection.main.head).number;
}

export function activeSelection(): string {
  const view = activeView;
  if (!view) return '';
  const s = view.state.selection.main;
  return s.empty ? '' : view.state.sliceDoc(s.from, s.to);
}

export function registerFlush(tabId: string, fn: () => void): void {
  flushers.set(tabId, fn);
}

export function unregisterFlush(tabId: string): void {
  flushers.delete(tabId);
}

export function flushTab(tabId: string | null): void {
  if (!tabId) return;
  flushers.get(tabId)?.();
}

export function flushAll(): void {
  for (const fn of flushers.values()) fn();
}

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
