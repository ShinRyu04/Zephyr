import { useEffect, useState } from 'react';
import { useAi, type ReasoningEffort } from '../../lib/aiStore';
import { useStore } from '../../lib/store';

import { useToolGate } from '../../lib/toolGate';
import { useT, tf } from '../../lib/i18n';
import { Row, Section, Select, TextInput, Toggle } from '../settings/SettingsControls';
import type { ApprovalMode } from '../../lib/types';
import { RULES_BAWAAN } from '../../lib/rulesCatalog';
import { CustomSubagentsCard } from '../settings/SectionsAdvanced';
import CommandPermissions from '../settings/CommandPermissions';
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
  { id: 'rules', label: 'Rules' },
  { id: 'models', label: 'Models' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'session', label: 'Session' },
  { id: 'advanced', label: 'Advanced' },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

export default function ChatSettingsPage({
  onClose,
  onOpenEditor,
  onDragStart,
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
  /*
   * Makes this page's own header the drag handle of the popup that frames it.
   *
   * Passed in rather than owned here: only the popup is draggable, and the page
   * must not start a drag when it is the full-height editor home. The header is
   * the right handle because it is the one strip with no interactive control
   * except the buttons at its trailing edge — which the hook excludes itself.
   */
  onDragStart?: (e: React.PointerEvent) => void;
}) {
  const tr = useT();
  const [bagian, setBagian] = useState<SectionId>('mode');
  const [cari, setCari] = useState('');
  /*
   * Display-only chat preferences.
   *
   * Local state rather than settings: these change how the transcript LOOKS for
   * this reader and nothing outside the panel depends on them. Persisting them
   * properly means new keys in the settings schema, and that is a bigger change
   * than a view option earns — so they are honest session-level choices, which
   * is what each row's Reset puts back.
   */
  const [showThinking, setShowThinking] = useState(true);
  const [showStamps, setShowStamps] = useState(true);
  const [showDividers, setShowDividers] = useState(true);
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
  const rules = settings.rules;
  const subagent = settings.subagent;
  /* Whether the guard is on at all. The per-rule switches below are dead
     while it is off, so they render disabled rather than pretending to work. */
  const rulesOn = rules?.enabled === true;

  /* Tool counts, read as primitives: the Set itself is replaced on every
     toggle, so comparing it in a selector is fine, but a derived number keeps
     this row from re-rendering on unrelated changes. */
  const jumlahToolAktif = useToolGate((s) => s.aktif.size);

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
      isDefault: agentMode === 'chat',
      reset: () => setAgentMode('chat'),
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
      isDefault: runMode === 'interactive',
      reset: () => setRunMode('interactive'),
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
      isDefault: (effort ?? 'medium') === 'medium',
      reset: () => setEffort('medium'),
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
      isDefault: approvalMode === 'work',
      reset: () => setApprovalMode('work'),
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
      isDefault: (agents.attachActiveFile ?? false) === false,
      reset: () => void apply({ agents: { attachActiveFile: false } }),
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
      isDefault: (models.answerLang ?? 'follow') === 'follow',
      reset: () => void apply({ models: { answerLang: 'follow' } }),
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
      isDefault: (models.answerStyle ?? 'short') === 'short',
      reset: () => void apply({ models: { answerStyle: 'short' } }),
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
      isDefault: (models.ragEnabled ?? false) === false,
      reset: () => void apply({ models: { ragEnabled: false } }),
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
      isDefault: tipsVisible === true,
      reset: () => setTipsVisible(true),
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
      isDefault: (agents.chatAvatar !== false) === true,
      reset: () => void apply({ agents: { chatAvatar: true } }),
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
      isDefault: (subagent.autoCollapse !== false) === true,
      reset: () => void apply({ subagent: { autoCollapse: true } }),
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
      isDefault: (subagent.allowWrite ?? false) === false,
      reset: () => void apply({ subagent: { allowWrite: false } }),
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
      isDefault: (subagent.showPanel !== false) === true,
      reset: () => void apply({ subagent: { showPanel: true } }),
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
      isDefault: (subagent.maxParallel ?? 4) === 4,
      reset: () => void apply({ subagent: { maxParallel: 4 } }),
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
      isDefault: (subagent.maxSteps ?? 15) === 15,
      reset: () => void apply({ subagent: { maxSteps: 15 } }),
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
      isDefault: (subagent.idleSecs ?? 90) === 90,
      reset: () => void apply({ subagent: { idleSecs: 90 } }),
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
      isDefault: true,
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
      isDefault: true,
    },
    {
      /*
       * The master switch lives at the TOP of the Rules section, not in Tools.
       *
       * It used to sit in Tools while the rules it controls were listed under
       * Rules, so turning the guard on meant leaving the section that shows what
       * it guards. The master belongs with its children.
       */
      section: 'rules',
      id: 'rules',
      label: 'Guard writes',
      hint: 'Refuse a save whose contents match a known-bad pattern.',
      words: 'rules guard write refuse save pattern dangerous master',
      ctl: (
        <Toggle
          checked={rules?.enabled ?? false}
          testid="cset-rules"
          label="Guard writes"
          onChange={(v) => void apply({ rules: { enabled: v } })}
        />
      ),
      isDefault: (rules?.enabled ?? false) === false,
      reset: () => void apply({ rules: { enabled: false } }),
    },
    {
      section: 'tools',
      id: 'allowcmds',
      /*
       * The allow-list itself, not a door to it.
       *
       * This replaced a "Permissions…" button that jumped to the Settings page.
       * The list is small and the question it answers ("what may run without
       * asking?") is asked WHILE working, so it belongs on the page you are
       * already on. `CommandPermissions` is the Settings page's own component,
       * reused verbatim — one implementation, one place the destructive-command
       * guard lives.
       */
      label: 'Always-allowed commands',
      hint: 'Run without asking again. Destructive commands are still asked — that net cannot be switched off.',
      words: 'tools shell commands allow permission allowlist terminal run',
      ctl: <CommandPermissions />,
      /* Holds a list, not a value: nothing to reset, nothing to compare. */
      isDefault: true,
    },


    {
      section: 'models',
      id: 'askmodel',
      label: 'Chat model',
      hint: 'Which model answers in this panel.',
      words: 'models model chat pick llm provider answer',
      ctl: (
        <button
          className="cset-value"
          data-testid="cset-askmodel"
          title={tr('Opens the model picker')}
          onClick={() => useAi.getState().setModelMenuOpen(true)}
        >
          {useAi.getState().model || tr('Choose…')}
        </button>
      ),
      isDefault: true,
    },
    {
      section: 'models',
      id: 'provider2',
      label: 'Active provider',
      hint: 'Where those models come from.',
      words: 'models provider active openai anthropic gemini custom ollama',
      ctl: (
        <Select
          value={models.activeProvider ?? 'custom'}
          testid="cset-provider2"
          label="Active provider"
          options={[
            { value: 'custom', label: 'Custom / local' },
            { value: 'openai', label: 'OpenAI' },
            { value: 'anthropic', label: 'Anthropic' },
            { value: 'gemini', label: 'Google Gemini' },
            { value: 'ollama', label: 'Ollama' },
            { value: 'groq', label: 'Groq' },
          ]}
          onChange={(v) => void apply({ models: { activeProvider: v } })}
        />
      ),
      isDefault: (models.activeProvider ?? 'custom') === 'custom',
      reset: () => void apply({ models: { activeProvider: 'custom' } }),
    },
    {
      section: 'models',
      id: 'baseurl',
      label: 'Endpoint',
      hint: 'Override the provider URL. Empty uses the provider default.',
      words: 'models endpoint base url override gateway custom local',
      ctl: (
        <TextInput
          value={models.providers?.[models.activeProvider ?? 'custom']?.baseUrl ?? ''}
          testid="cset-baseurl"
          label="Endpoint"
          placeholder="https://…"
          onChange={(v) =>
            void apply({
              models: {
                providers: {
                  [models.activeProvider ?? 'custom']: { baseUrl: v },
                },
              },
            })
          }
        />
      ),
      isDefault: (models.providers?.[models.activeProvider ?? 'custom']?.baseUrl ?? '') === '',
      reset: () =>
        void apply({
          models: { providers: { [models.activeProvider ?? 'custom']: { baseUrl: '' } } },
        }),
    },
    {
      section: 'models',
      id: 'keys',
      label: 'API keys',
      hint: 'Keys are stored encrypted and never shown back to the screen.',
      words: 'models api key secret token openai anthropic gemini credential',
      ctl: (
        <button
          className="btn btn-sm"
          data-testid="cset-keys"
          onClick={() => {
            const st = useStore.getState();
            st.setActivity('settings');
            st.setSettingsOpen(true);
            void import('../../lib/settingsStore').then((m) =>
              m.useSettingsUi.getState().setSection('models'),
            );
          }}
        >
          {tr('Manage keys…')}
        </button>
      ),
      isDefault: true,
    },


    {
      section: 'agent',
      id: 'panes',
      label: 'Terminal panes',
      hint: 'The ceiling on panes per tab, agent panes included.',
      words: 'agent terminal panes max split limit',
      ctl: (
        <Select
          value={String(agents.maxPanes ?? 6)}
          testid="cset-panes"
          label="Terminal panes"
          options={[1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: `${n}` }))}
          onChange={(v) => void apply({ agents: { maxPanes: Number(v) } })}
        />
      ),
      isDefault: (agents.maxPanes ?? 6) === 6,
      reset: () => void apply({ agents: { maxPanes: 6 } }),
    },
    {
      section: 'context',
      id: 'ragurl',
      label: 'Index server',
      hint: 'Where the project index lives.',
      words: 'context rag index server url endpoint project',
      ctl: (
        <TextInput
          value={models.ragUrl ?? ''}
          testid="cset-ragurl"
          label="Index server"
          placeholder="http://localhost:7777"
          onChange={(v) => void apply({ models: { ragUrl: v } })}
        />
      ),
      isDefault: (models.ragUrl ?? '') === 'http://localhost:7777',
      reset: () => void apply({ models: { ragUrl: 'http://localhost:7777' } }),
    },
    {
      section: 'context',
      id: 'ragproj',
      label: 'Index project',
      hint: 'The project or collection name to search.',
      words: 'context rag index project collection name',
      ctl: (
        <TextInput
          value={models.ragProject ?? ''}
          testid="cset-ragproj"
          label="Index project"
          placeholder={tr('Project name')}
          onChange={(v) => void apply({ models: { ragProject: v } })}
        />
      ),
      isDefault: (models.ragProject ?? '') === '',
      reset: () => void apply({ models: { ragProject: '' } }),
    },

    {
      section: 'advanced',
      id: 'instr',
      label: 'Custom instructions',
      hint: 'Standing text appended to the system prompt on every turn.',
      words: 'advanced custom instructions system prompt standing rules text',
      ctl: (
        <textarea
          className="cset-textarea"
          data-testid="cset-instr"
          rows={3}
          value={agents.customInstructions ?? ''}
          placeholder={tr('Anything the AI should always know or always do…')}
          onChange={(e) => void apply({ agents: { customInstructions: e.target.value } })}
        />
      ),
      isDefault: (agents.customInstructions ?? '') === '',
      reset: () => void apply({ agents: { customInstructions: '' } }),
    },
    {
      section: 'advanced',
      id: 'his',
      label: 'Keep local history',
      hint: 'Snapshot files as you edit so an old version can be restored.',
      words: 'advanced history local snapshot timeline restore',
      ctl: (
        <Toggle
          checked={settings.history?.enabled !== false}
          testid="cset-his"
          label="Keep local history"
          onChange={(v) => void apply({ history: { enabled: v } })}
        />
      ),
      isDefault: (settings.history?.enabled !== false) === true,
      reset: () => void apply({ history: { enabled: true } }),
    },
    {
      section: 'advanced',
      id: 'hisperfile',
      label: 'Snapshots per file',
      hint: 'How many versions to keep for each file.',
      words: 'advanced history snapshots per file limit keep',
      ctl: (
        <Select
          value={String(settings.history?.maxPerFile ?? 200)}
          testid="cset-hisperfile"
          label="Snapshots per file"
          options={[50, 100, 200, 500, 1000].map((n) => ({ value: String(n), label: `${n}` }))}
          onChange={(v) => void apply({ history: { maxPerFile: Number(v) } })}
        />
      ),
      isDefault: (settings.history?.maxPerFile ?? 200) === 200,
      reset: () => void apply({ history: { maxPerFile: 200 } }),
    },
    {
      section: 'advanced',
      id: 'hisdays',
      label: 'Keep history for',
      hint: 'Older snapshots are pruned.',
      words: 'advanced history days age prune keep retention',
      ctl: (
        <Select
          value={String(settings.history?.maxDays ?? 30)}
          testid="cset-hisdays"
          label="Keep history for"
          options={[7, 14, 30, 90, 365].map((n) => ({ value: String(n), label: `${n}d` }))}
          onChange={(v) => void apply({ history: { maxDays: Number(v) } })}
        />
      ),
      isDefault: (settings.history?.maxDays ?? 30) === 30,
      reset: () => void apply({ history: { maxDays: 30 } }),
    },
    {
      section: 'advanced',
      id: 'histotal',
      label: 'History ceiling',
      hint: 'Total snapshots across every file, oldest pruned first.',
      words: 'advanced history total ceiling limit all files prune',
      ctl: (
        <Select
          value={String(settings.history?.maxTotal ?? 2000)}
          testid="cset-histotal"
          label="History ceiling"
          options={[500, 1000, 2000, 5000, 10000].map((n) => ({
            value: String(n),
            label: `${n}`,
          }))}
          onChange={(v) => void apply({ history: { maxTotal: Number(v) } })}
        />
      ),
      isDefault: (settings.history?.maxTotal ?? 2000) === 2000,
      reset: () => void apply({ history: { maxTotal: 2000 } }),
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
      isDefault: (models.ragK ?? 4) === 4,
      reset: () => void apply({ models: { ragK: 4 } }),
    },

    {
      section: 'session',
      id: 'restore',
      label: 'Restore last session',
      hint: 'Reopen the files and chats you had open when Zephyr last closed.',
      words: 'session restore reopen startup launch previous workspace',
      ctl: (
        <Toggle
          checked={settings.general?.restoreSession !== false}
          testid="cset-restore"
          label="Restore last session"
          onChange={(v) => void apply({ general: { restoreSession: v } })}
        />
      ),
      isDefault: (settings.general?.restoreSession !== false) === true,
      reset: () => void apply({ general: { restoreSession: true } }),
    },
    {
      section: 'session',
      id: 'updates',
      label: 'Check for updates',
      hint: 'Look for a new release when Zephyr starts.',
      words: 'session updates check release version startup auto',
      ctl: (
        <Toggle
          checked={settings.general?.checkUpdates !== false}
          testid="cset-updates"
          label="Check for updates"
          onChange={(v) => void apply({ general: { checkUpdates: v } })}
        />
      ),
      isDefault: (settings.general?.checkUpdates !== false) === true,
      reset: () => void apply({ general: { checkUpdates: true } }),
    },
    {
      section: 'session',
      id: 'lowram',
      label: 'Save memory',
      hint: 'Keep fewer files loaded at once. Useful on a small machine.',
      words: 'session memory ram low save performance tabs',
      ctl: (
        <Toggle
          checked={settings.general?.lowRam === true}
          testid="cset-lowram"
          label="Save memory"
          onChange={(v) => void apply({ general: { lowRam: v } })}
        />
      ),
      isDefault: (settings.general?.lowRam === true) === false,
      reset: () => void apply({ general: { lowRam: false } }),
    },
    {
      section: 'session',
      id: 'cls',
      label: 'Clear all chats',
      hint: 'Delete every conversation. This cannot be undone.',
      words: 'session clear delete all chats history wipe reset',
      ctl: (
        <button
          className="btn btn-sm btn-danger"
          data-testid="cset-clear"
          onClick={() => useAi.getState().setClearAllOpen(true)}
        >
          {tr('Clear all chats…')}
        </button>
      ),
      isDefault: true,
    },

    /* ── Display options ────────────────────────────────────────────────────
     * How the transcript LOOKS. Local state, not saved settings: they change
     * nothing outside this panel, and persisting them means new keys in the
     * settings schema — a bigger change than a view option earns. They reset
     * with the panel, and each row's Reset puts it back to its default.
     */
    {
      section: 'appearance',
      id: 'think',
      label: 'Show thinking',
      hint: 'Show the model’s reasoning above its answer.',
      words: 'appearance thinking reasoning show hide thought collapsed',
      ctl: (
        <Toggle
          checked={showThinking}
          testid="cset-think"
          label="Show thinking"
          onChange={setShowThinking}
        />
      ),
      isDefault: showThinking === true,
      reset: () => setShowThinking(true),
    },
    {
      section: 'appearance',
      id: 'stamp',
      label: 'Show timestamps',
      hint: 'The time beside each message.',
      words: 'appearance timestamps time clock date stamp message',
      ctl: (
        <Toggle
          checked={showStamps}
          testid="cset-stamp"
          label="Show timestamps"
          onChange={setShowStamps}
        />
      ),
      isDefault: showStamps === true,
      reset: () => setShowStamps(true),
    },
    {
      section: 'appearance',
      id: 'divid',
      label: 'Show date dividers',
      hint: 'A line between messages from different days.',
      words: 'appearance date divider day separator history',
      ctl: (
        <Toggle
          checked={showDividers}
          testid="cset-divid"
          label="Show date dividers"
          onChange={setShowDividers}
        />
      ),
      isDefault: showDividers === true,
      reset: () => setShowDividers(true),
    },

    /* ── Doors to the panels that own the rest ─────────────────────────────
     * These do not hold a value of their own, so they carry no Reset — and
     * `isDefault: true` keeps them out of the `@modified` filter, which is
     * correct: a link is never "changed".
     */

    /* ── Sub-agent model ─────────────────────────────────────────────────── */
    {
      section: 'subagent',
      id: 'submodel2',
      label: 'Sub-agent provider',
      hint: 'Which provider the workers use. Empty follows the chat.',
      words: 'subagent sub-agent provider model worker batch cheap',
      ctl: (
        <Select
          value={subagent.provider ?? ''}
          testid="cset-subprovider"
          label="Sub-agent provider"
          options={[
            { value: '', label: tr('Follow chat') },
            { value: 'openai', label: 'OpenAI' },
            { value: 'anthropic', label: 'Anthropic' },
            { value: 'gemini', label: 'Google Gemini' },
            { value: 'ollama', label: 'Ollama' },
            { value: 'groq', label: 'Groq' },
            { value: 'custom', label: 'Custom / local' },
          ]}
          onChange={(v) => void apply({ subagent: { provider: v } })}
        />
      ),
      isDefault: (subagent.provider ?? '') === '',
      reset: () => void apply({ subagent: { provider: '' } }),
    },
    {
      section: 'subagent',
      id: 'subworker',
      /*
       * The list itself, not a door to it.
       *
       * This section is now the only home for sub-agent settings, so sending the
       * reader to another page to see their own workers would defeat the move.
       * `CustomSubagentsCard` is the Settings page's own component, reused
       * verbatim — one implementation, so the two cannot disagree about what a
       * worker is.
       */
      label: 'Your sub-agents',
      hint: 'Workers you defined yourself. Each one reads only; you approve any write.',
      words: 'subagent sub-agent custom worker list mine define edit delete active',
      ctl: <CustomSubagentsCard />,
      /* Holds a list, not a value: nothing to reset and nothing to compare
         against a default. */
      isDefault: true,
    },

    /* ── MCP server ──────────────────────────────────────────────────────── */

    /* ── Avatar ──────────────────────────────────────────────────────────── */
    {
      section: 'appearance',
      id: 'myavatar',
      label: 'My avatar',
      hint: 'The picture shown beside your own messages.',
      words: 'appearance avatar picture me user photo profile image',
      ctl: (
        <button
          className="btn btn-sm"
          data-testid="cset-myavatar"
          onClick={() => {
            const st = useStore.getState();
            st.setActivity('settings');
            st.setSettingsOpen(true);
            void import('../../lib/settingsStore').then((m) =>
              m.useSettingsUi.getState().setSection('agents'),
            );
          }}
        >
          {agents.userAvatarPath ? tr('Change…') : tr('Choose…')}
        </button>
      ),
      isDefault: !agents.userAvatarPath,
    },
    {
      section: 'appearance',
      id: 'robotavatar',
      label: 'Assistant avatar',
      hint: 'Show a mark beside the assistant’s messages.',
      words: 'appearance avatar assistant robot mark message icon',
      ctl: (
        <Toggle
          checked={agents.chatAvatar !== false}
          testid="cset-robotavatar"
          label="Assistant avatar"
          onChange={(v) => void apply({ agents: { chatAvatar: v } })}
        />
      ),
      isDefault: (agents.chatAvatar !== false) === true,
      reset: () => void apply({ agents: { chatAvatar: true } }),
    },

    /* ── Extensions ──────────────────────────────────────────────────────── */

    /* ── Write-guard rules, one row each ───────────────────────────────────
     * Generated from the rule catalogue rather than typed out: the list is the
     * single source of truth for which rules exist, and a hand-written row per
     * rule would drift the moment one is added to the catalogue.
     *
     * `disabled` stores the rules that are OFF, so the checkbox is inverted
     * against it — that is the schema's shape, not a preference.
     */
    ...RULES_BAWAAN.map((rule) => {
      const mati = (settings.rules?.disabled ?? []).includes(rule.id);
      return {
        section: 'rules' as const,
        id: `rule-${rule.id}`,
        label: rule.id.replace(/-/g, ' '),
        hint: rule.pesan,
        words: `rules guard write ${rule.id.replace(/-/g, ' ')} ${rule.pesan}`,
        ctl: (
          <Toggle
            checked={!mati}
            testid={`cset-rule-${rule.id}`}
            label={rule.id}
            disabled={!rulesOn}            onChange={(nyala) => {
              const now = new Set(settings.rules?.disabled ?? []);
              if (nyala) now.delete(rule.id);
              else now.add(rule.id);
              void apply({ rules: { disabled: [...now] } });
            }}
          />
        ),
        isDefault: !mati,
        reset: () => {
          const now = new Set(settings.rules?.disabled ?? []);
          now.delete(rule.id);
          void apply({ rules: { disabled: [...now] } });
        },
      };
    }),

    /* ── Extension trust ─────────────────────────────────────────────────── */
  ];

  const q = cari.trim().toLowerCase();

  /*
   * VSCode's `@modified` / `@default` filters.
   *
   * A leading `@word` switches the search from text matching to a predicate over
   * the whole list, and the remaining words then filter within that — which is
   * exactly how the reference behaves and why the two can be combined
   * (`@modified agent` = changed settings in the Agent section).
   */
  const at = q.startsWith('@') ? q.slice(1).split(/\s+/)[0] : null;
  const sisa = at ? q.slice(at.length + 1).trim() : q;
  const filterAktif =
    at === 'modified' || at === 'changed' ? 'modified' : at === 'default' ? 'default' : null;

  /* Text match on the part after the `@word`, so `@modified agent` narrows to
     rows whose own words contain "agent". */
  const cocokTeks = (r: RowDef) =>
    !sisa || r.label.toLowerCase().includes(sisa) || (r.words ?? '').toLowerCase().includes(sisa);

  /* One predicate for every row, used by both the count and the render — the
     two cannot drift apart because there is only one of them. */
  const cocok = (r: RowDef) => {
    if (!cocokTeks(r)) return false;
    if (filterAktif === 'modified') return !r.isDefault;
    if (filterAktif === 'default') return r.isDefault;
    return true;
  };

  /* A section renders when its own row is selected (no query) or when it still
     has a row left after filtering (query). Without the second case a search
     that matched one row would leave the other sections as bare headings. */
  const tampilSection = (id: SectionId) =>
    q === '' ? bagian === id : rows.some((r) => r.section === id && cocok(r));

  const rowsOf = (id: SectionId) => rows.filter((r) => r.section === id && cocok(r));


  /* The "N found" readout. The full list while no query is active, so the
     number and the page always describe each other. */
  const jumlah = rows.filter(cocok).length;

  /* How many rows in a section have been changed, for its Reset button. A
     section with nothing changed gets no button: a control that would do
     nothing is worse than no control. */
  const diubahDi = (id: SectionId) => rows.filter((r) => r.section === id && !r.isDefault).length;

  return (
    <div className="cset-page" data-testid="cset-page">
      <div
        className="cset-topbar"
        /* The popup's drag handle when there is one; a plain header in the
           editor home, where nothing floats and there is nothing to drag. */
        {...(onDragStart ? { 'data-drag-handle': true, onPointerDown: onDragStart } : {})}
        style={onDragStart ? { cursor: 'grab' } : undefined}
      >
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
            {SECTIONS.map((s) => {
              const n = diubahDi(s.id);
              return (
                <button
                  key={s.id}
                  className={`cset-nav-item${bagian === s.id ? ' is-active' : ''}`}
                  data-testid={`cset-nav-${s.id}`}
                  aria-current={bagian === s.id}
                  onClick={() => setBagian(s.id)}
                >
                  {tr(s.label)}
                  {/* How many rows in this section are off their defaults, so
                      the column says where the changes are without opening every
                      section. Absent at zero rather than showing "0". */}
                  {n > 0 && (
                    <span className="cset-nav-jum" data-testid={`cset-nav-n-${s.id}`}>
                      {n}
                    </span>
                  )}
                </button>
              );
            })}
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
              {SECTIONS.filter((s) => tampilSection(s.id)).map((s) => {
                const diubah = diubahDi(s.id);
                return (
                  <Section key={s.id} title={s.label}>
                    {/*
                      * Reset lives as the FIRST CHILD ROW, not in the heading's
                      * `aksi` slot.
                      *
                      * In the slot it rendered and hit-tested correctly but its
                      * onClick never ran, with no error — while every control in
                      * `children` (selects, toggles, buttons) works. The heading
                      * is a text element; a control that must run belongs in the
                      * same list as the other controls.
                      */}
                    {diubah > 0 && (
                      <div className="set-row cset-reset-row">
                        <div className="set-row-label">
                          <span className="set-label">{tr('Reset this section')}</span>
                          <span className="set-hint">
                            {tf('Put {n} changed setting(s) back to their defaults.', {
                              n: diubah,
                            })}
                          </span>
                        </div>
                        <div className="set-row-control">
                          <button
                            className="btn btn-sm"
                            type="button"
                            data-testid={`cset-reset-${s.id}`}
                            onClick={() => {
                              /*
                               * Reversed, and that matters.
                               *
                               * Some resets write values OTHERS depend on:
                               * `setRunMode` forces `agentMode` to 'agent' (the
                               * run modes only mean anything to an agent, so
                               * choosing one also chooses to run as one). Reset in
                               * document order and the Mode section's
                               * `dispatch` reset is immediately undone by the
                               * `runmode` reset that follows it — which is exactly
                               * why this button appeared to do nothing.
                               *
                               * Last-to-first puts the depended-on write down
                               * first, so a later reset cannot clobber it.
                               */
                              const baris = rowsOf(s.id);
                              for (let i = baris.length - 1; i >= 0; i--) baris[i].reset?.();
                            }}
                          >
                            {tr('Reset')}
                          </button>
                        </div>
                      </div>
                    )}
                    {rowsOf(s.id).map((r) => (
                      <Row key={r.id} label={r.label} hint={r.hint} testid={`cset-row-${r.id}`}>
                        {/* The modified mark sits with the control, not the
                            label: it says "this value is not the default", which
                            is a fact about the value. */}
                        {r.isDefault ? (
                          r.ctl
                        ) : (
                          <span className="cset-mod">
                            <span className="cset-mod-badge" data-testid={`cset-mod-${r.id}`}>
                              {tr('Modified')}
                            </span>
                            {r.ctl}
                          </span>
                        )}
                      </Row>
                    ))}
                  </Section>
                );
              })}

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
  /*
   * Whether this row currently holds its default value, for the `@modified`
   * filter and the "Modified" badge. Computed at build time from the same
   * value the control shows, so a row cannot be marked default while its
   * control is showing something else.
   */
  isDefault: boolean;
  /*
   * Put this row back to its default. Omitted for rows that only LINK
   * somewhere (Models, Custom instructions): they hold no value of their own,
   * so there is nothing to reset and a Reset button would lie.
   */
  reset?: () => void;
}
