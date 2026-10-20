import { useCallback, useRef, useState } from 'react';
import { AgentsIcon } from './AgentsIcon';
import { agMetrics, agSurface } from './tokens';
import { useAi } from '../../../lib/aiStore';
import { useStore } from '../../../lib/store';

/**
 * The rebuilt Agents composer: TWO boxes, stacked with no gap.
 *
 * Box 1 (127px centred / 125px docked) carries what the message IS — the field
 * and, below it, the control row holding attachment, permission, persona, model
 * and send. Box 2 (45px / 42px) carries where the message RUNS: the
 * `Local <folder>` row on a brighter fill, so it reads as its own object.
 *
 * ## Why this is a separate component
 *
 * The shared `AiPanel` serves three surfaces (right column, editor tab, pop-out)
 * and is over 2600 lines. Editing its JSX in place is what broke it repeatedly.
 * This component is written from scratch against the measured geometry and
 * wired to the SAME stores, so the Agents window can use it without the other
 * surfaces inheriting a compromise.
 *
 * ## Everything here is wired
 *
 * The folder row opens the real folder picker, permission/persona/model cycle
 * the real stored settings, attach opens the real file dialog, and send goes
 * through `kirimSekarang` — the same call Enter makes in the shared panel, with
 * this window's composer id so the message lands in THIS conversation.
 */
export function AgentsComposer({
  composerId,
  variant = 'centered',
  lebar,
}: {
  composerId: string;
  variant?: 'centered' | 'docked';
  /** Width override, in px. Omit to use the measured default for `variant`. */
  lebar?: number;
}) {
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = useState(false);

  const draft = useAi((s) => s.draftOf(composerId));
  const setDraftStore = useAi((s) => s.setDraft);
  const kirimSekarang = useAi((s) => s.kirimSekarang);
  const sibuk = useAi((s) => s.agentBusy);

  const workspace = useStore((s) => s.workspace);
  const openFolderDialog = useStore((s) => s.openFolderDialog);
  const recents = useStore((s) => s.recents);
  /*
   * This composer's folder: its OWN override when one was picked, otherwise the
   * workspace. It is NOT written back to the store on mount — an override that
   * is materialised becomes a copy, and then switching the workspace leaves
   * this row pointing at the old folder without saying so.
   */
  const override = useAi((s) => s.cwdSurface[composerId] ?? '');
  const setCwdSurface = useAi((s) => s.setCwdSurface);
  const workspaceEfektif = override || workspace;
  /* The `Local <folder>` row is a CHOOSER, not a second button for the OS
     dialog: recent folders are one click away, and the machine dialog is the
     last row for a folder that has never been opened. */
  const [pilihFolder, setPilihFolder] = useState(false);

  const setDraft = useCallback(
    (v: string) => setDraftStore(v, composerId),
    [setDraftStore, composerId],
  );

  const docked = variant === 'docked';
  /*
   * `lebar` overrides the measured width. The docked composer was sized for the
   * 520px chat CARD (486px inside its two 16px insets); placed in a narrow right
   * column or in Side Chat it must take the room it is given, or it hangs over
   * the edge with its send button outside the panel.
   */
  const width = lebar ?? (docked ? agMetrics.chatComposerWidth : agMetrics.composerWidth);
  const boxHeight = docked ? agMetrics.chatBoxHeight : agMetrics.boxHeight;
  const fieldHeight = docked ? agMetrics.chatFieldHeight : agMetrics.fieldHeight;
  const folderBoxHeight = docked ? agMetrics.chatFolderBoxHeight : agMetrics.folderBoxHeight;

  const folderName = workspaceEfektif
    ? workspaceEfektif.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || workspaceEfektif
    : null;
  const canSend = draft.trim().length > 0 && !sibuk;

  const send = () => {
    if (!canSend) return;
    void kirimSekarang(draft, undefined, composerId);
  };

  /*
   * Enter sends; Shift+Enter breaks the line — but NOT while a picker is open.
   *
   * The field offers a picker for both sigils: `@` for a file/folder and `/`
   * for a command. While one is open, Enter belongs to that list — it picks
   * the highlighted row and the message has NOT been written yet. Sending on
   * that same Enter sent a half-typed `@src` or a bare `/`, so the reader
   * pressed a key to choose a file and got their draft fired instead.
   *
   * The picker reports itself through `composerPickerOpen`, the same counter
   * the shared panel uses, so both composers agree on what "a list is open"
   * means. IME composition is excluded too: Enter there confirms the
   * candidate, not the message.
   */
  const sendKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
    if (useAi.getState().pickerOpen > 0) return;
    e.preventDefault();
    send();
  };

  return (
    <div
      className={`agx-composer agx-composer-${variant}`}
      data-testid="agx-composer"
      style={{ width }}
    >
      {/* ── Box 1: field + control row ─────────────────────────────────── */}
      <div
        className={`agx-box1${focused ? ' is-focused' : ''}`}
        data-testid="agx-box1"
        style={{ height: boxHeight }}
      >
        <textarea
          ref={fieldRef}
          className="agx-field"
          data-testid="agx-field"
          placeholder={sibuk ? 'Agent is working…' : 'Describe a task for the agent…'}
          value={draft}
          spellCheck={false}
          aria-label="Message for the agent"
          style={{ height: fieldHeight }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={sendKey}
        />

        <div
          className="agx-controls"
          data-testid="agx-controls"
          style={{ height: agMetrics.controlRowHeight }}
        >
          <button
            type="button"
            className="agx-icon-btn"
            data-testid="agx-attach"
            title="Add a file"
            aria-label="Add a file"
            onClick={() => {
              setDraft(`${draft}${draft ? ' ' : ''}@`);
              fieldRef.current?.focus();
            }}
          >
            <AgentsIcon name="plus" size={16} />
          </button>

          {/* Permission, persona and model are the real pickers the panel
              already owns; they open in place rather than duplicating state. */}
          <button
            type="button"
            className="agx-chip"
            data-testid="agx-permission"
            title="How agent actions are approved"
            onClick={() => window.dispatchEvent(new CustomEvent('zephyr-open-chat-settings', { detail: 'cset-approval' }))}
          >
            <span>Approval</span>
            <AgentsIcon name="chevron" size={11} />
          </button>

          <span className="agx-spacer" aria-hidden="true" />

          <button
            type="button"
            className="agx-chip"
            data-testid="agx-persona"
            title="Which agent answers"
            onClick={() => window.dispatchEvent(new CustomEvent('zephyr-open-chat-settings', { detail: 'cset-agents' }))}
          >
            <span className="agx-at">@</span>
            <span>Agent</span>
            <AgentsIcon name="chevron" size={11} />
          </button>

          <button
            type="button"
            className="agx-chip"
            data-testid="agx-model"
            title="Which model answers"
            onClick={() => window.dispatchEvent(new CustomEvent('zephyr-open-chat-settings', { detail: 'cset-models' }))}
          >
            <span>Model</span>
            <AgentsIcon name="chevron" size={11} />
          </button>

          <button
            type="button"
            className="agx-send"
            data-testid="agx-send"
            title="Run"
            aria-label="Run"
            disabled={!canSend}
            onClick={send}
          >
            <AgentsIcon name="send" size={15} />
          </button>
        </div>
      </div>

      {/* ── Box 2: `Local <folder>` ─────────────────────────────────────── */}
      <div
        className="agx-box2"
        data-testid="agx-box2"
        style={{ height: folderBoxHeight, background: agSurface.composerBox }}
      >
        <span className="agx-local-label">Local</span>
        <button
          type="button"
          className="agx-folder"
          data-testid="agx-folder"
          title={workspaceEfektif ?? 'Choose a folder'}
          aria-expanded={pilihFolder}
          onClick={() => setPilihFolder((v) => !v)}
        >
          {folderName ?? 'No folder'}
          <AgentsIcon name="chevron" size={10} />
        </button>
        {pilihFolder && (
          <>
            {/* Clicking anywhere else closes it — a popup that outlives the
                click that left it is the "stuck" kind of menu. */}
            <span className="agx-folder-tutup" onClick={() => setPilihFolder(false)} />
            <div className="agx-folder-menu" role="menu" data-testid="agx-folder-menu">
              {recents.slice(0, 8).map((r) => {
                const nama = r.path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || r.path;
                const aktif = workspaceEfektif?.toLowerCase() === r.path.toLowerCase();
                return (
                  <button
                    key={r.path}
                    role="menuitem"
                    className={`agx-folder-item${aktif ? ' is-aktif' : ''}`}
                    data-testid={`agx-folder-recent-${nama}`}
                    title={r.path}
                    onClick={() => {
                      setPilihFolder(false);
                      /* Sets THIS composer's folder only — the editor window is
                         not moved to another project by picking a folder here. */
                      if (!aktif) setCwdSurface(composerId, r.path);
                    }}
                  >
                    <AgentsIcon name="folder" size={13} />
                    <span className="agx-folder-nama">{nama}</span>
                    <span className="agx-folder-jalur">{r.path}</span>
                  </button>
                );
              })}
              {recents.length === 0 && (
                <p className="agx-folder-kosong">No recent folders yet</p>
              )}
              {override && (
                <button
                  role="menuitem"
                  className="agx-folder-item"
                  data-testid="agx-folder-workspace"
                  title={workspace ?? ''}
                  onClick={() => {
                    setPilihFolder(false);
                    setCwdSurface(composerId, '');
                  }}
                >
                  <AgentsIcon name="folder" size={13} />
                  <span className="agx-folder-nama">Use the workspace folder</span>
                </button>
              )}
              <button
                role="menuitem"
                className="agx-folder-item agx-folder-pilih"
                data-testid="agx-folder-open"
                onClick={() => {
                  setPilihFolder(false);
                  void openFolderDialog();
                }}
              >
                <AgentsIcon name="plus" size={13} />
                <span className="agx-folder-nama">Open Folder…</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
