/*
 * Working set: the files the reader keeps coming back to.
 *
 * WHY A SEPARATE MODULE: the Explorer tree is a map of the FOLDER; it says
 * nothing about which ten files out of three hundred are actually being
 * edited. On a large project that costs a scroll (or a search) every time the
 * reader switches between the same pair of files. VS Code solves it the same
 * way - a "Working Set" list pinned above the tree - and people coming from
 * there look for it in the same place.
 *
 * STORAGE IS PER WORKSPACE. A working set that mixed projects would fill up
 * with paths the current tree cannot even show. Entries remember the folder
 * they were recorded in, and a workspace only sees its own.
 *
 * THE LIST IS CAPPED, and pinned entries are subtracted from the cap: without
 * a cap the list becomes an alphabetical dump of everything ever opened, which
 * is exactly the scrolling it was meant to remove.
 */

import { kunciPath } from './pathKey';

const MAKS = 12;

export interface EntriKerja {
  path: string;
  /** Opening count, used to order unpinned entries most-used first. */
  count: number;
  /** Last time (ms) the file was opened; shown as a hint, not used for order. */
  last: number;
  /** Pinned entries survive the cap and always sort first. */
  pinned: boolean;
}

interface Simpanan {
  version: 1;
  /** Workspace root -> entries. Root '' collects files opened with no workspace. */
  perRoot: Record<string, EntriKerja[]>;
}

const KUNCI = 'zephyr.workingSet';

let data: Simpanan = { version: 1, perRoot: {} };
let sudahMuat = false;

const pendengar = new Set<() => void>();

function bersihkan(arr: unknown): EntriKerja[] {
  if (!Array.isArray(arr)) return [];
  const out: EntriKerja[] = [];
  for (const e of arr) {
    if (!e || typeof e !== 'object') continue;
    const o = e as Partial<EntriKerja>;
    if (typeof o.path !== 'string' || o.path === '') continue;
    out.push({
      path: o.path,
      count: typeof o.count === 'number' && o.count > 0 ? o.count : 1,
      last: typeof o.last === 'number' ? o.last : 0,
      pinned: o.pinned === true,
    });
  }
  return out;
}

function muat(): void {
  if (sudahMuat) return;
  sudahMuat = true;
  try {
    const mentah = localStorage.getItem(KUNCI);
    if (!mentah) return;
    const o = JSON.parse(mentah) as Partial<Simpanan>;
    if (!o || typeof o !== 'object' || !o.perRoot) return;
    const perRoot: Record<string, EntriKerja[]> = {};
    for (const [k, v] of Object.entries(o.perRoot)) perRoot[k] = bersihkan(v);
    data = { version: 1, perRoot };
  } catch {
    /* Corrupt or unreadable storage is not worth a message: the list simply
       starts empty, and the next open rewrites it. */
  }
}

function simpan(): void {
  try {
    localStorage.setItem(KUNCI, JSON.stringify(data));
  } catch {
    /* Quota or a blocked storage origin. The list still works for this run. */
  }
}

function kabari(): void {
  for (const f of pendengar) f();
}

/** Subscribe to changes. Returns the unsubscribe function. */
export function langgananKerja(f: () => void): () => void {
  pendengar.add(f);
  return () => pendengar.delete(f);
}

const akarData = (root: string) => root.trim();

/**
 * Entries for one workspace, already ordered: pinned first, then by use count,
 * then most recent. The array is fresh on every call so callers may store it
 * in React state without freezing the module's copy.
 */
export function bacaKerja(root: string): EntriKerja[] {
  muat();
  const arr = data.perRoot[akarData(root)] ?? [];
  return [...arr].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.pinned && b.pinned) return b.last - a.last;
    if (b.count !== a.count) return b.count - a.count;
    return b.last - a.last;
  });
}

/** Record one open. Called from the store on every deliberate open. */
export function catatKerja(root: string, path: string): void {
  muat();
  const k = akarData(root);
  const arr = data.perRoot[k] ? [...data.perRoot[k]] : [];
  /* Keyed compare: the same file reaches here as `D:\a\b.ts` from a palette
     pick and `d:/a/b.ts` from a tree drop or an agent proposal, and the raw
     compare counted those as two files - the list showed the same file twice
     with its use count split between them. */
  const kunci = kunciPath(path);
  const i = arr.findIndex((e) => kunciPath(e.path) === kunci);
  if (i >= 0) {
    arr[i] = { ...arr[i], count: arr[i].count + 1, last: Date.now() };
  } else {
    arr.push({ path, count: 1, last: Date.now(), pinned: false });
  }
  data.perRoot[k] = potong(arr);
  simpan();
  kabari();
}

/** Drop one entry (file no longer wanted in the list, or it was deleted). */
export function hapusKerja(root: string, path: string): void {
  muat();
  const k = akarData(root);
  const arr = data.perRoot[k];
  if (!arr) return;
  const kunci = kunciPath(path);
  data.perRoot[k] = arr.filter((e) => kunciPath(e.path) !== kunci);
  simpan();
  kabari();
}

/** Pin or unpin. Unpinning does not remove the entry; it just frees the cap. */
export function sematKerja(root: string, path: string, pinned: boolean): void {
  muat();
  const k = akarData(root);
  const arr = data.perRoot[k];
  if (!arr) return;
  data.perRoot[k] = potong(
    arr.map((e) => (kunciPath(e.path) === kunciPath(path) ? { ...e, pinned, last: Date.now() } : e)),
  );
  simpan();
  kabari();
}

/**
 * Cap the list without ever dropping a pinned entry.
 *
 * `arr` arrives in insertion order, not sorted; dropping from the tail is
 * therefore dropping the oldest unpinned entry, which is what "least wanted"
 * means here. Pinned entries are kept even when there are more of them than
 * the cap - the reader asked for them by name.
 */
function potong(arr: EntriKerja[]): EntriKerja[] {
  if (arr.length <= MAKS) return arr;
  const hasil: EntriKerja[] = [];
  for (let i = arr.length - 1; i >= 0; i--) {
    const e = arr[i];
    if (e.pinned) hasil.unshift(e);
  }
  let sisa = MAKS - hasil.length;
  for (let i = arr.length - 1; i >= 0 && sisa > 0; i--) {
    const e = arr[i];
    if (e.pinned) continue;
    hasil.unshift(e);
    sisa--;
  }
  return hasil;
}

/** Test/reset hook: clears storage for every workspace. */
export function resetKerja(): void {
  data = { version: 1, perRoot: {} };
  sudahMuat = true;
  simpan();
  kabari();
}
