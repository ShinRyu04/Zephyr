// CodeMirrorEditor.tsx — instance CodeMirror 6 per tab.
// Catatan RAM (PRD R3): view hanya dibuat untuk tab AKTIF; tab non-aktif
// tidak punya EditorView sama sekali, kontennya hidup di store.

import { useEffect, useRef } from 'react';
import { EditorState, Compartment, type Extension } from '@codemirror/state';
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  drawSelection,
  rectangularSelection,
  crosshairCursor,
  dropCursor,
} from '@codemirror/view';
import {
  history,
  historyKeymap,
  defaultKeymap,
  indentWithTab,
  toggleComment,
  deleteLine,
  insertBlankLine,
  cursorMatchingBracket,
  selectLine,
} from '@codemirror/commands';
import {
  bracketMatching,
  indentOnInput,
  indentUnit,
  syntaxHighlighting,
  defaultHighlightStyle,
} from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap, autocompletion, completionKeymap } from '@codemirror/autocomplete';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { lintKeymap } from '@codemirror/lint';
import { highlightWhitespace } from '@codemirror/view';
import { useStore } from '../../lib/store';
import { loadLangExtension } from '../../lib/lang';
import { zephyrHighlight, editorTheme } from '../../lib/cmTheme';
import { registerFlush, setActiveView, unregisterFlush } from '../../lib/editorRegistry';
import type { Tab } from '../../lib/types';

interface Props {
  tab: Tab;
}

const DEBOUNCE_MS = 300;

export default function CodeMirrorEditor({ tab }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const wrapComp = useRef(new Compartment());
  const tabComp = useRef(new Compartment());
  const langComp = useRef(new Compartment());
  const wsComp = useRef(new Compartment());
  const themeComp = useRef(new Compartment());
  const pending = useRef<number | null>(null);

  const updateTabContent = useStore((s) => s.updateTabContent);
  const setCursor = useStore((s) => s.setCursor);
  const editorSettings = useStore((s) => s.settings.editor);
  const general = useStore((s) => s.settings.general);
  /** Tema aktif (id yang benar-benar terpasang di <html>) — fase 13. */
  const themeId = useStore((s) => s.activeTheme);

  // fase 15.1: tab read-only (file >4MB / UTF-16). Ekstensi berat DILEPAS —
  // 5MB JSON dengan bracket matching + highlight aktif membekukan UI beberapa
  // detik; tanpa itu file terbuka mulus dan tetap bisa dibaca/di-scroll.
  const readOnly = tab.readOnly === true;

  // Bangun view sekali per tab (id berubah = tab lain).
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const flush = () => {
      const view = viewRef.current;
      if (!view) return;
      if (pending.current !== null) {
        window.clearTimeout(pending.current);
        pending.current = null;
      }
      updateTabContent(tab.id, view.state.doc.toString());
    };

    const baseKeymap = keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...completionKeymap,
      ...lintKeymap,
      indentWithTab,
      // Multi-cursor & edit baris (PRD A10)
      { key: 'Mod-/', run: toggleComment },
      { key: 'Shift-Mod-k', run: deleteLine },
      { key: 'Mod-l', run: selectLine },
      { key: 'Shift-Mod-\\', run: cursorMatchingBracket },
      { key: 'Mod-Enter', run: insertBlankLine },
    ]);

    const extensions: Extension[] = [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightSpecialChars(),
      history(),
      drawSelection(),
      dropCursor(),
      EditorState.allowMultipleSelections.of(true),
      // Mode ringan (fase 15.1): file besar / UTF-16 dibuka baca-saja tanpa
      // indentOnInput, bracket matching, autocompletion, atau highlight
      // seleksi — semuanya berjalan per dokumen dan itulah yang membekukan
      // editor pada JSON 5MB.
      ...(readOnly
        ? [EditorState.readOnly.of(true), EditorView.editable.of(false)]
        : [
            indentOnInput(),
            bracketMatching(),
            closeBrackets(),
            autocompletion(),
            highlightSelectionMatches(),
          ]),
      rectangularSelection(),
      crosshairCursor(),
      highlightActiveLine(),
      // foldGutter SENGAJA tidak dipakai (hemat RAM, sesuai fase 03).
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      zephyrHighlight,
      themeComp.current.of(editorTheme(themeId)),
      baseKeymap,
      langComp.current.of([]),
      wsComp.current.of(editorSettings.showWhitespace ? highlightWhitespace() : []),
      wrapComp.current.of(editorSettings.wordWrap ? EditorView.lineWrapping : []),
      tabComp.current.of(indentUnit.of(editorSettings.insertSpaces ? ' '.repeat(editorSettings.tabSize) : '\t')),
      EditorState.tabSize.of(editorSettings.tabSize),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) {
          if (pending.current !== null) window.clearTimeout(pending.current);
          pending.current = window.setTimeout(() => {
            pending.current = null;
            updateTabContent(tab.id, u.state.doc.toString());
          }, DEBOUNCE_MS);
        }
        if (u.selectionSet || u.docChanged) {
          const pos = u.state.selection.main.head;
          const line = u.state.doc.lineAt(pos);
          setCursor(line.number, pos - line.from + 1);
        }
      }),
    ];

    const view = new EditorView({
      state: EditorState.create({ doc: tab.content, extensions }),
      parent: host,
    });
    viewRef.current = view;
    setActiveView(view);
    registerFlush(tab.id, flush);
    view.focus();

    const pos = view.state.selection.main.head;
    const line = view.state.doc.lineAt(pos);
    setCursor(line.number, pos - line.from + 1);

    return () => {
      flush();
      unregisterFlush(tab.id);
      setActiveView(null);
      view.destroy();
      viewRef.current = null;
    };
    // Sengaja hanya bergantung pada id tab: perubahan setting ditangani
    // effect terpisah lewat compartment (tanpa rebuild view).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.id]);

  // Konten diganti dari luar (mis. reload file / restore) -> sinkronkan doc.
  // fase 15.1: perubahan dilakukan sebagai SATU transaksi biasa, bukan rebuild
  // view — history CM6 tetap utuh, jadi Ctrl+Z setelah file berubah di disk
  // mengembalikan isi sebelumnya alih-alih tidak melakukan apa pun.
  // `annotations: Transaction.addToHistory` dibiarkan default (true) supaya
  // langkah reload sendiri bisa di-undo.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== tab.content) {
      const sel = view.state.selection.main;
      view.dispatch({
        changes: { from: 0, to: current.length, insert: tab.content },
        // Kursor dijaga di posisi yang sama (di-clamp ke panjang baru) supaya
        // user tidak terlempar ke awal file setiap kali disk berubah.
        selection: {
          anchor: Math.min(sel.anchor, tab.content.length),
          head: Math.min(sel.head, tab.content.length),
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.content]);

  // Bahasa berubah (mis. setelah Save As) tanpa rebuild view.
  // Import parser dilakukan dinamis; abaikan hasil kalau view sudah mati.
  // fase 15.1: file read-only besar TIDAK diberi parser — parse 5MB JSON
  // lewat Lezer memakan detik dan puluhan MB tanpa manfaat untuk file yang
  // hanya dibaca.
  useEffect(() => {
    if (readOnly) {
      viewRef.current?.dispatch({ effects: langComp.current.reconfigure([]) });
      return;
    }
    let alive = true;
    void loadLangExtension(tab.lang).then((ext) => {
      if (!alive) return;
      viewRef.current?.dispatch({
        effects: langComp.current.reconfigure(ext),
      });
    });
    return () => {
      alive = false;
    };
  }, [tab.lang, tab.id, readOnly]);

  // Tema berganti -> tukar EditorView.theme lewat compartment (fase 13).
  // Warna sendiri datang dari CSS var, tapi flag `dark` CM6 harus ikut
  // supaya default internal CM (panel, scrollbar) tidak salah kontras.
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: themeComp.current.reconfigure(editorTheme(themeId)),
    });
  }, [themeId]);

  // Setting editor berubah -> reconfigure compartment saja.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: [
        wrapComp.current.reconfigure(editorSettings.wordWrap ? EditorView.lineWrapping : []),
        tabComp.current.reconfigure(
          indentUnit.of(editorSettings.insertSpaces ? ' '.repeat(editorSettings.tabSize) : '\t'),
        ),
        wsComp.current.reconfigure(editorSettings.showWhitespace ? highlightWhitespace() : []),
      ],
    });
  }, [
    editorSettings.wordWrap,
    editorSettings.insertSpaces,
    editorSettings.tabSize,
    editorSettings.showWhitespace,
  ]);

  return (
    <div
      ref={hostRef}
      className="zephyr-cm-host"
      data-cursor-style={editorSettings.cursorStyle}
      data-smooth={editorSettings.smoothScroll ? '1' : '0'}
      data-readonly={readOnly ? '1' : '0'}
      style={{
        fontSize: `${general.fontSize}px`,
        fontFamily: general.fontFamily,
        // dipakai oleh .cm-scroller di cmTheme.ts
        ['--editor-line-height' as string]: String(general.lineHeight),
      }}
    />
  );
}
