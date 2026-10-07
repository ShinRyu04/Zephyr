import { useState } from 'react';
import { useT, useTf } from '../../lib/i18n';
import {
  useAgentExtras,
  HOOK_EVENTS,
  type Skill,
  type Hook,
} from '../../lib/agentExtrasStore';
import AiIkon from '../ai/AiIkon';

/*
 * The real content for Agent Customizations' Skills, Hooks, Plugins and
 * Migrations sections. These used to be four "Nothing here yet." shells; they
 * are now editable lists backed by `agentExtrasStore`, grouped by scope the way
 * Copilot splits Workspace vs User.
 */

/* ── Skills ──────────────────────────────────────────────────────────────── */

function SkillRow({ skill }: { skill: Skill }) {
  const tr = useT();
  const update = useAgentExtras((s) => s.updateSkill);
  const remove = useAgentExtras((s) => s.removeSkill);
  const [open, setOpen] = useState(skill.name === 'New skill');

  return (
    <div className="agc-item" data-testid={`agc-skill-${skill.id}`}>
      <div className="agc-item-head">
        <button
          className="agc-item-toggle"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <AiIkon name={open ? 'chev-down' : 'chev-right'} size={11} />
          <AiIkon name="thought" size={14} />
          <span className="agc-item-name">{skill.name || tr('Untitled skill')}</span>
        </button>
        <label className="agc-item-switch">
          <input
            type="checkbox"
            data-testid={`agc-skill-on-${skill.id}`}
            checked={skill.enabled}
            onChange={(e) => update(skill.id, { enabled: e.target.checked })}
          />
          <span>{tr('Enabled')}</span>
        </label>
        <button
          className="agc-item-del"
          data-testid={`agc-skill-del-${skill.id}`}
          title={tr('Delete')}
          aria-label={tr('Delete')}
          onClick={() => remove(skill.id)}
        >
          <AiIkon name="trash" size={13} />
        </button>
      </div>
      {open && (
        <div className="agc-item-body">
          <input
            className="agc-field"
            data-testid={`agc-skill-name-${skill.id}`}
            placeholder={tr('Skill name')}
            value={skill.name}
            onChange={(e) => update(skill.id, { name: e.target.value })}
          />
          <input
            className="agc-field"
            placeholder={tr('Short description (when the agent should use it)')}
            value={skill.description}
            onChange={(e) => update(skill.id, { description: e.target.value })}
          />
          <textarea
            className="agc-field agc-field-area"
            data-testid={`agc-skill-body-${skill.id}`}
            placeholder={tr('The knowledge or workflow the agent loads for this skill…')}
            rows={5}
            value={skill.body}
            onChange={(e) => update(skill.id, { body: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}

export function AgcSkills() {
  const tr = useT();
  const skills = useAgentExtras((s) => s.skills);
  const add = useAgentExtras((s) => s.addSkill);

  const groups: { scope: Skill['scope']; label: string }[] = [
    { scope: 'workspace', label: 'Workspace' },
    { scope: 'user', label: 'User' },
  ];

  return (
    <div className="agc-pane">
      <h2 className="agc-pane-title">{tr('Skills')}</h2>
      <p className="agc-pane-desc">
        {tr('Folders of instructions and workflows the agent loads when relevant to a specialized task.')}
      </p>
      {groups.map((g) => {
        const list = skills.filter((s) => s.scope === g.scope);
        return (
          <section className="agc-group" key={g.scope} data-testid={`agc-skills-${g.scope}`}>
            <div className="agc-group-head">
              <span className="agc-group-title">
                {tr(g.label)} <span className="agc-group-count">{list.length}</span>
              </span>
              <button
                className="btn btn-sm"
                data-testid={`agc-skill-add-${g.scope}`}
                onClick={() => add(g.scope)}
              >
                <AiIkon name="plus" size={12} /> {tr('New Skill')}
              </button>
            </div>
            {list.length === 0 ? (
              <p className="agc-group-empty">{tr('No skills yet.')}</p>
            ) : (
              list.map((s) => <SkillRow key={s.id} skill={s} />)
            )}
          </section>
        );
      })}
    </div>
  );
}

/* ── Hooks ───────────────────────────────────────────────────────────────── */

function HookRow({ hook }: { hook: Hook }) {
  const tr = useT();
  const update = useAgentExtras((s) => s.updateHook);
  const remove = useAgentExtras((s) => s.removeHook);
  const [open, setOpen] = useState(hook.name === 'New hook');

  return (
    <div className="agc-item" data-testid={`agc-hook-${hook.id}`}>
      <div className="agc-item-head">
        <button
          className="agc-item-toggle"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <AiIkon name={open ? 'chev-down' : 'chev-right'} size={11} />
          <AiIkon name="queue" size={14} />
          <span className="agc-item-name">{hook.name || tr('Untitled hook')}</span>
          <span className="agc-item-sub">
            {tr(HOOK_EVENTS.find((e) => e.id === hook.event)?.label ?? '')}
          </span>
        </button>
        <label className="agc-item-switch">
          <input
            type="checkbox"
            data-testid={`agc-hook-on-${hook.id}`}
            checked={hook.enabled}
            onChange={(e) => update(hook.id, { enabled: e.target.checked })}
          />
          <span>{tr('Enabled')}</span>
        </label>
        <button
          className="agc-item-del"
          data-testid={`agc-hook-del-${hook.id}`}
          title={tr('Delete')}
          aria-label={tr('Delete')}
          onClick={() => remove(hook.id)}
        >
          <AiIkon name="trash" size={13} />
        </button>
      </div>
      {open && (
        <div className="agc-item-body">
          <input
            className="agc-field"
            data-testid={`agc-hook-name-${hook.id}`}
            placeholder={tr('Hook name')}
            value={hook.name}
            onChange={(e) => update(hook.id, { name: e.target.value })}
          />
          <select
            className="agc-field"
            data-testid={`agc-hook-event-${hook.id}`}
            value={hook.event}
            onChange={(e) => update(hook.id, { event: e.target.value as Hook['event'] })}
          >
            {HOOK_EVENTS.map((e) => (
              <option key={e.id} value={e.id}>
                {tr(e.label)}
              </option>
            ))}
          </select>
          <input
            className="agc-field agc-field-mono"
            data-testid={`agc-hook-cmd-${hook.id}`}
            placeholder={tr('Command to run, e.g. npm run lint')}
            value={hook.command}
            onChange={(e) => update(hook.id, { command: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}

export function AgcHooks() {
  const tr = useT();
  const hooks = useAgentExtras((s) => s.hooks);
  const add = useAgentExtras((s) => s.addHook);

  const groups: { scope: Hook['scope']; label: string }[] = [
    { scope: 'workspace', label: 'Workspace' },
    { scope: 'user', label: 'User' },
  ];

  return (
    <div className="agc-pane">
      <h2 className="agc-pane-title">{tr('Hooks')}</h2>
      <p className="agc-pane-desc">
        {tr('Commands run automatically at key points in the agent lifecycle to validate, format, or coordinate work.')}
      </p>
      {groups.map((g) => {
        const list = hooks.filter((h) => h.scope === g.scope);
        return (
          <section className="agc-group" key={g.scope} data-testid={`agc-hooks-${g.scope}`}>
            <div className="agc-group-head">
              <span className="agc-group-title">
                {tr(g.label)} <span className="agc-group-count">{list.length}</span>
              </span>
              <button
                className="btn btn-sm"
                data-testid={`agc-hook-add-${g.scope}`}
                onClick={() => add(g.scope)}
              >
                <AiIkon name="plus" size={12} /> {tr('New Hook')}
              </button>
            </div>
            {list.length === 0 ? (
              <p className="agc-group-empty">{tr('No hooks yet.')}</p>
            ) : (
              list.map((h) => <HookRow key={h.id} hook={h} />)
            )}
          </section>
        );
      })}
    </div>
  );
}

/* ── Plugins ─────────────────────────────────────────────────────────────── */

export function AgcPlugins() {
  const tr = useT();
  const plugins = useAgentExtras((s) => s.plugins);
  const install = useAgentExtras((s) => s.installPlugin);
  const [cari, setCari] = useState('');

  const q = cari.trim().toLowerCase();
  const match = plugins.filter(
    (p) => !q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q),
  );
  const installed = match.filter((p) => p.installed);
  const available = match.filter((p) => !p.installed);

  const Card = ({ p }: { p: (typeof plugins)[number] }) => (
    <div className="agc-plugin" data-testid={`agc-plugin-${p.id}`}>
      <div className="agc-plugin-main">
        <span className="agc-plugin-name">{p.name}</span>
        <span className="agc-plugin-desc">{tr(p.description)}</span>
        <span className="agc-plugin-chips">
          {p.provides.map((c) => (
            <span className="agc-plugin-chip" key={c}>
              {c}
            </span>
          ))}
        </span>
      </div>
      <button
        className={`btn btn-sm${p.installed ? '' : ' btn-primary'}`}
        data-testid={`agc-plugin-${p.installed ? 'uninstall' : 'install'}-${p.id}`}
        onClick={() => install(p.id, !p.installed)}
      >
        {p.installed ? tr('Uninstall') : tr('Install')}
      </button>
    </div>
  );

  return (
    <div className="agc-pane">
      <h2 className="agc-pane-title">{tr('Plugins')}</h2>
      <p className="agc-pane-desc">
        {tr('Extend the agent with reusable packages that add commands, skills, agents, hooks, and MCP servers.')}
      </p>
      <div className="agc-tools-search agc-plugin-search">
        <AiIkon name="search" size={12} />
        <input
          data-testid="agc-plugin-cari"
          placeholder={tr('Search plugins…')}
          value={cari}
          onChange={(e) => setCari(e.target.value)}
        />
      </div>

      <section className="agc-group" data-testid="agc-plugins-installed">
        <div className="agc-group-head">
          <span className="agc-group-title">
            {tr('Installed')} <span className="agc-group-count">{installed.length}</span>
          </span>
        </div>
        {installed.length === 0 ? (
          <p className="agc-group-empty">{tr('Nothing installed yet.')}</p>
        ) : (
          installed.map((p) => <Card key={p.id} p={p} />)
        )}
      </section>

      <section className="agc-group" data-testid="agc-plugins-available">
        <div className="agc-group-head">
          <span className="agc-group-title">
            {tr('Available')} <span className="agc-group-count">{available.length}</span>
          </span>
        </div>
        {available.length === 0 ? (
          <p className="agc-group-empty">{tr('No plugins match.')}</p>
        ) : (
          available.map((p) => <Card key={p.id} p={p} />)
        )}
      </section>
    </div>
  );
}

/* ── Migrations ──────────────────────────────────────────────────────────── */

export function AgcMigrations() {
  const tr = useT();
  const tf = useTf();
  const skills = useAgentExtras((s) => s.skills);
  const hooks = useAgentExtras((s) => s.hooks);
  const plugins = useAgentExtras((s) => s.plugins);
  const [status, setStatus] = useState<string | null>(null);

  const exportBundle = async () => {
    const bundle = {
      exportedAt: new Date().toISOString(),
      skills,
      hooks,
      installedPlugins: plugins.filter((p) => p.installed).map((p) => p.id),
    };
    const text = JSON.stringify(bundle, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setStatus(tr('Customizations copied to the clipboard as JSON.'));
    } catch {
      /* Clipboard can be blocked when the window is not focused (WebView2);
         fall back to a download so the export is never silently lost. */
      const blob = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'zephyr-agent-customizations.json';
      a.click();
      URL.revokeObjectURL(url);
      setStatus(tr('Customizations exported as a download.'));
    }
  };

  const total = skills.length + hooks.length + plugins.filter((p) => p.installed).length;

  return (
    <div className="agc-pane">
      <h2 className="agc-pane-title">{tr('Migrations')}</h2>
      <p className="agc-pane-desc">
        {tr('Move customizations between workspaces and profiles by exporting them as a portable JSON bundle.')}
      </p>
      <div className="agc-migrate-card" data-testid="agc-migrate">
        <div className="agc-migrate-summary">
          <span>{tf('{n} skills', { n: skills.length })}</span>
          <span>{tf('{n} hooks', { n: hooks.length })}</span>
          <span>{tf('{n} plugins', { n: plugins.filter((p) => p.installed).length })}</span>
        </div>
        <button
          className="btn btn-primary"
          data-testid="agc-migrate-export"
          disabled={total === 0}
          onClick={() => void exportBundle()}
        >
          {tr('Export customizations')}
        </button>
        {total === 0 && (
          <p className="agc-group-empty">{tr('Add skills, hooks, or plugins first — then you can export them.')}</p>
        )}
        {status && (
          <p className="agc-migrate-status" data-testid="agc-migrate-status" role="status">
            {status}
          </p>
        )}
      </div>
    </div>
  );
}
