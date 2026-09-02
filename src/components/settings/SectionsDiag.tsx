// SectionsDiag.tsx — panel Self-test & Export report untuk About → Diagnostics
// (fase 16.5). Dipisah dari SectionsMisc.tsx supaya file itu tidak makin panjang.
//
// Kedua panel HANYA menampilkan apa yang dikembalikan Rust: `self_test`
// benar-benar menulis file, memanggil `git --version`, dan menyambung ke socket
// MCP — bukan membaca konfigurasi lalu mengaku "OK".

import { useState } from 'react';
import { openPath } from '@tauri-apps/plugin-opener';
import { selfTest } from '../../lib/commands';
import { clipboardWrite } from '../../lib/clipboard';
import type { Diagnostics, SelfTestItem } from '../../lib/types';

export function SelfTestPanel() {
  const [items, setItems] = useState<SelfTestItem[] | null>(null);
  const [jalan, setJalan] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = () => {
    setJalan(true);
    setErr(null);
    selfTest()
      .then((x) => setItems(x))
      .catch((e) => setErr(String(e)))
      .finally(() => setJalan(false));
  };

  const gagal = items?.filter((x) => !x.ok).length ?? 0;

  return (
    <div className="diag-self" data-testid="diag-self">
      <div className="diag-head">
        <span className="diag-title">Self-test cepat</span>
        <button
          className="btn btn-sm"
          data-testid="diag-self-run"
          disabled={jalan}
          onClick={run}
        >
          {jalan ? 'Menjalankan…' : 'Jalankan'}
        </button>
        {items && (
          <span className="set-note" data-testid="diag-self-summary">
            {items.length - gagal}/{items.length} hijau
          </span>
        )}
      </div>

      {err && (
        <p className="set-note diag-err" data-testid="diag-self-error">
          {err}
        </p>
      )}

      {items && (
        <ul className="diag-self-list">
          {items.map((x) => (
            <li key={x.name} data-test={x.name} data-ok={x.ok ? '1' : '0'}>
              <span className={`diag-dot is-${x.ok ? 'ok' : 'warn'}`} aria-hidden="true" />
              <span className="diag-self-name">{x.name}</span>
              <span className="diag-self-ms">{x.ms}ms</span>
              <code className="diag-self-detail">{x.detail}</code>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ExportPanel({ d }: { d: Diagnostics | null }) {
  const [pesan, setPesan] = useState<string | null>(null);

  /** Laporan JSON. Tidak memuat rahasia: `domains.ai` hanya menyebut
   *  "terpasang/belum ada", bukan key-nya. */
  const laporan = () =>
    JSON.stringify(
      {
        dibuat: new Date().toISOString(),
        aplikasi: 'Zephyr',
        versi: d?.version ?? '?',
        os: d?.os ?? '?',
        cpuCount: d?.cpuCount ?? 0,
        hostRamBytes: d?.hostRamBytes ?? 0,
        build: d?.debug ? 'debug' : 'release',
        uptimeMs: d?.uptimeMs ?? 0,
        ramBytes: d?.ramBytes ?? 0,
        ramTotalBytes: d?.ramTotalBytes ?? 0,
        ramPeakBytes: d?.ramPeakBytes ?? 0,
        ptyCount: d?.ptyCount ?? 0,
        mcpPort: d?.mcpPort ?? 0,
        panicked: d?.panicked ?? false,
        lastPanic: d?.lastPanic ?? '',
        domains: d?.domains ?? [],
        marks: d?.marks ?? [],
        counters: d?.counters ?? {},
        logFile: d?.logFile ?? '',
      },
      null,
      2,
    );

  return (
    <div className="diag-export">
      <button
        className="btn btn-sm"
        data-testid="diag-export"
        disabled={!d}
        onClick={() => {
          void clipboardWrite(laporan())
            .then(() => setPesan('Laporan JSON disalin ke clipboard'))
            .catch((e) => setPesan(`Gagal menyalin: ${e}`));
        }}
      >
        Export report (JSON)
      </button>
      <button
        className="btn btn-sm"
        data-testid="diag-open-logs"
        disabled={!d?.logFile}
        onClick={() => {
          const dir = (d?.logFile ?? '').replace(/[\\/][^\\/]+$/, '');
          if (dir) void openPath(dir).catch((e) => setPesan(String(e)));
        }}
      >
        Buka folder log
      </button>
      {pesan && (
        <span className="set-note" data-testid="diag-export-msg">
          {pesan}
        </span>
      )}
    </div>
  );
}

/** Dipakai harness: bentuk laporan tanpa menyentuh clipboard. */
export function laporanUntukUji(d: Diagnostics | null): string {
  return JSON.stringify({ versi: d?.version ?? '?', domains: d?.domains ?? [] });
}
