import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import AgentsTitlebar from './AgentsTitlebar';
import AgentsSessions from './AgentsSessions';
import AgentsRight from './AgentsRight';
import { AgentsStarting } from './ui/AgentsStarting';
import { AgentsConversation } from './ui/AgentsConversation';
import { fokusEditorWindow } from '../../lib/agentsWindow';
import { useAi } from '../../lib/aiStore';
import { useT } from '../../lib/i18n';
import '../../styles/agents-window.css';
import '../../styles/agents-chrome.css';

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
  const tr = useT();
  const [kiriBuka, setKiriBuka] = useState(true);
  const [maks, setMaks] = useState(false);

  /*
   * The right panel opens only once there is something to put in it.
   *
   * The reference's starting screen has NO right column: the chat canvas is
   * full width with a single "IDE" chip in its corner. A 700px Changes/Files
   * panel showing "Open a file from Files or Changes to see it here." is
   * 700px of nothing - and it is the single biggest reason the two windows
   * did not look alike.
   *
   * So the column follows the conversation: empty chat = no column, first
   * message = column appears. It stays a real toggle afterwards - `kananPilih`
   * is the reader's own choice and wins as soon as they touch it.
   *
   * Read from `activeIds['agents']`, NOT `activeId`: the latter is the PRIMARY
   * surface's chat, so with a message open in the editor window this window
   * would think its own empty new task already had content and keep the
   * column open. Each surface keeps its own active chat in `activeIds`.
   */
  const jumlahPesan = useAi((s) => {
    const id = s.activeIds['agents'];
    const sesi = id ? s.sessions.find((x) => x.id === id) : null;
    return sesi?.messages.length ?? 0;
  });
  const [kananPilih, setKananPilih] = useState<boolean | null>(null);
  const kananBuka = kananPilih ?? jumlahPesan > 0;
  const setKananBuka = (v: boolean) => setKananPilih(v);

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
  const toggleDetails = () => setKananBuka(!kananBuka);

  /*
   * `Ctrl+Alt+B` — the shortcut the reference prints on its own tooltip
   * ("Expand panel" / "Hide right panel"), and the one VS Code uses for the
   * secondary side bar.
   *
   * Bound HERE, not in `ACTIONS` (shortcuts.ts), for the same reason as
   * Ctrl+Alt+L in `AgentsRight`: that table is the MAIN window's remappable
   * keymap and has no concept of "only in the agents window". A global entry
   * would fire in the editor window, where there is no agents right panel to
   * hide.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || !e.altKey || e.shiftKey || e.key.toLowerCase() !== 'b') return;
      e.preventDefault();
      setKananPilih(!kananBuka);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [kananBuka]);

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
                {/*
                  * The "IDE" chip, top-right of the chat canvas.
                  *
                  * The reference puts it there instead of a right panel: with
                  * no work in progress there is nothing for a Changes/Files
                  * column to show, so the column would be an empty 700px of
                  * grey. What the reader actually wants at that moment is a
                  * way back to the editor - hence one small button, not a
                  * whole panel.
                  *
                  * It calls the same function the menubar's "Open in IDE"
                  * uses, so there is no second code path to keep in sync.
                  */}
                <button
                  className="ag-ide-chip"
                  data-testid="ag-ide-chip"
                  title={tr('Open this workspace in the editor window')}
                  onClick={() => void fokusEditorWindow()}
                >
                  {tr('IDE')}
                  <svg viewBox="0 0 16 16" aria-hidden="true" className="ag-ide-chip-ic">
                    <path d="M6 3.5h6.5V10" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M12.2 3.8L6.4 9.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                  </svg>
                </button>
                <Suspense fallback={null}>
                  {/*
                    * The rebuilt chrome, replacing the shared `AiHost` here.
                    *
                    * `AiHost`/`AiPanel` is one component serving three surfaces
                    * (editor right column, editor tab, pop-out) and is over 2600
                    * lines. Patching its JSX in place for this window's geometry
                    * is what broke it repeatedly, and every break took the
                    * editor's right column down with it.
                    *
                    * So the Agents window now renders its own chrome from the
                    * measured geometry: a centred starting screen (heading,
                    * composer, four category cards) and a conversation view with
                    * a 520px chat card beside a workspace panel. Both are wired
                    * to the same stores — the draft, the send call, the folder
                    * picker — so this is a different SHAPE, not a mock.
                    *
                    * The empty/filled switch is the same `jumlahPesan === 0`
                    * rule the panel used: the panel does not exist until there
                    * is a message, so the canvas is full width beforehand.
                    */}
                  {jumlahPesan > 0 ? (
                    <AgentsConversation composerId="agents" />
                  ) : (
                    <AgentsStarting composerId="agents" />
                  )}
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