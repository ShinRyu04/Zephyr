// FindBar.tsx — panel Find & Replace di dalam editor (bukan dialog browser).
// Query -> highlight semua, hitung match, next/prev, replace 1/semua, regex.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  SearchQuery,
  setSearchQuery,
  findNext,
  findPrevious,
  replaceNext,
  replaceAll,
  openSearchPanel,
  closeSearchPanel,
} from '@codemirror/search';
import { getActiveView } from '../../lib/editorRegistry';
import { useStore } from '../../lib/store';

export default function FindBar() {
  const open = useStore((s) => s.findOpen);
  const setFindOpen = useStore((s) => s.setFindOpen);
  const activeTabId = useStore((s) => s.activeTabId);

  const [query, setQuery] = useState('');
  const [replaceWith, setReplaceWith] = useState('');
  const [regex, setRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [showReplace, setShowReplace] = useState(false);
  const [count, setCount] = useState(0);
  const [invalid, setInvalid] = useState(false);
  /** fase 15.1: pencarian dihentikan karena melewati batas langkah. */
  const [tooMany, setTooMany] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Hitung jumlah match langsung dari dokumen (independen dari panel CM).
  const docText = () => getActiveView()?.state.doc.toString() ?? '';

  const recount = useMemo(
    () => () => {
      if (!query) {
        setCount(0);
        setInvalid(false);
        setTooMany(false);
        return;
      }
      const text = docText();
      try {
        const flags = caseSensitive ? 'g' : 'gi';
        const pattern = regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(pattern, flags);
        // fase 15.1: `String.match(/g/)` pada regex seperti `a+` di file besar
        // bisa menghasilkan ratusan ribu match dan menggantung UI beberapa
        // detik. Iterasi manual dengan BATAS LANGKAH: berhenti di 20.000 dan
        // beri tahu user, bukan diam-diam membeku. Match kosong (mis. `a*`)
        // juga harus memajukan lastIndex sendiri — kalau tidak loop-nya abadi.
        const LIMIT = 20000;
        let n = 0;
        let stopped = false;
        re.lastIndex = 0;
        for (;;) {
          const m = re.exec(text);
          if (!m) break;
          n++;
          if (m[0].length === 0) re.lastIndex++;
          if (re.lastIndex > text.length) break;
          if (n >= LIMIT) {
            stopped = true;
            break;
          }
        }
        setCount(n);
        setTooMany(stopped);
        setInvalid(false);
      } catch {
        setCount(0);
        setTooMany(false);
        setInvalid(true);
      }
    },
    [query, regex, caseSensitive],
  );

  // Terapkan query ke CodeMirror agar highlight & next/prev sinkron.
  useEffect(() => {
    const view = getActiveView();
    if (!view || !open) return;
    try {
      openSearchPanel(view);
      view.dispatch({
        effects: setSearchQuery.of(
          new SearchQuery({
            search: query,
            replace: replaceWith,
            regexp: regex,
            caseSensitive,
          }),
        ),
      });
      // Panel bawaan CM disembunyikan lewat CSS (kita pakai UI sendiri),
      // tapi harus terbuka supaya state pencarian aktif.
    } catch {
      /* query regex tidak valid — ditandai lewat `invalid` */
    }
    recount();
  }, [query, replaceWith, regex, caseSensitive, open, activeTabId, recount]);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else {
      const view = getActiveView();
      if (view) closeSearchPanel(view);
    }
  }, [open]);

  if (!open) return null;

  const act = (fn: (v: import('@codemirror/view').EditorView) => boolean) => {
    const view = getActiveView();
    if (!view) return;
    fn(view);
    view.focus();
    recount();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setFindOpen(false);
      getActiveView()?.focus();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      act(e.shiftKey ? findPrevious : findNext);
    }
  };

  return (
    <div className="find-bar" onKeyDown={onKeyDown}>
      <div className="find-row">
        <button
          className="find-toggle"
          title={showReplace ? 'Sembunyikan replace' : 'Tampilkan replace'}
          onClick={() => setShowReplace((v) => !v)}
        >
          {showReplace ? '▾' : '▸'}
        </button>

        <input
          ref={inputRef}
          className={`find-input${invalid ? ' is-invalid' : ''}`}
          placeholder="Cari"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Cari di file"
        />

        <button
          className={`find-flag${caseSensitive ? ' is-on' : ''}`}
          title="Case sensitive"
          aria-pressed={caseSensitive}
          onClick={() => setCaseSensitive((v) => !v)}
        >
          Aa
        </button>
        <button
          className={`find-flag${regex ? ' is-on' : ''}`}
          title="Regular expression"
          aria-pressed={regex}
          onClick={() => setRegex((v) => !v)}
        >
          .*
        </button>

        <span className="find-count" data-testid="find-count">
          {invalid
            ? 'regex tidak valid'
            : tooMany
              ? `20.000+ hasil (dihentikan)`
              : count > 0
                ? `${count} hasil`
                : query
                  ? 'tidak ada'
                  : ''}
        </span>

        <button className="find-btn" title="Sebelumnya (Shift+Enter)" onClick={() => act(findPrevious)}>
          ↑
        </button>
        <button className="find-btn" title="Berikutnya (Enter)" onClick={() => act(findNext)}>
          ↓
        </button>
        <button className="find-btn" title="Tutup (Esc)" onClick={() => setFindOpen(false)}>
          ✕
        </button>
      </div>

      {showReplace && (
        <div className="find-row">
          <span className="find-toggle" aria-hidden="true" />
          <input
            className="find-input"
            placeholder="Ganti dengan"
            value={replaceWith}
            onChange={(e) => setReplaceWith(e.target.value)}
            aria-label="Ganti dengan"
          />
          <button className="find-btn find-btn-wide" onClick={() => act(replaceNext)}>
            Ganti
          </button>
          <button className="find-btn find-btn-wide" onClick={() => act(replaceAll)}>
            Ganti semua
          </button>
        </div>
      )}
    </div>
  );
}
