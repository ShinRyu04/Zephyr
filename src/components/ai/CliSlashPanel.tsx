import { useEffect, useState } from 'react';
import {
  claudeAccountInfo,
  claudeSettingsPatch,
  claudeMemoryWrite,
  claudeCommandWrite,
  claudeCommandDelete,
  claudeBuiltinCommands,
  ccCatalogList,
  ccCatalogBody,
  ccCatalogInstall,
  ccCatalogUninstall,
  type ClaudeInfo,
  type ClaudePlugin,
  type CatalogItem,
  type BuiltinCommand,
} from '../../lib/commands';
import { useT } from '../../lib/i18n';
import AiIkon from './AiIkon';

/*
 * The real popups behind the Claude Code slash "/" palette.
 *
 * Each slash action opens one sheet here, filled with the LOGGED-IN CLI's own
 * configuration — read live from `~/.claude/` via `claude_account_info`, never
 * invented, never leaking secrets. Several sheets are also EDITABLE and write
 * straight back into the CLI's config files (settings.json, CLAUDE.md,
 * ~/.claude/commands) so a change here is live the next terminal run too:
 *   - Permissions : switch default mode, add/remove allow·ask·deny rules
 *   - Memory      : edit the CLAUDE.md files inline and save
 *   - Output style: pick the active style
 *   - Hooks       : view/remove hooks
 *   - Slash cmds  : built-ins + custom; click to run (inserts into composer)
 *   - Subagents / Skills : browse the bundled catalog and install into ~/.claude
 */

export type SlashPanel =
  | 'status'
  | 'permissions'
  | 'sandbox'
  | 'memory'
  | 'instructions'
  | 'commands'
  | 'style'
  | 'plugins'
  | 'mcp'
  | 'hooks'
  | 'account'
  | 'agents'
  | 'skills';

const TITLES: Record<SlashPanel, string> = {
  status: 'Status',
  permissions: 'Permissions',
  sandbox: 'Sandbox',
  memory: 'Memory',
  instructions: 'Instructions',
  commands: 'Slash commands',
  style: 'Output style',
  plugins: 'Manage plugins',
  mcp: 'MCP servers',
  hooks: 'Hooks',
  account: 'Account & Usage',
  agents: 'Subagents',
  skills: 'Skills',
};

/* The permission modes Claude Code accepts, with the exact wording. */
const PERM_MODES: { id: string; label: string }[] = [
  { id: 'default', label: 'Manual — ask before each change' },
  { id: 'acceptEdits', label: 'Accept edits automatically' },
  { id: 'plan', label: 'Plan — explore then present a plan' },
  { id: 'auto', label: 'Auto — approve safe actions, pause on risky' },
  { id: 'bypassPermissions', label: 'Bypass — never ask (dangerous)' },
];

/* Built-in output styles the CLI ships. */
const STYLES = ['default', 'explanatory', 'learning'];

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function fmtMs(ms: number): string {
  if (!ms) return '—';
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.round(s % 60)}s`;
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="cli-sheet-row">
      <span className="cli-sheet-k">{k}</span>
      <span className="cli-sheet-v">{v}</span>
    </div>
  );
}

export default function CliSlashPanel({
  panel,
  cwd,
  onInsert,
  onClose,
}: {
  panel: SlashPanel;
  cwd?: string;
  /** Insert text into the composer (used by runnable slash commands). */
  onInsert?: (text: string) => void;
  onClose: () => void;
}) {
  const tr = useT();
  const [info, setInfo] = useState<ClaudeInfo | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const isCatalog = panel === 'agents' || panel === 'skills';

  const reload = () => {
    if (isCatalog) {
      setLoading(false);
      return;
    }
    setLoading(true);
    claudeAccountInfo(cwd)
      .then((i) => (setInfo(i), setErr('')))
      .catch((e) => setErr(String(e?.message ?? e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let alive = true;
    if (isCatalog) {
      setLoading(false);
      return;
    }
    setLoading(true);
    claudeAccountInfo(cwd)
      .then((i) => alive && (setInfo(i), setErr('')))
      .catch((e) => alive && setErr(String(e?.message ?? e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [panel, cwd, isCatalog]);

  const wide = isCatalog || panel === 'memory' || panel === 'instructions' || panel === 'commands';

  return (
    <div className="cli-sheet-backdrop" data-testid="cli-slash-panel" onMouseDown={onClose}>
      <div
        className={`cli-sheet${wide ? ' is-wide' : ''}`}
        role="dialog"
        aria-label={tr(TITLES[panel])}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="cli-sheet-head">
          <span className="cli-sheet-title">{tr(TITLES[panel])}</span>
          <button className="cli-sheet-x" title={tr('Close')} aria-label={tr('Close')} onClick={onClose}>
            <AiIkon name="close" size={13} />
          </button>
        </div>
        <div className="cli-sheet-body">
          {isCatalog ? (
            <CatalogBrowser kind={panel === 'agents' ? 'agent' : 'skill'} />
          ) : loading ? (
            <p className="cli-sheet-empty">{tr('Loading…')}</p>
          ) : err ? (
            <p className="cli-sheet-error">{err}</p>
          ) : info ? (
            <InfoPanel
              panel={panel}
              info={info}
              cwd={cwd}
              reload={reload}
              onInsert={onInsert}
              onClose={onClose}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function InfoPanel({
  panel,
  info,
  cwd,
  reload,
  onInsert,
  onClose,
}: {
  panel: SlashPanel;
  info: ClaudeInfo;
  cwd?: string;
  reload: () => void;
  onInsert?: (text: string) => void;
  onClose: () => void;
}) {
  switch (panel) {
    case 'status':
      return <StatusPanel info={info} />;
    case 'permissions':
      return <PermissionsPanel info={info} reload={reload} />;
    case 'sandbox':
      return <SandboxPanel info={info} />;
    case 'memory':
    case 'instructions':
      return <MemoryPanel info={info} cwd={cwd} reload={reload} />;
    case 'commands':
      return <CommandsPanel info={info} reload={reload} onInsert={onInsert} onClose={onClose} />;
    case 'style':
      return <StylePanel info={info} reload={reload} />;
    case 'plugins':
      return <PluginsPanel info={info} reload={reload} />;
    case 'mcp':
      return <McpPanel info={info} reload={reload} />;
    case 'hooks':
      return <HooksPanel info={info} reload={reload} />;
    case 'account':
      return <AccountPanel info={info} />;
    default:
      return null;
  }
}

function StatusPanel({ info }: { info: ClaudeInfo }) {
  const tr = useT();
  return (
    <div className="cli-sheet-group">
      <Row k={tr('Version')} v={info.version || '—'} />
      <Row k={tr('Model')} v={info.model || tr('default')} />
      <Row k={tr('Permission mode')} v={info.permission_mode} />
      <Row k={tr('Theme')} v={info.theme || '—'} />
      <Row k={tr('Working directory')} v={<code>{info.cwd || '—'}</code>} />
      <Row k={tr('Trusted folder')} v={info.trusted ? tr('Yes') : tr('No')} />
      <Row k={tr('API endpoint')} v={<code>{info.base_url || 'api.anthropic.com'}</code>} />
      <Row k={tr('Max context')} v={info.max_context_tokens ? `${info.max_context_tokens} tokens` : '—'} />
      <Row k={tr('Auth')} v={info.auth_kind} />
    </div>
  );
}

function SandboxPanel({ info }: { info: ClaudeInfo }) {
  const tr = useT();
  return (
    <div className="cli-sheet-group">
      <Row k={tr('Permission mode')} v={info.permission_mode} />
      <Row k={tr('Skip risky prompts')} v={info.skip_dangerous ? tr('Yes') : tr('No')} />
      <Row k={tr('Trusted folder')} v={info.trusted ? tr('Yes') : tr('No')} />
      <p className="cli-sheet-note">
        {tr('Sandbox follows the permission mode: in Plan/Manual the CLI asks before writing or running; Auto approves safe actions and pauses on anything risky.')}
      </p>
    </div>
  );
}

/* Editable permissions: switch default mode and add/remove allow·ask·deny. */
function PermissionsPanel({ info, reload }: { info: ClaudeInfo; reload: () => void }) {
  const tr = useT();
  const [busy, setBusy] = useState(false);

  const setMode = async (mode: string) => {
    setBusy(true);
    try {
      await claudeSettingsPatch({ permissions: { defaultMode: mode } });
      reload();
    } finally {
      setBusy(false);
    }
  };

  const edit = async (bucket: 'allow' | 'ask' | 'deny', next: string[]) => {
    setBusy(true);
    try {
      await claudeSettingsPatch({ permissions: { [bucket]: next } });
      reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cli-sheet-group">
      <p className="cli-sheet-sub">{tr('Default mode')}</p>
      <div className="cli-chip-row">
        {PERM_MODES.map((m) => (
          <button
            key={m.id}
            className={`cli-chip${info.permission_mode === m.id ? ' is-on' : ''}`}
            disabled={busy}
            onClick={() => setMode(m.id)}
          >
            {tr(m.label)}
          </button>
        ))}
      </div>
      <RuleEditor title={tr('Allow')} rules={info.permission_allow} busy={busy} onChange={(n) => edit('allow', n)} placeholder="Bash(git *)" />
      <RuleEditor title={tr('Ask')} rules={info.permission_ask} busy={busy} onChange={(n) => edit('ask', n)} placeholder="Write(*)" />
      <RuleEditor title={tr('Deny')} rules={info.permission_deny} busy={busy} onChange={(n) => edit('deny', n)} placeholder="Bash(rm *)" />
    </div>
  );
}

function RuleEditor({
  title,
  rules,
  busy,
  onChange,
  placeholder,
}: {
  title: string;
  rules: string[];
  busy: boolean;
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  const tr = useT();
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    onChange([...rules, v]);
    setDraft('');
  };
  return (
    <div className="cli-rule-group">
      <p className="cli-sheet-sub">{title}</p>
      <div className="cli-sheet-rules">
        {rules.map((r, i) => (
          <span key={i} className="cli-sheet-rule is-chip">
            {r}
            <button
              className="cli-rule-x"
              disabled={busy}
              title={tr('Remove')}
              onClick={() => onChange(rules.filter((_, j) => j !== i))}
            >
              ✕
            </button>
          </span>
        ))}
      </div>
      <div className="cli-rule-add">
        <input
          className="cli-sheet-input"
          placeholder={placeholder}
          value={draft}
          disabled={busy}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button className="btn btn-sm" disabled={busy || !draft.trim()} onClick={add}>
          {tr('Add')}
        </button>
      </div>
    </div>
  );
}

/* Editable memory files: pick a file, edit markdown, save back to disk. */
function MemoryPanel({ info, cwd, reload }: { info: ClaudeInfo; cwd?: string; reload: () => void }) {
  const tr = useT();
  const files = info.memory_files;
  const [edit, setEdit] = useState<{ scope: 'user' | 'project'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!edit) return;
    setBusy(true);
    try {
      await claudeMemoryWrite(edit.scope, edit.text, cwd);
      setEdit(null);
      reload();
    } finally {
      setBusy(false);
    }
  };

  if (edit) {
    return (
      <div className="cli-sheet-group">
        <p className="cli-sheet-sub">{edit.scope === 'user' ? tr('User memory (~/.claude/CLAUDE.md)') : tr('Project memory (CLAUDE.md)')}</p>
        <textarea
          className="cli-sheet-textarea"
          value={edit.text}
          autoFocus
          onChange={(e) => setEdit({ ...edit, text: e.target.value })}
        />
        <div className="cli-sheet-actions">
          <button className="btn btn-sm" disabled={busy} onClick={save}>{tr('Save')}</button>
          <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => setEdit(null)}>{tr('Cancel')}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="cli-sheet-group">
      {files.map((f) => (
        <div key={f.path} className="cli-sheet-file">
          <div className="cli-sheet-file-head">
            <AiIkon name="doc" size={13} />
            <span className="cli-sheet-file-label">{f.label}</span>
            <span className="cli-sheet-file-meta">{f.scope} · {fmtBytes(f.bytes)}</span>
            {(f.scope === 'user' || f.scope === 'project') && (
              <button
                className="btn btn-xs"
                onClick={() => setEdit({ scope: f.scope as 'user' | 'project', text: f.preview })}
              >
                {tr('Edit')}
              </button>
            )}
          </div>
          <pre className="cli-sheet-preview"><code>{f.preview}{f.bytes > f.preview.length ? '\n…' : ''}</code></pre>
        </div>
      ))}
      <div className="cli-sheet-actions">
        <button className="btn btn-sm" onClick={() => setEdit({ scope: 'user', text: '' })}>
          {tr('Edit user memory')}
        </button>
        {cwd && (
          <button className="btn btn-sm" onClick={() => setEdit({ scope: 'project', text: '' })}>
            {tr('Edit project memory')}
          </button>
        )}
      </div>
    </div>
  );
}

/* Slash commands: built-ins + the user's custom .md commands. Clicking one puts
   it in the composer so it can actually be run. Custom ones can be deleted. */
function CommandsPanel({
  info,
  reload,
  onInsert,
  onClose,
}: {
  info: ClaudeInfo;
  reload: () => void;
  onInsert?: (text: string) => void;
  onClose: () => void;
}) {
  const tr = useT();
  const [builtins, setBuiltins] = useState<BuiltinCommand[]>([]);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState<{ name: string; body: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    claudeBuiltinCommands().then(setBuiltins).catch(() => {});
  }, []);

  const run = (name: string) => {
    onInsert?.(name.endsWith(' ') ? name : `${name} `);
    onClose();
  };

  const saveNew = async () => {
    if (!adding) return;
    const name = adding.name.trim();
    if (!name) return;
    setBusy(true);
    try {
      await claudeCommandWrite(name, adding.body);
      setAdding(null);
      reload();
    } finally {
      setBusy(false);
    }
  };

  const del = async (name: string) => {
    setBusy(true);
    try {
      await claudeCommandDelete(name);
      reload();
    } finally {
      setBusy(false);
    }
  };

  const needle = q.trim().toLowerCase();
  const bshown = needle ? builtins.filter((b) => b.name.includes(needle) || b.desc.toLowerCase().includes(needle)) : builtins;
  const cshown = needle ? info.slash_commands.filter((c) => c.label.toLowerCase().includes(needle)) : info.slash_commands;

  if (adding) {
    return (
      <div className="cli-sheet-group">
        <p className="cli-sheet-sub">{tr('New slash command')}</p>
        <input
          className="cli-sheet-input"
          placeholder="review-pr"
          value={adding.name}
          autoFocus
          onChange={(e) => setAdding({ ...adding, name: e.target.value })}
        />
        <textarea
          className="cli-sheet-textarea"
          placeholder={tr('The prompt this command runs…')}
          value={adding.body}
          onChange={(e) => setAdding({ ...adding, body: e.target.value })}
        />
        <div className="cli-sheet-actions">
          <button className="btn btn-sm" disabled={busy || !adding.name.trim()} onClick={saveNew}>{tr('Create')}</button>
          <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => setAdding(null)}>{tr('Cancel')}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="cli-sheet-group">
      <div className="cli-cat-top">
        <input className="cli-cat-search" placeholder={tr('Search commands…')} value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn btn-sm" onClick={() => setAdding({ name: '', body: '' })}>{tr('New')}</button>
      </div>
      {cshown.length > 0 && <p className="cli-sheet-sub">{tr('Your commands')}</p>}
      {cshown.map((c) => (
        <div key={c.path} className="cli-cmd-row">
          <button className="cli-cmd-run" onClick={() => run(c.label)} title={tr('Run')}>
            <code className="cli-sheet-cmd">{c.label}</code>
            <span className="cli-sheet-file-meta">{c.scope}</span>
          </button>
          {c.scope === 'user' && (
            <button className="cli-rule-x" disabled={busy} title={tr('Delete')} onClick={() => del(c.label)}>✕</button>
          )}
        </div>
      ))}
      <p className="cli-sheet-sub">{tr('Built-in')}</p>
      {bshown.map((b) => (
        <button key={b.name} className="cli-cmd-run is-builtin" onClick={() => run(b.name)} title={tr('Run')}>
          <code className="cli-sheet-cmd">{b.name}</code>
          <span className="cli-sheet-file-meta">{b.desc}</span>
        </button>
      ))}
      {!bshown.length && !cshown.length && <p className="cli-sheet-empty">{tr('No commands match.')}</p>}
    </div>
  );
}

function StylePanel({ info, reload }: { info: ClaudeInfo; reload: () => void }) {
  const tr = useT();
  const [busy, setBusy] = useState(false);
  const active = info.output_style || 'default';
  const pick = async (style: string) => {
    setBusy(true);
    try {
      await claudeSettingsPatch({ outputStyle: style === 'default' ? null : style });
      reload();
    } finally {
      setBusy(false);
    }
  };
  const custom = info.output_styles.map((s) => s.label);
  const all = [...STYLES, ...custom.filter((c) => !STYLES.includes(c))];
  return (
    <div className="cli-sheet-group">
      <p className="cli-sheet-sub">{tr('Active style')}</p>
      <div className="cli-chip-row">
        {all.map((s) => (
          <button key={s} className={`cli-chip${active === s ? ' is-on' : ''}`} disabled={busy} onClick={() => pick(s)}>
            {s}
          </button>
        ))}
      </div>
      <p className="cli-sheet-note">{tr('Output style changes how Claude formats answers. Custom styles are .md files in ~/.claude/output-styles.')}</p>
    </div>
  );
}

function PluginsPanel({ info, reload }: { info: ClaudeInfo; reload: () => void }) {
  const tr = useT();
  const [busy, setBusy] = useState(false);

  /*
   * Turn a plugin on or off.
   *
   * The state lives in `settings.json` as `enabledPlugins: { "<name>@<market>":
   * true }` — the same map `claude_account_info` reads to fill `enabled`. So the
   * toggle is an ordinary settings patch, and sending `false` (not null) is what
   * matters: null would DELETE the key, and Claude Code treats a missing entry
   * and an explicit false the same way for enabling, but the difference shows up
   * the moment someone reads the file to see what was deliberately turned off.
   */
  const setEnabled = async (p: ClaudePlugin, on: boolean) => {
    setBusy(true);
    try {
      await claudeSettingsPatch({ enabledPlugins: { [`${p.name}@${p.marketplace}`]: on } });
      reload();
    } finally {
      setBusy(false);
    }
  };

  if (!info.plugins.length)
    return (
      <div className="cli-sheet-group">
        <p className="cli-sheet-empty">{tr('No plugins installed.')}</p>
        <p className="cli-sheet-note">
          {tr('Plugins bundle commands, agents, skills and hooks. Install them with /plugin in the terminal; they are listed here once installed.')}
        </p>
      </div>
    );
  return (
    <div className="cli-sheet-group">
      {info.plugins.map((p) => (
        <div key={`${p.name}@${p.marketplace}`} className="cli-sheet-plugin">
          <span className={`cli-sheet-dot${p.enabled ? ' is-on' : ''}`} aria-hidden="true" />
          <span className="cli-sheet-plugin-name">{p.name}</span>
          <span className="cli-sheet-file-meta">
            {p.marketplace}{p.version ? ` · v${p.version}` : ''} · {p.enabled ? tr('enabled') : tr('disabled')}
          </span>
          <button
            className="btn btn-ghost btn-xs"
            disabled={busy}
            data-testid={`cli-plugin-toggle-${p.name}`}
            aria-pressed={p.enabled}
            onClick={() => void setEnabled(p, !p.enabled)}
          >
            {p.enabled ? tr('Disable') : tr('Enable')}
          </button>
        </div>
      ))}
    </div>
  );
}

function McpPanel({ info, reload }: { info: ClaudeInfo; reload: () => void }) {
  const tr = useT();
  const [busy, setBusy] = useState(false);
  const [tambah, setTambah] = useState(false);
  const [nama, setNama] = useState('');
  const [target, setTarget] = useState('');
  const [galat, setGalat] = useState('');

  /*
   * Remove a server by deleting its key.
   *
   * `null` is the delete instruction for `claude_settings_patch` (RFC 7386), so
   * this is the one place null is correct — sending `false` or `""` would leave
   * the entry present with a nonsense value, and the server would still be
   * configured.
   */
  const hapus = async (n: string) => {
    setBusy(true);
    try {
      await claudeSettingsPatch({ mcpServers: { [n]: null } });
      reload();
    } finally {
      setBusy(false);
    }
  };

  /*
   * Add a server.
   *
   * The target is split on whitespace into command + args, which is what the
   * CLI's own `mcpServers` entries look like: `{"command": "npx", "args": [...]}`.
   * A URL target is written as the `url` form instead, since a hosted MCP server
   * is a different shape from a spawned one and guessing wrong produces a server
   * that silently never connects.
   */
  const simpan = async () => {
    setGalat('');
    const n = nama.trim();
    const t = target.trim();
    if (!n || !t) {
      setGalat(tr('A server needs both a name and a command or URL.'));
      return;
    }
    if (!/^[\w.-]+$/.test(n)) {
      setGalat(tr('The name may only contain letters, digits, dot, dash and underscore.'));
      return;
    }
    setBusy(true);
    try {
      const entry = /^https?:\/\//i.test(t)
        ? { url: t }
        : (() => {
            const [cmd, ...rest] = t.split(/\s+/);
            return { command: cmd, args: rest };
          })();
      await claudeSettingsPatch({ mcpServers: { [n]: entry } });
      setNama('');
      setTarget('');
      setTambah(false);
      reload();
    } catch (e) {
      setGalat(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const form = tambah ? (
    <div className="cli-hook-form">
      <label className="cli-hook-field">
        <span>{tr('Name')}</span>
        <input
          className="cli-sheet-input"
          value={nama}
          placeholder="my-server"
          onChange={(e) => setNama(e.target.value)}
          data-testid="cli-mcp-name"
        />
      </label>
      <label className="cli-hook-field">
        <span>{tr('Command or URL')}</span>
        <input
          className="cli-sheet-input"
          value={target}
          placeholder={tr('npx -y @modelcontextprotocol/server-filesystem . — or https://…')}
          onChange={(e) => setTarget(e.target.value)}
          data-testid="cli-mcp-target"
        />
      </label>
      {galat && <p className="cli-sheet-error" data-testid="cli-mcp-error">{galat}</p>}
      <div className="cli-sheet-actions">
        <button className="btn btn-primary btn-xs" disabled={busy} data-testid="cli-mcp-save" onClick={() => void simpan()}>
          {tr('Add server')}
        </button>
        <button className="btn btn-ghost btn-xs" disabled={busy} onClick={() => { setTambah(false); setGalat(''); }}>
          {tr('Cancel')}
        </button>
      </div>
    </div>
  ) : (
    <div className="cli-sheet-actions">
      <button className="btn btn-ghost btn-xs" data-testid="cli-mcp-add" onClick={() => setTambah(true)}>
        + {tr('Add server')}
      </button>
    </div>
  );

  if (!info.mcp_servers.length)
    return (
      <div className="cli-sheet-group">
        <p className="cli-sheet-empty">{tr('No MCP servers configured.')}</p>
        <p className="cli-sheet-note">
          {tr('MCP servers give the agent extra tools — a database, a browser, an internal API. They are stored in ~/.claude/settings.json under mcpServers.')}
        </p>
        {form}
      </div>
    );
  return (
    <div className="cli-sheet-group">
      {info.mcp_servers.map((s) => (
        <div key={s.name} className="cli-sheet-file">
          <div className="cli-sheet-file-head">
            <AiIkon name="node" size={13} />
            <span className="cli-sheet-file-label">{s.name}</span>
            <span className="cli-sheet-file-meta">{s.kind} · {s.scope}</span>
            <button
              className="cli-rule-x"
              disabled={busy}
              title={tr('Remove')}
              data-testid={`cli-mcp-remove-${s.name}`}
              onClick={() => void hapus(s.name)}
            >
              ✕
            </button>
          </div>
          <code className="cli-sheet-rule">{s.target}</code>
        </div>
      ))}
      {form}
    </div>
  );
}

/* Hooks: list every configured hook and let the user remove one. Adding hooks
   is complex (matchers, events) so creation stays in the CLI; removal and
   inspection are the common edits. */
function HooksPanel({ info, reload }: { info: ClaudeInfo; reload: () => void }) {
  const tr = useT();
  const [busy, setBusy] = useState(false);
  /* The add form. Kept open by default: a panel whose only capability is
     deleting is a panel nobody can start using. */
  const [tambah, setTambah] = useState(false);
  const [evBaru, setEvBaru] = useState('PreToolUse');
  const [matchBaru, setMatchBaru] = useState('');
  const [cmdBaru, setCmdBaru] = useState('');
  const [galat, setGalat] = useState('');

  const removeHook = async (event: string) => {
    setBusy(true);
    try {
      // Remove the whole event bucket (null deletes the key).
      await claudeSettingsPatch({ hooks: { [event]: null } });
      reload();
    } finally {
      setBusy(false);
    }
  };

  /*
   * Add one hook to one event.
   *
   * The settings shape is `hooks: { <Event>: [ { matcher, hooks: [ {type,command} ] } ] }`
   * — an array of matcher groups, each holding an array of handlers. Writing a
   * flat `{event, command}` object would be accepted by the merge and then
   * ignored by Claude Code, which looks exactly like the hook having been saved.
   *
   * The existing groups for this event are re-sent unchanged alongside the new
   * one because `claude_settings_patch` MERGES: sending only the new group would
   * append to the array rather than replace it, and the reader would end up with
   * an ever-growing list they cannot remove individually.
   */
  const addHook = async () => {
    setGalat('');
    const cmd = cmdBaru.trim();
    if (!cmd) {
      setGalat(tr('A hook needs a command to run.'));
      return;
    }
    setBusy(true);
    try {
      const adaGrup = info.hooks
        .filter((h) => h.event === evBaru)
        .map((h) => ({ matcher: h.matcher || undefined, hooks: [{ type: 'command', command: h.command }] }));
      const grupBaru = {
        matcher: matchBaru.trim() || undefined,
        hooks: [{ type: 'command', command: cmd }],
      };
      await claudeSettingsPatch({ hooks: { [evBaru]: [...adaGrup, grupBaru] } });
      setCmdBaru('');
      setMatchBaru('');
      setTambah(false);
      reload();
    } catch (e) {
      setGalat(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  /* The events a hook can attach to. The full set Claude Code supports; a
     free-text box would let a typo create a hook that never fires, with no
     feedback saying so. */
  const EVENTS = [
    'PreToolUse',
    'PostToolUse',
    'PostToolUseFailure',
    'UserPromptSubmit',
    'Notification',
    'Stop',
    'SubagentStop',
    'PreCompact',
    'SessionStart',
    'SessionEnd',
  ];

  const form = tambah ? (
    <div className="cli-hook-form">
      <label className="cli-hook-field">
        <span>{tr('Event')}</span>
        <select
          className="cli-sheet-input"
          value={evBaru}
          onChange={(e) => setEvBaru(e.target.value)}
          data-testid="cli-hook-event"
        >
          {EVENTS.map((e) => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>
      </label>
      <label className="cli-hook-field">
        <span>{tr('Matcher')}</span>
        <input
          className="cli-sheet-input"
          value={matchBaru}
          placeholder={tr('Tool name, e.g. Bash (blank = all)')}
          onChange={(e) => setMatchBaru(e.target.value)}
          data-testid="cli-hook-matcher"
        />
      </label>
      <label className="cli-hook-field">
        <span>{tr('Command')}</span>
        <input
          className="cli-sheet-input"
          value={cmdBaru}
          placeholder={tr('Shell command to run')}
          onChange={(e) => setCmdBaru(e.target.value)}
          data-testid="cli-hook-command"
        />
      </label>
      {galat && <p className="cli-sheet-error" data-testid="cli-hook-error">{galat}</p>}
      <div className="cli-sheet-actions">
        <button className="btn btn-primary btn-xs" disabled={busy} data-testid="cli-hook-save" onClick={() => void addHook()}>
          {tr('Add hook')}
        </button>
        <button className="btn btn-ghost btn-xs" disabled={busy} onClick={() => { setTambah(false); setGalat(''); }}>
          {tr('Cancel')}
        </button>
      </div>
    </div>
  ) : (
    <div className="cli-sheet-actions">
      <button className="btn btn-ghost btn-xs" data-testid="cli-hook-add" onClick={() => setTambah(true)}>
        + {tr('Add hook')}
      </button>
    </div>
  );

  if (!info.hooks.length)
    return (
      <div className="cli-sheet-group">
        <p className="cli-sheet-empty">{tr('No hooks configured.')}</p>
        <p className="cli-sheet-note">
          {tr('Hooks run a shell command on tool events. A PreToolUse hook can block a call, and a Stop hook can react when the agent finishes.')}
        </p>
        {form}
      </div>
    );
  const events = [...new Set(info.hooks.map((h) => h.event))];
  return (
    <div className="cli-sheet-group">
      {events.map((ev) => (
        <div key={ev} className="cli-sheet-file">
          <div className="cli-sheet-file-head">
            <AiIkon name="link" size={13} />
            <span className="cli-sheet-file-label">{ev}</span>
            <button className="cli-rule-x" disabled={busy} title={tr('Remove')} onClick={() => removeHook(ev)}>✕</button>
          </div>
          {info.hooks.filter((h) => h.event === ev).map((h, i) => (
            <div key={i} className="cli-hook-row">
              <span className="cli-sheet-file-meta">{h.matcher}</span>
              <code className="cli-sheet-rule">{h.command}</code>
            </div>
          ))}
        </div>
      ))}
      {form}
    </div>
  );
}

function AccountPanel({ info }: { info: ClaudeInfo }) {
  const tr = useT();
  const total = info.usage.reduce((a, u) => a + u.cost_usd, 0);
  return (
    <div className="cli-sheet-group">
      <Row k={tr('Account')} v={info.account_id || tr('(local CLI login)')} />
      <Row k={tr('Auth')} v={info.auth_kind} />
      <Row k={tr('Install')} v={info.install_method || '—'} />
      <Row k={tr('Startups')} v={String(info.num_startups)} />
      <Row k={tr('Total recent cost')} v={`$${total.toFixed(4)}`} />
      <p className="cli-sheet-sub">{tr('Recent usage by project')}</p>
      {info.usage.length ? (
        info.usage.map((u) => (
          <div key={u.project} className="cli-sheet-usage">
            <div className="cli-sheet-usage-head">
              <code className="cli-sheet-usage-proj">{u.project}</code>
              <span className="cli-sheet-usage-cost">${u.cost_usd.toFixed(4)}</span>
            </div>
            <div className="cli-sheet-usage-meta">
              {u.input_tokens.toLocaleString()} in · {u.output_tokens.toLocaleString()} out · {fmtMs(u.duration_ms)}
              {u.lines_added || u.lines_removed ? ` · +${u.lines_added}/-${u.lines_removed}` : ''}
            </div>
            {u.by_model.map((m) => (
              <div key={m.model} className="cli-sheet-usage-model">
                {m.model}: {m.input_tokens.toLocaleString()} in · {m.output_tokens.toLocaleString()} out · ${m.cost_usd.toFixed(4)}
              </div>
            ))}
          </div>
        ))
      ) : (
        <p className="cli-sheet-empty">{tr('No recorded usage yet.')}</p>
      )}
    </div>
  );
}

function CatalogBrowser({ kind }: { kind: 'agent' | 'skill' }) {
  const tr = useT();
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<CatalogItem | null>(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState('');
  const [loading, setLoading] = useState(true);

  const refresh = () => ccCatalogList().then(setItems).catch(() => {});
  useEffect(() => {
    setLoading(true);
    ccCatalogList()
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!sel) {
      setBody('');
      return;
    }
    let alive = true;
    ccCatalogBody(sel.id).then((b) => alive && setBody(b)).catch(() => alive && setBody(''));
    return () => {
      alive = false;
    };
  }, [sel]);

  const mine = items.filter((i) => i.kind === kind);
  const needle = q.trim().toLowerCase();
  const shown = needle
    ? mine.filter(
        (i) =>
          i.title.toLowerCase().includes(needle) ||
          i.name.toLowerCase().includes(needle) ||
          i.description.toLowerCase().includes(needle) ||
          i.category.toLowerCase().includes(needle),
      )
    : mine;
  const installedCount = mine.filter((i) => i.installed).length;
  const groups = [...new Set(shown.map((i) => i.category))].sort();

  const toggle = async (it: CatalogItem) => {
    setBusy(it.id);
    try {
      if (it.installed) await ccCatalogUninstall(it.id);
      else await ccCatalogInstall(it.id);
      await refresh();
      setSel((s) => (s && s.id === it.id ? { ...s, installed: !it.installed } : s));
    } catch {
      /* ignore */
    } finally {
      setBusy('');
    }
  };

  if (loading) return <p className="cli-sheet-empty">{tr('Loading catalog…')}</p>;

  return (
    <div className="cli-cat">
      <div className="cli-cat-top">
        <input className="cli-cat-search" autoFocus placeholder={tr('Search…')} value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="cli-cat-count">
          {mine.length} {kind === 'agent' ? tr('subagents') : tr('skills')} · {installedCount} {tr('installed')}
        </span>
      </div>
      <div className="cli-cat-split">
        <div className="cli-cat-list">
          {groups.map((g) => (
            <div key={g}>
              <p className="cli-cat-group">{g}</p>
              {shown
                .filter((i) => i.category === g)
                .map((it) => (
                  <button key={it.id} className={`cli-cat-item${sel?.id === it.id ? ' is-sel' : ''}`} onClick={() => setSel(it)}>
                    <span className={`cli-sheet-dot${it.installed ? ' is-on' : ''}`} aria-hidden="true" />
                    <span className="cli-cat-item-text">
                      <span className="cli-cat-item-title">{it.title}</span>
                      <span className="cli-cat-item-desc">{it.description}</span>
                    </span>
                  </button>
                ))}
            </div>
          ))}
          {!shown.length && <p className="cli-sheet-empty">{tr('Nothing matches.')}</p>}
        </div>
        <div className="cli-cat-detail">
          {sel ? (
            <>
              <div className="cli-cat-detail-head">
                <span className="cli-cat-detail-title">{sel.title}</span>
                <button className={`btn btn-sm${sel.installed ? ' is-installed' : ''}`} disabled={busy === sel.id} onClick={() => toggle(sel)}>
                  {busy === sel.id ? tr('Working…') : sel.installed ? tr('Remove') : tr('Install')}
                </button>
              </div>
              <p className="cli-cat-detail-meta">
                {sel.source}{sel.model ? ` · ${sel.model}` : ''}{sel.tools ? ` · ${sel.tools}` : ''}
              </p>
              <p className="cli-cat-detail-desc">{sel.description}</p>
              <pre className="cli-sheet-preview"><code>{body}</code></pre>
            </>
          ) : (
            <p className="cli-sheet-empty">{tr('Pick an entry to preview and install it into ~/.claude.')}</p>
          )}
        </div>
      </div>
    </div>
  );
}
