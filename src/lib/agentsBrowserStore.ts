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
  /*
   * Must test for a STRING, not truthiness: `''` is a real request — it means
   * "close this pane". `!ada?.minta` rejects it, so a close request sat in the
   * registry forever and `browser_close` always answered "still open".
   */
  if (typeof ada?.minta !== 'string') return null;
  const url = ada.minta;
  /* The key is REMOVED, not set to `undefined`: `JSON.stringify` drops
     undefined values, so the stored entry must not carry `minta` at all —
     otherwise a reader cannot tell "no request" from "request pending". */
  const { minta: _dipakai, ...sisa } = ada;
  peta[id] = { ...sisa, ts: Date.now() };
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

/* ------------------------------------------------------------------ *
 * "Open this link HERE" — the request to CREATE the pane
 * ------------------------------------------------------------------ */

const KUNCI_BUKA = 'zephyr.agents.browser.open.v1';

/** Exported so the column can POLL for a pending request without taking it. */
export const KUNCI_BUKA_AGENTS = KUNCI_BUKA;

/** How long a "open here" request stays valid (the window may be busy). */
export const BATAS_BUKA_MS = 15_000;

export interface PermintaanBuka {
  url: string;
  ts: number;
}

/**
 * Ask the Agents window to open a URL **in its right column**, creating the
 * browser view if it is not there yet.
 *
 * WHY SEPARATE FROM `mintaPaneAgents`: that one only works when a browser pane
 * is already published, and publishes nothing when the column shows Start/File/
 * Terminal. The result was that `browser_open` called FROM the Agents window fell
 * through to the terminal path, created a pane in the MAIN window's panel (which
 * `browser_pane_info` could not see, because Tauri labels child webviews per
 * window), and answered "browser pane not found". This request needs no existing
 * pane — the window that owns the column creates one.
 */
export function mintaBukaDiAgents(url: string): void {
  try {
    const isi: PermintaanBuka = { url, ts: Date.now() };
    localStorage.setItem(KUNCI_BUKA, JSON.stringify(isi));
  } catch {
    /* storage disabled: the request is simply lost, caller falls back */
  }
}

/**
 * Take the pending "open here" request, clearing it so it runs once.
 *
 * Only the window that may run it should call this — in practice the `#agents`
 * window, its own the only one with the right column. Clearing on read is what
 * keeps the MAIN window (same origin, same `localStorage`) from also opening it.
 */
export function ambilBukaDiAgents(): string | null {
  let mentah: string | null = null;
  try {
    mentah = localStorage.getItem(KUNCI_BUKA);
    if (mentah) localStorage.removeItem(KUNCI_BUKA);
  } catch {
    return null;
  }
  if (!mentah) return null;
  try {
    const o = JSON.parse(mentah) as Partial<PermintaanBuka>;
    if (typeof o.url !== 'string' || !o.url) return null;
    if (typeof o.ts !== 'number' || Date.now() - o.ts > BATAS_BUKA_MS) return null;
    return o.url;
  } catch {
    return null;
  }
}

/** Id of this window's browser pane — the registry's stable key. */
export const ID_PANE_AGENTS = 'agents-browser';

/**
 * Is this document the Agents window (the one that owns the right column)?
 *
 * WHY IT MATTERS. The registry lives in `localStorage`, so the MAIN window reads
 * the same entry — and it used to trust `siap` alone. After the Agents window's
 * pane was closed, that entry stayed "ready" for `BATAS_SEGAR_MS`, so `close`
 * called from the MAIN window picked it as the effective pane, wrote `minta: ''`
 * into it, and answered "closed successfully" to a window that has no column to
 * read the request. The real pane kept painting; the caller was told it was gone.
 *
 * Matches the same markers `web.ts` uses for routing (hash first, DOM class as
 * the fallback for a build that renders before the hash is applied).
 */
export function diJendelaAgents(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  if (window.location.hash === '#agents') return true;
  return !!document.querySelector('.agents-window-root');
}
