import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import AgentsTitlebar from './AgentsTitlebar';
import AgentsSessions from './AgentsSessions';
import AgentsRight from './AgentsRight';
import '../../styles/agents-window.css';

const AiHost = lazy(() => import('../ai/AiHost'));

/**
 * The Agents workspace — a MENUBAR over a row of rounded PANEL CARDS.
 *
 * ## The shape, and where each number comes from
 *
 * Measured from the reference layout at 1536x912, not invented:
 *
 *   menubar            56px tall, full width
 *   left column       300px, NO card of its own — it sits directly on the
 *                     window background
 *   sash                4px between every panel
 *   chat panel        520px wide, radius 16px, background #171717
 *   right panel       takes the rest, radius 16px, same background
 *   window background  #262626 — the panels are DARKER than the frame
 *
 * ## Why cards instead of three flat columns
 *
 * The previous layout was three columns divided by 1px rules, which is the VS
 * Code shape. The reference is the other family: each pane is a card floating on
 * a slightly lighter frame, so the eye groups "this is one surface" before it
 * reads any of the content. That difference is most of what makes the two
 * screenshots look unrelated, so it is the first thing rebuilt here.
 *
 * ## Why the sashes are real
 *
 * A 4px gap that cannot be dragged is decoration. These are drag handles: the
 * reader resizes the session list and the chat, and the sizes persist for the
 * session. The reference has the same handles in the same places.
 */

/** Width the chat panel starts at — measured, and the reference's default. */
const CHAT_AWAL = 520;
/** Bounds: below 360 the composer wraps badly, above 900 it starves the right. */
const CHAT_MIN = 360;
const CHAT_MAKS = 900;

/** The left column's own bounds. */
const KIRI_AWAL = 300;
const KIRI_MIN = 220;
const KIRI_MAKS = 460;

export default function AgentsLayout() {
  const [kiriBuka, setKiriBuka] = useState(true);
  const [kananBuka, setKananBuka] = useState(true);
  const [maks, setMaks] = useState(false);

  /*
   * Panel sizes live here, not in CSS, because a drag has to write them.
   *
   * Kept in component state rather than a store: they describe this window's
   * current layout, and the window is the only thing that reads them. Persisting
   * them would make a maximised-then-restored window open at a size that belongs
   * to a different screen.
   */
  const [lebarKiri, setLebarKiri] = useState(KIRI_AWAL);
  const [lebarChat, setLebarChat] = useState(CHAT_AWAL);

  /*
   * Which sash is being dragged, and where the pointer started.
   *
   * One piece of state for both sashes: only one can be dragged at a time, and a
   * shared shape means the move handler is one function instead of two copies.
   */
  const seret = useRef<{ jenis: 'kiri' | 'chat'; x: number; lebar: number } | null>(null);

  const mulaiSeret = useCallback(
    (jenis: 'kiri' | 'chat', e: React.PointerEvent) => {
      e.preventDefault();
      seret.current = {
        jenis,
        x: e.clientX,
        lebar: jenis === 'kiri' ? lebarKiri : lebarChat,
      };
      /* Pointer capture keeps the drag alive when the cursor crosses the panel
         being resized — without it the drag dies the moment it leaves the 4px
         handle, which is exactly what a reader does when they overshoot. */
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [lebarKiri, lebarChat],
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const s = seret.current;
      if (!s) return;
      const delta = e.clientX - s.x;
      if (s.jenis === 'kiri') {
        setLebarKiri(Math.max(KIRI_MIN, Math.min(KIRI_MAKS, s.lebar + delta)));
      } else {
        setLebarChat(Math.max(CHAT_MIN, Math.min(CHAT_MAKS, s.lebar + delta)));
      }
    };
    const onUp = () => {
      seret.current = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, []);

  /* Toggle Details (☰): hides the RIGHT panel — Files, Changes, Search,
     Browser — while the chat STAYS and grows into the freed space. */
  const toggleDetails = () => setKananBuka((v) => !v);

  return (
    <div className={`ag-root${maks ? ' is-maks' : ''}`} data-testid="agents-layout">
      <AgentsTitlebar
        kiriBuka={kiriBuka}
        kananBuka={kananBuka}
        onToggleKiri={() => setKiriBuka((v) => !v)}
        onToggleKanan={toggleDetails}
      />

      <div
        className={`ag-body${kiriBuka && !maks ? '' : ' no-left'}${kananBuka ? '' : ' no-right'}${maks ? ' is-maks' : ''}`}
      >
        {/*
          * The left column is NOT a card: it sits on the window background.
          *
          * That is the reference's arrangement, and it is what makes the two
          * cards beside it read as surfaces rather than as a continuation of the
          * frame. Giving it a card of its own would make three equal boxes and
          * lose the hierarchy.
          */}
        {kiriBuka && !maks && (
          <>
            <aside
              className="ag-col ag-left"
              data-testid="agents-left"
              aria-label="Sessions"
              style={{ width: lebarKiri }}
            >
              <AgentsSessions />
            </aside>
            <div
              className="ag-sash ag-sash-kiri"
              data-testid="ag-sash-left"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize sessions column"
              onPointerDown={(e) => mulaiSeret('kiri', e)}
            />
          </>
        )}

        {/*
          * The panel row. The chat is a card with a FIXED starting width (the
          * reference's 520px) that the reader can drag; the right panel takes
          * whatever is left. Under `maks` the chat does not render at all — the
          * whole point is a full-window file/diff surface.
          */}
        <div className="ag-panels">
          {!maks && (
            <>
              <main
                className={`ag-col ag-center${kananBuka ? '' : ' is-lebar'}`}
                aria-label="Chat"
                style={kananBuka ? { width: lebarChat, flex: '0 0 auto' } : { flex: '1 1 0', minWidth: 0 }}
              >
                <Suspense fallback={null}>
                  {/*
                    * `composerId="agents"` — this window gets its OWN composer.
                    *
                    * Without it the panel fell back to `''`, the primary
                    * surface's key, so the Agents window and the main window
                    * shared one draft, one active chat and one run state.
                    */}
                  <AiHost composerId="agents" />
                </Suspense>
              </main>
              {kananBuka && (
                <div
                  className="ag-sash ag-sash-chat"
                  data-testid="ag-sash-chat"
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize chat panel"
                  onPointerDown={(e) => mulaiSeret('chat', e)}
                />
              )}
            </>
          )}

          {kananBuka && (
            <aside
              className={`ag-col ag-right${maks ? ' is-maks' : ''}`}
              data-testid="agents-right"
              aria-label="Changes and files"
            >
              <AgentsRight maks={maks} onToggleMaks={() => setMaks((v) => !v)} />
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}