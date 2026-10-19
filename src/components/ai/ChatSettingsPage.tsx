import { useCallback, useEffect, useState } from 'react';
import { useAi, type ReasoningEffort } from '../../lib/aiStore';
import { useStore } from '../../lib/store';
import { useAiChatSettings, type ChatSeksi } from '../../lib/chatSettingsStore';

import { useToolGate } from '../../lib/toolGate';
import { useSettingsUi } from '../../lib/settingsStore';
import { useT, tf } from '../../lib/i18n';
import { Row, Section, Select, TextInput, Toggle } from '../settings/SettingsControls';
import type { ApprovalMode } from '../../lib/types';
import { RULES_BAWAAN } from '../../lib/rulesCatalog';
import { PROVIDERS, providerSiap, modelTersedia, PROVIDER_BY_ID } from '../../lib/modelCatalog';
import {
  HYDRA_MAX_REQUESTS_BAWAAN,
  HYDRA_MAX_REQUESTS_LIMIT,
  pilihanTersimpan,
} from '../../lib/hydraFusion';
import { CustomSubagentsCard } from '../settings/SectionsAdvanced';
import { bukaPanel } from '../../lib/bukaPanel';
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

/**
 * Reasoning effort, matching the composer's Reasoning chip. '' = provider default.
 */
const EFFORT: { id: string; label: string }[] = [
  { id: '', label: 'Auto' },
  { id: 'minimal', label: 'Minimal' },
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
  { id: 'ultra', label: 'Ultra' },
];

/**
 * Host dari teks allowlist: satu per baris, di-trim, baris kosong dibuang.
 *
 * Skema dan jejak URL ikut dibuang kalau ada — "HTTPS://Docs.Example.com/x"
 * menjadi "docs.example.com" — karena yang disimpan dan yang dicocokkan pagar
 * (`hostDiAllowlist`) hanya HOST. Menyimpan URL utuh membuat entri yang tidak
 * pernah cocok, yaitu penolakan yang gagal diam-diam.
 */
function hostDariTeks(teks: string): string[] {
  return teks
    .split(/\r?\n/)
    .map((b) =>
      b
        .trim()
        .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
        .replace(/\/.*$/, '')
        .toLowerCase(),
    )
    .filter((b) => b !== '');
}

/**
 * The sections, in the order the left column lists them.
 *
 * `label` is both the nav text and the section heading, so a reader who clicks
 * "Agent" lands on a heading that says the same word.
 */
const SECTIONS: ReadonlyArray<{ id: ChatSeksi; label: string }> = [
  { id: 'mode', label: 'Mode' },
  { id: 'agent', label: 'Agent' },
  { id: 'context', label: 'Context' },
  { id: 'subagent', label: 'Sub-agents' },
  { id: 'tools', label: 'Tools' },
  { id: 'web', label: 'Web content' },
  { id: 'rules', label: 'Rules' },
  { id: 'models', label: 'Models' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'session', label: 'Session' },
  { id: 'advanced', label: 'Advanced' },
];

type SectionId = ChatSeksi;

export default function ChatSettingsPage({
  onClose,
  onOpenEditor,
  onDragStart,
  seksiAwal,
}: {
  /*
   * Both of these are now OPTIONAL, because the page has a third home.
   *
   * It started as an overlay (close + "open in editor") and gained an editor-tab
   * home (neither). It now also lives in its own OS window, where the platform
   * draws the close button and there is no editor to move into - so passing
   * either would put a control on screen that duplicates the window frame or
   * points at nothing.
   */
  onClose?: () => void;
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
  /**
   * The section named by the URL that opened this window
   * (`#panel=chat-settings&s=context`).
   *
   * Needed because the window is a separate WebView: the store's `seksi` field
   * is set in the OPENING window and is invisible here, so the only way a door
   * can name a destination across windows is the URL.
   */
  seksiAwal?: string | null;
}) {
  const tr = useT();
  /*
   * A door can NAME the section it opens on: `bukaDi('subagent')` from the
   * sub-agent panel. Read as the initial state and then CONSUMED, so the plain
   * "Chat Settings" row - which names no section - still lands on Mode instead
   * of on whatever the last caller asked for. Providers, keys and the model list
   * are not sections of this page any more: they open the AI Models pop-up.
   */
  const seksiDiminta = useAiChatSettings((s) => s.seksi);
  const [bagian, setBagian] = useState<SectionId>(
    ((seksiAwal ?? seksiDiminta) ?? 'mode') as SectionId,
  );
  useEffect(() => {
    if (!seksiDiminta) return;
    setBagian(seksiDiminta);
    useAiChatSettings.getState().seksiTerpakai();
  }, [seksiDiminta]);
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
  /*
   * Read from aiStore, not local state.
   *
   * These were three useState booleans, so flipping one changed the switch and
   * nothing else - the transcript never saw the value. The chat reads them from
   * the store now, which is why they have to live there.
   */
  const showThinking = useAi((s) => s.showThinking);
  const showStamps = useAi((s) => s.showStamps);
  const showDividers = useAi((s) => s.showDividers);
  const showThinkingBar = useAi((s) => s.showThinkingBar);
  const setShowThinking = useAi((s) => s.setShowThinking);
  const setShowStamps = useAi((s) => s.setShowStamps);
  const setShowDividers = useAi((s) => s.setShowDividers);
  const setShowThinkingBar = useAi((s) => s.setShowThinkingBar);
  /* User or Workspace. See the tabs' own comment: only User has anything in it
     today, and the Workspace pane says so rather than pretending otherwise. */
  const [scope, setScope] = useState<'user' | 'workspace'>('user');

  /* Conversation state — the same fields the composer chips read. */
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
  const hydra = settings.hydrafusion;
  /* What the LAST HydraFusion run did. Read rather than recomputed: after the
     answer lands, "which model wrote this" is a fact about the past, and the
     plan that produced it is gone by then. */
  const hydraTerakhir = useAi((s) => s.hydraTerakhir);
  /* Whether the guard is on at all. The per-rule switches below are dead
     while it is off, so they render disabled rather than pretending to work. */
  const rulesOn = rules?.enabled === true;

  /*
   * Konten web — the SAME settings object `kebijakanIsiWeb.ts` reads through
   * `kebijakanDariSetelan(useStore.getState().settings)`, written through the
   * same `applySettings` every other row here uses. So the switch and the gate
   * cannot disagree: there is one value, not two copies of it. Both keys are
   * optional and fail-closed — missing reads as "no permission, empty list".
   */
  const izinWeb = settings.izinIsiWeb === true;
  const allowlistWeb = settings.allowlistWeb ?? [];
  /*
   * The allowlist textarea keeps its own TEXT.
   *
   * The store holds the parsed host list, but a textarea bound straight to it
   * would rewrite its own value on every keystroke: typing "example.com" stores
   * each prefix, and a value round-tripped through the parse can cut the caret
   * mid-word. So the text is local and the store is written ALONGSIDE it. The
   * effect below pulls the text from the store only when the store changed to
   * something this text does not already describe — a Reset or a reload — which
   * is the one moment overwriting what is in the box is the right move.
   */
  const [teksAllowlist, setTeksAllowlist] = useState(() => allowlistWeb.join('\n'));
  useEffect(() => {
    const dariSetelan = (settings.allowlistWeb ?? []).join('\n');
    setTeksAllowlist((lama) =>
      hostDariTeks(lama).join('\n') === dariSetelan ? lama : dariSetelan,
    );
  }, [settings.allowlistWeb]);

  /* Tool counts, read as primitives: the Set itself is replaced on every
     toggle, so comparing it in a selector is fine, but a derived number keeps
     this row from re-rendering on unrelated changes. */
  const jumlahToolAktif = useToolGate((s) => s.aktif.size);

  /* Escape closes the page, like any other editor-area view. In the OS-window
     home there is no `onClose` to call: the platform's own close button is the
     way out, and a second Escape handler there would fight the window. */
  useEffect(() => {
    if (!onClose) return;
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
  /*
   * Every model the tier rows can offer: only providers that are usable RIGHT
   * NOW (key + endpoint). Listing an unreachable model would let the reader map
   * a rung to a model that always errors, which turns an escalation into an
   * instant failure — the same reason the store filters candidates this way.
   */
  const opsiModel: Array<{ value: string; label: string }> = [
    /* The model the provider is CONFIGURED to use comes first: for a free-text
       provider that is the only real model there is, and it used to be missing
       from this list entirely (the catalogue row is a placeholder), so the tier
       could not be mapped to the model the reader actually runs. */
    ...PROVIDERS.map((p) => pilihanTersimpan(p.id, models.providers))
      .filter((v) => v.length > 0)
      .map((v) => {
        const [prov, model] = v.split('/');
        return { value: v, label: `${PROVIDER_BY_ID.get(prov)?.label ?? prov} · ${model}` };
      }),
    /* Then EVERY model the provider can actually run — the live API list, the
       ids the reader typed, and the catalogue's real entries. Deriving only from
       `p.models` is what made a custom gateway offer exactly one model here
       while the picker listed the whole gateway. */
    ...PROVIDERS.flatMap((p) => {
      if (!providerSiap(p, useAi.getState().hasKey(p.id), models.providers)) return [];
      const uiRemote = useSettingsUi.getState().remoteModels[p.id] ?? [];
      return modelTersedia(p.id, [], uiRemote, []).map((m) => ({
        value: `${p.id}/${m.id}`,
        label: `${p.label} · ${m.label}`,
      }));
    }),
  ];

  const rows: RowDef[] = [
    {
      /*
       * Dispatch is not a choice any more: chat was retired, so every turn is
       * an agent run and there is no second value to switch to. The row stays
       * (a reader who remembers the switch should find the answer where the
       * switch was, not a silent hole) but it states the fact instead of
       * offering a control, and it has no `reset` - there is no value of its
       * own to put back.
       */
      section: 'mode',
      id: 'dispatch',
      label: 'Dispatch',
      hint: 'Chat mode was removed; every turn runs as the agent now.',
      words: 'mode dispatch chat agent q&a answer tools act',
      ctl: (
        <span className="set-hint" data-testid="cset-mode">
          {tr('Agent mode - the AI reads files and runs commands')}
        </span>
      ),
      isDefault: true,
    },
    /*
     * No "Run mode" row.
     *
     * Interactive / Plan / Autopilot is gone from the product, not hidden: the
     * composer no longer offers it, and a Settings row for a switch nothing
     * reads is a control that lies. What it used to do - how much the agent
     * decides on its own - is now the Permissions row below, which is the same
     * question asked once.
     */
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
      section: 'agent',
      id: 'agentscustom',
      /*
       * The persona set, opened from where it is USED.
       *
       * Personas used to be a page of the editor-area Settings ("Agents"). They
       * moved to the Agent Customizations modal with the rest of the agent's own
       * configuration; this row is what keeps them reachable from the page the
       * user is already on - the same modal, and the same section, that the mode
       * menu's "Manage personas & sub-agents" row opens.
       */
      label: 'Agents & personas',
      hint: 'The personas the agent can work as, and who edits the set.',
      words: 'agent persona agents custom manage editor subagent set',
      ctl: (
        <button
          className="cset-value"
          data-testid="cset-agentcustom"
          title={tr('Opens the persona editor')}
          onClick={() => bukaPanel('agent-custom', 'agents')}
        >
          {tr('Manage personas & sub-agents')}
        </button>
      ),
      /* A door to another surface: no value of its own to reset or compare. */
      isDefault: true,
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
      hint: 'Off means every sub-agent may only read. On means they write files themselves; commands that can delete or overwrite files still need the Auto approval mode.',
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
       * Konten web — the two settings the web gate reads, at last with a face.
       *
       * `izinIsiWeb` was an opt-in that had no switch: the only way to turn it
       * on was editing settings.json by hand, which is not a setting UI, it is
       * a support ticket. The toggle is the master and the list is what the
       * master governs, so they open the section together — the same pairing
       * Rules' master switch has with the rules it guards.
       */
      section: 'web',
      id: 'izinisiweb',
      label: 'Let the agent read web pages',
      hint: 'The master switch for every web tool (browser and fetch). Off means no page content is ever requested, for any host.',
      words: 'konten web content izin permission web fetch browse read page internet allow switch',
      ctl: (
        <Toggle
          checked={izinWeb}
          testid="cset-izinisiweb"
          label="Let the agent read web pages"
          onChange={(v) => void apply({ izinIsiWeb: v })}
        />
      ),
      isDefault: izinWeb === false,
      reset: () => void apply({ izinIsiWeb: false }),
    },
    {
      section: 'web',
      id: 'allowlistweb',
      label: 'Allowed hosts',
      /*
       * One host per line, no scheme — and a host also opens its subdomains
       * (`hostDiAllowlist` matches the suffix), which the hint says because
       * otherwise the natural read is "exact host only" and the reader types
       * docs.example.com on a second line for nothing.
       */
      hint: 'Hosts the agent may read, one per line, without the scheme (example.com). A host also allows its subdomains. Empty refuses every host.',
      words: 'konten web content allowlist host domain site allowed internet fetch subdomain',
      ctl: (
        <textarea
          className="cset-textarea"
          data-testid="cset-allowlistweb"
          rows={4}
          value={teksAllowlist}
          placeholder={tr('example.com')}
          onChange={(e) => {
            const teks = e.target.value;
            setTeksAllowlist(teks);
            /* Written ALONGSIDE the text, not derived back from it: see the
               state's own comment above. The parse also strips any scheme or
               path the reader pasted, so what lands in settings.json is a host. */
            void apply({ allowlistWeb: hostDariTeks(teks) });
          }}
        />
      ),
      isDefault: allowlistWeb.length === 0,
      reset: () => {
        setTeksAllowlist('');
        /* `null` DELETES the key (mergeDalam drops nulls), which is the true
           default: no key at all, read by the gate as "no hosts allowed". */
        void apply({ allowlistWeb: null });
      },
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
      id: 'hydra',
      label: 'HydraFusion',
      /*
       * The hint names the three routes, because the reader has to be able to
       * tell what the switch WILL do before turning it on — "adaptive
       * orchestration" alone does not say that one route spends three requests.
       */
      hint:
        'Let the app pick the model and the workflow for each task: one model (single), ' +
        'a cheap draft that escalates to a stronger model when it fails (cascade), or ' +
        'draft → independent critique → revision on the hardest tasks (critique).',
      words:
        'hydra fusion orchestration model pick choose workflow adaptive escalate escalation critique revise cost cap tier cheap strong single cascade',
      ctl: (
        <Toggle
          checked={hydra?.enabled === true}
          testid="cset-hydra"
          label="HydraFusion"
          onChange={(v) => void apply({ hydrafusion: { enabled: v } })}
        />
      ),
      isDefault: (hydra?.enabled ?? false) === false,
      reset: () => void apply({ hydrafusion: { enabled: false } }),
    },
    {
      section: 'models',
      id: 'hydrantingkat',
      label: 'HydraFusion model tiers',
      hint: 'Which models stand for cheap, mid and strong. Auto takes them from the model list.',
      words: 'hydra fusion tier cheap mid strong model mapping ladder rung auto',
      ctl: (
        <div className="cset-hydra-tiers" data-testid="cset-hydratiers">
          {(['cheap', 'mid', 'strong'] as const).map((tier) => (
            <Select
              key={tier}
              value={hydra?.tiers?.[tier] ?? ''}
              testid={`cset-hydra-${tier}`}
              label={`HydraFusion ${tier} tier`}
              options={[{ value: '', label: tr('Auto (from the model list)') }, ...opsiModel]}
              /* One key per call, and `applySettings` deep-merges, so setting
                 the cheap rung cannot wipe the other two. */
              onChange={(v) => void apply({ hydrafusion: { tiers: { [tier]: v } } })}
            />
          ))}
        </div>
      ),
      isDefault: !hydra?.tiers?.cheap && !hydra?.tiers?.mid && !hydra?.tiers?.strong,
      reset: () => void apply({ hydrafusion: { tiers: { cheap: '', mid: '', strong: '' } } }),
    },
    {
      section: 'models',
      id: 'hydrabiaya',
      label: 'HydraFusion cost cap',
      hint:
        'Requests one run may spend. Escalation and critique stop at this limit.' +
        (Number(hydra?.maxRequests ?? HYDRA_MAX_REQUESTS_BAWAAN) < 3
          ? ' Below 3, the critique-and-revise route cannot run at all (it needs draft, review and revision), so every task falls back to a single model.'
          : ''),
      words: 'hydra fusion cost cap budget limit requests spend escalation stop',
      ctl: (
        <Select
          value={String(hydra?.maxRequests ?? HYDRA_MAX_REQUESTS_BAWAAN)}
          testid="cset-hydracap"
          label="HydraFusion cost cap"
          options={Array.from({ length: HYDRA_MAX_REQUESTS_LIMIT }, (_, i) => {
            const n = i + 1;
            return { value: String(n), label: `${n} ${tr('request(s)')}` };
          })}
          onChange={(v) => void apply({ hydrafusion: { maxRequests: Number(v) } })}
        />
      ),
      isDefault: (hydra?.maxRequests ?? HYDRA_MAX_REQUESTS_BAWAAN) === HYDRA_MAX_REQUESTS_BAWAAN,
      reset: () => void apply({ hydrafusion: { maxRequests: HYDRA_MAX_REQUESTS_BAWAAN } }),
    },
    {
      section: 'models',
      id: 'hydraterakhir',
      label: 'HydraFusion last route',
      hint: 'The model that produced the last answer and why the route chose it.',
      words: 'hydra fusion last route model reason why chosen answer explain',
      ctl: hydraTerakhir ? (
        <span className="cset-hydra-last" data-testid="cset-hydralast">
          <span className="set-label" data-testid="cset-hydralast-model">
            {`${hydraTerakhir.provider}/${hydraTerakhir.model}`}
          </span>
          <span className="set-hint" data-testid="cset-hydralast-why">
            {hydraTerakhir.alasan}
          </span>
          <span className="set-hint" data-testid="cset-hydralast-meta">
            {`${hydraTerakhir.request} ${tr('request(s)')} · ${hydraTerakhir.jalur} · ${hydraTerakhir.berhenti}`}
          </span>
          {/*
            * Complete accounting. Only tokens are shown, because only tokens are
            * known: Zephyr has no provider price list, so a money figure here
            * would be invented. `0/0` means no provider in the run reported
            * usage, and saying that is more honest than printing a zero cost.
            */}
          {hydraTerakhir.pemakaian && (
            <span className="set-hint" data-testid="cset-hydralast-token">
              {hydraTerakhir.pemakaian.input + hydraTerakhir.pemakaian.output > 0
                ? `${hydraTerakhir.pemakaian.input} in / ${hydraTerakhir.pemakaian.output} out ${tr('tokens')}`
                : tr('the provider reported no token usage')}
            </span>
          )}
          {/*
            * Which stages actually ran. `catatanTahap` is the honest record: a
            * route that announced a critique it did not execute says so here.
            */}
          {hydraTerakhir.catatanTahap.length > 0 && (
            <span className="set-hint" data-testid="cset-hydralast-tahap">
              {hydraTerakhir.catatanTahap.join(' · ')}
            </span>
          )}
        </span>
      ) : (
        <span className="set-hint" data-testid="cset-hydralast">
          {tr('No HydraFusion run yet in this session.')}
        </span>
      ),
      /* A report, not a setting: nothing to reset, so no badge and no Reset. */
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
      id: 'thinkbar',
      label: 'Thinking bar above the composer',
      hint: 'The “Thinking … 12s” strip shown while the agent works. Off by default.',
      words: 'appearance thinking bar progress strip spinner working composer status',
      ctl: (
        <Toggle
          checked={showThinkingBar}
          testid="cset-thinkbar"
          label="Thinking bar above the composer"
          onChange={setShowThinkingBar}
        />
      ),
      isDefault: showThinkingBar === false,
      reset: () => setShowThinkingBar(false),
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

  /*
   * How many rows have been changed since the page opened — the Save badge.
   *
   * Derived, not stored: `rows` is rebuilt every render with fresh
   * `isDefault` values, so counting it here is always current. An earlier
   * version kept this in state behind an effect and the effect's guard froze it
   * at zero, which is why the badge sat on "Saved" while switches were being
   * flipped.
   *
   * `abaikan` is the acknowledgment flag: Save sets it, and the badge reads
   * clean until the next change. Without it the count could never fall and the
   * button would look broken the moment it was used.
   */
  const [abaikan, setAbaikan] = useState(false);
  const hitungKotor = rows.filter((r) => !r.isDefault).length;

  /*
   * A new change cancels the acknowledgment, so the badge comes back the moment
   * the reader touches anything after saving. Keyed on the COUNT rather than the
   * rows: two different edits can leave the count equal, and the badge would
   * then stay hidden while a real change sat unsaved — but the count also cannot
   * catch an edit that swaps one non-default value for another. That is
   * acceptable here because the writes are immediate and persisted either way;
   * the badge is a confirmation aid, not the mechanism that stores anything.
   */
  useEffect(() => {
    if (hitungKotor > 0) setAbaikan(false);
  }, [hitungKotor]);

  const jumlahKotor = abaikan ? 0 : hitungKotor;
  const kotor = jumlahKotor > 0;

  /*
   * Publish the count and the Save action to the window's title bar.
   *
   * The bar is a SIBLING above this page (see PanelWindow), so a button drawn
   * here would be a second header - which is exactly the duplicate the reader
   * reported. The page knows what "changed" means, so it publishes; the bar
   * renders. `setSimpan` is cleared on unmount so a stale closure cannot outlive
   * the page.
   */
  const setKotorStore = useAiChatSettings((s) => s.setKotor);
  const setSimpanStore = useAiChatSettings((s) => s.setSimpan);
  useEffect(() => {
    setKotorStore(jumlahKotor);
  }, [jumlahKotor, setKotorStore]);

  /*
   * Save re-reads the settings from disk.
   *
   * Every row already wrote its value the moment it was flipped — there is no
   * deferred batch to flush, and holding edits in component state would lose
   * them on close, which is exactly the failure the reader reported. What the
   * button adds is confirmation: it pulls the persisted file back through the
   * store and zeroes the badge, so "did that stick?" has a visible answer
   * inside the page rather than requiring a close and reopen to find out.
   */
  const simpanSemua = useCallback(() => {
    void useStore.getState().reloadSettings();
    /* Acknowledge: the badge clears until something is changed again. */
    setAbaikan(true);
  }, []);

  /* Hand the action to the bar, and take it back on unmount. */
  useEffect(() => {
    setSimpanStore(simpanSemua);
    return () => setSimpanStore(null);
  }, [simpanSemua, setSimpanStore]);

  return (
    <div className="cset-page" data-testid="cset-page">
      {/*
        * NO HEADER BAR HERE when the window frame is drawing one.
        *
        * This page used to render `.cset-topbar` with the title "Chat Settings"
        * and a Save button. In its own window that bar sat directly under the
        * title bar, which already says "Chat Settings" - so the reader saw the
        * name twice and two rows of chrome for one window, which is the "ada 2"
        * report. The window passes `actions` (Save) to `PanelTitleBar` instead,
        * and this header renders only when a host provides `onDragStart` or
        * `onClose` (i.e. the old popup frame, which no longer exists).
        */}
      {(onDragStart || onClose) && (
      <div
        className="cset-topbar"
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
        {/*
          * Save / Discard, and why they exist at all.
          *
          * Every row here writes straight through to the settings store as it is
          * flipped, so a Save button over those would be theatre. What the
          * reader actually asked for is a way to see that their changes STUCK —
          * the complaint was "I change things, close it, and it comes back the
          * way it was", which is what a page with no feedback looks like even
          * when every write landed.
          *
          * So the button reflects real state rather than pretending to batch:
          * `kotor` counts the rows whose current value differs from this
          * session's opening snapshot, the label says how many, and pressing it
          * confirms by dropping back to "Saved" and refreshing the snapshot. The
          * writes themselves already happened, which the tooltip says plainly.
          */}
        <button
          className="btn btn-sm btn-primary"
          data-testid="cset-save"
          disabled={!kotor}
          title={
            kotor
              ? tf('{n} changes - close the page and they stay', { n: jumlahKotor })
              : tr('Every change is already stored')
          }
          onClick={simpanSemua}
        >
          {kotor ? tf('Save ({n})', { n: jumlahKotor }) : tr('Saved')}
        </button>
        {/*
          * Close used to live HERE, because this page was framed by a popup that
          * had no close button. In the OS-window home the platform draws one, and
          * keeping this would put two close buttons on one window - which is
          * exactly the "there are two of these" report. It renders only when a
          * host passes `onClose`.
          *
          * The maximize button is gone entirely: it existed to grow a floating
          * card, and there is no card. The window maximizes itself.
          */}
        {onClose && (
          <button
            className="ai-ikon"
            data-testid="cset-close"
            title={tr('Close')}
            aria-label={tr('Close')}
            onClick={onClose}
          >
            <AiIkon name="close" size={14} />
          </button>
        )}
      </div>
      )}

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
