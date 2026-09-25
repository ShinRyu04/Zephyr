import { useEffect } from 'react';
import { useStore } from '../../lib/store';
import { useMcp } from '../../lib/mcpStore';
import { useT } from '../../lib/i18n';
import { Row, Section, Toggle } from './SettingsControls';
import CapturePanel from './CapturePanel';

const ORDER = ['claude', 'codex', 'gemini', 'opencode', 'hermes', 'copilot', 'cursor', 'startup'];

function shortPath(p: string): string {
  if (!p) return '—';
  const home = /^([A-Za-z]:\\Users\\[^\\]+)\\/.exec(p);
  return home ? `~\\${p.slice(home[1].length + 1)}` : p;
}

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M1.5 8S4 3.8 8 3.8 14.5 8 14.5 8 12 12.2 8 12.2 1.5 8 1.5 8z"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.3" />
      {off && <path d="M2.5 13.5l11-11" stroke="currentColor" strokeWidth="1.3" />}
    </svg>
  );
}

export default function McpPanel() {
  const tr = useT();
  const mcp = useStore((s) => s.settings.mcp);
  const status = useMcp((s) => s.status);
  const clis = useMcp((s) => s.clis);
  const checked = useMcp((s) => s.checked);
  const busy = useMcp((s) => s.busy);
  const reveal = useMcp((s) => s.reveal);
  const err = useMcp((s) => s.mcpError);
  const info = useMcp((s) => s.mcpInfo);
  const lastWrite = useMcp((s) => s.lastWrite);
  const lastAction = useMcp((s) => s.lastAction);
  const served = useMcp((s) => s.served);
  const log = useMcp((s) => s.log);
  const clearLog = useMcp((s) => s.clearLog);
  const init = useMcp((s) => s.init);
  const toggleServer = useMcp((s) => s.toggleServer);
  const toggleChecked = useMcp((s) => s.toggleChecked);
  const writeToCli = useMcp((s) => s.writeToCli);
  const removeFromCli = useMcp((s) => s.removeFromCli);
  const rotateToken = useMcp((s) => s.rotateToken);
  const copyToken = useMcp((s) => s.copyToken);
  const setReveal = useMcp((s) => s.setReveal);

  useEffect(() => {
    void init();
  }, [init]);

  const running = !!status?.running;
  const port = status?.port ?? mcp.port;
  const token = status?.token ?? '';
  const masked = token ? `${token.slice(0, 4)}${'•'.repeat(20)}${token.slice(-4)}` : tr('(belum ada)');
  const byId = new Map(clis.map((c) => [c.id, c]));

  const terdeteksi = clis.filter((c) => c.exists).map((c) => c.id);

  const terdaftar = clis.filter((c) => c.registered).map((c) => c.id);
  const setChecked = useMcp((s) => s.setChecked);

  return (
    <Section title={tr('settings.mcp')}>
      <p className="set-note" data-testid="mcp-note">
        {tr('Saat switch ini hidup, Zephyr jadi server MCP di')} <code>127.0.0.1:{port}</code>{' '}
        {tr('AI CLI di luar (Claude Code, Codex, Gemini CLI, opencode, Copilot CLI, Cursor) bisa membaca pane, tab editor, dan settings — juga mengemudikan jendela ini: mengetik di terminal, membuka file, menjalankan command. Hanya loopback: tidak pernah terbuka ke jaringan.')}
      </p>

      <Row label={tr('mcp.enable')} hint={`${tr('switch besar; port')} ${mcp.port}`}>
        <Toggle
          label={tr('mcp.enable')}
          testid="mcp-enable"
          checked={running}
          onChange={(v) => void toggleServer(v)}
        />
      </Row>

      <Row label={tr('mcp.status')}>
        <span
          className={`mcp-status ${running ? 'is-running' : 'is-stopped'}`}
          data-testid="mcp-status"
          data-running={running ? '1' : '0'}
          data-port={running ? String(port) : ''}
        >
          <span className="mcp-dot" />
          {running ? `Running (127.0.0.1:${port})` : tr('common.stopped')}
          {running && status && (
            <span className="mcp-uptime"> · {Math.round(status.uptimeMs / 1000)}s</span>
          )}
        </span>
      </Row>

      {running && status && status.port !== status.requestedPort && (
        <p className="set-note is-warn" data-testid="mcp-fallback">
          Port {status.requestedPort} dipakai program lain, jadi server pindah ke {status.port}.
          Config CLI yang ditulis dari sini sudah memakai port {status.port}.
        </p>
      )}

      <Row label={tr('mcp.token')} hint={tr('dipakai sebagai Authorization: Bearer ***')}>
        <span className="mcp-tokenrow">
          <code className="mcp-token" data-testid="mcp-token" data-full={reveal ? '1' : '0'}>
            {reveal ? token || '(belum ada)' : masked}
          </code>
          <button
            className="btn btn-sm btn-icon"
            data-testid="mcp-eye"
          title={reveal ? tr('Sembunyikan token') : tr('Tampilkan token')}
          aria-label={reveal ? tr('Sembunyikan token') : tr('Tampilkan token')}
            onClick={() => setReveal(!reveal)}
          >
            <EyeIcon off={reveal} />
          </button>
          <button className="btn btn-sm" data-testid="mcp-copy" onClick={() => void copyToken()}>
            Copy
          </button>
          <button
            className="btn btn-sm"
            data-testid="mcp-rotate"
            disabled={busy}
            onClick={() => void rotateToken()}
          >
            Token baru
          </button>
        </span>
      </Row>

      <Row label={tr('mcp.writeToCli')} hint={tr('entri ditulis ke config; file lama disalin ke .bak')}>
        <div className="mcp-clis" data-testid="mcp-clis">
          {ORDER.map((id) => {
            const c = byId.get(id);
            return (
              <label
                key={id}
                className="mcp-cli"
                data-registered={c?.registered ? '1' : '0'}
                data-testid={`mcp-cli-row-${id}`}
                data-cli-id={id}
              >
                <input
                  type="checkbox"
                  checked={checked.includes(id)}
                  data-testid={`mcp-cli-${id}`}
                  onChange={() => toggleChecked(id)}
                />
                <span className="mcp-cli-name">{c?.label ?? id}</span>
                <code className="mcp-cli-path" title={c?.path ?? ''} data-testid={`mcp-path-${id}`}>
                  {shortPath(c?.path ?? '')}
                </code>
                <span
                  className={`mcp-cli-badge${c?.registered ? ' is-on' : ''}`}
                  data-testid={`mcp-reg-${id}`}
                >
                  {c?.registered ? tr('terdaftar') : c?.exists ? tr('belum') : tr('config belum ada')}
                </span>
              </label>
            );
          })}
        </div>
      </Row>

      <div className="mcp-actions">
        <button
          className="btn btn-primary"
          data-testid="mcp-write"
          disabled={busy}
          onClick={() => void writeToCli()}
        >
          {tr('Tulis ke CLI')}
        </button>
        {/* One click for every CLI whose config EXISTS on this machine.
            CLI yang belum terpasang dilewati — menulis config untuk aplikasi
            yang tidak ada hanya membuat folder sampah. */}
        <button
          className="btn"
          data-testid="mcp-install-all"
          disabled={busy}
          title={tr('Tulis konfigurasi MCP ke semua CLI yang terpasang di mesin ini')}
          onClick={() => {
            setChecked(terdeteksi);

            window.setTimeout(() => void writeToCli(), 30);
          }}
        >
          {tr('Pasang ke semua')} ({terdeteksi.length})
        </button>
        <button
          className="btn"
          data-testid="mcp-unwrite"
          disabled={busy}
          onClick={() => void removeFromCli()}
        >
          {tr('Lepas dari CLI')}
        </button>
        <span className="mcp-ringkas" data-testid="mcp-ringkas">
          {terdaftar.length} {tr('dari')} {ORDER.length} {tr('CLI terdaftar')}
        </span>
      </div>

      {/* Toggle ekspos: memutus akses AI luar TANPA mencabut konfigurasi.
          KENAPA terpisah dari tombol lepas: user sering hanya ingin "matikan
          dulu sebentar", bukan membongkar semua yang sudah dipasang. */}
      <Row
        label={tr('Izinkan AI luar mengontrol Zephyr')}
        hint={tr('Kalau dimatikan, server MCP berhenti menerima perintah — konfigurasi di CLI tidak diubah.')}
      >
        <Toggle
          checked={running}
          label={tr('Izinkan AI luar mengontrol Zephyr')}
          testid="mcp-ekspos"
          onChange={(v) => void toggleServer(v)}
        />
      </Row>

      {err && (
        <p className="set-note is-error" data-testid="mcp-error">
          {err}
        </p>
      )}
      {info && !err && (
        <p className="set-note is-ok" data-testid="mcp-info">
          {info}
        </p>
      )}

      {lastWrite.length > 0 && (
        <>
          <ul className="mcp-results" data-testid="mcp-results">
            {lastWrite.map((r) => (
              <li key={r.id} className={r.ok ? 'is-ok' : 'is-error'} data-cli={r.id}>
                <span className="mcp-res-label">{r.label}</span>
                <code className="mcp-res-path">{r.path}</code>
                <span className="mcp-res-msg">{r.message}</span>
              </li>
            ))}
          </ul>
          <p className="set-note" data-testid="mcp-hint-restart">
            Restart CLI-nya agar MCP terbaca. Setelah itu agent bisa: membaca pane &amp; tab editor,
            mengetik di terminal, membuka file, dan menjalankan command editor.
          </p>
        </>
      )}

      <div className="mcp-logwrap">
        <div className="mcp-log-head">
          <span>Aktivitas MCP</span>
          {log.length > 0 && (
            <button className="tp-op" data-testid="mcp-log-clear" onClick={() => clearLog()}>
              bersihkan
            </button>
          )}
        </div>
        <ul className="mcp-log" data-testid="mcp-log">
          {log.length === 0 ? (
            <li className="mcp-log-empty">
              {tr('Belum ada koneksi. Begitu sebuah AI CLI menyapa')} <code>/health</code>{' '}
              {tr('atau memanggil tool, barisnya muncul di sini — bukti nyata, bukan klaim.')}
            </li>
          ) : (
            log.map((l, i) => (
              <li
                key={`${l.at}-${i}`}
                className={`mcp-log-row is-${l.kind}`}
                data-kind={l.kind}
                data-testid="mcp-log-row"
              >
                <span className="mcp-log-time">
                  {new Date(l.at).toLocaleTimeString('id-ID', { hour12: false })}
                </span>
                <span className="mcp-log-text">{l.text}</span>
              </li>
            ))
          )}
        </ul>
      </div>

      <div className="mcp-info-grid" data-testid="mcp-infogrid">
        <div className="mcp-info-card">
          <span className="mcp-info-k">Automation channel</span>
          <span className="mcp-info-v">JSON-RPC 2.0 di atas HTTP, POST /</span>
        </div>
        <div className="mcp-info-card">
          <span className="mcp-info-k">Beban per request</span>
            <span className="mcp-info-v">{tr('≈3.0k token untuk daftar tool penuh')}</span>
        </div>
        <div className="mcp-info-card">
          <span className="mcp-info-k">Discovery</span>
          <span className="mcp-info-v">
            GET /mcp (schema) · GET /health (tanpa auth)
          </span>
        </div>
        <div className="mcp-info-card">
          <span className="mcp-info-k">Permintaan dilayani</span>
          <span className="mcp-info-v" data-testid="mcp-served">
            {served} sesi ini
            {lastAction ? ` · terakhir: ${lastAction.detail}` : ''}
          </span>
        </div>
      </div>

      <CapturePanel />

      <p className="set-note">
        {tr('Terbuka di port')} {port}{tr(': apa pun yang berjalan sebagai user-mu bisa mengemudikan jendela ini selama tahu tokennya.')}{' '}
        <code>editor_write</code> {tr('hanya mengubah buffer tab, TIDAK menulis ke disk — penyimpanan tetap keputusanmu.')}{' '}
        <code>set_setting</code> {tr('dibatasi whitelist tampilan (tema, font, tab size); kredensial dan setting MCP sendiri tidak bisa diubah dari luar.')}
      </p>
    </Section>
  );
}
