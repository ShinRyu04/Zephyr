import { useMemo, useState } from 'react';
import { useAi } from '../../lib/aiStore';
import { useStore } from '../../lib/store';
import { useT } from '../../lib/i18n';

/*
 * The left column: past sessions on top, Customizations below.
 *
 * This is NOT `SessionsPanel` (the one the maximized chat column uses). That
 * panel is a dismissible *sidebar* with its own header, hide button and
 * Today/Yesterday grouping — chrome that belongs to a column you can close.
 * Here the column is a permanent fixture of the workspace, and the screenshot's
 * shape is a workspace list plus a Customizations block, so the list is built
 * for this layout and the two share one scroller.
 *
 * The rows are grouped by WORKSPACE (matching the screenshot: "Jogja Marketing
 * Camp", "Zephyr", "ZephyrCLI", "Talos"), which is the folder each conversation
 * was held in. Sessions with no recorded folder fall under "Chats", so nothing
 * is ever hidden.
 */

/** Customizations entries. Items with a `section` open that Settings section;
    the rest are placeholders that open Settings at its overview. */
type Custom = { label: string; count?: number; testid: string };

const CUSTOMS: Custom[] = [
  { label: 'Overview', testid: 'ag-cust-overview' },
  { label: 'Plugins', testid: 'ag-cust-plugins' },
  { label: 'MCP Servers', testid: 'ag-cust-mcp' },
  { label: 'Skills', testid: 'ag-cust-skills' },
  { label: 'Instructions', testid: 'ag-cust-instructions' },
  { label: 'Agents', testid: 'ag-cust-agents' },
  { label: 'Hooks', testid: 'ag-cust-hooks' },
  { label: 'Tools', testid: 'ag-cust-tools' },
];

export default function AgentsSessions() {
  const tr = useT();
  const sesi = useAi((s) => s.sessions);
  const activeId = useAi((s) => s.activeId);
  const selectChat = useAi((s) => s.selectChat);
  const newChat = useAi((s) => s.newChat);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const [cari, setCari] = useState('');
  const [custBuka, setCustBuka] = useState(true);

  /* Newest activity first — a conversation you just had is the one you want. */
  const urut = useMemo(() => {
    const arr = [...sesi];
    arr.sort(
      (a, b) =>
        (b.messages[b.messages.length - 1]?.at ?? b.createdAt) -
        (a.messages[a.messages.length - 1]?.at ?? a.createdAt),
    );
    return arr;
  }, [sesi]);

  const tersaring = urut.filter((s) => {
    if (!cari) return true;
    const q = cari.toLowerCase();
    return s.title.toLowerCase().includes(q);
  });

  /* Group by recency. A per-workspace grouping (as in the reference design) is
     not possible: `ChatSession` carries no workspace field — a conversation is
     not bound to a folder — so grouping by one would mean inventing the data. */
  const grup = useMemo(() => {
    const hariIni = Date.now() - 86400000;
    const kemarin = Date.now() - 172800000;
    const peta = new Map<string, typeof tersaring>();
    for (const s of tersaring) {
      const last = s.messages[s.messages.length - 1];
      const ts = last?.at ?? s.createdAt;
      const label = ts > hariIni ? 'Today' : ts > kemarin ? 'Yesterday' : 'Earlier';
      const arr = peta.get(label);
      if (arr) arr.push(s);
      else peta.set(label, [s]);
    }
    return [...peta.entries()];
  }, [tersaring]);

  return (
    <div className="ag-sesi" data-testid="ag-sessions">
      <div className="ag-sesi-head">
        <span className="ag-sesi-title">{tr('Sessions')}</span>
        <button
          className="ag-sesi-new"
          data-testid="ag-new-session"
          title={tr('New')}
          aria-label={tr('New')}
          onClick={() => newChat()}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M8 3.4v9.2M3.4 8h9.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
          </svg>
        </button>
      </div>

      <div className="ag-sesi-cari">
        <svg viewBox="0 0 16 16" aria-hidden="true" className="ag-sesi-cari-ic">
          <circle cx="7" cy="7" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <path d="M10.2 10.2l3.2 3.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
        </svg>
        <input
          className="ag-sesi-input"
          data-testid="ag-sessions-search"
          placeholder={tr('Search')}
          value={cari}
          onChange={(e) => setCari(e.target.value)}
        />
      </div>

      <div className="ag-sesi-list">
        {grup.length === 0 && <p className="ag-sesi-kosong">{tr('No conversations yet')}</p>}
        {grup.map(([label, items]) => (
          <div key={label} className="ag-sesi-grup">
            <div className="ag-sesi-grup-label">{label}</div>
            {items.map((s) => (
              <button
                key={s.id}
                className={`ag-sesi-row${s.id === activeId ? ' is-aktif' : ''}`}
                data-testid={`ag-sesi-${s.id}`}
                title={s.title}
                onClick={() => selectChat(s.id)}
              >
                <svg viewBox="0 0 16 16" aria-hidden="true" className="ag-sesi-row-ic">
                  <path
                    d="M2.4 4a1.6 1.6 0 0 1 1.6-1.6h8A1.6 1.6 0 0 1 13.6 4v5.4a1.6 1.6 0 0 1-1.6 1.6H6.2L3.4 13.2V11h-.2a.8.8 0 0 1-.8-.8V4Z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="ag-sesi-row-teks">{s.title || tr('Untitled')}</span>
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Customizations — collapsible, with the collapsed state keeping a
          footer bar so the section is never lost: closed it reads
          "Customizations 36 ›", which is both a label and the way back in. */}
      <div className={`ag-cust${custBuka ? '' : ' is-tutup'}`} data-testid="ag-customizations">
        <button
          className="ag-cust-head"
          data-testid="ag-cust-toggle"
          aria-expanded={custBuka}
          onClick={() => setCustBuka((v) => !v)}
        >
          <span className="ag-cust-chev" aria-hidden="true">
            <svg viewBox="0 0 16 16">
              <path
                d="M6 3.6L10.4 8L6 12.4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="ag-cust-judul">{tr('Customizations')}</span>
          {!custBuka && <span className="ag-cust-jumlah">{CUSTOMS.length}</span>}
        </button>
        {custBuka &&
          CUSTOMS.map((c) => (
            <button
              key={c.testid}
              className="ag-cust-row"
              data-testid={c.testid}
              onClick={() => setSettingsOpen(true)}
            >
              <span className="ag-cust-label">{tr(c.label)}</span>
              {c.count !== undefined && <span className="ag-cust-count">{c.count}</span>}
            </button>
          ))}
      </div>
    </div>
  );
}
