import { useEffect, useRef, useState } from 'react';
import { useAi } from '../../lib/aiStore';
import { useT } from '../../lib/i18n';
import { AgentsComposer } from './ui/AgentsComposer';

/**
 * Side Chat — a second conversation that shares the main chat's CONTEXT.
 *
 * ## Why it needs its own surface key
 *
 * Every composer already owns a chat through `activeIds[composerId]`, so a Side
 * Chat is just one more key. What makes it "side" rather than "new" is two
 * extra rules:
 *
 *   1. **It is created once, on first open, and kept.** Closing the tab and
 *      opening it again returns to the same conversation instead of throwing
 *      the answer away.
 *   2. **It never takes the main chat.** Its chat is bound with `bindSurface`,
 *      which writes only this surface's key — `selectChat` would move nothing
 *      else either, but `bindSurface` says so without pretending a reader
 *      picked something.
 *
 * ## What "shares the context" means here, precisely
 *
 * The SIDE chat inherits the main chat's WORKSPACE, not its transcript. Sending
 * the main transcript as a hidden preamble would make every side question pay
 * for the whole conversation and would put words in the agent's mouth that the
 * reader never saw in this transcript. Asking "about what we are doing" is what
 * the `@` picker is for, and the composer below is the same real one.
 *
 * Independent also means independent RUN state: `kirimSekarang` is keyed by
 * this composer id, so a side question can be asked while the main task is
 * working — that is the entire point of it not interrupting anything.
 */

export default function AgentsSideChat({ composerId }: { composerId: string }) {
  const tr = useT();
  const ada = useAi((s) => (s.activeIds[composerId] ?? null) !== null);
  const pesan = useAi((s) => {
    const id = s.activeIds[composerId] ?? null;
    return s.sessions.find((x) => x.id === id)?.messages ?? [];
  });
  const [siap, setSiap] = useState(false);
  const dicek = useRef(false);

  /*
   * Create the side conversation the first time the tab is shown.
   *
   * Done here rather than when the card was clicked so the chat belongs to the
   * TAB: a card that creates a chat and then fails to open would leave an empty
   * conversation behind every time it is pressed.
   */
  useEffect(() => {
    if (dicek.current) return;
    dicek.current = true;
    const st = useAi.getState();
    if (st.activeIds[composerId]) {
      setSiap(true);
      return;
    }
    const id = st.newChat('');
    /* `newChat('')` targets the PRIMARY surface, so the id comes back here and
       is bound to this one — the primary's own chat is untouched. */
    useAi.getState().bindSurface(composerId, id);
    setSiap(true);
  }, [composerId]);

  return (
    <div className="ag-side" data-testid="ag-sidechat">
      <header className="ag-side-head">
        <span>{tr('Side Chat')}</span>
        <span className="ag-side-tag">{tr('Independent of the main task')}</span>
      </header>

      <div className="ag-side-transcript" data-testid="ag-side-transcript">
        {!siap || (!ada && pesan.length === 0) ? (
          <p className="ag-side-kosong">{tr('Starting…')}</p>
        ) : pesan.length === 0 ? (
          <p className="ag-side-kosong">
            {tr('Ask something without interrupting the task. This chat keeps its own history.')}
          </p>
        ) : (
          pesan.map((m) => (
            <article key={m.id} className={`ag-side-msg ag-side-msg-${m.role}`}>
              <span className="ag-side-peran">{m.role === 'user' ? tr('You') : tr('Assistant')}</span>
              <p className="ag-side-teks">{m.content}</p>
            </article>
          ))
        )}
      </div>

      <div className="ag-side-composer">
        <AgentsComposer composerId={composerId} variant="docked" lebar={366} />
      </div>
    </div>
  );
}
