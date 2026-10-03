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
import { useSubagentCustom } from '../../lib/subagentCustom';
import { IKON_AGEN_ZEPHYR, ikonSubagent } from '../../lib/subagentIcons';
import PersonaCard from './PersonaCard';
import {
  loadUserPrompts,
  saveUserPrompts,
  type PromptItem,
} from '../../lib/promptLibrary';

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
        return; // NOT saved
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
  const answerStyle = models.answerStyle ?? 'short';
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

      {/* Multi-language: the answer-language instruction is sent to the model on every chat. */}
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

      {/* Answer style: a length rule added to the system prompt, not a capability switch. */}
      <Row label={tr('models.answerStyle')} hint={tr('models.answerStyleHint')}>
        <Select
          label={tr('models.answerStyle')}
          testid="models-answerstyle"
          value={answerStyle}
          onChange={(v) => void apply({ models: { answerStyle: v } })}
          options={[
            { value: 'short', label: tr('models.answerStyleShort') },
            { value: 'normal', label: tr('models.answerStyleNormal') },
            { value: 'detail', label: tr('models.answerStyleDetail') },
          ]}
        />
      </Row>

            {/* Local RAG: look up project context before sending to the LLM. (phase 34) */}
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
                                                                                                              {/* ▼ dropdown: pick a custom/local model from the catalog + Refresh results */}
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
                                                                                                              {/* Suggestions from this provider's catalog + Refresh results (API);
                                                                                                                  can still be typed freely. */}
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
    <Section title={tr('settings.agents')} ikon={IKON_AGEN_ZEPHYR}>
      <PersonaCard />

      {/*
        Custom instructions.

        A standing layer the user writes once and every conversation carries.
        Kept OUTSIDE the persona on purpose: it belongs to the user, not to an
        identity, so switching personas must not lose it - and because
        systemPrompt.ts stacks it as its own layer, it can neither be swallowed
        by the persona nor swallow the persona's identity.
      */}
      <label className="subagent-field" data-testid="agents-custom-instructions-wrap">
        <span className="subagent-label">{tr('agents.customInstructions')}</span>
        <span className="set-hint">{tr('agents.customInstructionsHint')}</span>
        <textarea
          className="input subagent-prompt"
          data-testid="agents-custom-instructions"
          rows={4}
          value={a.customInstructions ?? ''}
          placeholder={tr('agents.customInstructionsPlaceholder')}
          onChange={(e) => void apply({ agents: { customInstructions: e.target.value } })}
        />
      </label>

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

      {/*
       * One switch for both sides of the conversation.
       *
       * `!== false` rather than `!!`: a user who never touched this has no
       * `chatAvatar` key, and a missing value must read as ON - otherwise
       * everyone who upgrades silently loses their avatars.
       *
       * The hint says what actually changes on screen. "Show avatars" alone
       * leaves the reader guessing whether it means the message list, the
       * sub-agent cards, or something else; naming the robot and the photo
       * removes the guess.
       */}
      <Row label={tr('agents.chatAvatar')} hint={tr('the robot and your photo beside each message')}>
        <Toggle
          label={tr('agents.chatAvatar')}
          testid="agents-chat-avatar"
          checked={a.chatAvatar !== false}
          onChange={(v) => void apply({ agents: { chatAvatar: v } })}
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

      <SnippetCard />
    </Section>
  );
}

/*
 * User chat snippets.
 *
 * A snippet is a trigger word plus the text it inserts: typing ">review" (or
 * "#review") in the AI composer swaps the trigger for the body. The list here
 * is the ONLY editor for them, and it writes through `saveUserPrompts` to the
 * same localStorage key the composer already reads (`zephyr.ai.prompts.v1`) -
 * a parallel store would let the two disagree about what a snippet is.
 *
 * The built-in prompt commands are not shown: they ship with the app and are
 * not the user's to edit or delete. Only their own snippets appear, so the row
 * count matches what they actually created.
 */
function SnippetCard() {
  const tr = useT();
  const [items, setItems] = useState<PromptItem[]>(() => loadUserPrompts());

  /*
   * Persist on every change and keep the local copy as the source of truth for
   * the list below. `loadUserPrompts` normalises the command the same way the
   * composer does, so what is typed here is what the trigger will match.
   */
  const simpan = (next: PromptItem[]) => {
    setItems(next);
    saveUserPrompts(next);
  };

  const tambah = () => {
    const dipakai = new Set(items.map((x) => x.cmd));
    let n = items.length + 1;
    let cmd = `snippet-${n}`;
    while (dipakai.has(cmd)) {
      n += 1;
      cmd = `snippet-${n}`;
    }
    simpan([...items, { cmd, label: cmd, body: '', ikon: 'tanya' }]);
  };

  const ubah = (i: number, patch: Partial<PromptItem>) => {
    simpan(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  };

  return (
    <div className="subagent-kartu" data-testid="snippet-card">
      <div className="subagent-kartu-head">
        <div className="set-row-label">
          <span className="set-h2-sub">{tr('agents.snippets')}</span>
          <span className="set-hint">{tr('agents.snippetsHint')}</span>
        </div>
        <button className="btn btn-sm" data-testid="snippet-add" onClick={tambah}>
          {tr('agents.snippetAdd')}
        </button>
      </div>

      {items.length === 0 ? (
        <p className="set-note" data-testid="snippet-kosong">
          {tr('agents.snippetKosong')}
        </p>
      ) : (
        <div data-testid="snippet-daftar">
          {items.map((s, i) => (
            <div className="snippet-baris" key={i} data-testid={`snippet-${i}`}>
              <input
                className="input"
                data-testid={`snippet-cmd-${i}`}
                value={s.cmd}
                aria-label={tr('agents.snippetCmd')}
                placeholder={tr('agents.snippetCmd')}
                /*
                 * Normalise the command the same way `loadUserPrompts` does, so
                 * a space or capital typed here cannot produce a snippet that
                 * is saved but can never be triggered.
                 */
                onChange={(e) =>
                  ubah(i, { cmd: e.target.value.toLowerCase().replace(/\s+/g, '-') })
                }
              />
              <textarea
                className="input subagent-prompt"
                data-testid={`snippet-body-${i}`}
                value={s.body}
                rows={2}
                aria-label={tr('agents.snippetBody')}
                placeholder={tr('agents.snippetBody')}
                onChange={(e) => ubah(i, { body: e.target.value })}
              />
              <button
                className="btn btn-sm"
                data-testid={`snippet-hapus-${i}`}
                onClick={() => simpan(items.filter((_, j) => j !== i))}
              >
                {tr('agents.snippetHapus')}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
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

      <CustomSubagentsCard />

      <p className="set-note" data-testid="sub-note">
        {tr(
          'Subagents are invoked by the main agent through the "Parallel tasks" button in the AI panel, or automatically when a task can be split up.',
        )}
      </p>
    </Section>
  );
}

/*
 * Custom workers: the list plus the editor. Kept in its own component so the
 * modal's local form state does not re-render the whole settings section on
 * every keystroke, and so the store subscription for the list is isolated.
 */
function CustomSubagentsCard() {
  const tr = useT();
  const daftar = useSubagentCustom((s) => s.daftar);
  const muat = useSubagentCustom((s) => s.muat);
  const setAktif = useSubagentCustom((s) => s.setAktif);
  const hapus = useSubagentCustom((s) => s.hapus);

  /*
   * `bukaBaru`, `bukaSunting`, `sunting`, dan `baru` sengaja TIDAK diambil.
   *
   * Membuang tombolnya saja tidak cukup. Selama store masih menyimpan jalur itu,
   * siapa pun bisa memasukinya - termasuk `devBridge` - dan orang bisa mengubah
   * nama `cari` menjadi apa pun. `peranBawaan` di subagentCustom.ts mencocokkan
   * peran lewat NAMA, jadi sekali namanya diubah, pekerja itu kehilangan label,
   * ikon, dan arahannya secara diam-diam.
   *
   * Modal editornya juga tidak dirender lagi. Ia sengaja tidak dihapus dari
   * disk: berkasnya masih memuat bentuk field dan tata letaknya, dan menghapusnya
   * sekarang berarti kehilangan rancangan itu tanpa alasan. Yang penting adalah
   * ia tidak punya jalan masuk.
   */

  useEffect(() => {
    muat();
  }, [muat]);

  return (
    <>
      {/*
       * A column, not .set-row: the row class is a two-column flex layout for
       * one label plus one control, and this card holds a header AND a list.
       * Using it put the header and the empty state side by side and squeezed
       * the "New" button into the middle of the card.
       */}
      <div className="subagent-kartu" data-testid="sub-custom-card">
        <div className="subagent-kartu-head">
          <div className="set-row-label">
            <span className="set-h2-sub">{tr('Sub-agent kustom')}</span>
            <span className="set-hint">
              {tr(
                'Your own read-only worker. The AI can delegate to an active one by name, using the built-in roles (Search, Review, Plan, Audit, Work, Explore).',
              )}
            </span>
          </div>

          {/*
           * How to actually use one, in three lines.
           *
           * The section described what a custom sub-agent IS and never said how
           * to invoke it, which left the feature looking decorative - the user
           * created one and then had nothing to do with it. The three ways below
           * are the three that exist, in the order a reader is likely to try
           * them: ask in plain words, name it explicitly, or just let the agent
           * pick it up when the task matches.
           *
           * The closing note used to point at "the tools you tick in its editor".
           * That editor is gone - editing and duplicating were removed - so the
           * sentence now names a control that does not exist, which sends the
           * reader hunting for it. What a sub-agent sees is decided when it is
           * created, and the note says so instead.
           */}
          <details className="subagent-cara" data-testid="sub-custom-cara">
            <summary>{tr('How to use it')}</summary>
            <ol>
              <li>
                {tr('Turn it on with the switch, then ask the agent for work that fits it.')}{' '}
                <code>{tr('The agent sees it in subagent_list and can delegate on its own.')}</code>
              </li>
              <li>
                {tr('Name it in the chat to force it:')}{' '}
                <code>[{tr('Name')}] {tr('do this task')}</code>
              </li>
              <li>
                {tr('Or tell the agent which one to use:')}{' '}
                <code>{tr('run these two tasks with Name')}</code>
              </li>
            </ol>
            <p className="subagent-cara-note">
              {tr('A sub-agent only sees the tools it was given when it was made, and it can never write files: that is what keeps it safe to run several at once.')}
            </p>
            <p className="subagent-cara-note">
              {tr('The list is read-only: a sub-agent cannot be edited or duplicated from here. Turn one on to use it, or delete it to remove it.')}
            </p>
          </details>
          {/*
           * Tombol "+ Baru" dibuang atas permintaan user: cukup nama, tidak
           * perlu bisa menambah, mengubah, atau menduplikat.
           *
           * Konsekuensinya harus disadari, bukan disembunyikan: daftar ini
           * sekarang READ-ONLY bagi user kecuali tombol hapus. Sub-agent kustom
           * yang masih tersimpan dari versi sebelumnya tetap tampil, tetap bisa
           * dinyalakan, dan tetap bisa dihapus - yang hilang hanyalah cara
           * membuat yang baru dari UI.
           *
           * Penghapusnya juga masih diambil dari store, karena baris tanpa
           * tombol hapus meninggalkan sub-agent yang tidak bisa dibuang sama
           * sekali - itu bukan penyederhanaan, itu kebuntuan.
           */}
        </div>

        {daftar.length === 0 ? (
          <p className="subagent-kosong" data-testid="sub-custom-kosong">
            {tr('No custom sub-agent yet. Create one to give the AI a dedicated worker.')}
          </p>
        ) : (
          <div data-testid="sub-custom-daftar">
            {daftar.map((x) => (
              <div className="subagent-baris" key={x.id} data-testid={`sub-custom-${x.id}`}>
                {/*
                  * The worker's own icon, so the row and the AI panel agree.
                  *
                  * The list used to be name-only, which meant the icon chosen in
                  * the editor, the one the sub-agent row wears in the AI panel
                  *, was invisible the moment the dialog closed. Showing it here
                  * makes the choice look like it stuck.
                  */}
                <span
                  className="subagent-baris-ikon"
                  data-ikon={ikonSubagent(x.ikon).id}
                  aria-hidden="true"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d={ikonSubagent(x.ikon).d} />
                    {ikonSubagent(x.ikon).dFill && (
                      <path d={ikonSubagent(x.ikon).dFill!} fill="currentColor" stroke="none" />
                    )}
                  </svg>
                </span>
                <div className="subagent-baris-teks">
                  <span className="subagent-baris-nama">
                    {x.nama}
                    <span className={`subagent-tag${x.aktif ? ' is-on' : ''}`}>
                      {x.aktif ? tr('aktif') : tr('nonaktif')}
                    </span>
                  </span>
                  <span className="subagent-baris-ket" title={x.deskripsi}>
                    {x.deskripsi || `${x.alat.length} ${tr('alat')}`}
                  </span>
                </div>
                {/*
                  * The model gets its own column instead of riding along inside
                  * the name row.
                  *
                  * It was a chip next to the name, so the name, the status chip
                  * and a 20-character model id all competed for one line, the
                  * id was the first to clip, and on a narrow settings pane it
                  * vanished entirely. A fixed column at the end keeps it
                  * readable whatever the name is, and it lines up down the list.
                  */}
                <span className="subagent-model" data-testid={`sub-custom-${x.id}-model`} title={x.model || undefined}>
                  {x.model || tr('sama seperti chat')}
                </span>
                <div className="subagent-baris-aksi">
                  {/*
                   * Tiga kontrol saja: nyalakan, dan hapus. Tombol "Ubah" yang
                   * dulu ada di sini sudah dibuang atas permintaan user - baris
                   * ini dimaksudkan untuk MEMILIH pekerja, bukan menyuntingnya.
                   *
                   * Yang ikut hilang bersamanya: `bukaSunting` dan modal editor.
                   * Membiarkan keduanya terpasang berarti menyimpan jalur masuk
                   * yang tidak punya satu pun tombol - kode mati yang akan
                   * dihidupkan lagi oleh orang berikutnya karena terlihat
                   * lengkap, tanpa tahu bahwa bentuknya memang tidak diinginkan.
                   */}
                  <Toggle
                    label={tr('aktif')}
                    testid={`sub-custom-${x.id}-aktif`}
                    checked={x.aktif}
                    onChange={(v) => void setAktif(x.id, v)}
                  />
                  <button
                    className="btn btn-sm"
                    data-testid={`sub-custom-${x.id}-hapus`}
                    onClick={() => void hapus(x.id)}
                  >
                    {tr('Hapus')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/*
       * `<SubagentCustomModal />` tidak dirender lagi.
       *
       * Ia menunggu `baru || sedangDisunting`, dan kedua pemicunya sudah tidak
       * ada: tombol "+ Baru" dibuang, tombol "Ubah" juga. Membiarkan baris ini
       * terpasang hanya menyisakan kondisi yang selamanya `false` - dan itu
       * jenis kode mati yang paling menipu, karena ia terlihat seperti fitur
       * yang siap dipakai.
       */}
    </>
  );
}
