import { useEffect, useState } from 'react';
import { useExtensions } from '../../lib/extensionStore';
import { useT, useTf } from '../../lib/i18n';
import { useStore } from '../../lib/store';
import { Section, Toggle } from './SettingsControls';
import MarketplacePage from './Marketplace';

/*
 * The old eight-item grid is GONE.
 *
 * It listed extensions Zephyr cannot install from here (the action was "Open",
 * which navigated to Open VSX) and had no notion of what is already installed.
 * `Marketplace.tsx` is the replacement: three tabs over the three real sources
 * (plugins, skills, MCP), each card reading live store data.
 */
function Marketplace() {
  return <MarketplacePage />;
}

function IzinRuntime() {
  const tr = useT();

  const trust = useStore((s) => s.settings.extensions.trust) ?? {};
  const list = useExtensions((s) => s.list);
  const applySettings = useStore((s) => s.applySettings);
  const nama = (id: string) => list.find((e) => e.id === id)?.name ?? id;

  const entries = Object.entries(trust).filter(([, t]) => t && Object.keys(t.runtimes ?? {}).length > 0);
  if (entries.length === 0) {
    return (
      <>
        <h3 className="ext-h3">External runtime permissions (0)</h3>
        <p className="set-note" data-testid="ext-trust-empty">
          {tr('None yet. Extensions that need an external runtime (Python, Java, Node, etc.) will ask for permission through a dialog the first time they call')}{' '}
          <code>zephyr.exec()</code>{' '}
          {tr('- execution always happens on the Rust side from a binary you approve, and can be revoked here.')}
        </p>
      </>
    );
  }

  return (
    <>
      <h3 className="ext-h3" data-testid="ext-trust-head">
        External runtime permissions ({entries.length})
      </h3>
      <div className="ext-list" data-testid="ext-trust-list">
        {entries.map(([id, t]) => (
          <div key={id} className="ext-card" data-ext-trust={id}>
            <div className="ext-info">
              <span className="ext-name">
                {nama(id)} <code>{id}</code>
              </span>
              {Object.entries(t.runtimes ?? {}).map(([rt, bin]) => (
                <span key={rt} className="ext-meta" title={bin}>
                  <code>{rt}</code> → {bin}
                </span>
              ))}
              <span className="ext-meta">granted {t.grantedAt ? new Date(t.grantedAt).toLocaleDateString('id-ID') : '-'}</span>
            </div>
            <button
              className="tp-op"
              data-testid={`ext-revoke-${id}`}
              onClick={() => void applySettings({ extensions: { trust: { [id]: null } } })}
            >
              revoke permission
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

export function ExtensionsSection() {
  const tr = useT();
  const tf = useTf();
  const list = useExtensions((s) => s.list);
  const loading = useExtensions((s) => s.loading);
  const extError = useExtensions((s) => s.extError);
  const extInfo = useExtensions((s) => s.extInfo);
  const marketOpen = useExtensions((s) => s.marketOpen);
  const refresh = useExtensions((s) => s.refresh);
  const toggle = useExtensions((s) => s.toggle);
  const addFromDialog = useExtensions((s) => s.addFromDialog);
  const remove = useExtensions((s) => s.remove);
  const openFolder = useExtensions((s) => s.openFolder);
  const setMarketOpen = useExtensions((s) => s.setMarketOpen);

  useEffect(() => {
    if (list.length === 0) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const builtin = list.filter((e) => e.builtin);
  const external = list.filter((e) => !e.builtin);

  return (
    <Section title={tr('settings.extensions')}>
      <p className="set-note">
        {tr('Extension JS code runs in')} <strong>{tr('an isolated Web Worker sandbox')}</strong>{' '}
        {tr('(without')} <code>window</code>{tr('/fs/IPC), so commands from extensions can run without giving system access. Extensions that need')}{' '}
        <strong>{tr('an external runtime')}</strong>{' '}
        {tr('(Python, Java, Node, etc.) can ask for permission through')} <code>zephyr.exec()</code>{' '}
        {tr('- execution always happens on the Rust side from a binary you approve, and the permission can be revoked below.')}
      </p>

      <div className="ext-actions">
        <button className="btn" data-testid="ext-add" onClick={() => void addFromDialog()}>
          {tr('Add from file…')}
        </button>
        <button className="btn" data-testid="ext-folder" onClick={() => void openFolder()}>
          {tr('Open extensions folder')}
        </button>
        <button className="btn" data-testid="ext-refresh" onClick={() => void refresh()}>
          {tr('Reload')}
        </button>
        <button
          className="btn"
          data-testid="ext-market"
          onClick={() => setMarketOpen(!marketOpen)}
        >
          Marketplace
        </button>
      </div>

      {extError && (
        <p className="set-error" data-testid="ext-error" role="alert">
          {extError}
        </p>
      )}
      {extInfo && !extError && (
        <p className="set-ok" data-testid="ext-info" role="status">
          {extInfo}
        </p>
      )}

      {marketOpen && <Marketplace />}

      <h3 className="ext-h3">Built into Zephyr ({builtin.length})</h3>

      <IzinRuntime />
      <div className="ext-list" data-testid="ext-list">
        {builtin.map((e) => (
          <div key={e.id} className="ext-card" data-ext={e.id}>
            <div className="ext-info">
              <span className="ext-name">
                {tr(e.name)}
                <span className="ext-badge">{tr('built-in')}</span>
              </span>
              <span className="ext-desc">{tr(e.description)}</span>
              <span className="ext-meta">
                <code>{e.id}</code> · v{e.version}
              </span>
            </div>
            <Toggle
              label={tr(e.name)}
              testid={`ext-${e.id}`}
              checked={e.enabled}
              onChange={(v) => void toggle(e.id, v)}
            />
          </div>
        ))}
      </div>

        <h3 className="ext-h3">{tf('Installed from folder ({n})', { n: external.length })}</h3>
      {external.length === 0 && !loading && (
        <p className="set-note" data-testid="ext-empty">
          {tr('None yet. Put a folder containing')} <code>package.json</code>{' '}
          {tr('in the extensions folder, or use the "Add from file…" button.')}
        </p>
      )}
      <div className="ext-list" data-testid="ext-list-external">
        {external.map((e) => (
          <div
            key={e.id}
            className={`ext-card${e.error ? ' is-broken' : ''}`}
            data-ext={e.id}
            data-ext-error={e.error ? '1' : '0'}
          >
            <div className="ext-info">
              <span className="ext-name">{tr(e.name)}</span>
              <span className="ext-desc">{e.description ? tr(e.description) : tr('(no description)')}</span>
              <span className="ext-meta" title={e.path}>
                <code>{e.id}</code> · v{e.version || '-'} ·{' '}
                {e.mainBytes >= 0 ? `${e.main} ${Math.round(e.mainBytes / 1024)} KB` : `${e.main} (missing)`}
              </span>
              {e.commands.length > 0 && (
                <span className="ext-cmds" data-testid={`ext-cmds-${e.id}`}>
                  {e.commands.map((c) => (
                    <code key={c.id} className="ext-cmd">
                      {c.title}
                    </code>
                  ))}
                </span>
              )}
              {e.error && (
                <span className="ext-err" data-testid={`ext-err-${e.id}`}>
                  {e.error}
                </span>
              )}
            </div>
            <div className="ext-ctl">
              <Toggle
                label={tr(e.name)}
                testid={`ext-${e.id}`}
                checked={e.enabled}
                onChange={(v) => void toggle(e.id, v)}
              />
              <button
                className="tp-op"
                data-testid={`ext-remove-${e.id}`}
                onClick={() => void remove(e.id)}
              >
                {tr('remove')}
              </button>
            </div>
          </div>
        ))}
      </div>
      <RegistrySources />
    </Section>
  );
}

/* ── Registry sources ──────────────────────────────────────────────────── */

/**
 * The list of indexes the marketplace reads.
 *
 * Was a single URL in `settings.json` with no UI at all — so the only way to add
 * a private index was to hand-edit the file, and doing so REMOVED the public one,
 * because the field was a replacement rather than an addition.
 *
 * The bundled index is always read and is listed first as a fact rather than a
 * row: it cannot be removed, and offering a delete button for something that
 * cannot be deleted is a control that lies.
 */
function RegistrySources() {
  const tr = useT();
  const urls = useStore((s) => s.settings.extensions?.registryUrls ?? []) as string[];
  const apply = useStore((s) => s.applySettings);
  const [baru, setBaru] = useState('');

  const https = baru.trim().startsWith('https://');
  const kosong = baru.trim() === '';
  const kembar = urls.includes(baru.trim());

  const ubah = (v: string[]) => void apply({ extensions: { registryUrls: v } } as never);

  return (
    <div className="ext-registry" data-testid="ext-registry">
      <h3 className="set-note">{tr('settings.registrySources')}</h3>
      <p className="set-hint">
        {tr('Extra indexes the marketplace reads, on top of the bundled one. https:// only — an index is installed from, so an unencrypted one can be rewritten in transit.')}
      </p>

      <div className="ext-reg-row" data-testid="ext-reg-bundled">
        <code className="ext-reg-url">bundled</code>
        <span className="set-hint">{tr('Always read, cannot be removed.')}</span>
      </div>

      {urls.map((u, i) => (
        <div className="ext-reg-row" key={u} data-testid={`ext-reg-${i}`}>
          <code className="ext-reg-url" title={u}>
            {u}
          </code>
          <button
            className="btn btn-sm btn-danger"
            data-testid={`ext-reg-del-${i}`}
            aria-label={`${tr('remove')} ${u}`}
            onClick={() => ubah(urls.filter((x) => x !== u))}
          >
            ✕
          </button>
        </div>
      ))}

      <div className="ext-reg-row">
        <input
          className="input input-sm"
          data-testid="ext-reg-input"
          placeholder="https://example.com/index.json"
          value={baru}
          onChange={(e) => setBaru(e.target.value)}
        />
        <button
          className="btn btn-sm"
          data-testid="ext-reg-add"
          disabled={kosong || !https || kembar}
          onClick={() => {
            ubah([...urls, baru.trim()]);
            setBaru('');
          }}
        >
          {tr('Add')}
        </button>
      </div>

      {/*
        * The reason a URL is refused, shown at the field rather than as a toast.
        * A disabled button with no explanation is the most common way a form
        * wastes a reader's time — they retype the same thing and it stays dead.
        */}
      {!kosong && !https && (
        <p className="set-hint is-bahaya" data-testid="ext-reg-bad">
          {tr('Must start with https://')}
        </p>
      )}
      {kembar && (
        <p className="set-hint is-bahaya" data-testid="ext-reg-dup">
          {tr('That index is already in the list.')}
        </p>
      )}
    </div>
  );
}
