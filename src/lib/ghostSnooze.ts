/*
 * Snooze for inline suggestions.
 *
 * Toggling `editor.ghostText` writes to disk and survives the session, but the
 * real need is smaller: a reader renaming a symbol wants the grey continuation
 * to stop *now*, for a few minutes, then come back. That is runtime-only state,
 * so it lives here and never touches settings.
 *
 * The deadline is a timestamp, so the pause ends by itself and a reload cannot
 * leave the editor permanently quiet. Both the local seam (`ambilSaran`) and
 * the AI path (`mintaSaran`) consult `ghostDitunda()`, so snoozing silences
 * every source of suggestions, not just the cheap one.
 */
import { useSyncExternalStore } from 'react';

let sampai: number | null = null;
let timer: number | null = null;
let detak: number | null = null;
const pendengar = new Set<() => void>();

function kabari() {
  for (const f of pendengar) f();
}

/** Apakah saran inline sedang ditunda sekarang? */
export function ghostDitunda(): boolean {
  return sampai !== null && Date.now() < sampai;
}

/** Sisa waktu tunda dalam milidetik (0 saat tidak ditunda). */
export function sisaTunda(): number {
  return sampai === null ? 0 : Math.max(0, sampai - Date.now());
}

/*
 * Selama tunda berjalan, satu interval per detik memberi tahu penonton agar
 * hitungan mundur di badge bergerak. Dipasang dari sini, bukan dari komponen,
 * supaya beberapa penonton tidak saling memasang/mematikan interval.
 */
function hidupkanDetak() {
  if (detak !== null) window.clearInterval(detak);
  detak = window.setInterval(() => {
    if (sampai === null) {
      if (detak !== null) window.clearInterval(detak);
      detak = null;
    }
    kabari();
  }, 1000);
}

function matikanDetak() {
  if (detak !== null) {
    window.clearInterval(detak);
    detak = null;
  }
}

/**
 * Tunda saran inline selama `ms` milidetik; `null`/`0` membatalkan tunda.
 * Deadline baru dihitung dari sekarang, tidak menumpuk di atas yang lama.
 */
export function tundaGhost(ms: number | null): void {
  if (timer !== null) {
    window.clearTimeout(timer);
    timer = null;
  }
  if (!ms || ms <= 0) {
    sampai = null;
    matikanDetak();
    kabari();
    return;
  }
  sampai = Date.now() + ms;
  timer = window.setTimeout(() => {
    timer = null;
    sampai = null;
    matikanDetak();
    kabari();
  }, ms);
  hidupkanDetak();
  kabari();
}

/** Langganan perubahan tunda (dipakai `useSisaTunda`). */
export function langgananTunda(f: () => void): () => void {
  pendengar.add(f);
  return () => {
    pendengar.delete(f);
  };
}

/** Sisa waktu tunda sebagai nilai reaktif (ms); 0 saat tidak ditunda. */
export function useSisaTunda(): number {
  return useSyncExternalStore(langgananTunda, sisaTunda, sisaTunda);
}

/** Durasi bawaan perintah/keybinding — cukup untuk satu penyuntingan, tidak
 * lebih: tunda yang terlalu panjang membuat fitur terasa rusak. */
export const TUNDA_BAWAAN_MS = 15 * 60 * 1000;
