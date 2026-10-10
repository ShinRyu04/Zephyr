import { useEffect, useState } from 'react';
import { useAi, type ReasoningEffort } from '../../lib/aiStore';
import { useStore } from '../../lib/store';
import { useAiDebug } from '../../lib/aiDebugStore';
import { useToolGate } from '../../lib/toolGate';
import { usePersona } from '../../lib/personaStore';
import { useAgentCustom } from '../../lib/agentCustomStore';
import { useSettingsUi } from '../../lib/settingsStore';
import { useT, tf } from '../../lib/i18n';
import { Row, Section, Select, TextInput, Toggle, VoiceKeyRow } from '../settings/SettingsControls';
import type { ApprovalMode } from '../../lib/types';
import { RULES_BAWAAN } from '../../lib/rulesCatalog';
import { CLI_TABS } from '../../lib/aiTabsStore';
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
  { id: 'persona', label: 'Persona' },
  { id: 'voice', label: 'Voice' },
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

  /* Persona: which identity is layered onto the prompt, and the list to pick
     from. Loaded on mount because the store starts empty and only filled itself
     from the Settings page — a reader who never opened Settings would see one
     option and conclude the feature was missing. */
  const daftarPersona = usePersona((s) => s.daftar);
  const personaAktif = usePersona((s) => s.aktif);
  const setPersonaAktif = usePersona((s) => s.setAktif);
  const muatPersona = usePersona((s) => s.muat);
  useEffect(() => {
    if (daftarPersona.length === 0) muatPersona();
  }, [daftarPersona.length, muatPersona]);

  /*
   * Load the key list on mount.
   *
   * `VoiceKeyRow` reads `useSettingsUi.keys`, and the only thing that ever
   * filled it was the Models page. Without this, a key saved earlier shows as
   * "no key" here — and pressing Save would look like it failed while it
   * actually worked, which is the worst of both.
   */
  useEffect(() => {
    void useSettingsUi.getState().loadKeys();
  }, []);

  /* Settings-backed fields. */
  const settings = useStore((s) => s.settings);
  const apply = useStore((s) => s.applySettings);
  const models = settings.models;
  /* The provider a voice key falls back to when its own provider is unset —
     the same rule the Voice/Mic settings pages use, so a key saved here and one
     saved there land on the same entry. */
  const providerAktif = models.activeProvider || 'custom';
  const agents = settings.agents;
  const voice = settings.voice;
  const mic = settings.mic;
  const rules = settings.rules;
  /* Whether the guard is on at all. The per-rule switches below are dead
     while it is off, so they render disabled rather than pretending to work. */
  const rulesOn = rules?.enabled === true;

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
      isDefault: true,
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
      isDefault: true,
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
      isDefault: (voice?.enabled !== false) === true,
      reset: () => void apply({ voice: { enabled: true } }),
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
      isDefault: (voice?.speakReplies ?? false) === false,
      reset: () => void apply({ voice: { speakReplies: false } }),
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
      isDefault: (voice?.skipCode !== false) === true,
      reset: () => void apply({ voice: { skipCode: true } }),
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
      isDefault: (mic?.enabled !== false) === true,
      reset: () => void apply({ mic: { enabled: true } }),
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
      isDefault: (mic?.autoSend ?? false) === false,
      reset: () => void apply({ mic: { autoSend: false } }),
    },
    {
      section: 'voice',
      id: 'dictlang',
      label: 'Dictation language',
      hint: 'The language the microphone expects you to speak.',
      words: 'voice mic dictation language speech input locale bcp47',
      ctl: (
        <Select
          value={mic?.lang ?? 'en-US'}
          testid="cset-dictlang"
          label="Dictation language"
          options={[
            ['en-US', 'English (US)'],
            ['en-GB', 'English (UK)'],
            ['id-ID', 'Bahasa Indonesia'],
            ['ja-JP', '日本語'],
            ['ko-KR', '한국어'],
            ['zh-CN', '中文 (简体)'],
            ['es-ES', 'Español'],
            ['fr-FR', 'Français'],
            ['de-DE', 'Deutsch'],
            ['pt-BR', 'Português (BR)'],
            ['ar-SA', 'العربية'],
          ].map(([value, label]) => ({ value, label }))}
          onChange={(v) => void apply({ mic: { lang: v } })}
        />
      ),
      isDefault: (mic?.lang ?? 'en-US') === 'en-US',
      reset: () => void apply({ mic: { lang: 'en-US' } }),
    },
    {
      section: 'voice',
      id: 'rate',
      label: 'Speech speed',
      hint: 'How fast answers are read aloud.',
      words: 'voice speech speed rate pace fast slow tts',
      ctl: (
        <Select
          value={String(voice?.rate ?? 1)}
          testid="cset-rate"
          label="Speech speed"
          options={[0.5, 0.75, 1, 1.25, 1.5, 2].map((n) => ({
            value: String(n),
            label: `${n}×`,
          }))}
          onChange={(v) => void apply({ voice: { rate: Number(v) } })}
        />
      ),
      isDefault: (voice?.rate ?? 1) === 1,
      reset: () => void apply({ voice: { rate: 1 } }),
    },
    {
      section: 'voice',
      id: 'vol',
      label: 'Speech volume',
      hint: 'How loud spoken answers are.',
      words: 'voice speech volume loud quiet tts',
      ctl: (
        <Select
          value={String(voice?.volume ?? 1)}
          testid="cset-vol"
          label="Speech volume"
          options={[0.2, 0.5, 0.75, 1].map((n) => ({
            value: String(n),
            label: `${Math.round(n * 100)}%`,
          }))}
          onChange={(v) => void apply({ voice: { volume: Number(v) } })}
        />
      ),
      isDefault: (voice?.volume ?? 1) === 1,
      reset: () => void apply({ voice: { volume: 1 } }),
    },
    {
      section: 'voice',
      id: 'pitch',
      label: 'Speech pitch',
      hint: 'Lower or higher voice.',
      words: 'voice speech pitch tone high low tts',
      ctl: (
        <Select
          value={String(voice?.pitch ?? 1)}
          testid="cset-pitch"
          label="Speech pitch"
          options={[0.5, 0.75, 1, 1.25, 1.5].map((n) => ({
            value: String(n),
            label: `${n}×`,
          }))}
          onChange={(v) => void apply({ voice: { pitch: Number(v) } })}
        />
      ),
      isDefault: (voice?.pitch ?? 1) === 1,
      reset: () => void apply({ voice: { pitch: 1 } }),
    },
    {
      section: 'voice',
      id: 'neural',
      label: 'Neural voice',
      hint: 'Use a provider voice instead of the one built into the system.',
      words: 'voice neural provider tts openai gemini cloud natural',
      ctl: (
        <Toggle
          checked={voice?.neuralEnabled ?? false}
          testid="cset-neural"
          label="Neural voice"
          onChange={(v) => void apply({ voice: { neuralEnabled: v } })}
        />
      ),
      isDefault: (voice?.neuralEnabled ?? false) === false,
      reset: () => void apply({ voice: { neuralEnabled: false } }),
    },
    {
      section: 'voice',
      id: 'neuralprovider',
      label: 'Neural provider',
      hint: 'Which service speaks when the neural voice is on.',
      words: 'voice neural provider tts openai ollama groq gemini custom',
      ctl: (
        <Select
          value={voice?.neuralProvider ?? ''}
          testid="cset-neuralprovider"
          label="Neural provider"
          options={[
            { value: '', label: '—' },
            { value: 'openai', label: 'OpenAI' },
            { value: 'gemini', label: 'Gemini' },
            { value: 'groq', label: 'Groq' },
            { value: 'ollama', label: 'Ollama' },
            { value: 'custom', label: 'Custom' },
          ]}
          onChange={(v) => void apply({ voice: { neuralProvider: v } })}
        />
      ),
      isDefault: (voice?.neuralProvider ?? '') === '',
      reset: () => void apply({ voice: { neuralProvider: '' } }),
    },
    {
      section: 'voice',
      id: 'neuralmodel',
      label: 'Neural model',
      hint: 'The text-to-speech model id at that provider.',
      words: 'voice neural model tts id name',
      ctl: (
        <TextInput
          value={voice?.neuralModel ?? ''}
          testid="cset-neuralmodel"
          label="Neural model"
          placeholder="e.g. tts-1"
          onChange={(v) => void apply({ voice: { neuralModel: v } })}
        />
      ),
      isDefault: (voice?.neuralModel ?? '') === '',
      reset: () => void apply({ voice: { neuralModel: '' } }),
    },
    {
      section: 'voice',
      id: 'sttprovider',
      label: 'Dictation provider',
      hint: 'Which service turns your speech into text.',
      words: 'voice mic stt dictation provider speech to text openai gemini',
      ctl: (
        <Select
          value={mic?.provider ?? ''}
          testid="cset-sttprovider"
          label="Dictation provider"
          options={[
            { value: '', label: '—' },
            { value: 'openai', label: 'OpenAI' },
            { value: 'gemini', label: 'Gemini' },
            { value: 'ollama', label: 'Ollama' },
            { value: 'custom', label: 'Custom' },
            { value: 'local', label: 'Local' },
          ]}
          onChange={(v) => void apply({ mic: { provider: v } })}
        />
      ),
      isDefault: (mic?.provider ?? '') === '',
      reset: () => void apply({ mic: { provider: '' } }),
    },
    {
      section: 'voice',
      id: 'sttmodel',
      label: 'Dictation model',
      hint: 'The speech-to-text model id at that provider.',
      words: 'voice mic stt dictation model whisper id',
      ctl: (
        <TextInput
          value={mic?.model ?? ''}
          testid="cset-sttmodel"
          label="Dictation model"
          placeholder="e.g. whisper-1"
          onChange={(v) => void apply({ mic: { model: v } })}
        />
      ),
      isDefault: (mic?.model ?? '') === '',
      reset: () => void apply({ mic: { model: '' } }),
    },
    {
      section: 'voice',
      id: 'voicekey',
      label: 'Voice API key',
      hint: 'Saved like a chat key. Empty means the provider key is used. Local servers need none.',
      words: 'voice neural api key secret token tts credential save',
      ctl: (
        <VoiceKeyRow
          provider={(voice?.neuralProvider || providerAktif) + '-voice'}
          testid="cset-voicekey"
        />
      ),
      /* A key is not a value with a default: it is either set or it is not, and
         there is nothing to "put back". It stays out of the @modified filter for
         the same reason — a saved key is configuration, not a changed setting. */
      isDefault: true,
    },
    {
      section: 'voice',
      id: 'mickey',
      label: 'Dictation API key',
      hint: 'Saved like a chat key. Empty means the provider key is used. Local servers need none.',
      words: 'voice mic dictation api key secret token stt credential save',
      ctl: (
        <VoiceKeyRow
          provider={(mic?.provider || providerAktif) + '-voice'}
          testid="cset-mickey"
        />
      ),
      isDefault: true,
    },

    {
      section: 'voice',
      id: 'voiceid',
      label: 'System voice',
      hint: 'Which voice the system uses. Empty lets the system choose.',
      words: 'voice speech voice id system platform uri pick choose',
      ctl: (
        <TextInput
          value={voice?.voiceId ?? ''}
          testid="cset-voiceid"
          label="System voice"
          placeholder={tr('System default')}
          onChange={(v) => void apply({ voice: { voiceId: v } })}
        />
      ),
      isDefault: (voice?.voiceId ?? '') === '',
      reset: () => void apply({ voice: { voiceId: '' } }),
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
      section: 'persona',
      id: 'persona',
      label: 'Active persona',
      hint: 'The identity and standing rules layered onto the system prompt.',
      words: 'persona identity agent character who zeph style rules',
      ctl: (
        <Select
          value={personaAktif}
          testid="cset-persona"
          label="Active persona"
          options={
            daftarPersona.length > 0
              ? daftarPersona.map((p) => ({ value: p.id, label: p.nama }))
              : [{ value: 'zeph', label: 'Zeph' }]
          }
          onChange={(v) => void setPersonaAktif(v)}
        />
      ),
      isDefault: personaAktif === 'zeph',
      reset: () => void setPersonaAktif('zeph'),
    },
    {
      section: 'persona',
      id: 'managepersona',
      label: 'Personas',
      hint: 'Write your own, or edit the ones that ship with Zephyr.',
      words: 'persona edit create new manage custom agent identity',
      ctl: (
        <button
          className="btn btn-sm"
          data-testid="cset-managepersona"
          onClick={() => useAgentCustom.getState().buka('agents')}
        >
          {tr('Manage personas…')}
        </button>
      ),
      isDefault: true,
    },
    {
      section: 'persona',
      id: 'skills',
      label: 'Skills & hooks',
      hint: 'Reusable instruction bundles and commands that run around tool calls.',
      words: 'persona skills hooks plugins extras automation lifecycle',
      ctl: (
        <button
          className="btn btn-sm"
          data-testid="cset-skills"
          onClick={() => useAgentCustom.getState().buka('skills')}
        >
          {tr('Open skills…')}
        </button>
      ),
      isDefault: true,
    },
    {
      section: 'voice',
      id: 'nbase',
      label: 'Neural server',
      hint: 'Your own TTS server. Empty uses the chat provider.',
      words: 'voice neural server url endpoint base local tts',
      ctl: (
        <TextInput
          value={voice?.neuralBaseUrl ?? ''}
          testid="cset-nbase"
          label="Neural server"
          placeholder="https://…"
          onChange={(v) => void apply({ voice: { neuralBaseUrl: v } })}
        />
      ),
      isDefault: (voice?.neuralBaseUrl ?? '') === '',
      reset: () => void apply({ voice: { neuralBaseUrl: '' } }),
    },
    {
      section: 'voice',
      id: 'nvoice',
      label: 'Neural voice',
      hint: 'The provider voice id. Empty uses the provider default.',
      words: 'voice neural voice id provider pick tts',
      ctl: (
        <TextInput
          value={voice?.neuralVoiceId ?? ''}
          testid="cset-nvoice"
          label="Neural voice"
          placeholder={tr('Provider default')}
          onChange={(v) => void apply({ voice: { neuralVoiceId: v } })}
        />
      ),
      isDefault: (voice?.neuralVoiceId ?? '') === '',
      reset: () => void apply({ voice: { neuralVoiceId: '' } }),
    },
    {
      section: 'voice',
      id: 'nvol',
      label: 'Neural volume',
      hint: 'Above 100% boosts, which the system voice cannot do.',
      words: 'voice neural volume loud boost tts',
      ctl: (
        <Select
          value={String(voice?.neuralVolume ?? 1)}
          testid="cset-nvol"
          label="Neural volume"
          options={[0.5, 1, 1.25, 1.5, 2].map((n) => ({
            value: String(n),
            label: `${Math.round(n * 100)}%`,
          }))}
          onChange={(v) => void apply({ voice: { neuralVolume: Number(v) } })}
        />
      ),
      isDefault: (voice?.neuralVolume ?? 1) === 1,
      reset: () => void apply({ voice: { neuralVolume: 1 } }),
    },
    {
      section: 'voice',
      id: 'nfollow',
      label: 'Voice follows language',
      hint: 'Pick the neural voice from the language the answer came in.',
      words: 'voice neural follow language auto match tts',
      ctl: (
        <Toggle
          checked={voice?.neuralFollowLang !== false}
          testid="cset-nfollow"
          label="Voice follows language"
          onChange={(v) => void apply({ voice: { neuralFollowLang: v } })}
        />
      ),
      isDefault: (voice?.neuralFollowLang !== false) === true,
      reset: () => void apply({ voice: { neuralFollowLang: true } }),
    },
    {
      section: 'voice',
      id: 'mbase',
      label: 'Dictation server',
      hint: 'Your own speech-to-text server. Empty uses the provider default.',
      words: 'voice mic dictation server url endpoint stt base',
      ctl: (
        <TextInput
          value={mic?.baseUrl ?? ''}
          testid="cset-mbase"
          label="Dictation server"
          placeholder="https://…"
          onChange={(v) => void apply({ mic: { baseUrl: v } })}
        />
      ),
      isDefault: (mic?.baseUrl ?? '') === '',
      reset: () => void apply({ mic: { baseUrl: '' } }),
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
      isDefault: true,
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
      isDefault: true,
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
      isDefault: debugBuka === false,
      reset: () => {
        if (debugBuka) useAiDebug.getState().toggle();
      },
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
    {
      section: 'agent',
      id: 'startcmd',
      label: 'CLI start command',
      hint: 'What runs when a CLI agent pane opens. Empty uses the CLI default.',
      words: 'agent cli start command launch terminal pane host',
      ctl: (
        <button
          className="btn btn-sm"
          data-testid="cset-startcmd"
          onClick={() => {
            const st = useStore.getState();
            st.setActivity('settings');
            st.setSettingsOpen(true);
            void import('../../lib/settingsStore').then((m) =>
              m.useSettingsUi.getState().setSection('agents'),
            );
          }}
        >
          {tr('Per CLI…')}
        </button>
      ),
      isDefault: true,
    },
    {
      section: 'tools',
      id: 'mcpterm',
      label: 'MCP may run commands',
      hint: 'Let outside tools on the MCP port drive the terminal.',
      words: 'tools mcp terminal control external commands server port',
      ctl: (
        <Toggle
          checked={settings.mcp?.allowTerminalControl === true}
          testid="cset-mcpterm"
          label="MCP may run commands"
          onChange={(v) => void apply({ mcp: { allowTerminalControl: v } })}
        />
      ),
      isDefault: (settings.mcp?.allowTerminalControl === true) === false,
      reset: () => void apply({ mcp: { allowTerminalControl: false } }),
    },
    {
      section: 'subagent',
      id: 'subcustom',
      label: 'Custom sub-agents',
      hint: 'Read-only workers you defined yourself, with their own prompts.',
      words: 'subagent sub-agent custom worker define prompt read-only',
      ctl: (
        <button
          className="btn btn-sm"
          data-testid="cset-subcustom"
          onClick={() => useAgentCustom.getState().buka('agents')}
        >
          {tr('Manage…')}
        </button>
      ),
      isDefault: true,
    },
    {
      section: 'voice',
      id: 'speaklang',
      label: 'Spoken language',
      hint: 'Which language the voice reads in when it is not following the answer.',
      words: 'voice speech language spoken read fallback bcp47',
      ctl: (
        <TextInput
          value={voice?.inputLang ?? 'en-US'}
          testid="cset-speaklang"
          label="Spoken language"
          placeholder="en-US"
          onChange={(v) => void apply({ voice: { inputLang: v } })}
        />
      ),
      isDefault: (voice?.inputLang ?? 'en-US') === 'en-US',
      reset: () => void apply({ voice: { inputLang: 'en-US' } }),
    },
    {
      section: 'advanced',
      id: 'agenttool',
      label: 'Tool sets & permissions',
      hint: 'Which tools exist at all, and which run without asking.',
      words: 'advanced tools tool sets permissions allow commands gate',
      ctl: (
        <button
          className="btn btn-sm"
          data-testid="cset-agenttool"
          onClick={() => {
            const st = useStore.getState();
            st.setActivity('settings');
            st.setSettingsOpen(true);
            void import('../../lib/settingsStore').then((m) =>
              m.useSettingsUi.getState().setSection('permissions'),
            );
          }}
        >
          {tr('Open…')}
        </button>
      ),
      isDefault: true,
    },
    {
      section: 'advanced',
      id: 'lspoff',
      label: 'Language servers',
      hint: 'The analysers that give the agent code intelligence.',
      words: 'advanced language servers lsp code intelligence diagnostics',
      ctl: (
        <button
          className="btn btn-sm"
          data-testid="cset-lspoff"
          onClick={() => {
            const st = useStore.getState();
            st.setActivity('settings');
            st.setSettingsOpen(true);
            void import('../../lib/settingsStore').then((m) =>
              m.useSettingsUi.getState().setSection('lsp'),
            );
          }}
        >
          {tr('Open…')}
        </button>
      ),
      isDefault: true,
    },
    {
      section: 'advanced',
      id: 'personaadv',
      label: 'Personas & instructions',
      hint: 'Identities, standing instructions, and per-agent rules.',
      words: 'advanced persona instructions agent custom rules identity',
      ctl: (
        <button
          className="btn btn-sm"
          data-testid="cset-personaadv"
          onClick={() => useAgentCustom.getState().buka('overview')}
        >
          {tr('Open…')}
        </button>
      ),
      isDefault: true,
    },

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

    /* ── MCP server ──────────────────────────────────────────────────────── */
    {
      section: 'tools',
      id: 'mcpon',
      label: 'MCP server',
      hint: 'Let outside tools talk to Zephyr over a local port.',
      words: 'tools mcp server enable port external control agent',
      ctl: (
        <Toggle
          checked={settings.mcp?.enabled === true}
          testid="cset-mcpon"
          label="MCP server"
          onChange={(v) => void apply({ mcp: { enabled: v } })}
        />
      ),
      isDefault: (settings.mcp?.enabled === true) === false,
      reset: () => void apply({ mcp: { enabled: false } }),
    },
    {
      section: 'tools',
      id: 'mcpport',
      label: 'MCP port',
      hint: 'The local port the server listens on.',
      words: 'tools mcp port listen local server number',
      ctl: (
        <Select
          value={String(settings.mcp?.port ?? 9222)}
          testid="cset-mcpport"
          label="MCP port"
          options={[9222, 9224, 9225, 9226, 9228].map((n) => ({
            value: String(n),
            label: String(n),
          }))}
          onChange={(v) => void apply({ mcp: { port: Number(v) } })}
        />
      ),
      isDefault: (settings.mcp?.port ?? 9222) === 9222,
      reset: () => void apply({ mcp: { port: 9222 } }),
    },

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
    {
      section: 'advanced',
      id: 'exts',
      label: 'Extensions',
      hint: 'Installed extensions and which of them are switched on.',
      words: 'advanced extensions plugins install enable disable market',
      ctl: (
        <button
          className="btn btn-sm"
          data-testid="cset-exts"
          onClick={() => {
            const st = useStore.getState();
            st.setActivity('settings');
            st.setSettingsOpen(true);
            void import('../../lib/settingsStore').then((m) =>
              m.useSettingsUi.getState().setSection('extensions'),
            );
          }}
        >
          {tr(`${settings.extensions?.enabled?.length ?? 0} enabled…`)}
        </button>
      ),
      isDefault: true,
    },
    {
      section: 'advanced',
      id: 'root',
      label: 'Workspace folders',
      hint: 'Folders the agent is allowed to read and write.',
      words: 'advanced workspace folders roots allow path permission',
      ctl: (
        <button
          className="btn btn-sm"
          data-testid="cset-root"
          onClick={() => {
            const st = useStore.getState();
            st.setActivity('settings');
            st.setSettingsOpen(true);
            void import('../../lib/settingsStore').then((m) =>
              m.useSettingsUi.getState().setSection('security'),
            );
          }}
        >
          {tr('Open…')}
        </button>
      ),
      isDefault: true,
    },
    {
      section: 'advanced',
      id: 'micadv',
      label: 'Dictation engine',
      hint: 'Where speech-to-text runs, and which model it uses.',
      words: 'advanced mic dictation speech text engine provider model',
      ctl: (
        <button
          className="btn btn-sm"
          data-testid="cset-micadv"
          onClick={() => {
            const st = useStore.getState();
            st.setActivity('settings');
            st.setSettingsOpen(true);
            void import('../../lib/settingsStore').then((m) =>
              m.useSettingsUi.getState().setSection('mic'),
            );
          }}
        >
          {tr('Open…')}
        </button>
      ),
      isDefault: true,
    },

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
    {
      section: 'advanced',
      id: 'trust',
      label: 'Extension trust',
      hint: 'Which extensions may run code, and which are sandboxed.',
      words: 'advanced extension trust allow sandbox code run permission',
      ctl: (
        <button
          className="btn btn-sm"
          data-testid="cset-trust"
          onClick={() => {
            const st = useStore.getState();
            st.setActivity('settings');
            st.setSettingsOpen(true);
            void import('../../lib/settingsStore').then((m) =>
              m.useSettingsUi.getState().setSection('extensions'),
            );
          }}
        >
          {tr(`${Object.keys(settings.extensions?.trust ?? {}).length} set…`)}
        </button>
      ),
      isDefault: true,
    },
    {
      section: 'advanced',
      id: 'registry',
      label: 'Extension registry',
      hint: 'Where the extension list is fetched from.',
      words: 'advanced extension registry url market source fetch',
      ctl: (
        <TextInput
          value={settings.extensions?.registryUrl ?? ''}
          testid="cset-registry"
          label="Extension registry"
          placeholder="https://…"
          onChange={(v) => void apply({ extensions: { registryUrl: v } })}
        />
      ),
      isDefault: (settings.extensions?.registryUrl ?? '') === '',
      reset: () => void apply({ extensions: { registryUrl: '' } }),
    },
    {
      section: 'advanced',
      id: 'mcpcli',
      label: 'MCP config writing',
      hint: 'Which CLI config files Zephyr may edit to register its MCP server.',
      words: 'advanced mcp cli config write register server claude codex',
      ctl: (
        <button
          className="btn btn-sm"
          data-testid="cset-mcpcli"
          onClick={() => {
            const st = useStore.getState();
            st.setActivity('settings');
            st.setSettingsOpen(true);
            void import('../../lib/settingsStore').then((m) =>
              m.useSettingsUi.getState().setSection('mcp'),
            );
          }}
        >
          {settings.mcp?.writeToCli?.length
            ? tr(`${settings.mcp.writeToCli.length} selected…`)
            : tr('Choose…')}
        </button>
      ),
      isDefault: (settings.mcp?.writeToCli?.length ?? 0) === 0,
    },
    {
      section: 'advanced',
      id: 'mcptoken',
      label: 'MCP token',
      hint: 'The shared secret outside tools must send. Empty means no check.',
      words: 'advanced mcp token secret auth bearer key',
      ctl: (
        <TextInput
          value=""
          testid="cset-mcptoken"
          label="MCP token"
          placeholder={settings.mcp?.token ? tr('Set — type to replace') : tr('Not set')}
          password
          onChange={(v) => void apply({ mcp: { token: v } })}
        />
      ),
      isDefault: !settings.mcp?.token,
    },
    {
      section: 'advanced',
      id: 'idle',
      label: 'Language server idle timeout',
      hint: 'How long an analyser waits before it is shut down.',
      words: 'advanced lsp language server idle timeout shutdown memory',
      ctl: (
        <button
          className="btn btn-sm"
          data-testid="cset-lspidle"
          onClick={() => {
            const st = useStore.getState();
            st.setActivity('settings');
            st.setSettingsOpen(true);
            void import('../../lib/settingsStore').then((m) =>
              m.useSettingsUi.getState().setSection('lsp'),
            );
          }}
        >
          {tr('Open…')}
        </button>
      ),
      isDefault: true,
    },

    /* ── One start command per detected CLI ────────────────────────────────
     * Generated from CLI_TABS: which CLIs exist is the catalogue's business, so
     * a row per CLI is derived rather than typed — adding a CLI must not mean
     * remembering to add a row here.
     */
    ...CLI_TABS.map((cli) => {
      const cmd = (settings.agents?.startCommands?.[cli.id] ?? []).join(' && ');
      return {
        section: 'agent' as const,
        id: `start-${cli.id}`,
        label: `${cli.label} start command`,
        hint: 'What runs when this CLI opens. Empty uses the CLI default.',
        words: `agent cli start command ${cli.label} launch terminal pane host`,
        ctl: (
          <TextInput
            value={cmd}
            testid={`cset-start-${cli.id}`}
            label={`${cli.label} start command`}
            placeholder={tr('CLI default')}
            mono
            onChange={(v) => {
              const next = { ...(settings.agents?.startCommands ?? {}) };
              const parts = v
                .split('&&')
                .map((x) => x.trim())
                .filter(Boolean);
              if (parts.length === 0) delete next[cli.id];
              else next[cli.id] = parts;
              void apply({ agents: { startCommands: next } });
            }}
          />
        ),
        isDefault: cmd === '',
        reset: () => {
          const next = { ...(settings.agents?.startCommands ?? {}) };
          delete next[cli.id];
          void apply({ agents: { startCommands: next } });
        },
      };
    }),

    /* ── Outside connections ─────────────────────────────────────────────── */
    {
      section: 'advanced',
      id: 'sshhosts',
      label: 'Recent SSH hosts',
      hint: 'Servers Zephyr has connected to lately.',
      words: 'advanced ssh host server remote connect recent',
      ctl: (
        <button
          className="btn btn-sm"
          data-testid="cset-sshhosts"
          onClick={() => {
            const st = useStore.getState();
            st.setActivity('settings');
            st.setSettingsOpen(true);
            void import('../../lib/settingsStore').then((m) =>
              m.useSettingsUi.getState().setSection('ssh'),
            );
          }}
        >
          {tr(`${settings.ssh?.recentHosts?.length ?? 0} saved…`)}
        </button>
      ),
      isDefault: (settings.ssh?.recentHosts?.length ?? 0) === 0,
    },
    {
      section: 'advanced',
      id: 'announce',
      label: 'Announcements',
      hint: 'Product notes you have already seen. Clearing shows them again.',
      words: 'advanced announcements notes news seen dismiss clear reset',
      ctl: (
        <button
          className="btn btn-sm"
          data-testid="cset-announce"
          onClick={() => void apply({ update: { seenAnnouncements: [] } })}
        >
          {settings.update?.seenAnnouncements?.length
            ? tr(`Clear ${settings.update.seenAnnouncements.length}`)
            : tr('None seen')}
        </button>
      ),
      isDefault: (settings.update?.seenAnnouncements?.length ?? 0) === 0,
    },
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
