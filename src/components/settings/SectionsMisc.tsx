// SectionsMisc.tsx — Extensions, Source Control, MCP, SSH, Tentang (fase 08).

import { useState } from 'react';
import { openPath, openUrl } from '@tauri-apps/plugin-opener';
import { useStore } from '../../lib/store';
import { useT } from '../../lib/i18n';
import { NumberInput, Row, Section, TextInput, Toggle } from './SettingsControls';

/** Ekstensi bawaan yang bisa dimatikan. Loader ekstensi eksternal = fase 19. */
const BUILTIN_EXTENSIONS = [
  { id: 'lang-web', label: 'Bahasa Web', desc: 'HTML, CSS, JS/TS, JSON' },
  { id: 'lang-python', label: 'Python', desc: 'highlight + indentasi' },
  { id: 'lang-rust', label: 'Rust', desc: 'highlight' },
  { id: 'lang-markdown', label: 'Markdown', desc: 'highlight + preview (fase 15)' },
  { id: 'git-decor', label: 'Dekorasi Git', desc: 'warna status file di Explorer (fase 10)' },
  { id: 'bracket-pair', label: 'Bracket Pair', desc: 'pasangan tanda kurung berwarna' },
];

export function ExtensionsSection() {
  const t = useT();
  const ext = useStore((s) => s.settings.extensions);
  const apply = useStore((s) => s.applySettings);

  // Daftar `enabled` kosong = semua bawaan aktif (default paling ramah).
  const isOn = (id: string) => ext.enabled.length === 0 || ext.enabled.includes(id);

  const toggle = (id: string, on: boolean) => {
    const base = ext.enabled.length === 0 ? BUILTIN_EXTENSIONS.map((e) => e.id) : ext.enabled;
    const next = on ? [...new Set([...base, id])] : base.filter((x) => x !== id);
    void apply({ extensions: { enabled: next } });
  };

  return (
    <Section title={t('settings.extensions')}>
      <p className="set-note">
        Ini ekstensi bawaan yang sudah ada di dalam Zephyr. Pemasangan ekstensi
        dari luar (marketplace/file) belum ada — itu bagian fase 19, jadi di sini
        hanya bisa dimatikan/dihidupkan.
      </p>
      <div className="ext-list" data-testid="ext-list">
        {BUILTIN_EXTENSIONS.map((e) => (
          <div key={e.id} className="ext-card" data-ext={e.id}>
            <div className="ext-info">
              <span className="ext-name">{e.label}</span>
              <span className="ext-desc">{e.desc}</span>
            </div>
            <Toggle
              label={e.label}
              testid={`ext-${e.id}`}
              checked={isOn(e.id)}
              onChange={(v) => toggle(e.id, v)}
            />
          </div>
        ))}
      </div>
    </Section>
  );
}

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

/** CLI yang bisa didaftari config MCP (dieksekusi di fase 11). */
const MCP_CLIS = [
  { id: 'claude', label: 'Claude Code' },
  { id: 'codex', label: 'Codex CLI' },
  { id: 'gemini', label: 'Gemini CLI' },
  { id: 'opencode', label: 'opencode' },
  { id: 'copilot', label: 'GitHub Copilot CLI' },
  { id: 'cursor', label: 'Cursor' },
  { id: 'startup', label: 'Startup/.mcp.json' },
];

export function McpSection() {
  const t = useT();
  const mcp = useStore((s) => s.settings.mcp);
  const apply = useStore((s) => s.applySettings);

  const toggleCli = (id: string, on: boolean) => {
    const next = on ? [...new Set([...mcp.writeToCli, id])] : mcp.writeToCli.filter((x) => x !== id);
    void apply({ mcp: { writeToCli: next } });
  };

  const genToken = () => {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    const tok = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    void apply({ mcp: { token: tok } });
  };

  return (
    <Section title={t('settings.mcp')}>
      <p className="set-note" data-testid="mcp-note">
        Server MCP membuat AI CLI dari luar bisa membaca pane/editor dan
        mengendalikan jendela Zephyr. Pilihan di sini sudah tersimpan, tapi
        servernya sendiri dibangun di fase 11 — sampai itu selesai statusnya
        tetap berhenti dan port {mcp.port} TIDAK dibuka. Saya tidak menampilkan
        "berjalan" untuk sesuatu yang belum ada.
      </p>

      <Row label={t('mcp.enable')} hint="tersimpan sekarang, aktif setelah fase 11">
        <Toggle
          label={t('mcp.enable')}
          testid="mcp-enable"
          checked={mcp.enabled}
          onChange={(v) => void apply({ mcp: { enabled: v } })}
        />
      </Row>

      <Row label={t('mcp.status')}>
        <span className="mcp-status is-stopped" data-testid="mcp-status">
          <span className="mcp-dot" />
          {t('common.stopped')} — backend fase 11 belum dibuat
        </span>
      </Row>

      <Row label={t('mcp.port')} hint="9222 = kontrak tetap (ARCHITECTURE.md)">
        <NumberInput
          label={t('mcp.port')}
          testid="mcp-port"
          min={1024}
          max={65535}
          value={mcp.port}
          onChange={(v) => void apply({ mcp: { port: v } })}
        />
      </Row>

      <Row label={t('mcp.token')} hint="Bearer token; kosong = tolak semua koneksi">
        <span className="mcp-tokenrow">
          <TextInput
            label={t('mcp.token')}
            testid="mcp-token"
            mono
            value={mcp.token}
            placeholder="(belum ada token)"
            onChange={(v) => void apply({ mcp: { token: v } })}
          />
          <button className="btn btn-sm" data-testid="mcp-gen" onClick={genToken}>
            Generate
          </button>
        </span>
      </Row>

      <Row label={t('mcp.writeToCli')} hint="menulis entri server ke config CLI (fase 11)">
        <div className="mcp-clis" data-testid="mcp-clis">
          {MCP_CLIS.map((c) => (
            <label key={c.id} className="mcp-cli">
              <input
                type="checkbox"
                checked={mcp.writeToCli.includes(c.id)}
                data-testid={`mcp-cli-${c.id}`}
                onChange={(e) => toggleCli(c.id, e.target.checked)}
              />
              <span>{c.label}</span>
            </label>
          ))}
        </div>
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
        Fase yang sudah jalan: 01–06 dan 08. Fase 07 (SSH) ditunda menunggu host;
        MCP port 9222 menyusul di fase 11. Halaman Diagnostics dibuat di fase 16 —
        sampai itu ada, folder log di atas adalah tempat memeriksa masalah.
      </p>
    </Section>
  );
}
