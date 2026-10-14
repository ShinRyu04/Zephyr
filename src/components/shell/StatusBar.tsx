import { useEffect, useState } from 'react';
import { useStore, useActiveTab } from '../../lib/store';
import { useGit } from '../../lib/gitStore';
import { getAppInfo, getDiagnostics } from '../../lib/commands';
import { onRamUsage } from '../../lib/events';
import { labelBahasa } from '../../lib/lang';
import { NotifBell } from '../notifications/NotificationCenter';
import { useProblems } from '../../lib/problemsStore';
import { runCommand } from '../../lib/commandRegistry';
import { useT, useTf } from '../../lib/i18n';
/*
 * StrictMode memasang effect DUA kali. onRamUsage masih berjalan saat cleanup
 * dipanggil, jadi unlisten belum ada dan cleanup tidak melepas apa pun; mount
 * kedua kemudian memasang listener RAM kedua dan setRamBytes jalan dua kali per
 * event. Guard ini memastikan hanya satu pemasangan per proses.
 */
let ramListenerBound = false;
let ramListenerUnlisten: (() => void) | undefined;

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
  const tf = useTf();
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
        title={tf('{n} errors, {m} warnings - open Problems', { n: errors, m: warnings })}
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
  const lowRam = useStore((s) => s.settings.general.lowRam === true);
  const cursor = useStore((s) => s.cursor);
  const statusMessage = useStore((s) => s.statusMessage);
  const setFindOpen = useStore((s) => s.setFindOpen);
  const tab = useActiveTab();
  const tr = useT();

  useEffect(() => {
    getAppInfo()
      .then((i) => setVersion(i.version))
      .catch(() => {
        /* keep using the default */
      });

    if (!ramListenerBound) {
      ramListenerBound = true;
      onRamUsage(setRamBytes)
        .then((un) => {
          ramListenerUnlisten = un;
        })
        .catch(() => {
          /* the RAM event is not available (e.g. browser mode) */
          ramListenerBound = false;
        });
    }

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
      ramListenerUnlisten?.();
      ramListenerUnlisten = undefined;
      ramListenerBound = false;
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
      <span className="sb-item" title="Zephyr process memory" data-testid="sb-ram">
        RAM: {ramText}
      </span>
      {lowRam && (
        <span
          className="sb-item sb-lowram"
          data-testid="sb-lowram"
          title={tr(
            'RAM saver mode is on: minimap/sticky/indent/color decorators off, loaded tab limit 3, terminal scrollback 1000 lines',
          )}
        >
          RAM saver
        </span>
      )}
      <span className="sb-sep">|</span>
      <span className="sb-item">{tab ? ENC_LABEL[tab.encoding] ?? tab.encoding : 'UTF-8'}</span>
      <span className="sb-sep">|</span>
      <span className="sb-item">{tab ? (tab.lineEnding === 'crlf' ? 'CRLF' : 'LF') : 'CRLF'}</span>
      <span className="sb-sep">|</span>
      {/*
        * `LANG_LABEL[tab.lang]` only knew the built-in languages, so a file
        * highlighted by a contributed language pack still read "Plain Text"
        * here - the highlight changed and the label did not, which reads as a
        * broken pack. `labelBahasa` asks the same precedence the editor uses
        * (built-in wins, pack fills the gaps), so the label and the highlight
        * can no longer disagree.
        */}
      <span className="sb-item">{tab ? labelBahasa(tab.path ?? null) : 'Plain Text'}</span>
      <span className="sb-sep">|</span>
      <span className="sb-item">
        Ln {cursor.line}, Col {cursor.col}
      </span>

      <span className="sb-spacer" />

            <button
              className="sb-btn sb-donate"
              data-testid="sb-donate"
              title={tr('Support Zephyr')}
              onClick={() => useStore.getState().setDonateOpen(true)}
            >
              <span aria-hidden="true" className="sb-donate-emoji">
                ☕
              </span>{' '}
              {tr('Support Zephyr')}
            </button>
            {statusMessage && <span className="sb-item sb-message">{statusMessage}</span>}
            <NotifBell />
      {/*
        * Tombol "Customize Layout" DI SINI SUDAH DIBUANG atas permintaan user:
        * ia muncul dua kali - satu di Menu Bar (di sebelah Notes & todos) dan
        * satu di sini, tepat setelah lonceng notifikasi.
        *
        * Tombol di Menu Bar yang dipertahankan, karena itu tempat yang wajar
        * untuk kontrol tata letak.
        *
        * CATATAN untuk siapa pun yang menyunting ini nanti: tombol ini dulu
        * adalah jalan keluar bila Menu Bar dimatikan. Setelah dibuang, jalan
        * itu tinggal Command Palette (`Ctrl+Shift+P`, cari "Customize Layout")
        * lewat perintah `view.customizeLayout` di commandRegistry.ts. Kalau
        * suatu saat Menu Bar bisa dimatikan dari UI, pastikan masih ada jalan
        * membukanya kembali - kalau tidak, user harus menyunting settings.json
        * dengan tangan.
        */}
      <button className="sb-btn" title={tr('status.format')} disabled aria-disabled="true">
        {tr('status.format')}
      </button>
      <button className="sb-btn" title={`${tr('status.find')} (Ctrl+F)`} onClick={() => setFindOpen(true)}>
        {tr('status.find')}
      </button>
    </footer>
  );
}
