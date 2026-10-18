import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAiCli, EMPTY_LIST, EMPTY_TASKS, type CliTask } from '../../lib/aiCliStore';
import { bukaPanel } from '../../lib/bukaPanel';
import { useSubAgent } from '../../lib/subagentStore';
import AgentMapPanel from './AgentMapPanel';
import { useAi } from '../../lib/aiStore';
import { useStore } from '../../lib/store';
import { catalogFor, modelChip, EFFORT_LEVELS, jendelaAliasCli } from '../../lib/cliCatalog';
import {
  fileDialogOpen,
  fsRead,
  scanDir,
  folderDialogOpen,
  bacaGambar,
  simpanGambarTemp,
  claudeBuiltinCommands,
  type BuiltinCommand,
} from '../../lib/commands';
import { clipboardReadImage, clipboardWrite } from '../../lib/clipboard';
import { useT, useTf, tx } from '../../lib/i18n';
import AiIkon from './AiIkon';
import CliTimeline from './CliTimeline';
import ContextRing from './ContextRing';
import { jendelaKonteks, ambangAutoCompact } from '../../lib/contextBudget';
import CliTodoFloat from './CliTodoFloat';
import Lightbox from './Lightbox';
import CliSlashPanel, { type SlashPanel } from './CliSlashPanel';

/*
 * Native chat UI (Cara B) for the hosted Claude Code CLI — rebuilt to mimic the
 * real desktop app, NOT Zephyr's own chat panel. (Codex gets its own, different
 * surface later; this file is tuned for Claude.)
 *
 * It renders Claude Code's home screen (brand wordmark + "Learn Claude Code"
 * cards), a top-right toolbar (Learn / Bookmarks / Session history / New chat),
 * a message thread, and a composer whose controls ACTUALLY DRIVE the CLI:
 *   - a "+" menu (Upload / Add context),
 *   - a "/" actions palette (Context / Model / more), with a filter box,
 *   - a model picker ("Select a model"), wired to `--model`,
 *   - a modes menu (Manual / Edit automatically / Plan / Auto) with icons and
 *     descriptions, wired to `--permission-mode`, plus the Effort dial and the
 *     Ultracode toggle,
 *   - an "Auto" badge mirroring the chosen mode, and a round send button.
 * The CLI still runs headless and owns its own login/credentials.
 */

const ACCENT: Record<string, string> = { claude: '#d97757', codex: '#10a37f' };

/*
 * The onboarding cards shown on the empty state, like the real home screen.
 *
 * `demo` is what "Show me" drops into the composer — the real app plays a short
 * demonstration; here it seeds a prompt the user can send straight away, so the
 * button is a real action rather than decoration. Each row is a real checkbox:
 * ticking it strikes the line through, exactly like Claude Code's own card.
 */
const LEARN: { id: string; label: string; demo?: string }[] = [
  { id: 'write', label: 'Prompt Claude to write code', demo: 'Write a function that…' },
  { id: 'edit', label: 'Highlight code and ask for edits', demo: 'Edit the selected code to…' },
  { id: 'rules', label: 'Give Claude rules to remember', demo: 'Remember to always…' },
  { id: 'nonstop', label: 'Let Claude edit without stopping' },
  { id: 'plan', label: 'Use Plan mode for complex changes' },
];

/*
 * The "/" actions palette, grouped like the real Claude Code filterable list.
 * Faithful to the desktop app's palette: Context (attach / mention / clear /
 * session history / export), Model (switch model, effort, ultracode), Extend
 * (subagents, skills, plugins, MCP servers), Settings (permissions, status,
 * sandbox, slash commands, memory, instructions, output style, hooks, account,
 * open in terminal) and Support. Every row now opens a real sheet or performs a
 * real action — none are placeholders.
 */
type SlashAction = { id: string; label: string; group: string; icon?: string };
const SLASH: SlashAction[] = [
  { id: 'attach', label: 'Attach file…', group: 'Context', icon: 'attach' },
  { id: 'mention', label: 'Mention file from this project…', group: 'Context', icon: 'file' },
  { id: 'clear', label: 'Clear conversation', group: 'Context', icon: 'trash' },
  { id: 'history', label: 'Session history', group: 'Context', icon: 'history' },
  { id: 'export', label: 'Export conversation', group: 'Context', icon: 'export' },
  { id: 'model', label: 'Switch model…', group: 'Model', icon: 'brain' },
  { id: 'effort', label: 'Effort', group: 'Model', icon: 'compact' },
  { id: 'ultracode', label: 'Ultracode', group: 'Model', icon: 'rocket' },
  { id: 'agents', label: 'Subagents', group: 'Extend', icon: 'robot' },
  { id: 'skills', label: 'Skills', group: 'Extend', icon: 'goal' },
  { id: 'plugins', label: 'Manage plugins', group: 'Extend', icon: 'puzzle' },
  { id: 'mcp', label: 'MCP servers', group: 'Extend', icon: 'node' },
  { id: 'permissions', label: 'Permissions', group: 'Settings', icon: 'shield' },
  { id: 'status', label: 'Status', group: 'Settings', icon: 'eye' },
  { id: 'sandbox', label: 'Sandbox', group: 'Settings', icon: 'cloud' },
  { id: 'commands', label: 'Slash commands', group: 'Settings', icon: 'prompt' },
  { id: 'memory', label: 'Memory', group: 'Settings', icon: 'doc' },
  { id: 'instructions', label: 'Instructions', group: 'Settings', icon: 'list' },
  { id: 'style', label: 'Output style', group: 'Settings', icon: 'sketch' },
  { id: 'hooks', label: 'Hooks', group: 'Settings', icon: 'link' },
  { id: 'account', label: 'Account & Usage', group: 'Settings', icon: 'goal' },
  { id: 'terminal', label: 'Open Claude in Terminal', group: 'Settings', icon: 'terminal' },
  { id: 'help', label: 'View help docs', group: 'Support', icon: 'info' },
];

/* Which slash actions open a real sheet (CliSlashPanel) vs. do something else. */
const PANEL_IDS = new Set<SlashPanel>([
  'status', 'permissions', 'sandbox', 'memory', 'instructions', 'commands',
  'style', 'plugins', 'mcp', 'hooks', 'account', 'agents', 'skills',
]);

/*
 * What the reader's own bubble shows: their words, without the attachment
 * plumbing.
 *
 * An image attachment reaches the CLI as `@/tmp/zephyr-paste/<hash>.png` and a
 * folder as `@folder`, both prepended to the prompt on their own line. Feeding
 * that straight back into the bubble printed a band of temp paths above the
 * message — machinery the reader never typed and cannot act on. The pictures
 * are shown as pictures above this text, so the references themselves add
 * nothing but noise.
 *
 * Only the DISPLAY is filtered; `m.content` — what was sent — is untouched, and
 * an `@file` the reader typed themselves (a real inline reference, which is a
 * supported gesture) is left alone because it sits INSIDE the text rather than
 * on the leading attachment line.
 */
const REF_LAMPIRAN = /^@\S+(?:\s+@\S+)*\s*/;

function visibleUserText(content: string): string {
  /* One leading run of references: exactly how `kirim` builds the prefix. */
  return content.replace(REF_LAMPIRAN, '');
}

export default function CliChat({ agentId, label }: { agentId: string; label: string }) {
  const tr = useT();
  const tf = useTf();
  /* Subscribe to this agent's session list + active id, then derive the active
     session. Reading the list (not a derived object) keeps the selector result
     stable per zustand v5's === rule. */
  const sessions = useAiCli((s) => s.sessions[agentId]) ?? EMPTY_LIST;
  const activeSessionId = useAiCli((s) => s.activeId[agentId]) ?? '';
  const o = useAiCli((s) => s.opts[agentId]) ?? { model: 'default', mode: 'default', effort: 0, ultracode: false };
  const setOpts = useAiCli((s) => s.setOpts);
  const send = useAiCli((s) => s.send);
  const cancel = useAiCli((s) => s.cancel);
  const toggleBookmark = useAiCli((s) => s.toggleBookmark);
  const rewindTo = useAiCli((s) => s.rewindTo);
  /* Rewind destroys messages, so it is confirmed first. Holding the id (not a
     boolean) means the dialog always knows which message it is asking about,
     and cannot act on a stale one after the list changes. */
  const [konfirmasiRewind, setKonfirmasiRewind] = useState<string | null>(null);
  const clear = useAiCli((s) => s.clear);
  const ensureActive = useAiCli((s) => s.active);
  const newSession = useAiCli((s) => s.newSession);
  const selectSession = useAiCli((s) => s.selectSession);
  const deleteSession = useAiCli((s) => s.deleteSession);
  /*
   * The toast is shown by THIS panel, not by the Chat panel.
   *
   * `useAi.toast` renders inside `AiPanel` — which the host keeps mounted but
   * `hidden` whenever a CLI tab is in front. So every `setToast` from a slash
   * command fired and painted into a hidden subtree: `/usage`, `/stats`,
   * `/context`, `/cost`, `/recap`, `/autocompact`, `/effort` and `/theme` all
   * looked like they did nothing, because the message existed and nobody could
   * see it. The store write is kept (the Chat tab still owns that slot for its
   * own messages); this adds a local copy that is actually on screen.
   */
  const setToastStore = useAi((s) => s.setToast);
  const [pesan, setPesan] = useState<string | null>(null);
  const pesanTimer = useRef<number | null>(null);
  const setToast = useCallback(
    (t: string) => {
      setToastStore(t);
      setPesan(t);
      if (pesanTimer.current !== null) window.clearTimeout(pesanTimer.current);
      pesanTimer.current = window.setTimeout(() => setPesan(null), 3200);
    },
    [setToastStore],
  );
  useEffect(
    () => () => {
      if (pesanTimer.current !== null) window.clearTimeout(pesanTimer.current);
    },
    [],
  );
  const liveModels = useAiCli((s) => s.models[agentId]);
  const loadModels = useAiCli((s) => s.loadModels);
  /* The active workspace, passed to the slash sheets so project-scope config
     (CLAUDE.md, .mcp.json, per-project usage) is read for the right folder. */
  const cwd = useStore((s) => s.workspace) ?? '';

  const chat = sessions.find((s) => s.id === activeSessionId) ?? sessions[sessions.length - 1];
  /* Token counts the CLI reported for this session, if it has reported any.
     Read AFTER `chat` exists — it is a field of that session. */
  const sessionUsage = (chat?.usage ?? null) as { input: number; output: number } | null;
  const messages = chat?.messages ?? [];
  const pending = chat?.pending ?? null;
  /*
   * The subagent cards this session's CLI reported.
   *
   * A frozen empty constant, not `?? []`: zustand v5 compares with `===`, so a
   * fresh array literal on every render re-renders forever. Same reason
   * `EMPTY_LIST` exists above.
   */
  const tugasSesi = chat?.tasks ?? EMPTY_TASKS;
  /**
   * Whether the agent map dialog is open.
   *
   * Local state, not store state: the panel is a view of what is already in the
   * session, and putting "am I open" in a persisted store would restore an open
   * dialog on the next launch, over a conversation the reader may not even be
   * looking at.
   */
  const [petaAgen, setPetaAgen] = useState(false);
  /*
   * Zephyr's own parallel workers — the other half of the agents chip.
   *
   * Selected as PRIMITIVES, never as a new array: a zustand v5 selector that
   * builds an array returns a new reference every render and trips
   * `Maximum update depth exceeded` (the phase-09 trap this file already
   * documents). Filtering happens in the `useMemo` below instead.
   */
  const pekerjaSemua = useSubAgent((s) => s.agents);
  /*
   * Who is working right now, from both sources, in one number.
   *
   * CLI subagents are counted from the parts of THIS conversation: a `Task` /
   * `Agent` tool part whose subagent rows are tagged with its id (see AgentMap)
   * and which has not finished yet. A row is "finished" when its own status is
   * not `running` — the CLI reports the spawning call's status, and it stays
   * `running` for as long as the nested loop does.
   *
   * The parallel workers are counted from the store, and only while they are
   * actually going: `menunggu` (queued) counts as working because the reader
   * started it and it has not finished, while `selesai` / `gagal` / `batal` are
   * history and belong in the transcript, not in a chip that is supposed to
   * answer "is anything happening".
   */
  const { agentsJalan } = useMemo(() => {
    const cli: string[] = [];
    const punyaAnak = new Set<string>();
    for (const m of messages) {
      for (const p of m.parts ?? []) {
        if (p.parentId) punyaAnak.add(p.parentId);
      }
    }
    /*
     * A CLI subagent counts as working while its spawning row is `running`.
     *
     * Read from the TASKS rather than from the row's status where both exist:
     * the task lifecycle is the CLI's own report and it is the same source the
     * map's cards use, so the chip and the popup cannot disagree about how many
     * agents are live. The row scan stays as the fallback for a run whose
     * lifecycle lines were not seen (an older CLI, or a resume that attached
     * after the spawn).
     */
    const dariTask = tugasSesi.filter((t: CliTask) => t.status === 'running').length;
    if (dariTask === 0) {
      for (const m of messages) {
        for (const p of m.parts ?? []) {
          if (p.type !== 'tool' || !punyaAnak.has(p.callId)) continue;
          if (p.status === 'running') cli.push(p.callId);
        }
      }
    }
    const zephyr = pekerjaSemua.filter(
      (a) => a.status === 'jalan' || a.status === 'menunggu',
    ).length;
    return { agentsJalan: dariTask + cli.length + zephyr };
  }, [messages, pekerjaSemua, tugasSesi]);
  const cat = catalogFor(agentId);
  const accent = ACCENT[agentId] ?? 'var(--accent)';
  const mode = cat.modes.find((m) => m.id === o.mode) ?? cat.modes[0];
  /* The "Learn Claude Code" onboarding is Claude's own; Codex has a different
     surface and must never show these cards or the Learn button. */
  /* The live account list when the backend answered, else the static catalogue
     — the picker must never be empty. */
  const modelList = liveModels?.length ? liveModels : cat.models;
  const isClaude = agentId === 'claude';

  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);
  /* Images attached to the next message: the real file path (sent to Claude as
     `@path` so the CLI reads the actual image) plus a data URL for the inline
     zoomable thumbnail. */
  const [images, setImages] = useState<{ path: string; url: string }[]>([]);
  /* The image currently open in the zoom lightbox, if any. */
  const [zoomImg, setZoomImg] = useState<string | null>(null);
  const [showLearn, setShowLearn] = useState(true);
  /* Which onboarding rows the user has ticked — strikes the label through, like
     the real card. First row starts checked, matching the screenshot. */
  const [learnDone, setLearnDone] = useState<Record<string, boolean>>({ write: true });
  const [slashFilter, setSlashFilter] = useState('');
  /* 'actions' = opened from the chip (Zephyr's own actions, nothing typed);
     'all' = opened by typing "/" (commands AND actions). */
  const [slashMode, setSlashMode] = useState<'actions' | 'all'>('all');
  /* The history drawer (session list), toggled from the toolbar. */
  const [showHistory, setShowHistory] = useState(false);
  /*
   * Which composer popover is open.
   *
   * `cmd` is the slash-COMMAND palette (the CLI's own /review, /init, /status…)
   * and `slash` is the ACTION palette (Attach, Clear, Model…). They are
   * separate because they are reached differently: `cmd` opens by TYPING "/",
   * the way every other slash-command UI works, while `slash` is the chip's
   * action menu. Conflating them meant the chip opened a list of commands that
   * a reader had no reason to expect from clicking a button.
   */
  const [menu, setMenu] = useState<null | 'plus' | 'slash' | 'model' | 'mode' | 'agents'>(null);
  /* The CLI's built-in slash commands, loaded once for the typed palette. */
  const [builtins, setBuiltins] = useState<BuiltinCommand[]>([]);
  /* Which slash sheet (Status / Permissions / Agents / …) is open, if any. */
  const [panel, setPanel] = useState<SlashPanel | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);


  /* Fetch live models + make sure a session exists the moment the tab opens, so
     the welcome screen reads as the start of a conversation, like AI Zephyr. */
  useEffect(() => {
    void loadModels(agentId);
    ensureActive(agentId);
  }, [agentId, loadModels, ensureActive]);

  /*
   * Load the CLI's slash commands once.
   *
   * They come from the backend rather than a list in the component because the
   * set belongs to the installed CLI, not to this app — a version that adds a
   * command should show it without a Zephyr release. Failure is silent: the
   * palette simply has nothing to offer, which is the honest outcome when the
   * CLI cannot be asked.
   */
  useEffect(() => {
    claudeBuiltinCommands()
      .then(setBuiltins)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  });

  /* Click-away + Escape close any open composer popover. */
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement)?.closest('.cli-pop, .cli-pop-trigger')) setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(null);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  const kirim = () => {
    const t = draft.trim();
    if ((!t && images.length === 0) || pending) return;
    const folderRefs = attachments.length ? attachments.map((a) => `@${a}`).join(' ') : '';
    /*
     * Images go to Claude as `@path` references — the CLI reads the real file,
     * exactly as the desktop app does. The paths go into the PROMPT only; the
     * transcript shows the pictures themselves (see `send`'s `images` option),
     * because a row of `@C:/Temp/...png` is not something a reader can look at.
     */
    const imgRefs = images.length ? images.map((im) => `@${im.path}`).join(' ') : '';
    const prefix = [folderRefs, imgRefs].filter(Boolean).join(' ');
    void send(agentId, prefix ? `${prefix}\n${t}` : t, {
      images: images.length ? images : undefined,
    });
    setDraft('');
    setAttachments([]);
    setImages([]);
    setMenu(null);
  };

  /*
   * The Tauri plugin, not `navigator.clipboard`.
   *
   * The WebView2 clipboard API rejects with `NotAllowedError` whenever the
   * document is not focused, which is the normal state while the reader is
   * looking at a menu or another window — the copy silently did nothing and the
   * button looked broken. `clipboardWrite` goes through the plugin first and
   * keeps the browser API only as a fallback.
   */
  const copy = (text: string) => {
    void clipboardWrite(text);
  };

  /* Tick / untick an onboarding row — strikes it through, like the real card. */
  const toggleLearn = (id: string) =>
    setLearnDone((d) => ({ ...d, [id]: !d[id] }));

  /* "Show me": seed the demo prompt into the composer and tick the row. */
  const showMe = (id: string, demo: string) => {
    setDraft(demo);
    setLearnDone((d) => ({ ...d, [id]: true }));
    inputRef.current?.focus();
  };

  const attachFile = async () => {
    setMenu(null);
    const paths = await fileDialogOpen(false).catch(() => null);
    const p = paths?.[0];
    if (!p) return;
    try {
      const isi = await fsRead(p);
      const nama = p.split(/[\\/]/).pop() ?? p;
      setDraft((d) => `${d ? `${d}\n\n` : ''}${'```'}\n// ${nama}\n${isi}\n${'```'}`);
    } catch {
      /* unreadable file — ignore */
    }
    inputRef.current?.focus();
  };

  const addContext = async () => {
    setMenu(null);
    const dir = await folderDialogOpen().catch(() => null);
    if (!dir) return;
    try {
      await scanDir(dir);
      const nama = dir.split(/[\\/]/).filter(Boolean).pop() ?? dir;
      setAttachments((a) => (a.includes(nama) ? a : [...a, nama]));
    } catch {
      /* unreadable folder — ignore */
    }
    inputRef.current?.focus();
  };

  /* Attach an image: pick a file, read it as a data URL for the inline thumbnail
     and remember the real path so the CLI reads the actual image (Claude Code
     references images by path with `@`). */
  const attachImage = async () => {
    setMenu(null);
    const paths = await fileDialogOpen(false).catch(() => null);
    const p = paths?.[0];
    if (!p) return;
    if (!/\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(p)) {
      /* not an image — fall back to the plain file attach */
      try {
        const isi = await fsRead(p);
        const nama = p.split(/[\\/]/).pop() ?? p;
        setDraft((d) => `${d ? `${d}\n\n` : ''}${'```'}\n// ${nama}\n${isi}\n${'```'}`);
      } catch {
        /* ignore */
      }
      inputRef.current?.focus();
      return;
    }
    try {
      const g = await bacaGambar(p);
      const url = `data:image/${p.split('.').pop()?.toLowerCase() === 'jpg' ? 'jpeg' : p.split('.').pop()?.toLowerCase()};base64,${g.base64}`;
      setImages((xs) => (xs.some((x) => x.path === p) ? xs : [...xs, { path: p, url }]));
    } catch {
      /* unreadable image — ignore */
    }
    inputRef.current?.focus();
  };

  /*
   * Paste an image from the clipboard, the way the real Claude Code does.
   *
   * Two paths, tried in order, because they cover different sources:
   *
   *  1. `e.clipboardData.items` — a real paste EVENT. This is the only path
   *     that has the bytes when the clipboard holds raw image data (a
   *     screenshot tool, or an image copied from a browser). It must be read
   *     SYNCHRONOUSLY inside the handler; the DataTransferItem is dead as soon
   *     as the event returns.
   *  2. The Tauri clipboard plugin — the fallback for when the event carries
   *     nothing usable (WebView2 does not always populate `items` for
   *     clipboard images, and a keyboard-less paste can reach us with an empty
   *     dataTransfer). It returns a PNG data URL.
   *
   * A pasted image has no path: it never touched disk. So it is written to a
   * temp file first, because the CLI reads images by PATH (`@file`) — handing
   * it a data URL would send a wall of base64 as text. The path is what makes
   * the CLI actually look at the picture.
   */
  const tempelGambar = async (e?: React.ClipboardEvent) => {
    setMenu(null);
    /* 1. Bytes straight off the paste event, if the browser gave us any. */
    const items = e?.clipboardData?.items;
    let file: File | null = null;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          file = items[i].getAsFile();
          break;
        }
      }
    }
    if (file) {
      e?.preventDefault();
      const url = await new Promise<string | null>((resolve) => {
        const r = new FileReader();
        r.onload = () => resolve(typeof r.result === 'string' ? r.result : null);
        r.onerror = () => resolve(null);
        r.readAsDataURL(file!);
      });
      if (url) {
        await simpanTempel(url);
        return;
      }
    }
    /* 2. The plugin, for the cases the event did not cover. */
    const url = await clipboardReadImage();
    if (url) {
      await simpanTempel(url);
      return;
    }
    setToast(tx('No image on the clipboard'));
  };

  /*
   * Write a pasted data URL to a real file and attach it.
   *
   * The CLI's `@path` reference is the whole contract for images: a data URL
   * sent through the prompt would arrive as a megabyte of base64 text that the
   * model cannot see, which is exactly the "foto tidak terkirim" symptom. The
   * temp file is what turns a clipboard byte-blob back into something with a
   * path.
   *
   * Failure is reported rather than swallowed: the user pasted something and
   * it is gone, so silence would read as a broken paste.
   */
  const simpanTempel = async (dataUrl: string) => {
    try {
      const m = /^data:image\/([a-z0-9+.-]+);base64,(.+)$/i.exec(dataUrl);
      if (!m) {
        setToast(tx('Clipboard image could not be read'));
        return;
      }
      const ext = m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase();
      const path = await simpanGambarTemp(m[2], ext);
      setImages((xs) => (xs.some((x) => x.path === path) ? xs : [...xs, { path, url: dataUrl }]));
      setToast(tx('Screenshot attached'));
    } catch {
      setToast(tx('Clipboard image could not be saved'));
    }
    inputRef.current?.focus();
  };

  const runSlash = (id: string) => {
    /* The palette can be opened by typing "/" in the box; clear that stub so the
       chosen action does not leave a dangling slash behind. */
    if (draft.startsWith('/')) setDraft('');
    switch (id) {
      case 'attach':
      case 'mention':
        void attachFile();
        break;
      case 'clear':
        clear(agentId);
        setMenu(null);
        break;
      case 'model':
      case 'effort':
      case 'ultracode':
        /* These live in the model picker; open it so the dial + toggle show. */
        setMenu('model');
        setToast(
          id === 'effort'
            ? tx('Effort is set in the model picker — pick a level there')
            : id === 'ultracode'
              ? tx('Ultracode is the toggle in the model picker')
              : tx('Pick a model'),
        );
        break;
      case 'history':
        setShowHistory((v) => !v);
        setMenu(null);
        break;
      case 'terminal':
        /* Open the real Claude Code TUI in a terminal pane — the one action that
           genuinely needs a PTY (interactive login, plan UI). */
        void import('../../lib/terminalStore').then((m) => {
          const ts = m.useTerminal.getState();
          ts.setVisible(true);
          void ts.addPane('agent', { agentId });
        });
        setMenu(null);
        break;
      /*
       * The rest of the real command set.
       *
       * Each one DOES something — that is the condition for listing it. A
       * palette entry that quietly closed would teach the reader the command was
       * broken, when the truth is that Zephyr simply had not wired it up. Where
       * the work belongs to a panel Zephyr already owns, the sheet opens; where
       * it belongs to the terminal, the terminal opens.
       */
      /* ---- session ---- */
      case 'rewind':
        /* Back to the previous turn: drop the last exchange so the reader can
           re-ask. Same action as the row button, reached from the palette.
           With nothing to rewind to, say so — a command that does nothing and
           says nothing is the failure this whole pass is about. */
        {
          const terakhir = [...messages].reverse().find((m) => m.role === 'user');
          if (terakhir) setKonfirmasiRewind(terakhir.id);
          else setToast(tx('Nothing to rewind — no message has been sent in this session yet'));
        }
        setMenu(null);
        break;
      case 'recap': {
        /* A one-line summary of what this session has done, from the steps that
           actually ran — so it cannot claim work that did not happen. */
        const langkah = messages.reduce((n, m) => n + (m.parts?.filter((p) => p.type === 'tool').length ?? 0), 0);
        const berkasBaru = messages.reduce(
          (n, m) => n + (m.parts?.filter((p) => p.type === 'tool' && /Edit|Write/.test(p.name)).length ?? 0),
          0,
        );
        setToast(
          tf('{msgs} messages · {steps} tool steps · {files} file changes', {
            msgs: messages.length,
            steps: langkah,
            files: berkasBaru,
          }),
        );
        setMenu(null);
        break;
      }
      case 'autocompact': {
        /*
         * Cycle the threshold, and say what it is now.
         *
         * The real CLI takes an argument (`/autocompact 120k`), and so does
         * this one via the composer — but a palette entry picked with no text
         * must still do something predictable. It reports the current setting
         * and offers the common alternatives in the toast, which is the honest
         * response when there is no argument to read.
         */
        const kk = ambangAutoCompact();
        /* Same alias-aware window as the ring: the toast tells the reader what
           auto-compact will do, and it must not quote a 128k floor for a 1M
           model — the two numbers have to agree. */
        const jendela = jendelaAliasCli(o.model) ?? jendelaKonteks(o.model ?? 'default');
        const aktif = kk ?? Math.round(jendela * 0.8);
        setToast(
          kk
            ? tf('Auto-compact at {n} tokens (default would be {d})', {
                n: kk.toLocaleString(),
                d: Math.round(jendela * 0.8).toLocaleString(),
              })
            : tf('Auto-compact at {n} tokens — 80% of this model’s window', {
                n: aktif.toLocaleString(),
              }),
        );
        setMenu(null);
        break;
      }
      case 'context': {
        /* What the window is actually holding, from the session's own numbers
           rather than an estimate. */
        const chars = messages.reduce(
          (n, m) => n + (m.content?.length ?? 0) + (m.parts ? JSON.stringify(m.parts).length : 0),
          0,
        );
        const token = sessionUsage;
        setToast(
          token
            ? tf('Context: {in} in / {out} out tokens · transcript {kb}KB', {
                in: token.input.toLocaleString(),
                out: token.output.toLocaleString(),
                kb: (chars / 1024).toFixed(1),
              })
            : tf('Transcript {kb}KB (token usage not reported yet)', { kb: (chars / 1024).toFixed(1) }),
        );
        setMenu(null);
        break;
      }
      case 'export': {
        const text = messages.map((m) => `${m.role === 'user' ? '> ' : ''}${m.content}`).join('\n\n');
        copy(text);
        setToast(tf('Conversation copied ({n} characters)', { n: text.length }));
        setMenu(null);
        break;
      }
      case 'exit': {
        /* Close the SESSION, not the app: dropping the whole editor to satisfy a
           slash command would lose unsaved work. */
        deleteSession(agentId, activeSessionId);
        setMenu(null);
        break;
      }
      /* ---- statistics ---- */
      case 'stats':
      case 'usage':
      case 'cost': {
        const tool = messages.reduce((n, m) => n + (m.parts?.filter((p) => p.type === 'tool').length ?? 0), 0);
        const pesan = messages.length;
        const token = sessionUsage;
        setToast(
          token
            ? tf('{msgs} messages · {tools} tool calls · {in} in / {out} out tokens · ${cost}', {
                msgs: pesan,
                tools: tool,
                in: token.input.toLocaleString(),
                out: token.output.toLocaleString(),
                cost: '—',
              })
            : tf('{msgs} messages · {tools} tool calls · usage not reported', { msgs: pesan, tools: tool }),
        );
        setMenu(null);
        break;
      }
      /* ---- panels Zephyr already owns ---- */
      case 'diff':
      case 'security-review':
      case 'privacy-settings':
      case 'context2':
        /* These read the working tree or the config, which the sheets and the
           Source Control view already show. Opening them is the honest answer:
           the information exists, it is just not a chat message.
           Each one also SAYS where it went: the bottom panel can be collapsed or
           behind the chat, and a command that silently focuses an invisible
           panel is indistinguishable from one that failed. */
        if (id === 'security-review') {
          void import('../../lib/panelStore').then((m) => m.usePanel.getState().focusTab('problems'));
          setToast(tx('Opened the Problems panel — security findings from the current scan'));
        } else if (id === 'diff') {
          void import('../../lib/panelStore').then((m) => m.usePanel.getState().focusTab('source-control' as never));
          setToast(tx('Opened Source Control for the working-tree changes'));
        } else {
          /* "What is sent to the provider" is a chat setting (context), and it
             is edited in the chat's own settings page - not in the editor-area
             Settings page, which has not owned it since those rows moved. The
             page is its own window now, so the section travels in the URL. */
          bukaPanel('chat-settings', 'context');
          setToast(tx('Opened Chat Settings — review what is sent to the provider'));
        }
        setMenu(null);
        break;
      case 'list-agents':
        setPanel('agents');
        setMenu(null);
        break;
      case 'skills':
        setPanel('skills');
        setMenu(null);
        break;
      case 'plugins':
        setPanel('plugins');
        setMenu(null);
        break;
      case 'sandbox':
        setPanel('sandbox');
        setMenu(null);
        break;
      case 'permissions':
        setPanel('permissions');
        setMenu(null);
        break;
      case 'mcp':
        setPanel('mcp');
        setMenu(null);
        break;
      case 'hooks':
        setPanel('hooks');
        setMenu(null);
        break;
      case 'memory':
        setPanel('memory');
        setMenu(null);
        break;
      case 'status':
        setPanel('status');
        setMenu(null);
        break;
      case 'agents':
        setPanel('agents');
        setMenu(null);
        break;
      /* ---- settings Zephyr owns ---- */
      case 'theme': {
        const kini = useStore.getState().settings.general.theme;
        const berikut = kini === 'dark' ? 'light' : 'dark';
        void useStore.getState().applySettings({ general: { theme: berikut } });
        setToast(tf('Theme: {t}', { t: berikut }));
        setMenu(null);
        break;
      }
      case 'statusline':
        /* The status line is chat chrome, so its switches live in Chat Settings
           (Appearance) with the rest of them. */
        bukaPanel('chat-settings', 'appearance');
        setToast(tx('Opened Chat Settings — choose what the status line shows'));
        setMenu(null);
        break;
      case 'tasks': {
        const n = useAi.getState().agentTodos.length;
        setToast(
          n ? tf('{n} task(s) in the current plan', { n }) : tx('No task plan in this session yet'),
        );
        setMenu(null);
        break;
      }
      case 'fewer-permission-prompts':
        setPanel('permissions');
        setMenu(null);
        break;
      /*
       * Keybindings: Zephyr's own editor, not the CLI's.
       *
       * This used to land in the terminal-only group below, which opened a
       * Claude Code pane — the wrong surface, and the one complaint that
       * surfaced it. The CLI's `/keybindings` edits `~/.claude/keybindings.json`
       * for chords inside the CLI prompt; Zephyr already has its own editor
       * (`KeybindingsEditor`, persisted to `%APPDATA%\zephyr\keybindings.json`)
       * and that is what a reader typing `/keybindings` here means.
       */
      case 'keybindings':
        void import('../../lib/keybindingStore').then((m) => {
          m.useKb.getState().setEditorOpen(true);
        });
        setMenu(null);
        break;
      /* ---- terminal-only: honest about needing a TTY ---- */
      case 'ide':
      case 'remote-control':
      case 'upgrade':
      case 'release-notes': {
        void import('../../lib/terminalStore').then((m) => {
          const ts = m.useTerminal.getState();
          ts.setVisible(true);
          void ts.addPane('agent', { agentId });
        });
        setToast(tf('Run {cmd} in the terminal — it needs an interactive session', { cmd: `/${id}` }));
        setMenu(null);
        break;
      }
      /* ---- doctor: the one diagnostic worth a real button ---- */
      case 'doctor':
        setPanel('status');
        setMenu(null);
        break;
      /*
       * Commands the CLI can actually ANSWER, forwarded as a prompt.
       *
       * This is the distinction the old switch missed. `claude -p` has no
       * interactive session, so the session commands (/clear, /cost, /status,
       * /model, /vim, /login) do nothing there — verified: `/model` was even
       * rewritten by the CLI into the path `C:/Program Files/Git/model` and run
       * as a tool. Sending them would be worse than ignoring them.
       *
       * But `/init` and `/review` are PROMPTS: they expand into an instruction
       * and the model answers. Those genuinely work in print mode, so they are
       * sent as the message rather than swallowed by a panel.
       */
      case 'init':
      case 'review': {
        const cmd = id === 'init' ? '/init' : '/review';
        void send(agentId, cmd);
        setMenu(null);
        break;
      }
      /*
       * Session commands Zephyr performs itself, because it owns the session.
       *
       * Zephyr keeps its own transcript, so `/compact` is a real operation on
       * that transcript rather than a CLI feature — the same intent, carried out
       * by the half that can actually carry it out.
       */
      case 'compact': {
        void import('../../lib/aiCliStore').then((m) => {
          m.useAiCli.getState().compact(agentId);
        });
        setMenu(null);
        break;
      }
      /*
       * Settings that live in Zephyr's own UI. Opening the panel is the honest
       * response: the setting exists, it is just edited here rather than by
       * typing a command at a prompt that cannot receive one.
       */
      case 'config': {
        /* The CLI's /config has no single Zephyr equivalent: what it shows is
           split across the chat's settings page. Open that page rather than the
           editor-area Settings page, where half of these rows no longer exist. */
        bukaPanel('chat-settings');
        setMenu(null);
        break;
      }
      /*
       * Interactive-only commands: hand them to the Terminal pane, which is the
       * one surface with a real TTY. Vim keybindings, account switching and the
       * Shift+Enter setup all need the actual CLI prompt.
       */
      case 'vim':
      case 'login':
      case 'logout':
      case 'terminal-setup': {
        void import('../../lib/terminalStore').then((m) => {
          const ts = m.useTerminal.getState();
          ts.setVisible(true);
          void ts.addPane('agent', { agentId });
        });
        /* Say WHY, not just where. Dropping the user into a terminal with no
           explanation reads as the command having failed. */
        void import('../../lib/aiStore').then((m) => {
          m.useAi.getState().setToast(
            tf('Run {cmd} in the terminal — it needs an interactive session', { cmd: `/${id}` }),
          );
        });
        setMenu(null);
        break;
      }
      case 'help':
        /*
         * Opened through the Tauri opener plugin, not `window.open`.
         *
         * `window.open` to an external URL is a no-op inside the WebView — the
         * click landed on nothing and `/help` looked broken. The plugin is the
         * path the rest of the app already uses for external links, and it hands
         * the URL to the real browser instead of trying to navigate the app.
         *
         * The toast matters here more than elsewhere: the answer appears in
         * another application, so without it the command looks like it did
         * nothing at all.
         */
        setToast(tx('Opening the Claude Code documentation in your browser'));
        void import('@tauri-apps/plugin-opener').then(({ openUrl }) =>
          openUrl('https://docs.anthropic.com/en/docs/claude-code'),
        );
        setMenu(null);
        break;
      default:
        /* Everything else is a real sheet (Status / Permissions / Sandbox /
           Memory / Instructions / Slash commands / Output style / Plugins /
           MCP / Hooks / Account / Subagents / Skills), filled with the live
           CLI config. */
        if (PANEL_IDS.has(id as SlashPanel)) {
          setPanel(id as SlashPanel);
        }
        setMenu(null);
    }
  };

  /* Prefer the live list for the chip label too, so a model that only exists in
     the account's list (not the static catalogue) still shows its name. */
  const chipLabel =
    o.model === 'default'
      ? cat.defaultChip
      : modelList.find((x) => x.id === o.model)?.label ?? modelChip(agentId, o.model);
  const effortLabel = EFFORT_LEVELS[Math.min(o.effort, EFFORT_LEVELS.length - 1)];

  const slashShown = SLASH.filter(
    (a) => !slashFilter || tr(a.label).toLowerCase().includes(slashFilter.toLowerCase()),
  );
  const slashGroups = [...new Set(slashShown.map((a) => a.group))];

  /*
   * The typed palette filters on the command NAME, not its description.
   *
   * Matching the description too made the list jump around as someone typed —
   * "/co" surfaced /doctor because its blurb contains "connection", which is
   * not the command they were spelling. A name prefix is also what the CLI
   * itself matches on.
   */
  const semuaCommands = builtins.filter(
    (c) => !slashFilter || c.name.slice(1).toLowerCase().startsWith(slashFilter.toLowerCase()),
  );

  /*
   * The chip and the slash key open the SAME surface with different contents.
   *
   * Pressing the "/" chip next to the model picker is a request for what Zephyr
   * can do here — attach an image, rewind, open a panel. It is NOT typing a
   * command: nothing enters the box, and the Claude Code command list stays out
   * of it, because the reader asked the app a question, not the model. Typing a
   * slash at the prompt is the other question — "what commands exist?" — and
   * that one shows the commands as well.
   *
   * One surface, two entries, because the list is the same object; only the
   * filter differs.
   */
  const filteredCommands = slashMode === 'actions' ? [] : semuaCommands;

  /*
   * How full the context window is, for the ring.
   *
   * Taken from the CLI's own report rather than estimated, because the CLI is
   * the one that knows: it counts the system prompt, the tool table and its own
   * overhead, none of which this transcript shows. Before the first report
   * there is no honest number, so the ring stays at zero rather than guessing.
   */
  const contextPersen = (() => {
    if (!sessionUsage) return 0;
    const total = sessionUsage.input + sessionUsage.output;
    /*
     * The alias table FIRST, the catalogue second.
     *
     * `o.model` is the CLI's alias (`opus`, `sonnet`, `default`), which the
     * shared catalogue lookup does not know — it used to fall through to the
     * 128k floor and report a 1M-window model's 4% as 30%. Only when the entry
     * is not an alias (the user typed a full id) does the catalogue answer.
     */
    const jendela = jendelaAliasCli(o.model) ?? jendelaKonteks(o.model ?? 'default');
    if (!jendela || jendela <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round((total / jendela) * 100)));
  })();
  /*
   * Compaction in flight.
   *
   * Compaction REPLACES the transcript, so without a visible sign the messages
   * appear to vanish on their own and the reader concludes something was lost.
   * The ring is the one place already about the context window, so the busy
   * state belongs here rather than as a toast that disappears.
   */
  const memadatkan = chat?.compacting === true;

  return (
    <div
      className="cli-native"
      data-testid={`ai-clichat-${agentId}`}
      style={{ ['--cli-accent' as string]: accent }}
    >
      {/* Top-right toolbar: Learn, Session history, New chat — the three handy
          controls for this surface. (The shared tab strip keeps maximize/hide.) */}
      <div className="cli-topbar" data-testid={`ai-clichat-topbar-${agentId}`}>
        <span className="cli-topbar-spacer" aria-hidden="true" />
        {/*
          * Context usage, and whether it is being compacted right now.
          *
          * The ring is the same component the Chat AI panel uses, so the two
          * transcripts cannot disagree about what "45% full" looks like. The
          * busy state matters more here than there: compaction REPLACES the
          * transcript, so without a visible sign the messages appear to vanish
          * on their own — the reader concludes something was lost. The label
          * says which of the two it is, because "Compacting" and "compacted"
          * call for different reactions.
          */}
        <div
          className={`cli-ctx${memadatkan ? ' is-busy' : ''}`}
          data-testid={`ai-clichat-ctx-${agentId}`}
          data-busy={memadatkan ? '1' : '0'}
          title={
            memadatkan
              ? tr('Compacting the conversation…')
              : tf('Context: {n}% used', { n: contextPersen })
          }
        >
          <ContextRing persen={contextPersen} sibuk={memadatkan} size={12} />
          <span className="cli-ctx-pct">
            {memadatkan ? tr('Compacting') : `${contextPersen}%`}
          </span>
        </div>
        {isClaude && (
          <button
            className={`cli-top-btn${showLearn ? ' is-on' : ''}`}
            data-testid={`ai-clichat-learn-btn-${agentId}`}
            title={tf('Learn {name}', { name: label })}
            aria-label={tf('Learn {name}', { name: label })}
            aria-pressed={showLearn}
            onClick={() => setShowLearn((v) => !v)}
          >
            <AiIkon name="grad" size={15} />
          </button>
        )}
        <button
          className={`cli-top-btn${showHistory ? ' is-on' : ''}`}
          data-testid={`ai-clichat-history-${agentId}`}
          title={tr('Session history')}
          aria-label={tr('Session history')}
          aria-pressed={showHistory}
          onClick={() => setShowHistory((v) => !v)}
        >
          <AiIkon name="history" size={15} />
        </button>
        <button
          className="cli-top-btn"
          data-testid={`ai-clichat-new-${agentId}`}
          title={tr('New chat')}
          aria-label={tr('New chat')}
          onClick={() => {
            newSession(agentId);
            setDraft('');
            setAttachments([]);
            setShowHistory(false);
          }}
        >
          <AiIkon name="new-chat" size={15} />
        </button>
      </div>

      {showHistory && (
        <div className="cli-shelf" data-testid={`ai-clichat-shelf-${agentId}`}>
          <span className="cli-shelf-title">{tr('Session history')}</span>
          {sessions.length === 0 ? (
            <span className="cli-shelf-empty">{tr('No past sessions yet.')}</span>
          ) : (
            <div className="cli-hist-list">
              {[...sessions].reverse().map((sess) => (
                <div
                  key={sess.id}
                  className={`cli-hist-row${sess.id === chat?.id ? ' is-on' : ''}`}
                  data-testid={`ai-clichat-hist-${sess.id}`}
                >
                  <button
                    type="button"
                    className="cli-hist-pick"
                    onClick={() => { selectSession(agentId, sess.id); setShowHistory(false); }}
                  >
                    <AiIkon name="history" size={13} />
                    <span className="cli-hist-title">{sess.title ? tr(sess.title) : tr('New chat')}</span>
                    <span className="cli-hist-meta">{sess.messages.length}</span>
                  </button>
                  <button
                    type="button"
                    className="cli-hist-del"
                    title={tr('Delete')}
                    aria-label={tr('Delete')}
                    onClick={() => deleteSession(agentId, sess.id)}
                  >
                    <AiIkon name="trash" size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="cli-native-log" ref={scroller} data-testid={`ai-clichat-log-${agentId}`}>
        {messages.length === 0 ? (
          <div className="cli-native-welcome" data-testid={`ai-clichat-welcome-${agentId}`}>
            <div className="cli-native-wordmark">
              <span className="cli-native-mark" aria-hidden="true">✳</span>
              <span className="cli-native-word">{label}</span>
            </div>

            {isClaude && showLearn && (
              <div className="cli-learn" data-testid={`ai-clichat-learn-${agentId}`}>
                <div className="cli-learn-head">
                  <span className="cli-learn-brand">
                    <AiIkon name="grad" size={16} />
                    <span className="cli-learn-title">{tf('Learn {name}', { name: label })}</span>
                  </span>
                  <button
                    className="cli-learn-x"
                    title={tr('Dismiss')}
                    aria-label={tr('Dismiss')}
                    onClick={() => setShowLearn(false)}
                  >
                    <AiIkon name="close" size={12} />
                  </button>
                </div>
                {LEARN.map((l) => {
                  const done = !!learnDone[l.id];
                  return (
                    <div
                      key={l.id}
                      className={`cli-learn-row${done ? ' is-done' : ''}`}
                      data-testid={`ai-clichat-learn-row-${l.id}-${agentId}`}
                    >
                      <button
                        type="button"
                        className={`cli-learn-box${done ? ' is-on' : ''}`}
                        role="checkbox"
                        aria-checked={done}
                        data-testid={`ai-clichat-learn-check-${l.id}-${agentId}`}
                        title={tr(l.label)}
                        onClick={() => toggleLearn(l.id)}
                      >
                        {done && <AiIkon name="check" size={11} />}
                      </button>
                      <span className="cli-learn-label">{tr(l.label)}</span>
                      {l.demo && !done && (
                        <button
                          type="button"
                          className="cli-learn-show"
                          data-testid={`ai-clichat-learn-show-${l.id}-${agentId}`}
                          onClick={() => showMe(l.id, l.demo!)}
                        >
                          {tr('Show me')}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="cli-native-thread">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`cli-native-row is-${m.role}${m.error ? ' is-error' : ''}`}
                data-testid={`ai-clichat-msg-${m.role}`}
              >
                {m.role === 'user' ? (
                  /*
                   * No controls on the user's own message.
                   *
                   * The rewind and bookmark buttons were first put here on the
                   * reasoning that "go back to before this question" is the
                   * operation a reader wants. The reader's answer was that a
                   * question they just typed needs no toolbar: two icon buttons
                   * on every turn they write is clutter in the place they are
                   * reading their own words. The same two actions live on the
                   * assistant reply below, which is where attention already is.
                   */
                  <div className="cli-native-user">
                    {/*
                      * The images first, the words after — the same order they
                      * were attached, and the same order the desktop app shows
                      * them. Clicking one opens the zoom viewer.
                      */}
                    {m.images && m.images.length > 0 && (
                      <div className="cli-user-imgs" data-testid={`ai-clichat-user-imgs-${m.id}`}>
                        {m.images.map((im) => (
                          <img
                            key={im.path}
                            src={im.url}
                            alt=""
                            className="cli-user-img"
                            title={tr('Click to zoom')}
                            onClick={() => setZoomImg(im.url)}
                          />
                        ))}
                      </div>
                    )}
                    {/*
                      * Strip the `@path` references from what is DISPLAYED.
                      *
                      * They are the mechanism that feeds the CLI the picture, not
                      * part of what the reader typed — showing them back printed
                      * a row of temp-file paths above their own words. The
                      * content sent to the CLI is untouched; this only affects
                      * the bubble.
                      */}
                    {visibleUserText(m.content)}
                  </div>
                ) : (
                  <div className="cli-native-assistant">
                    <CliTimeline msg={m} streaming={pending === m.id} />
                    {(m.content || (m.parts && m.parts.length > 0)) && pending !== m.id && (
                      <div className="cli-native-rowtools">
                        <button
                          className={`cli-native-iconbtn${m.bookmark ? ' is-on' : ''}`}
                          data-testid={`cli-bookmark-${m.id}`}
                          title={m.bookmark ? tr('Remove bookmark') : tr('Bookmark')}
                          aria-label={tr('Bookmark')}
                          aria-pressed={!!m.bookmark}
                          onClick={() => toggleBookmark(agentId, m.id)}
                        >
                          <AiIkon name="bookmark" size={13} />
                        </button>
                        <button
                          className="cli-native-iconbtn"
                          title={tr('Copy')}
                          aria-label={tr('Copy')}
                          onClick={() => copy(m.content)}
                        >
                          <AiIkon name="clipboard" size={13} />
                        </button>
                        {/*
                          * Rewind rides on the ASSISTANT reply.
                          *
                          * It belongs next to the answer being judged: the reader
                          * reads a reply that went wrong, then asks for everything
                          * from here on to be dropped — including the question
                          * that produced it, which is why the cut lands BEFORE
                          * this reply rather than after it.
                          */}
                        <button
                          className="cli-native-iconbtn"
                          data-testid={`cli-rewind-${m.id}`}
                          title={tr('Rewind to here')}
                          aria-label={tr('Rewind')}
                          onClick={() => setKonfirmasiRewind(m.id)}
                        >
                          <AiIkon name="clock" size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/*
        * The plan floats above the composer, not inside the transcript.
        *
        * In the transcript it scrolls away the moment the run produces output —
        * which is exactly when the reader wants to know how far along it is.
        * Pinned here it stays in view for the whole run, the way the real CLI
        * and the desktop app show it.
        */}
      <CliTodoFloat messages={messages} />

      {/* Composer — modelled on the real Claude Code input bar. */}
      <div className="cli-native-composer">
        {images.length > 0 && (
          <div className="cli-img-strip" data-testid={`ai-clichat-images-${agentId}`}>
            {images.map((im, i) => (
              <span className="cli-img-chip" key={im.path}>
                <img
                  src={im.url}
                  alt=""
                  className="cli-img-thumb"
                  onClick={() => setZoomImg(im.url)}
                  title={tr('Click to zoom')}
                />
                <button
                  className="cli-img-x"
                  title={tr('Remove')}
                  aria-label={tr('Remove')}
                  onClick={() => setImages((xs) => xs.filter((_, j) => j !== i))}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
        {attachments.length > 0 && (
          <div className="cli-attach-strip" data-testid={`ai-clichat-attach-${agentId}`}>
            {attachments.map((a, i) => (
              <span className="cli-attach-chip" key={a}>
                <AiIkon name="folder" size={11} />
                {a}
                <button
                  className="cli-attach-x"
                  title={tr('Remove')}
                  aria-label={tr('Remove')}
                  onClick={() => setAttachments((xs) => xs.filter((_, j) => j !== i))}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
        <textarea
          ref={inputRef}
          className="cli-native-input"
          data-testid={`ai-clichat-input-${agentId}`}
          rows={1}
          placeholder={
            pending
              ? tf('{name} is working…', { name: label })
              : messages.length > 0
                ? tr('Queue another message…')
                : tr('ctrl esc to focus or unfocus Claude')
          }
          value={draft}
          onChange={(e) => {
            const v = e.target.value;
            setDraft(v);
            /*
             * Typing "/" opens the palette, and it lists EVERYTHING — the app's
             * actions AND the CLI's own slash commands.
             *
             * One list, because a slash typed at the start of a prompt is a
             * single question ("what can I do?") and splitting the answer across
             * two palettes meant whichever one opened, half the answer was
             * missing. The commands are shown with their leading slash so they
             * read as what they are.
             */
            if (v === '/') { setMenu('slash'); setSlashMode('all'); setSlashFilter(''); }
            else if (menu === 'slash' && !v.startsWith('/')) setMenu(null);
            if (v.startsWith('/')) setSlashFilter(v.slice(1));
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              kirim();
            }
          }}
          /*
           * Ctrl+V with an image on the clipboard, like the real Claude Code.
           *
           * Wired to the textarea rather than the document so a paste lands
           * where the reader is typing, and so pasting TEXT still behaves
           * normally (the handler only intercepts when it actually finds an
           * image, in which case `tempelGambar` calls preventDefault itself).
           */
          onPaste={(e) => {
            const items = e.clipboardData?.items;
            for (let i = 0; items && i < items.length; i++) {
              if (items[i].type.startsWith('image/')) {
                void tempelGambar(e);
                return;
              }
            }
            /*
             * No image item in the event — but that does not mean the clipboard
             * is empty of one. WebView2 frequently hands the DOM a paste with
             * NO image item at all (bitmap formats the event does not surface),
             * and the handler above then did nothing: a screenshot paste that
             * silently no-ops reads as "the feature is broken".
             *
             * So fall through to the clipboard plugin — the same route Chat AI
             * already uses (AiPanel's onPaste) — and do it QUIETLY: a plain
             * TEXT paste must not pop a "no image" toast, so only the success
             * path speaks (simpanTempel toasts on its own).
             */
            void clipboardReadImage().then((url) => {
              if (url) void simpanTempel(url);
            });
          }}
        />
        <div className="cli-native-bar">
          {/* "+" menu: upload / add context */}
          <div className="cli-pop-wrap">
            <button
              className="cli-native-chip cli-pop-trigger"
              data-testid={`ai-clichat-plus-${agentId}`}
              title={tr('Add')}
              aria-haspopup="menu"
              aria-expanded={menu === 'plus'}
              onClick={() => setMenu((m) => (m === 'plus' ? null : 'plus'))}
            >
              <AiIkon name="plus" size={14} />
            </button>
            {menu === 'plus' && (
              <div className="cli-pop cli-pop-up" role="menu" data-testid={`ai-clichat-plus-menu-${agentId}`}>
                <button role="menuitem" className="cli-pop-item" onClick={attachImage} data-testid={`ai-clichat-add-image-${agentId}`}>
                  <AiIkon name="image" size={14} />
                  {tr('Add image')}
                </button>
                {/* Paste is its own row, not just the Ctrl+V shortcut: a
                    screenshot is the common case, and the keyboard route is
                    invisible until someone already knows it exists. The real
                    Claude Code offers both. */}
                <button
                  role="menuitem"
                  className="cli-pop-item"
                  data-testid={`ai-clichat-paste-image-${agentId}`}
                  onClick={() => void tempelGambar()}
                >
                  <AiIkon name="clipboard" size={14} />
                  {tr('Paste image')}
                </button>
                <button role="menuitem" className="cli-pop-item" onClick={attachFile}>
                  <AiIkon name="export" size={14} />
                  {tr('Upload from computer')}
                </button>
                <button role="menuitem" className="cli-pop-item" onClick={addContext}>
                  <AiIkon name="file" size={14} />
                  {tr('Add context')}
                </button>
              </div>
            )}
          </div>

          {/* "/" actions palette */}
          <div className="cli-pop-wrap">
            <button
              className="cli-native-chip cli-pop-trigger"
              data-testid={`ai-clichat-slash-${agentId}`}
              /*
               * The chip opens Zephyr's ACTIONS, and types nothing.
               *
               * It used to put a "/" in the box and then show everything, which
               * conflated two different questions. Pressing a button labelled
               * with a slash is not typing one — the box stays empty, and the
               * list holds what the app can do (attach, rewind, open a panel).
               * To see the Claude Code commands, type the slash: that is the
               * gesture that means "what commands exist?".
               */
              title={tr('Actions')}
              onClick={() => {
                setSlashFilter('');
                setSlashMode('actions');
                setMenu('slash');
              }}
            >
              <span className="cli-slash-glyph" aria-hidden="true">/</span>
            </button>
            {menu === 'slash' && (
              <div className="cli-pop cli-pop-up cli-pop-palette" role="menu" data-testid={`ai-clichat-slash-menu-${agentId}`}>
                <input
                  className="cli-pop-filter"
                  autoFocus
                  placeholder={slashMode === 'actions' ? tr('Filter actions…') : tr('Filter commands…')}
                  value={slashFilter}
                  onChange={(e) => setSlashFilter(e.target.value)}
                />
                <div className="cli-pop-scroll">
                  {/*
                    * The CLI's own commands come FIRST.
                    *
                    * Typing "/" is a request for a command, so the commands are
                    * the answer the reader is looking for; the app's actions are
                    * what else happens to be available. Listing the actions on
                    * top would put the likely answer below the fold.
                    */}
                  {filteredCommands.length > 0 && (
                    <div>
                      <p className="cli-pop-group">{tr('Commands')}</p>
                      {filteredCommands.map((c) => (
                        <button
                          key={c.name}
                          role="menuitem"
                          className="cli-pop-item"
                          data-testid={`ai-clichat-cmd-${c.name.replace('/', '')}-${agentId}`}
                          title={c.desc}
                          onClick={() => {
                            const id = c.name.replace('/', '');
                            setDraft('');
                            setMenu(null);
                            /*
                             * Where it runs is the BACKEND's answer, not a list
                             * kept here.
                             *
                             * This used to be a hardcoded array of eleven ids;
                             * every command outside it was sent to the CLI as a
                             * prompt. So `/skills` — which Zephyr can genuinely
                             * open a sheet for — was posted to the model as
                             * text, and the sheet never appeared. A second list
                             * of the same commands, in a second place, is a list
                             * that drifts: adding a command meant remembering to
                             * edit both.
                             *
                             * `runs` travels with the command from the one place
                             * that defines it.
                             */
                            if (c.runs === 'cli') {
                              void send(agentId, c.name);
                            } else if (c.runs === 'terminal') {
                              void import('../../lib/terminalStore').then((m) => {
                                const ts = m.useTerminal.getState();
                                ts.setVisible(true);
                                void ts.addPane('agent', { agentId });
                              });
                            } else {
                              runSlash(id);
                            }
                          }}
                        >
                          <span className="cli-cmd-slash" aria-hidden="true">/</span>
                          <span className="cli-cmd-name">{c.name.replace('/', '')}</span>
                          <span className="cli-cmd-desc">{c.desc}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {slashGroups.map((g) => (
                    <div key={g}>
                      <p className="cli-pop-group">{tr(g)}</p>
                      {slashShown.filter((a) => a.group === g).map((a) => (
                        <button
                          key={a.id}
                          role="menuitem"
                          className="cli-pop-item"
                          data-testid={`ai-clichat-slash-${a.id}-${agentId}`}
                          onClick={() => runSlash(a.id)}
                        >
                          {a.icon && <AiIkon name={a.icon as never} size={13} />}
                          {tr(a.label)}
                        </button>
                      ))}
                    </div>
                  ))}
                  {slashShown.length === 0 && filteredCommands.length === 0 && (
                    <p className="cli-pop-empty">{tr('No actions match.')}</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/*
            * The agents chip: who is working right now, from both sources.
            *
            * Two different things are called "agent" in this app and the reader
            * has one word for both, so the chip counts both rather than making
            * them learn which panel to look in:
            *
            *   - CLI subagents — the `Agent`/`Task` calls THIS conversation's
            *     model made, relayed by the CLI (see AgentMap). Counted as the
            *     ones still running, which is what the map's own nesting shows.
            *   - Zephyr's parallel workers — the ones the reader started from
            *     the Subagents tab (subagentStore).
            *
            * Only WORKING agents are counted. A finished one is history and
            * belongs in the transcript; a chip that says "3 agents" while
            * nothing is happening is a number the reader cannot act on. Zero
            * both ways means the chip is still shown — unlike the pill in the
            * real Claude Code, which is always present — because its absence
            * would read as the feature being missing rather than idle.
            */}
          <div className="cli-pop-wrap">
            <button
              className="cli-native-chip cli-chip-agents"
              data-testid={`ai-clichat-agents-${agentId}`}
              data-count={agentsJalan}
              aria-haspopup="dialog"
              aria-expanded={petaAgen}
              title={tr('Agent map')}
              onClick={() => setPetaAgen((v) => !v)}
            >
              <span className={`cli-chip-dot${agentsJalan > 0 ? ' is-live' : ''}`} aria-hidden="true" />
              {tf('{n} agents', { n: agentsJalan })}
            </button>
          </div>

          {/*
            * The agent map opens from the chip, not as a dropdown.
            *
            * The chip first opened a dropdown listing what was running, which
            * only ever answered "is anything happening" — the question a reader
            * has ALREADY answered before clicking. The map answers the next one:
            * what each agent was for, how long it took, and what it cost. It is
            * a dialog (backdrop, Escape, focus) rather than a menu because it
            * shows history, not a list of choices.
            */}
          {petaAgen && (
            <AgentMapPanel
              tasks={tugasSesi}
              messages={messages}
              title={chat?.title || tr('This conversation')}
              modelLabel={chipLabel}
              contextTokens={
                sessionUsage ? sessionUsage.input + sessionUsage.output : 0
              }
              onClose={() => setPetaAgen(false)}
            />
          )}

          {/* Model chip → "Select a model" picker */}
          <div className="cli-pop-wrap">
            <button
              className="cli-native-model cli-pop-trigger"
              data-testid={`ai-clichat-model-${agentId}`}
              aria-haspopup="menu"
              aria-expanded={menu === 'model'}
              onClick={() => setMenu((m) => (m === 'model' ? null : 'model'))}
            >
              {chipLabel}
              {cat.hasEffort && <span className="cli-model-effort"> {effortLabel}</span>}
            </button>
            {menu === 'model' && (
              <div className="cli-pop cli-pop-up cli-pop-wide" role="menu" data-testid={`ai-clichat-model-menu-${agentId}`}>
                <p className="cli-pop-group">{tr('Select a model')}</p>
                <div className="cli-pop-scroll">
                  {modelList.map((mdl) => (
                    <button
                      key={mdl.id}
                      role="menuitemradio"
                      aria-checked={o.model === mdl.id}
                      className={`cli-pop-item is-model${o.model === mdl.id ? ' is-on' : ''}`}
                      data-testid={`ai-clichat-model-opt-${agentId}-${mdl.id}`}
                      onClick={() => { setOpts(agentId, { model: mdl.id }); setMenu(null); }}
                    >
                      <span className="cli-pop-model-text">
                        <span className="cli-pop-model-label">{tr(mdl.label)}</span>
                        <span className="cli-pop-model-sub">{tr(mdl.sub)}</span>
                      </span>
                      {o.model === mdl.id && <AiIkon name="check" size={13} />}
                    </button>
                  ))}
                </div>
                {cat.hasEffort && (
                  <>
                    <div className="cli-pop-sep" />
                    <div className="cli-pop-slider">
                      <span><AiIkon name="compact" size={13} /> {tr('Effort')} ({effortLabel})</span>
                      <input
                        type="range"
                        min={0}
                        max={EFFORT_LEVELS.length - 1}
                        value={o.effort}
                        data-testid={`ai-clichat-effort-${agentId}`}
                        onChange={(e) => setOpts(agentId, { effort: Number(e.target.value) })}
                      />
                    </div>
                    <button
                      className="cli-pop-item is-toggle"
                      role="menuitemcheckbox"
                      aria-checked={o.ultracode}
                      data-testid={`ai-clichat-ultra-${agentId}`}
                      onClick={() => setOpts(agentId, { ultracode: !o.ultracode })}
                    >
                      <span><AiIkon name="rocket" size={13} /> {tr('Ultracode')}</span>
                      <span className={`cli-switch${o.ultracode ? ' is-on' : ''}`} aria-hidden="true" />
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          <span className="cli-native-spacer" aria-hidden="true" />

          {/* Modes menu (Manual / Edit / Plan / Auto) → the "Auto" badge */}
          <div className="cli-pop-wrap">
            <button
              className="cli-native-auto cli-pop-trigger"
              data-testid={`ai-clichat-mode-${agentId}`}
              aria-haspopup="menu"
              aria-expanded={menu === 'mode'}
              onClick={() => setMenu((m) => (m === 'mode' ? null : 'mode'))}
            >
              <AiIkon name={(mode?.icon ?? 'bolt') as never} size={12} /> {tr(mode?.label ?? 'Auto')}
            </button>
            {menu === 'mode' && (
              <div className="cli-pop cli-pop-up cli-pop-wide cli-pop-right" role="menu" data-testid={`ai-clichat-mode-menu-${agentId}`}>
                <div className="cli-pop-group cli-pop-group-row">
                  <span>{tr('Modes')}</span>
                  <span className="cli-pop-hint"><kbd>⇧</kbd> + <kbd>tab</kbd> {tr('to switch')}</span>
                </div>
                {cat.modes.map((md) => (
                  <button
                    key={md.id}
                    role="menuitemradio"
                    aria-checked={o.mode === md.id}
                    className={`cli-pop-item is-model${o.mode === md.id ? ' is-on' : ''}`}
                    data-testid={`ai-clichat-mode-opt-${agentId}-${md.id}`}
                    onClick={() => { setOpts(agentId, { mode: md.id }); setMenu(null); }}
                  >
                    <AiIkon name={md.icon as never} size={15} />
                    <span className="cli-pop-model-text">
                      <span className="cli-pop-model-label">{tr(md.label)}</span>
                      {md.sub && <span className="cli-pop-model-sub">{tr(md.sub)}</span>}
                    </span>
                    {o.mode === md.id && <AiIkon name="check" size={13} />}
                  </button>
                ))}
                {cat.hasEffort && (
                  <>
                    <div className="cli-pop-sep" />
                    <div className="cli-pop-slider">
                      <span><AiIkon name="compact" size={13} /> {tr('Effort')} ({effortLabel})</span>
                      <input
                        type="range"
                        min={0}
                        max={EFFORT_LEVELS.length - 1}
                        value={o.effort}
                        onChange={(e) => setOpts(agentId, { effort: Number(e.target.value) })}
                      />
                    </div>
                    <button
                      className="cli-pop-item is-toggle"
                      role="menuitemcheckbox"
                      aria-checked={o.ultracode}
                      onClick={() => setOpts(agentId, { ultracode: !o.ultracode })}
                    >
                      <span><AiIkon name="rocket" size={13} /> {tr('Ultracode')}</span>
                      <span className={`cli-switch${o.ultracode ? ' is-on' : ''}`} aria-hidden="true" />
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {pending ? (
            <button
              className="cli-native-send is-stop"
              data-testid={`ai-clichat-stop-${agentId}`}
              title={tr('Stop')}
              aria-label={tr('Stop')}
              onClick={() => cancel(agentId)}
            >
              <AiIkon name="stop" size={13} />
            </button>
          ) : (
            <button
              className="cli-native-send"
              data-testid={`ai-clichat-send-${agentId}`}
              disabled={!draft.trim()}
              title={tr('Send')}
              aria-label={tr('Send')}
              onClick={kirim}
            >
              <AiIkon name="send" size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="cli-native-footer" aria-hidden="true">
        {tr('ctrl esc to focus or unfocus Claude')}
      </div>

      {panel && (
        <CliSlashPanel
          panel={panel}
          cwd={cwd || undefined}
          onInsert={(t) => { setDraft((d) => (d ? `${d}${t}` : t)); inputRef.current?.focus(); }}
          onClose={() => setPanel(null)}
        />
      )}
      {/* The command feedback, shown here because this is the panel the reader
          is looking at — see the note on `setToast` above. */}
      {pesan && (
        <div className="ai-toast cli-toast" role="status" data-testid={`ai-clichat-toast-${agentId}`}>
          {pesan}
        </div>
      )}
      {zoomImg && <Lightbox src={zoomImg} onClose={() => setZoomImg(null)} />}
      {konfirmasiRewind && (
        /*
         * A rewind throws messages away, and there is no undo — the store keeps
         * no history of its own. So it asks, and the wording says what will be
         * lost rather than naming the operation: "Rewind?" tells the reader
         * nothing about the consequence.
         */
        <div className="cli-confirm-backdrop" role="dialog" aria-modal="true">
          <div className="cli-confirm" data-testid="cli-rewind-confirm">
            <p className="cli-confirm-text">
              {tf('Delete this reply and everything after it? {n} message(s) will be removed.', {
                /* The target itself is removed too, so it counts toward the
                   total. An off-by-one here understates what the reader is
                   about to lose, which is the one number they are deciding on. */
                n: Math.max(
                  0,
                  messages.length - messages.findIndex((x) => x.id === konfirmasiRewind),
                ),
              })}
            </p>
            <div className="cli-sheet-actions">
              <button
                className="btn btn-primary btn-xs"
                data-testid="cli-rewind-ok"
                onClick={() => {
                  rewindTo(agentId, konfirmasiRewind);
                  setKonfirmasiRewind(null);
                }}
              >
                {tr('Rewind')}
              </button>
              <button className="btn btn-ghost btn-xs" onClick={() => setKonfirmasiRewind(null)}>
                {tr('Cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
