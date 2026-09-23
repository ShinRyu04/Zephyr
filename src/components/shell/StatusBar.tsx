import { useEffect, useState } from 'react';
import { useStore, useActiveTab } from '../../lib/store';
import { useGit } from '../../lib/gitStore';
import { getAppInfo, getDiagnostics } from '../../lib/commands';
import { onRamUsage } from '../../lib/events';
import { LANG_LABEL } from '../../lib/lang';
import { NotifBell } from '../notifications/NotificationCenter';
import { useProblems } from '../../lib/problemsStore';
import { runCommand } from '../../lib/commandRegistry';
import { useT } from '../../lib/i18n';
import { useLayoutCustom } from '../../lib/layoutStore';

const ENC_LABEL: Record<string, string> = {
  utf8: 'UTF-8',
  'utf8-bom': 'UTF-8 with BOM',
  ansi: 'Windows-1252',
};

function GitBadge() {
  const tr = useT();
  const isRepo = useGit((s) => s.status?.isRepo ?? false);
  const branch = useGit((s) => s.status?.branch ?? null);
  const ahead = useGit((s) => s.status?.ahead ?? 0);
  const behind = useGit((s) => s.status?.behind ?? 0);

  const changes = useGit((s) => s.status?.changes.length ?? 0);
  const busy = useGit((s) => s.busy);
  const setActivity = useStore((s) => s.setActivity);

  if (!isRepo) return null;

  return (
    <>
      <button
        className="sb-item sb-git"
        data-testid="sb-git"
        title={busy ? tr('common.running') : tr('nav.scm')}
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

function ProblemsBadge() {

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

export default function StatusBar() {
  const [version, setVersion] = useState('0.5.0');
  const ramBytes = useStore((s) => s.ramBytes);
  const setRamBytes = useStore((s) => s.setRamBytes);
  const cursor = useStore((s) => s.cursor);
  const statusMessage = useStore((s) => s.statusMessage);
  const setFindOpen = useStore((s) => s.setFindOpen);
  const tab = useActiveTab();
  const tr = useT();

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

            <button
              className="sb-btn sb-donate"
              data-testid="sb-donate"
              title="Support Zephyr — Trakteer / Saweria"
              onClick={() => useStore.getState().setDonateOpen(true)}
            >
              <span dangerouslySetInnerHTML={{ __html: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true"><path d="M3 5.5h8.5v3.2a4.2 4.2 0 0 1-4.2 4.2h-.1A4.2 4.2 0 0 1 3 8.7z"/><path d="M11.5 6.6h1.2a1.9 1.9 0 0 1 0 3.8h-1.2"/><path d="M5.6 2.2c0 .9-.8 1.1-.8 2M8.2 2.2c0 .9-.8 1.1-.8 2"/></svg>' }} /> Support
            </button>
            {statusMessage && <span className="sb-item sb-message">{statusMessage}</span>}
            <NotifBell />
      {/* Tombol Customize Layout di status bar: jalan keluar kalau Menu Bar
          dimatikan. Tanpa ini, mematikan Menu Bar = tidak ada cara
          menyalakannya lagi selain mengedit settings.json manual. */}
      <button
        className="sb-btn"
        data-testid="sb-layout"
        title={tr('Customize Layout…')}
        aria-label={tr('Customize Layout…')}
        onClick={() => useLayoutCustom.getState().setMenuBuka(!useLayoutCustom.getState().menuBuka)}
      >
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
          <rect x="1.8" y="2.2" width="12.4" height="11.6" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <path d="M6.4 2.2v11.6" stroke="currentColor" strokeWidth="1.3" />
          <path d="M9.6 6.2h3.4M9.6 9.4h3.4" stroke="currentColor" strokeWidth="1.1" />
        </svg>
      </button>
      <button className="sb-btn" title={tr('status.format')} disabled aria-disabled="true">
        {tr('status.format')}
      </button>
      <button className="sb-btn" title={`${tr('status.find')} (Ctrl+F)`} onClick={() => setFindOpen(true)}>
        {tr('status.find')}
      </button>
    </footer>
  );
}
