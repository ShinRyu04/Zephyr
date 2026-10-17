import { useMemo, useState } from 'react';
import { useAi } from '../../lib/aiStore';
import { useStore } from '../../lib/store';
import { useT } from '../../lib/i18n';
import { useAgentCustom, type AgentCustomSection } from '../../lib/agentCustomStore';
import AiIkon, { type NamaAiIkon } from '../ai/AiIkon';
import SessionContextMenu from './SessionContextMenu';

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

/** Customizations entries. Each row opens the Agent Customizations panel on
    its own section — the same modal the AI view's `…` menu opens, NOT the
    editor-area Settings page. The glyph is the same one that section uses in
    the panel's own nav, so a row and its destination read as the same thing. */
type Custom = { label: string; section: AgentCustomSection; icon: NamaAiIkon };

const CUSTOMS: Custom[] = [
  { label: 'Overview', section: 'overview', icon: 'robot' },
  { label: 'Plugins', section: 'plugins', icon: 'link' },
  { label: 'MCP Servers', section: 'mcp', icon: 'terminal' },
  { label: 'Skills', section: 'skills', icon: 'thought' },
  { label: 'Instructions', section: 'instructions', icon: 'doc' },
  { label: 'Agents', section: 'agents', icon: 'robot' },
  { label: 'Hooks', section: 'hooks', icon: 'queue' },
  { label: 'Tools', section: 'tools', icon: 'wrench' },
];

export default function AgentsSessions() {
  const tr = useT();
  const sesi = useAi((s) => s.sessions);
  const activeId = useAi((s) => s.activeId);
  const selectChat = useAi((s) => s.selectChat);
  const newChat = useAi((s) => s.newChat);
  const deleteChat = useAi((s) => s.deleteChat);
  const renameChat = useAi((s) => s.renameChat);
  const duplicateChat = useAi((s) => s.duplicateChat);
  const setChatPinned = useAi((s) => s.setChatPinned);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const bukaCustom = useAgentCustom((s) => s.buka);
  const workspaceAktif = useStore((s) => s.workspace);
  const [cari, setCari] = useState('');
  const [custBuka, setCustBuka] = useState(true);
  /*
   * The row a right-click opened the menu for, plus where to draw it.
   *
   * Kept as ONE piece of state: a separate `open` flag and `target` would allow
   * the menu to be open with no target (a click on nothing renders an empty
   * menu), and the position must travel with the row anyway.
   */
  const [menu, setMenu] = useState<{ id: string; judul: string; dipin: boolean; x: number; y: number } | null>(null);
  /* Inline rename: the id being edited and its draft text. */
  const [gantiNama, setGantiNama] = useState<{ id: string; teks: string } | null>(null);

  /* Newest activity first — a conversation you just had is the one you want. */
  const urut = useMemo(() => {
    const arr = [...sesi];
    arr.sort((a, b) => {
      /* Pinned rows sit on top regardless of age — that is what pinning means. */
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      return (
        (b.messages[b.messages.length - 1]?.at ?? b.createdAt) -
        (a.messages[a.messages.length - 1]?.at ?? a.createdAt)
      );
    });
    return arr;
  }, [sesi]);

  const tersaring = urut.filter((s) => {
    if (!cari) return true;
    const q = cari.toLowerCase();
    return s.title.toLowerCase().includes(q);
  });

  /*
   * Group by the workspace folder each conversation belongs to, newest group
   * first — the way the reference design lists "Zephyr", "ZephyrCLI", "Talos"
   * as their own blocks.
   *
   * A session created before `workspace` existed has none recorded; those fall
   * under the folder that is OPEN right now, because that is the context they
   * were almost certainly had in, and it keeps them visible instead of
   * dropping them into a nameless bucket.
   */
  const grup = useMemo(() => {
    const peta = new Map<string, typeof tersaring>();
    for (const s of tersaring) {
      const label = s.workspace || workspaceAktif || 'Chats';
      const arr = peta.get(label);
      if (arr) arr.push(s);
      else peta.set(label, [s]);
    }
    return [...peta.entries()].sort((a, b) => {
      /* The active folder first: it is the one being worked in. */
      if (a[0] === workspaceAktif) return -1;
      if (b[0] === workspaceAktif) return 1;
      const terbaru = (arr: typeof tersaring) =>
        Math.max(...arr.map((s) => s.messages[s.messages.length - 1]?.at ?? s.createdAt));
      return terbaru(b[1]) - terbaru(a[1]);
    });
  }, [tersaring, workspaceAktif]);

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
            {/*
              * No folder header.
              *
              * The reader asked for the folder name to go: in a column this
              * narrow the name was the widest thing on the row and it named a
              * fact nobody was choosing between — every conversation below it
              * belongs to the folder that is already open in the title bar. The
              * grouping is kept (it still orders sessions by folder, active one
              * first); only the label is gone, so nothing is hidden.
              */}
            {items.map((s) => (
              <button
                key={s.id}
                className={`ag-sesi-row${s.id === activeId ? ' is-aktif' : ''}`}
                data-testid={`ag-sesi-${s.id}`}
                title={s.title}
                onClick={() => selectChat(s.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu({ id: s.id, judul: s.title || tr('Untitled'), dipin: !!s.pinned, x: e.clientX, y: e.clientY });
                }}
                /* Double-click renames, the same gesture the reference list uses. */
                onDoubleClick={() => setGantiNama({ id: s.id, teks: s.title || '' })}
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
                {gantiNama?.id === s.id ? (
                  <input
                    className="ag-sesi-row-input"
                    data-testid="ag-sesi-rename-input"
                    value={gantiNama.teks}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setGantiNama({ id: s.id, teks: e.target.value })}
                    onBlur={() => {
                      renameChat(s.id, gantiNama.teks);
                      setGantiNama(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        renameChat(s.id, gantiNama.teks);
                        setGantiNama(null);
                      }
                      if (e.key === 'Escape') setGantiNama(null);
                    }}
                  />
                ) : (
                  <span className="ag-sesi-row-teks">{s.title || tr('Untitled')}</span>
                )}
                {s.pinned && (
                  <svg viewBox="0 0 16 16" aria-hidden="true" className="ag-sesi-row-pin" data-testid="ag-sesi-pin">
                    <path
                      d="M9.6 2.2 13.8 6.4l-1.6 1.6-.6-.6-2.6 2.6.2 2.2-1 1-3.4-3.4 1-1 2.2.2 2.6-2.6-.6-.6z"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.1"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </button>
            ))}
          </div>
        ))}
      </div>

      {menu && (
        <SessionContextMenu
          x={menu.x}
          y={menu.y}
          judul={menu.judul}
          dipin={menu.dipin}
          onAksi={(aksi) => {
            const id = menu.id;
            switch (aksi) {
              case 'rename':
                setGantiNama({ id, teks: menu.judul });
                break;
              case 'duplicate':
                duplicateChat(id);
                break;
              case 'pin':
                setChatPinned(id, true);
                break;
              case 'unpin':
                setChatPinned(id, false);
                break;
              case 'copyTitle':
                void navigator.clipboard?.writeText(menu.judul).catch(() => undefined);
                break;
              case 'copyId':
                void navigator.clipboard?.writeText(id).catch(() => undefined);
                break;
              case 'delete':
                deleteChat(id);
                break;
            }
          }}
          onTutup={() => setMenu(null)}
        />
      )}

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
              key={c.section}
              className="ag-cust-row"
              data-testid={`ag-cust-${c.section}`}
              onClick={() => {
                /* The panel is its own modal, NOT the editor Settings page —
                   sending the reader to Settings for customizations is the
                   path that was removed once already. */
                setSettingsOpen(false);
                bukaCustom(c.section);
              }}
            >
              <span className="ag-cust-ikon" aria-hidden="true">
                <AiIkon name={c.icon} size={15} />
              </span>
              <span className="ag-cust-label">{tr(c.label)}</span>
            </button>
          ))}
      </div>
    </div>
  );
}
