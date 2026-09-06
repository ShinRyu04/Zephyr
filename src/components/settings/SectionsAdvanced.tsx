// SectionsAdvanced.tsx — Shortcuts, Models, Agents (fase 08).

import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../lib/store';
import { useSettingsUi } from '../../lib/settingsStore';
import { useT } from '../../lib/i18n';
import {
  ACTIONS,
  ACTION_BY_ID,
  displayBinding,
  effectiveBinding,
  eventToBinding,
  findConflicts,
} from '../../lib/shortcuts';
import { PROVIDERS, ProviderLogo } from '../../lib/modelCatalog';
import { defaultStartCommand, useTerminal } from '../../lib/terminalStore';
import { NumberInput, Row, Section, Select, TextInput, Toggle } from './SettingsControls';

export function ShortcutsSection() {
  const t = useT();
  const custom = useStore((s) => s.settings.shortcuts);
  const apply = useStore((s) => s.applySettings);
  const capturing = useSettingsUi((s) => s.capturing);
  const setCapturing = useSettingsUi((s) => s.setCapturing);
  const conflict = useSettingsUi((s) => s.conflictWarning);
  const setConflict = useSettingsUi((s) => s.setConflictWarning);

  // Capture keydown saat satu baris sedang menunggu input.
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
      if (!binding) return; // hanya modifier

      const clash = findConflicts(capturing, binding, custom);
      if (clash.length > 0) {
        const names = clash.map((id) => ACTION_BY_ID.get(id)?.label ?? id).join(', ');
        setConflict(`"${binding}" sudah dipakai: ${names} — pilih kombinasi lain`);
        return; // TIDAK disimpan
      }
      void apply({ shortcuts: { ...custom, [capturing]: binding } });
      setCapturing(null);
    };
    // capture:true supaya tidak keduluan handler global App.tsx
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [capturing, custom, apply, setCapturing, setConflict]);

  // WAJIB: `capturing` mematikan SELURUH shortcut global (App.tsx sengaja
  // berhenti agar tombol tidak dieksekusi saat direkam). Kalau section ini
  // dilepas sementara masih merekam — mis. Settings ditutup setelah mencoba
  // kombinasi yang bentrok — flag itu nyangkut dan semua shortcut app mati.
  useEffect(() => () => setCapturing(null), [setCapturing]);

  const groups = ['File', 'Edit', 'View', 'Terminal', 'AI', 'Git'] as const;

  return (
    <Section title={t('settings.shortcuts')}>
      <p className="set-note">
        Klik kolom shortcut lalu tekan kombinasi. Escape = batal. Kombinasi yang
        sudah dipakai action lain ditolak, jadi tidak mungkin ada dua action
        dengan shortcut sama.
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
                    <td className="sc-label">{a.label}</td>
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
                        {isCapturing ? 'Tekan kombinasi…' : displayBinding(eff)}
                      </button>
                    </td>
                    <td className="sc-actions">
                      {isCustom && (
                        <button
                          type="button"
                          className="btn btn-sm"
                          data-testid={`sc-reset-${a.id}`}
                          onClick={() => {
                            // Kirim null, BUKAN objek tanpa key itu: settings.rs
                            // memakai deep-merge, jadi menghilangkan key dari
                            // objek yang dikirim tidak menghapus apa pun.
                            void apply({ shortcuts: { [a.id]: null } });
                          }}
                        >
                          {t('common.reset')}
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
  const t = useT();
  const models = useStore((s) => s.settings.models);
  const apply = useStore((s) => s.applySettings);
  const ui = useSettingsUi();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [reveal, setReveal] = useState<string | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    void ui.loadKeys();
  }, [ui]);

  return (
    <Section title={t('settings.models')}>
      <p className="set-note">
        API key disimpan Rust di <code>%APPDATA%\zephyr\secrets.json</code> dalam
        bentuk terenkripsi (kunci turunan dari mesin ini), TERPISAH dari
        settings.json. Frontend hanya menerima mask — key asli tidak pernah
        dikirim ke UI dan tidak pernah masuk log. Catatan jujur: enkripsi ini
        melindungi dari orang yang membaca file, bukan dari orang yang sudah
        bisa masuk akun Windows-mu.
      </p>

      <Row label={t('models.active')}>
        <Select
          label={t('models.active')}
          testid="models-active"
          value={models.activeProvider}
          onChange={(v) => void apply({ models: { activeProvider: v } })}
          options={PROVIDERS.map((p) => ({ value: p.id, label: p.label }))}
        />
      </Row>

      <div className="prov-list">
        {PROVIDERS.map((p) => {
          const cfg = models.providers[p.id] ?? {};
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
                  {has ? `${t('models.saved')}: ${preview}` : t('models.noKey')}
                </span>
              </div>

              <div className="prov-body">
                <label className="prov-field">
                  <span className="prov-flabel">{t('models.apiKey')}</span>
                  <span className="prov-keyrow">
                    <input
                      className="set-text is-mono"
                      type={reveal === p.id ? 'text' : 'password'}
                      placeholder={has ? '(tersimpan — isi untuk mengganti)' : p.envKey}
                      value={draft[p.id] ?? ''}
                      spellCheck={false}
                      aria-label={`${p.label} API key`}
                      data-testid={`prov-key-${p.id}`}
                      onChange={(e) => setDraft((d) => ({ ...d, [p.id]: e.target.value }))}
                    />
                    <button
                      type="button"
                      className="btn btn-sm"
                      aria-label={reveal === p.id ? t('common.hide') : t('common.show')}
                      onClick={() => setReveal(reveal === p.id ? null : p.id)}
                    >
                      {reveal === p.id ? t('common.hide') : t('common.show')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      data-testid={`prov-save-${p.id}`}
                      disabled={!(draft[p.id] ?? '').trim()}
                      onClick={() => {
                        void ui.saveKey(p.id, draft[p.id] ?? '');
                        setDraft((d) => ({ ...d, [p.id]: '' }));
                      }}
                    >
                      {t('common.save')}
                    </button>
                    {has && (
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        data-testid={`prov-del-${p.id}`}
                        onClick={() => void ui.saveKey(p.id, '')}
                      >
                        Hapus
                      </button>
                    )}
                  </span>
                </label>

                <label className="prov-field">
                  <span className="prov-flabel">{t('models.baseUrl')}</span>
                  <TextInput
                    label={`${p.label} base URL`}
                    testid={`prov-url-${p.id}`}
                    mono
                    placeholder={p.baseUrl || 'https://…'}
                    value={cfg.baseUrl ?? ''}
                    onChange={(v) =>
                      void apply({
                        models: { providers: { ...models.providers, [p.id]: { ...cfg, baseUrl: v } } },
                      })
                    }
                  />
                </label>

                <label className="prov-field">
                  <span className="prov-flabel">{t('models.model')}</span>
                  <Select
                    label={`${p.label} model`}
                    testid={`prov-model-${p.id}`}
                    value={cfg.model ?? p.models[0].id}
                    onChange={(v) =>
                      void apply({
                        models: { providers: { ...models.providers, [p.id]: { ...cfg, model: v } } },
                      })
                    }
                    options={p.models.map((m) => ({
                      value: m.id,
                      label: m.note ? `${m.label} — ${m.note}` : m.label,
                    }))}
                  />
                </label>

                <div className="prov-test">
                  <button
                    type="button"
                    className="btn btn-sm"
                    data-testid={`prov-test-${p.id}`}
                    disabled={ui.testing === p.id}
                    onClick={() => void ui.testConnection(p.id, cfg.baseUrl || undefined)}
                  >
                    {ui.testing === p.id ? 'Menguji…' : t('models.test')}
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
  const t = useT();
  const a = useStore((s) => s.settings.agents);
  const apply = useStore((s) => s.applySettings);
  const agents = useTerminal((s) => s.agents);
  const loadAgents = useTerminal((s) => s.loadAgents);

  return (
    <Section title={t('settings.agents')}>
      <Row label={t('agents.maxPanes')} hint="pane melebihi batas ditolak dengan toast">
        <NumberInput
          label={t('agents.maxPanes')}
          testid="agents-maxpanes"
          min={1}
          max={6}
          value={a.maxPanes}
          onChange={(v) => void apply({ agents: { maxPanes: v } })}
        />
      </Row>

      <Row label={t('agents.attachActiveFile')} hint="dipakai panel AI">
        <Toggle
          label={t('agents.attachActiveFile')}
          testid="agents-attach"
          checked={a.attachActiveFile}
          onChange={(v) => void apply({ agents: { attachActiveFile: v } })}
        />
      </Row>

      <Row label={t('agents.rescan')} hint={`${agents.length} CLI terdeteksi di PATH`}>
        <button className="btn" data-testid="agents-rescan" onClick={() => void loadAgents()}>
          {t('agents.rescan')}
        </button>
      </Row>

      {agents.length === 0 ? (
        <p className="set-note" data-testid="agents-empty">
          {t('agents.none')} — pasang salah satu (opencode, claude, codex, gemini,
          grok, gh copilot) lalu tekan {t('agents.rescan')}.
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
                  <span className="prov-flabel">{t('agents.startCommand')}</span>
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
                      // null = hapus override (deep-merge di settings.rs).
                      void apply({ agents: { startCommands: { [ag.id]: null } } });
                    }}
                  >
                    {t('common.reset')} ke default
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
