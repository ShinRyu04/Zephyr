import { useEffect } from 'react';
import { useExtensions } from '../../lib/extensionStore';
import { useT, useTf, tx } from '../../lib/i18n';
import { useStore } from '../../lib/store';
import { Section, Toggle } from './SettingsControls';

const MARKET_ITEMS = [
  { id: 'prettier', name: 'Prettier', desc: 'Opinionated formatter for JS/TS/CSS/MD', logo: 'P' },
  { id: 'eslint', name: 'ESLint', desc: 'Lint JavaScript & TypeScript in the editor', logo: 'E' },
  { id: 'gitlens', name: 'GitLens', desc: tx('Inline blame, line history, and commit graph'), logo: 'G' },
  { id: 'python', name: 'Python', desc: 'IntelliSense, debug, and env for Python', logo: 'Py' },
  { id: 'rust-analyzer', name: 'rust-analyzer', desc: 'Rust analysis: hover, goto, inlay hints', logo: 'Rs' },
  { id: 'docker', name: 'Docker', desc: 'Manage images, containers, and compose', logo: 'D' },
  { id: 'vim', name: 'Vim', desc: 'Modal editing emulation in CodeMirror', logo: 'V' },
  { id: 'tailwind', name: 'Tailwind CSS', desc: 'Utility class autocomplete', logo: 'T' },
];

function Marketplace() {
  const setMarketOpen = useExtensions((s) => s.setMarketOpen);

  return (
    <div className="market" data-testid="market">
      <div className="market-head">
        <div>
          <h3 className="market-title">Zephyr Marketplace</h3>
          <p className="market-sub">
            Open ActivityBar → Extensions (Ctrl+Shift+X) for the Open VSX marketplace,
            where you can search & install directly. The list below is a shortcut to
            popular extensions in that registry.
          </p>
        </div>
        <button className="btn" data-testid="market-close" onClick={() => setMarketOpen(false)}>
          Close
        </button>
      </div>

      <div className="market-grid" data-testid="market-grid">
        {MARKET_ITEMS.map((m) => (
          <article key={m.id} className="market-card" data-market-card={m.id}>
            <span className="market-logo" aria-hidden="true">
              {m.logo}
            </span>
            <div className="market-info">
              <span className="market-name">{m.name}</span>
              <span className="market-desc">{m.desc}</span>
            </div>
            <button
              className="btn btn-sm"
              data-testid={`market-install-${m.id}`}
              onClick={() => {

                setMarketOpen(false);
                import('../../lib/commandRegistry').then(({ runCommand }) =>
                  runCommand('extensions.focus'),
                );
              }}
            >
              Open
            </button>
          </article>
        ))}
      </div>
    </div>
  );
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
    </Section>
  );
}
