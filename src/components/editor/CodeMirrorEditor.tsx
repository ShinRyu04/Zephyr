// CodeMirrorEditor.tsx — instance CodeMirror 6 per tab.
// Catatan RAM (PRD R3): view hanya dibuat untuk tab AKTIF; tab non-aktif
// tidak punya EditorView sama sekali, kontennya hidup di store.

import { useEffect, useRef, useState } from 'react';
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
  // fase 24: multi-cursor & pemindahan baris
  moveLineUp,
  moveLineDown,
  copyLineUp,
  copyLineDown,
  addCursorAbove,
  addCursorBelow,
  simplifySelection,
} from '@codemirror/commands';
import {
  bracketMatching,
  indentOnInput,
  indentUnit,
  syntaxHighlighting,
  defaultHighlightStyle,
} from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap, autocompletion, completionKeymap } from '@codemirror/autocomplete';
import { highlightSelectionMatches, searchKeymap, selectNextOccurrence } from '@codemirror/search';
import { lintKeymap } from '@codemirror/lint';
import { highlightWhitespace } from '@codemirror/view';
import { useStore } from '../../lib/store';
import { extensiUntukFile } from '../../lib/lang';
import { zephyrHighlight, editorTheme } from '../../lib/cmTheme';
import { registerFlush, setActiveView, unregisterFlush } from '../../lib/editorRegistry';
import { useProblems, kunciPath, type Diagnostic } from '../../lib/problemsStore';
import { diagCompartment, diagnosticsGutter } from '../../lib/diagnosticsGutter';
import {
  bpCompartment,
  barisAktifCompartment,
  breakpointGutter,
  barisAktifExt,
} from '../../lib/breakpointGutter';
import { useDebug } from '../../lib/debugStore';
import { useLsp } from '../../lib/lspStore';
import { serverForPath } from '../../lib/lsp';
import { lspAutocompletion, lspHover, squiggleCompartment, squiggleFor } from '../../lib/lspCm';
import { bracketPairColors, indentGuides } from '../../lib/cmIndent';
import { colorDecorators, unicodeHighlight } from '../../lib/cmColor';
import Minimap from './Minimap';
import Breadcrumbs from './Breadcrumbs';
import StickyScroll from './StickyScroll';
import type { EditorSettings, Tab } from '../../lib/types';

interface Props {
  tab: Tab;
}

const DEBOUNCE_MS = 300;
/** didChange ke LSP lebih cepat dari simpan-ke-store supaya diagnostics responsif. */
const LSP_DEBOUNCE_MS = 350;

/** Referensi stabil: selector zustand v5 membandingkan hasil dengan ===,
 *  jadi `?? []` inline akan memicu render tak berhingga (pelajaran fase 09). */
const EMPTY_DIAG: Diagnostic[] = [];

/**
 * Ekstensi "editor extras" fase 24 yang bisa dinyalakan/dimatikan lewat
 * Settings. Dikumpulkan di satu tempat supaya toggle = satu reconfigure.
 *
 * Tab read-only (fase 15.1) tidak mendapat apa pun: file 5MB yang dibuka
 * baca-saja justru yang paling rentan membeku, dan semua fitur di bawah ini
 * memproses viewport pada setiap update.
 */
function extrasEditor(e: EditorSettings, readOnly: boolean): Extension[] {
  if (readOnly) return [];
  const out: Extension[] = [];
  if (e.indentGuides) out.push(indentGuides());
  if (e.bracketPairColorization) out.push(bracketPairColors());
  if (e.colorDecorators) out.push(colorDecorators());
  if (e.unicodeHighlight) out.push(unicodeHighlight());
  return out;
}

/** Naik setiap loader ekstensi selesai — memicu editor memasang ulang parser. */
export const naikkanExtVersi = () => {
  window.dispatchEvent(new Event('zephyr-ext-loaded'));
};

export default function CodeMirrorEditor({ tab }: Props) {
  // fase 19: dinaikkan lewat event `zephyr-ext-loaded` saat loader ekstensi
  // selesai, supaya file .toml/.lua langsung dapat parser tanpa reload.
  const [extVersi, setExtVersi] = useState(0);
  useEffect(() => {
    const on = () => setExtVersi((v) => v + 1);
    window.addEventListener('zephyr-ext-loaded', on);
    return () => window.removeEventListener('zephyr-ext-loaded', on);
  }, []);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const wrapComp = useRef(new Compartment());
  const tabComp = useRef(new Compartment());
  const langComp = useRef(new Compartment());
  const wsComp = useRef(new Compartment());
  const themeComp = useRef(new Compartment());
  /** fase 24: extras yang bisa di-toggle tanpa rebuild view */
  const extrasComp = useRef(new Compartment());
  const pending = useRef<number | null>(null);
  /** debounce didChange LSP, terpisah dari debounce simpan-ke-store */
  const lspPending = useRef<number | null>(null);

  /** fase 24: naik setiap dokumen berubah — dipakai minimap, breadcrumbs, dan
   *  sticky scroll untuk tahu kapan harus menghitung ulang. View disimpan di
   *  ref (tidak memicu render), jadi butuh state terpisah agar anak ikut. */
  const [viewSiap, setViewSiap] = useState(0);
  const [docVersion, setDocVersion] = useState(0);
  const [barisKursor, setBarisKursor] = useState(1);

  const updateTabContent = useStore((s) => s.updateTabContent);
  const setCursor = useStore((s) => s.setCursor);
  const editorSettings = useStore((s) => s.settings.editor);
  const general = useStore((s) => s.settings.general);
  /** Tema aktif (id yang benar-benar terpasang di <html>) — fase 13. */
  const themeId = useStore((s) => s.activeTheme);

  // fase 15.1: tab read-only (file >4MB / UTF-16). Ekstensi berat DILEPAS —
  // 5MB JSON dengan bracket matching + highlight aktif membekukan UI beberapa
  // detik; tanpa itu file terbuka mulus dan tetap bisa dibaca/di-scroll.
  // fase 16.2: mode penghemat RAM memaksa smoothScroll & minimap off, terlepas
  // dari isi settings.editor — supaya satu tombol benar-benar berpengaruh dan
  // user tidak perlu mematikan tiga hal satu-satu.
  const lowRam = useStore((s) => s.settings.general.lowRam === true);
  const readOnly = tab.readOnly === true;

  // FASE 21: apakah file ini punya language server? Dihitung sekali per tab —
  // extension CodeMirror dibangun saat view dibuat dan tidak bisa ditambah
  // belakangan tanpa rebuild (yang membuang undo history, pelajaran fase 13).
  const adaLsp = !readOnly && !!tab.path && !!serverForPath(tab.path);

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
      // fase 24: multi-cursor polish. Ctrl+D & Alt+Up/Down memang ada di
      // searchKeymap/defaultKeymap, tapi didaftarkan ULANG di sini supaya
      // urutannya di atas keduanya — chord global fase 18 tidak boleh
      // mendahului editor untuk tombol yang jelas milik editor.
      { key: 'Mod-d', run: selectNextOccurrence, preventDefault: true },
      { key: 'Alt-ArrowUp', run: moveLineUp, preventDefault: true },
      { key: 'Alt-ArrowDown', run: moveLineDown, preventDefault: true },
      { key: 'Shift-Alt-ArrowUp', run: copyLineUp, preventDefault: true },
      { key: 'Shift-Alt-ArrowDown', run: copyLineDown, preventDefault: true },
      { key: 'Mod-Alt-ArrowUp', run: addCursorAbove, preventDefault: true },
      { key: 'Mod-Alt-ArrowDown', run: addCursorBelow, preventDefault: true },
      { key: 'Escape', run: simplifySelection },
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
            // FASE 21: kalau ada language server untuk file ini, completion
            // datang dari LSP (override); kalau tidak, autocompletion bawaan
            // CodeMirror tetap dipakai. Satu `autocompletion()` saja — dua
            // instance membuat dua popup bersaing.
            adaLsp ? lspAutocompletion(tab.path ?? '') : autocompletion(),
            highlightSelectionMatches(),
            ...(adaLsp ? [lspHover(tab.path ?? '')] : []),
          ]),
      rectangularSelection(),
      crosshairCursor(),
      highlightActiveLine(),
      // foldGutter SENGAJA tidak dipakai (hemat RAM, sesuai fase 03).
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      zephyrHighlight,
      themeComp.current.of(editorTheme(themeId)),
      diagCompartment.of([]),
      // FASE 22: gutter breakpoint + highlight baris aktif. Compartment
      // terpisah dari diagnostik supaya keduanya bisa di-update sendiri.
      bpCompartment.of([]),
      barisAktifCompartment.of([]),
      squiggleCompartment.of([]),
      // fase 24: extras dikumpulkan di satu compartment supaya toggle Settings
      // hanya perlu reconfigure — rebuild view membuang undo history (fase 13).
      extrasComp.current.of(extrasEditor(editorSettings, readOnly)),
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
          // FASE 21: kirim didChange ke language server dengan debounce
          // sendiri (lebih cepat dari simpan-ke-store) supaya diagnostics
          // terasa langsung tapi tidak satu request per ketikan.
          if (adaLsp && tab.path) {
            if (lspPending.current !== null) window.clearTimeout(lspPending.current);
            const teks = u.state.doc.toString();
            const p = tab.path;
            lspPending.current = window.setTimeout(() => {
              lspPending.current = null;
              void useLsp.getState().changeDoc(p, teks);
            }, LSP_DEBOUNCE_MS);
          }
        }
        if (u.selectionSet || u.docChanged) {
          const pos = u.state.selection.main.head;
          const line = u.state.doc.lineAt(pos);
          setCursor(line.number, pos - line.from + 1);
          // fase 24: breadcrumbs butuh baris kursor. State hanya diubah kalau
          // barisnya BENAR-BENAR pindah — kalau ikut setiap kolom, breadcrumbs
          // re-render pada setiap penekanan panah kiri/kanan.
          setBarisKursor((lama) => (lama === line.number ? lama : line.number));
        }
        if (u.docChanged) setDocVersion((v) => v + 1);
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
    // fase 24: beri tahu anak (minimap/breadcrumbs/sticky) bahwa view sudah ada.
    setViewSiap((n) => n + 1);
    setDocVersion((v) => v + 1);

    // FASE 21: didOpen setelah view siap. Server di-start lazy di dalam
    // openDoc → ensureFor, jadi membuka file .md tidak menyalakan tsserver.
    if (adaLsp && tab.path) {
      const p = tab.path;
      const def = serverForPath(p);
      void useLsp.getState().openDoc(p, tab.content, def?.languageId ?? 'plaintext');
    }

    const pos = view.state.selection.main.head;
    const line = view.state.doc.lineAt(pos);
    setCursor(line.number, pos - line.from + 1);

    return () => {
      flush();
      if (lspPending.current !== null) window.clearTimeout(lspPending.current);
      unregisterFlush(tab.id);
      setActiveView(null);
      view.destroy();
      viewRef.current = null;
      // didClose supaya server tahu dokumen tidak dipakai lagi (dan bisa
      // dimatikan saat idle — V5).
      if (adaLsp && tab.path) void useLsp.getState().closeDoc(tab.path);
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
    // fase 19: satu pintu — parser bawaan ATAU parser dari ekstensi, plus
    // completion snippet ekstensi untuk bahasa itu (lihat lang.ts).
    void extensiUntukFile(tab.path ?? tab.name).then(({ ext }) => {
      if (!alive) return;
      viewRef.current?.dispatch({
        effects: langComp.current.reconfigure(ext),
      });
    });
    return () => {
      alive = false;
    };
  }, [tab.lang, tab.id, tab.path, tab.name, readOnly, extVersi]);

  // Tema berganti -> tukar EditorView.theme lewat compartment (fase 13).
  // Warna sendiri datang dari CSS var, tapi flag `dark` CM6 harus ikut
  // supaya default internal CM (panel, scrollbar) tidak salah kontras.
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: themeComp.current.reconfigure(editorTheme(themeId)),
    });
  }, [themeId]);

  // FASE 20: gutter marker diagnostik. Compartment di-reconfigure, bukan
  // rebuild view — rebuild membuang undo history + posisi kursor (fase 13).
  // Squiggle inline BUKAN di sini: itu pekerjaan fase 21 (LSP).
  const diagList = useProblems((s) =>
    tab.path ? s.byFile.get(kunciPath(tab.path)) ?? EMPTY_DIAG : EMPTY_DIAG,
  );
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: [
        diagCompartment.reconfigure(diagnosticsGutter(diagList, view.state.doc.lines)),
        // FASE 21: squiggle inline. Dipisah dari gutter supaya keduanya bisa
        // di-update independen dan tetap satu sumber data (problemsStore).
        squiggleCompartment.reconfigure(
          diagList.length === 0
            ? []
            : EditorView.decorations.of(squiggleFor(diagList, view)),
        ),
      ],
    });
  }, [diagList]);

  // FASE 22: gutter breakpoint. Daftar diambil per FILE supaya klik di tab lain
  // tidak memicu render ulang tab ini.
  //
  // Selector mengembalikan array — dan zustand v5 membandingkannya dengan ===
  // sehingga array baru tiap render memicu loop tak berujung (pelajaran fase
  // 09). Karena itu yang diambil adalah string ringkas, lalu daftar aslinya
  // dibaca dari getState() di dalam effect.
  const bpKunci = useDebug((s) =>
    tab.path
      ? s.breakpoints
          .filter((b) => kunciPath(b.path) === kunciPath(tab.path as string))
          .map((b) => `${b.line}:${b.verified ? 1 : 0}:${b.enabled ? 1 : 0}`)
          .join(',')
      : '',
  );
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !tab.path) return;
    const daftar = useDebug.getState().breakpointsUntuk(tab.path);
    view.dispatch({
      effects: bpCompartment.reconfigure(
        breakpointGutter(daftar, (line) => {
          void useDebug.getState().toggleBreakpoint(tab.path as string, line);
        }),
      ),
    });
  }, [bpKunci, tab.path]);

  // FASE 22: highlight baris yang sedang dieksekusi (kuning) saat paused.
  const barisAktif = useDebug((s) =>
    s.barisAktif && tab.path && kunciPath(s.barisAktif.path) === kunciPath(tab.path)
      ? s.barisAktif.line
      : null,
  );
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: barisAktifCompartment.reconfigure(barisAktifExt(barisAktif)),
    });
  }, [barisAktif]);

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

  // fase 24: toggle extras -> reconfigure compartment (bukan rebuild view).
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: extrasComp.current.reconfigure(extrasEditor(editorSettings, readOnly)),
    });
  }, [
    editorSettings.indentGuides,
    editorSettings.bracketPairColorization,
    editorSettings.colorDecorators,
    editorSettings.unicodeHighlight,
    readOnly,
  ]);

  // fase 24: minimap & sticky dipaksa mati di lowRam / read-only — konsisten
  // dengan fase 16.2 (satu tombol lowRam harus benar-benar berpengaruh).
  const extrasAktif = !readOnly && !lowRam;
  const tampilMinimap = extrasAktif && editorSettings.minimap;
  const tampilBreadcrumbs = !readOnly && editorSettings.breadcrumbs;
  const tampilSticky = extrasAktif && editorSettings.stickyScroll;
  // viewSiap dipakai sebagai dependensi eksplisit: view hidup di ref, jadi
  // tanpa ini anak-anak akan menerima `null` selamanya pada render pertama.
  const view = viewSiap > 0 ? viewRef.current : null;

  return (
    <div className="cm-wrap" data-testid="cm-wrap">
      {tampilBreadcrumbs && (
        <Breadcrumbs
          view={view}
          path={tab.path ?? undefined}
          docVersion={docVersion}
          barisKursor={barisKursor}
        />
      )}
      <div className="cm-body">
        <div
          ref={hostRef}
          className="zephyr-cm-host"
          data-cursor-style={editorSettings.cursorStyle}
          data-smooth={editorSettings.smoothScroll && !lowRam ? '1' : '0'}
          data-lowram={lowRam ? '1' : '0'}
          data-readonly={readOnly ? '1' : '0'}
          style={{
            fontSize: `${general.fontSize}px`,
            fontFamily: general.fontFamily,
            // dipakai oleh .cm-scroller di cmTheme.ts
            ['--editor-line-height' as string]: String(general.lineHeight),
          }}
        />
        {tampilSticky && (
          <StickyScroll
            view={view}
            path={tab.path ?? undefined}
            docVersion={docVersion}
            maxLines={editorSettings.stickyScrollMaxLines}
          />
        )}
        {tampilMinimap && (
          <Minimap
            view={view}
            path={tab.path ?? undefined}
            renderCharacters={editorSettings.minimapRenderCharacters}
            docVersion={docVersion}
          />
        )}
      </div>
    </div>
  );
}
