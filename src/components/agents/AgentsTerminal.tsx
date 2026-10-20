import { useEffect, useRef, useState } from 'react';
import { useTerminal } from '../../lib/terminalStore';
import { usePanel } from '../../lib/panelStore';
import { useStore } from '../../lib/store';
import { useAi } from '../../lib/aiStore';
import { useT } from '../../lib/i18n';

/**
 * Terminal — a real shell inside the right column.
 *
 * ## Why the panel's own grid is not reused
 *
 * `TerminalTabs` + `PaneGrid` are the BOTTOM panel: they read
 * `terminalTabs`/`activeTabId`, draw their own tab strip, and exist to be one
 * tab among Problems and Output. Rendering them here would either draw a second
 * tab strip inside a tab or hijack the bottom panel's active tab — the same
 * mistake the Browser view avoided by driving the Rust side directly.
 *
 * So this creates ONE pane of its own (`addPane('shell')`), remembers its id,
 * and renders `XtermPane` for it. The pane lives in the store like every other
 * pane, which means it appears in the bottom panel too and is killed by the
 * normal lifecycle when this window closes — nothing private to leak.
 *
 * The first line of defence is `pt list`: a pane id that no longer exists
 * (killed from the bottom panel) is recreated instead of being rendered into a
 * dead xterm that silently swallows every keystroke.
 */

export default function AgentsTerminal() {
  const tr = useT();
  const [paneId, setPaneId] = useState<string | null>(null);
  const [galat, setGalat] = useState('');
  const minta = useRef(false);

  /* The pane metadata, so the header can show its cwd. Read with find rather
     than a mapped selector: zustand compares with `===` and a `.find` that
     returns a fresh array would loop (see AGENTS.md, fase 09). */
  const pane = useTerminal((s) => {
    for (const t of s.terminalTabs) {
      const p = t.panes.find((x) => x.id === paneId);
      if (p) return p;
    }
    return null;
  });
  /* Where a NEW pane starts: this composer's folder if one was picked in the
     right column, otherwise the workspace. */
  const cwdAwal = useAi((s) => s.cwdSurface['agents'] ?? '') || useStore.getState().workspace || undefined;

  useEffect(() => {
    if (minta.current) return;
    minta.current = true;
    let hidup = true;
    void useTerminal
      .getState()
      .addPane('shell', { cwd: cwdAwal })
      .then((id) => {
        if (!hidup) return;
        if (id) setPaneId(id);
        else setGalat(tr('Could not start a terminal in this panel.'));
      })
      .catch((e) => {
        if (hidup) setGalat(String((e as { message?: string })?.message ?? e));
      });
    return () => {
      hidup = false;
    };
    /* Once per mount: the pane outlives a re-render, and re-running this would
       spawn a shell per render. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* React lazily so the bottom panel is not opened just by importing this
     module — `XtermPane` reads the terminal store on mount regardless. */
  const [Xterm, setXterm] = useState<null | React.ComponentType<{ pane: NonNullable<typeof pane> }>>(
    null,
  );
  useEffect(() => {
    void import('../terminal/XtermPane').then((m) => setXterm(() => m.default));
  }, []);

  const cwd = pane?.cwd ?? cwdAwal ?? '';

  return (
    <div className="ag-term" data-testid="ag-terminal">
      <header className="ag-term-head">
        <span className="ag-term-nama">{tr('Terminal')}</span>
        <button
          type="button"
          className="ag-term-tutup"
          data-testid="ag-term-kill"
          title={tr('Kill this terminal')}
          aria-label={tr('Kill this terminal')}
          disabled={!paneId}
          onClick={() => {
            if (!paneId) return;
            void useTerminal.getState().killPane(paneId);
            setPaneId(null);
            void useTerminal
              .getState()
              .addPane('shell', { cwd: cwdAwal })
              .then((id) => id && setPaneId(id));
          }}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
        {/*
          * "Show in panel" — the same pane, in the bottom panel.
          *
          * A pane is a process; this button does not move it, it REVEALS it, so
          * the reader can keep working there without starting a second shell.
          */}
        <button
          type="button"
          className="ag-term-panel"
          data-testid="ag-term-openpanel"
          title={tr('Show in the terminal panel')}
          onClick={() => {
            if (!paneId) return;
            usePanel.getState().focusTab('terminal');
            const st = useTerminal.getState();
            const t = st.terminalTabs.find((x) => x.panes.some((p) => p.id === paneId));
            if (t) {
              st.setActiveTab(t.id);
              st.setActivePane(t.id, paneId);
            }
          }}
        >
          {tr('Panel')}
        </button>
      </header>

      <div className="ag-term-cwd" title={cwd}>
        {cwd}
      </div>

      {galat && (
        <p className="ag-term-galat" role="alert">
          {galat}
        </p>
      )}

      <div className="ag-term-body" data-testid="ag-term-body">
        {paneId && pane && Xterm ? (
          <Xterm pane={pane} />
        ) : (
          <p className="ag-term-kosong">{tr('Starting the shell…')}</p>
        )}
      </div>
    </div>
  );
}
