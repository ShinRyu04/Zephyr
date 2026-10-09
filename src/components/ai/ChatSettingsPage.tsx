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
  { id: 'subagent', label: 'Sub-agents' },
  { id: 'tools', label: 'Tools' },
  { id: 'voice', label: 'Voice' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'advanced', label: 'Advanced' },
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
  /* User or Workspace. See the tabs' own comment: only User has anything in it
     today, and the Workspace pane says so rather than pretending otherwise. */
  const [scope, setScope] = useState<'user' | 'workspace'>('user');

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
  const voice = settings.voice;
  const mic = settings.mic;
  const rules = settings.rules;

  const debugBuka = useAiDebug((s) => s.buka);
  /* Tool counts, read as primitives: the Set itself is replaced on every
     toggle, so comparing it in a selector is fine, but a derived number keeps
     this row from re-rendering on unrelated changes. */
  const jumlahToolAktif = useToolGate((s) => s.aktif.size);
  const subagent = settings.subagent;

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
    {
      section: 'appearance',
      id: 'subpanel2',
      label: 'Collapse finished steps',
      hint: 'Fold a sub-agent’s step list away once it stops.',
      words: 'appearance subagent sub-agent collapse fold steps panel tidy',
      ctl: (
        <Toggle
          checked={subagent.autoCollapse !== false}
          testid="cset-autocollapse"
          label="Collapse finished steps"
          onChange={(v) => void apply({ subagent: { autoCollapse: v } })}
        />
      ),
    },

    {
      section: 'subagent',
      id: 'subwrite',
      label: 'Let sub-agents write',
      hint: 'Off means every sub-agent may only read; you approve writes yourself.',
      words: 'subagent sub-agent write edit allow worker parallel permission',
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
      section: 'subagent',
      id: 'subpanel',
      label: 'Show the sub-agent panel',
      hint: 'The live list of workers beside the chat.',
      words: 'subagent sub-agent panel show workers list side',
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
      section: 'subagent',
      id: 'parallel',
      label: 'Run at most',
      hint: 'How many sub-agents may work at the same time.',
      words: 'subagent sub-agent parallel concurrency workers simultaneous',
      ctl: (
        <Select
          value={String(subagent.maxParallel ?? 4)}
          testid="cset-subparallel"
          label="Run at most"
          options={[1, 2, 3, 4, 6, 8].map((n) => ({ value: String(n), label: `${n}` }))}
          onChange={(v) => void apply({ subagent: { maxParallel: Number(v) } })}
        />
      ),
    },
    {
      section: 'subagent',
      id: 'steps',
      label: 'Steps per sub-agent',
      hint: 'The ceiling on how many tool steps one worker may take.',
      words: 'subagent sub-agent steps limit budget ceiling tools',
      ctl: (
        <Select
          value={String(subagent.maxSteps ?? 15)}
          testid="cset-substeps"
          label="Steps per sub-agent"
          options={[5, 10, 15, 20, 30, 50].map((n) => ({ value: String(n), label: `${n}` }))}
          onChange={(v) => void apply({ subagent: { maxSteps: Number(v) } })}
        />
      ),
    },
    {
      section: 'subagent',
      id: 'idle',
      label: 'Give up after',
      hint: 'How long a sub-agent may sit idle before its step is abandoned.',
      words: 'subagent sub-agent idle timeout give up abandon seconds',
      ctl: (
        <Select
          value={String(subagent.idleSecs ?? 90)}
          testid="cset-subidle"
          label="Give up after"
          options={[30, 60, 90, 120, 300, 600].map((n) => ({
            value: String(n),
            label: `${n}s`,
          }))}
          onChange={(v) => void apply({ subagent: { idleSecs: Number(v) } })}
        />
      ),
    },
    {
      section: 'subagent',
      id: 'submodel',
      label: 'Sub-agent model',
      hint: 'Which model the workers use. Empty follows the chat model.',
      words: 'subagent sub-agent model provider batch worker',
      ctl: (
        <button
          className="btn btn-sm"
          data-testid="cset-submodel"
          title={subagent.model || undefined}
          onClick={() => useStore.getState().setSettingsOpen(true)}
        >
          {subagent.model ? subagent.model : tr('Follow chat')}
        </button>
      ),
    },

    {
      section: 'tools',
      id: 'toolsets',
      label: 'Tool sets',
      hint: 'Pick exactly which tools the agent may call.',
      words: 'tools tool sets gate allow call permission enabled',
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
      section: 'tools',
      id: 'toolcount',
      label: 'Enabled tools',
      hint: 'How many tools are currently available to the agent.',
      words: 'tools enabled count number available active',
      ctl: (
        <span className="cset-stat" data-testid="cset-toolcount">
          {jumlahToolAktif}
        </span>
      ),
    },
    {
      section: 'tools',
      id: 'rules',
      label: 'Guard writes',
      hint: 'Refuse a save whose contents match a known-bad pattern.',
      words: 'tools rules guard write refuse save pattern dangerous',
      ctl: (
        <Toggle
          checked={rules?.enabled ?? false}
          testid="cset-rules"
          label="Guard writes"
          onChange={(v) => void apply({ rules: { enabled: v } })}
        />
      ),
    },
    {
      section: 'tools',
      id: 'rag2',
      label: 'Allow shell commands',
      hint: 'Commands listed in Permissions run without asking. Opens that page.',
      words: 'tools shell commands allow permission allowlist terminal',
      ctl: (
        <button
          className="btn btn-sm"
          data-testid="cset-allowcmds"
          onClick={() => {
            const st = useStore.getState();
            st.setActivity('settings');
            st.setSettingsOpen(true);
            void import('../../lib/settingsStore').then((m) =>
              m.useSettingsUi.getState().setSection('permissions'),
            );
          }}
        >
          {tr('Permissions…')}
        </button>
      ),
    },

    {
      section: 'voice',
      id: 'voiceon',
      label: 'Voice',
      hint: 'The master switch for speech in and out of the chat.',
      words: 'voice speech audio master enable speak talk',
      ctl: (
        <Toggle
          checked={voice?.enabled !== false}
          testid="cset-voice"
          label="Voice"
          onChange={(v) => void apply({ voice: { enabled: v } })}
        />
      ),
    },
    {
      section: 'voice',
      id: 'speak',
      label: 'Read answers aloud',
      hint: 'Speak each new answer as it arrives.',
      words: 'voice speech read aloud answers tts speak auto',
      ctl: (
        <Toggle
          checked={voice?.speakReplies ?? false}
          testid="cset-speak"
          label="Read answers aloud"
          onChange={(v) => void apply({ voice: { speakReplies: v } })}
        />
      ),
    },
    {
      section: 'voice',
      id: 'skipcode',
      label: 'Skip code blocks',
      hint: 'Do not read code aloud — it never sounds right.',
      words: 'voice speech skip code blocks reading tts',
      ctl: (
        <Toggle
          checked={voice?.skipCode !== false}
          testid="cset-skipcode"
          label="Skip code blocks"
          onChange={(v) => void apply({ voice: { skipCode: v } })}
        />
      ),
    },
    {
      section: 'voice',
      id: 'mic',
      label: 'Dictation button',
      hint: 'Show the microphone in the composer.',
      words: 'voice mic microphone dictate dictation button composer stt',
      ctl: (
        <Toggle
          checked={mic?.enabled !== false}
          testid="cset-mic"
          label="Dictation button"
          onChange={(v) => void apply({ mic: { enabled: v } })}
        />
      ),
    },
    {
      section: 'voice',
      id: 'autosend',
      label: 'Send when dictation stops',
      hint: 'Send the transcript as soon as you stop talking.',
      words: 'voice mic dictation send auto stop transcript',
      ctl: (
        <Toggle
          checked={mic?.autoSend ?? false}
          testid="cset-autosend"
          label="Send when dictation stops"
          onChange={(v) => void apply({ mic: { autoSend: v } })}
        />
      ),
    },

    {
      section: 'advanced',
      id: 'provider',
      label: 'Provider & API keys',
      hint: 'Which provider answers, and the keys it uses.',
      words: 'advanced provider api key openai anthropic gemini model endpoint',
      ctl: (
        <button
          className="btn btn-sm"
          data-testid="cset-provider"
          onClick={() => {
            const st = useStore.getState();
            st.setActivity('settings');
            st.setSettingsOpen(true);
            void import('../../lib/settingsStore').then((m) =>
              m.useSettingsUi.getState().setSection('models'),
            );
          }}
        >
          {tr('Models & keys…')}
        </button>
      ),
    },
    {
      section: 'advanced',
      id: 'custom',
      label: 'Custom instructions',
      hint: 'Standing text appended to the system prompt on every turn.',
      words: 'advanced custom instructions system prompt standing rules append',
      ctl: (
        <button
          className="btn btn-sm"
          data-testid="cset-custom"
          onClick={() => {
            const st = useStore.getState();
            st.setActivity('settings');
            st.setSettingsOpen(true);
            void import('../../lib/settingsStore').then((m) =>
              m.useSettingsUi.getState().setSection('agents'),
            );
          }}
        >
          {tr('Edit…')}
        </button>
      ),
    },
    {
      section: 'advanced',
      id: 'ragk',
      label: 'Retrieved chunks',
      hint: 'How many passages the project index hands the model.',
      words: 'advanced rag project index chunks retrieval k passages',
      ctl: (
        <Select
          value={String(models.ragK ?? 4)}
          testid="cset-ragk"
          label="Retrieved chunks"
          options={[2, 4, 6, 8, 12, 20].map((n) => ({ value: String(n), label: `${n}` }))}
          onChange={(v) => void apply({ models: { ragK: Number(v) } })}
        />
      ),
    },
    {
      section: 'advanced',
      id: 'debug2',
      label: 'Show the debug view',
      hint: 'Log every request the panel sends, with timing and token counts.',
      words: 'advanced debug view requests log timing tokens trace',
      ctl: (
        <Toggle
          checked={debugBuka}
          testid="cset-debug"
          label="Show the debug view"
          onChange={() => useAiDebug.getState().toggle()}
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
          {/* Scope tabs, VS Code's User / Workspace pair.
           *
           * Zephyr has no per-workspace settings yet — everything lives in
           * `%APPDATA%\zephyr\settings.json` and applies to every folder — so the
           * Workspace tab says that plainly instead of showing a copy of the
           * User list or an empty list that reads as a broken page. The tab
           * exists because a reader who knows VS Code will look for it; the
           * message is what keeps it honest. */}
          <div className="cset-scope" role="tablist" aria-label={tr('Scope')}>
            <button
              role="tab"
              aria-selected={scope === 'user'}
              className={`cset-scope-tab${scope === 'user' ? ' is-on' : ''}`}
              data-testid="cset-scope-user"
              onClick={() => setScope('user')}
            >
              {tr('User')}
            </button>
            <button
              role="tab"
              aria-selected={scope === 'workspace'}
              className={`cset-scope-tab${scope === 'workspace' ? ' is-on' : ''}`}
              data-testid="cset-scope-workspace"
              onClick={() => setScope('workspace')}
            >
              {tr('Workspace')}
            </button>
          </div>

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

          {scope === 'workspace' ? (
            /*
             * The honest Workspace pane.
             *
             * Not a copy of the User list and not an empty one: both would lie.
             * A copy would say "these apply to this folder" when they do not,
             * and an empty list reads as a page that failed to load. One
             * sentence that names where settings actually live is the only
             * accurate thing this pane can say today.
             */
            <div className="cset-ws" data-testid="cset-workspace-empty">
              <p className="cset-ws-title">{tr('No workspace settings yet')}</p>
              <p className="cset-ws-body">
                {tr(
                  'Zephyr keeps its chat settings for the whole app, not per folder. Everything on the User tab applies to every project.',
                )}
              </p>
            </div>
          ) : (
            <>
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
            </>
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
