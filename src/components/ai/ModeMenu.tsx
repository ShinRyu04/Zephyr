import { useEffect, useRef, useState } from 'react';
import { useAi, type ReasoningEffort } from '../../lib/aiStore';
import { useStore } from '../../lib/store';
import { useSettingsUi } from '../../lib/settingsStore';
import { useT } from '../../lib/i18n';
import type { ApprovalMode } from '../../lib/types';

/*
 * Two menus for how a message is dispatched.
 *
 * They used to be three separate controls on the composer row (a two-button
 * mode switch, an approval popover, an effort popover). At the side column's
 * width they could not share the row with the model chip, the attach controls
 * and Send, so the row wrapped into a pile of chips.
 *
 * They are now two triggers, split by what they decide:
 *
 *   ModeMenu  — chat vs agent. This changes what the turn IS.
 *   IzinMenu  — approval level and reasoning effort. These change HOW the turn
 *               runs, and they only mean anything in agent mode, so they live
 *               behind one trigger of their own.
 *
 * Both popovers open UPWARD. The composer is pinned to the bottom of the panel,
 * so a menu that dropped down would open past the panel edge and be cut off —
 * which is exactly what happened with the old popovers.
 */

const APPROVAL: { id: ApprovalMode; label: string; hint: string; kelas: string }[] = [
  {
    id: 'readonly',
    label: 'Read-only',
    hint: 'Only reads - changes nothing',
    kelas: 'is-aman',
  },
  {
    id: 'ask',
    label: 'Ask',
    hint: 'Asks before changing anything',
    kelas: 'is-tanya',
  },
  {
    id: 'work',
    label: 'Work',
    hint: 'Safe commands run, risky ones ask',
    kelas: 'is-kerja',
  },
  {
    id: 'auto',
    label: 'Auto',
    hint: 'Runs everything without asking',
    kelas: 'is-auto',
  },
];

const EFFORT: { id: string; label: string; hint: string }[] = [
  { id: '', label: 'Auto', hint: 'Provider default' },
  { id: 'minimal', label: 'Minimal', hint: 'Fastest' },
  { id: 'low', label: 'Low', hint: 'Brief' },
  { id: 'medium', label: 'Medium', hint: 'Balanced' },
  { id: 'high', label: 'High', hint: 'Harder tasks' },
  { id: 'ultra', label: 'Ultra', hint: 'Maximum - slowest' },
];

/** Closes the menu on an outside click or Escape. */
function useTutupOtomatis(ref: React.RefObject<HTMLElement | null>, tutup: () => void) {
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) tutup();
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') tutup();
    };
    document.addEventListener('mousedown', h);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', h);
      document.removeEventListener('keydown', esc);
    };
  });
}

/* ── Chat / Agent ─────────────────────────────────────────────────────── */

export function ModeMenu() {
  const tr = useT();
  const [buka, setBuka] = useState(false);
  const ref = useRef<HTMLSpanElement | null>(null);
  useTutupOtomatis(ref, () => setBuka(false));

  const agentMode = useAi((s) => s.agentMode ?? 'chat');
  const setAgentMode = useAi((s) => s.setAgentMode);
  const isAgent = agentMode === 'agent';

  return (
    <span className="mode-wrap" ref={ref}>
      <button
        className={`mode-btn${isAgent ? ' is-agent' : ''}`}
        data-testid="ai-mode-menu"
        data-mode={agentMode}
        aria-expanded={buka}
        aria-haspopup="menu"
        title={
          isAgent
            ? tr('Agent mode - the AI reads files and runs commands')
            : tr('Chat mode - ordinary Q&A, no tools')
        }
        onClick={() => setBuka((v) => !v)}
      >
        {isAgent ? (
          <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
            <path
              d="M8 1.8l1.6 3.4 3.6.5-2.6 2.6.6 3.7L8 10.3l-3.2 1.7.6-3.7L2.8 5.7l3.6-.5L8 1.8z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
            <path
              d="M13.6 8.2a5.2 5.2 0 0 1-7.3 4.7l-3.9.9.9-3.8A5.2 5.2 0 1 1 13.6 8.2z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinejoin="round"
            />
          </svg>
        )}
        {isAgent ? tr('Agent') : tr('Chat')}
        <span className="pick-caret">▾</span>
      </button>

      {buka && (
        <div className="mode-pop is-naik" data-testid="ai-mode-pop" role="menu">
          <div className="pick-seksi">{tr('Mode')}</div>
          <button
            type="button"
            role="menuitemradio"
            aria-checked={!isAgent}
            className={`mode-item${!isAgent ? ' is-on' : ''}`}
            data-testid="ai-mode-chat-item"
            onClick={() => {
              setAgentMode('chat');
              setBuka(false);
            }}
          >
            <span className="mode-item-teks">
              <b>{tr('Chat')}</b>
              <i>{tr('Ordinary Q&A. No tools, no project context.')}</i>
            </span>
            {!isAgent && <span className="pick-check">✓</span>}
          </button>
          <button
            type="button"
            role="menuitemradio"
            aria-checked={isAgent}
            className={`mode-item${isAgent ? ' is-on' : ''}`}
            data-testid="ai-mode-agent-item"
            onClick={() => {
              setAgentMode('agent');
              setBuka(false);
            }}
          >
            <span className="mode-item-teks">
              <b>{tr('Agent')}</b>
              <i>{tr('Reads files, runs commands, works until done.')}</i>
            </span>
            {isAgent && <span className="pick-check">✓</span>}
          </button>
        </div>
      )}
    </span>
  );
}

/* ── Approval + reasoning effort ──────────────────────────────────────── */

export function IzinMenu() {
  const tr = useT();
  const [buka, setBuka] = useState(false);
  const ref = useRef<HTMLSpanElement | null>(null);
  useTutupOtomatis(ref, () => setBuka(false));

  const mode = useAi((s) => s.approvalMode ?? 'work');
  const setMode = useAi((s) => s.setApprovalMode);
  const effort = useAi((s) => s.reasoningEffort);
  const setEffort = useAi((s) => s.setReasoningEffort);

  const approvalAktif = APPROVAL.find((a) => a.id === mode) ?? APPROVAL[2];
  const effortAktif = EFFORT.find((e) => e.id === (effort ?? '')) ?? EFFORT[0];

  /* The trigger shows the approval level, and its dot carries the level's
     colour. Effort is shown as a suffix so both settings stay visible without
     a second control on the row. */
  return (
    <span className={`izin-wrap ${approvalAktif.kelas}`} ref={ref}>
      <button
        className="mode-btn"
        data-testid="ai-izin-menu"
        data-approval={mode}
        data-effort={effort ?? ''}
        aria-expanded={buka}
        aria-haspopup="menu"
        title={`${tr(approvalAktif.hint)} · ${tr('Reasoning')}: ${tr(effortAktif.label)}`}
        onClick={() => setBuka((v) => !v)}
      >
        <span className="pick-dot" aria-hidden="true" />
        {tr(approvalAktif.label)}
        {/* Reasoning as a suffix so the trigger answers both questions the menu
            holds — the level alone left it unclear what the reasoning was set
            to without opening the menu. */}
        <span className="izin-effort">{tr(effortAktif.label)}</span>
        <span className="pick-caret">▾</span>
      </button>

      {buka && (
        <div className="mode-pop is-naik" data-testid="ai-izin-pop" role="menu">
          {/*
           * Permissions always shows. It used to be hidden in chat mode on the
           * theory that there is nothing to approve there — but that made the
           * menu look like it had lost a section, and the level still applies
           * the moment the user switches to Agent. Better to show it and let the
           * hint say what it does.
           */}
          <div className="pick-seksi">{tr('Permissions')}</div>
          {APPROVAL.map((a) => (
            <button
              key={a.id}
              type="button"
              role="menuitemradio"
              aria-checked={a.id === mode}
              className={`mode-item${a.id === mode ? ' is-on' : ''}`}
              data-testid={`ai-approval-${a.id}`}
              onClick={() => setMode(a.id)}
            >
              <span className={`pick-item-dot ${a.kelas}`} aria-hidden="true" />
              <span className="mode-item-teks">
                <b>{tr(a.label)}</b>
                <i>{tr(a.hint)}</i>
              </span>
              {a.id === mode && <span className="pick-check">✓</span>}
            </button>
          ))}

          <div className="mode-div" aria-hidden="true" />

          <div className="pick-seksi">{tr('Reasoning')}</div>
          {EFFORT.map((e) => (
            <button
              key={e.id || 'auto'}
              type="button"
              role="menuitemradio"
              aria-checked={e.id === (effort ?? '')}
              className={`mode-item${e.id === (effort ?? '') ? ' is-on' : ''}`}
              data-testid={`ai-effort-${e.id || 'auto'}`}
              onClick={() => {
                // The store models "no explicit effort" as null; '' is the
                // option id used for display only.
                setEffort(e.id === '' ? null : (e.id as ReasoningEffort));
              }}
            >
              <span className="mode-item-teks">
                <b>{tr(e.label)}</b>
                <i>{tr(e.hint)}</i>
              </span>
              {e.id === (effort ?? '') && <span className="pick-check">✓</span>}
            </button>
          ))}

          <div className="mode-div" aria-hidden="true" />
          <button
            type="button"
            role="menuitem"
            className="mode-item"
            data-testid="ai-mode-manage"
            onClick={() => {
              setBuka(false);
              useStore.getState().setSettingsOpen(true);
              useSettingsUi.getState().setSection('agents');
            }}
          >
            <span className="mode-item-teks">
              <b>{tr('Manage personas & sub-agents')}</b>
              <i>{tr('Opens Settings → Agents')}</i>
            </span>
          </button>
        </div>
      )}
    </span>
  );
}
