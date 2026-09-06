// SectionsExtensions.tsx — Settings → Extensions + Marketplace (fase 13).
//
// v1 MANIFEST-ONLY: kode JS ekstensi tidak dieksekusi (alasan keamanan ada di
// src-tauri/src/extensions.rs). Yang nyata di sini: daftar bawaan + ekstensi
// folder, toggle yang tersimpan ke settings, manifest yang dibaca dari disk,
// dan command manifest yang muncul di Command Palette.

import { useEffect } from 'react';
import { useExtensions } from '../../lib/extensionStore';
import { useT } from '../../lib/i18n';
import { Section, Toggle } from './SettingsControls';

/** Kartu marketplace — placeholder, tombol Install memang mati. */
const MARKET_ITEMS = [
  { id: 'prettier', name: 'Prettier', desc: 'Formatter opinionated untuk JS/TS/CSS/MD', logo: 'P' },
  { id: 'eslint', name: 'ESLint', desc: 'Lint JavaScript & TypeScript di editor', logo: 'E' },
  { id: 'gitlens', name: 'GitLens', desc: 'Blame inline, riwayat baris, dan graf commit', logo: 'G' },
  { id: 'python', name: 'Python', desc: 'IntelliSense, debug, dan env untuk Python', logo: 'Py' },
  { id: 'rust-analyzer', name: 'rust-analyzer', desc: 'Analisis Rust: hover, goto, inlay hints', logo: 'Rs' },
  { id: 'docker', name: 'Docker', desc: 'Kelola image, container, dan compose', logo: 'D' },
  { id: 'vim', name: 'Vim', desc: 'Emulasi modal editing di CodeMirror', logo: 'V' },
  { id: 'tailwind', name: 'Tailwind CSS', desc: 'Autocomplete kelas utility', logo: 'T' },
];

function Marketplace() {
  const setMarketOpen = useExtensions((s) => s.setMarketOpen);

  return (
    <div className="market" data-testid="market">
      <div className="market-head">
        <div>
          <h3 className="market-title">Zephyr Marketplace</h3>
          <p className="market-sub">
            Buka ActivityBar → Extensions (Ctrl+Shift+X) untuk marketplace Open VSX
            yang bisa dicari & dipasang langsung. Daftar di bawah ini pintasan ke
            ekstensi populer di registry tersebut.
          </p>
        </div>
        <button className="btn" data-testid="market-close" onClick={() => setMarketOpen(false)}>
          Tutup
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
                // Tutup Settings, buka panel Extensions (marketplace nyata).
                setMarketOpen(false);
                import('../../lib/commandRegistry').then(({ runCommand }) =>
                  runCommand('extensions.focus'),
                );
              }}
            >
              Buka
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}

export function ExtensionsSection() {
  const t = useT();
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
    <Section title={t('settings.extensions')}>
      <p className="set-note">
        Ekstensi v1 bersifat <strong>manifest-only</strong>: Zephyr membaca{' '}
        <code>package.json</code> dan mendaftarkan <code>contributes.commands</code> ke
        Command Palette, tetapi TIDAK menjalankan kode JS-nya. Menjalankannya di dalam
        webview berarti memberi ekstensi pihak ketiga akses ke seluruh jembatan IPC
        (fs, pty, git, API key) — itu tidak sebanding dengan manfaatnya.
      </p>

      <div className="ext-actions">
        <button className="btn" data-testid="ext-add" onClick={() => void addFromDialog()}>
          Tambah dari file…
        </button>
        <button className="btn" data-testid="ext-folder" onClick={() => void openFolder()}>
          Buka folder ekstensi
        </button>
        <button className="btn" data-testid="ext-refresh" onClick={() => void refresh()}>
          Muat ulang
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

      <h3 className="ext-h3">Bawaan Zephyr ({builtin.length})</h3>
      <div className="ext-list" data-testid="ext-list">
        {builtin.map((e) => (
          <div key={e.id} className="ext-card" data-ext={e.id}>
            <div className="ext-info">
              <span className="ext-name">
                {e.name}
                <span className="ext-badge">bawaan</span>
              </span>
              <span className="ext-desc">{e.description}</span>
              <span className="ext-meta">
                <code>{e.id}</code> · v{e.version}
              </span>
            </div>
            <Toggle
              label={e.name}
              testid={`ext-${e.id}`}
              checked={e.enabled}
              onChange={(v) => void toggle(e.id, v)}
            />
          </div>
        ))}
      </div>

      <h3 className="ext-h3">Terpasang dari folder ({external.length})</h3>
      {external.length === 0 && !loading && (
        <p className="set-note" data-testid="ext-empty">
          Belum ada. Taruh folder berisi <code>package.json</code> di folder ekstensi,
          atau pakai tombol “Tambah dari file…”.
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
              <span className="ext-name">{e.name}</span>
              <span className="ext-desc">{e.description || '(tanpa deskripsi)'}</span>
              <span className="ext-meta" title={e.path}>
                <code>{e.id}</code> · v{e.version || '-'} ·{' '}
                {e.mainBytes >= 0 ? `${e.main} ${Math.round(e.mainBytes / 1024)} KB` : `${e.main} (tidak ada)`}
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
                label={e.name}
                testid={`ext-${e.id}`}
                checked={e.enabled}
                onChange={(v) => void toggle(e.id, v)}
              />
              <button
                className="tp-op"
                data-testid={`ext-remove-${e.id}`}
                onClick={() => void remove(e.id)}
              >
                lepas
              </button>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}
