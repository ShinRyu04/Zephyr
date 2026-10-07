import { useCodex } from '../../lib/codexStore';
import { useT } from '../../lib/i18n';
import AiIkon from './AiIkon';

/*
 * Codex's own Settings page (Codex tab only), opened from the gear in the TUI
 * toolbar. Mirrors the real Codex Settings: a left nav (General, Configuration,
 * Personalization, MCP servers, Hooks, Plugins) and a pane per section. This is
 * entirely separate from Zephyr's app Settings and from the Claude Code tab —
 * it only reads/writes Codex's own preferences (codexStore).
 */

const SECTIONS: { id: ReturnType<typeof useCodex.getState>['settingsSection']; label: string; icon: string }[] = [
  { id: 'general', label: 'General', icon: 'gear' },
  { id: 'configuration', label: 'Configuration', icon: 'shield' },
  { id: 'personalization', label: 'Personalization', icon: 'refresh' },
  { id: 'mcp', label: 'MCP servers', icon: 'node' },
  { id: 'hooks', label: 'Hooks', icon: 'link' },
  { id: 'plugins', label: 'Plugins', icon: 'puzzle' },
];

function Toggle({ on, onChange, testid }: { on: boolean; onChange: (v: boolean) => void; testid?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      data-testid={testid}
      className={`cdx-switch${on ? ' is-on' : ''}`}
      onClick={() => onChange(!on)}
    >
      <span className="cdx-switch-knob" aria-hidden="true" />
    </button>
  );
}

export default function CodexSettings({ onClose }: { onClose: () => void }) {
  const tr = useT();
  const section = useCodex((s) => s.settingsSection);
  const setSection = useCodex((s) => s.setSettingsSection);
  const s = useCodex((st) => st.settings);
  const patch = useCodex((st) => st.patchSettings);

  return (
    <div className="cdx-settings" data-testid="ai-codex-settings-page">
      <div className="cdx-settings-head">
        <span className="cdx-settings-title">
          <AiIkon name="list" size={14} /> {tr('Codex Settings')}
        </span>
        <button
          className="cdx-settings-close"
          data-testid="ai-codex-settings-close"
          title={tr('Close')}
          aria-label={tr('Close')}
          onClick={onClose}
        >
          <AiIkon name="close" size={14} />
        </button>
      </div>

      <div className="cdx-settings-body">
        <nav className="cdx-settings-nav" aria-label={tr('Codex Settings')}>
          {SECTIONS.map((sec) => (
            <button
              key={sec.id}
              className={`cdx-settings-navitem${section === sec.id ? ' is-on' : ''}`}
              data-testid={`ai-codex-nav-${sec.id}`}
              aria-current={section === sec.id}
              onClick={() => setSection(sec.id)}
            >
              <AiIkon name={sec.icon as never} size={15} />
              <span>{tr(sec.label)}</span>
            </button>
          ))}
        </nav>

        <div className="cdx-settings-pane" data-testid={`ai-codex-pane-${section}`}>
          {section === 'general' && (
            <>
              <h1 className="cdx-pane-h1">{tr('General')}</h1>
              <div className="cdx-card">
                <div className="cdx-set-row">
                  <div className="cdx-set-text">
                    <span className="cdx-set-label">{tr('Language')}</span>
                    <span className="cdx-set-sub">{tr('Language for the app UI')}</span>
                  </div>
                  <select
                    className="cdx-select"
                    data-testid="ai-codex-set-language"
                    value={s.language}
                    onChange={(e) => patch({ language: e.target.value })}
                  >
                    <option value="auto">{tr('Auto detect')}</option>
                    <option value="en">English</option>
                    <option value="id">Bahasa Indonesia</option>
                  </select>
                </div>
                <div className="cdx-set-row">
                  <div className="cdx-set-text">
                    <span className="cdx-set-label">{tr('Review delivery')}</span>
                    <span className="cdx-set-sub">
                      {tr('Start /review in the current chat when possible or launch a separate review chat')}
                    </span>
                  </div>
                  <div className="cdx-seg" role="group">
                    <button
                      className={`cdx-seg-btn${s.reviewDelivery === 'inline' ? ' is-on' : ''}`}
                      data-testid="ai-codex-review-inline"
                      onClick={() => patch({ reviewDelivery: 'inline' })}
                    >
                      {tr('Inline')}
                    </button>
                    <button
                      className={`cdx-seg-btn${s.reviewDelivery === 'detached' ? ' is-on' : ''}`}
                      data-testid="ai-codex-review-detached"
                      onClick={() => patch({ reviewDelivery: 'detached' })}
                    >
                      {tr('Detached')}
                    </button>
                  </div>
                </div>
              </div>

              <h2 className="cdx-pane-h2">{tr('Composer')}</h2>
              <div className="cdx-card">
                <div className="cdx-set-row">
                  <div className="cdx-set-text">
                    <span className="cdx-set-label">{tr('Show context window usage')}</span>
                  </div>
                  <Toggle
                    on={s.showContextUsage}
                    onChange={(v) => patch({ showContextUsage: v })}
                    testid="ai-codex-ctx-usage"
                  />
                </div>
                <div className="cdx-set-row">
                  <div className="cdx-set-text">
                    <span className="cdx-set-label">{tr('Send shortcut')}</span>
                    <span className="cdx-set-sub">{tr('Choose when Enter sends a prompt or inserts a new line')}</span>
                  </div>
                  <select
                    className="cdx-select"
                    data-testid="ai-codex-send-shortcut"
                    value={s.sendShortcut}
                    onChange={(e) => patch({ sendShortcut: e.target.value as 'enter' | 'mod-enter' })}
                  >
                    <option value="enter">{tr('Enter')}</option>
                    <option value="mod-enter">{tr('Cmd/Ctrl + Enter')}</option>
                  </select>
                </div>
                <div className="cdx-set-row">
                  <div className="cdx-set-text">
                    <span className="cdx-set-label">{tr('Follow-up behavior')}</span>
                    <span className="cdx-set-sub">
                      {tr('Queue follow-ups while Codex runs or steer the current run. Press Ctrl+⏎ to do the opposite for one message')}
                    </span>
                  </div>
                  <div className="cdx-seg" role="group">
                    <button
                      className={`cdx-seg-btn${s.followUp === 'queue' ? ' is-on' : ''}`}
                      data-testid="ai-codex-followup-queue"
                      onClick={() => patch({ followUp: 'queue' })}
                    >
                      {tr('Queue')}
                    </button>
                    <button
                      className={`cdx-seg-btn${s.followUp === 'steer' ? ' is-on' : ''}`}
                      data-testid="ai-codex-followup-steer"
                      onClick={() => patch({ followUp: 'steer' })}
                    >
                      {tr('Steer')}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {section === 'configuration' && (
            <>
              <h1 className="cdx-pane-h1">{tr('Configuration')}</h1>
              <p className="cdx-pane-desc">{tr('Configure approval policy and sandbox settings')}</p>
              <h2 className="cdx-pane-h2">{tr('Custom config.toml settings')}</h2>
              <div className="cdx-card">
                <div className="cdx-set-row">
                  <div className="cdx-set-text">
                    <span className="cdx-set-label">config.toml</span>
                    <span className="cdx-set-sub">{tr('Edit your config to customize agent behavior')}</span>
                    <span className="cdx-set-sub">{tr('Restart Codex after editing to apply changes')}</span>
                  </div>
                  <button className="cdx-btn" data-testid="ai-codex-open-config">{tr('Open config.toml')}</button>
                </div>
              </div>
              <h2 className="cdx-pane-h2">{tr('Model features')}</h2>
              <div className="cdx-card">
                <div className="cdx-set-row">
                  <div className="cdx-set-text">
                    <span className="cdx-set-label">{tr('Available reasoning efforts')}</span>
                    <span className="cdx-set-sub">
                      {tr('Choose which reasoning levels appear in model controls. Availability varies by model')}
                    </span>
                  </div>
                  <button className="cdx-btn" data-testid="ai-codex-efforts">{tr('5 selected')} <AiIkon name="chev-down" size={11} /></button>
                </div>
              </div>
            </>
          )}

          {section === 'personalization' && (
            <>
              <h1 className="cdx-pane-h1">{tr('Personalization')}</h1>
              <h2 className="cdx-pane-h2 cdx-h2-row">
                {tr('Codex instructions')}
                <button className="cdx-btn cdx-btn-ghost" data-testid="ai-codex-save-instructions" disabled>
                  {tr('Save')}
                </button>
              </h2>
              <p className="cdx-pane-desc">{tr('Edit the AGENTS.md file on the selected machine. Repository instructions may also apply.')}</p>
              <textarea
                className="cdx-instructions"
                data-testid="ai-codex-instructions"
                placeholder={tr('Add your custom instructions...')}
                rows={6}
                value={s.instructions}
                onChange={(e) => patch({ instructions: e.target.value })}
              />
              <h2 className="cdx-pane-h2">{tr('Codex memory')}</h2>
              <p className="cdx-pane-desc">{tr('Configure how Codex manages memory for Local.')}</p>
              <div className="cdx-card">
                <div className="cdx-set-row">
                  <div className="cdx-set-text">
                    <span className="cdx-set-label">{tr('Enable Codex memories')}</span>
                    <span className="cdx-set-sub">{tr('Create memories from chats on Local and use them to personalize future chats on Local')}</span>
                  </div>
                  <Toggle on={s.memories} onChange={(v) => patch({ memories: v })} testid="ai-codex-memories" />
                </div>
                <div className="cdx-set-row">
                  <div className="cdx-set-text">
                    <span className="cdx-set-label">{tr('Allow memories from tool-assisted chats')}</span>
                    <span className="cdx-set-sub">{tr('Generate memories from chats that used MCP tools or web search')}</span>
                  </div>
                  <Toggle on={s.toolMemories} onChange={(v) => patch({ toolMemories: v })} testid="ai-codex-tool-memories" />
                </div>
                <div className="cdx-set-row">
                  <div className="cdx-set-text">
                    <span className="cdx-set-label">{tr('Delete Codex memories')}</span>
                    <span className="cdx-set-sub">{tr('Delete all Codex memories for Local')}</span>
                  </div>
                  <button className="cdx-btn cdx-btn-danger" data-testid="ai-codex-del-memories">{tr('Delete')}</button>
                </div>
              </div>
            </>
          )}

          {section === 'mcp' && (
            <>
              <h1 className="cdx-pane-h1">{tr('MCP servers')}</h1>
              <p className="cdx-pane-desc">{tr('Connect external tools and data sources')}</p>
              <div className="cdx-pill-row"><span className="cdx-pill">{tr('MCPs')} <strong>0</strong></span></div>
              <h2 className="cdx-pane-h2">{tr('Servers')}</h2>
              <div className="cdx-card cdx-card-row">
                <span className="cdx-set-label">{tr('No MCP servers connected')}</span>
                <button className="cdx-btn" data-testid="ai-codex-add-server">
                  <AiIkon name="plus" size={12} /> {tr('Add server')}
                </button>
              </div>
            </>
          )}

          {section === 'hooks' && (
            <>
              <h1 className="cdx-pane-h1 cdx-h2-row">
                {tr('Hooks')}
                <button className="cdx-icon-btn" title={tr('Refresh')} aria-label={tr('Refresh')}>
                  <AiIkon name="refresh" size={14} />
                </button>
              </h1>
              <p className="cdx-pane-desc">{tr('Manage lifecycle hooks from config and enabled plugins.')}</p>
              <div className="cdx-card cdx-card-empty">
                <span className="cdx-set-label">{tr('No hooks found')}</span>
                <span className="cdx-set-sub">{tr('Configured hooks will appear here')}</span>
              </div>
            </>
          )}

          {section === 'plugins' && (
            <>
              <h1 className="cdx-pane-h1 cdx-h2-row">
                {tr('Plugins')}
                <span className="cdx-h1-actions">
                  <button className="cdx-btn" data-testid="ai-codex-browse-dir">{tr('Browse directory')}</button>
                  <button className="cdx-btn">{tr('Add')} <AiIkon name="chev-down" size={11} /></button>
                </span>
              </h1>
              <p className="cdx-pane-desc">{tr('Manage plugins, skills, and MCPs')}</p>
              <div className="cdx-pill-row"><span className="cdx-pill">{tr('MCPs')} <strong>0</strong></span></div>
              <h2 className="cdx-pane-h2">{tr('Servers')}</h2>
              <div className="cdx-card cdx-card-row">
                <span className="cdx-set-label">{tr('No MCP servers connected')}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
