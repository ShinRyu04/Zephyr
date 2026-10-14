import { useEffect, useRef, useState } from 'react';
import { useAi, type ReasoningEffort } from '../../lib/aiStore';
import { useAgentCustom } from '../../lib/agentCustomStore';
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

/* ── Persona ──────────────────────────────────────────────────────────── */

/*
 * The persona chip: who the agent works as.
 *
 * It used to be the Chat/Agent switch, and it carried a "Mode" section with an
 * Agent row under it. Chat was retired (2026-10-13), so the switch had nothing
 * left to switch between — a picker with one option is furniture. The chip now
 * answers the question that is still open, and the row of personas moved up to
 * be the whole menu: the trigger shows the active persona's mark and name, so
 * "who am I talking to" is readable without opening anything.
 *
 * The run mode (Interactive / Plan / Autopilot) is NOT here: it is its own
 * trigger in the composer's footer, where it was already offered, and two
 * switches for the same choice one row apart read as the same control twice.
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
  const setPersonaAktif = usePersona((s) => s.setAktif);
  const muatPersona = usePersona((s) => s.muat);

  /* The list may not be loaded yet on a cold start, so the trigger falls back
     to the id it knows rather than rendering an empty chip. */
  const aktifPersona = daftarPersona.find((p) => p.id === personaAktif);

  /*
   * Chat is retired, so every run is an agent run and the persona list always
   * applies. Kept as a name rather than a bare `true` (and rather than deleting
   * the gate) because the section below still means "agent runs only", which is
   * what will matter again if a non-agent dispatch ever comes back.
   */
  const personaBerlaku = true;

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
        data-mode="agent"
        data-persona={personaAktif}
        aria-expanded={buka}
        aria-haspopup="menu"
        title={tr('Agent persona - who the agent works as')}
        onClick={() => setBuka((v) => !v)}
      >
        <IkonAgen ik={ikonPersona(personaAktif)} size={12} />
        {aktifPersona?.nama ?? tr('Persona')}
        <span className="pick-caret">▾</span>
      </button>

      {buka && (
        <div className="mode-pop is-naik" data-testid="ai-mode-pop" role="menu">
          {/*
           * Personas — now the whole menu, not a section under a mode.
           *
           * A persona changes HOW the agent works — its identity, working style
           * and standing rules — and with chat retired there is no dispatch left
           * for the list to depend on, so it is always shown. Two headings,
           * because the two sets behave differently: a shipped persona can be
           * picked but never edited, and the user's own can be both. Zephyr ships
           * a single built-in persona (Zeph, the orchestrator), so the "Your own"
           * heading only appears once the user has made a persona of their own -
           * an empty section would read as a broken list. The active one is
           * checked, so the answer to "which am I using" never needs a second
           * look.
           */}
          {personaBerlaku && (
            <>
              {daftarPersona
                .filter((p) => p.bawaan)
                .map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={personaAktif === p.id}
                    className={`mode-item${personaAktif === p.id ? ' is-on' : ''}`}
                    data-testid={`ai-persona-${p.id}`}
                    onClick={() => {
                      void setPersonaAktif(p.id);
                      setBuka(false);
                    }}
                  >
                    <IkonPersonaBaris id={p.id} />
                    <span className="mode-item-teks">
                      <b>{p.nama}</b>
                      <i>{p.deskripsi}</i>
                    </span>
                    {personaAktif === p.id && <span className="pick-check">✓</span>}
                  </button>
                ))}

              {daftarPersona.some((p) => !p.bawaan) && (
                <>
                  <div className="pick-seksi">{tr('Your own')}</div>
                  {daftarPersona
                    .filter((p) => !p.bawaan)
                    .map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        role="menuitemradio"
                        aria-checked={personaAktif === p.id}
                        className={`mode-item${personaAktif === p.id ? ' is-on' : ''}`}
                        data-testid={`ai-persona-${p.id}`}
                        onClick={() => {
                          void setPersonaAktif(p.id);
                          setBuka(false);
                        }}
                      >
                        <IkonPersonaBaris id={p.id} />
                        <span className="mode-item-teks">
                          <b>{p.nama}</b>
                          <i>{p.deskripsi}</i>
                        </span>
                        {personaAktif === p.id && <span className="pick-check">✓</span>}
                      </button>
                    ))}
                </>
              )}

              {/*
               * The row Copilot keeps at the bottom of the same dropdown
               * ("Configure Custom Agents…"): the list above PICKS a persona,
               * this is where the SET of personas is changed. It used to sit
               * under the approval modes, which is the wrong menu - the
               * question "who should the agent be" is asked here, so its
               * answer lives one row below the answers. Agent Customizations
               * holds the cards (create, duplicate, edit, delete), so a reader
               * who wants a new persona lands on the editor, not on a hint.
               */}
              <div className="mode-div" aria-hidden="true" />
              <button
                type="button"
                role="menuitem"
                className="mode-item"
                data-testid="ai-mode-manage"
                onClick={() => {
                  setBuka(false);
                  /* Personas are edited in "Agent Customizations", the modal
                     panel that follows VS Code's own agent surface. It is a
                     surface of its own, not a page buried in Settings, so this
                     row opens the editor instead of navigating away from the
                     chat. */
                  useAgentCustom.getState().buka('agents');
                }}
              >
                <span className="mode-item-teks">
                  <b>{tr('Manage personas & sub-agents')}</b>
                  <i>{tr('Opens the persona editor')}</i>
                </span>
              </button>
            </>
          )}
        </div>
      )}
    </span>
  );
}

/* ── Run mode: Interactive / Plan / Autopilot ─────────────────────────── */

const RUN_MODES: { id: 'interactive' | 'plan' | 'autopilot'; label: string; hint: string }[] = [
  { id: 'interactive', label: 'Interactive', hint: 'Step-by-step collaboration' },
  { id: 'plan', label: 'Plan', hint: 'Plan first, execute when ready' },
  { id: 'autopilot', label: 'Autopilot', hint: 'Works autonomously within permissions' },
];

export function InteractiveMenu() {
  const tr = useT();
  const [buka, setBuka] = useState(false);
  const ref = useRef<HTMLSpanElement | null>(null);
  useTutupOtomatis(ref, () => setBuka(false));

  const runMode = useAi((s) => s.runMode ?? 'interactive');
  const setRunMode = useAi((s) => s.setRunMode);
  const aktif = RUN_MODES.find((m) => m.id === runMode) ?? RUN_MODES[0];

  return (
    <span className="izin-wrap" ref={ref}>
      <button
        className="mode-btn"
        data-testid="ai-run-menu"
        data-run={runMode}
        aria-expanded={buka}
        aria-haspopup="menu"
        title={tr(aktif.hint)}
        onClick={() => setBuka((v) => !v)}
      >
        {runMode === 'plan' ? (
          <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
            <path d="M3 4h7M3 8h7M3 12h4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            <path d="M12.4 10.4l1 1 2-2.2" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : runMode === 'autopilot' ? (
          <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
            <path d="M8.6 1.8 3.4 9h3.3l-1.3 5.2L12.4 7H9l1.6-5.2z" fill="currentColor" stroke="none" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
            <path d="M13.6 8.2a5.2 5.2 0 0 1-7.3 4.7l-3.9.9.9-3.8A5.2 5.2 0 1 1 13.6 8.2z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
          </svg>
        )}
        {tr(aktif.label)}
        <span className="pick-caret">▾</span>
      </button>

      {buka && (
        <div className="mode-pop is-naik" data-testid="ai-run-pop" role="menu">
          <div className="pick-seksi">{tr('Run mode')}</div>
          {RUN_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="menuitemradio"
              aria-checked={m.id === runMode}
              className={`mode-item${m.id === runMode ? ' is-on' : ''}`}
              data-testid={`ai-run-${m.id}`}
              onClick={() => {
                setRunMode(m.id);
                setBuka(false);
              }}
            >
              <span className="mode-item-teks">
                <b>{tr(m.label)}</b>
                <i>{tr(m.hint)}</i>
              </span>
              {m.id === runMode && <span className="pick-check">✓</span>}
            </button>
          ))}
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
          <div className="pick-seksi">{tr('Permissions')}</div>
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
