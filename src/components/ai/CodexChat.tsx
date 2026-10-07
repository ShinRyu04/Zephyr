import { useEffect, useRef, useState } from 'react';
import { useAiCli, EMPTY_LIST } from '../../lib/aiCliStore';
import {
  useCodex,
  APPROVAL_POLICIES,
  WORK_LOCATIONS,
  CODEX_MODELS,
  CODEX_EFFORT_LABELS,
} from '../../lib/codexStore';
import { fileDialogOpen, fsRead, folderDialogOpen, scanDir } from '../../lib/commands';
import { useT, useTf } from '../../lib/i18n';
import AiIkon from './AiIkon';
import CodexSettings from './CodexSettings';

/*
 * The hosted Codex TUI (Codex tab only).
 *
 * Rebuilt to mirror the real Codex desktop app, NOT Zephyr's own chat panel and
 * NOT the Claude Code surface (CliChat): a dark empty canvas with the Codex
 * terminal glyph in the centre, a top-right toolbar (history / settings /
 * compose), and a composer whose controls match Codex exactly —
 *   - a "+" menu (Files and folders / Goal / Plan mode / Sketch) with a file
 *     search box,
 *   - an approval-policy menu (Ask for approval / Approve for me / Full access),
 *   - a model + effort picker ("Select model", the effort dial, "Select effort"),
 *   - a "Work locally" bar (Local / Connect Codex web / Cloud),
 *   - a round send button.
 * The CLI still runs headless via aiCliStore (agentId 'codex') and owns its own
 * login. Clicking the gear opens Codex's own Settings page (CodexSettings).
 */

const AGENT = 'codex';
const ACCENT = '#10a37f';

type Menu = null | 'plus' | 'approval' | 'model' | 'work';

export default function CodexChat({ label }: { label: string }) {
  const tr = useT();
  const tf = useTf();

  /* Session state (shared headless path) — read as a stable list per zustand
     v5's === rule, then derive the active session. */
  const sessions = useAiCli((s) => s.sessions[AGENT]) ?? EMPTY_LIST;
  const activeSessionId = useAiCli((s) => s.activeId[AGENT]) ?? '';
  const send = useAiCli((s) => s.send);
  const cancel = useAiCli((s) => s.cancel);
  const ensureActive = useAiCli((s) => s.active);
  const newSession = useAiCli((s) => s.newSession);
  const selectSession = useAiCli((s) => s.selectSession);
  const deleteSession = useAiCli((s) => s.deleteSession);
  const setOpts = useAiCli((s) => s.setOpts);

  const chat = sessions.find((s) => s.id === activeSessionId) ?? sessions[sessions.length - 1];
  const messages = chat?.messages ?? [];
  const pending = chat?.pending ?? null;

  /* Codex-only picker + settings state. */
  const approval = useCodex((s) => s.approval);
  const setApproval = useCodex((s) => s.setApproval);
  const workLocation = useCodex((s) => s.workLocation);
  const setWorkLocation = useCodex((s) => s.setWorkLocation);
  const effort = useCodex((s) => s.effort);
  const setEffort = useCodex((s) => s.setEffort);
  const model = useCodex((s) => s.model);
  const setModel = useCodex((s) => s.setModel);
  const settingsOpen = useCodex((s) => s.settingsOpen);
  const setSettingsOpen = useCodex((s) => s.setSettingsOpen);
  const account = useCodex((s) => s.account);
  const loadAccount = useCodex((s) => s.loadAccount);

  const [draft, setDraft] = useState('');
  const [fileFilter, setFileFilter] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [menu, setMenu] = useState<Menu>(null);
  const scroller = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  /* Read the real ~/.codex/config.toml once so the picker is in sync with the
     logged-in CLI (its default model + reasoning effort). */
  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

  /* Make sure a session exists the moment the tab opens, and mirror the chosen
     model into aiCliStore so the next headless send carries `--model`. */
  useEffect(() => {
    ensureActive(AGENT);
  }, [ensureActive]);
  useEffect(() => {
    setOpts(AGENT, { model });
  }, [model, setOpts]);

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
      if (!(e.target as HTMLElement)?.closest('.cdx-pop, .cdx-pop-trigger')) setMenu(null);
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
    if (!t || pending) return;
    void send(AGENT, t);
    setDraft('');
    setMenu(null);
  };

  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text).catch(() => {});
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

  const addFolder = async () => {
    setMenu(null);
    const dir = await folderDialogOpen().catch(() => null);
    if (!dir) return;
    try {
      await scanDir(dir);
      const nama = dir.split(/[\\/]/).filter(Boolean).pop() ?? dir;
      setDraft((d) => `${d ? `${d}\n\n` : ''}@${nama} `);
    } catch {
      /* unreadable folder — ignore */
    }
    inputRef.current?.focus();
  };

  const seedPrompt = (prefix: string) => {
    setMenu(null);
    setDraft((d) => (d.startsWith(prefix) ? d : `${prefix}${d}`));
    inputRef.current?.focus();
  };

  const approvalMeta = APPROVAL_POLICIES.find((a) => a.id === approval) ?? APPROVAL_POLICIES[0];
  const workMeta = WORK_LOCATIONS.find((w) => w.id === workLocation) ?? WORK_LOCATIONS[0];
  const effortLabel = CODEX_EFFORT_LABELS[Math.min(effort, CODEX_EFFORT_LABELS.length - 1)];

  /*
   * The model list — the account's REAL models first.
   *
   * The full catalogue a Codex account can reach lives server-side and is never
   * written to disk, so a complete offline sync is impossible. But two local
   * sources ARE truthful and the backend reads both: the configured default
   * (config.toml `model`) and every model actually used in past sessions
   * (`~/.codex/sessions/**`). When either exists we build the picker from THOSE
   * real ids — so you see `gpt-6-astra`, `gpt-5.5`, `deepseek-v4.1-flash`, the
   * models your account genuinely uses — and fall back to the static set only
   * when there is no history yet (fresh install). Each id is the raw value
   * passed to `--model`, so picking one runs exactly what a terminal would.
   */
  const accountModel = account?.model?.trim() || '';
  const seen = account?.recent_models ?? [];
  const realModels: { id: string; label: string; sub?: string }[] = [];
  const pushReal = (id: string, sub?: string) => {
    if (id && !realModels.some((m) => m.id === id)) realModels.push({ id, label: id, sub });
  };
  if (accountModel) {
    pushReal(
      accountModel,
      account?.provider ? `${account.provider} · current default` : 'Current default',
    );
  }
  for (const sm of seen) {
    pushReal(sm.id, sm.count > 1 ? `Used in ${sm.count} sessions` : 'Used recently');
  }

  /* With real models known, lead with "Default (recommended)" + those; with
     none, keep the static catalogue so the picker is never empty. */
  const modelList = realModels.length
    ? [{ id: 'default', label: 'Default', sub: 'Recommended set of models' }, ...realModels]
    : [...CODEX_MODELS];
  const modelMeta = modelList.find((m) => m.id === model) ?? modelList[0];
  const modelChip = model === 'default' ? tr('Custom') : modelMeta.label;

  /* The "+" menu's add actions and the file search list. */
  const addActions: { id: string; label: string; sub?: string; icon: string; run: () => void }[] = [
    { id: 'files', label: 'Files and folders', icon: 'attach', run: () => void attachFile() },
    { id: 'goal', label: 'Goal', sub: 'Set a goal to keep pursuing', icon: 'goal', run: () => seedPrompt('/goal ') },
    { id: 'plan', label: 'Plan mode', sub: 'Turn plan mode on', icon: 'list', run: () => seedPrompt('/plan ') },
    { id: 'sketch', label: 'Sketch', sub: 'Draw a sketch', icon: 'sketch', run: () => void addFolder() },
  ];

  if (settingsOpen) {
    return <CodexSettings onClose={() => setSettingsOpen(false)} />;
  }

  return (
    <div className="cdx-native" data-testid="ai-codex" style={{ ['--cdx-accent' as string]: ACCENT }}>
      {/* Top-right toolbar: history, settings, compose. */}
      <div className="cdx-topbar" data-testid="ai-codex-topbar">
        <span className="cdx-topbar-spacer" aria-hidden="true" />
        <button
          className={`cdx-top-btn${showHistory ? ' is-on' : ''}`}
          data-testid="ai-codex-history"
          title={tr('Session history')}
          aria-label={tr('Session history')}
          aria-pressed={showHistory}
          onClick={() => setShowHistory((v) => !v)}
        >
          <AiIkon name="history" size={15} />
        </button>
        <button
          className="cdx-top-btn"
          data-testid="ai-codex-settings"
          title={tr('Codex settings')}
          aria-label={tr('Codex settings')}
          onClick={() => setSettingsOpen(true)}
        >
          <AiIkon name="gear" size={15} />
        </button>
        <button
          className="cdx-top-btn"
          data-testid="ai-codex-new"
          title={tr('New chat')}
          aria-label={tr('New chat')}
          onClick={() => {
            newSession(AGENT);
            setDraft('');
            setShowHistory(false);
          }}
        >
          <AiIkon name="compose" size={15} />
        </button>
      </div>

      {showHistory && (
        <div className="cdx-shelf" data-testid="ai-codex-shelf">
          <span className="cdx-shelf-title">{tr('Session history')}</span>
          {sessions.length === 0 ? (
            <span className="cdx-shelf-empty">{tr('No past sessions yet.')}</span>
          ) : (
            <div className="cdx-hist-list">
              {[...sessions].reverse().map((sess) => (
                <div
                  key={sess.id}
                  className={`cdx-hist-row${sess.id === chat?.id ? ' is-on' : ''}`}
                  data-testid={`ai-codex-hist-${sess.id}`}
                >
                  <button
                    type="button"
                    className="cdx-hist-pick"
                    onClick={() => { selectSession(AGENT, sess.id); setShowHistory(false); }}
                  >
                    <AiIkon name="history" size={13} />
                    <span className="cdx-hist-title">{sess.title ? tr(sess.title) : tr('New chat')}</span>
                    <span className="cdx-hist-meta">{sess.messages.length}</span>
                  </button>
                  <button
                    type="button"
                    className="cdx-hist-del"
                    title={tr('Delete')}
                    aria-label={tr('Delete')}
                    onClick={() => deleteSession(AGENT, sess.id)}
                  >
                    <AiIkon name="trash" size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="cdx-log" ref={scroller} data-testid="ai-codex-log">
        {messages.length === 0 ? (
          <div className="cdx-welcome" data-testid="ai-codex-welcome">
            {/* The Codex mark: a scalloped square (stamp-edge, 3 bumps a side)
                with a `>_` terminal prompt inside, like the real empty state. */}
            <svg
              className="cdx-mark"
              viewBox="0 0 48 48"
              width="60"
              height="60"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M 7 7 A 5.667 5.667 0 0 0 18.333 7 A 5.667 5.667 0 0 0 29.667 7 A 5.667 5.667 0 0 0 41 7 A 5.667 5.667 0 0 0 41 18.333 A 5.667 5.667 0 0 0 41 29.667 A 5.667 5.667 0 0 0 41 41 A 5.667 5.667 0 0 0 29.667 41 A 5.667 5.667 0 0 0 18.333 41 A 5.667 5.667 0 0 0 7 41 A 5.667 5.667 0 0 0 7 29.667 A 5.667 5.667 0 0 0 7 18.333 A 5.667 5.667 0 0 0 7 7 Z" />
              <path d="M20 20l4.5 4-4.5 4M26.5 28H31" strokeWidth="2.4" />
            </svg>
          </div>
        ) : (
          <div className="cdx-thread">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`cdx-row is-${m.role}${m.error ? ' is-error' : ''}`}
                data-testid={`ai-codex-msg-${m.role}`}
              >
                {m.role === 'user' ? (
                  <div className="cdx-user">{m.content}</div>
                ) : (
                  <div className="cdx-assistant">
                    <div className="cdx-text">
                      {m.content || (pending === m.id ? <span className="ai-dots">…</span> : '')}
                    </div>
                    {m.content && pending !== m.id && (
                      <div className="cdx-rowtools">
                        <button
                          className="cdx-iconbtn"
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

      {/* Composer — modelled on the real Codex input bar. */}
      <div className="cdx-composer-wrap">
        {/* "+" add menu floats ABOVE the composer, as a card. */}
        {menu === 'plus' && (
          <div className="cdx-pop cdx-add" role="menu" data-testid="ai-codex-plus-menu">
            <p className="cdx-pop-group">{tr('Add')}</p>
            {addActions.map((a) => (
              <button
                key={a.id}
                role="menuitem"
                className="cdx-pop-item"
                data-testid={`ai-codex-add-${a.id}`}
                onClick={a.run}
              >
                <AiIkon name={a.icon as never} size={15} />
                <span className="cdx-pop-item-text">
                  <span className="cdx-pop-item-label">{tr(a.label)}</span>
                  {a.sub && <span className="cdx-pop-item-sub">{tr(a.sub)}</span>}
                </span>
              </button>
            ))}
            <p className="cdx-pop-group">{tr('Files')}</p>
            <input
              className="cdx-pop-filter"
              autoFocus
              placeholder={tr('Type to search for files')}
              value={fileFilter}
              onChange={(e) => setFileFilter(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void attachFile(); }}
            />
          </div>
        )}

        <div className="cdx-composer">
          <textarea
            ref={inputRef}
            className="cdx-input"
            data-testid="ai-codex-input"
            rows={1}
            placeholder={pending ? tf('{name} is working…', { name: label }) : tr('Do anything')}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                kirim();
              }
            }}
          />

          <div className="cdx-bar">
            {/* "+" menu */}
            <button
              className="cdx-chip cdx-pop-trigger"
              data-testid="ai-codex-plus"
              title={tr('Add')}
              aria-haspopup="menu"
              aria-expanded={menu === 'plus'}
              onClick={() => setMenu((m) => (m === 'plus' ? null : 'plus'))}
            >
              <AiIkon name="plus" size={15} />
            </button>

            {/* Approval policy */}
            <div className="cdx-pop-wrap">
              <button
                className="cdx-approval cdx-pop-trigger"
                data-testid="ai-codex-approval"
                aria-haspopup="menu"
                aria-expanded={menu === 'approval'}
                onClick={() => setMenu((m) => (m === 'approval' ? null : 'approval'))}
              >
                <AiIkon name={approvalMeta.icon as never} size={13} />
                <span>{tr(approvalMeta.label)}</span>
              </button>
              {menu === 'approval' && (
                <div className="cdx-pop cdx-pop-up" role="menu" data-testid="ai-codex-approval-menu">
                  <div className="cdx-pop-group cdx-pop-group-row">
                    <span>{tr('How should Codex actions be approved?')}</span>
                    <a className="cdx-pop-learn" href="https://developers.openai.com/codex" target="_blank" rel="noreferrer">
                      {tr('Learn more')}
                    </a>
                  </div>
                  {APPROVAL_POLICIES.map((p) => (
                    <button
                      key={p.id}
                      role="menuitemradio"
                      aria-checked={approval === p.id}
                      className={`cdx-pop-item is-approval${approval === p.id ? ' is-on' : ''}${p.id === 'full' ? ' is-warn' : ''}`}
                      data-testid={`ai-codex-approval-${p.id}`}
                      onClick={() => { setApproval(p.id); setMenu(null); }}
                    >
                      <AiIkon name={p.icon as never} size={15} />
                      <span className="cdx-pop-item-text">
                        <span className="cdx-pop-item-label">{tr(p.label)}</span>
                        <span className="cdx-pop-item-sub">{tr(p.sub)}</span>
                      </span>
                      {approval === p.id && <AiIkon name="check" size={13} />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <span className="cdx-spacer" aria-hidden="true" />

            {/* Model + effort chip → "Select model" / effort dial */}
            <div className="cdx-pop-wrap">
              <button
                className="cdx-model cdx-pop-trigger"
                data-testid="ai-codex-model"
                aria-haspopup="menu"
                aria-expanded={menu === 'model'}
                onClick={() => setMenu((m) => (m === 'model' ? null : 'model'))}
              >
                <span className="cdx-model-name">{modelChip}</span>
                <span className="cdx-model-effort">{effortLabel}</span>
                <AiIkon name="chev-down" size={11} />
              </button>
              {menu === 'model' && (
                <div className="cdx-pop cdx-pop-up cdx-pop-right" role="menu" data-testid="ai-codex-model-menu">
                  {/*
                    * The effort dial, drawn as the app's notched pill: a header
                    * (level in accent + "Custom" + reset), then a track with a
                    * knob at the chosen notch and the rest as dots, the fill to
                    * the left of the knob tinted. Each notch is clickable.
                    */}
                  <div className="cdx-dial" data-testid="ai-codex-dial">
                    <div className="cdx-dial-head">
                      <span className="cdx-dial-label">{effortLabel}</span>
                      <span className="cdx-dial-sub">{tr('Custom')} ›</span>
                      <button
                        className="cdx-dial-reset"
                        title={tr('Reset')}
                        aria-label={tr('Reset')}
                        onClick={() => setEffort(0)}
                      >
                        <AiIkon name="refresh" size={13} />
                      </button>
                    </div>
                    <div
                      className="cdx-dial-track"
                      role="slider"
                      aria-label={tr('Reasoning effort')}
                      aria-valuemin={0}
                      aria-valuemax={CODEX_EFFORT_LABELS.length - 1}
                      aria-valuenow={effort}
                      aria-valuetext={effortLabel}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
                          e.preventDefault();
                          setEffort(Math.min(effort + 1, CODEX_EFFORT_LABELS.length - 1));
                        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
                          e.preventDefault();
                          setEffort(Math.max(effort - 1, 0));
                        }
                      }}
                    >
                      <span
                        className="cdx-dial-fill"
                        style={{ width: `${(effort / (CODEX_EFFORT_LABELS.length - 1)) * 100}%` }}
                        aria-hidden="true"
                      />
                      {CODEX_EFFORT_LABELS.map((lvl, i) => (
                        <button
                          key={lvl}
                          type="button"
                          className={`cdx-dial-notch${i === effort ? ' is-on' : ''}${i < effort ? ' is-past' : ''}`}
                          title={tr(lvl)}
                          aria-label={tr(lvl)}
                          data-testid={`ai-codex-effort-${i}`}
                          onClick={() => setEffort(i)}
                        >
                          {i === effort && <span className="cdx-dial-knob" aria-hidden="true" />}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="cdx-pop-sep" />
                  <p className="cdx-pop-group">{tr('Select model')}</p>
                  <div className="cdx-pop-scroll">
                    {modelList.map((mdl) => (
                      <button
                        key={mdl.id}
                        role="menuitemradio"
                        aria-checked={model === mdl.id}
                        className={`cdx-pop-item is-model${model === mdl.id ? ' is-on' : ''}`}
                        data-testid={`ai-codex-model-opt-${mdl.id}`}
                        onClick={() => { setModel(mdl.id); setMenu(null); }}
                      >
                        <span className="cdx-pop-item-text">
                          <span className="cdx-pop-item-label">{tr(mdl.label)}</span>
                          {mdl.sub && <span className="cdx-pop-item-sub">{tr(mdl.sub)}</span>}
                        </span>
                        {model === mdl.id && <AiIkon name="check" size={13} />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {pending ? (
              <button
                className="cdx-send is-stop"
                data-testid="ai-codex-stop"
                title={tr('Stop')}
                aria-label={tr('Stop')}
                onClick={() => cancel(AGENT)}
              >
                <AiIkon name="stop" size={13} />
              </button>
            ) : (
              <button
                className="cdx-send"
                data-testid="ai-codex-send"
                disabled={!draft.trim()}
                title={tr('Send')}
                aria-label={tr('Send')}
                onClick={kirim}
              >
                <AiIkon name="chev-up" size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Work-location bar, under the composer. */}
        <div className="cdx-work">
          <div className="cdx-pop-wrap">
            <button
              className="cdx-work-btn cdx-pop-trigger"
              data-testid="ai-codex-work"
              aria-haspopup="menu"
              aria-expanded={menu === 'work'}
              onClick={() => setMenu((m) => (m === 'work' ? null : 'work'))}
            >
              <AiIkon name={workMeta.icon as never} size={14} />
              <span>{workMeta.id === 'local' ? tr('Work locally') : tr(workMeta.label)}</span>
              <AiIkon name="chev-down" size={11} />
            </button>
            {menu === 'work' && (
              <div className="cdx-pop cdx-pop-up" role="menu" data-testid="ai-codex-work-menu">
                <p className="cdx-pop-group">{tr('Work in')}</p>
                {WORK_LOCATIONS.map((w) => (
                  <button
                    key={w.id}
                    role="menuitemradio"
                    aria-checked={workLocation === w.id}
                    className={`cdx-pop-item is-work${workLocation === w.id ? ' is-on' : ''}`}
                    data-testid={`ai-codex-work-${w.id}`}
                    disabled={w.disabled}
                    onClick={() => { if (!w.disabled) { setWorkLocation(w.id); setMenu(null); } }}
                  >
                    <AiIkon name={w.icon as never} size={14} />
                    <span className="cdx-pop-item-label">{tr(w.label)}</span>
                    {workLocation === w.id && <AiIkon name="check" size={13} />}
                    {w.external && <AiIkon name="export" size={12} />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
