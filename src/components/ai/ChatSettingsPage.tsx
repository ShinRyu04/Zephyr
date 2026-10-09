import { useEffect, useMemo, useState } from 'react';
import { useAi, type ReasoningEffort } from '../../lib/aiStore';
import { useStore } from '../../lib/store';
import { useAiDebug } from '../../lib/aiDebugStore';
import { useToolGate } from '../../lib/toolGate';
import { useT } from '../../lib/i18n';
import { Row, Section, Select, Toggle } from '../settings/SettingsControls';
import type { ApprovalMode } from '../../lib/types';
import AiIkon from './AiIkon';
import '../../styles/chat-settings.css';

/*
 * Chat Settings — the chat's own preferences, VS Code style.
 *
 * Opened from the "…" menu and rendered INSIDE the editor area as a full page,
 * not a small popover: VS Code's chat settings are a searchable, sectioned page
 * (its `@feature:chat` view), and the small panel this replaced could hold four
 * controls and no explanations. A page has room for the hints, which is what
 * makes a setting findable without reading the source.
 *
 * Scope is the CONVERSATION, deliberately: how a turn is dispatched, how much
 * it is allowed to do, how it reasons, and how answers read. Editor, theme and
 * extensions stay in the main Settings page.
 *
 * THE ROWS ARE DATA. Every setting is one entry in `ROWS` carrying its section,
 * its searchable words, and its control, and both the render loop and the search
 * box read that one list. The first version kept the words in a separate table
 * and the count and the filter immediately disagreed — "1 found" next to an
 * empty page. One source, so they cannot.
 *
 * Every control writes through the same stores the composer chips use, so the
 * pickers at the bottom of the chat and this page can never disagree: they are
 * two views of one value, not two copies of it.
 */

/** The four approval levels, matching the composer's permission chip. */
const APPROVAL: { id: ApprovalMode; label: string }[] = [
  { id: 'readonly', label: 'Read-only' },
  { id: 'ask', label: 'Ask' },
  { id: 'work', label: 'Work' },
  { id: 'auto', label: 'Auto' },
];

/** Run modes, matching the composer's Interactive chip. */
const RUN_MODES = [
  { id: 'interactive', label: 'Interactive' },
  { id: 'plan', label: 'Plan' },
  { id: 'autopilot', label: 'Autopilot' },
] as const;

/** Reasoning effort, matching the composer's Reasoning chip. '' = provider default. */
const EFFORT: { id: string; label: string }[] = [
  { id: '', label: 'Auto' },
  { id: 'minimal', label: 'Minimal' },
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
  { id: 'ultra', label: 'Ultra' },
];

/**
 * The sections, in the order the left column lists them.
 *
 * `label` is both the nav text and the section heading, so a reader who clicks
 * "Agent" lands on a heading that says the same word.
 */
const SECTIONS = [
  { id: 'mode', label: 'Mode' },
  { id: 'agent', label: 'Agent' },
  { id: 'context', label: 'Context' },
  { id: 'appearance', label: 'Appearance' },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

export default function ChatSettingsPage({
  onClose,
  onOpenEditor,
}: {
  onClose: () => void;
  /*
   * Ask the host to move this page into the editor area.
   *
   * Present only where there is an editor to move it to. The popup passes it so
   * the "Open in Editor" button can appear; the editor-area host passes nothing,
   * because there the page is already where that button would send it.
   */
  onOpenEditor?: () => void;
}) {
  const tr = useT();
  const [bagian, setBagian] = useState<SectionId>('mode');
  const [cari, setCari] = useState('');

  /* Conversation state — the same fields the composer chips read. */
  const agentMode = useAi((s) => s.agentMode ?? 'chat');
  const setAgentMode = useAi((s) => s.setAgentMode);
  const runMode = useAi((s) => s.runMode ?? 'interactive');
  const setRunMode = useAi((s) => s.setRunMode);
  const approvalMode = useAi((s) => s.approvalMode ?? 'work');
  const setApprovalMode = useAi((s) => s.setApprovalMode);
  const effort = useAi((s) => s.reasoningEffort);
  const setEffort = useAi((s) => s.setReasoningEffort);
  const tipsVisible = useAi((s) => s.tipsVisible);
  const setTipsVisible = useAi((s) => s.setTipsVisible);

  /* Settings-backed fields. */
  const settings = useStore((s) => s.settings);
  const apply = useStore((s) => s.applySettings);
  const models = settings.models;
  const agents = settings.agents;
  const subagent = settings.subagent;

  const debugBuka = useAiDebug((s) => s.buka);

  /* Escape closes the page, like any other editor-area view. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  /*
   * The rows, then the search over them.
   *
   * Built here rather than at module scope because each control closes over
   * store values and setters. `useMemo` is not used: the array is cheap and its
   * identity does not feed a selector, so memoising it would only add a
   * dependency list to keep correct.
   */
  const rows: RowDef[] = [
    {
      section: 'mode',
      id: 'dispatch',
      label: 'Dispatch',
      hint: 'Whether these turns only answer or also act on your project.',
      words: 'mode dispatch chat agent q&a answer tools act',
      ctl: (
        <Select
          value={agentMode}
          testid="cset-mode"
          label="Dispatch"
          options={[
            { value: 'chat', label: tr('Chat — answer only') },
            { value: 'agent', label: tr('Agent — reads files, runs tools') },
          ]}
          onChange={(v) => setAgentMode(v as 'chat' | 'agent')}
        />
      ),
    },
    {
      section: 'mode',
      id: 'runmode',
      label: 'Run mode',
      hint: 'How much the agent decides on its own before checking in.',
      words: 'mode run interactive plan autopilot step collaborate autonomous',
      ctl: (
        <Select
          value={runMode}
          testid="cset-runmode"
          label="Run mode"
          options={RUN_MODES.map((m) => ({ value: m.id, label: tr(m.label) }))}
          onChange={(v) => setRunMode(v as 'interactive' | 'plan' | 'autopilot')}
        />
      ),
    },
    {
      section: 'mode',
      id: 'reasoning',
      label: 'Reasoning',
      hint: 'How hard the model thinks before answering. Auto leaves it to the provider.',
      words: 'mode reasoning effort thinking think budget minimal low medium high ultra auto',
      ctl: (
        <Select
          value={effort ?? ''}
          testid="cset-reasoning"
          label="Reasoning"
          options={EFFORT.map((e) => ({ value: e.id, label: tr(e.label) }))}
          onChange={(v) => setEffort(v === '' ? null : (v as ReasoningEffort))}
        />
      ),
    },

    {
      section: 'agent',
      id: 'approval',
      label: 'Permissions',
      hint: 'What the agent may do to your files and terminal without asking.',
      words: 'agent permissions approval manual read-only ask work auto safe risky',
      ctl: (
        <Select
          value={approvalMode}
          testid="cset-approval"
          label="Permissions"
          options={APPROVAL.map((a) => ({ value: a.id, label: tr(a.label) }))}
          onChange={(v) => setApprovalMode(v as ApprovalMode)}
        />
      ),
    },
    {
      section: 'agent',
      id: 'attach',
      label: 'Attach the active file',
      hint: 'Send the file you are editing with every agent turn.',
      words: 'agent attach active file context editor send include',
      ctl: (
        <Toggle
          checked={agents.attachActiveFile ?? false}
          testid="cset-attach"
          label="Attach the active file"
          onChange={(v) => void apply({ agents: { attachActiveFile: v } })}
        />
      ),
    },
    {
      section: 'agent',
      id: 'subwrite',
      label: 'Let sub-agents write',
      hint: 'Off means every sub-agent may only read; you approve writes yourself.',
      words: 'agent subagent sub-agent write edit allow worker parallel',
      ctl: (
        <Toggle
          checked={subagent.allowWrite ?? false}
          testid="cset-subwrite"
          label="Let sub-agents write"
          onChange={(v) => void apply({ subagent: { allowWrite: v } })}
        />
      ),
    },
    {
      section: 'agent',
      id: 'subpanel',
      label: 'Show the sub-agent panel',
      hint: 'The live list of workers beside the chat.',
      words: 'agent subagent sub-agent panel show workers list side',
      ctl: (
        <Toggle
          checked={subagent.showPanel !== false}
          testid="cset-subpanel"
          label="Show the sub-agent panel"
          onChange={(v) => void apply({ subagent: { showPanel: v } })}
        />
      ),
    },
    {
      section: 'agent',
      id: 'tools',
      label: 'Tool sets',
      hint: 'Choose which tools the agent may call at all.',
      words: 'agent tools tool sets gate allow call',
      ctl: (
        <button
          className="btn btn-sm"
          data-testid="cset-tools"
          onClick={() => useToolGate.getState().setBuka(true)}
        >
          {tr('Open tool sets…')}
        </button>
      ),
    },

    {
      section: 'context',
      id: 'lang',
      label: 'Answer language',
      hint: 'The language answers come back in. Follow interface uses your UI language.',
      words: 'context language answer reply indonesia english follow interface translate',
      ctl: (
        <Select
          value={models.answerLang ?? 'follow'}
          testid="cset-lang"
          label="Answer language"
          options={[
            { value: 'follow', label: tr('Follow interface') },
            { value: 'id', label: 'Bahasa Indonesia' },
            { value: 'en', label: 'English' },
          ]}
          onChange={(v) => void apply({ models: { answerLang: v } })}
        />
      ),
    },
    {
      section: 'context',
      id: 'length',
      label: 'Answer length',
      hint: 'How much detail to aim for when the question does not say.',
      words: 'context length answer verbose short normal detail brief',
      ctl: (
        <Select
          value={models.answerStyle ?? 'short'}
          testid="cset-style"
          label="Answer length"
          options={[
            { value: 'short', label: tr('Short') },
            { value: 'normal', label: tr('Normal') },
            { value: 'detail', label: tr('Detailed') },
          ]}
          onChange={(v) => void apply({ models: { answerStyle: v } })}
        />
      ),
    },
    {
      section: 'context',
      id: 'rag',
      label: 'Project index',
      hint: 'Look answers up in an indexed copy of the project before replying.',
      words: 'context rag index project retrieval lookup search knowledge',
      ctl: (
        <Toggle
          checked={models.ragEnabled ?? false}
          testid="cset-rag"
          label="Project index"
          onChange={(v) => void apply({ models: { ragEnabled: v } })}
        />
      ),
    },
    {
      section: 'context',
      id: 'debug',
      label: 'Show the debug view',
      hint: 'Log every request the panel sends, with timing and token counts.',
      words: 'context debug view requests log timing tokens trace',
      ctl: (
        <Toggle
          checked={debugBuka}
          testid="cset-debug"
          label="Show the debug view"
          onChange={() => useAiDebug.getState().toggle()}
        />
      ),
    },

    {
      section: 'appearance',
      id: 'tips',
      label: 'Show tips',
      hint: 'The hint strip above the composer.',
      words: 'appearance tips hint strip composer show',
      ctl: (
        <Toggle
          checked={tipsVisible}
          testid="cset-tips"
          label="Show tips"
          onChange={setTipsVisible}
        />
      ),
    },
    {
      section: 'appearance',
      id: 'avatar',
      label: 'Chat avatars',
      hint: 'Show a mark beside each message.',
      words: 'appearance avatar photo mark message robot user picture',
      ctl: (
        <Toggle
          checked={agents.chatAvatar !== false}
          testid="cset-avatar"
          label="Chat avatars"
          onChange={(v) => void apply({ agents: { chatAvatar: v } })}
        />
      ),
    },
  ];

  const q = cari.trim().toLowerCase();

  /* One predicate for every row, used by both the count and the render — the
     two cannot drift apart because there is only one of them. */
  const cocok = (r: RowDef) =>
    !q || r.label.toLowerCase().includes(q) || (r.words ?? '').toLowerCase().includes(q);

  /* How many rows match, for the "N found" readout. The full list while no
     query is active, so the number and the page always describe each other. */
  const jumlah = useMemo(() => rows.filter(cocok).length, [q, rows]);

  /* A section renders when its own row is selected (no query) or when it still
     has a row left after filtering (query). Without the second case a search
     that matched one row would leave the other sections as bare headings. */
  const tampilSection = (id: SectionId) =>
    q === '' ? bagian === id : rows.some((r) => r.section === id && cocok(r));

  const rowsOf = (id: SectionId) => rows.filter((r) => r.section === id && cocok(r));

  return (
    <div className="cset-page" data-testid="cset-page">
      <div className="cset-topbar">
        <AiIkon name="gear" size={14} />
        <span className="cset-topbar-title">{tr('Chat Settings')}</span>
        {/* The way out of the popup and into the editor. VSCode draws the same
            door on its floating chat panels: a small overlay for a quick change,
            and a button to keep it open as a real tab when the reader wants to
            stay a while. Absent in the editor host, where it would go nowhere. */}
        {onOpenEditor && (
          <button
            className="btn btn-sm"
            data-testid="cset-open-editor"
            title={tr('Open in the editor area')}
            onClick={onOpenEditor}
          >
            {tr('Open in Editor')}
          </button>
        )}
        <button className="btn btn-sm" data-testid="cset-close" onClick={onClose}>
          {tr('Close')}
        </button>
      </div>

      <div className="cset-body">
        {/* Left column: the sections. Hidden while searching, so the results
            take the whole width and no section looks empty. */}
        {!q && (
          <nav className="cset-nav" aria-label={tr('Chat Settings')}>
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                className={`cset-nav-item${bagian === s.id ? ' is-active' : ''}`}
                data-testid={`cset-nav-${s.id}`}
                aria-current={bagian === s.id}
                onClick={() => setBagian(s.id)}
              >
                {tr(s.label)}
              </button>
            ))}
          </nav>
        )}

        <div className="cset-content">
          <div className="cset-cari">
            <AiIkon name="search" size={12} />
            <input
              data-testid="cset-search"
              placeholder={tr('Search chat settings…')}
              value={cari}
              onChange={(e) => setCari(e.target.value)}
            />
            {q && (
              <span className="cset-cari-n" data-testid="cset-search-n">
                {jumlah} {tr('found')}
              </span>
            )}
          </div>

          {SECTIONS.filter((s) => tampilSection(s.id)).map((s) => (
            <Section key={s.id} title={s.label}>
              {rowsOf(s.id).map((r) => (
                <Row key={r.id} label={r.label} hint={r.hint} testid={`cset-row-${r.id}`}>
                  {r.ctl}
                </Row>
              ))}
            </Section>
          ))}

          {q && jumlah === 0 && (
            <p className="cset-kosong" data-testid="cset-empty">
              {tr('No chat settings match.')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * One setting: where it lives, how it is found, and what draws it.
 *
 * `words` is the search text and is deliberately separate from `label`: the
 * visible label is what the row says, while `words` also carries the synonyms a
 * reader might type instead ("effort" for Reasoning, "subagent" for sub-agents).
 * Both are matched, so either spelling works.
 */
interface RowDef {
  section: SectionId;
  id: string;
  label: string;
  hint?: string;
  words?: string;
  ctl: React.ReactNode;
}
