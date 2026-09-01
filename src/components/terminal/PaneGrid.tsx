// PaneGrid.tsx — grid pane dalam satu tab terminal (fase 06).
//
// 1 pane  -> penuh
// 2 pane  -> dua kolom (layout 'split' = atas-bawah)
// >2 pane -> grid 2 kolom, wrap; 5-6 pane jadi 3 kolom supaya tetap terbaca
//
// Setiap pane punya header: ikon jenis + judul + pid + tombol close.
// Header bisa di-drag untuk menukar urutan pane (HTML5 DnD), dan klik kanan
// header membuka menu konteks (Reconnect/Kill/Close).

import { useRef, useState } from 'react';
import { useTerminal } from '../../lib/terminalStore';
import BrowserPane from './BrowserPane';
import PaneIcon from './PaneIcons';
import XtermPane from './XtermPane';
import type { PaneMeta, TerminalTab } from '../../lib/types';

/** Placeholder tab kosong (V1): tombol untuk menambah pane pertama.
 *  Dipakai juga saat belum ada tab sama sekali — `addPane` membuat tabnya. */
export function PaneEmpty() {
  const addPane = useTerminal((s) => s.addPane);
  const setAgentPickerOpen = useTerminal((s) => s.setAgentPickerOpen);

  return (
    <div className="pane-empty" data-testid="pane-empty">
      <p className="pane-empty-title">Klik untuk menambah pane</p>
      <div className="pane-empty-actions">
        <button className="btn btn-primary" data-testid="empty-shell" onClick={() => void addPane('shell')}>
          Shell
        </button>
        <button className="btn" data-testid="empty-private" onClick={() => void addPane('private')}>
          Private
        </button>
        <button className="btn" data-testid="empty-agent" onClick={() => setAgentPickerOpen(true)}>
          AI Agent…
        </button>
        <button className="btn" data-testid="empty-browser" onClick={() => void addPane('browser')}>
          Browser
        </button>
      </div>
      <p className="pane-empty-sub">up to 6 panes per tab</p>
    </div>
  );
}

function PaneHeader({
  pane,
  index,
  tabId,
  active,
}: {
  pane: PaneMeta;
  index: number;
  tabId: string;
  active: boolean;
}) {
  const closePane = useTerminal((s) => s.closePane);
  const killPane = useTerminal((s) => s.killPane);
  const reorderPane = useTerminal((s) => s.reorderPane);
  const paneMenuFor = useTerminal((s) => s.paneMenuFor);
  const setPaneMenuFor = useTerminal((s) => s.setPaneMenuFor);
  const setActivePane = useTerminal((s) => s.setActivePane);

  return (
    <div
      className={`pane-head${active ? ' is-active' : ''}`}
      data-pane-head={pane.id}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/zephyr-pane', String(index));
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('text/zephyr-pane')) e.preventDefault();
      }}
      onDrop={(e) => {
        const from = Number(e.dataTransfer.getData('text/zephyr-pane'));
        e.preventDefault();
        if (!Number.isNaN(from)) reorderPane(tabId, from, index);
      }}
      onClick={() => setActivePane(tabId, pane.id)}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setPaneMenuFor(paneMenuFor === pane.id ? null : pane.id);
      }}
      title={`${pane.title}${pane.pid ? ` — pid ${pane.pid}` : ''}`}
    >
      <PaneIcon kind={pane.kind} agentId={pane.agent?.name} />
      <span className="pane-title">{pane.title}</span>
      {pane.pid ? <span className="pane-pid">{pane.pid}</span> : null}
      {pane.status === 'exited' && <span className="tt-dead">exited</span>}

      <button
        className="tt-tab-close pane-close"
        title="Tutup pane"
        aria-label={`Tutup ${pane.title}`}
        data-testid={`pane-close-${pane.id}`}
        onClick={(e) => {
          e.stopPropagation();
          void closePane(pane.id);
        }}
      >
        <svg viewBox="0 0 16 16" className="tt-icon" aria-hidden="true">
          <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>

      {paneMenuFor === pane.id && (
        <div className="tt-dropdown pane-menu" role="menu">
          <button
            className="tt-drop-item"
            role="menuitem"
            data-testid="pane-kill"
            disabled={pane.kind === 'browser'}
            onClick={(e) => {
              e.stopPropagation();
              void killPane(pane.id);
            }}
          >
            Kill Process
          </button>
          <div className="tt-drop-sep" />
          <button
            className="tt-drop-item tt-drop-danger"
            role="menuitem"
            onClick={(e) => {
              e.stopPropagation();
              void closePane(pane.id);
            }}
          >
            Close Pane
          </button>
        </div>
      )}
    </div>
  );
}

export default function PaneGrid({ tab }: { tab: TerminalTab }) {
  const setActivePane = useTerminal((s) => s.setActivePane);
  const [dropHint, setDropHint] = useState(false);
  const gridRef = useRef<HTMLDivElement | null>(null);

  if (tab.panes.length === 0) return <PaneEmpty />;

  const n = tab.panes.length;
  const cols = tab.layout === 'split' && n === 2 ? 1 : n === 1 ? 1 : n <= 4 ? 2 : 3;

  return (
    <div
      ref={gridRef}
      className={`pane-grid${dropHint ? ' is-dropping' : ''}`}
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      data-pane-count={n}
      data-layout={tab.layout}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('text/zephyr-pane')) {
          e.preventDefault();
          setDropHint(true);
        }
      }}
      onDragLeave={() => setDropHint(false)}
      onDrop={() => setDropHint(false)}
    >
      {tab.panes.map((p, i) => (
        <section
          key={p.id}
          className={`pane${tab.activePaneId === p.id ? ' is-active' : ''}`}
          data-pane={p.id}
          data-pane-kind={p.kind}
          data-pane-index={i}
          onMouseDown={() => setActivePane(tab.id, p.id)}
        >
          <PaneHeader pane={p} index={i} tabId={tab.id} active={tab.activePaneId === p.id} />
          <div className="pane-body">
            {p.kind === 'browser' ? <BrowserPane pane={p} /> : <XtermPane pane={p} />}
          </div>
        </section>
      ))}
    </div>
  );
}
