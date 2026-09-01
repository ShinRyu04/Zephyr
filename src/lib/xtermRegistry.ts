// xtermRegistry.ts — pemegang instance xterm per sesi (di luar React/store).
//
// Alasan: Terminal xterm bukan data serializable dan mahal dibuat ulang.
// Instance dibuat sekali per sesi lalu container DOM-nya dipindah saat tab
// berganti, sehingga scrollback TIDAK hilang ketika berpindah tab.

import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';

export interface TermHandle {
  term: Terminal;
  fit: FitAddon;
  /** elemen yang di-append ke pane; dipindah antar tab tanpa reset */
  holder: HTMLDivElement;
  /** data yang datang sebelum term siap dipasang */
  queue: string[];
}

const handles = new Map<string, TermHandle>();

/** Ambil token warna dari theme.css supaya terminal ikut tema Zephyr. */
function themeFromCss(): Record<string, string> {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    background: v('--editor-bg', '#1e1e1e'),
    foreground: v('--text', '#d4d4d4'),
    cursor: v('--editor-cursor', '#aeafad'),
    cursorAccent: v('--bg', '#1e1e1e'),
    selectionBackground: v('--editor-selection', 'rgba(56,132,255,0.3)'),
    black: '#1e1e1e',
    red: v('--syn-keyword', '#f85149'),
    green: v('--success', '#3fb950'),
    yellow: v('--warning', '#d29922'),
    blue: v('--accent', '#3884ff'),
    magenta: v('--syn-function', '#d2a8ff'),
    cyan: v('--syn-number', '#79c0ff'),
    white: v('--text', '#d4d4d4'),
    brightBlack: v('--text-muted', '#6e7681'),
  };
}

export function getHandle(id: string): TermHandle | undefined {
  return handles.get(id);
}

/** Buat (atau ambil) instance untuk sesi tertentu. */
export function ensureHandle(
  id: string,
  opts: { fontFamily: string; fontSize: number; onData: (d: string) => void; onResize: (c: number, r: number) => void },
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
    scrollback: 5000,
    allowProposedApi: true,
    convertEol: false,
    theme: themeFromCss(),
    // Windows: baris terakhir sering ditulis ulang; mode ini menghindari
    // artefak wrap di ConPTY.
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

/** Tulis data ke terminal; ditahan di queue bila belum ter-attach. */
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
  // clear() menyisakan baris aktif; reset penuh untuk benar-benar bersih.
  h.term.write('\x1b[2J\x1b[3J\x1b[H');
}

/** Hapus instance + scrollback (dipakai saat tab ditutup / private). */
export function disposeHandle(id: string): void {
  const h = handles.get(id);
  if (!h) return;
  h.queue = [];
  try {
    h.term.dispose();
  } catch {
    /* sudah ter-dispose */
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

/** Untuk verifikasi & Copy: ambil isi buffer yang terlihat. */
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

/** Cari baris (absolut, termasuk scrollback) yang isinya sama dengan `text`. */
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

/** Pilih satu baris buffer (dipakai UI "select line" & verifikasi copy). */
export function selectLine(id: string, row: number): boolean {
  const h = handles.get(id);
  if (!h || row < 0) return false;
  const buf = h.term.buffer.active;
  const line = buf.getLine(row);
  if (!line) return false;
  const text = line.translateToString(true);
  // Konversi index buffer absolut -> baris relatif viewport untuk select().
  h.term.select(0, row, text.length);
  return true;
}

/** Ukuran grid saat ini (cols/rows) — dipakai verifikasi resize. */
export function termSize(id: string): { cols: number; rows: number } | null {
  const h = handles.get(id);
  return h ? { cols: h.term.cols, rows: h.term.rows } : null;
}

export function activeIds(): string[] {
  return [...handles.keys()];
}
