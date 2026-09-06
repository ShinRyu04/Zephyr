// SectionsLsp.tsx — Settings → Language Server (fase 21).
//
// Yang bisa diatur user: master switch, batas idle, dan per bahasa
// (aktif/mati + perintah). Kolom "Binary" memakai `lsp_probe` sehingga user
// langsung tahu server mana yang belum dipasang — brief fase 21 menuntut
// binary TIDAK dibundel installer, jadi UI wajib jujur soal ini.

import { useEffect, useState } from 'react';
import { useStore } from '../../lib/store';
import { useLsp } from '../../lib/lspStore';
import { LSP_SERVERS, effectiveSpec, DEFAULT_LSP_SETTINGS } from '../../lib/lsp';
import { notifyInfo } from '../../lib/notificationStore';
import { clipboardWrite } from '../../lib/clipboard';

export default function SectionsLsp() {
  const settings = useStore((s) => s.settings);
  const applySettings = useStore((s) => s.applySettings);
  const probe = useLsp((s) => s.probe);
  const probeAll = useLsp((s) => s.probeAll);
  const aktif = useLsp((s) => s.aktif);
  const stopAll = useLsp((s) => s.stopAll);

  const cfg = (settings as unknown as { lsp?: typeof DEFAULT_LSP_SETTINGS }).lsp ?? DEFAULT_LSP_SETTINGS;
  const [live, setLive] = useState<{ id: string; pid: number; idle: number }[]>([]);

  useEffect(() => {
    void probeAll();
  }, [probeAll]);

  // Daftar server hidup di-refresh berkala supaya kolom "Proses" nyata.
  useEffect(() => {
    let batal = false;
    const tarik = async () => {
      const list = (await useLsp.getState().status()) as { id: string; pid: number; idle: number }[];
      if (!batal) setLive(list);
    };
    void tarik();
    const t = window.setInterval(() => void tarik(), 4000);
    return () => {
      batal = true;
      window.clearInterval(t);
    };
  }, [aktif]);

  const ubahServer = (id: string, patch: Record<string, unknown>) =>
    void applySettings({ lsp: { servers: { [id]: patch } } });

  return (
    <section className="set-section" data-testid="set-lsp">
      <h3 className="set-h3">Language Server</h3>
      <p className="set-note">
        Zephyr TIDAK membundel binary language server (installer tetap ~7 MB). Server dicari
        di <code>%APPDATA%\zephyr\lsp\&lt;id&gt;\</code> lalu di PATH. Server hanya start saat
        file bertipe itu dibuka, dan mati sendiri setelah idle.
      </p>

      <label className="set-row">
        <input
          type="checkbox"
          data-testid="lsp-enabled"
          checked={cfg.enabled !== false}
          onChange={(e) => void applySettings({ lsp: { enabled: e.target.checked } })}
        />
        <span>Aktifkan IntelliSense (LSP)</span>
      </label>

      <label className="set-row">
        <span className="set-label">Matikan server setelah idle (detik)</span>
        <input
          className="set-input set-input-num"
          type="number"
          min={30}
          max={3600}
          data-testid="lsp-idle"
          value={cfg.idleSeconds ?? 300}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n) && n >= 30 && n <= 3600) {
              void applySettings({ lsp: { idleSeconds: n } });
            }
          }}
        />
      </label>

      <div className="set-row">
        <button
          className="btn btn-sm"
          data-testid="lsp-refresh-probe"
          onClick={() => void probeAll()}
        >
          Periksa binary
        </button>
        <button
          className="btn btn-sm"
          data-testid="lsp-stop-all"
          onClick={async () => {
            await stopAll();
            notifyInfo('Semua language server dimatikan', { source: 'LSP' });
          }}
        >
          Matikan semua server
        </button>
        <span className="side-muted" data-testid="lsp-live-count">
          {live.length} proses hidup
        </span>
      </div>

      <h4 className="set-h4">Per bahasa</h4>
      <div className="set-list" data-testid="lsp-server-list">
        {LSP_SERVERS.map((def) => {
          const spec = effectiveSpec(def, cfg);
          const p = probe[def.id];
          const hidup = live.filter((l) => l.id.startsWith(`${def.id}::`));
          return (
            <div className="lsp-srv-row" data-lsp-row={def.id} key={def.id}>
              <input
                type="checkbox"
                data-testid={`lsp-srv-enabled-${def.id}`}
                checked={spec.enabled}
                onChange={(e) => ubahServer(def.id, { enabled: e.target.checked })}
                aria-label={`Aktifkan ${def.label}`}
              />
              <span className="lsp-srv-name" title={def.extensions.join(' ')}>
                {def.label}
              </span>
              <input
                className="lsp-srv-cmd"
                data-testid={`lsp-srv-cmd-${def.id}`}
                value={spec.cmd.join(' ')}
                spellCheck={false}
                onChange={(e) => {
                  const bagian = e.target.value.trim().split(/\s+/).filter(Boolean);
                  ubahServer(def.id, { cmd: bagian.length > 0 ? bagian : null });
                }}
                aria-label={`Perintah ${def.label}`}
              />
              <span
                className="lsp-srv-state"
                data-testid={`lsp-srv-probe-${def.id}`}
                data-ok={p?.ok ? '1' : '0'}
                title={p?.ok ? p.exe : (p?.error ?? `Pasang: ${def.install}`)}
              >
                {p?.ok ? 'terpasang' : 'tidak ada'}
              </span>
              <span className="lsp-srv-live" data-testid={`lsp-srv-live-${def.id}`}>
                {hidup.length > 0 ? `pid ${hidup[0].pid}` : ''}
              </span>
              {!p?.ok && (
                <button
                  className="btn btn-xs"
                  data-testid={`lsp-srv-copy-${def.id}`}
                  title={`Salin perintah pasang: ${def.install}`}
                  onClick={async () => {
                    await clipboardWrite(def.install);
                    notifyInfo(`Perintah pasang ${def.label} disalin`, { source: 'LSP' });
                  }}
                >
                  salin
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="set-note lsp-belum" data-testid="lsp-belum">
        {(() => {
          const belum = LSP_SERVERS.filter((d) => !probe[d.id]?.ok);
          if (belum.length === 0) return 'Semua language server terpasang.';
          return (
            <>
              <span>
                <strong>{belum.length} belum terpasang.</strong> Klik <em>salin</em> untuk
                perintah pasangnya, lalu jalankan di terminal.
              </span>
              <button
                className="btn btn-sm"
                data-testid="lsp-copy-semua"
                title="Salin semua perintah pasang yang belum terpasang"
                onClick={async () => {
                  const teks = belum.map((d) => `# ${d.label}\n${d.install}`).join('\n\n');
                  await clipboardWrite(teks);
                  notifyInfo(`${belum.length} perintah pasang disalin`, { source: 'LSP' });
                }}
              >
                Salin semua perintah
              </button>
            </>
          );
        })()}
      </div>
    </section>
  );
}
