import { useEffect, useState } from 'react';
import { useT } from '../../lib/i18n';
import {
  daftarPaneAgents,
  saatRegistryAgentsBerubah,
  type AgBrowserPane,
} from '../../lib/agentsBrowserStore';

/**
 * The browser page the agent and the reader are looking at, shown as a chip in
 * the composer — the same idea as the reference's `[🌐 Google]` pill.
 *
 * WHY IT EXISTS. The browser pane lives in the OTHER window (the Agents
 * window's right column) and its state is published to a shared registry
 * (`agentsBrowserStore`). Without a chip, the reader has no way to know the
 * conversation is attached to a page at all: the address bar is a whole window
 * away, and `@url:` references only exist once someone types them. The chip is
 * the visible half of the bridge the tools use.
 *
 * It is READ-ONLY about the page: it names what is open and lets the reader
 * drop the page into the message as an `@url:` reference, or dismiss the chip.
 * Nothing here creates or navigates a pane — the browser view owns that.
 */
export default function BrowserContextChip({ onSisip }: { onSisip: (teks: string) => void }) {
  const tr = useT();
  const [pane, setPane] = useState<AgBrowserPane | null>(null);
  /* Dismissed by the reader: stays gone until the page actually changes, so the
     chip cannot reappear on the next poll and undo the click. */
  const [abaikan, setAbaikan] = useState<string | null>(null);

  useEffect(() => {
    const baca = () => {
      const semua = daftarPaneAgents();
      /* The page worth showing is the one with a real address; an empty pane is
         not context. */
      const p = semua.filter((x) => x.url).pop() ?? null;
      setPane(p);
      if (!p) setAbaikan(null);
    };
    baca();
    const t = window.setInterval(baca, 1500);
    const lepas = saatRegistryAgentsBerubah(baca);
    return () => {
      window.clearInterval(t);
      lepas();
    };
  }, []);

  if (!pane || !pane.url) return null;
  if (abaikan === pane.url) return null;

  const judul = (pane.title || pane.url).trim();
  const pendek = judul.length > 42 ? `${judul.slice(0, 41)}…` : judul;

  return (
    <div className="ai-browser-chip" data-testid="ai-browser-chip" data-url={pane.url}>
      <button
        type="button"
        className="ai-browser-chip-main"
        data-testid="ai-browser-chip-insert"
        title={tr('Attach this page to the message')}
        onClick={() => onSisip(`@url:${pane.url}`)}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <path
            d="M1.9 6.1h12.2M1.9 9.9h12.2M8 1.8a10 10 0 0 1 0 12.4M8 1.8a10 10 0 0 0 0 12.4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
          />
        </svg>
        <span className="ai-browser-chip-teks">{pendek}</span>
      </button>
      <button
        type="button"
        className="ai-browser-chip-x"
        data-testid="ai-browser-chip-close"
        title={tr('Hide this page from the composer')}
        aria-label={tr('Hide this page from the composer')}
        onClick={() => setAbaikan(pane.url)}
      >
        ✕
      </button>
    </div>
  );
}
