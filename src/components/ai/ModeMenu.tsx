import { useEffect, useRef, useState } from 'react';
import { useAi, type ReasoningEffort } from '../../lib/aiStore';
import { bukaPanel } from '../../lib/bukaPanel';
import { useT } from '../../lib/i18n';
import type { ApprovalMode } from '../../lib/types';
import { usePersona } from '../../lib/personaStore';
import { ikonPersona } from '../../lib/subagentIcons';
import { IkonAgen } from './IkonAgen';

/*
 * The persona's mark, shown at the head of its row.
 *
 * A persona list without icons reads as a list of names with no way to tell
 * them apart at a glance - and the same personas already carry a mark in
 * Settings and in the transcript's avatar. Three places, one identity: the menu
 * was the only one showing text alone, which made picking an agent the one
 * moment the agent was invisible.
 *
 * Drawn from the SAME mapping as the Settings card (`ikonPersona`) and with the
 * same 16px stroked geometry, so a persona cannot acquire two different marks
 * depending on where the user happens to be looking. An unknown id falls back
 * to the generic star, which is what a persona written by an older version
 * looks like.
 */
function IkonPersonaBaris({ id }: { id: string }) {
  const ik = ikonPersona(id);
  return (
    <span className="mode-item-ikon" data-ikon={ik.id} aria-hidden="true">
      <IkonAgen ik={ik} size={15} />
    </span>
  );
}

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
 *   ModeMenu  — the persona. This changes WHO the agent works as, and since the
 *               agent is the only dispatch left it is always meaningful.
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
    label: 'Manual Approval',
    hint: 'You confirm important actions',
    kelas: 'is-tanya',
  },
  {
    id: 'work',
    label: 'Auto Approval',
    hint: 'AI reviews actions and asks you when needed',
    kelas: 'is-kerja',
  },
  {
    id: 'auto',
    label: 'Full Access',
    hint: 'Run directly on your computer without approval',
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

/* ── Persona ──────────────────────────────────────────────────────────── */

/*
 * The mode chip: Chat, or Agent.
 *
 * It is the switch the reference product puts in the composer, and it came back
 * because retiring it was the mistake. Chat had been removed on 2026-10-13, so
 * the chip had nothing left to switch between and was repurposed into a persona
 * picker - a picker with one option is furniture. But the two modes are NOT the
 * same thing: Chat answers, Agent reads files and runs tools. A reader who wants
 * a question answered should not have to send it to an agent that will start
 * opening files, and that is exactly what "why is there no chat" meant.
 *
 * Each mode carries its OWN ICON, not a shared "@". The reference product draws
 * a speech bubble for the conversation and a robot for the agent, and the icon
 * is what makes the chip readable at a glance - a text label alone turns it into
 * one more word in a toolbar of words. The "@" it used to show was the persona
 * picker's mark, which no longer describes anything here.
 *
 * The run mode (Interactive / Plan / Autopilot) is GONE from the composer. It
 * was a third switch for a third question, one row from the other two, and the
 * reference has no such control there. The setting still exists and still works
 * - it is set in Chat Settings - but it is no longer a chip beside Send.
 */
export function ModeMenu() {
  const tr = useT();
  const [buka, setBuka] = useState(false);
  const ref = useRef<HTMLSpanElement | null>(null);
  useTutupOtomatis(ref, () => setBuka(false));

  /*
   * Personas live here because they modify the agent's behaviour. `aktif` is
   * read as its own primitive so the selector never returns a fresh object —
   * the same rule the terminal store had to learn.
   */
  const daftarPersona = usePersona((s) => s.daftar);
  const personaAktif = usePersona((s) => s.aktif);
  const muatPersona = usePersona((s) => s.muat);
  /* Which of the two answers the composer is set to. */
  const modeAktif = useAi((s) => s.agentMode ?? 'agent');
  const setAgentMode = useAi((s) => s.setAgentMode);

  /* The list may not be loaded yet on a cold start, so the popup falls back to
     describing the row generically rather than rendering an empty label. */
  const aktifPersona = daftarPersona.find((p) => p.id === personaAktif);

  /*
   * Load the list the first time this menu opens.
   *
   * The store starts empty and only ever filled itself from the Settings page,
   * so a reader who never opened Settings saw a Persona heading with nothing
   * under it — the feature looked broken rather than unloaded. Loading here is
   * cheap (a settings read, once) and makes the menu self-sufficient.
   */
  useEffect(() => {
    if (buka && daftarPersona.length === 0) muatPersona();
    if (daftarPersona.length === 0) muatPersona();
  }, [buka, daftarPersona.length, muatPersona]);

  return (
    <span className="mode-wrap" ref={ref}>
      <button
        className="mode-btn is-agent"
        data-testid="ai-mode-menu"
        data-mode={modeAktif}
        data-persona={personaAktif}
        aria-expanded={buka}
        aria-haspopup="menu"
        title={tr('Who answers: plain chat, or the agent with tools')}
        onClick={() => setBuka((v) => !v)}
      >
        {modeAktif === 'chat' ? (
          /* A speech bubble: this mode answers, it does not act. */
          <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
            <path
              d="M13.6 8.2a5.2 5.2 0 0 1-7.3 4.7l-3.9.9.9-3.8A5.2 5.2 0 1 1 13.6 8.2z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          /* A robot head: this mode has tools and acts on the workspace. */
          <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
            <rect x="3" y="5.4" width="10" height="7.2" rx="2.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
            <path d="M8 3.2v2.2" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            <circle cx="8" cy="2.6" r="1.1" fill="currentColor" stroke="none" />
            <circle cx="6.2" cy="9" r="0.95" fill="currentColor" stroke="none" />
            <circle cx="9.8" cy="9" r="0.95" fill="currentColor" stroke="none" />
          </svg>
        )}
        {tr(modeAktif === 'chat' ? 'Chat' : 'Agent')}
        <span className="pick-caret">▾</span>
      </button>

      {buka && (
        <div className="mode-pop is-naik" data-testid="ai-mode-pop" role="menu">
          {/*
            * Chat or Agent. That is the whole menu.
            *
            * The reference product puts this exact pair in the composer: a
            * plain conversation, or the agent that reads files and runs tools.
            * Everything else that used to live here - the persona catalogue, the
            * run mode, the sub-agent editor - was a SETTINGS question asked at
            * the moment of typing, and it turned a two-answer picker into a
            * scrolling catalogue that covered the transcript it was meant to
            * help with.
            */}
          <div className="pick-seksi">{tr('Mode')}</div>
          <button
            type="button"
            role="menuitemradio"
            aria-checked={modeAktif === 'chat'}
            className={`mode-item${modeAktif === 'chat' ? ' is-on' : ''}`}
            data-testid="ai-mode-chat"
            title={tr('Ask questions and talk - no tools, no file changes')}
            onClick={() => {
              setAgentMode('chat');
              setBuka(false);
            }}
          >
            <span className="mode-item-ikon" aria-hidden="true">
              <svg viewBox="0 0 16 16" width="13" height="13">
                <path
                  d="M13.6 8.2a5.2 5.2 0 0 1-7.3 4.7l-3.9.9.9-3.8A5.2 5.2 0 1 1 13.6 8.2z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className="mode-item-teks">
              <b>{tr('Chat')}</b>
              <i>{tr('Ask questions and talk - no tools, no file changes')}</i>
            </span>
            {modeAktif === 'chat' && <span className="pick-check">✓</span>}
          </button>

          <button
            type="button"
            role="menuitemradio"
            aria-checked={modeAktif === 'agent'}
            className={`mode-item${modeAktif === 'agent' ? ' is-on' : ''}`}
            data-testid="ai-persona-aktif"
            title={aktifPersona?.deskripsi ?? undefined}
            onClick={() => {
              setAgentMode('agent');
              setBuka(false);
            }}
          >
            <IkonPersonaBaris id={personaAktif} />
            <span className="mode-item-teks">
              <b>{tr('Agent')}</b>
              <i>{aktifPersona?.nama ?? tr('Reads files, runs tools, changes code')}</i>
            </span>
            {modeAktif === 'agent' && <span className="pick-check">✓</span>}
          </button>

          <div className="mode-div" aria-hidden="true" />
          <button
            type="button"
            role="menuitem"
            className="mode-item"
            data-testid="ai-mode-manage"
            onClick={() => {
              setBuka(false);
              bukaPanel('agent-custom', 'agents');
            }}
          >
            <span className="mode-item-teks">
              <b>{tr('Create Agent')}</b>
              <i>{tr('Opens the persona editor')}</i>
            </span>
          </button>
</div>
      )}
    </span>
  );
}

/* ── Approval (permissions) ───────────────────────────────────────────── */

export function PermissionMenu() {
  const tr = useT();
  const [buka, setBuka] = useState(false);
  const ref = useRef<HTMLSpanElement | null>(null);
  useTutupOtomatis(ref, () => setBuka(false));

  const mode = useAi((s) => s.approvalMode ?? 'work');
  const setMode = useAi((s) => s.setApprovalMode);
  const approvalAktif = APPROVAL.find((a) => a.id === mode) ?? APPROVAL[2];

  return (
    <span className={`izin-wrap ${approvalAktif.kelas}`} ref={ref}>
      <button
        className="mode-btn"
        data-testid="ai-izin-menu"
        data-approval={mode}
        aria-expanded={buka}
        aria-haspopup="menu"
        title={tr(approvalAktif.hint)}
        onClick={() => setBuka((v) => !v)}
      >
        <span className="pick-dot" aria-hidden="true" />
        {tr(approvalAktif.label)}
        <span className="pick-caret">▾</span>
      </button>

      {buka && (
        <div className="mode-pop is-naik" data-testid="ai-izin-pop" role="menu">
          <div className="pick-seksi">
            {tr('How should Agent actions be approved?')}
          </div>
          {APPROVAL.map((a) => (
            <button
              key={a.id}
              type="button"
              role="menuitemradio"
              aria-checked={a.id === mode}
              className={`mode-item${a.id === mode ? ' is-on' : ''}`}
              data-testid={`ai-approval-${a.id}`}
              onClick={() => {
                setMode(a.id);
                setBuka(false);
              }}
            >
              <span className={`pick-item-dot ${a.kelas}`} aria-hidden="true" />
              <span className="mode-item-teks">
                <b>{tr(a.label)}</b>
                <i>{tr(a.hint)}</i>
              </span>
              {a.id === mode && <span className="pick-check">✓</span>}
            </button>
          ))}

          {/*
           * The "Manage personas & sub-agents" row lived here. It belongs to
           * the persona menu - the one that PICKS a persona, and the one
           * Copilot keeps its equivalent row in - so it moved there.
           */}
        </div>
      )}
    </span>
  );
}

/* ── Reasoning effort ─────────────────────────────────────────────────── */

export function ReasoningMenu() {
  const tr = useT();
  const [buka, setBuka] = useState(false);
  const ref = useRef<HTMLSpanElement | null>(null);
  useTutupOtomatis(ref, () => setBuka(false));

  const effort = useAi((s) => s.reasoningEffort);
  const setEffort = useAi((s) => s.setReasoningEffort);
  const effortAktif = EFFORT.find((e) => e.id === (effort ?? '')) ?? EFFORT[0];

  return (
    <span className="izin-wrap" ref={ref}>
      <button
        className="mode-btn"
        data-testid="ai-effort-menu"
        data-effort={effort ?? ''}
        aria-expanded={buka}
        aria-haspopup="menu"
        title={`${tr('Reasoning')}: ${tr(effortAktif.label)} — ${tr(effortAktif.hint)}`}
        onClick={() => setBuka((v) => !v)}
      >
        <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
          <path
            d="M8 1.8a4.4 4.4 0 0 0-2.6 7.95c.4.3.6.5.6 1V11h4v-.25c0-.5.2-.7.6-1A4.4 4.4 0 0 0 8 1.8z M6 13h4 M6.6 14.4h2.8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {tr(effortAktif.label)}
        <span className="pick-caret">▾</span>
      </button>

      {buka && (
        <div className="mode-pop is-naik" data-testid="ai-effort-pop" role="menu">
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
                setBuka(false);
              }}
            >
              <span className="mode-item-teks">
                <b>{tr(e.label)}</b>
                <i>{tr(e.hint)}</i>
              </span>
              {e.id === (effort ?? '') && <span className="pick-check">✓</span>}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
