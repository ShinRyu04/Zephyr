import { useEffect, useMemo, useRef, useState } from 'react';
import { useAi, type ReasoningEffort } from '../../lib/aiStore';
import { bukaPanel } from '../../lib/bukaPanel';
import { useT } from '../../lib/i18n';
import type { ApprovalMode } from '../../lib/types';
import { usePersona } from '../../lib/personaStore';
import { useStore } from '../../lib/store';
import { useAgentCustom } from '../../lib/agentCustom';
import AgenAvatar from './AgenAvatar';

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

/*
 * The composer's four permission rows (composer 6/7). `readonly` stays a REAL
 * mode behind the scenes (Chat Settings still offers it, the store still
 * honours it) but it is not one of the four answers shown while typing - the
 * reference product shows Manual / Auto / Full Access / Custom, where Custom
 * is not a mode at all but a jump into the tool-rule editor.
 */
const APPROVAL: { id: ApprovalMode; label: string; hint: string; kelas: string }[] = [
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
export function ModeMenu({ composerId = '' }: { composerId?: string } = {}) {
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

  /* The agent the reader picked: '' / 'agent' / 'chat' / a custom agent id. */
  const agentAktif = useStore((s) => s.settings.agents?.agentAktif ?? '');
  const setAgentAktif = useAi((s) => s.setAgentAktif);
  const agentKustom = useAgentCustom((s) => s.daftar);
  const muatAgent = useAgentCustom((s) => s.muat);
  /*
   * Load the agent list on first open.
   *
   * The store starts empty and was only ever filled by the Agents page in its
   * own window, so the composer showed Chat/Agent and nothing else while the
   * user's agents sat in settings - the picker looked like it had no custom
   * agents rather than not having loaded them.
   */
  useEffect(() => {
    if (agentKustom.length === 0) muatAgent();
  }, [agentKustom.length, muatAgent]);
  const daftarAgentKustom = useMemo(
    () => agentKustom.filter((a) => a.aktif && a.nama.trim()),
    [agentKustom],
  );
  /*
   * The custom agent behind the chip, if that is what is selected.
   *
   * The chip used to say "Agent" for every non-chat pick, so a reader who chose
   * their own agent had no way to tell from the composer which one was live -
   * the one place the choice has to be visible.
   */
  const agentKustomAktifChip = daftarAgentKustom.find((a) => a.id === agentAktif) ?? null;
  /*
   * The id the menu highlights.
   *
   * `modeAktif` alone cannot express the choice: `setAgentAktif` maps every
   * custom agent to mode 'agent', so highlighting from the mode would keep the
   * built-in "Agent" row lit while a custom one is actually answering. The
   * stored id is the source of truth; it falls back through the legacy empty
   * value to whichever built-in the mode names.
   */
  /*
   * Experts Mode: pilihan bawaan ketiga. `agentAktif === 'experts'` adalah
   * id khusus — setAgentAktif memetakannya ke agentMode 'agent' (jadi semua
   * gerbang izin tetap jalan), dan cabang kirim di aiStore meneruskannya ke
   * sendExperts alih-alih sendAgent.
   */
  const expertsAktif = agentAktif === 'experts';
  const idAktif = agentAktif || (modeAktif === 'chat' ? 'chat' : 'agent');

  /*
   * Ganti mode = sesi BARU, dua arah (Qoder). Menekan mode yang sudah aktif
   * hanya menutup menu — bukan memulai percakapan kosong yang tidak diminta.
   * Sesi lama tetap utuh dan mengingat mode-nya (dipulihkan oleh selectChat).
   */
  const gantiMode = (id: 'chat' | 'agent' | 'experts') => {
    const sudah = id === 'experts' ? expertsAktif : idAktif === id;
    setAgentAktif(id);
    if (!sudah) useAi.getState().newChat(composerId);
    setBuka(false);
  };

  /* The list may not be loaded yet on a cold start, so the popup falls back to
     describing the row generically rather than rendering an empty label. */

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
        ) : expertsAktif ? (
          /* Dua figur: kerja tim, bukan satu agen. */
          <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
            <circle cx="5.6" cy="6" r="2.1" fill="none" stroke="currentColor" strokeWidth="1.3" />
            <path d="M1.8 13.4c0-2.1 1.7-3.4 3.8-3.4s3.8 1.3 3.8 3.4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            <circle cx="11.4" cy="6.6" r="1.7" fill="none" stroke="currentColor" strokeWidth="1.3" />
            <path d="M10.9 9.9c1.9 0 3.3 1.2 3.3 3" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        ) : agentKustomAktifChip ? (
          /* A custom agent's own mark, so the chip names the one that answers. */
          <AgenAvatar agent={agentKustomAktifChip} size={12} />
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
        {expertsAktif
          ? tr('Experts')
          : agentKustomAktifChip
            ? agentKustomAktifChip.nama
            : tr(modeAktif === 'chat' ? 'Chat' : 'Agent')}
        <span className="pick-caret">▾</span>
      </button>

      {buka && (
        <div className="mode-pop is-naik is-trae" data-testid="ai-mode-pop" role="menu">
          {/*
            * The TRAE "Built-In Agents" box (composer 5 reference): a small
            * header, the Chat / Agent pair, then Create Agent. The header is
            * part of the reference design - it was dropped once and came back.
            */}
          <div className="pick-seksi">{tr('Built-In Agents')}</div>
          <button
            type="button"
            role="menuitemradio"
            aria-checked={idAktif === 'chat'}
            className={`mode-item${idAktif === 'chat' ? ' is-on' : ''}`}
            data-testid="ai-mode-chat"
            title={tr('Ask questions and talk - no tools, no file changes')}
            onClick={() => gantiMode('chat')}
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
            </span>
            {idAktif === 'chat' && <span className="pick-check">✓</span>}
          </button>

          <button
            type="button"
            role="menuitemradio"
            aria-checked={idAktif === 'agent'}
            className={`mode-item${idAktif === 'agent' ? ' is-on' : ''}`}
            data-testid="ai-persona-aktif"
            onClick={() => gantiMode('agent')}
          >
            <span className="mode-item-ikon" aria-hidden="true">
              {/* The robot head, as the reference draws the agent. */}
              <svg viewBox="0 0 16 16" width="13" height="13">
                <rect x="3" y="5.4" width="10" height="7.2" rx="2.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
                <path d="M8 3.2v2.2" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                <circle cx="8" cy="2.6" r="1.1" fill="currentColor" stroke="none" />
                <circle cx="6.2" cy="9" r="0.95" fill="currentColor" stroke="none" />
                <circle cx="9.8" cy="9" r="0.95" fill="currentColor" stroke="none" />
              </svg>
            </span>
            <span className="mode-item-teks">
              <b>{tr('Agent')}</b>
            </span>
            {idAktif === 'agent' && <span className="pick-check">✓</span>}
          </button>

          {/*
            * Experts Mode: satu tujuan, tim mengerjakan. Lead menyusun
            * rencana, user meninjau/mengubahnya lalu menekan Start; auto-run
            * tetap tersedia sebagai opsi di Agent Customizations -> Experts.
            */}
          <button
            type="button"
            role="menuitemradio"
            aria-checked={expertsAktif}
            className={`mode-item${expertsAktif ? ' is-on' : ''}`}
            data-testid="ai-mode-experts"
            title={tr('A team of experts: Lead plans, workers run in parallel')}
            onClick={() => gantiMode('experts')}
          >
            <span className="mode-item-ikon" aria-hidden="true">
              <svg viewBox="0 0 16 16" width="13" height="13">
                <circle cx="5.6" cy="6" r="2.1" fill="none" stroke="currentColor" strokeWidth="1.3" />
                <path d="M1.8 13.4c0-2.1 1.7-3.4 3.8-3.4s3.8 1.3 3.8 3.4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                <circle cx="11.4" cy="6.6" r="1.7" fill="none" stroke="currentColor" strokeWidth="1.3" />
                <path d="M10.9 9.9c1.9 0 3.3 1.2 3.3 3" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
            </span>
            <span className="mode-item-teks">
              <b>{tr('Experts')}</b>
            </span>
            {expertsAktif && <span className="pick-check">✓</span>}
          </button>

          {/*
            * The reader's own agents, in the same list as Chat and Agent.
            *
            * Same row shape as the two above on purpose - the reference puts
            * them in one list, and a second section header here would make the
            * composer read like a different feature. A custom agent also sets
            * the run's prompt and tool allowlist (`agentCatalog.ts`), so
            * picking one is a real switch, not a label.
            */}
          {daftarAgentKustom.map((a) => {
            const dipilih = agentAktif === a.id;
            return (
              <button
                key={a.id}
                type="button"
                role="menuitemradio"
                aria-checked={dipilih}
                className={`mode-item${dipilih ? ' is-on' : ''}`}
                data-testid={`ai-agent-${a.id}`}
                title={tr(a.deskripsi)}
                onClick={() => {
                  setAgentAktif(a.id);
                  setBuka(false);
                }}
              >
                <span className="mode-item-ikon" aria-hidden="true">
                  <AgenAvatar agent={a} size={13} />
                </span>
                <span className="mode-item-teks">
                  <b>{a.nama}</b>
                </span>
                {dipilih && <span className="pick-check">✓</span>}
              </button>
            );
          })}

          <div className="mode-div" aria-hidden="true" />
          <button
            type="button"
            role="menuitem"
            className="mode-item"
            data-testid="ai-mode-manage"
            onClick={() => {
              setBuka(false);
              /*
               * One gesture, one result: the editor.
               *
               * This used to open the panel on the Agents SECTION, which lands
               * on the list - so "Create Agent" looked like it only opened
               * Settings, and the reader pressed Create a second time. The
               * `baru` flag rides in the URL (this is another WebView with its
               * own stores), and the page seeds itself straight into the form.
               */
              bukaPanel('agent-custom', 'agents', { baru: true });
            }}
          >
            <span className="mode-item-ikon" aria-hidden="true">
              <svg viewBox="0 0 16 16" width="13" height="13">
                <path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </span>
            <span className="mode-item-teks">
              <b>{tr('Create Agent')}</b>
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
  /* Plan = sumbu runMode, bukan tingkat izin. Tersedia di dua permukaan
     (permintaan user 28 Okt); Custom dihapus dari keduanya. */
  const runMode = useAi((s) => s.runMode);
  const setRunMode = useAi((s) => s.setRunMode);
  const planNyala = runMode === 'plan';
  const approvalAktif = APPROVAL.find((a) => a.id === mode) ?? APPROVAL[2];

  return (
    <>
    {planNyala && (
      <button
        type="button"
        className="ai-plan-chip"
        data-testid="ai-plan-chip"
        title={tr('Matikan plan mode')}
        onClick={() => setRunMode('interactive')}
      >
        <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
          <path d="M8 1.8a4.4 4.4 0 0 0-2.4 8.1c.5.35.8.9.8 1.5v.3h3.2v-.3c0-.6.3-1.15.8-1.5A4.4 4.4 0 0 0 8 1.8z" />
          <path d="M6.6 14h2.8M7.1 15.3h1.8" />
        </svg>
        Plan
      </button>
    )}
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
        <div className="mode-pop is-naik is-trae" data-testid="ai-izin-pop" role="menu">
          {/*
            * Plan paling atas, seperti produk rujukan: memilihnya tidak
            * mengubah tingkat izin yang tercentang. Dua permukaan sama-sama
            * mendapatkannya (permintaan user 28 Okt).
            */}
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={runMode === 'plan'}
            className={`mode-item${runMode === 'plan' ? ' is-on' : ''}`}
            data-testid="ai-approval-plan"
            onClick={() => {
              setRunMode(runMode === 'plan' ? 'interactive' : 'plan');
              setBuka(false);
            }}
          >
            <span className="mode-item-teks">
              <b>
                <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
                  <path d="M8 1.8a4.4 4.4 0 0 0-2.4 8.1c.5.35.8.9.8 1.5v.3h3.2v-.3c0-.6.3-1.15.8-1.5A4.4 4.4 0 0 0 8 1.8z" />
                  <path d="M6.6 14h2.8M7.1 15.3h1.8" />
                </svg>{' '}
                {tr('Plan')}
              </b>
              <i>{tr('Plan before editing')}</i>
            </span>
            {runMode === 'plan' && <span className="pick-check">✓</span>}
          </button>
          <div className="izin-sep" aria-hidden="true" />
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
              <span className="mode-item-teks">
                <b className={a.kelas === 'is-auto' ? 'is-warn' : undefined}>{tr(a.label)}</b>
                <i>{tr(a.hint)}</i>
              </span>
              {a.id === mode && <span className="pick-check">✓</span>}
            </button>
          ))}

        </div>
      )}
    </span>
    </>
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

