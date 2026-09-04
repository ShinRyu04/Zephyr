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

/** Ambil token warna dari theme.css supaya terminal ikut tema Zephyr.
 *  16 warna ANSI datang dari `--terminal-ansi-0..15` (tokens.css, fase 13) —
 *  jangan kembali ke hex hardcoded: tema terang butuh ANSI-0 gelap. */
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

/** Terapkan tema aktif ke SEMUA terminal hidup (fase 13 V3).
 *  Dipanggil dari store setelah `applyTheme()`; token CSS sudah berganti
 *  saat ini, jadi cukup baca ulang. */
export function retheme(): number {
  const theme = themeFromCss();
  for (const h of handles.values()) h.term.options.theme = theme;
  return handles.size;
}

/**
 * Apakah mode screen reader aktif (dibaca dari atribut <html>).
 *
 * Atribut, bukan import store: xtermRegistry dipakai dari mana saja termasuk
 * sebelum store siap, dan mengimport store di sini membentuk lingkaran
 * (store.ts sudah mengimport xtermRegistry untuk retheme()).
 */
function srModeAktif(): boolean {
  try {
    return document.documentElement.dataset.screenReader === 'true';
  } catch {
    return false;
  }
}

/**
 * Terapkan mode screen reader ke SEMUA terminal hidup (fase 31).
 *
 * Terpisah dari `retheme()` walau dipanggil bersamaan: xterm menyimpan salinan
 * opsi sendiri, dan terminal yang sudah dibuat tidak ikut berubah hanya karena
 * atribut <html> berubah — sama seperti masalah warna di fase 13.
 */
export function reSrMode(): number {
  const aktif = srModeAktif();
  for (const h of handles.values()) h.term.options.screenReaderMode = aktif;
  return handles.size;
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
    // FASE 31: xterm menggambar terminal ke canvas/DOM yang TIDAK bisa dibaca
    // screen reader. `screenReaderMode` membuatnya memelihara live region
    // tersembunyi berisi teks baris — satu-satunya cara Narrator tahu isi
    // terminal. Mahal (DOM per baris), jadi hanya saat user memintanya.
    screenReaderMode: srModeAktif(),
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

/** Warna xterm yang SEDANG dipakai satu pane (bukti tema terminal, fase 13). */
export function termOptionsTheme(id: string): Record<string, string> | null {
  const h = handles.get(id);
  return h ? ({ ...(h.term.options.theme ?? {}) } as Record<string, string>) : null;
}

export function activeIds(): string[] {
  return [...handles.keys()];
}
