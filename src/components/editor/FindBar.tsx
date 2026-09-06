// FindBar.tsx — panel Find & Replace di dalam editor (bukan dialog browser).
// Query -> highlight semua, hitung match, next/prev, replace 1/semua, regex.
//
// FASE 24 menambah: whole word, find in selection, highlight all (toggle), dan
// tombol "cari di semua file" yang menyerahkan query ke panel Search (fase 25).
// Semua flag disimpan di state komponen — bukan settings — karena ini pilihan
// per-pencarian, bukan preferensi jangka panjang.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  SearchQuery,
  setSearchQuery,
  findNext,
  findPrevious,
  replaceNext,
  replaceAll,
  openSearchPanel,
  closeSearchPanel,
  selectMatches,
} from '@codemirror/search';
import { getActiveView } from '../../lib/editorRegistry';
import { useStore } from '../../lib/store';
import { notifyInfo } from '../../lib/notificationStore';

export default function FindBar() {
  const open = useStore((s) => s.findOpen);
  const setFindOpen = useStore((s) => s.setFindOpen);
  const activeTabId = useStore((s) => s.activeTabId);

  const [query, setQuery] = useState('');
  const [replaceWith, setReplaceWith] = useState('');
  const [regex, setRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  /** batasi pencarian ke teks yang sedang diseleksi */
  const [inSelection, setInSelection] = useState(false);
  /** highlight semua hasil (bukan hanya yang aktif) */
  const [highlightAll, setHighlightAll] = useState(true);
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
      const view = getActiveView();
      // "Find in selection": hanya hitung di dalam rentang terpilih, supaya
      // angka yang ditampilkan cocok dengan apa yang benar-benar akan diganti.
      let text = docText();
      if (inSelection && view) {
        const sel = view.state.selection.main;
        if (!sel.empty) text = view.state.doc.sliceString(sel.from, sel.to);
      }
      try {
        const flags = caseSensitive ? 'g' : 'gi';
        let pattern = regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Whole word: \b tidak berfungsi kalau query diawali/diakhiri simbol,
        // jadi dipasang hanya ketika ujungnya karakter kata — persis seperti
        // yang dilakukan CodeMirror sendiri.
        if (wholeWord) {
          const kiri = /^\w/.test(query) ? '\\b' : '';
          const kanan = /\w$/.test(query) ? '\\b' : '';
          pattern = `${kiri}(?:${pattern})${kanan}`;
        }
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
    [query, regex, caseSensitive, wholeWord, inSelection],
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
            wholeWord,
          }),
        ),
      });
      // Panel bawaan CM disembunyikan lewat CSS (kita pakai UI sendiri),
      // tapi harus terbuka supaya state pencarian aktif.
    } catch {
      /* query regex tidak valid — ditandai lewat `invalid` */
    }
    recount();
  }, [query, replaceWith, regex, caseSensitive, wholeWord, open, activeTabId, recount]);

  // Highlight all: kelas di <body> mengaktifkan aturan CSS untuk
  // .cm-searchMatch (default CodeMirror hanya menonjolkan match aktif).
  useEffect(() => {
    document.body.classList.toggle('find-highlight-all', open && highlightAll);
    return () => document.body.classList.remove('find-highlight-all');
  }, [open, highlightAll]);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else {
      const view = getActiveView();
      if (view) closeSearchPanel(view);
    }
  }, [open]);

  const cariDiSemuaFile = useCallback(() => {
    if (!query) return;
    // Panel Search adalah fase 25. Sampai ada, query diserahkan lewat event
    // window + notifikasi, BUKAN tombol mati: jalurnya sudah benar, yang
    // menangkap event tinggal dipasang nanti.
    const ev = new CustomEvent('zephyr-search-in-files', {
      detail: { query, regex, caseSensitive, wholeWord },
    });
    const tertangkap = !window.dispatchEvent(ev) || false;
    if (!tertangkap) {
      notifyInfo(`Cari "${query}" di semua file — panel Search ada di sidebar`);
    }
  }, [query, regex, caseSensitive, wholeWord]);

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
    <div className="find-bar" data-testid="find-bar" onKeyDown={onKeyDown}>
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
          data-testid="find-input"
          placeholder="Cari"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Cari di file"
        />

        <button
          className={`find-flag${caseSensitive ? ' is-on' : ''}`}
          data-testid="find-case"
          title="Case sensitive"
          aria-pressed={caseSensitive}
          onClick={() => setCaseSensitive((v) => !v)}
        >
          Aa
        </button>
        <button
          className={`find-flag${wholeWord ? ' is-on' : ''}`}
          data-testid="find-word"
          title="Whole word"
          aria-pressed={wholeWord}
          onClick={() => setWholeWord((v) => !v)}
        >
          ab
        </button>
        <button
          className={`find-flag${regex ? ' is-on' : ''}`}
          data-testid="find-regex"
          title="Regular expression"
          aria-pressed={regex}
          onClick={() => setRegex((v) => !v)}
        >
          .*
        </button>
        <button
          className={`find-flag${inSelection ? ' is-on' : ''}`}
          data-testid="find-in-sel"
          title="Cari hanya di dalam seleksi"
          aria-pressed={inSelection}
          onClick={() => setInSelection((v) => !v)}
        >
          ⌷
        </button>
        <button
          className={`find-flag${highlightAll ? ' is-on' : ''}`}
          data-testid="find-hl-all"
          title="Sorot semua hasil"
          aria-pressed={highlightAll}
          onClick={() => setHighlightAll((v) => !v)}
        >
          ≡
        </button>

        <span className="find-count" data-testid="find-count">
          {invalid
            ? 'regex tidak valid'
            : tooMany
              ? `20.000+ hasil (dihentikan)`
              : count > 0
                ? `${count} hasil${inSelection ? ' (seleksi)' : ''}`
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
        <button
          className="find-btn"
          data-testid="find-select-all"
          title="Pilih semua hasil (multi-cursor)"
          onClick={() => act(selectMatches)}
        >
          ⋮
        </button>
        <button
          className="find-btn"
          data-testid="find-in-files"
          title="Cari di semua file"
          onClick={cariDiSemuaFile}
        >
          ⌕
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
            data-testid="find-replace-input"
            placeholder="Ganti dengan"
            value={replaceWith}
            onChange={(e) => setReplaceWith(e.target.value)}
            aria-label="Ganti dengan"
          />
          <button className="find-btn find-btn-wide" onClick={() => act(replaceNext)}>
            Ganti
          </button>
          <button
            className="find-btn find-btn-wide"
            data-testid="find-replace-all"
            onClick={() => act(replaceAll)}
          >
            Ganti semua
          </button>
        </div>
      )}
    </div>
  );
}
