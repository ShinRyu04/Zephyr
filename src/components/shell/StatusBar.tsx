// StatusBar.tsx — baris bawah: versi, RAM, workspace, bahasa, encoding,
// line ending, Ln/Col, pesan status. Tinggi 24px (token --statusbar-h).

import { useEffect, useState } from 'react';
import { useStore, useActiveTab } from '../../lib/store';
import { useGit } from '../../lib/gitStore';
import { getAppInfo, getDiagnostics } from '../../lib/commands';
import { onRamUsage } from '../../lib/events';
import { LANG_LABEL } from '../../lib/lang';
import { NotifBell } from '../notifications/NotificationCenter';
import { useProblems } from '../../lib/problemsStore';
import { runCommand } from '../../lib/commandRegistry';

const ENC_LABEL: Record<string, string> = {
  utf8: 'UTF-8',
  'utf8-bom': 'UTF-8 with BOM',
  ansi: 'Windows-1252',
};

/** Badge git (fase 10): branch + Σ perubahan + ↑↓, ikon berputar saat sibuk.
 *  Klik = buka panel Source Control. Tidak tampil bila bukan repo. */
function GitBadge() {
  const isRepo = useGit((s) => s.status?.isRepo ?? false);
  const branch = useGit((s) => s.status?.branch ?? null);
  const ahead = useGit((s) => s.status?.ahead ?? 0);
  const behind = useGit((s) => s.status?.behind ?? 0);
  // Primitif, bukan array — selector zustand v5 tidak boleh bikin objek baru.
  const changes = useGit((s) => s.status?.changes.length ?? 0);
  const busy = useGit((s) => s.busy);
  const setActivity = useStore((s) => s.setActivity);

  if (!isRepo) return null;

  return (
    <>
      <button
        className="sb-item sb-git"
        data-testid="sb-git"
        title={busy ? 'git sedang berjalan…' : 'Source Control'}
        onClick={() => setActivity('scm')}
      >
        <svg viewBox="0 0 16 16" className={`sb-git-ico ${busy ? 'scm-rot' : ''}`} aria-hidden="true">
          <path
            d="M5 3.5v9M11 3.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3zM5 3.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3zM5 12.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM11 6.5c0 2-1.5 3-6 3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
        </svg>
        <span data-testid="sb-git-branch">{branch ?? '(detached)'}</span>
        {changes > 0 && (
          <span className="sb-git-count" data-testid="sb-git-changes">
            {changes}
          </span>
        )}
        {(ahead > 0 || behind > 0) && (
          <span className="sb-git-ab" data-testid="sb-git-ab">
            {ahead > 0 && `↑${ahead}`}
            {behind > 0 && `↓${behind}`}
          </span>
        )}
      </button>
      <span className="sb-sep">|</span>
    </>
  );
}

/** Ringkasan diagnostik (fase 20). Tetap tampil walau panel tertutup —
 *  itu gunanya: tahu ada error tanpa membuka panel. Klik = buka Problems. */
function ProblemsBadge() {
  // Primitif, bukan objek: selector zustand v5 dibandingkan dengan ===.
  const errors = useProblems((s) => {
    let n = 0;
    for (const list of s.byFile.values()) for (const d of list) if (d.severity === 'error') n++;
    return n;
  });
  const warnings = useProblems((s) => {
    let n = 0;
    for (const list of s.byFile.values()) for (const d of list) if (d.severity === 'warning') n++;
    return n;
  });

  return (
    <>
      <button
        className="sb-item sb-problems"
        data-testid="sb-problems"
        title={`${errors} error, ${warnings} warning — buka Problems`}
        onClick={() => void runCommand('problemsPanel.focus')}
      >
        <span className="sb-prob-err" data-testid="sb-prob-errors">
          ⊗ {errors}
        </span>
        <span className="sb-prob-warn" data-testid="sb-prob-warnings">
          ⚠ {warnings}
        </span>
      </button>
      <span className="sb-sep">|</span>
    </>
  );
}

/** Badge akun GitHub TIDAK di sini — pindah ke bawah ActivityBar (fase 34,
 *  ala VS Code). StatusBar cukup GitBadge + ProblemsBadge. */

export default function StatusBar() {
  const [version, setVersion] = useState('0.5.0');
  const ramBytes = useStore((s) => s.ramBytes);
  const setRamBytes = useStore((s) => s.setRamBytes);
  const cursor = useStore((s) => s.cursor);
  const statusMessage = useStore((s) => s.statusMessage);
  const setFindOpen = useStore((s) => s.setFindOpen);
  const tab = useActiveTab();

  useEffect(() => {
    getAppInfo()
      .then((i) => setVersion(i.version))
      .catch(() => {
        /* tetap pakai default */
      });

    let stop: (() => void) | undefined;
    onRamUsage(setRamBytes)
      .then((un) => {
        stop = un;
      })
      .catch(() => {
        /* event RAM tidak tersedia (mis. mode browser) */
      });

    // fase 15.6: event `ram-usage` baru datang beberapa detik setelah start,
    // jadi status bar sempat menampilkan '--'. Baca sekali dari Rust setelah
    // 300ms supaya angkanya langsung ada dan tidak pernah NaN.
    const t = window.setTimeout(() => {
      void getDiagnostics()
        .then((d) => {
          const n = Number(d.ramTotalBytes ?? d.ramBytes);
          if (Number.isFinite(n) && n > 0) setRamBytes(n);
        })
        .catch(() => {
          /* non-Tauri */
        });
    }, 300);

    return () => {
      window.clearTimeout(t);
      stop?.();
    };
  }, [setRamBytes]);

  // Number.isFinite menjaga terhadap NaN/Infinity dari sumber apa pun (15.6).
  const ramText =
    Number.isFinite(ramBytes) && ramBytes > 0 ? `${Math.round(ramBytes / 1024 / 1024)} MB` : '--';

  return (
    <footer className="statusbar">
      <span className="sb-item sb-brand">Zephyr v{version}</span>
      <span className="sb-sep">|</span>
      <GitBadge />
      <ProblemsBadge />
      <span className="sb-item" title="Memori proses Zephyr" data-testid="sb-ram">
        RAM: {ramText}
      </span>
      <span className="sb-sep">|</span>
      <span className="sb-item">{tab ? ENC_LABEL[tab.encoding] ?? tab.encoding : 'UTF-8'}</span>
      <span className="sb-sep">|</span>
      <span className="sb-item">{tab ? (tab.lineEnding === 'crlf' ? 'CRLF' : 'LF') : 'CRLF'}</span>
      <span className="sb-sep">|</span>
      <span className="sb-item">{tab ? LANG_LABEL[tab.lang] : 'Plain Text'}</span>
      <span className="sb-sep">|</span>
      <span className="sb-item">
        Ln {cursor.line}, Col {cursor.col}
      </span>

      <span className="sb-spacer" />

      {statusMessage && <span className="sb-item sb-message">{statusMessage}</span>}
      <NotifBell />
      <button
        className="sb-btn"
        title="Format document — Prettier di fase berikutnya"
        disabled
        aria-disabled="true"
      >
        Format
      </button>
      <button className="sb-btn" title="Cari (Ctrl+F)" onClick={() => setFindOpen(true)}>
        Cari
      </button>
    </footer>
  );
}
