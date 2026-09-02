// SectionsMisc.tsx — Extensions, Source Control, SSH, Tentang (fase 08).
//
// MCP tidak di sini: panelnya `McpPanel.tsx` (fase 11). Switch server, token,
// dan tabel "Dikontrol oleh" cukup ada di SATU tempat — pelajaran fase 08,
// kontrol yang dibuat dua kali muncul dobel di layar.

import { useEffect, useState } from 'react';
import { openPath, openUrl } from '@tauri-apps/plugin-opener';
import { useStore } from '../../lib/store';
import { useT } from '../../lib/i18n';
import { getDiagnostics, debugPanic } from '../../lib/commands';
import type { Diagnostics } from '../../lib/types';
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
  const recent = useStore((s) => s.settings.ssh.recentHosts ?? []);
  const apply = useStore((s) => s.applySettings);
  const [draft, setDraft] = useState('');

  const tambah = () => {
    const v = draft.trim();
    if (!v) return;
    void apply({ ssh: { recentHosts: [...new Set([...recent, v])].slice(-10) } });
    setDraft('');
  };

  return (
    <Section title={t('settings.ssh')}>
      <p className="set-note" data-testid="ssh-note">
        Manajemen koneksi SSH (daftar host, connect ke pane terminal, reconnect)
        adalah fase 07 dan ditunda sampai ada host untuk diuji. Kontrak
        commandnya sudah dicatat di ARCHITECTURE.md, jadi saat dikerjakan nanti
        tidak ada nama yang berubah.
      </p>
      <p className="set-note">
        Yang sudah siap dari sisi terminal: jenis pane <code>ssh</code> ada di
        store dan grid pane, jadi fase 07 hanya perlu menambah backend + panel
        host.
      </p>

      <Row label="Catatan host" hint="hanya daftar teks; belum bisa connect">
        <span className="mcp-tokenrow">
          <TextInput
            label="Host SSH"
            testid="ssh-draft"
            mono
            placeholder="user@host:22"
            value={draft}
            onChange={setDraft}
          />
          <button className="btn btn-sm" data-testid="ssh-add" onClick={tambah} disabled={!draft.trim()}>
            Tambah
          </button>
        </span>
      </Row>

      {recent.length > 0 && (
        <ul className="ssh-list" data-testid="ssh-list">
          {recent.map((h) => (
            <li key={h} className="ssh-item">
              <code>{h}</code>
              <button
                className="tp-op"
                data-testid={`ssh-del-${h}`}
                onClick={() =>
                  void apply({ ssh: { recentHosts: recent.filter((x) => x !== h) } })
                }
              >
                hapus
              </button>
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
    getDiagnostics()
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
            onClick={() => void debugPanic().catch(() => {})}
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
