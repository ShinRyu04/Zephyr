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
import { useUpdater } from '../../lib/updaterStore';
import { useFocusTrap } from '../../lib/useFocusTrap';

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
          placeholder="(pakai git config)"
          onChange={(v) => void apply({ git: { userName: v } })}
        />
      </Row>

      <Row label={tr('scm.userEmail')}>
        <TextInput
          label={tr('scm.userEmail')}
          testid="scm-email"
          value={git.userEmail ?? ''}
          placeholder="(pakai git config)"
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
  const setStatus = useStore((s) => s.setStatus);
  const [hosts, setHosts] = useState<SshHost[]>([]);
  const [muat, setMuat] = useState(false);
  const [form, setForm] = useState<SshConfigInput | null>(null); // null = form tertutup
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
      setStatus(form.id ? 'Host SSH diperbarui' : 'Host SSH ditambahkan');
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
      setStatus(`Host SSH ${h.name} dihapus`);
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
    <Section title={tr('settings.ssh')}>
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
              {form.id ? tr('Simpan perubahan') : tr('Tambah host')}
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
                  onClick={() => setHapusTarget(h)}
                >
                  Hapus
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
              Hapus host SSH "{hapusTarget.name}"?
            </h2>
            <p className="modal-body" data-testid="ssh-del-body">
              Koneksi host ini akan dihapus dari daftar.
            </p>
            <div className="modal-actions">
              <button
                className="btn btn-danger"
                data-testid="ssh-del-ok"
                onClick={() => void hapus(hapusTarget)}
              >
                Hapus
              </button>
              <button
                className="btn"
                data-testid="ssh-del-cancel"
                onClick={() => setHapusTarget(null)}
              >
                Batal
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

  // Detail penting saja. Sisanya (WebView2, frontend, editor, terminal)
  // dipindah ke Diagnostics supaya kartu ini tidak jadi dinding teks.
  const baris: Array<[string, string]> = [
    ['Versi', `${info?.version ?? '-'} · ${info?.profile ?? '-'}`],
    ['Arsitektur', info?.arch ?? '-'],
    ['Identifier', info?.identifier ?? '-'],
    ['Lisensi', 'MIT'],
  ];

  /** Teks laporan bug — disalin apa adanya ke issue. */
  const infoSistem = [
    `Zephyr ${info?.version ?? '?'} (${info?.profile ?? '?'})`,
    `Arsitektur: ${info?.arch ?? '?'}`,
    `WebView2: ${info?.webview || 'tidak terdeteksi'}`,
    `Identifier: ${info?.identifier ?? '?'}`,
    `Folder data: ${dataDir || '?'}`,
    `Portable: ${info?.portable ? 'ya' : 'tidak'}`,
  ].join('\n');

  return (
    <Section title={tr('settings.about')}>
      {/* Kartu identitas ala TEDI: logo + nama + tagline + versi. */}
      <div className="about-kartu" data-testid="about-kartu">
        <img className="about-logo" src="/zephyr.svg" alt="" width={40} height={40} />
        <div className="about-id">
          <span className="about-name">Zephyr</span>
          <span className="about-tag">{tr('code editor ringan, dibangun dari nol')}</span>
          <span className="about-ver" data-testid="about-ver">
            v{info?.version ?? '?'}
          </span>
        </div>
      </div>

      {/* Kartu detail: label kiri, nilai kanan — 4 baris saja. */}
      <div className="about-kartu about-kartu-detail">
        <div className="about-judul">{tr('Detail build')}</div>
        <div className="about-sub">
          {tr('Platform, identifier, lisensi, dan repositori sumber.')}
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
              <td className="about-k">{tr('Kode sumber')}</td>
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
        {tr('Auto-update memeriksa GitHub Releases berkala.')}
      </p>

      {/* Baris tautan utama — yang paling sering dipakai user. */}
      <div className="about-links">
        <button
          className="btn btn-primary"
          data-testid="about-update"
          onClick={() => void useUpdater.getState().check()}
        >
          ⟳ {tr('Cek update')}
        </button>
        <button
          className="btn"
          data-testid="about-github"
          onClick={() => void openUrl('https://github.com/ShinRyu04/Zephyr').catch(() => {})}
        >
          {tr('Lihat di GitHub')}
        </button>
        <button
          className="btn"
          data-testid="about-issue"
          onClick={() =>
            void openUrl('https://github.com/ShinRyu04/Zephyr/issues/new').catch(() => {})
          }
        >
          {tr('Laporkan masalah')}
        </button>
        <button
          className="btn"
          data-testid="about-wa"
          onClick={() => void openUrl('https://chat.whatsapp.com/LNp12sKUWFFGH1RRSyHQkb').catch(() => {})}
        >
          {tr('Grup WhatsApp')}
        </button>
        <button
          className="btn btn-donate"
          data-testid="about-donate"
          onClick={() => useStore.getState().setDonateOpen(true)}
        >
          <span dangerouslySetInnerHTML={{ __html: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true"><path d="M3 5.5h8.5v3.2a4.2 4.2 0 0 1-4.2 4.2h-.1A4.2 4.2 0 0 1 3 8.7z"/><path d="M11.5 6.6h1.2a1.9 1.9 0 0 1 0 3.8h-1.2"/><path d="M5.6 2.2c0 .9-.8 1.1-.8 2M8.2 2.2c0 .9-.8 1.1-.8 2"/></svg>' }} /> {tr('Dukung Zephyr')}
        </button>
      </div>

      {/* Utilitas langka — tetap ada, tapi tidak lagi jadi tombol besar. */}
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
          {salin ? tr('Tersalin') : tr('Salin info sistem')}
        </button>
        <button
          className="about-util-btn"
          data-testid="about-logs"
          disabled={!dataDir}
          onClick={() => void openPath(`${dataDir}\\logs`).catch(() => {})}
        >
          {tr('Buka folder log')}
        </button>
        <button
          className="about-util-btn"
          data-testid="about-data"
          disabled={!dataDir}
          onClick={() => void openPath(dataDir).catch(() => {})}
        >
          {tr('Buka folder data')}
        </button>
        <button
          className="about-util-btn"
          data-testid="about-releases"
          onClick={() => void openUrl('https://github.com/ShinRyu04/Zephyr/releases').catch(() => {})}
        >
          {tr('Halaman rilis')}
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
  return h > 0 ? `${h}j ${m}m` : m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
};

/** About → Diagnostics (fase 14.5). Semua nilai dari command `get_diagnostics`;
 *  tidak ada yang dihitung ulang di frontend supaya tidak ada dua sumber angka. */
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
          <p className="set-note">{tr('Penanda waktu (ms sejak proses mulai):')}</p>
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
