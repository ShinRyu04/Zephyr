import { useEffect, useState } from 'react';
import { useStore } from '../../lib/store';
import { useHistory } from '../../lib/historyStore';
import { useGit } from '../../lib/gitStore';
import { kunciPath } from '../../lib/pathKey';
import type { TimelineEntry } from '../../lib/types';
import { useT } from '../../lib/i18n';

const waktuSingkat = (ms: number) => {
  if (!ms) return '-';
  const d = new Date(ms);
  const kini = Date.now();
  const selisih = kini - ms;
  if (selisih < 60_000) return 'just now';
  if (selisih < 3_600_000) return `${Math.floor(selisih / 60_000)} minutes ago`;
  if (selisih < 86_400_000) return `${Math.floor(selisih / 3_600_000)} hours ago`;
  return d.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

function buatDiff(kiri: string, kanan: string, namaKiri: string, namaKanan: string): string {
  const a = kiri.split('\n');
  const b = kanan.split('\n');
  const out: string[] = [
    `diff --zephyr a/${namaKiri} b/${namaKanan}`,
    `--- a/${namaKiri}`,
    `+++ b/${namaKanan}`,
  ];

  if (a.length > 4000 || b.length > 4000) {
    const n = Math.max(a.length, b.length);
    out.push(`@@ -1,${a.length} +1,${b.length} @@`);
    for (let i = 0; i < n; i++) {
      if (a[i] === b[i]) out.push(` ${a[i] ?? ''}`);
      else {
        if (a[i] !== undefined) out.push(`-${a[i]}`);
        if (b[i] !== undefined) out.push(`+${b[i]}`);
      }
    }
    return out.join('\n');
  }

  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const baris: string[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      baris.push(` ${a[i]}`);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      baris.push(`-${a[i]}`);
      i++;
    } else {
      baris.push(`+${b[j]}`);
      j++;
    }
  }
  while (i < m) baris.push(`-${a[i++]}`);
  while (j < n) baris.push(`+${b[j++]}`);

  out.push(`@@ -1,${m} +1,${n} @@`);
  out.push(...baris);
  return out.join('\n');
}

export default function TimelineView() {
  const tr = useT();
  const tabs = useStore((s) => s.tabs);
  const activeTabId = useStore((s) => s.activeTabId);
  
  const pathAktif = tabs.find((t) => t.id === activeTabId)?.path ?? null;

  const timeline = useHistory((s) => s.timeline);
  const info = useHistory((s) => s.info);
  const loading = useHistory((s) => s.loading);
  const dipilih = useHistory((s) => s.dipilih);
  const muat = useHistory((s) => s.muat);
  const pilih = useHistory((s) => s.pilih);
  const restore = useHistory((s) => s.restore);
  const bersihkan = useHistory((s) => s.bersihkan);
  const snapshotSave = useHistory((s) => s.snapshotSave);
  const fileTimeline = useHistory((s) => s.file);

  const [terbuka, setTerbuka] = useState(true);

  useEffect(() => {
    if (!terbuka || !pathAktif) return;
    if (fileTimeline && kunciPath(fileTimeline) === kunciPath(pathAktif)) return;
    void muat(pathAktif);
  }, [pathAktif, terbuka, fileTimeline, muat]);

  const bukaDiff = async (e: TimelineEntry) => {
    if (!pathAktif) return;
    if (e.kind === 'commit') {
      
      const S = useStore.getState();
      S.setSettingsOpen(false);
      S.setActivity('scm');
      if (!S.sidebarVisible) S.toggleSidebar();
      return;
    }
    await pilih(e.id);
    const isi = useHistory.getState().isiSnapshot;
    if (isi === null) return;
    const tab = useStore.getState().tabs.find((t) => t.id === useStore.getState().activeTabId);
    const kini = tab?.content ?? '';
    const nama = pathAktif.split(/[\\/]/).pop() ?? pathAktif;
    
    useGit.setState({
      diff: {
        path: `${nama} (history ${waktuSingkat(e.timestampMs)})`,
        staged: false,
        text: buatDiff(isi, kini, `${nama}@${e.reason}`, nama),
        
        source: 'history',
      },
    });
  };

  if (!pathAktif) return null;

  return (
    <div className="timeline" data-testid="timeline">
      <button
        className="timeline-header"
        aria-expanded={terbuka}
        data-testid="timeline-toggle"
        onClick={() => setTerbuka((v) => !v)}
      >
        <svg viewBox="0 0 16 16" className="tl-caret" aria-hidden="true" data-open={terbuka ? '1' : '0'}>
          <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
        <span className="timeline-title">Timeline</span>
        <span className="timeline-count" data-testid="timeline-count">
          {timeline.length}
        </span>
      </button>

      {terbuka && (
        <div className="timeline-body">
          <div className="timeline-actions">
            <button
              className="btn btn-sm"
              data-testid="timeline-snapshot"
              onClick={() => void snapshotSave(pathAktif, 'manual')}
            >
              Snapshot
            </button>
            <button
              className="btn btn-sm"
              data-testid="timeline-refresh"
              onClick={() => void muat(pathAktif)}
            >
              Reload
            </button>
            <button
              className="btn btn-sm btn-danger"
              data-testid="timeline-clear"
              disabled={(info?.snapshots.length ?? 0) === 0}
              onClick={() => void bersihkan(pathAktif)}
            >
              Delete history
            </button>
          </div>

          {info?.skip ? (
            <p className="timeline-skip" data-testid="timeline-skip">
              Not snapshotted: {info.skip}
            </p>
          ) : null}

          {loading ? (
            <p className="side-muted">Loading…</p>
          ) : timeline.length === 0 ? (
            <p className="side-muted" data-testid="timeline-empty">
              {tr('No history yet. Save the file (Ctrl+S) to create a snapshot.')}
            </p>
          ) : (
            <ul className="timeline-list" data-testid="timeline-list">
              {timeline.map((e) => (
                <li
                  key={`${e.kind}-${e.id}`}
                  className={`timeline-item${dipilih === e.id ? ' is-active' : ''}`}
                  data-kind={e.kind}
                  data-tl-id={e.id}
                  data-testid="timeline-item"
                >
                  <button className="tl-main" onClick={() => void bukaDiff(e)} title={e.detail}>
                    <span className="tl-badge" data-kind={e.kind}>
                      {e.kind === 'commit' ? 'git' : 'local'}
                    </span>
                    <span className="tl-label">{e.label}</span>
                    <span className="tl-time">{waktuSingkat(e.timestampMs)}</span>
                  </button>
                  {e.kind === 'snapshot' && (
                    <button
                      className="tl-restore"
                      title={tr('Load this snapshot contents into the editor (not saved)')}
                      data-testid="timeline-restore"
                      onClick={() => void restore(e.id)}
                    >
                      Restore
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
