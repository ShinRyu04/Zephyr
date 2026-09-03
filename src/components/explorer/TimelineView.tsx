// TimelineView.tsx — Local History / Timeline (fase 26).
//
// Hidup di BAWAH file tree di panel Explorer, sama seperti VS Code: Timeline
// selalu tentang file yang sedang aktif, jadi menaruhnya di panel lain berarti
// user harus bolak-balik. Bisa dilipat karena tidak semua orang memerlukannya
// setiap saat.
//
// Diff snapshot memakai DiffViewer yang sudah ada (fase 10) lewat gitStore.diff:
// bentuk datanya unified diff, dan membuat penampil kedua hanya untuk history
// berarti dua tempat yang harus dijaga saat pewarnaan diff berubah.

import { useEffect, useState } from 'react';
import { useStore } from '../../lib/store';
import { useHistory } from '../../lib/historyStore';
import { useGit } from '../../lib/gitStore';
import { kunciPath } from '../../lib/pathKey';
import type { TimelineEntry } from '../../lib/types';

const waktuSingkat = (ms: number) => {
  if (!ms) return '—';
  const d = new Date(ms);
  const kini = Date.now();
  const selisih = kini - ms;
  if (selisih < 60_000) return 'baru saja';
  if (selisih < 3_600_000) return `${Math.floor(selisih / 60_000)} menit lalu`;
  if (selisih < 86_400_000) return `${Math.floor(selisih / 3_600_000)} jam lalu`;
  return d.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * Susun unified diff dari dua teks.
 *
 * Ditulis sendiri (LCS sederhana) alih-alih memanggil `git diff`: snapshot
 * TIDAK ada di dalam repo git, jadi git tidak punya objek untuk dibandingkan.
 * Batas 4000 baris menjaga LCS tetap murah — file lebih besar dari itu jatuh
 * ke perbandingan per baris tanpa penyelarasan.
 */
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

  // LCS panjang (tabel penuh; aman untuk <=4000 baris).
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
  const tabs = useStore((s) => s.tabs);
  const activeTabId = useStore((s) => s.activeTabId);
  // Selector WAJIB mengembalikan primitif: mengembalikan objek tab baru
  // memicu render tak berujung di zustand v5 (pelajaran fase 09).
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

  // Timeline mengikuti tab aktif.
  useEffect(() => {
    if (!terbuka || !pathAktif) return;
    if (fileTimeline && kunciPath(fileTimeline) === kunciPath(pathAktif)) return;
    void muat(pathAktif);
  }, [pathAktif, terbuka, fileTimeline, muat]);

  const bukaDiff = async (e: TimelineEntry) => {
    if (!pathAktif) return;
    if (e.kind === 'commit') {
      // Commit git bukan urusan Timeline: buka panel Source Control yang sudah
      // punya seluruh alur commit/diff-nya. Menduplikasi tampilan commit di
      // sini berarti dua tempat yang harus dijaga.
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
    // Kiri = riwayat, kanan = kini (urutan yang diminta brief 26).
    useGit.setState({
      diff: {
        path: `${nama} (riwayat ${waktuSingkat(e.timestampMs)})`,
        staged: false,
        text: buatDiff(isi, kini, `${nama}@${e.reason}`, nama),
        // WAJIB: tanpa penanda ini, refresh git berikutnya (jalan setiap file
        // disimpan) langsung menutup diff karena path label riwayat tidak ada
        // di status.changes.
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
              Muat ulang
            </button>
            <button
              className="btn btn-sm btn-danger"
              data-testid="timeline-clear"
              disabled={(info?.snapshots.length ?? 0) === 0}
              onClick={() => void bersihkan(pathAktif)}
            >
              Hapus riwayat
            </button>
          </div>

          {info?.skip ? (
            <p className="timeline-skip" data-testid="timeline-skip">
              Tidak disnapshot: {info.skip}
            </p>
          ) : null}

          {loading ? (
            <p className="side-muted">Memuat…</p>
          ) : timeline.length === 0 ? (
            <p className="side-muted" data-testid="timeline-empty">
              Belum ada riwayat. Simpan file (Ctrl+S) untuk membuat snapshot.
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
                      {e.kind === 'commit' ? 'git' : 'lokal'}
                    </span>
                    <span className="tl-label">{e.label}</span>
                    <span className="tl-time">{waktuSingkat(e.timestampMs)}</span>
                  </button>
                  {e.kind === 'snapshot' && (
                    <button
                      className="tl-restore"
                      title="Muat isi snapshot ini ke editor (belum disimpan)"
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
