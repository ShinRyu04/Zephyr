import { useEffect, useState } from 'react';
import { openPath, openUrl } from '@tauri-apps/plugin-opener';
import { useStore } from '../../lib/store';
import { useT, useTf } from '../../lib/i18n';
import * as cmd from '../../lib/commands';
import type { Diagnostics, SshConfigInput, SshHost } from '../../lib/types';
import { Row, Section, TextInput, Toggle } from './SettingsControls';
import { SelfTestPanel, ExportPanel } from './SectionsDiag';
import UpdatePanel from './UpdatePanel';
import { useUpdater } from '../../lib/updaterStore';
import { useFocusTrap } from '../../lib/useFocusTrap';
import { GitHubLogo, WhatsAppLogo } from './BrandLogos';

import { useTerminal } from '../../lib/terminalStore';
export function ScmSection() {
  const tr = useT();
  const git = useStore((s) => s.settings.git);
  const apply = useStore((s) => s.applySettings);

  return (
    <Section title={tr('settings.scm')}>
      <p className="set-note">{tr('scm.identityNote')}</p>

      <Row label={tr('scm.userName')}>
        <TextInput
          label={tr('scm.userName')}
          testid="scm-name"
          value={git.userName ?? ''}
          placeholder="(uses git config)"
          onChange={(v) => void apply({ git: { userName: v } })}
        />
      </Row>

      <Row label={tr('scm.userEmail')}>
        <TextInput
          label={tr('scm.userEmail')}
          testid="scm-email"
          value={git.userEmail ?? ''}
          placeholder="(uses git config)"
          onChange={(v) => void apply({ git: { userEmail: v } })}
        />
      </Row>

      <Row label={tr('scm.defaultBranch')}>
        <TextInput
          label={tr('scm.defaultBranch')}
          testid="scm-branch"
          value={git.defaultBranch}
          onChange={(v) => void apply({ git: { defaultBranch: v } })}
        />
      </Row>

      <Row label={tr('scm.pullBeforePush')} hint={tr('scm.pullBeforePushHint')}>
        <Toggle
          label={tr('scm.pullBeforePush')}
          testid="scm-pull"
          checked={git.pullBeforePush}
          onChange={(v) => void apply({ git: { pullBeforePush: v } })}
        />
      </Row>
    </Section>
  );
}

export function SshSection() {
  const tr = useT();
  const tf = useTf();
  const setStatus = useStore((s) => s.setStatus);
  const [hosts, setHosts] = useState<SshHost[]>([]);
  const [muat, setMuat] = useState(false);
  const [form, setForm] = useState<SshConfigInput | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [hapusTarget, setHapusTarget] = useState<SshHost | null>(null);
  const hapusTrapRef = useFocusTrap<HTMLDivElement>({
    aktif: !!hapusTarget,
    onEscape: () => setHapusTarget(null),
  });

  const tarik = async () => {
    try {
      setHosts(await cmd.sshList());
    } catch (e) {
      setErr(cmd.asZephyrError(e).message);
    }
  };

  useEffect(() => {
    void (async () => {
      setMuat(true);
      await tarik();
      setMuat(false);
    })();
  }, []);

  const simpan = async () => {
    if (!form) return;
    setSibuk(true);
    setErr(null);
    try {
      if (form.id) await cmd.sshUpdate(form);
      else await cmd.sshAdd(form);
      setForm(null);
      await tarik();
      setStatus(form.id ? 'SSH host updated' : 'SSH host added');
    } catch (e) {
      setErr(cmd.asZephyrError(e).message);
    } finally {
      setSibuk(false);
    }
  };

  const hapus = async (h: SshHost) => {
    try {
      await cmd.sshDelete(h.id);
      await tarik();
      setStatus(`SSH host ${h.name} deleted`);
    } catch (e) {
      setErr(cmd.asZephyrError(e).message);
    } finally {
      setHapusTarget(null);
    }
  };

  const connect = async (h: SshHost) => {
    setSibuk(true);
    setErr(null);
    try {
      const paneId = await cmd.sshConnect(h.id);

      const st = useStore.getState();
      st.setActivity('terminal');
      if (!st.sidebarVisible) st.toggleSidebar();

      setStatus(`SSH: ${h.user}@${h.host} - pane ${paneId.slice(0, 12)}`);
      setForm(null);

      await useTerminal.getState().daftarkanPaneEksternal(paneId, 'ssh', `${h.user}@${h.host}`);
    } catch (e) {
      setErr(cmd.asZephyrError(e).message);
    } finally {
      setSibuk(false);
    }
  };

  const kosong: SshConfigInput = {
    name: '',
    host: '',
    port: 22,
    user: '',
    auth: 'key',
    keyPath: '',
    savePassword: false,
  };

  const valid =
    !!form &&
    form.name.trim() !== '' &&
    form.host.trim() !== '' &&
    form.user.trim() !== '' &&
    form.port >= 1 &&
    form.port <= 65535 &&
    (form.auth !== 'key' || (form.keyPath ?? '').trim() !== '');

  return (
    <Section title={tr('settings.ssh')}>
      <p className="set-note" data-testid="ssh-note">
        {tr('Manage SSH hosts then open the connection as a terminal pane. Key auth uses keyPath (the passphrase is typed directly in the pane); password auth is typed in the pane on connect - Zephyr does not store the password unless you choose to save it (encrypted).')}
      </p>

      {err && (
        <p className="xv-err" role="alert" data-testid="ssh-err">
          {err}
        </p>
      )}

      {!form ? (
        <div className="ssh-toolbar">
          <button
            className="btn btn-sm btn-primary"
            data-testid="ssh-form-open"
            onClick={() => {
              setErr(null);
              setForm({ ...kosong });
            }}
          >
            {tr('+ Add host')}
          </button>
          <button className="btn btn-sm" data-testid="ssh-refresh" onClick={() => void tarik()}>
            Reload
          </button>
        </div>
      ) : (
        <div className="ssh-form" data-testid="ssh-form">
          <Row label="Name">
            <TextInput
              label="Name"
              testid="ssh-f-name"
              value={form.name}
              placeholder="e.g. production server"
              onChange={(v) => setForm({ ...form, name: v })}
            />
          </Row>
          <Row label="Host">
            <TextInput
              label="Host"
              testid="ssh-f-host"
              mono
              value={form.host}
              placeholder="192.168.1.10 or host.example.com"
              onChange={(v) => setForm({ ...form, host: v })}
            />
          </Row>
          <Row label="Port">
            <TextInput
              label="Port"
              testid="ssh-f-port"
              mono
              value={String(form.port)}
              onChange={(v) => setForm({ ...form, port: Number(v) || 0 })}
            />
          </Row>
          <Row label="User">
            <TextInput
              label="User"
              testid="ssh-f-user"
              mono
              value={form.user}
              placeholder="root"
              onChange={(v) => setForm({ ...form, user: v })}
            />
          </Row>
          <Row label="Auth">
            <span className="ssh-auth">
              <label className="set-row-inline">
                <input
                  type="radio"
                  data-testid="ssh-f-auth-key"
                  checked={form.auth === 'key'}
                  onChange={() => setForm({ ...form, auth: 'key' })}
                />
                Key (key)
              </label>
              <label className="set-row-inline">
                <input
                  type="radio"
                  data-testid="ssh-f-auth-password"
                  checked={form.auth === 'password'}
                  onChange={() => setForm({ ...form, auth: 'password' })}
                />
                Password
              </label>
            </span>
          </Row>
          {form.auth === 'key' && (
            <Row label={tr('Key path')} hint={tr('passphrase is typed on connect')}>
              <TextInput
                label="KeyPath"
                testid="ssh-f-keypath"
                mono
                value={form.keyPath ?? ''}
                placeholder="C:/Users/…/.ssh/id_ed25519"
                onChange={(v) => setForm({ ...form, keyPath: v })}
              />
            </Row>
          )}
          <Row label={tr('Save password')} hint="encrypted (XOR+BLAKE3) in ssh.json">
            <Toggle
              label={tr('Save password')}
              testid="ssh-f-savepw"
              checked={form.savePassword ?? false}
              onChange={(v) => setForm({ ...form, savePassword: v })}
            />
          </Row>

          <div className="ssh-form-actions">
            <button
              className="btn btn-sm btn-primary"
              data-testid="ssh-f-save"
              disabled={!valid || sibuk}
              onClick={() => void simpan()}
            >
              {form.id ? tr('Save changes') : tr('Add host')}
            </button>
            <button
              className="btn btn-sm"
              data-testid="ssh-f-cancel"
              onClick={() => {
                setForm(null);
                setErr(null);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {muat && hosts.length === 0 && <p className="set-note">Loading…</p>}
      {!muat && hosts.length === 0 && !form && (
        <p className="set-note" data-testid="ssh-kosong">
          No hosts yet. Click "+ Add host" to start.
        </p>
      )}

      {hosts.length > 0 && (
        <ul className="ssh-list" data-testid="ssh-list">
          {hosts.map((h) => (
            <li key={h.id} className="ssh-item" data-ssh-host={h.id}>
              <span className="ssh-item-info">
                <span className="ssh-item-name" data-testid={`ssh-name-${h.id}`}>
                  {h.name}
                </span>
                <span className="ssh-item-meta">
                  {h.user}@{h.host}:{h.port} · {h.auth}
                  {h.hasPassword ? ' · pw saved' : ''}
                </span>
              </span>
              <span className="ssh-item-actions">
                <button
                  className="btn btn-xs"
                  data-testid={`ssh-connect-${h.id}`}
                  disabled={sibuk}
                  onClick={() => void connect(h)}
                >
                  Connect
                </button>
                <button
                  className="btn btn-xs"
                  data-testid={`ssh-edit-${h.id}`}
                  onClick={() => {
                    setErr(null);
                    setForm({
                      id: h.id,
                      name: h.name,
                      host: h.host,
                      port: h.port,
                      user: h.user,
                      auth: h.auth,
                      keyPath: h.keyPath,
                      savePassword: h.savePassword,
                    });
                  }}
                >
                  {tr('Edit')}
                </button>
                <button
                  className="btn btn-xs"
                  data-testid={`ssh-del-${h.id}`}
                  onClick={() => setHapusTarget(h)}
                >
                  {tr('Delete')}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {hapusTarget && (
        <div
          className="modal-backdrop"
          role="presentation"
          data-testid="ssh-del-confirm"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setHapusTarget(null);
          }}
        >
          <div
            className="modal"
            ref={hapusTrapRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="ssh-del-title"
          >
            <h2 className="modal-title" id="ssh-del-title" data-testid="ssh-del-title">
              {tf('Delete SSH host "{name}"?', { name: hapusTarget.name })}
            </h2>
            <p className="modal-body" data-testid="ssh-del-body">
              {tr('This host connection will be removed from the list.')}
            </p>
            <div className="modal-actions">
              <button
                className="btn btn-danger"
                data-testid="ssh-del-ok"
                onClick={() => void hapus(hapusTarget)}
              >
                {tr('Delete')}
              </button>
              <button
                className="btn"
                data-testid="ssh-del-cancel"
                onClick={() => setHapusTarget(null)}
              >
                {tr('Cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </Section>
  );
}

export function AboutSection() {
  const tr = useT();
  const info = useStore((s) => s.appInfo);
  const dataDir = info?.dataDir ?? '';

  const [salin, setSalin] = useState(false);

  const baris: Array<[string, string]> = [
    ['Version', `${info?.version ?? '-'} · ${info?.profile ?? '-'}`],
    ['Architecture', info?.arch ?? '-'],
    ['Identifier', info?.identifier ?? '-'],
    ['License', 'MIT'],
  ];

  const infoSistem = [
    `Zephyr ${info?.version ?? '?'} (${info?.profile ?? '?'})`,
    `Architecture: ${info?.arch ?? '?'}`,
    `WebView2: ${info?.webview || 'not detected'}`,
    `Identifier: ${info?.identifier ?? '?'}`,
    `Data folder: ${dataDir || '?'}`,
    `Portable: ${info?.portable ? 'yes' : 'no'}`,
  ].join('\n');

  return (
    <Section title={tr('settings.about')}>
      {/* Identity card: logo + name + tagline + version. */}
      <div className="about-kartu" data-testid="about-kartu">
        <img className="about-logo" src="/zephyr.svg" alt="" width={40} height={40} />
        <div className="about-id">
          <span className="about-name">Zephyr</span>
          <span className="about-tag">{tr('lightweight code editor, built from scratch')}</span>
          <span className="about-ver" data-testid="about-ver">
            v{info?.version ?? '?'}
          </span>
        </div>
      </div>

      {/* Kartu detail: label kiri, nilai kanan - 4 baris saja. */}
      <div className="about-kartu about-kartu-detail">
        <div className="about-judul">{tr('Build details')}</div>
        <div className="about-sub">
          {tr('Platform, identifier, license, and source repository.')}
        </div>
        <table className="about-table" data-testid="about-table">
          <tbody>
            {baris.map(([k, v]) => (
              <tr key={k}>
                <td className="about-k">{tr(k)}</td>
                <td className="about-v">
                  <code>{v}</code>
                </td>
              </tr>
            ))}
            <tr>
              <td className="about-k">{tr('Source code')}</td>
              <td className="about-v">
                <button
                  className="about-tautan-inline"
                  data-testid="about-source"
                  onClick={() => void openUrl('https://github.com/ShinRyu04/Zephyr').catch(() => {})}
                >
                  ShinRyu04/Zephyr
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="about-catatan">
        {tr('Auto-update checks GitHub Releases periodically.')}
      </p>

      {/* Baris tautan utama - yang paling sering dipakai user. */}
      <div className="about-links">
        <button
          className="btn btn-primary"
          data-testid="about-update"
          onClick={() => void useUpdater.getState().check()}
        >
          ⟳ {tr('Check for updates')}
        </button>
        <button
          className="btn btn-brand"
          data-testid="about-github"
          onClick={() => void openUrl('https://github.com/ShinRyu04/Zephyr').catch(() => {})}
        >
          <GitHubLogo /> {tr('View on GitHub')}
        </button>
        <button
          className="btn btn-brand"
          data-testid="about-issue"
          onClick={() =>
            void openUrl('https://github.com/ShinRyu04/Zephyr/issues/new').catch(() => {})
          }
        >
          <GitHubLogo /> {tr('Report an issue')}
        </button>
        <button
          className="btn btn-brand btn-brand-wa"
          data-testid="about-wa"
          onClick={() => void openUrl('https://chat.whatsapp.com/LNp12sKUWFFGH1RRSyHQkb').catch(() => {})}
        >
          <WhatsAppLogo /> {tr('WhatsApp group')}
        </button>
        <button
          className="btn btn-donate"
          data-testid="about-donate"
          onClick={() => useStore.getState().setDonateOpen(true)}
        >
          <span aria-hidden="true" className="about-donate-emoji">
            ☕
          </span>{' '}
          {tr('Support Zephyr')}
        </button>
      </div>

      {/* Utilitas langka - tetap ada, tapi tidak lagi jadi tombol besar. */}
      <div className="about-util">
        <button
          className="about-util-btn"
          data-testid="about-copy"
          onClick={() => {
            void navigator.clipboard?.writeText(infoSistem).catch(() => {});
            setSalin(true);
            window.setTimeout(() => setSalin(false), 1600);
          }}
        >
          {salin ? tr('Copied') : tr('Copy system info')}
        </button>
        <button
          className="about-util-btn"
          data-testid="about-logs"
          disabled={!dataDir}
          onClick={() => void openPath(`${dataDir}\\logs`).catch(() => {})}
        >
          {tr('Open log folder')}
        </button>
        <button
          className="about-util-btn"
          data-testid="about-data"
          disabled={!dataDir}
          onClick={() => void openPath(dataDir).catch(() => {})}
        >
          {tr('Open data folder')}
        </button>
        <button
          className="about-util-btn"
          data-testid="about-releases"
          onClick={() => void openUrl('https://github.com/ShinRyu04/Zephyr/releases').catch(() => {})}
        >
          {tr('Releases page')}
        </button>
      </div>

      <UpdatePanel versiSekarang={info?.version ?? '0.0.0'} />
      <DiagnosticsPanel />
    </Section>
  );
}

const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`;
const secs = (ms: number) => {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
};

function DiagnosticsPanel() {
  const tr = useT();
  const [d, setD] = useState<Diagnostics | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [auto, setAuto] = useState(false);

  const load = () => {
    cmd.getDiagnostics()
      .then((x) => {
        setD(x);
        setErr(null);
      })
      .catch((e) => setErr(cmd.asZephyrError(e).message));
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!auto) return;
    const t = window.setInterval(load, 3000);
    return () => window.clearInterval(t);
  }, [auto]);

  const rows: Array<[string, string]> = d
    ? [
        [tr('OS'), d.os || '-'],
        [tr('Logical CPUs'), d.cpuCount > 0 ? String(d.cpuCount) : '-'],
        [tr('Host RAM'), d.hostRamBytes > 0 ? mb(d.hostRamBytes) : '-'],
        [tr('Uptime'), secs(d.uptimeMs)],
        [tr('Total RAM (with WebView2)'), mb(d.ramTotalBytes)],
        [tr('Core process RAM'), mb(d.ramBytes)],
        [tr('Peak total RAM'), mb(d.ramPeakBytes)],
        [tr('Live terminal panes'), String(d.ptyCount)],
        ['MCP', d.mcpPort > 0 ? `listening :${d.mcpPort}` : tr('off')],
        [tr('Build'), d.debug ? 'debug' : 'release'],
        [tr('Log file'), d.logFile || '-'],
        [tr('Log size'), `${(d.logBytes / 1024).toFixed(1)} KB (rotate 2 MB)`],
        [tr('Panic this session'), d.panicked ? d.lastPanic || tr('yes') : tr('none')],
      ]
    : [];

  return (
    <div className="diag" data-testid="diag-panel">
      <div className="diag-head">
        <span className="diag-title">Diagnostics</span>
        <button className="btn btn-sm" data-testid="diag-refresh" onClick={load}>
          {tr('Reload')}
        </button>
        <label className="diag-auto">
          <input
            type="checkbox"
            data-testid="diag-auto"
            checked={auto}
            onChange={(e) => setAuto(e.target.checked)}
          />
          <span>{tr('every 3s')}</span>
        </label>
      </div>

      {err && (
        <p className="set-note diag-err" data-testid="diag-error">
          {err}
        </p>
      )}

      <table className="about-table" data-testid="diag-table">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <td className="about-k">{k}</td>
              <td className="about-v">
                <code>{v}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* fase 16.5: status per domain - nilainya dari Rust, bukan tebakan UI. */}
      {d && d.domains.length > 0 && (
        <table className="about-table diag-domains" data-testid="diag-domains">
          <tbody>
            {d.domains.map((x) => (
              <tr key={x.id} data-domain={x.id} data-level={x.level}>
                <td className="about-k">{x.id}</td>
                <td className="about-v">
                  <span className={`diag-dot is-${x.level}`} aria-hidden="true" />
                  <span className="diag-level">{x.level}</span>
                  <code>{x.detail}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <SelfTestPanel />
      <ExportPanel d={d} />

      {d && d.marks.length > 0 && (
        <>
          <p className="set-note">{tr('Timestamps (ms since process start):')}</p>
          <ul className="diag-marks" data-testid="diag-marks">
            {d.marks.slice(-12).map((m, i) => (
              <li key={`${m.name}-${m.atMs}-${i}`} data-mark={m.name}>
                <code>{m.name}</code>
                <span>
                  @{m.atMs}ms{m.durMs !== null ? ` (${m.durMs}ms)` : ''}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {d && Object.keys(d.counters).length > 0 && (
        <p className="set-note" data-testid="diag-counters">
          {tr('Operations since start:')}{' '}
          {Object.entries(d.counters)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}=${v}`)
            .join(', ')}
        </p>
      )}

      {d?.debug && (
        <div className="diag-danger">
          <button
            className="btn btn-sm"
            data-testid="diag-panic"
            title={tr('Debug build only: triggers a panic in Rust to test the panic hook + crash dialog')}
            onClick={() => void cmd.debugPanic().catch(() => {})}
          >
            {tr('Test panic (debug)')}
          </button>
          <span className="set-note">
            {tr('Writes the stack to the log then shows the crash dialog. This button does not exist in release builds.')}
          </span>
        </div>
      )}
    </div>
  );
}
