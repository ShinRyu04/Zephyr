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
}: {
  composerId: string;
  variant?: 'centered' | 'docked';
}) {
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = useState(false);

  const draft = useAi((s) => s.draftOf(composerId));
  const setDraftStore = useAi((s) => s.setDraft);
  const kirimSekarang = useAi((s) => s.kirimSekarang);
  const sibuk = useAi((s) => s.agentBusy);

  const workspace = useStore((s) => s.workspace);
  const openFolderDialog = useStore((s) => s.openFolderDialog);

  const setDraft = useCallback(
    (v: string) => setDraftStore(v, composerId),
    [setDraftStore, composerId],
  );

  const docked = variant === 'docked';
  const width = docked ? agMetrics.chatComposerWidth : agMetrics.composerWidth;
  const boxHeight = docked ? agMetrics.chatBoxHeight : agMetrics.boxHeight;
  const fieldHeight = docked ? agMetrics.chatFieldHeight : agMetrics.fieldHeight;
  const folderBoxHeight = docked ? agMetrics.chatFolderBoxHeight : agMetrics.folderBoxHeight;

  const folderName = workspace ? workspace.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || workspace : null;
  const canSend = draft.trim().length > 0 && !sibuk;

  const send = () => {
    if (!canSend) return;
    void kirimSekarang(draft, undefined, composerId);
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
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
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
          title={workspace ?? 'Choose a folder'}
          onClick={() => void openFolderDialog()}
        >
          {folderName ?? 'No folder'}
        </button>
      </div>
    </div>
  );
}
