// editorRegistry.ts — jembatan non-React ke EditorView aktif.
// Dipakai FindBar & shortcut global (Ctrl+S) untuk memaksa flush
// konten yang masih tertahan debounce 300ms.

import type { EditorView } from '@codemirror/view';

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
