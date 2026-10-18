import { lazy, Suspense, useEffect, useState } from 'react';
import { useAgentCustom, type AgentCustomSection } from '../../lib/agentCustomStore';
import { useToolGate, SEMUA_TOOL } from '../../lib/toolGate';
import { usePersona } from '../../lib/personaStore';
import { buatDraft, type DraftHasil } from '../../lib/agentDraft';
import { useT } from '../../lib/i18n';
import AiIkon from '../ai/AiIkon';
import AgcToolList from './AgcToolList';
import { AgcSkills, AgcHooks, AgcPlugins, AgcMigrations, AgcInstructions, AgcPermissions } from './AgcSections';

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
const PersonaCard = lazy(() => import('../settings/PersonaCard'));

/*
 * "Create with AI" for a persona.
 *
 * The draft is shown in a form, and Save writes it through `personaStore.simpan`
 * — the same action the manual editor uses, so a generated persona is an
 * ordinary persona with nothing special about it afterwards.
 *
 * The persona is created but NOT activated. Applying a persona changes how every
 * later answer is written, and switching that on as a side effect of pressing
 * Save would be a surprise; the reader picks it in the list, where activation
 * already lives.
 */
function PanelAiAgent() {
  const tr = useT();
  const [buka, setBuka] = useState(false);
  const [permintaan, setPermintaan] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftHasil | null>(null);
  const [nama, setNama] = useState('');
  const [deskripsi, setDeskripsi] = useState('');
  const [identitas, setIdentitas] = useState('');
  const [aturan, setAturan] = useState('');
  const simpan = usePersona((s) => s.simpan);

  const kirim = async () => {
    setSibuk(true);
    setGalat(null);
    try {
      const d = await buatDraft({ kind: 'agent', permintaan });
      setDraft(d);
      setNama(d.name);
      setDeskripsi(d.description);
      /*
       * The body carries the working style AND the constraints; a persona keeps
       * them in separate fields. Splitting on a heading would guess at the
       * model's formatting, so the whole body goes to `identitas` (which is the
       * block that replaces the identity) and the reader can move a paragraph
       * into the rules field themselves — both are editable right here.
       */
      setIdentitas(d.body);
      setAturan((d.tools ?? []).length > 0 ? `Tools disarankan: ${(d.tools ?? []).join(', ')}` : '');
    } catch (e) {
      setGalat(e instanceof Error ? e.message : String(e));
    } finally {
      setSibuk(false);
    }
  };

  const bersihkan = () => {
    setBuka(false);
    setDraft(null);
    setPermintaan('');
    setGalat(null);
  };

  if (!buka) {
    return (
      <div className="agc-ai-aksi">
        <button
          className="btn btn-sm"
          data-testid="agc-agent-ai"
          onClick={() => setBuka(true)}
        >
          <AiIkon name="thought" size={12} /> {tr('Create with AI')}
        </button>
      </div>
    );
  }

  return (
    <div className="agc-ai" data-testid="agc-ai-agent">
      <div className="agc-ai-head">
        <AiIkon name="thought" size={13} />
        <span>{tr('Describe the role in plain language')}</span>
      </div>
      <textarea
        className="agc-field agc-field-area"
        data-testid="agc-ai-input-agent"
        rows={4}
        disabled={sibuk}
        placeholder={tr('An agent that reviews code for bugs and security issues, changes nothing, and starts from the least privilege.')}
        value={permintaan}
        onChange={(e) => setPermintaan(e.target.value)}
      />
      {galat && (
        <p className="agc-error" data-testid="agc-ai-error-agent" role="alert">
          {galat}
        </p>
      )}
      <div className="agc-editor-actions">
        <button className="btn btn-sm" onClick={bersihkan} disabled={sibuk}>
          {tr('Cancel')}
        </button>
        <button
          className="btn btn-sm btn-primary"
          data-testid="agc-ai-generate-agent"
          disabled={sibuk || permintaan.trim() === ''}
          onClick={() => void kirim()}
        >
          {sibuk ? tr('Generating…') : tr('Generate draft')}
        </button>
      </div>

      {draft && (
        <div className="agc-editor agc-editor-draft" data-testid="agc-draft-agent">
          <p className="agc-draft-note">
            {tr('This is a draft from the model. Check it before saving - it shapes every answer the assistant gives.')}
          </p>
          <label className="agc-label" htmlFor="agc-da-nama">
            {tr('Name')}
          </label>
          <input
            id="agc-da-nama"
            className="agc-field"
            data-testid="agc-da-nama"
            value={nama}
            onChange={(e) => setNama(e.target.value)}
          />
          <label className="agc-label" htmlFor="agc-da-desc">
            {tr('Description')}
          </label>
          <input
            id="agc-da-desc"
            className="agc-field"
            data-testid="agc-da-desc"
            value={deskripsi}
            onChange={(e) => setDeskripsi(e.target.value)}
          />
          <label className="agc-label" htmlFor="agc-da-identitas">
            {tr('Identity and way of working')}
          </label>
          <textarea
            id="agc-da-identitas"
            className="agc-field agc-field-area"
            data-testid="agc-da-identitas"
            rows={8}
            value={identitas}
            onChange={(e) => setIdentitas(e.target.value)}
          />
          <label className="agc-label" htmlFor="agc-da-aturan">
            {tr('Extra rules')}
          </label>
          <textarea
            id="agc-da-aturan"
            className="agc-field agc-field-area"
            data-testid="agc-da-aturan"
            rows={4}
            value={aturan}
            onChange={(e) => setAturan(e.target.value)}
          />
          <div className="agc-editor-actions">
            <button className="btn btn-sm" onClick={bersihkan}>
              {tr('Discard draft')}
            </button>
            <button
              className="btn btn-sm btn-primary"
              data-testid="agc-da-simpan"
              disabled={sibuk || nama.trim() === '' || identitas.trim() === ''}
              onClick={() => {
                void simpan({
                  nama: nama.trim(),
                  deskripsi: deskripsi.trim(),
                  identitas: identitas.trim(),
                  caraKerja: '',
                  aturan: aturan.trim(),
                }).then(bersihkan);
              }}
            >
              {tr('Save')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

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
      return (
        <div className="agc-pane">
          <h2 className="agc-pane-title">{tr('Instructions')}</h2>
          <p className="agc-pane-desc">
            {tr('Rules attached to a file pattern. Repository-wide rules that are always on live in AGENTS.md.')}
          </p>
          <AgcInstructions />
        </div>
      );
    case 'agents':
      return (
        <div className="agc-pane">
          <h2 className="agc-pane-title">{tr('Agents')}</h2>
          <p className="agc-pane-desc">
            {tr('Configure the AI persona: identity, way of working, and rules.')}
          </p>
          {/*
            * A persona changes WHO the assistant is — identity, way of working,
            * standing rules. It is not a subagent with its own tool allowlist,
            * and this pane deliberately does not pretend otherwise: the model is
            * asked for the three text blocks a persona actually has, so a draft
            * here cannot silently grant anything.
            */}
          <PanelAiAgent />
          <Suspense fallback={null}>
            <PersonaCard />
          </Suspense>
        </div>
      );
    case 'plugins':
      return <AgcPlugins />;
    case 'skills':
      return <AgcSkills />;
    case 'hooks':
      return <AgcHooks />;
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
