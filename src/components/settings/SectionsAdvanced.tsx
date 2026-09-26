import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../lib/store';
import { useSettingsUi } from '../../lib/settingsStore';
import { useT, tx } from '../../lib/i18n';
import {
  ACTIONS,
  ACTION_BY_ID,
  displayBinding,
  effectiveBinding,
  eventToBinding,
  findConflicts,
} from '../../lib/shortcuts';
import { PROVIDERS, ProviderLogo, type ProviderInfo } from '../../lib/modelCatalog';
import * as cmd from '../../lib/commands';
import { defaultStartCommand, useTerminal } from '../../lib/terminalStore';
import { NumberInput, Row, Section, Select, TextInput, Toggle } from './SettingsControls';
import { useSubAgent } from '../../lib/subagentStore';

export function ShortcutsSection() {
  const tr = useT();
  const custom = useStore((s) => s.settings.shortcuts);
  const apply = useStore((s) => s.applySettings);
  const capturing = useSettingsUi((s) => s.capturing);
  const setCapturing = useSettingsUi((s) => s.setCapturing);
  const conflict = useSettingsUi((s) => s.conflictWarning);
  const setConflict = useSettingsUi((s) => s.setConflictWarning);

  useEffect(() => {
    if (!capturing) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        setCapturing(null);
        return;
      }
      const binding = eventToBinding(e);
      if (!binding) return;

      const clash = findConflicts(capturing, binding, custom);
      if (clash.length > 0) {
        const names = clash.map((id) => ACTION_BY_ID.get(id)?.label ?? id).join(', ');
        setConflict(`"${binding}" is already used: ${names} - pick another combination`);
        return; // TIDAK disimpan
      }
      void apply({ shortcuts: { ...custom, [capturing]: binding } });
      setCapturing(null);
    };

    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [capturing, custom, apply, setCapturing, setConflict]);

  useEffect(() => () => setCapturing(null), [setCapturing]);

  const groups = ['File', 'Edit', 'View', 'Terminal', 'AI', 'Git'] as const;

  return (
    <Section title={tr('settings.shortcuts')}>
      <p className="set-note">
        {tr('Click a shortcut field then press a combination. Escape = cancel. A combination already used by another action is rejected, so two actions can never share the same shortcut.')}
      </p>
      {conflict && (
        <p className="set-warning" data-testid="sc-conflict" role="alert">
          {conflict}
        </p>
      )}

      {groups.map((g) => (
        <div key={g} className="sc-group">
          <h3 className="sc-group-title">{g}</h3>
          <table className="sc-table">
            <tbody>
              {ACTIONS.filter((a) => a.group === g).map((a) => {
                const eff = effectiveBinding(a.id, custom);
                const isCustom = !!custom[a.id];
                const isCapturing = capturing === a.id;
                return (
                  <tr key={a.id} data-sc-row={a.id}>
                    <td className="sc-label">{tx(a.label)}</td>
                    <td className="sc-key">
                      <button
                        type="button"
                        className={`sc-binding${isCapturing ? ' is-capturing' : ''}${
                          isCustom ? ' is-custom' : ''
                        }`}
                        data-testid={`sc-btn-${a.id}`}
                        data-binding={eff}
                        onClick={() => setCapturing(isCapturing ? null : a.id)}
                      >
                        {isCapturing ? tr('Press a combination…') : displayBinding(eff)}
                      </button>
                    </td>
                    <td className="sc-actions">
                      {isCustom && (
                        <button
                          type="button"
                          className="btn btn-sm"
                          data-testid={`sc-reset-${a.id}`}
                          onClick={() => {

                            void apply({ shortcuts: { [a.id]: null } });
                          }}
                        >
                          {tr('common.reset')}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </Section>
  );
}

export function ModelsSection() {
  const tr = useT();
  const models = useStore((s) => s.settings.models);

  const providers = models?.providers ?? {};
  const apply = useStore((s) => s.applySettings);
  const ui = useSettingsUi();
  const [draft, setDraft] = useState<Record<string, string>>({});
    const [suggestOpen, setSuggestOpen] = useState<string | null>(null);
      const [reveal, setReveal] = useState<string | null>(null);

    const [remote, setRemote] = useState<Record<string, string[]>>({});
    const [fetching, setFetching] = useState<string | null>(null);
    const loaded = useRef(false);

  const answerLang = models.answerLang ?? 'follow';
  const answerBuiltin =
    answerLang === 'follow' || answerLang === 'id' || answerLang === 'en';

  useEffect(() => {
      if (loaded.current) return;
      loaded.current = true;
      void ui.loadKeys();
    }, [ui]);

    const refreshModels = async (p: ProviderInfo) => {
      setFetching(p.id);
      try {
        const ids = await cmd.listModels(p.id, providers[p.id]?.baseUrl || undefined);
        setRemote((r) => ({ ...r, [p.id]: ids }));
        ui.setMessage(
          ids.length > 0
            ? `${p.label}: ${ids.length} models loaded from the provider`
            : `${p.label}: model list empty / unreadable`,
        );
      } catch (e) {
        ui.setMessage(cmd.asZephyrError(e).message);
      } finally {
        setFetching(null);
      }
    };

  return (
    <Section title={tr('settings.models')}>
      <p className="set-note">
        {tr('API keys are stored by Rust in')} <code>%APPDATA%\zephyr\secrets.json</code>{' '}
        {tr('in encrypted form (key derived from this machine), SEPARATE from settings.json. The frontend only receives a mask - the real key is never sent to the UI and never logged. Honest note: this encryption protects against someone reading the file, not against someone who already has access to your Windows account.')}
      </p>

      <Row label={tr('models.active')}>
        <Select
          label={tr('models.active')}
          testid="models-active"
          value={models.activeProvider}
          onChange={(v) => void apply({ models: { activeProvider: v } })}
          options={PROVIDERS.map((p) => ({ value: p.id, label: p.label }))}
        />
      </Row>

      {/* Multi bahasa: instruksi bahasa jawaban dikirim ke model tiap chat. */}
      <Row label={tr('models.answerLang')} hint={tr('models.answerLangHint')}>
        <Select
          label={tr('models.answerLang')}
          testid="models-answerlang"
          value={answerBuiltin ? answerLang : 'custom'}
          onChange={(v) => void apply({ models: { answerLang: v } })}
          options={[
            { value: 'follow', label: tr('models.answerFollow') },
            { value: 'id', label: 'Indonesia' },
            { value: 'en', label: 'English' },
            { value: 'custom', label: tr('models.answerCustom') },
          ]}
        />
        {!answerBuiltin && (
          <TextInput
            label={tr('models.answerCustom')}
            testid="models-answerlang-custom"
            placeholder={tr('models.answerCustomPlaceholder')}
            value={answerLang === 'custom' ? '' : answerLang}
            onChange={(v) => void apply({ models: { answerLang: v.trim() || 'follow' } })}
          />
        )}
      </Row>

            {/* RAG lokal: cari konteks project sebelum kirim ke LLM. (fase 34) */}
            <Row label="Local RAG" hint={tr('Use a RAG server (e.g. enowx-rag at localhost:7777) to find project context before answering. Off = plain chat.')}>
              <div className="prov-rag">
                <Toggle
                  label="Enable RAG"
                  testid="models-rag-toggle"
                  checked={models.ragEnabled}
                  onChange={(v) => void apply({ models: { ragEnabled: v } })}
                />
                {models.ragEnabled && (
                  <>
                    <TextInput
                      label="Base URL"
                      testid="models-rag-url"
                      mono
                      placeholder="http://localhost:7777"
                      value={models.ragUrl}
                      onChange={(v) => void apply({ models: { ragUrl: v } })}
                    />
                    <TextInput
                      label="Project ID"
                      testid="models-rag-project"
                      mono
                      placeholder="zephyr"
                      value={models.ragProject}
                      onChange={(v) => void apply({ models: { ragProject: v } })}
                    />
                    <NumberInput
                      label={tr('Chunk count')}
                      testid="models-rag-k"
                      min={1}
                      max={20}
                      value={models.ragK}
                      onChange={(v) => void apply({ models: { ragK: v } })}
                    />
                  </>
                )}
              </div>
            </Row>

            <div className="prov-list">
        {PROVIDERS.map((p) => {
          const cfg = providers[p.id] ?? {};
          const has = ui.hasKey(p.id);
          const preview = ui.keyPreview(p.id);
          const res = ui.testResults[p.id];
          const isActive = models.activeProvider === p.id;
          return (
            <div
              key={p.id}
              className={`prov-card${isActive ? ' is-active' : ''}`}
              data-provider={p.id}
            >
              <div className="prov-head">
                <ProviderLogo id={p.id} size={18} />
                <span className="prov-name">{p.label}</span>
                <span
                  className={`prov-badge${has ? ' is-ok' : ''}`}
                  data-testid={`prov-badge-${p.id}`}
                >
                  {has ? `${tr('models.saved')}: ${preview}` : tr('models.noKey')}
                </span>
              </div>

              <div className="prov-body">
                <label className="prov-field">
                  <span className="prov-flabel">{tr('models.apiKey')}</span>
                  <span className="prov-keyrow">
                    <input
                      className="set-text is-mono"
                      type={reveal === p.id ? 'text' : 'password'}
                      placeholder={has ? tr('(saved - type to replace)') : p.envKey}
                      value={draft[p.id] ?? ''}
                      spellCheck={false}
                      aria-label={`${p.label} API key`}
                      data-testid={`prov-key-${p.id}`}
                      onChange={(e) => setDraft((d) => ({ ...d, [p.id]: e.target.value }))}
                    />
                    <button
                      type="button"
                      className="btn btn-sm"
                      aria-label={reveal === p.id ? tr('common.hide') : tr('common.show')}
                      onClick={() => setReveal(reveal === p.id ? null : p.id)}
                    >
                      {reveal === p.id ? tr('common.hide') : tr('common.show')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      data-testid={`prov-save-${p.id}`}
                      onClick={() => {
                        void ui.saveKey(p.id, draft[p.id] ?? '');
                        setDraft((d) => ({ ...d, [p.id]: '' }));
                      }}
                    >
                      {tr('common.save')}
                    </button>
                    {has && (
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        data-testid={`prov-del-${p.id}`}
                        onClick={() => void ui.saveKey(p.id, '')}
                      >
                        Delete
                      </button>
                    )}
                  </span>
                </label>

                <label className="prov-field">
                  <span className="prov-flabel">{tr('models.baseUrl')}</span>
                  <TextInput
                    label={`${p.label} base URL`}
                    testid={`prov-url-${p.id}`}
                    mono
                    placeholder={p.baseUrl || 'https://…'}
                    value={cfg.baseUrl ?? ''}
                    onChange={(v) =>
                      void apply({
                        models: { providers: { ...providers, [p.id]: { ...cfg, baseUrl: v } } },
                      })
                    }
                  />
                </label>

                <label className="prov-field">
                                  <span className="prov-flabel">{tr('models.model')}</span>
                                  {p.freeText ? (
                                                      <div className="prov-model-row">
                                                                                                              <TextInput
                                                                                                                label={`${p.label} ${tr('model')}`}
                                                                                                                testid={`prov-model-${p.id}`}
                                                                                                                placeholder={tr(p.models[0].note ?? '')}
                                                                                                                list={`prov-models-${p.id}`}
                                                                                                                value={cfg.model ?? ''}
                                                                                                                onChange={(v) =>
                                                                                                                  void apply({
                                                                                                                    models: { providers: { ...providers, [p.id]: { ...cfg, model: v.trim() } } },
                                                                                                                  })
                                                                                                                }
                                                                                                              />
                                                                                                              {/* Dropdown ▼: pilih model custom/lokal dari katalog + hasil Refresh */}
                                                                                                              <button
                                                                                                                type="button"
                                                                                                                className="btn btn-sm prov-drop-btn"
                                                                                                                data-testid={`prov-drop-${p.id}`}
                                                                                                                aria-haspopup="listbox"
                                                                                                                aria-expanded={suggestOpen === p.id}
                                                                                                                title={tr('Pick a model from the list')}
                                                                                                                onClick={() => setSuggestOpen(suggestOpen === p.id ? null : p.id)}
                                                                                                              >
                                                                                                                ▾
                                                                                                              </button>
                                                                                                              {suggestOpen === p.id && (
                                                                                                                <div
                                                                                                                  className="prov-drop-menu"
                                                                                                                  role="listbox"
                                                                                                                  data-testid={`prov-drop-menu-${p.id}`}
                                                                                                                  onMouseDown={(e) => e.stopPropagation()}
                                                                                                                >
                                                                                                                  {[...p.models, ...(remote[p.id] ?? []).map((id) => ({ id })), ...(ui.remoteModels[p.id] ?? []).map((id) => ({ id }))]
                                                                                                                    .filter(
                                                                                                                      (m, i, arr) =>
                                                                                                                        m.id && arr.findIndex((x) => x.id === m.id) === i,
                                                                                                                    )
                                                                                                                    .map((m) => (
                                                                                                                      <button
                                                                                                                        type="button"
                                                                                                                        key={m.id}
                                                                                                                        role="option"
                                                                                                                        aria-selected={cfg.model === m.id}
                                                                                                                        data-model-item={m.id}
                                                                                                                        className={`prov-drop-item${cfg.model === m.id ? ' is-active' : ''}`}
                                                                                                                        onClick={() => {
                                                                                                                          void apply({
                                                                                                                            models: { providers: { ...providers, [p.id]: { ...cfg, model: m.id } } },
                                                                                                                          });
                                                                                                                          setSuggestOpen(null);
                                                                                                                        }}
                                                                                                                      >
                                                                                                                        <span className="ai-mi-name">{m.id}</span>
                                                                                                                      </button>
                                                                                                                    ))}
                                                                                                                  {(!p.models.length && !(remote[p.id] ?? []).length) && (
                                                                                                                    <div className="ai-model-empty">
                                                                                                                      Type a model name in the field, or click Refresh to
                                                                                                                      fetch from the provider.
                                                                                                                    </div>
                                                                                                                  )}
                                                                                                                </div>
                                                                                                              )}
                                                                                                              {/* Saran dari katalog provider ini + hasil Refresh (API);
                                                                                                                  tetap bisa diketik bebas. */}
                                                                                                              <datalist id={`prov-models-${p.id}`}>
                                                                                                                {[...p.models.map((m) => m.id), ...(remote[p.id] ?? [])]
                                                                                                                  .filter((id, i, a) => id && a.indexOf(id) === i)
                                                                                                                  .map((id) => (
                                                                                                                    <option key={id} value={id} />
                                                                                                                  ))}
                                                                                                              </datalist>
                                                        <button
                                                          type="button"
                                                          className="btn btn-sm"
                                                          data-testid={`prov-refresh-${p.id}`}
                                                          disabled={fetching === p.id}
                                                          title={tr('Fetch the model list directly from the provider')}
                                                          onClick={() => void refreshModels(p)}
                                                        >
                                                          {fetching === p.id ? 'Loading…' : 'Refresh'}
                                                        </button>
                                                      </div>
                                                    ) : (
                                    <div className="prov-model-row">
                                      <Select
                                        label={`${p.label} model`}
                                        testid={`prov-model-${p.id}`}
                                        value={cfg.model ?? p.models[0].id}
                                        onChange={(v) =>
                                          void apply({
                                            models: { providers: { ...providers, [p.id]: { ...cfg, model: v } } },
                                          })
                                        }
                                        options={[
                                          ...p.models.map((m) => ({
                                            value: m.id,
                                            label: m.note ? `${m.label} - ${tr(m.note)}` : m.label,
                                          })),

                                          ...[...(remote[p.id] ?? []), ...(ui.remoteModels[p.id] ?? [])]
                                            .filter((id, i, a) => id && a.indexOf(id) === i)
                                            .filter((id) => !p.models.some((m) => m.id === id))
                                            .map((id) => ({ value: id, label: `${id} (API)` })),
                                        ]}
                                      />
                                      <button
                                        type="button"
                                        className="btn btn-sm"
                                        data-testid={`prov-refresh-${p.id}`}
                                        disabled={fetching === p.id || ui.fetchingModels === p.id}
                                        title={tr('Fetch the model list directly from the provider')}
                                        onClick={() => void refreshModels(p)}
                                      >
                                        {fetching === p.id || ui.fetchingModels === p.id ? 'Loading…' : 'Refresh'}
                                      </button>
                                    </div>
                                  )}
                                                                  </label>

                                                  {p.freeText && (
                                                    <p className="set-note prov-hint" data-testid={`prov-hint-${p.id}`}>
                                                      <strong>{tr('How to use:')}</strong> {tr('fill in')} <em>base URL</em>{' '}
                                                      {tr('(e.g.')} <code> http://127.0.0.1:11434/v1</code>{' '}
                                                      {tr('for Ollama) if local, then type')} <em>{tr('the model name')}</em>{' '}
                                                      {tr('in the field or pick from')} <strong>▾</strong>.{' '}
                                                      {tr('Click')} <strong>Refresh</strong>{' '}
                                                      {tr('to pull the model list directly from the provider. This model appears in the AI panel dropdown (bottom left) - not only in the AI terminal.')}
                                                    </p>
                                                  )}

                                                  <div className="prov-test">
                  <button
                    type="button"
                    className="btn btn-sm"
                    data-testid={`prov-test-${p.id}`}
                    disabled={ui.testing === p.id}
                    onClick={() => void ui.testConnection(p.id, cfg.baseUrl || undefined)}
                  >
                    {ui.testing === p.id ? tr('Testing…') : tr('models.test')}
                  </button>
                  {res && (
                    <span
                      className={`prov-result${res.ok ? ' is-ok' : ' is-bad'}`}
                      data-testid={`prov-result-${p.id}`}
                      role="status"
                    >
                      {res.ok ? '✓' : '✕'} {res.message}
                      {res.status ? ` (HTTP ${res.status})` : ''} · {res.ms} ms
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

export function AgentsSection() {
  const tr = useT();
  const a = useStore((s) => s.settings.agents);
  const apply = useStore((s) => s.applySettings);
  const agents = useTerminal((s) => s.agents);
  const loadAgents = useTerminal((s) => s.loadAgents);

  return (
    <Section title={tr('settings.agents')}>
      <Row label={tr('agents.maxPanes')} hint={tr('panes exceeding the limit are rejected with a toast')}>
        <NumberInput
          label={tr('agents.maxPanes')}
          testid="agents-maxpanes"
          min={1}
          max={6}
          value={a.maxPanes}
          onChange={(v) => void apply({ agents: { maxPanes: v } })}
        />
      </Row>

      <Row label={tr('agents.attachActiveFile')} hint={tr('used by the AI panel')}>
        <Toggle
          label={tr('agents.attachActiveFile')}
          testid="agents-attach"
          checked={a.attachActiveFile}
          onChange={(v) => void apply({ agents: { attachActiveFile: v } })}
        />
      </Row>

      <Row label={tr('agents.rescan')} hint={`${agents.length} CLIs detected on PATH`}>
        <button className="btn" data-testid="agents-rescan" onClick={() => void loadAgents()}>
          {tr('agents.rescan')}
        </button>
      </Row>

      {agents.length === 0 ? (
        <p className="set-note" data-testid="agents-empty">
          {tr('agents.none')} - install one of them (opencode, claude, codex, gemini,
          grok, gh copilot) then press {tr('agents.rescan')}.
        </p>
      ) : (
        <div className="agent-list">
          {agents.map((ag) => {
            const custom = a.startCommands[ag.id];
            const fallback = defaultStartCommand(ag.id, ag.path);
            const eff = custom && custom.length ? custom : fallback;
            return (
              <div key={ag.id} className="agent-card" data-agent={ag.id}>
                <div className="agent-head">
                  <span className="agent-name">{ag.label}</span>
                  <code className="agent-path">{ag.path}</code>
                  {ag.version && <span className="agent-ver">{ag.version}</span>}
                </div>
                <label className="prov-field">
                  <span className="prov-flabel">{tr('agents.startCommand')}</span>
                  <TextInput
                    label={`${ag.label} start command`}
                    testid={`agent-cmd-${ag.id}`}
                    mono
                    value={eff.join(' ')}
                    placeholder={fallback.join(' ')}
                    onChange={(v) => {
                      const parts = v.trim() ? v.trim().split(/\s+/) : [];
                      void apply({
                        agents: { startCommands: { ...a.startCommands, [ag.id]: parts } },
                      });
                    }}
                  />
                </label>
                {custom && custom.length > 0 && (
                  <button
                    className="btn btn-sm"
                    data-testid={`agent-cmd-reset-${ag.id}`}
                    onClick={() => {

                      void apply({ agents: { startCommands: { [ag.id]: null } } });
                    }}
                  >
                    {tr('common.reset')} to default
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

export function SubagentSection() {
  const tr = useT();

  const sbRaw = useStore((s) => s.settings.subagent);
  const sb = sbRaw ?? {
    maxParallel: 4,
    maxSteps: 15,
    allowWrite: false,
    showPanel: true,
    autoCollapse: true,
    model: '',
    provider: '',
  };
  const apply = useStore((s) => s.applySettings);
  const [jalan, setJalan] = useState<number | null>(null);
  const sibuk = useSubAgent((s) => s.sibuk);
  const agents = useSubAgent((s) => s.agents);

  useEffect(() => {
    const t = setInterval(() => {
      const n = useSubAgent.getState().agents.filter(
        (a) => a.status === 'jalan' || a.status === 'menunggu',
      ).length;
      setJalan(n);
    }, 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <Section title={tr('settings.subagent')}>
      <Row
        label={tr('sub.maxParallel')}
        hint={tr('each subagent calls the provider itself - more subagents means the quota is used up faster')}
      >
        <NumberInput
          label={tr('sub.maxParallel')}
          testid="sub-maxparallel"
          min={1}
          max={8}
          value={sb.maxParallel}
          onChange={(v) => void apply({ subagent: { maxParallel: v } })}
        />
      </Row>

      <Row
        label={tr('sub.maxSteps')}
        hint={tr('a subagent stops if it exceeds this limit - a guard against endless loops that burn cost')}
      >
        <NumberInput
          label={tr('sub.maxSteps')}
          testid="sub-maxsteps"
          min={3}
          max={50}
          value={sb.maxSteps}
          onChange={(v) => void apply({ subagent: { maxSteps: v } })}
        />
      </Row>

      <Row
        label={tr('sub.allowWrite')}
        hint={tr('default NO. Several subagents writing the same file can overwrite each other')}
      >
        <Toggle
          label={tr('sub.allowWrite')}
          testid="sub-allowwrite"
          checked={sb.allowWrite}
          onChange={(v) => void apply({ subagent: { allowWrite: v } })}
        />
      </Row>

      <Row label={tr('sub.showPanel')} hint={tr('if turned off, only the summary appears')}>
        <Toggle
          label={tr('sub.showPanel')}
          testid="sub-showpanel"
          checked={sb.showPanel}
          onChange={(v) => void apply({ subagent: { showPanel: v } })}
        />
      </Row>

      <Row label={tr('sub.autoCollapse')} hint={tr('steps are collapsed right after they finish')}>
        <Toggle
          label={tr('sub.autoCollapse')}
          testid="sub-autocollapse"
          checked={sb.autoCollapse}
          onChange={(v) => void apply({ subagent: { autoCollapse: v } })}
        />
      </Row>

      <Row label={tr('Status')} hint={`${agents.length} subagents in the panel`}>
        <span className="set-note" data-testid="sub-status">
          {sibuk ? `${jalan ?? 0} running` : tr('nothing is running')}
        </span>
      </Row>

      <p className="set-note" data-testid="sub-note">
        {tr(
          'Subagents are invoked by the main agent through the "Parallel tasks" button in the AI panel, or automatically when a task can be split up.',
        )}
      </p>
    </Section>
  );
}
