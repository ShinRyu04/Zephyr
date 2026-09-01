// SearchPanel.tsx — cari teks di seluruh workspace + replace.
// Hasil dikelompokkan per file; klik hasil = buka tab dan lompat ke baris.

import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../lib/store';
import { useExplorer } from '../../lib/explorerStore';
import { detectLang } from '../../lib/lang';
import FileIcon from '../editor/FileIcon';
import type { SearchHit } from '../../lib/types';

const baseOf = (p: string) => p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || p;

/** Potong preview agar match terlihat, dan bagi jadi 3 bagian untuk sorot. */
function splitPreview(hit: SearchHit) {
  const start = Math.max(0, hit.col - 1);
  const end = start + hit.matchLen;
  const line = hit.preview;
  // Geser jendela bila match jauh di kanan.
  const windowStart = start > 60 ? start - 30 : 0;
  const pre = line.slice(windowStart, start);
  const mid = line.slice(start, end);
  const post = line.slice(end, end + 120);
  return { pre: (windowStart > 0 ? '…' : '') + pre, mid, post };
}

export default function SearchPanel() {
  const workspace = useStore((s) => s.workspace);
  const openPathAt = useStore((s) => s.openPathAt);

  const query = useExplorer((s) => s.query);
  const glob = useExplorer((s) => s.glob);
  const replaceWith = useExplorer((s) => s.replaceWith);
  const caseSensitive = useExplorer((s) => s.caseSensitive);
  const regex = useExplorer((s) => s.regex);
  const searching = useExplorer((s) => s.searching);
  const hits = useExplorer((s) => s.hits);
  const filesScanned = useExplorer((s) => s.filesScanned);
  const truncated = useExplorer((s) => s.truncated);
  const searchError = useExplorer((s) => s.searchError);

  const setQuery = useExplorer((s) => s.setQuery);
  const setGlob = useExplorer((s) => s.setGlob);
  const setReplaceWith = useExplorer((s) => s.setReplaceWith);
  const toggleCase = useExplorer((s) => s.toggleCase);
  const toggleRegex = useExplorer((s) => s.toggleRegex);
  const runSearch = useExplorer((s) => s.runSearch);
  const replaceInFileFromResults = useExplorer((s) => s.replaceInFileFromResults);
  const replaceAllResults = useExplorer((s) => s.replaceAllResults);

  const [showReplace, setShowReplace] = useState(false);

  // Debounce pencarian saat mengetik (350ms).
  useEffect(() => {
    if (!query.trim()) return;
    const t = window.setTimeout(() => void runSearch(), 350);
    return () => window.clearTimeout(t);
  }, [query, glob, caseSensitive, regex, runSearch]);

  const grouped = useMemo(() => {
    const map = new Map<string, SearchHit[]>();
    for (const h of hits) {
      const list = map.get(h.path);
      if (list) list.push(h);
      else map.set(h.path, [h]);
    }
    return [...map.entries()];
  }, [hits]);

  return (
    <div className="side-panel search-panel">
      <div className="side-section">
        <div className="side-title">Search</div>

        {!workspace && <p className="side-muted">Buka folder dulu untuk mencari di workspace.</p>}

        <div className="search-row">
          <button
            className="find-toggle"
            title={showReplace ? 'Sembunyikan replace' : 'Tampilkan replace'}
            onClick={() => setShowReplace((v) => !v)}
          >
            {showReplace ? '▾' : '▸'}
          </button>
          <input
            className="search-input"
            placeholder="Cari di workspace"
            aria-label="Cari di workspace"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void runSearch();
            }}
          />
          <button
            className={`find-flag${caseSensitive ? ' is-on' : ''}`}
            title="Case sensitive"
            aria-pressed={caseSensitive}
            onClick={toggleCase}
          >
            Aa
          </button>
          <button
            className={`find-flag${regex ? ' is-on' : ''}`}
            title="Regular expression"
            aria-pressed={regex}
            onClick={toggleRegex}
          >
            .*
          </button>
        </div>

        {showReplace && (
          <div className="search-row">
            <span className="find-toggle" aria-hidden="true" />
            <input
              className="search-input"
              placeholder="Ganti dengan"
              aria-label="Ganti dengan"
              value={replaceWith}
              onChange={(e) => setReplaceWith(e.target.value)}
            />
            <button
              className="find-btn find-btn-wide"
              title="Ganti di semua file hasil pencarian"
              disabled={hits.length === 0}
              onClick={() => void replaceAllResults()}
            >
              Semua
            </button>
          </div>
        )}

        <div className="search-row">
          <span className="find-toggle" aria-hidden="true" />
          <input
            className="search-input"
            placeholder="Filter nama file (mis. *.ts)"
            aria-label="Filter nama file"
            value={glob}
            onChange={(e) => setGlob(e.target.value)}
          />
        </div>

        <div className="search-meta">
          {searching
            ? 'mencari…'
            : searchError
              ? searchError
              : query
                ? `${hits.length}${truncated ? '+' : ''} hasil di ${grouped.length} file (${filesScanned} file dipindai)`
                : ''}
        </div>
      </div>

      <div className="search-results">
        {grouped.map(([path, list]) => (
          <div className="sr-file" key={path}>
            <div className="sr-file-head" title={path}>
              <FileIcon lang={detectLang(path)} />
              <span className="sr-file-name">{baseOf(path)}</span>
              <span className="sr-count">{list.length}</span>
              {showReplace && (
                <button
                  className="sr-replace"
                  title="Ganti semua di file ini"
                  onClick={() => void replaceInFileFromResults(path)}
                >
                  ganti
                </button>
              )}
            </div>
            {list.map((h, i) => {
              const { pre, mid, post } = splitPreview(h);
              return (
                <button
                  className="sr-hit"
                  key={`${h.line}-${h.col}-${i}`}
                  title={`${path}:${h.line}:${h.col}`}
                  onClick={() => void openPathAt(h.path, h.line, h.col)}
                >
                  <span className="sr-line">{h.line}</span>
                  <span className="sr-text">
                    {pre}
                    <mark className="sr-mark">{mid}</mark>
                    {post}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
