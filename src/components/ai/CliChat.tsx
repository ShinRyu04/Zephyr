import { useEffect, useRef, useState } from 'react';
import { useAiCli, EMPTY_LIST } from '../../lib/aiCliStore';
import { useStore } from '../../lib/store';
import { catalogFor, modelChip, EFFORT_LEVELS } from '../../lib/cliCatalog';
import { fileDialogOpen, fsRead, scanDir, folderDialogOpen, bacaGambar } from '../../lib/commands';
import { useT, useTf } from '../../lib/i18n';
import AiIkon from './AiIkon';
import CliTimeline from './CliTimeline';
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
  const clear = useAiCli((s) => s.clear);
  const ensureActive = useAiCli((s) => s.active);
  const newSession = useAiCli((s) => s.newSession);
  const selectSession = useAiCli((s) => s.selectSession);
  const deleteSession = useAiCli((s) => s.deleteSession);
  const liveModels = useAiCli((s) => s.models[agentId]);
  const loadModels = useAiCli((s) => s.loadModels);
  /* The active workspace, passed to the slash sheets so project-scope config
     (CLAUDE.md, .mcp.json, per-project usage) is read for the right folder. */
  const cwd = useStore((s) => s.workspace) ?? '';

  const chat = sessions.find((s) => s.id === activeSessionId) ?? sessions[sessions.length - 1];
  const messages = chat?.messages ?? [];
  const pending = chat?.pending ?? null;
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
  /* The history drawer (session list), toggled from the toolbar. */
  const [showHistory, setShowHistory] = useState(false);
  /* Which composer popover is open: '+', '/', model, or mode. One at a time. */
  const [menu, setMenu] = useState<null | 'plus' | 'slash' | 'model' | 'mode'>(null);
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
    /* Images go to Claude as `@path` references — the CLI reads the real file,
       exactly as the desktop app does. */
    const imgRefs = images.length ? images.map((im) => `@${im.path}`).join(' ') : '';
    const prefix = [folderRefs, imgRefs].filter(Boolean).join(' ');
    void send(agentId, prefix ? `${prefix}\n${t}` : t);
    setDraft('');
    setAttachments([]);
    setImages([]);
    setMenu(null);
  };

  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text).catch(() => {});
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
        break;
      case 'export': {
        const text = messages.map((m) => `${m.role === 'user' ? '> ' : ''}${m.content}`).join('\n\n');
        copy(text);
        setMenu(null);
        break;
      }
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
      case 'help':
        window.open('https://docs.anthropic.com/en/docs/claude-code', '_blank', 'noreferrer');
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
                  <div className="cli-native-user">{m.content}</div>
                ) : (
                  <div className="cli-native-assistant">
                    <CliTimeline msg={m} streaming={pending === m.id} />
                    {(m.content || (m.parts && m.parts.length > 0)) && pending !== m.id && (
                      <div className="cli-native-rowtools">
                        <button
                          className="cli-native-iconbtn"
                          title={tr('Copy')}
                          aria-label={tr('Copy')}
                          onClick={() => copy(m.content)}
                        >
                          <AiIkon name="clipboard" size={13} />
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
            /* Typing "/" at the start opens the actions palette in place, so the
               slash works from the chat box itself and not only from the chip. */
            if (v === '/') { setMenu('slash'); setSlashFilter(''); }
            else if (menu === 'slash' && !v.startsWith('/')) setMenu(null);
            if (v.startsWith('/')) setSlashFilter(v.slice(1));
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              kirim();
            }
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
                <button role="menuitem" className="cli-pop-item" onClick={attachImage}>
                  <AiIkon name="image" size={14} />
                  {tr('Add image')}
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
              title={tr('Actions')}
              aria-haspopup="menu"
              aria-expanded={menu === 'slash'}
              onClick={() => { setMenu((m) => (m === 'slash' ? null : 'slash')); setSlashFilter(''); }}
            >
              <span className="cli-slash-glyph" aria-hidden="true">/</span>
            </button>
            {menu === 'slash' && (
              <div className="cli-pop cli-pop-up cli-pop-palette" role="menu" data-testid={`ai-clichat-slash-menu-${agentId}`}>
                <input
                  className="cli-pop-filter"
                  autoFocus
                  placeholder={tr('Filter actions…')}
                  value={slashFilter}
                  onChange={(e) => setSlashFilter(e.target.value)}
                />
                <div className="cli-pop-scroll">
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
                  {slashShown.length === 0 && (
                    <p className="cli-pop-empty">{tr('No actions match.')}</p>
                  )}
                </div>
              </div>
            )}
          </div>

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
      {zoomImg && <Lightbox src={zoomImg} onClose={() => setZoomImg(null)} />}
    </div>
  );
}
