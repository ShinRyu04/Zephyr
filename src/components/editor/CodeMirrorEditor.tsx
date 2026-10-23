import { useEffect, useMemo, useRef, useState } from 'react';
import { editorUntukBerkas } from '../../lib/editorPerLanguage';
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
  scrollPastEnd,
} from '@codemirror/view';
import * as cmd from '../../lib/commands';
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
  codeFolding,
  foldGutter,
  foldKeymap,
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
import { emmetKeymap } from '../../lib/cmEmmet';
import { regionFold } from '../../lib/cmFoldRegion';
/*
 * Reused from the explorer rather than copied: the same question ("am I in the
 * agents window?") must have one answer. Imported from `lib/`, NOT from
 * `ExplorerPanel` — importing it from there closed a cycle (ExplorerPanel →
 * CodeMirrorEditor → ExplorerPanel) and broke module loading outright.
 */
import { useDiAgen } from '../../lib/useDiAgen';
import { vim } from '@replit/codemirror-vim';
import { useStore } from '../../lib/store';
import { extensiUntukFile } from '../../lib/lang';
import { zephyrHighlight, editorTheme } from '../../lib/cmTheme';
import { registerFlush, setActiveView, unregisterFlush } from '../../lib/editorRegistry';
import { useProblems, kunciPath, type Diagnostic } from '../../lib/problemsStore';
import { diagCompartment, diagnosticsGutter, lensField, setLensEffect } from '../../lib/diagnosticsGutter';
import { blameField, setBlameEffect } from '../../lib/gitBlame';
import { gitBarGutter, parseDiff, setBarsEffect } from '../../lib/gitBars';
import { dekorasiBarisUbah, dekorasiCopilot } from './dekorasiCopilot';
import { clearHintsEffect, inlayField, mintaInlayHints, setHintsEffect } from '../../lib/inlayHints';
import {
  capsUntukPath,
  clearTokensEffect,
  legendFor,
  mintaSemanticTokens,
  mintaSemanticTokensPenuh,
  semField,
  setTokensEffect,
} from '../../lib/semanticTokens';
import {
  clearNilaiEffect,
  debugInlineField,
  setNilaiEffect,
  type VariabelDebug,
} from '../../lib/debugInline';
import { useGit } from '../../lib/gitStore';
import {
  bpCompartment,
  barisAktifCompartment,
  breakpointGutter,
  barisAktifExt,
} from '../../lib/breakpointGutter';
import { useDebug } from '../../lib/debugStore';
import { useLsp } from '../../lib/lspStore';
import { serverForPath } from '../../lib/lsp';
import { autocompletionZephyr, lspHover, lspPeekExtension, setSquiggleEffect, squiggleField } from '../../lib/lspCm';
import { bracketPairColors, indentGuides } from '../../lib/cmIndent';
import { colorDecorators, unicodeHighlight } from '../../lib/cmColor';
import Minimap from './Minimap';
import Breadcrumbs from './Breadcrumbs';
import StickyScroll from './StickyScroll';
import InlineChat from './InlineChat';
import MarkdownPreview from './MarkdownPreview';
import { useMdPreview } from '../../lib/mdPreviewStore';
import AiIkon from '../ai/AiIkon';
import { tx } from '../../lib/i18n';
import { ghostText, lepasGhost } from '../../lib/ghostText';
import { fontAman } from '../../lib/xtermRegistry';
import type { EditorSettings, Tab } from '../../lib/types';

interface Props {
  tab: Tab;
}

const DEBOUNCE_MS = 300;

const LSP_DEBOUNCE_MS = 350;

const EMPTY_DIAG: Diagnostic[] = [];

function extrasEditor(e: EditorSettings, readOnly: boolean, lowRam = false): Extension[] {
  if (readOnly) return [];
  /*
   * Low-RAM mode thins the editor, it does not strip it.
   *
   * These four decorations used to be dropped whole whenever the flag was on,
   * so the editor turned into flat uncoloured text — the reports were
   * "brackets are plain white", "no indent guides", "the colour is gone". None
   * of them are what actually costs memory: the real levers are how much of the
   * document gets parsed and how many renderers stay alive, and both of those
   * are handled where they belong (parser budget, `MAX_LOADED_TABS`). The only
   * decoration that genuinely scans the whole document is the colour swatch, so
   * that one is skipped; the rest stay.
   */
  const out: Extension[] = [];
  if (e.indentGuides) out.push(indentGuides());
  if (e.bracketPairColorization) out.push(bracketPairColors());
  if (e.colorDecorators && !lowRam) out.push(colorDecorators());
  if (e.unicodeHighlight) out.push(unicodeHighlight());

  out.push(...ghostText(e.ghostText));

  /*
   * Dekorasi kode ala Copilot (item 182).
   *
   * Two decorations behind `dekorasiCopilot`, each with its own switch, and the
   * switch is the one that already means this thing: the line highlight rides
   * `gitGutter` because it draws the SAME diff the gutter bars draw (one git
   * diff, two views of it), and the inline suggestion rides `ghostText`.
   *
   * Both are passed as plain booleans so `dekorasiCopilot` can return nothing
   * at all when they are off: a field, a keymap and a timer installed for a
   * feature nobody asked for is work done on every keystroke for no one.
   *
   * Its suggestion source is NOT a network call - see `pasangPenyediaUsulan`.
   * Nothing is installed until something injects a provider, so with no provider
   * this path stays silent instead of asking a model in the background.
   */
  out.push(...dekorasiCopilot({ sorotBaris: e.gitGutter, usulanInline: e.ghostText }));
  return out;
}

export const naikkanExtVersi = () => {
  window.dispatchEvent(new Event('zephyr-ext-loaded'));
};

/**
 * Line-number gutter, with an optional relative mode.
 *
 * `lineNumbers()` cannot express this — it only knows how to print the line's
 * own number. The relative form is built from a `lineNumberMarkers` facet: for
 * every line, print `|line - cursorLine|`, except on the cursor line itself,
 * which keeps its absolute number (that is the line you are ON, and "0" there
 * would be useless).
 *
 * Recomputing per viewport update rather than per document change keeps the
 * numbers correct as the cursor moves, which is the only thing they describe.
 */
function nomorBaris(relative: boolean): Extension {
  if (!relative) return lineNumbers();
  return lineNumbers({
    formatNumber: (n, state) => {
      const kursor = state.doc.lineAt(state.selection.main.head).number;
      return n === kursor ? String(n) : String(Math.abs(n - kursor));
    },
  });
}

/**
 * One line's height in pixels.
 *
 * The CSS uses `line-height: <general.lineHeight>` (a unitless multiplier), so
 * the rendered height is `fontSize * lineHeight`. Computed here rather than
 * hardcoded so the scroll margin stays one visual line no matter which font
 * size or line height the reader chose.
 */
function tinggiBarisPx(general: { fontSize: number; lineHeight: number }): number {
  const t = general.fontSize * general.lineHeight;
  /* Guard against a settings file with a zero or missing value: a margin of 0
     silently disables the feature, and a NaN would make the facet throw. */
  return Number.isFinite(t) && t > 0 ? t : 18;
}

/**
 * Scroll margins and scroll-past-end.
 *
 * `EditorView.scrollMargins` is the facet that tells CodeMirror to keep space
 * free above and below the cursor when it scrolls something into view. Both
 * settings are the same facet with different numbers, so they are summed into
 * one callback — installing two `scrollMargins` facets would work, but reading
 * one function that returns the total is clearer than adding two.
 *
 * `unit` is one line's pixel height. It is passed in rather than read here
 * because the editor's line height is a user setting (`general.lineHeight`),
 * and a margin expressed in a hardcoded pixel constant would be wrong for
 * anyone who changed it.
 */
function scrollFeel(s: EditorSettings, unit: number): Extension {
  const atas = s.scrollMargin > 0 ? s.scrollMargin * unit : 0;
  const ext: Extension[] = [];
  if (atas > 0) ext.push(EditorView.scrollMargins.of(() => ({ top: atas })));
  /*
   * Scroll-past-end uses the library's own extension, NOT `scrollMargins`.
   *
   * `scrollMargins` is only consulted when scrolling something INTO view; it is
   * never added to the content height, so it cannot extend the scrollable
   * range. Padding the bottom of the content is what actually creates the extra
   * space, and that is exactly what `scrollPastEnd()` does — reimplementing it
   * with margins made the setting a no-op: the last line still stopped at the
   * bottom edge.
   */
  if (s.scrollPastEnd) ext.push(scrollPastEnd());
  return ext;
}

/**
 * The folding extensions, built once so the initial config and the live
 * reconfigure cannot drift apart.
 *
 * It is a function rather than a constant because `markerDOM` closes over
 * nothing — but keeping one definition means a change to the gutter mark is
 * made in one place instead of two that must be kept identical by hand.
 */
function foldingExt(): Extension {
  return [
    codeFolding(),
    regionFold,
    foldGutter({
      /* Same stroked geometry as the other gutters, so the fold arrow lines up
         with the diagnostic and breakpoint marks instead of sitting on its own
         baseline. */
      markerDOM: (open) => {
        const el = document.createElement('span');
        el.className = `cm-fold-mark${open ? ' is-open' : ''}`;
        el.setAttribute('aria-hidden', 'true');
        el.textContent = open ? '▾' : '▸';
        return el;
      },
    }),
    keymap.of(foldKeymap),
  ];
}

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
  const vimComp = useRef(new Compartment());
  /* Separate from `vimComp`: folding is not modal, and toggling one must not
     rebuild the other's extension. */
  const flagComp = useRef(new Compartment());
  /* Line numbers and the scroll feel are separate from folding: they change on
     different settings, and a reconfigure of one must not rebuild the other. */
  const nomorComp = useRef(new Compartment());
  const scrollComp = useRef(new Compartment());

  const extrasComp = useRef(new Compartment());
  const pending = useRef<number | null>(null);

  const lspPending = useRef<number | null>(null);

  const [viewSiap, setViewSiap] = useState(0);
  const [docVersion, setDocVersion] = useState(0);
  const [barisKursor, setBarisKursor] = useState(1);

  const updateTabContent = useStore((s) => s.updateTabContent);
  const setCursor = useStore((s) => s.setCursor);
  const editorGlobal = useStore((s) => s.settings.editor);
  const perLanguage = useStore((s) => s.settings.perLanguage);
  /*
   * Setelan editor yang DIPAKAI berkas ini: global, lalu ditimpa oleh entri
   * bahasanya bila ada. Semua kode di bawah membaca satu nilai ini, jadi tidak
   * ada tempat yang diam-diam memakai tabSize global untuk berkas Python.
   */
  const editorSettings = useMemo(
    () => editorUntukBerkas(tab.path, editorGlobal, perLanguage),
    [tab.path, editorGlobal, perLanguage],
  );
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
      /*
       * The gutter itself is provided by `nomorComp` below, which is what makes
       * relative mode and "off" possible. `highlightActiveLineGutter()` stays
       * here because it decorates whichever gutter exists.
       */
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
            /* Emmet sengaja SETELAH snippet: Tab di dalam snippet harus
               melanjutkan field, bukan mengembangkan singkatan. */
            emmetKeymap(() => tab.lang),
            highlightSelectionMatches(),
            ...(adaLsp ? [lspHover(tab.path ?? ''), lspPeekExtension()] : []),
          ]),
      rectangularSelection(),
      crosshairCursor(),
      highlightActiveLine(),

      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      zephyrHighlight,
      themeComp.current.of(editorTheme(themeId)),
      /*
       * Line numbers come FIRST, and the order here IS the visual order.
       *
       * `gutterView` renders the gutter columns in the order the gutter
       * extensions appear in the flattened extension array, so a gutter placed
       * after `diagCompartment`/`bpCompartment` renders to the RIGHT of them.
       * This used to sit lower in the list, which put the numbers between the
       * markers and the code — the opposite of every editor. Nested inside a
       * compartment it stayed declared here rather than where it was written.
       */
      nomorComp.current.of(
        editorSettings.lineNumbers === 'off' ? [] : nomorBaris(editorSettings.lineNumbers === 'relative'),
      ),
      /* Bars sit between the line numbers and the diagnostic markers: they
         describe the file's history and belong next to the numbers, while the
         markers describe its present state and belong next to the code. */
      ...(editorSettings.gitGutter ? [gitBarGutter] : []),
      diagCompartment.of([]),

      bpCompartment.of([]),
      barisAktifCompartment.of([]),
      squiggleField,
      /* Always installed; whether anything is drawn is decided by the effect
         pushed when blame is on and the file has a history. */
      blameField,
      scrollComp.current.of(scrollFeel(editorSettings, tinggiBarisPx(general))),
      /* The field is always installed; whether it draws anything is decided by
         the effect pushed from the diagnostics effect below. */
      lensField,
      /* Same: installed always, filled by the inlay effect when the setting is
         on and a server is available. */
      inlayField,
      /* And the same for semantic tokens. */
      semField,
      /* Debugger inline values. Same pattern: installed always, filled only
         while a debug session is paused on this file. */
      debugInlineField,

      extrasComp.current.of(extrasEditor(editorSettings, readOnly, lowRam)),
      baseKeymap,
      /*
       * Vim sits AFTER `baseKeymap` on purpose.
       *
       * vim() installs its own keymap, and precedence in CodeMirror is resolved
       * by the order the keymap extensions are registered: whichever is read
       * first wins. Placing it last makes the vim bindings authoritative while
       * the mode is on; the built-in keymap still covers every key vim leaves
       * unbound, so no shortcut is lost.
       *
       * It goes through a compartment so toggling the setting reconfigures the
       * live view instead of rebuilding it - rebuilding would drop the undo
       * history and the scroll position.
       */
      flagComp.current.of(editorSettings.codeFolding ? foldingExt() : []),
      vimComp.current.of(editorSettings.vimMode && !readOnly ? vim() : []),
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
          /*
           * Promote a preview tab IMMEDIATELY, before the debounce.
           *
           * The content write below is debounced by 300ms, and promotion used
           * to ride along with it — so between the first keystroke and the
           * debounce firing, the store still held `preview: true, unsaved:
           * false`. Clicking another file in the tree inside that window ran
           * `tutupPreviewLama`, which saw a clean preview and closed it; the
           * unmount then flushed the pending edit into a tab that no longer
           * existed, so the character the reader typed was silently dropped
           * with no dirty dot and no close prompt.
           *
           * Promotion is a decision about INTENT ("the reader has committed to
           * this file"), not about content, so it must not be debounced at all.
           */
          if (useStore.getState().tabs.find((t) => t.id === tab.id)?.preview) {
            useStore.getState().promoteTab(tab.id);
          }
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
    // Deliberately depends only on the tab id: settings changes are handled
    // a separate effect via a compartment (without rebuilding the view).
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

        /*
         * The inline lens is pushed as an effect, not installed as an
         * extension: it carries a diagnostic LIST, and the field that renders
         * it is already in the editor. Reconfiguring would rebuild the field
         * and throw away the previous deco set on every keystroke.
         *
         * Nothing is pushed when the setting is off, which leaves the field
         * empty — cheaper than reconfiguring it out and back.
         */
        editorSettings.diagLens ? setLensEffect(diagList) : setLensEffect([]),

        setSquiggleEffect(diagList),
      ],
    });
  }, [diagList, editorSettings.diagLens]);

  const bpKunci = useDebug((s) =>
    tab.path
      ? s.breakpoints
          .filter((b) => kunciPath(b.path) === kunciPath(tab.path as string))
          .map(
            (b) =>
              `${b.line}:${b.verified ? 1 : 0}:${b.enabled ? 1 : 0}:${b.condition ? 1 : 0}${b.hitCondition ? 1 : 0}${b.logMessage ? 1 : 0}`,
          )
          .join(',')
      : '',
  );
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !tab.path) return;
    const daftar = useDebug.getState().breakpointsUntuk(tab.path);
    view.dispatch({
      effects: bpCompartment.reconfigure(
        breakpointGutter(
          daftar,
          (line) => {
            void useDebug.getState().toggleBreakpoint(tab.path as string, line);
          },
          (line) => useDebug.getState().bukaEditBreakpoint(tab.path as string, line),
        ),
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
        vimComp.current.reconfigure(editorSettings.vimMode && !readOnly ? vim() : []),
        flagComp.current.reconfigure(editorSettings.codeFolding ? foldingExt() : []),
        nomorComp.current.reconfigure(
          editorSettings.lineNumbers === 'off'
            ? []
            : nomorBaris(editorSettings.lineNumbers === 'relative'),
        ),
        scrollComp.current.reconfigure(scrollFeel(editorSettings, tinggiBarisPx(general))),
      ],
    });
  }, [
    editorSettings.wordWrap,
    editorSettings.insertSpaces,
    editorSettings.tabSize,
    editorSettings.showWhitespace,
    editorSettings.vimMode,
    editorSettings.codeFolding,
    editorSettings.lineNumbers,
    editorSettings.scrollMargin,
    editorSettings.scrollPastEnd,
    general,
    readOnly,
  ]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    /*
     * Wait for the view to exist before reconfiguring.
     *
     * This effect ran against `viewRef.current` directly, and on a fresh mount
     * the view-creating effect has not run yet — `view` was null, the guard
     * returned, and nothing ever reconfigured the compartment. The plugin that
     * survived was whichever was compiled into the initial extension list, so a
     * change to the bracket or indent code had no effect until the tab was
     * reopened. `viewSiap` ticks once the view exists, which makes this effect
     * run at the right time.
     */
    view.dispatch({
      effects: extrasComp.current.reconfigure(extrasEditor(editorSettings, readOnly, lowRam)),
    });
  }, [
    editorSettings.indentGuides,
    editorSettings.bracketPairColorization,
    editorSettings.colorDecorators,
    editorSettings.unicodeHighlight,
    editorSettings.ghostText,
    readOnly,
    lowRam,
    viewSiap,
  ]);

  /*
   * The minimap is not a "nice to have" that low-RAM mode removes.
   *
   * It used to be gated behind the same flag as the heavy decorations, so
   * turning on memory saving made the map disappear with no explanation —
   * reported as "the coloured strip is gone". A canvas of this size costs a few
   * hundred kilobytes, which is not the memory problem worth trading it for.
   */
  const extrasAktif = !readOnly;
  const tampilMinimap = extrasAktif && editorSettings.minimap;
  /*
   * Breadcrumbs, never in the agents window.
   *
   * The reader asked for the path bar to go in "Open in Agents" (and only
   * there). It is redundant on that surface: the file is already named by the
   * tab sharing the strip above it, and the column is a side panel where a
   * second path line costs height that the code needs. The setting still
   * governs the main window, so nothing the reader configured is overridden —
   * this window simply has no breadcrumb bar to configure.
   *
   * Read through a hook rather than a render-time DOM probe: this window mounts
   * its own root, so the wrapper is not in the DOM yet while children render.
   */
  const diAgenWin = useDiAgen();
  const tampilBreadcrumbs = !readOnly && editorSettings.breadcrumbs && !diAgenWin;
  const tampilSticky = extrasAktif && editorSettings.stickyScroll && !lowRam;

  /*
   * Markdown preview.
   *
   * Only offered for a buffer the language detector calls `markdown` — the
   * toggle is meaningless for a Rust file, and showing it everywhere would be
   * noise. Preview state lives in `mdPreviewStore` (ephemeral, per tab id), so
   * a reload always lands on the source.
   */
  const bisaPratinjau = tab.lang === 'markdown';
  const pratinjauMd = useMdPreview((s) => s.preview[tab.id] === true) && bisaPratinjau;
  const toggleMd = useMdPreview((s) => s.toggle);

  const view = viewSiap > 0 ? viewRef.current : null;

  const [menu, setMenu] = useState<{ x: number; y: number; text: string } | null>(null);

  /*
   * Inline git blame.
   *
   * Only fetched when the setting is on AND the tab has a real file on disk —
   * an untitled buffer has no history, and `git blame` on a path that is not
   * in the repository returns nothing but costs a process spawn.
   *
   * Re-fetched when the tab's `unsaved` flag flips, AND when HEAD moves.
   *
   * `unsaved` covers a save; HEAD covers everything that rewrites history
   * without saving this file — a commit from the Source Control panel, a
   * checkout, a pull, a rebase. Without the second signal the inline
   * attribution kept naming the pre-commit author on every line: the file was
   * unchanged and not dirty, so neither `tab.path` nor `tab.unsaved` moved and
   * the fetch never re-ran.
   *
   * `log[0].hash7` is HEAD as the store already tracks it — `refreshAll` runs
   * after every git operation, so it updates exactly when history does. The
   * short hash is enough: two commits sharing seven characters is a collision
   * git itself refuses to abbreviate to. Reading it as a primitive keeps the
   * zustand selector from returning a new object per render (the trap noted in
   * AGENTS.md for this store).
   */
  const headHash = useGit((s) => (s.log.length > 0 ? s.log[0].hash7 : ''));

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (!editorSettings.gitBlame || !tab.path) {
      view.dispatch({ effects: setBlameEffect([]) });
      return;
    }
    let batal = false;
    void (async () => {
      const baris = await useGit.getState().blameFile(tab.path as string);
      if (batal || !viewRef.current) return;
      viewRef.current.dispatch({ effects: setBlameEffect(baris) });
    })();
    return () => {
      batal = true;
    };
  }, [editorSettings.gitBlame, tab.path, tab.id, tab.unsaved, headHash]);

  /*
   * Git change bars.
   *
   * Fetched when the setting is on and the save state settles — same trigger as
   * blame, and for the same reason: `git diff HEAD` describes committed
   * history, so unsaved edits cannot change it, and re-running per keystroke
   * would spawn a `git diff` for every character.
   *
   * The bars are cleared when the document changes (see `barsField`), so
   * between an edit and the next save the gutter is empty. That is deliberate:
   * a bar that stayed put after an edit would claim "you changed this line"
   * about a line the reader had not touched.
   */
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (!editorSettings.gitGutter || !tab.path) {
      /* Both views of the diff are cleared together: a bar that vanished while
         its line highlight stayed behind would describe two different files. */
      view.dispatch({ effects: [setBarsEffect([]), dekorasiBarisUbah([])] });
      return;
    }
    let batal = false;
    void (async () => {
      try {
        const patch = await cmd.gitDiffHead(tab.path as string);
        if (batal || !viewRef.current) return;
        /*
         * One diff, two decorations, ONE dispatch.
         *
         * `parseDiff` runs once and its result feeds both the gutter bars and
         * the line highlight. Asking git twice for the same answer, or parsing
         * the patch twice, is how the bar and the highlight end up disagreeing
         * about a line - the class of bug that reads as "the highlight is
         * wrong sometimes".
         */
        const baris = parseDiff(patch);
        viewRef.current.dispatch({ effects: [setBarsEffect(baris), dekorasiBarisUbah(baris)] });
      } catch {
        /* Not a repository, or git unavailable: no bars. Not an error the
           reader needs told about — the setting simply has nothing to say. */
      }
    })();
    return () => {
      batal = true;
    };
  }, [editorSettings.gitGutter, tab.path, tab.id, tab.unsaved, headHash]);

  /*
   * Inlay hints.
   *
   * Requested per VISIBLE RANGE (the server computes hints for whatever range
   * it is given), so the trigger is the viewport: the setting, the tab, and a
   * debounced document change. Not per keystroke — a hint request is a network
   * round trip, and one per character would queue behind the reader's typing.
   *
   * `docVersion` is already the debounced "content settled" signal the rest of
   * this component uses, so it is reused rather than adding a second timer that
   * could drift from it.
   */
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (!editorSettings.inlayHints || !tab.path || !adaLsp) {
      view.dispatch({ effects: clearHintsEffect() });
      return;
    }
    let batal = false;
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const list = await mintaInlayHints(tab.path as string, view);
          if (batal || !viewRef.current) return;
          viewRef.current.dispatch({ effects: setHintsEffect(viewRef.current, list) });
        } catch {
          /* Server absent or unhappy: no hints, which is the same as the
             setting being off. Not an error worth interrupting the reader
             for. */
        }
      })();
    }, LSP_DEBOUNCE_MS);
    return () => {
      batal = true;
      window.clearTimeout(t);
    };
  }, [editorSettings.inlayHints, tab.path, tab.id, docVersion, adaLsp]);

  /*
   * Semantic tokens.
   *
   * The legend comes from the SERVER's own capabilities, not a constant: the
   * response carries an index into it, and every server orders its token types
   * differently. `legendFor` falls back to the standard ordering for a server
   * that sends tokens without declaring one.
   *
   * The range request is tried first and the full request only if it fails —
   * a server may implement one and not the other, and the fallback keeps a
   * partial implementation usable instead of silently colourless.
   */
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (!editorSettings.semanticTokens || !tab.path || !adaLsp) {
      view.dispatch({ effects: clearTokensEffect() });
      return;
    }
    let batal = false;
    const t = window.setTimeout(() => {
      void (async () => {
        const caps = capsUntukPath(
          serverForPath(tab.path as string),
          useLsp.getState().aktif,
        );
        const legend = legendFor(caps);
        try {
          let set = await mintaSemanticTokens(tab.path as string, view, legend);
          if (!set) set = await mintaSemanticTokensPenuh(tab.path as string, view, legend);
          if (batal || !viewRef.current || !set) return;
          viewRef.current.dispatch({ effects: setTokensEffect(viewRef.current, set) });
        } catch {
          /* No provider, or the server is unhappy: no tokens. Same state as
             the setting being off. */
        }
      })();
    }, LSP_DEBOUNCE_MS);
    return () => {
      batal = true;
      window.clearTimeout(t);
    };
  }, [editorSettings.semanticTokens, tab.path, tab.id, docVersion, adaLsp]);

  /*
   * Debugger inline values.
   *
   * Driven by the debugger's own state rather than by a timer: the values are
   * pushed when a step lands, so the trigger is `frameTerpilih` plus the loaded
   * variable table. Nothing happens while no session is paused, which is almost
   * always.
   *
   * Only drawn when the paused file is the file this editor is showing — the
   * debugger stops in one file, and painting its locals on another tab would be
   * showing a runtime state that belongs elsewhere.
   */
  const debugInline = editorSettings.debugInlineValues;
  const debugFrame = useDebug((s) => s.frameTerpilih);
  const debugScopes = useDebug((s) => s.scopes);
  const debugVars = useDebug((s) => s.variables);
  const debugStop = useDebug((s) => s.barisAktif);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (!debugInline || !tab.path || debugFrame === null || !debugStop) {
      view.dispatch({ effects: clearNilaiEffect() });
      return;
    }
    if (kunciPath(debugStop.path) !== kunciPath(tab.path)) {
      view.dispatch({ effects: clearNilaiEffect() });
      return;
    }

    /*
     * The first non-expensive scope, matching what the Variables panel expands
     * on its own. `expensive` is the adapter saying the scope is costly to
     * read; pulling it on every step would slow stepping down for values the
     * reader rarely wants.
     */
    const scope = debugScopes.find((s) => !s.expensive) ?? debugScopes[0];
    const vars: VariabelDebug[] = scope ? (debugVars[scope.variablesReference] ?? []) : [];
    view.dispatch({ effects: setNilaiEffect(view, debugStop.line, vars) });
  }, [debugInline, tab.path, tab.id, debugFrame, debugScopes, debugVars, debugStop]);

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
    s.setSettingsOpen(false);
    /* Send the selection to the chat in its own surface: right column, or the
       pop-out window when that is the configured home. Never the bottom panel. */
    if ((s.settings.general.aiPanel ?? 'right') === 'window') {
      void import('../../lib/aiWindow').then((m) => m.bukaAiWindow());
    } else {
      s.setAiKolomVisible(true);
    }
    window.setTimeout(
      () =>
        window.dispatchEvent(
          new CustomEvent('zephyr-ai-sel', { detail: { cmd, text } }),
        ),
      80,
    );
  };

  return (
    /*
     * `--cm-centered` lives on the OUTER wrapper, not on `.cm-body`.
     *
     * The breadcrumb bar is a SIBLING of `.cm-body`, not a child of it, so a
     * custom property declared on `.cm-body` is invisible to it — the
     * breadcrumbs' `var(--cm-centered, 900px)` silently fell back to 900 and
     * the bar indented to a different measure than the text under it whenever
     * the reader picked anything other than 900. Declaring it here means both
     * children inherit the same value.
     */
    <div
      className="cm-wrap"
      data-testid="cm-wrap"
      style={
        editorSettings.centeredWidth > 0
          ? ({ ['--cm-centered' as string]: `${editorSettings.centeredWidth}px` } as React.CSSProperties)
          : undefined
      }
    >
      {tampilBreadcrumbs && (
        <Breadcrumbs
          view={view}
          path={tab.path ?? undefined}
          docVersion={docVersion}
          barisKursor={barisKursor}
        />
      )}
      {/*
       * Markdown preview toggle.
       *
       * A single floating control, shown only for a Markdown buffer, that flips
       * between the source and the rendered page. It sits over the top-right of
       * the editor body rather than in a toolbar: there is no editor toolbar to
       * add it to, and a Markdown file is the only tab that has anything to put
       * there, so a permanent bar would be empty for every other file.
       */}
      {bisaPratinjau && (
        <button
          className={`cm-md-toggle${pratinjauMd ? ' is-on' : ''}`}
          data-testid="cm-md-toggle"
          data-on={pratinjauMd ? '1' : '0'}
          title={pratinjauMd ? tx('Show the Markdown source') : tx('Preview the rendered Markdown')}
          aria-pressed={pratinjauMd}
          onClick={() => toggleMd(tab.id)}
        >
          <AiIkon name={pratinjauMd ? 'doc-edit' : 'eye'} size={14} />
        </button>
      )}
      {/*
       * `data-centered` drives the CSS, rather than a width in the inline
       * style. The gutter, the scrollbar and the minimap all have to keep
       * working, and a width applied to the host element would squeeze them
       * with it — the CSS narrows the CONTENT column and centres it inside a
       * full-width host instead.
       */}
      <div className="cm-body" data-centered={editorSettings.centeredWidth > 0 ? '1' : undefined}>
        <div
          ref={hostRef}
          className="zephyr-cm-host"
          onContextMenu={onContextMenu}
          /*
           * The file path, read by anything that needs to know WHICH buffer a
           * DOM node belongs to without being handed the path.
           *
           * Ghost text used this and got nothing: the attribute was never set,
           * so `getAttribute('data-path')` returned null on every call and the
           * prompt sent to the model always began `File: file`. The suggestion
           * was therefore written with no idea what it was completing — the
           * same text whether the buffer was `api.rs` or `styles.css`.
           */
          data-path={tab.path ?? undefined}
          data-cursor-style={editorSettings.cursorStyle}
          data-smooth={editorSettings.smoothScroll && !lowRam ? '1' : '0'}
          data-lowram={lowRam ? '1' : '0'}
          data-readonly={readOnly ? '1' : '0'}
          style={{
            fontSize: `${general.fontSize}px`,
            fontFamily: fontAman(general.fontFamily),

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
        {/*
         * The rendered preview sits ON TOP of the editor host, covering it,
         * rather than replacing it in the tree. Keeping CodeMirror mounted
         * behind the overlay means toggling back is instant and the scroll
         * position, selection and undo history survive the round trip — the
         * editor never unmounts. `tab.content` is the debounced buffer the
         * store already holds, so the preview tracks edits as they settle.
         */}
        {pratinjauMd && <MarkdownPreview source={tab.content} />}
      </div>
      {/* A-4: floating mini chat (Ctrl+I) - exists only while open. */}
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
