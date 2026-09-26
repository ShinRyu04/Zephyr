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
import {
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,

  snippetKeymap,
  nextSnippetField,
  prevSnippetField,
  clearSnippet,
} from '@codemirror/autocomplete';
import { highlightSelectionMatches, searchKeymap, selectNextOccurrence } from '@codemirror/search';
import { lintKeymap } from '@codemirror/lint';
import { highlightWhitespace } from '@codemirror/view';
import { useStore } from '../../lib/store';
import { useTerminal } from '../../lib/terminalStore';
import { usePanel } from '../../lib/panelStore';
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
import { autocompletionZephyr, lspHover, squiggleCompartment, squiggleFor } from '../../lib/lspCm';
import { bracketPairColors, indentGuides } from '../../lib/cmIndent';
import { colorDecorators, unicodeHighlight } from '../../lib/cmColor';
import Minimap from './Minimap';
import Breadcrumbs from './Breadcrumbs';
import StickyScroll from './StickyScroll';
import InlineChat from './InlineChat';
import { ghostText, lepasGhost } from '../../lib/ghostText';
import type { EditorSettings, Tab } from '../../lib/types';

interface Props {
  tab: Tab;
}

const DEBOUNCE_MS = 300;

const LSP_DEBOUNCE_MS = 350;

const EMPTY_DIAG: Diagnostic[] = [];

function extrasEditor(e: EditorSettings, readOnly: boolean, lowRam = false): Extension[] {
  if (readOnly) return [];
  // Mode penghemat RAM mematikan ekstra yang paling berat: dekorator warna
  // (memindai seluruh dokumen untuk #hex/rgb) dan highlight unicode di samping
  // minimap/sticky yang sudah dimatikan di level render.
  const out: Extension[] = [];
  if (e.indentGuides && !lowRam) out.push(indentGuides());
  if (e.bracketPairColorization && !lowRam) out.push(bracketPairColors());
  if (e.colorDecorators && !lowRam) out.push(colorDecorators());
  if (e.unicodeHighlight && !lowRam) out.push(unicodeHighlight());

  out.push(...ghostText(e.ghostText));
  return out;
}

export const naikkanExtVersi = () => {
  window.dispatchEvent(new Event('zephyr-ext-loaded'));
};

export default function CodeMirrorEditor({ tab }: Props) {

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

  const extrasComp = useRef(new Compartment());
  const pending = useRef<number | null>(null);

  const lspPending = useRef<number | null>(null);

  const [viewSiap, setViewSiap] = useState(0);
  const [docVersion, setDocVersion] = useState(0);
  const [barisKursor, setBarisKursor] = useState(1);

  const updateTabContent = useStore((s) => s.updateTabContent);
  const setCursor = useStore((s) => s.setCursor);
  const editorSettings = useStore((s) => s.settings.editor);
  const general = useStore((s) => s.settings.general);

  const themeId = useStore((s) => s.activeTheme);

  const lowRam = useStore((s) => s.settings.general.lowRam === true);
  const readOnly = tab.readOnly === true;

  const adaLsp = !readOnly && !!tab.path && !!serverForPath(tab.path);

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

      { key: 'Mod-/', run: toggleComment },
      { key: 'Shift-Mod-k', run: deleteLine },
      { key: 'Mod-l', run: selectLine },
      { key: 'Shift-Mod-\\', run: cursorMatchingBracket },
      { key: 'Mod-Enter', run: insertBlankLine },

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

      ...(readOnly
        ? [EditorState.readOnly.of(true), EditorView.editable.of(false)]
        : [
            indentOnInput(),
            bracketMatching(),
            closeBrackets(),

            autocompletionZephyr(tab.path ?? '', () => tab.lang, adaLsp),

            snippetKeymap.of([
              { key: 'Tab', run: nextSnippetField, shift: prevSnippetField },
              { key: 'Escape', run: clearSnippet },
            ]),
            highlightSelectionMatches(),
            ...(adaLsp ? [lspHover(tab.path ?? '')] : []),
          ]),
      rectangularSelection(),
      crosshairCursor(),
      highlightActiveLine(),

      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      zephyrHighlight,
      themeComp.current.of(editorTheme(themeId)),
      diagCompartment.of([]),

      bpCompartment.of([]),
      barisAktifCompartment.of([]),
      squiggleCompartment.of([]),

      extrasComp.current.of(extrasEditor(editorSettings, readOnly, lowRam)),
      baseKeymap,
      langComp.current.of([]),
      wsComp.current.of(editorSettings.showWhitespace ? highlightWhitespace() : []),
      wrapComp.current.of(editorSettings.wordWrap ? EditorView.lineWrapping : []),

      EditorView.contentAttributes.of({
        'aria-label': `Editor: ${tab.name}${tab.path ? ` (${tab.path})` : ''}`,

        role: 'textbox',
        'aria-multiline': 'true',
        'aria-readonly': readOnly ? 'true' : 'false',
      }),
      tabComp.current.of(indentUnit.of(editorSettings.insertSpaces ? ' '.repeat(editorSettings.tabSize) : '\t')),
      EditorState.tabSize.of(editorSettings.tabSize),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) {
          if (pending.current !== null) window.clearTimeout(pending.current);
          pending.current = window.setTimeout(() => {
            pending.current = null;
            updateTabContent(tab.id, u.state.doc.toString());
          }, DEBOUNCE_MS);

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

    setViewSiap((n) => n + 1);
    setDocVersion((v) => v + 1);

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

      lepasGhost(view);
      view.destroy();
      viewRef.current = null;

      if (adaLsp && tab.path) void useLsp.getState().closeDoc(tab.path);
    };
    // Sengaja hanya bergantung pada id tab: perubahan setting ditangani
    // effect terpisah lewat compartment (tanpa rebuild view).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.id]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== tab.content) {
      const sel = view.state.selection.main;
      view.dispatch({
        changes: { from: 0, to: current.length, insert: tab.content },

        selection: {
          anchor: Math.min(sel.anchor, tab.content.length),
          head: Math.min(sel.head, tab.content.length),
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.content]);

  useEffect(() => {
    /*
     * Configure the language as soon as a view exists.
     *
     * React runs the effect that creates the view (keyed on tab.id) before
     * this one, so on a fresh mount viewRef is already set. On a re-run caused
     * by a dependency change the view is also there. The guard below covers
     * the remaining case: the effect running before the view effect, where
     * nothing can be dispatched yet and the work is deferred one tick.
     */
    let alive = true;
    let timer: number | null = null;

    const pasang = () => {
      const view = viewRef.current;
      // eslint-disable-next-line no-console
      if (!alive || !view) return;
      if (readOnly) {
        view.dispatch({ effects: langComp.current.reconfigure([]) });
        return;
      }
      void extensiUntukFile(tab.path ?? tab.name).then(({ ext }) => {
        // Dispatch into the view this pass started with: the loader is a
        // dynamic import, so a tab switch can replace the view in between.
        // eslint-disable-next-line no-console
        if (!alive || viewRef.current !== view) return;
        view.dispatch({ effects: langComp.current.reconfigure(ext) });
        // eslint-disable-next-line no-console
      });
    };

    if (viewRef.current) {
      pasang();
    } else {
      timer = window.setTimeout(pasang, 0);
    }

    return () => {
      alive = false;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [tab.lang, tab.id, tab.path, tab.name, readOnly, extVersi, viewSiap]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: themeComp.current.reconfigure(editorTheme(themeId)),
    });
  }, [themeId]);

  const diagList = useProblems((s) =>
    tab.path ? s.byFile.get(kunciPath(tab.path)) ?? EMPTY_DIAG : EMPTY_DIAG,
  );
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: [
        diagCompartment.reconfigure(diagnosticsGutter(diagList, view.state.doc.lines)),

        squiggleCompartment.reconfigure(
          diagList.length === 0
            ? []
            : EditorView.decorations.of(squiggleFor(diagList, view)),
        ),
      ],
    });
  }, [diagList]);

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

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: extrasComp.current.reconfigure(extrasEditor(editorSettings, readOnly, lowRam)),
    });
  }, [
    editorSettings.indentGuides,
    editorSettings.bracketPairColorization,
    editorSettings.colorDecorators,
    editorSettings.unicodeHighlight,
    readOnly,
    lowRam,
  ]);

  const extrasAktif = !readOnly && !lowRam;
  const tampilMinimap = extrasAktif && editorSettings.minimap;
  const tampilBreadcrumbs = !readOnly && editorSettings.breadcrumbs;
  const tampilSticky = extrasAktif && editorSettings.stickyScroll;

  const view = viewSiap > 0 ? viewRef.current : null;

  const [menu, setMenu] = useState<{ x: number; y: number; text: string } | null>(null);

  useEffect(() => {
    if (!menu) return;
    const tutup = () => setMenu(null);
    window.addEventListener('click', tutup);
    window.addEventListener('blur', tutup);
    return () => {
      window.removeEventListener('click', tutup);
      window.removeEventListener('blur', tutup);
    };
  }, [menu]);

  const onContextMenu = (e: React.MouseEvent) => {
    const v = viewRef.current;
    if (!v || readOnly) return;
    const sel = v.state.selection.main;
    const text = v.state.sliceDoc(sel.from, sel.to);
    if (!text.trim()) return;
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, text });
  };

  const tanya = (cmd: string) => {
    const text = menu?.text ?? '';
    setMenu(null);
    const s = useStore.getState();
    const t = useTerminal.getState();
    s.setSettingsOpen(false);
    t.setVisible(true);

    usePanel.getState().focusTab('ai');
    window.setTimeout(
      () =>
        window.dispatchEvent(
          new CustomEvent('zephyr-ai-sel', { detail: { cmd, text } }),
        ),
      80,
    );
  };

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
          onContextMenu={onContextMenu}
          data-cursor-style={editorSettings.cursorStyle}
          data-smooth={editorSettings.smoothScroll && !lowRam ? '1' : '0'}
          data-lowram={lowRam ? '1' : '0'}
          data-readonly={readOnly ? '1' : '0'}
          style={{
            fontSize: `${general.fontSize}px`,
            fontFamily: general.fontFamily,

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
      {/* A-4: chat mini melayang (Ctrl+I) - hanya ada saat dibuka. */}
      <InlineChat />
      {menu && (
        <div
          className="cm-ai-menu"
          data-testid="cm-ai-menu"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button data-testid="cm-ai-explain" onClick={() => tanya('explain')}>
            Jelaskan
          </button>
          <button data-testid="cm-ai-fix" onClick={() => tanya('fix')}>
            Perbaiki
          </button>
          <button data-testid="cm-ai-refactor" onClick={() => tanya('refactor')}>
            Refactor
          </button>
        </div>
      )}
    </div>
  );
}
