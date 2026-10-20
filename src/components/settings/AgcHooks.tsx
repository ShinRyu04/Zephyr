/*
 * Hooks — the TRAE-shaped page inside Agent Customizations.
 *
 * Two blocks:
 *
 *   1. CONFIGURATION  - Global | Project, the Claude-import switch, and the list
 *                       of configured hooks with a + Create button.
 *   2. EXECUTION MODE - how a hook command runs, plus a log row.
 *
 * WHAT IS HONEST HERE, and why it matters: only two of the five hook events have
 * a caller that fires them (`session-start`, `session-end`). The other three are
 * stored, listed and toggleable — and never run. The reference product offers
 * all of them because it wires all of them; Zephyr does not, so each row says so
 * in plain words instead of letting the reader trust a guard that is not there.
 */
import { useMemo, useState } from 'react';
import { useT } from '../../lib/i18n';
import AiIkon from '../ai/AiIkon';
import { useStore } from '../../lib/store';
import { useAgentExtras, HOOK_EVENTS, type HookEvent } from '../../lib/agentExtrasStore';

type Lingkup = 'global' | 'proyek';

/* The two execution modes the reference offers, mapped to what Zephyr can do. */
const MODE = [
  {
    id: 'sandbox',
    label: 'Run in Sandbox',
    ket: 'Hook commands run in the built-in sandbox with no access to your files.',
  },
  {
    id: 'lokal',
    label: 'Run Automatically Locally',
    ket: 'Hook commands run directly on this machine, with your permissions.',
  },
] as const;

export default function AgcHooks() {
  const tr = useT();
  const settings = useStore((s) => s.settings);
  const applySettings = useStore((s) => s.applySettings);
  const hooks = useAgentExtras((s) => s.hooks);
  const addHook = useAgentExtras((s) => s.addHook);
  const updateHook = useAgentExtras((s) => s.updateHook);
  const removeHook = useAgentExtras((s) => s.removeHook);

  const [lingkup, setLingkup] = useState<Lingkup>('global');
  const [logBuka, setLogBuka] = useState(false);

  const agen = (settings.agents ?? {}) as Record<string, unknown>;
  const imporClaude = agen.imporHookClaude === true;
  const mode = String(agen.modeHook ?? 'sandbox');

  /*
   * The scope filter is a real filter: `user` hooks are global, `workspace`
   * hooks belong to this project. Showing both under both tabs would make the
   * tab decorative.
   */
  const tampil = useMemo(
    () => hooks.filter((h) => (lingkup === 'global' ? h.scope === 'user' : h.scope === 'workspace')),
    [hooks, lingkup],
  );

  const simpan = (patch: Record<string, unknown>) => {
    void applySettings({ agents: { ...agen, ...patch } } as never);
  };

  return (
    <div className="agc-pane agset-pane" data-testid="agx-hooks">
      <h2 className="agc-pane-title">
        {tr('Hooks')}{' '}
        <span className="agset-tanya" title={tr('Commands the agent runs at points in its lifecycle.')}>
          ?
        </span>
      </h2>

      {/* ── 1. Configuration ───────────────────────────────────────────── */}
      <div className="agset-seksi-baris">
        <h3 className="agset-seksi">{tr('Configuration')}</h3>
        <div className="agset-seg" role="tablist" data-testid="agx-hooks-tab">
          {(['global', 'proyek'] as Lingkup[]).map((l) => (
            <button
              key={l}
              type="button"
              role="tab"
              aria-selected={lingkup === l}
              className={`agset-seg-btn${lingkup === l ? ' is-on' : ''}`}
              data-testid={`agx-hooks-${l}`}
              onClick={() => setLingkup(l)}
            >
              {l === 'global' ? tr('Global') : tr('Project')}
            </button>
          ))}
        </div>
      </div>

      <label className="agset-tool-baris agset-tool-pil" data-testid="agx-hooks-impor">
        <input
          type="checkbox"
          checked={imporClaude}
          onChange={(e) => simpan({ imporHookClaude: e.target.checked })}
        />
        <span className="agset-tool-ikon">
          <AiIkon name="bolt" size={13} />
        </span>
        <span className="agset-baris-teks">
          <span className="agset-baris-nama">{tr('Import Hooks configuration in Claude')}</span>
          <span className="agset-baris-desk">
            {tr('Read hook definitions from ~/.claude/settings.json.')}
          </span>
        </span>
      </label>

      <div className="agset-seksi-baris">
        <h3 className="agset-seksi">{tr('Configured Hooks')}</h3>
        <button
          type="button"
          className="agset-btn-utama"
          data-testid="agx-hooks-create"
          onClick={() => addHook(lingkup === 'global' ? 'user' : 'workspace')}
        >
          + {tr('Create')}
        </button>
      </div>

      {tampil.length === 0 ? (
        <div className="agset-kosong" data-testid="agx-hooks-kosong">
          <span className="agset-kosong-ikon" aria-hidden="true">
            <AiIkon name="queue" size={18} />
          </span>
          <span>{tr('No hooks configured. Click Create to add your first hook')}</span>
        </div>
      ) : (
        <div className="agset-daftar" data-testid="agx-hooks-daftar">
          {tampil.map((h) => {
            const ev = HOOK_EVENTS.find((e) => e.id === h.event);
            return (
              <div className="agset-baris" key={h.id} data-testid={`agx-hook-${h.id}`}>
                <span className="agset-avatar" aria-hidden="true">
                  <AiIkon name="queue" size={15} />
                </span>
                <div className="agset-baris-teks">
                  <input
                    className="agset-hook-nama"
                    value={h.name}
                    placeholder={tr('Hook name')}
                    onChange={(e) => updateHook(h.id, { name: e.target.value })}
                  />
                  <select
                    className="agset-hook-ev"
                    value={h.event}
                    onChange={(e) => updateHook(h.id, { event: e.target.value as HookEvent })}
                  >
                    {HOOK_EVENTS.map((e) => (
                      <option key={e.id} value={e.id}>
                        {tr(e.label)}
                        {e.live ? '' : ` — ${tr('not wired up yet')}`}
                      </option>
                    ))}
                  </select>
                  {ev && !ev.live && (
                    <span className="agset-hook-warn" data-testid={`agx-hook-warn-${h.id}`}>
                      {tr(ev.why ?? 'This event is not wired up in this build.')}
                    </span>
                  )}
                </div>
                <div className="agset-baris-aksi">
                  <label className="agset-switch" title={tr('Enabled')}>
                    <input
                      type="checkbox"
                      checked={h.enabled}
                      onChange={(e) => updateHook(h.id, { enabled: e.target.checked })}
                    />
                    <span />
                  </label>
                  <button
                    type="button"
                    className="agset-menu-btn"
                    title={tr('Delete')}
                    data-testid={`agx-hook-hapus-${h.id}`}
                    onClick={() => removeHook(h.id)}
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── 2. Execution mode ──────────────────────────────────────────── */}
      <h3 className="agset-seksi">{tr('Execution Mode')}</h3>
      <label className="agset-field">
        <span className="agset-field-label">{tr('Hooks Command Execution Mode')}</span>
        <select
          className="agset-pil"
          data-testid="agx-hooks-mode"
          value={mode}
          onChange={(e) => simpan({ modeHook: e.target.value })}
        >
          {MODE.map((m) => (
            <option key={m.id} value={m.id}>
              {tr(m.label)}
            </option>
          ))}
        </select>
        <span className="agset-baris-desk">
          {tr(MODE.find((m) => m.id === mode)?.ket ?? MODE[0].ket)}
        </span>
      </label>

      <div className="agset-log-baris">
        <span className="agset-baris-nama">{tr('Execution Log')}</span>
        <button
          type="button"
          className="agset-btn-batal"
          data-testid="agx-hooks-log"
          onClick={() => setLogBuka((v) => !v)}
        >
          {logBuka ? tr('Hide Logs') : tr('View Logs')}
        </button>
      </div>
      {logBuka && (
        <div className="agset-log" data-testid="agx-hooks-log-isi">
          {hooks.length === 0
            ? tr('No hook has run yet.')
            : tr('Hook runs are recorded in the app log file. Nothing has been recorded for the hooks above yet.')}
        </div>
      )}
    </div>
  );
}
