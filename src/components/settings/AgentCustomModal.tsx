import { lazy, Suspense } from 'react';
import { useAgentCustom, type AgentCustomSection } from '../../lib/agentCustomStore';
import { useToolGate, SEMUA_TOOL } from '../../lib/toolGate';
import { useT } from '../../lib/i18n';
import AiIkon from '../ai/AiIkon';

/*
 * Agent Customizations — a modal of its own, deliberately NOT inside Settings.
 *
 * Mirrors VSCode Copilot's floating "Agent Customizations" panel: a left rail
 * of sections (Overview, Tools, MCP, Instructions, Agents, plus the newer
 * Skills/Hooks/Plugins) and a content pane on the right. Each content pane
 * REUSES a component that already exists where possible, so this file is a
 * frame, not a rewrite:
 *   - Tools        -> the existing tool gate list
 *   - MCP          -> the Settings MCP panel
 *   - Instructions -> the Settings rules editor
 *   - Agents       -> the persona card
 * Skills / Hooks / Plugins are new surfaces; for now they show the same
 * empty-state shell Copilot does, with the real wiring to follow.
 */

const McpPanel = lazy(() => import('../settings/McpPanel'));
const RulesSection = lazy(() => import('../settings/RulesSection'));
const PersonaCard = lazy(() => import('../settings/PersonaCard'));

interface NavItem {
  id: AgentCustomSection;
  label: string;
  icon: Parameters<typeof AiIkon>[0]['name'];
  /* The one-line description shown on the Overview card for this section. */
  desc?: string;
}

const NAV: NavItem[] = [
  { id: 'overview', label: 'Overview', icon: 'robot' },
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
    label: 'Instructions',
    icon: 'doc',
    desc: 'Define guidance that shapes how agents work. Apply it across a workspace or keep it in your user profile.',
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
    id: 'tools',
    label: 'Tools',
    icon: 'wrench',
    desc: 'Review the tools available to the active agent. Enable or disable configurable tool groups.',
  },
  { id: 'migrations', label: 'Migrations', icon: 'warn' },
];

/** A shared empty-state for the sections that are frames for now. */
function KerangkaKosong({ judul, teks }: { judul: string; teks: string }) {
  const tr = useT();
  return (
    <div className="agc-pane">
      <h2 className="agc-pane-title">{tr(judul)}</h2>
      <p className="agc-pane-desc">{tr(teks)}</p>
      <div className="agc-empty" data-testid="agc-empty">
        <p>{tr('Nothing here yet.')}</p>
      </div>
    </div>
  );
}

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
          <button
            className="btn btn-primary"
            data-testid="agc-open-tools"
            onClick={() => {
              useAgentCustom.getState().tutup();
              useToolGate.getState().setBuka(true);
            }}
          >
            {tr('Open tool list')}
          </button>
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
      return (
        <div className="agc-pane">
          <h2 className="agc-pane-title">{tr('Instructions')}</h2>
          <p className="agc-pane-desc">
            {tr('Define common guidelines that shape how the agent works.')}
          </p>
          <Suspense fallback={null}>
            <RulesSection />
          </Suspense>
        </div>
      );
    case 'agents':
      return (
        <div className="agc-pane">
          <h2 className="agc-pane-title">{tr('Agents')}</h2>
          <p className="agc-pane-desc">
            {tr('Configure the AI persona: identity, way of working, and rules.')}
          </p>
          <Suspense fallback={null}>
            <PersonaCard />
          </Suspense>
        </div>
      );
    case 'plugins':
      return (
        <KerangkaKosong
          judul="Plugins"
          teks="Extend the agent with reusable packages that add commands, skills, agents, hooks, and MCP servers."
        />
      );
    case 'skills':
      return (
        <KerangkaKosong
          judul="Skills"
          teks="Add reusable knowledge and workflows for specialized tasks. The agent loads relevant skills when needed."
        />
      );
    case 'hooks':
      return (
        <KerangkaKosong
          judul="Hooks"
          teks="Run automated commands at key points in the agent lifecycle to validate, format, or coordinate work."
        />
      );
    case 'migrations':
      return (
        <KerangkaKosong
          judul="Migrations"
          teks="Move settings and customizations between workspaces and profiles."
        />
      );
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

export default function AgentCustomModal() {
  const tr = useT();
  const open = useAgentCustom((s) => s.open);
  const section = useAgentCustom((s) => s.section);
  const setSection = useAgentCustom((s) => s.setSection);
  const tutup = useAgentCustom((s) => s.tutup);
  const jumlahTool = useToolGate((s) => s.aktif.size);

  if (!open) return null;

  return (
    <div className="modal-backdrop agc-backdrop" role="presentation" data-testid="agent-custom">
      <div className="modal agc-modal" role="dialog" aria-modal="true" aria-label={tr('Agent Customizations')}>
        <div className="agc-head">
          <span className="agc-head-title">
            {tr('Agent Customizations')}
            <span className="agc-head-scope"> ({tr('Copilot · Zephyr')})</span>
          </span>
          <button
            className="ai-ikon"
            data-testid="agc-close"
            title={tr('Close')}
            aria-label={tr('Close')}
            onClick={tutup}
          >
            <AiIkon name="close" size={14} />
          </button>
        </div>
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
    </div>
  );
}
