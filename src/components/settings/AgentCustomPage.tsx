import { lazy, Suspense, useEffect } from 'react';
import { useAgentCustom, type AgentCustomSection } from '../../lib/agentCustomStore';
import { useToolGate, SEMUA_TOOL } from '../../lib/toolGate';
import { useT } from '../../lib/i18n';
import AiIkon from '../ai/AiIkon';
import AgcToolList from './AgcToolList';
import AgcAgents from './AgcAgents';
import AgcRulesMemories from './AgcRulesMemories';
import AgcHooks from './AgcHooks';
import AgcBrowser from './AgcBrowser';
import AgcSkills from './AgcSkills';
import { AgcPlugins, AgcMigrations, AgcPermissions } from './AgcSections';

/*
 * Agent Customizations — a PAGE, in its own window.
 *
 * This used to be `AgentCustomModal`: a floating card over the editor with a
 * backdrop, a drag handle, a focus trap, an Escape handler and its own maximize
 * toggle. Every one of those is the platform's job in a real window, and
 * re-implementing them is what made the card paint its own left rail over its
 * own content when maximized. The window (`#panel=agent-custom`) supplies the
 * frame; this file is the left rail plus the content pane, and nothing else.
 *
 * The shape mirrors VSCode Copilot's "Agent Customizations" panel: a rail of
 * sections (Overview, Tools, MCP, Instructions, Agents, plus Skills/Hooks/
 * Plugins) and a content pane on the right. Each pane REUSES a component that
 * already exists where possible, so this file is a frame, not a rewrite:
 *   - Tools        -> the existing tool gate list
 *   - MCP          -> the Settings MCP panel
 *   - Instructions -> the Settings rules editor
 *   - Agents       -> the persona card
 * Skills / Hooks / Plugins are new surfaces; for now they show the same
 * empty-state shell Copilot does, with the real wiring to follow.
 */

const McpPanel = lazy(() => import('../settings/McpPanel'));


interface NavItem {
  id: AgentCustomSection;
  label: string;
  icon: Parameters<typeof AiIkon>[0]['name'];
  /* The one-line description shown on the Overview card for this section. */
  desc?: string;
}

const NAV: NavItem[] = [
  /*
   * Overview gets its OWN mark.
   *
   * It used to share `robot` with Agents, so two different rows in the rail drew
   * the identical glyph - the reader could not tell the panel's home from the
   * persona editor without reading the labels. Concentric rings read as "the
   * whole picture", which is what Overview is, and they cannot be confused with
   * the robot that means "a persona" everywhere else in the app.
   */
  { id: 'overview', label: 'Overview', icon: 'goal' },
  {
    id: 'plugins',
    label: 'Plugins',
    icon: 'link',
    desc: 'Install reusable packages that extend the agent. Plugins can add tools, skills, agents, hooks, and MCP servers.',
  },
  {
    id: 'mcp',
    label: 'MCP Servers',
    icon: 'terminal',
    desc: 'Connect agents to external tools and data through MCP servers. Manage the servers available to your agent.',
  },
  {
    id: 'skills',
    label: 'Skills',
    icon: 'thought',
    desc: 'Add reusable knowledge and workflows for specialized tasks. Agents load relevant skills when needed.',
  },
  {
    id: 'instructions',
    label: 'Rules & Memories',
    icon: 'doc',
    desc: 'Control the context the agent loads, the rules it follows, and what it may remember across sessions.',
  },
  {
    id: 'agents',
    label: 'Agents',
    icon: 'robot',
    desc: 'Create specialized agents for focused development tasks. Control their instructions, tools, and behavior.',
  },
  {
    id: 'hooks',
    label: 'Hooks',
    icon: 'queue',
    desc: 'Run automated commands at key points in the agent lifecycle. Use hooks to validate, format, or coordinate work.',
  },
  {
    id: 'browser',
    label: 'Browser',
    icon: 'web',
    desc: 'Choose how the agent opens and captures web pages, and clear the built-in browser data.',
  },
  {
    id: 'permissions',
    label: 'Permissions',
    icon: 'shield',
    desc: 'Allow, confirm or block a tool call by pattern. First matching rule wins, and rules are checked before the approval mode.',
  },
  {
    id: 'tools',
    label: 'Tools',
    icon: 'wrench',
    desc: 'Review the tools available to the active agent. Enable or disable configurable tool groups.',
  },
  { id: 'migrations', label: 'Migrations', icon: 'warn' },
];

function Isi({ section }: { section: AgentCustomSection }) {
  const tr = useT();
  switch (section) {
    case 'tools':
      return (
        <div className="agc-pane">
          <h2 className="agc-pane-title">{tr('Tools')}</h2>
          <p className="agc-pane-desc">
            {tr('Enable or disable the tools available to the agent. Disabled tools are not advertised.')}
          </p>
          {/* The tool list is rendered INLINE here, not as a separate floating
              popup. The user asked for Tools to live inside Agent Customizations
              rather than opening the standalone tool-gate overlay. */}
          <AgcToolList />
        </div>
      );
    case 'mcp':
      return (
        <div className="agc-pane">
          <h2 className="agc-pane-title">{tr('MCP Servers')}</h2>
          <p className="agc-pane-desc">
            {tr('Connect the agent to external tools and data through MCP servers.')}
          </p>
          <Suspense fallback={null}>
            <McpPanel />
          </Suspense>
        </div>
      );
    case 'instructions':
      /*
       * Rules & Memories replaces the old "Instructions" pane.
       *
       * The old pane only edited pattern-scoped rules, which is a WRITE GUARD
       * feature - not what the agent reads before answering. This page is the
       * one the reader asked for: which context files load, the rules in scope,
       * and whether memory is on.
       */
      return <AgcRulesMemories />;
    case 'agents':
      /*
       * The Agents pane is now the TRAE-shaped page: a list of custom and
       * built-in agents, a details view showing the tools each one may use, and
       * an editor with an avatar picker, delegation fields and a tool checklist.
       *
       * The old persona composer (`PanelAiAgent` + `PersonaCard`) is GONE from
       * here on purpose. A persona and an agent are different things: a persona
       * changes the assistant's voice, an agent is a reusable role with its own
       * prompt and tools. Showing both in one pane made the reader guess which
       * one "Agent" referred to, and the reference layout has no such ambiguity.
       * Personas are still editable in Chat Settings, where they always were.
       */
      return <AgcAgents />;
    case 'plugins':
      return <AgcPlugins />;
    case 'skills':
      return <AgcSkills />;
    case 'hooks':
      return <AgcHooks />;
    case 'browser':
      return <AgcBrowser />;
    case 'permissions':
      return <AgcPermissions />;
    case 'migrations':
      return <AgcMigrations />;
    case 'overview':
    default:
      return (
        <div className="agc-pane agc-pane-overview">
          <h2 className="agc-pane-title">{tr('Agent Customizations')}</h2>
          <p className="agc-pane-desc">
            {tr('Tailor how agents work in your projects. Configure workspace customizations for the entire team, or create personal ones that follow you across projects.')}
          </p>

          {/* The "Customize Your Agent" box, mirroring Copilot's hero composer. */}
          <div className="agc-hero" data-testid="agc-hero">
            <div className="agc-hero-head">
              <span className="agc-hero-mark" aria-hidden="true">
                <AiIkon name="thought" size={16} />
              </span>
              <span className="agc-hero-title">{tr('Customize Your Agent')}</span>
            </div>
            <p className="agc-hero-sub">
              {tr('Describe your preferences and conventions to draft agents, skills, and instructions.')}
            </p>
            <div className="agc-hero-input">
              <input
                data-testid="agc-hero-field"
                placeholder={tr('Prefer concise commits, thorough reviews, and tested code…')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.currentTarget.value ?? '').trim()) {
                    /* Hand the preference to the Instructions editor, where it
                       becomes a real rule the agent reads. */
                    useAgentCustom.getState().setSection('instructions');
                  }
                }}
              />
              <button
                className="agc-hero-send"
                data-testid="agc-hero-send"
                aria-label={tr('Draft from this')}
                title={tr('Draft from this')}
                onClick={() => useAgentCustom.getState().setSection('instructions')}
              >
                <AiIkon name="send" size={13} />
              </button>
            </div>
          </div>

          <h3 className="agc-explore-title">{tr('Explore Customizations')}</h3>
          <p className="agc-explore-sub">{tr('Manage what the active agent knows and can do.')}</p>
          <div className="agc-cards">
            {NAV.filter((n) => n.id !== 'overview' && n.id !== 'migrations').map((n) => (
              <button
                key={n.id}
                className="agc-card"
                data-testid={`agc-card-${n.id}`}
                onClick={() => useAgentCustom.getState().setSection(n.id)}
              >
                <span className="agc-card-head">
                  <span className="agc-card-ikon">
                    <AiIkon name={n.icon} size={15} />
                  </span>
                  <span className="agc-card-label">{tr(n.label)}</span>
                </span>
                {n.desc && <span className="agc-card-desc">{tr(n.desc)}</span>}
              </button>
            ))}
          </div>
        </div>
      );
  }
}

export default function AgentCustomPage({ seksiAwal }: { seksiAwal?: string | null } = {}) {
  const tr = useT();
  const section = useAgentCustom((s) => s.section);
  const setSection = useAgentCustom((s) => s.setSection);
  const jumlahTool = useToolGate((s) => s.aktif.size);

  /*
   * The section named by the door that opened this window
   * (`#panel=agent-custom&s=agents`), applied once on mount.
   *
   * It cannot travel through the store: the window is a separate WebView with
   * its own store instances, so a flag set in the opening window would be
   * invisible here. The URL is the only channel both windows share.
   */
  useEffect(() => {
    if (!seksiAwal) return;
    if ((NAV as { id: string }[]).some((n) => n.id === seksiAwal)) {
      setSection(seksiAwal as AgentCustomSection);
    }
  }, [seksiAwal, setSection]);

  return (
    <div className="agc-page" data-testid="agent-custom">
      <div className="agc-body">
        <nav className="agc-nav" aria-label={tr('Agent Customizations')}>
          {NAV.map((n) => (
            <button
              key={n.id}
              className={`agc-nav-item${section === n.id ? ' is-active' : ''}`}
              data-testid={`agc-nav-${n.id}`}
              aria-current={section === n.id}
              onClick={() => setSection(n.id)}
            >
              <span className="agc-nav-ikon">
                <AiIkon name={n.icon} size={14} />
              </span>
              <span className="agc-nav-label">{tr(n.label)}</span>
              {n.id === 'tools' && (
                <span className="agc-nav-badge">
                  {jumlahTool}/{SEMUA_TOOL.length}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="agc-content" data-testid="agc-content">
          <Isi section={section} />
        </div>
      </div>
    </div>
  );
}
