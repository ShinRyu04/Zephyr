import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';

export interface TermHandle {
  term: Terminal;
  fit: FitAddon;
  
  holder: HTMLDivElement;
  
  queue: string[];
}

const handles = new Map<string, TermHandle>();

function themeFromCss(): Record<string, string> {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  const ansi = (n: number, fallback: string) => v(`--terminal-ansi-${n}`, fallback);
  return {
    background: v('--terminal-bg', v('--editor-bg', '#0d1117')),
    foreground: v('--terminal-fg', v('--text', '#e6edf3')),
    cursor: v('--editor-cursor', '#aeafad'),
    cursorAccent: v('--bg', '#0d1117'),
    selectionBackground: v('--selection-bg', 'rgba(56,132,255,0.3)'),
    black: ansi(0, '#1c2128'),
    red: ansi(1, '#f85149'),
    green: ansi(2, '#3fb950'),
    yellow: ansi(3, '#d29922'),
    blue: ansi(4, '#3884ff'),
    magenta: ansi(5, '#d2a8ff'),
    cyan: ansi(6, '#79c0ff'),
    white: ansi(7, '#8b949e'),
    brightBlack: ansi(8, '#6e7681'),
    brightRed: ansi(9, '#ff7b72'),
    brightGreen: ansi(10, '#7ee787'),
    brightYellow: ansi(11, '#e3b341'),
    brightBlue: ansi(12, '#4c93ff'),
    brightMagenta: ansi(13, '#ffa657'),
    brightCyan: ansi(14, '#a5d6ff'),
    brightWhite: ansi(15, '#e6edf3'),
  };
}

export function retheme(): number {
  const theme = themeFromCss();
  for (const h of handles.values()) h.term.options.theme = theme;
  return handles.size;
}

function srModeAktif(): boolean {
  try {
    return document.documentElement.dataset.screenReader === 'true';
  } catch {
    return false;
  }
}

export function reSrMode(): number {
  const aktif = srModeAktif();
  for (const h of handles.values()) h.term.options.screenReaderMode = aktif;
  return handles.size;
}

export function getHandle(id: string): TermHandle | undefined {
  return handles.get(id);
}

export function ensureHandle(
  id: string,
  opts: { fontFamily: string; fontSize: number; scrollback?: number; onData: (d: string) => void; onResize: (c: number, r: number) => void },
): TermHandle {
  const existing = handles.get(id);
  if (existing) return existing;

  const holder = document.createElement('div');
  holder.className = 'xterm-holder';
  holder.dataset.termId = id;

  const term = new Terminal({
    fontFamily: opts.fontFamily,
    fontSize: opts.fontSize,
    lineHeight: 1.2,
    cursorBlink: true,
    cursorStyle: 'bar',
    
    scrollback: opts.scrollback ?? 5000,
    allowProposedApi: true,
    convertEol: false,
    theme: themeFromCss(),
    
    screenReaderMode: srModeAktif(),
    
    windowsPty: { backend: 'conpty' },
  });

  const fit = new FitAddon();
  term.loadAddon(fit);
  term.loadAddon(new WebLinksAddon());

  term.onData(opts.onData);
  term.onResize(({ cols, rows }) => opts.onResize(cols, rows));

  const handle: TermHandle = { term, fit, holder, queue: [] };
  handles.set(id, handle);
  return handle;
}

export function writeTo(id: string, data: string): void {
  const h = handles.get(id);
  if (!h) return;
  if (h.term.element) h.term.write(data);
  else h.queue.push(data);
}

export function flushQueue(id: string): void {
  const h = handles.get(id);
  if (!h || !h.term.element) return;
  if (h.queue.length) {
    h.term.write(h.queue.join(''));
    h.queue = [];
  }
}

export function clearTerm(id: string): void {
  const h = handles.get(id);
  if (!h) return;
  h.term.clear();
  
  h.term.write('\x1b[2J\x1b[3J\x1b[H');
}

export function disposeHandle(id: string): void {
  const h = handles.get(id);
  if (!h) return;
  h.queue = [];
  try {
    h.term.dispose();
  } catch {
    /* already disposed */
  }
  h.holder.remove();
  handles.delete(id);
}

export function fitTerm(id: string): { cols: number; rows: number } | null {
  const h = handles.get(id);
  if (!h || !h.term.element) return null;
  try {
    h.fit.fit();
    return { cols: h.term.cols, rows: h.term.rows };
  } catch {
    return null;
  }
}

export function readBuffer(id: string, maxLines = 200): string {
  const h = handles.get(id);
  if (!h) return '';
  const buf = h.term.buffer.active;
  const lines: string[] = [];
  const start = Math.max(0, buf.length - maxLines);
  for (let i = start; i < buf.length; i++) {
    lines.push(buf.getLine(i)?.translateToString(true) ?? '');
  }
  return lines.join('\n');
}

export function findRow(id: string, text: string): number {
  const h = handles.get(id);
  if (!h) return -1;
  const buf = h.term.buffer.active;
  for (let i = buf.length - 1; i >= 0; i--) {
    if ((buf.getLine(i)?.translateToString(true) ?? '').trim() === text) return i;
  }
  return -1;
}

export function getSelection(id: string): string {
  return handles.get(id)?.term.getSelection() ?? '';
}

export function selectLine(id: string, row: number): boolean {
  const h = handles.get(id);
  if (!h || row < 0) return false;
  const buf = h.term.buffer.active;
  const line = buf.getLine(row);
  if (!line) return false;
  const text = line.translateToString(true);
  
  h.term.select(0, row, text.length);
  return true;
}

export function termSize(id: string): { cols: number; rows: number } | null {
  const h = handles.get(id);
  return h ? { cols: h.term.cols, rows: h.term.rows } : null;
}

export function termOptionsTheme(id: string): Record<string, string> | null {
  const h = handles.get(id);
  return h ? ({ ...(h.term.options.theme ?? {}) } as Record<string, string>) : null;
}

export function activeIds(): string[] {
  return [...handles.keys()];
}
