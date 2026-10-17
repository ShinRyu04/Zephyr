/**
 * The Agents window's browser pane, published where the agent tools can see it.
 *
 * WHY THIS EXISTS. The agent's browser tools (`browser_open`, `browser_read`,
 * `browser_click`, …) were written for the MAIN window's terminal panes and
 * resolve everything through `useTerminal`. The Agents window is a SEPARATE
 * WebView with its own stores, so the browser in its right column was invisible
 * to the agent: asking "open google.com" in that window created a pane in the
 * main window's terminal panel — a place the reader was not even looking — while
 * the browser in front of them stayed blank.
 *
 * The two panes live in different JS contexts, so the registry travels through
 * `localStorage`, which is shared per origin by every WebView2 window of the app.
 * Each window owns its own entry and merges the others on every read, so neither
 * has to be told about the other.
 *
 * It also carries the REQUEST channel: the agent cannot create the pane itself
 * (it does not know the column's bounds), so it writes the address it wants and
 * the component — which owns the pane and its rectangle — picks it up. That is
 * the same division the terminal panes have, where the store owns the pane and
 * the pane component owns the webview.
 *
 * STALENESS. An entry is refreshed by its owner on every poll; anything not
 * refreshed within `BATAS_SEGAR_MS` is treated as gone. Without that, closing
 * the Agents window (or a crash) would leave a phantom pane that every tool
 * reports and no tool can read.
 */

const KUNCI = 'zephyr.agents.browser.v1';

/** Entries older than this are treated as gone (owner not refreshing). */
export const BATAS_SEGAR_MS = 20_000;

export interface AgBrowserPane {
  id: string;
  url: string;
  title: string;
  /** The child webview answers — the page is really loaded and readable. */
  siap: boolean;
  /** The agent asked for this address; the component loads it and clears it. */
  minta?: string;
  /** `Date.now()` of the last refresh by the owning window. */
  ts: number;
}

type Peta = Record<string, AgBrowserPane>;

function baca(): Peta {
  try {
    const mentah = localStorage.getItem(KUNCI);
    if (!mentah) return {};
    const p = JSON.parse(mentah) as unknown;
    if (!p || typeof p !== 'object' || Array.isArray(p)) return {};
    const out: Peta = {};
    for (const [k, v] of Object.entries(p as Record<string, unknown>)) {
      if (!v || typeof v !== 'object') continue;
      const o = v as Partial<AgBrowserPane>;
      if (typeof o.id !== 'string' || !o.id) continue;
      out[k] = {
        id: o.id,
        url: typeof o.url === 'string' ? o.url : '',
        title: typeof o.title === 'string' ? o.title : '',
        siap: o.siap === true,
        minta: typeof o.minta === 'string' ? o.minta : undefined,
        ts: typeof o.ts === 'number' ? o.ts : 0,
      };
    }
    return out;
  } catch {
    return {};
  }
}

function tulis(p: Peta): void {
  try {
    localStorage.setItem(KUNCI, JSON.stringify(p));
  } catch {
    /* quota full / storage disabled: the pane is simply not shared */
  }
}

/**
 * Every live Agents-window browser pane.
 *
 * Expired entries are dropped from the returned list but left in storage: the
 * window that owns one may only be briefly busy (a long page load), and deleting
 * another window's entry from here would race its next refresh.
 */
export function daftarPaneAgents(): AgBrowserPane[] {
  const sekarang = Date.now();
  return Object.values(baca()).filter((p) => sekarang - p.ts < BATAS_SEGAR_MS);
}

/** One pane by id, or by URL fragment (same tolerance the terminal path uses). */
export function paneAgents(idAtauUrl?: string): AgBrowserPane | null {
  const semua = daftarPaneAgents();
  if (!semua.length) return null;
  if (!idAtauUrl) return semua[semua.length - 1];
  const t = idAtauUrl.trim();
  return (
    semua.find((p) => p.id === t) ??
    semua.find((p) => p.url && p.url.includes(t)) ??
    null
  );
}

/** Publish / refresh this window's pane. */
export function catatPaneAgents(p: Omit<AgBrowserPane, 'ts'>): void {
  const peta = baca();
  peta[p.id] = { ...p, ts: Date.now() };
  tulis(peta);
}

/** Forget this window's pane (closed, or the view unmounted). */
export function lupakanPaneAgents(id: string): void {
  const peta = baca();
  if (!(id in peta)) return;
  delete peta[id];
  tulis(peta);
}

/**
 * Ask the Agents window to load an address.
 *
 * Returns false when no Agents-window browser is published — the caller is
 * expected to say so instead of silently succeeding, because a request nobody
 * picks up would look like "the page opened" to the model.
 */
export function mintaPaneAgents(id: string, url: string): boolean {
  const peta = baca();
  const ada = peta[id];
  if (!ada || Date.now() - ada.ts >= BATAS_SEGAR_MS) return false;
  peta[id] = { ...ada, minta: url, ts: Date.now() };
  tulis(peta);
  return true;
}

/** Take the pending request for this pane, clearing it so it runs once. */
export function ambilPermintaanAgents(id: string): string | null {
  const peta = baca();
  const ada = peta[id];
  if (!ada?.minta) return null;
  const url = ada.minta;
  peta[id] = { ...ada, minta: undefined, ts: Date.now() };
  tulis(peta);
  return url;
}

/** Subscribe to changes made by the OTHER window (`storage` fires cross-window). */
export function saatRegistryAgentsBerubah(cb: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === KUNCI) cb();
  };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}
