// ProblemsView.tsx — tabel diagnostik (fase 20).
//
// Diagnostik ASLI datang dari fase 21 (LSP), 23 (tasks), dan 22 (debug).
// Fase ini menyediakan tampilan + jalur klik-ke-lokasi supaya fase-fase itu
// tinggal memanggil `setDiagnostics()`.
//
// Daftar di-virtualisasi manual (windowing) — brief fase 20 mewajibkannya.
// Tanpa itu satu proyek TypeScript besar bisa mengirim ribuan diagnostik dan
// React akan me-render semuanya.

import { useMemo, useRef, useState } from 'react';
import { useProblems, kunciPath, type Diagnostic, type Severity } from '../../lib/problemsStore';
import { useStore } from '../../lib/store';
import { revealPosition } from '../../lib/editorRegistry';

const ROW_H = 22;
/** baris ekstra di atas & bawah viewport supaya scroll tidak berkedip */
const PAD = 6;

const IKON: Record<Severity, string> = {
  error: '⊗',
  warning: '⚠',
  info: 'ⓘ',
  hint: '💡',
};

const namaFile = (p: string) => p.split(/[\\/]/).pop() ?? p;

export default function ProblemsView() {
  const byFile = useProblems((s) => s.byFile);
  const filter = useProblems((s) => s.filter);
  const activeOnly = useProblems((s) => s.activeOnly);
  const setFilter = useProblems((s) => s.setFilter);
  const setActiveOnly = useProblems((s) => s.setActiveOnly);
  const activeTabId = useStore((s) => s.activeTabId);
  const tabs = useStore((s) => s.tabs);
  const openPath = useStore((s) => s.openPath);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [tinggi, setTinggi] = useState(300);

  const filePathAktif = tabs.find((t) => t.id === activeTabId)?.path ?? null;

  // byFile dipakai sebagai dependency (Map baru setiap set) — `all()` sendiri
  // bukan selector supaya tidak mengembalikan array baru tiap render
  // (pelajaran fase 09: zustand v5 membandingkan hasil selector dengan ===).
  const baris = useMemo(() => {
    const semua = useProblems.getState().all();
    const q = filter.trim().toLowerCase();
    return semua.filter((d) => {
      if (activeOnly && filePathAktif && kunciPath(d.file) !== kunciPath(filePathAktif)) {
        return false;
      }
      if (!q) return true;
      return (
        d.message.toLowerCase().includes(q) ||
        d.source.toLowerCase().includes(q) ||
        (d.code ?? '').toLowerCase().includes(q) ||
        d.file.toLowerCase().includes(q)
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byFile, filter, activeOnly, filePathAktif]);

  const total = baris.length;
  const mulai = Math.max(0, Math.floor(scrollTop / ROW_H) - PAD);
  const jml = Math.ceil(tinggi / ROW_H) + PAD * 2;
  const tampil = baris.slice(mulai, mulai + jml);

  const buka = async (d: Diagnostic) => {
    try {
      await openPath(d.file);
      // Beri satu frame supaya CodeMirror sudah ter-mount sebelum reveal.
      window.setTimeout(() => revealPosition(d.line, d.column), 90);
    } catch {
      /* file mungkin sudah dihapus — diamkan, tabel tetap menampilkannya */
    }
  };

  return (
    <div className="pv-root" data-testid="problems-view">
      <div className="pv-toolbar">
        <input
          className="pv-filter"
          data-testid="pv-filter"
          placeholder="Filter (teks, source, kode, file)…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Filter diagnostik"
        />
        <label className="pv-check">
          <input
            type="checkbox"
            data-testid="pv-active-only"
            checked={activeOnly}
            onChange={(e) => setActiveOnly(e.target.checked)}
          />
          Hanya file aktif
        </label>
        <span className="pv-count" data-testid="pv-count">
          {total}
        </span>
      </div>

      {total === 0 ? (
        <p className="pv-empty" data-testid="pv-empty">
          Belum ada masalah terdeteksi. Diagnostik akan muncul di sini setelah language
          server (fase 21) atau task (fase 23) berjalan.
        </p>
      ) : (
        <div
          className="pv-list"
          ref={(el) => {
            scrollRef.current = el;
            if (el && el.clientHeight > 0 && Math.abs(el.clientHeight - tinggi) > 8) {
              setTinggi(el.clientHeight);
            }
          }}
          data-testid="pv-list"
          onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
          role="table"
          aria-rowcount={total}
        >
          <div className="pv-spacer" style={{ height: total * ROW_H }}>
            <div className="pv-window" style={{ transform: `translateY(${mulai * ROW_H}px)` }}>
              {tampil.map((d, i) => (
                <button
                  key={`${d.file}:${d.line}:${d.column}:${mulai + i}`}
                  className="pv-row"
                  data-testid="pv-row"
                  data-severity={d.severity}
                  role="row"
                  style={{ height: ROW_H }}
                  onClick={() => void buka(d)}
                  title={`${d.file}:${d.line}:${d.column}`}
                >
                  <span className={`pv-sev is-${d.severity}`} aria-label={d.severity}>
                    {IKON[d.severity]}
                  </span>
                  <span className="pv-msg">{d.message}</span>
                  <span className="pv-src">{d.source}</span>
                  <span className="pv-code">{d.code ?? ''}</span>
                  <span className="pv-loc">
                    {namaFile(d.file)}:{d.line}:{d.column}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
