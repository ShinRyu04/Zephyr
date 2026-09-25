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
import { useT } from '../../lib/i18n';

export default function FindBar() {
  const tr = useT();
  const open = useStore((s) => s.findOpen);
  const setFindOpen = useStore((s) => s.setFindOpen);
  const activeTabId = useStore((s) => s.activeTabId);

  const [query, setQuery] = useState('');
  const [replaceWith, setReplaceWith] = useState('');
  const [regex, setRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);

  const [inSelection, setInSelection] = useState(false);

  const [highlightAll, setHighlightAll] = useState(true);
  const [showReplace, setShowReplace] = useState(false);
  const [count, setCount] = useState(0);
  const [invalid, setInvalid] = useState(false);

  const [tooMany, setTooMany] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

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

      let text = docText();
      if (inSelection && view) {
        const sel = view.state.selection.main;
        if (!sel.empty) text = view.state.doc.sliceString(sel.from, sel.to);
      }
      try {
        const flags = caseSensitive ? 'g' : 'gi';
        let pattern = regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        if (wholeWord) {
          const kiri = /^\w/.test(query) ? '\\b' : '';
          const kanan = /\w$/.test(query) ? '\\b' : '';
          pattern = `${kiri}(?:${pattern})${kanan}`;
        }
        const re = new RegExp(pattern, flags);

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
      // but it must stay open for the search state to be active.
    } catch {
      /* invalid regex query, flagged through `invalid` */
    }
    recount();
  }, [query, replaceWith, regex, caseSensitive, wholeWord, open, activeTabId, recount]);

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
          title={showReplace ? tr('Sembunyikan replace') : tr('Tampilkan replace')}
          onClick={() => setShowReplace((v) => !v)}
        >
          {showReplace ? '▾' : '▸'}
        </button>

        <input
          ref={inputRef}
          className={`find-input${invalid ? ' is-invalid' : ''}`}
          data-testid="find-input"
           placeholder={tr('Cari')}
           value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={tr('Cari di file')}
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
          title={tr('Cari hanya di dalam seleksi')}
          aria-pressed={inSelection}
          onClick={() => setInSelection((v) => !v)}
        >
          ⌷
        </button>
        <button
          className={`find-flag${highlightAll ? ' is-on' : ''}`}
          data-testid="find-hl-all"
          title={tr('Sorot semua hasil')}
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

        <button className="find-btn" data-testid="find-prev" title={tr('Sebelumnya (Shift+Enter)')} onClick={() => act(findPrevious)}>
          ↑
        </button>
        <button className="find-btn" data-testid="find-next" title={tr('Berikutnya (Enter)')} onClick={() => act(findNext)}>
          ↓
        </button>
        <button
          className="find-btn"
          data-testid="find-select-all"
          title={tr('Pilih semua hasil (multi-cursor)')}
          onClick={() => act(selectMatches)}
        >
          ⋮
        </button>
        <button
          className="find-btn"
          data-testid="find-in-files"
          title={tr('Cari di semua file')}
          onClick={cariDiSemuaFile}
        >
          ⌕
        </button>
        <button className="find-btn" title={tr('Tutup (Esc)')} onClick={() => setFindOpen(false)}>
          ✕
        </button>
      </div>

      {showReplace && (
        <div className="find-row">
          <span className="find-toggle" aria-hidden="true" />
          <input
            className="find-input"
            data-testid="find-replace-input"
            placeholder={tr('Ganti dengan')}
            value={replaceWith}
            onChange={(e) => setReplaceWith(e.target.value)}
            aria-label={tr('Ganti dengan')}
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
