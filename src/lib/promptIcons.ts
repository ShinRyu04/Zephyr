import type { IkonCmd } from './promptLibrary';

/*
 * Glyphs for the slash-command list.
 *
 * Every path is drawn on a 16x16 grid and stroked in `currentColor`, so the row
 * decides the tint and the list stays legible in a single colour. The marks are
 * chosen to be distinguishable at 13px by SHAPE: a plus, a broom, a clock, a
 * magnifier, a shield. Two round glyphs in different colours would be one glyph
 * to a colour-blind reader, and the slash list is exactly where that matters —
 * eleven rows that all look alike until you read them.
 */

export const IKON_CMD: Record<IkonCmd, string> = {
  // Plus: a new thing starts here.
  baru: 'M8 3v10 M3 8h10',

  // Eraser: wiping the slate.
  bersih: 'M3.5 11.5l5-5 3 3-5 5H4z M9 5.5l2-2 3 3-2 2 M3 14h10',

  // Funnel narrowing to a line: trimming down.
  padat: 'M2 3h12l-4.5 5v5l-3 1.5V8z',

  // Arrow into a tray: taking something out.
  unduh: 'M8 2v8 M5 7.5l3 3 3-3 M3 12v2h10v-2',

  // Speech bubble with lines: explaining.
  jelas: 'M2.5 3h11v7h-6l-3 3v-3h-2z M5 5.5h6 M5 7.5h4',

  // Wrench over a spark: repairing.
  perbaiki: 'M11.5 2.5a3 3 0 00-3.6 3.9L3 11.3l1.7 1.7 4.9-4.9a3 3 0 003.9-3.6l-1.8 1.8-1.4-1.4z',

  // Two arrows swapping: rearranging without changing the meaning.
  rapikan: 'M3 5.5h7 M7.5 3l2.5 2.5-2.5 2.5 M13 10.5H6 M8.5 8L6 10.5 8.5 13',

  // Page with lines: writing it down.
  dokumen: 'M4 2h6l3 3v9H4z M10 2v3h3 M6 8h5 M6 11h5',

  // Flask: running a check.
  uji: 'M6.5 2v4L3 12.5c-.5 1 .2 1.5 1 1.5h8c.8 0 1.5-.5 1-1.5L9.5 6V2 M5.5 2h5 M5 10h6',

  // Magnifier with a check: reviewing.
  tinjau: 'M7 2.5a4.5 4.5 0 100 9 4.5 4.5 0 000-9z M10.4 10.4L14 14 M5.2 7l1.4 1.4 2.2-2.6',

  // Commit node on a branch.
  commit: 'M8 5.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z M1.5 8h4 M10.5 8h4',

  // Magnifier: searching.
  cari: 'M7 2.5a4.5 4.5 0 100 9 4.5 4.5 0 000-9z M10.4 10.4L14 14',

  // Terminal prompt.
  terminal: 'M2 3h12v10H2z M4 7l2 2-2 2 M8.5 11h3.5',

  // Question in a circle: asking.
  tanya: 'M8 2.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11z M6.3 6.2a1.7 1.7 0 113 1.2c-.6.5-1.3.8-1.3 1.6 M8 11.4v.1',

  // Lines collapsing: shortening.
  ringkas: 'M2 4h12 M2 8h8 M2 12h5',

  // Two speech bubbles: translating.
  terjemah: 'M2 3h7v5H5l-2 2V8H2z M7 7h7v5h-2v2l-2-2H7z',

  /* ── Workspace commands ──────────────────────────────────────────────── */

  // Arrow circling back on itself: repeating until the work is done.
  putar: 'M13 8a5 5 0 11-1.6-3.7 M13 2.5V5h-2.5',

  // Plug going into a socket: the MCP server listening on its port.
  colok: 'M6 2v3 M10 2v3 M4.5 5h7v2.5a3.5 3.5 0 01-7 0z M8 11v3',

  // Target with an arrow in the middle: the goal of the run.
  sasaran: 'M8 2.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11z M8 5.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z M8 7.6v.8',

  // Calendar page: a job with a date on it.
  jadwal: 'M2.5 3.5h11v10h-11z M2.5 6.5h11 M5.5 2v3 M10.5 2v3 M5 9h2',

  // Clock with an arrow: going back through what already happened.
  riwayat: 'M8 2.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11z M8 5v3.3l2.2 1.3',

  // Question mark in a ring: the help card.
  bantuan: 'M8 2.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11z M6.4 6.4a1.7 1.7 0 113 1.1c-.6.5-1.4.8-1.4 1.7 M8 11.3v.1',

  // Speech bubble pushed to the side: an aside, not the main thread.
  sisip: 'M2 4h9v6H6l-2.5 2.5V10H2z M12.5 2.5l2 2 M13 6.5h2.5',
};

/**
 * Tint per command, as a CSS custom property.
 *
 * The list used to be one accent colour throughout, which made eleven rows look
 * like one block. Colour is the SECOND channel here, never the only one — every
 * glyph already differs in shape, so a colour-blind reader loses nothing and a
 * sighted one can group the rows at a glance: session commands (blue), prompt
 * commands (green), workspace commands (amber).
 *
 * Values are token names from `theme.css`, not hex, so the Senja theme and any
 * future theme re-tint the list for free.
 */
export const WARNA_CMD: Record<IkonCmd, string> = {
  // Session: what happens to this conversation.
  baru: 'var(--accent)',
  bersih: 'var(--danger)',
  padat: 'var(--accent)',
  unduh: 'var(--accent)',

  // Prompts: what the model is asked to do.
  jelas: 'var(--syn-string)',
  perbaiki: 'var(--warning)',
  rapikan: 'var(--syn-function)',
  dokumen: 'var(--syn-type)',
  uji: 'var(--success)',
  tinjau: 'var(--syn-variable)',
  commit: 'var(--syn-keyword)',

  // Extras.
  cari: 'var(--accent)',
  terminal: 'var(--success)',
  tanya: 'var(--accent)',
  ringkas: 'var(--accent)',
  terjemah: 'var(--syn-function)',

  // Workspace: what happens to the app itself.
  putar: 'var(--syn-type)',
  colok: 'var(--accent)',
  sasaran: 'var(--warning)',
  jadwal: 'var(--syn-variable)',
  riwayat: 'var(--syn-function)',
  bantuan: 'var(--accent)',
  sisip: 'var(--text-secondary)',
};

/** The tint for an icon id, with the accent as the fallback. */
export function warnaIkonCmd(id: IkonCmd | undefined): string {
  return (id && WARNA_CMD[id]) || 'var(--accent)';
}

/** The path for an icon id, with a safe fallback. */
export function pathIkonCmd(id: IkonCmd | undefined): string {
  return (id && IKON_CMD[id]) || IKON_CMD.tanya;
}
