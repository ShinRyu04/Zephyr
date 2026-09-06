// SectionsMisc.tsx — Extensions, Source Control, SSH, Tentang (fase 08).
//
// MCP tidak di sini: panelnya `McpPanel.tsx` (fase 11). Switch server, token,
// dan tabel "Dikontrol oleh" cukup ada di SATU tempat — pelajaran fase 08,
// kontrol yang dibuat dua kali muncul dobel di layar.

import { useEffect, useState } from 'react';
import { openPath, openUrl } from '@tauri-apps/plugin-opener';
import { useStore } from '../../lib/store';
import { useT } from '../../lib/i18n';
import * as cmd from '../../lib/commands';
import type { Diagnostics, SshConfigInput, SshHost } from '../../lib/types';
import { Row, Section, TextInput, Toggle } from './SettingsControls';
import { SelfTestPanel, ExportPanel } from './SectionsDiag';
import UpdatePanel from './UpdatePanel';

export function ScmSection() {
  const t = useT();
  const git = useStore((s) => s.settings.git);
  const apply = useStore((s) => s.applySettings);

  return (
    <Section title={t('settings.scm')}>
      <p className="set-note">
        Identitas ini dipakai saat commit dari Zephyr (fase 10). Dibiarkan kosong
        = pakai konfigurasi <code>git config</code> yang sudah ada di mesin/repo.
      </p>

      <Row label={t('scm.userName')}>
        <TextInput
          label={t('scm.userName')}
          testid="scm-name"
          value={git.userName ?? ''}
          placeholder="(pakai git config)"
          onChange={(v) => void apply({ git: { userName: v } })}
        />
      </Row>

      <Row label={t('scm.userEmail')}>
        <TextInput
          label={t('scm.userEmail')}
          testid="scm-email"
          value={git.userEmail ?? ''}
          placeholder="(pakai git config)"
          onChange={(v) => void apply({ git: { userEmail: v } })}
        />
      </Row>

      <Row label={t('scm.defaultBranch')}>
        <TextInput
          label={t('scm.defaultBranch')}
          testid="scm-branch"
          value={git.defaultBranch}
          onChange={(v) => void apply({ git: { defaultBranch: v } })}
        />
      </Row>

      <Row label={t('scm.pullBeforePush')} hint="mengurangi push yang ditolak">
        <Toggle
          label={t('scm.pullBeforePush')}
          testid="scm-pull"
          checked={git.pullBeforePush}
          onChange={(v) => void apply({ git: { pullBeforePush: v } })}
        />
      </Row>
    </Section>
  );
}

export function SshSection() {
  const t = useT();
  const setStatus = useStore((s) => s.setStatus);
  const [hosts, setHosts] = useState<SshHost[]>([]);
  const [muat, setMuat] = useState(false);
  const [form, setForm] = useState<SshConfigInput | null>(null); // null = form tertutup
  const [err, setErr] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);

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
      setStatus(form.id ? 'Host SSH diperbarui' : 'Host SSH ditambahkan');
    } catch (e) {
      setErr(cmd.asZephyrError(e).message);
    } finally {
      setSibuk(false);
    }
  };

  const hapus = async (h: SshHost) => {
    if (!window.confirm(`Hapus host SSH "${h.name}"?`)) return;
    try {
      await cmd.sshDelete(h.id);
      await tarik();
      setStatus(`Host SSH ${h.name} dihapus`);
    } catch (e) {
      setErr(cmd.asZephyrError(e).message);
    }
  };

  const connect = async (h: SshHost) => {
    setSibuk(true);
    setErr(null);
    try {
      const paneId = await cmd.sshConnect(h.id);
      // Buka panel terminal & tampilkan pane ssh.
      const st = useStore.getState();
      st.setActivity('terminal');
      if (!st.sidebarVisible) st.toggleSidebar();
      // Pane dikelola store terminal lewat event pty (id = paneId).
      setStatus(`SSH: ${h.user}@${h.host} — pane ${paneId.slice(0, 12)}`);
      setForm(null);
      // Beri tahu store terminal supaya pane diregistrasi.
      const ts = (await import('../../lib/terminalStore')).useTerminal.getState();
      await ts.daftarkanPaneEksternal(paneId, 'ssh', `${h.user}@${h.host}`);
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
    <Section title={t('settings.ssh')}>
      <p className="set-note" data-testid="ssh-note">
        Kelola host SSH lalu buka koneksinya sebagai pane terminal. Auth key pakai
        keyPath (passphrase diketik langsung di pane); auth password diketik di pane
        saat connect — Zephyr tidak menyimpan password kecuali kamu memilih simpan
        (terenkripsi).
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
            + Tambah host
          </button>
          <button className="btn btn-sm" data-testid="ssh-refresh" onClick={() => void tarik()}>
            Muat ulang
          </button>
        </div>
      ) : (
        <div className="ssh-form" data-testid="ssh-form">
          <Row label="Nama">
            <TextInput
              label="Nama"
              testid="ssh-f-name"
              value={form.name}
              placeholder="mis. server produksi"
              onChange={(v) => setForm({ ...form, name: v })}
            />
          </Row>
          <Row label="Host">
            <TextInput
              label="Host"
              testid="ssh-f-host"
              mono
              value={form.host}
              placeholder="192.168.1.10 atau host.example.com"
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
                Kunci (key)
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
            <Row label="Path kunci" hint="passphrase diketik saat connect">
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
          <Row label="Simpan password" hint="dienkripsi (XOR+BLAKE3) di ssh.json">
            <Toggle
              label="Simpan password"
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
              {form.id ? 'Simpan perubahan' : 'Tambah host'}
            </button>
            <button
              className="btn btn-sm"
              data-testid="ssh-f-cancel"
              onClick={() => {
                setForm(null);
                setErr(null);
              }}
            >
              Batal
            </button>
          </div>
        </div>
      )}

      {muat && hosts.length === 0 && <p className="set-note">Memuat…</p>}
      {!muat && hosts.length === 0 && !form && (
        <p className="set-note" data-testid="ssh-kosong">
          Belum ada host. Klik "+ Tambah host" untuk mulai.
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
                  {h.hasPassword ? ' · pw tersimpan' : ''}
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
                  Edit
                </button>
                <button
                  className="btn btn-xs"
                  data-testid={`ssh-del-${h.id}`}
                  onClick={() => void hapus(h)}
                >
                  Hapus
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

export function AboutSection() {
  const t = useT();
  const info = useStore((s) => s.appInfo);
  const dataDir = info?.dataDir ?? '';

  const rows: Array<[string, string]> = [
    ['Versi', info?.version ?? '-'],
    ['Identifier', info?.identifier ?? '-'],
    ['Folder data', dataDir || '-'],
    ['Lisensi', 'MIT'],
    ['Engine', 'Tauri 2 + WebView2'],
    ['Frontend', 'React 18 + TypeScript + Vite 6'],
    ['Editor', 'CodeMirror 6'],
    ['Terminal', '@xterm/xterm 5.5 + portable-pty (ConPTY)'],
    ['Automation', 'MCP JSON-RPC di 127.0.0.1:9222 (fase 11)'],
  ];
  return (
    <Section title={t('settings.about')}>
      <div className="about-hero">
        <span className="about-name">Zephyr</span>
        <span className="about-tag">code editor ringan, dibangun dari nol</span>
      </div>
      <p className="set-note">Dibuat oleh ShinRyu04 — dibangun bersama Zephyr AI.</p>

      <table className="about-table" data-testid="about-table">
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

      <div className="about-links">
        <button
          className="btn"
          data-testid="about-logs"
          disabled={!dataDir}
          onClick={() => void openPath(`${dataDir}\\logs`).catch(() => {})}
        >
          Buka folder log
        </button>
        <button
          className="btn"
          data-testid="about-data"
          disabled={!dataDir}
          onClick={() => void openPath(dataDir).catch(() => {})}
        >
          Buka folder data
        </button>
        <button
          className="btn"
          data-testid="about-releases"
          onClick={() => void openUrl('https://github.com/ShinRyu04/Zephyr/releases').catch(() => {})}
        >
          Halaman rilis
        </button>
      </div>

      <p className="set-note">
        Fase yang sudah jalan: 01–06 dan 08–17. Fase 07 (SSH) ditunda menunggu
        host. Angka di Diagnostics di bawah diukur langsung dari proses ini —
        bukan perkiraan.
      </p>

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
  return h > 0 ? `${h}j ${m}m` : m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
};

/** About → Diagnostics (fase 14.5). Semua nilai dari command `get_diagnostics`;
 *  tidak ada yang dihitung ulang di frontend supaya tidak ada dua sumber angka. */
function DiagnosticsPanel() {
  const [d, setD] = useState<Diagnostics | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [auto, setAuto] = useState(false);

  const load = () => {
    cmd.getDiagnostics()
      .then((x) => {
        setD(x);
        setErr(null);
      })
      .catch((e) => setErr(String(e)));
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
        ['OS', d.os || '-'],
        ['CPU logis', d.cpuCount > 0 ? String(d.cpuCount) : '-'],
        ['RAM mesin', d.hostRamBytes > 0 ? mb(d.hostRamBytes) : '-'],
        ['Uptime', secs(d.uptimeMs)],
        ['RAM total (dengan WebView2)', mb(d.ramTotalBytes)],
        ['RAM proses inti', mb(d.ramBytes)],
        ['RAM total puncak', mb(d.ramPeakBytes)],
        ['Pane terminal hidup', String(d.ptyCount)],
        ['MCP', d.mcpPort > 0 ? `listening :${d.mcpPort}` : 'mati'],
        ['Build', d.debug ? 'debug' : 'release'],
        ['File log', d.logFile || '-'],
        ['Ukuran log', `${(d.logBytes / 1024).toFixed(1)} KB (rotate 2 MB)`],
        ['Panic sesi ini', d.panicked ? d.lastPanic || 'ya' : 'tidak ada'],
      ]
    : [];

  return (
    <div className="diag" data-testid="diag-panel">
      <div className="diag-head">
        <span className="diag-title">Diagnostics</span>
        <button className="btn btn-sm" data-testid="diag-refresh" onClick={load}>
          Muat ulang
        </button>
        <label className="diag-auto">
          <input
            type="checkbox"
            data-testid="diag-auto"
            checked={auto}
            onChange={(e) => setAuto(e.target.checked)}
          />
          <span>tiap 3s</span>
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

      {/* fase 16.5: status per domain — nilainya dari Rust, bukan tebakan UI. */}
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
          <p className="set-note">Penanda waktu (ms sejak proses mulai):</p>
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
          Operasi sejak start:{' '}
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
            title="Hanya build debug: memicu panic di Rust untuk menguji panic hook + dialog crash"
            onClick={() => void cmd.debugPanic().catch(() => {})}
          >
            Uji panic (debug)
          </button>
          <span className="set-note">
            Menulis stack ke log lalu memunculkan dialog crash. Tombol ini tidak
            ada di build release.
          </span>
        </div>
      )}
    </div>
  );
}
