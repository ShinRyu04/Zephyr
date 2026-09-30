import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { highlightTree, tagHighlighter, tags as t } from '@lezer/highlight';
import { forceParsing, syntaxTree } from '@codemirror/language';
import { warnaToken } from '../../styles/editor-themes';
import { EditorView } from '@codemirror/view';
import { useProblems, kunciPath } from '../../lib/problemsStore';

const LEBAR = 84;

const TINGGI_BARIS = 3;

const MAX_BARIS = 12000;

export const minimapDebug: {
  panggil: number;
  gambar: number;
  alasan: string | null;
  w: number;
  h: number;
} = { panggil: 0, gambar: 0, alasan: null, w: 0, h: 0 };

interface Props {
  view: EditorView | null;
  
  path?: string;
  renderCharacters: boolean;
  
  docVersion: number;
}

const bacaVar = (el: HTMLElement, nama: string, fallback: string): string => {
  const v = getComputedStyle(el).getPropertyValue(nama).trim();
  return v || fallback;
};

export default function Minimap({ view, path, renderCharacters, docVersion }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  
  const timerRef = useRef<number | null>(null);
  
  const fnRef = useRef<{ gambar: () => void; viewport: () => void }>({
    gambar: () => {},
    viewport: () => {},
  });
  const [viewport, setViewport] = useState({ atas: 0, tinggi: 0 });

  const diagList = useProblems((s) =>
    path ? (s.byFile.get(kunciPath(path))?.length ?? 0) : 0,
  );

  const gambar = useCallback(() => {
    minimapDebug.panggil++;
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host || !view) {
      minimapDebug.alasan = `canvas=${!!canvas} host=${!!host} view=${!!view}`;
      return;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const tinggiHost = host.clientHeight;
    if (tinggiHost <= 0) {
      minimapDebug.alasan = `tinggiHost=${tinggiHost}`;
      return;
    }

    canvas.width = Math.floor(LEBAR * dpr);
    canvas.height = Math.floor(tinggiHost * dpr);
    canvas.style.width = `${LEBAR}px`;
    canvas.style.height = `${tinggiHost}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      minimapDebug.alasan = 'getContext null';
      return;
    }
    minimapDebug.gambar++;
    minimapDebug.alasan = null;
    minimapDebug.w = canvas.width;
    minimapDebug.h = canvas.height;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, LEBAR, tinggiHost);

    const doc = view.state.doc;
    const totalBaris = doc.lines;

    /*
     * How many document lines share one minimap row.
     *
     * The old math capped the *scale* at 3px and let the step be whatever fell
     * out, so a 1500-line file drew 1500 rows into 515px — a 0.34px step, and
     * lines thinner than a pixel stack into one uniform smear. Nothing about
     * the map was readable at that density, which is exactly what "numpuk"
     * looks like.
     *
     * Two ceilings apply and the tighter one wins: the panel can hold about
     * one row per pixel (`LANGKAH_MIN`), and `MAX_BARIS` caps the work on an
     * enormous file. Taking the maximum of the two steps satisfies both —
     * taking the minimum, as this first did, always returned 1 and drew the
     * whole document into the top third of the panel.
     */
    const LANGKAH_MIN = 1.1;
    const langkah = Math.max(
      1,
      Math.ceil(totalBaris / MAX_BARIS),
      Math.ceil(totalBaris / Math.max(1, Math.floor(tinggiHost / LANGKAH_MIN))),
    );
    const barisTampil = Math.ceil(totalBaris / langkah);
    const skala = Math.min(TINGGI_BARIS, Math.max(tinggiHost / Math.max(barisTampil, 1), 1));

    const warnaTeks = bacaVar(host, '--fg2', '#8b98a5');
    const warnaError = bacaVar(host, '--danger', '#f04747');

    /*
     * Colour, taken from the highlighter rather than invented here.
     *
     * Every line used to be drawn in `--fg2` with only comments set apart, so
     * the minimap was a grey ladder — you could see the shape of the file but
     * not its structure, which is most of what a minimap is for. Reading the
     * token classes off the same highlighter the editor uses means the minimap
     * matches the editor's palette on every theme, with no second colour table
     * to keep in sync.
     */
    /*
     * The editor's own highlight style decides the colour.
     *
     * Zephyr styles tokens through `HighlightStyle.define` with CSS variables,
     * which CodeMirror compiles to generated class names (`ͼo`, `ͼv`) — so
     * `classHighlighter`'s `tok-*` names never match anything here and every
     * line came out the muted foreground. Rebuilding the same tag-to-colour
     * table keeps the minimap on the editor's palette without depending on
     * class names the compiler invents.
     */
    const gayaToken = tagHighlighter([
      { tag: [t.keyword, t.modifier, t.controlKeyword], class: warnaToken.keyword },
      { tag: [t.string, t.special(t.string), t.regexp], class: warnaToken.string },
      { tag: [t.number, t.bool, t.null], class: warnaToken.number },
      { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], class: warnaToken.comment },
      { tag: [t.function(t.variableName), t.function(t.propertyName), t.macroName], class: warnaToken.fn },
      { tag: [t.typeName, t.className, t.namespace, t.definition(t.typeName)], class: warnaToken.type },
      { tag: [t.operator, t.operatorKeyword, t.punctuation, t.separator], class: warnaToken.operator },
      { tag: [t.tagName, t.angleBracket], class: warnaToken.keyword },
      { tag: [t.attributeName], class: warnaToken.number },
    ]);

    /* `tagHighlighter` hands back the value as a class name; it is a colour here. */
    const warnaKelas = (kelas: string): string => kelas || warnaTeks;

    /*
     * Draw per token, not per line.
     *
     * One colour per line meant a dense file became a stack of full-width bars
     * in three or four colours — the minimap read as stripes, and its colours
     * never matched the code because a line's colour was taken from whichever
     * token happened to come first. Painting each token at its own column and
     * width is what makes a minimap look like the file: keywords, identifiers
     * and strings land where they really are, in the colours the editor uses.
     */
    type Segmen = { baris: number; kolom: number; lebar: number; warna: string; akhir: boolean };
    const segmen: Segmen[] = [];
    try {
      /*
       * Parse the whole document before reading tokens.
       *
       * CodeMirror parses lazily: `syntaxTree` only covers the viewport plus a
       * margin, so on a long file every line below the fold came back
       * unclassified and the minimap drew it in the muted foreground — colour
       * at the top, a grey slab underneath.
       *
       * `forceParsing` fills the tree in one bounded burst. The budget is
       * generous enough for a few thousand lines (the previous 120ms stopped
       * after the first screenful, which is why the top of the map was coloured
       * and the rest was not) and still bounded, so a multi-megabyte file
       * degrades to a partial map instead of freezing the panel.
       */
      forceParsing(view, doc.length, 1500);
      const tree = syntaxTree(view.state);
      highlightTree(tree, gayaToken, (from: number, to: number, kelas: string) => {
        const warna = warnaKelas(kelas);
        let a = from;
        while (a < to) {
          const ln = doc.lineAt(a);
          const akhirBaris = Math.min(to, ln.to);
          const kolom = a - ln.from;
          const lebar = akhirBaris - a;
          if (lebar > 0) {
            segmen.push({
              baris: ln.number,
              kolom,
              lebar,
              warna,
              /* The last token on a line does not need its trailing space. */
              akhir: akhirBaris === ln.to,
            });
          }
          a = akhirBaris + 1;
        }
      });
    } catch {
      /* No syntax tree yet (plain text, still loading): nothing to colour. */
    }

    /* Group by line once, so the draw loop stays linear on a long file. */
    const perBaris = new Map<number, Segmen[]>();
    for (const sg of segmen) {
      const ada = perBaris.get(sg.baris);
      if (ada) ada.push(sg);
      else perBaris.set(sg.baris, [sg]);
    }

    /* Column width, so a token's x position matches the character it starts at. */
    const KOLOM = 1.1;

    ctx.globalAlpha = 0.85;

    for (let i = 0; i < barisTampil; i++) {
      const nomor = i * langkah + 1;
      if (nomor > totalBaris) break;
      const teks = doc.line(nomor).text;
      if (teks.trim().length === 0) continue;

      const y = i * skala;
      const tinggi = Math.max(skala - 0.8, 0.8);
      const indentKolom = teks.length - teks.trimStart().length;

      /*
       * Tokens first, then a faint baseline for the rest of the line.
       *
       * The baseline covers line endings, trailing comments and any span the
       * highlighter did not classify, so no line ever disappears from the map;
       * classified tokens draw over it in their own colour.
       */
      const xAwal = Math.min(indentKolom * KOLOM, LEBAR - 4);
      const xAkhir = Math.min(teks.trimEnd().length * KOLOM, LEBAR);
      if (xAkhir > xAwal) {
        ctx.fillStyle = warnaTeks;
        ctx.globalAlpha = 0.3;
        ctx.fillRect(xAwal, y, xAkhir - xAwal, tinggi);
        ctx.globalAlpha = 0.85;
      }

      for (const sg of perBaris.get(nomor) ?? []) {
        const x = Math.min(sg.kolom * KOLOM, LEBAR);
        /* The trailing character of a token is usually a space or a delimiter. */
        const w = Math.min((sg.akhir ? sg.lebar - 1 : sg.lebar) * KOLOM, LEBAR - x);
        if (w <= 0) continue;
        ctx.fillStyle = sg.warna;
        ctx.fillRect(x, y, Math.max(w, 0.9), tinggi);
      }
    }

    if (path) {
      const list = useProblems.getState().byFile.get(kunciPath(path)) ?? [];
      ctx.globalAlpha = 0.95;
      for (const d of list) {
        if (d.severity !== 'error' && d.severity !== 'warning') continue;
        ctx.fillStyle = d.severity === 'error' ? warnaError : bacaVar(host, '--warning', '#e0a030');
        const y = ((d.line - 1) / langkah) * skala;
        ctx.fillRect(0, Math.max(y - 0.5, 0), LEBAR, Math.max(skala, 2));
      }
    }
    ctx.globalAlpha = 1;
    /*
     * `docVersion` belongs in this dependency list.
     *
     * Without it the callback kept the first `view` it ever saw. That view is
     * created before the language extension is installed, so on a real file the
     * minimap drew from an empty syntax tree — the canvas came out blank, and
     * because the canvas was already resized nothing about the panel looked
     * broken. Re-creating the callback when the document changes is what makes
     * the tokens appear.
     */
  }, [view, path, renderCharacters, docVersion]);

  const perbaruiViewport = useCallback(() => {
    const host = hostRef.current;
    if (!host || !view) return;
    const tinggiHost = host.clientHeight;
    const doc = view.state.doc;
    const totalBaris = doc.lines;
    /*
     * Same step as the draw pass, or the viewport box sits at a different
     * scale than the pixels behind it — which is what made the box look
     * misplaced against the code.
     */
    const langkah = Math.max(
      1,
      Math.ceil(totalBaris / MAX_BARIS),
      Math.ceil(totalBaris / Math.max(1, Math.floor(tinggiHost / 1.1))),
    );
    const barisTampil = Math.ceil(totalBaris / langkah);
    const skala = Math.min(TINGGI_BARIS, tinggiHost / Math.max(barisTampil, 1));

    const scroller = view.scrollDOM;
    const barisAtas = doc.lineAt(view.lineBlockAtHeight(scroller.scrollTop).from).number;
    const barisBawah = doc.lineAt(
      view.lineBlockAtHeight(scroller.scrollTop + scroller.clientHeight - 1).from,
    ).number;

    setViewport({
      atas: ((barisAtas - 1) / langkah) * skala,
      tinggi: Math.max(((barisBawah - barisAtas + 1) / langkah) * skala, 6),
    });
  }, [view]);

  /*
   * Coalesce redraws, but never drop the last one.
   *
   * The old guard was a bare `if (timerRef.current !== null) return`, so a
   * pending timer swallowed every later request — and if that timer had been
   * cleared by an unmount mid-flight without resetting the ref, the minimap
   * stopped redrawing for good and no error was raised anywhere. Clearing a
   * pending timer and starting a fresh one keeps the 16ms coalescing and makes
   * the newest request the one that wins.
   */
  const jadwalkan = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      fnRef.current.gambar();
      fnRef.current.viewport();
    }, 16);
  }, []);

  fnRef.current = { gambar, viewport: perbaruiViewport };

  useLayoutEffect(() => {
    jadwalkan();
  }, [jadwalkan, view, docVersion, diagList, renderCharacters]);

  useEffect(() => {
    if (!view) return;
    const scroller = view.scrollDOM;
    const onScroll = () => perbaruiViewport();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    
    jadwalkan();
    return () => scroller.removeEventListener('scroll', onScroll);
  }, [view, perbaruiViewport, jadwalkan]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const ro = new ResizeObserver(() => jadwalkan());
    ro.observe(host);
    return () => ro.disconnect();
  }, [jadwalkan]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        
        timerRef.current = null;
      }
    },
    [],
  );

  const lompat = (clientY: number) => {
    const host = hostRef.current;
    if (!host || !view) return;
    const rect = host.getBoundingClientRect();
    const doc = view.state.doc;
    const totalBaris = doc.lines;
    /*
     * Same step as the draw pass, or the viewport box sits at a different
     * scale than the pixels behind it — which is what made the box look
     * misplaced against the code.
     */
    const langkah = Math.max(
      1,
      Math.ceil(totalBaris / MAX_BARIS),
      Math.ceil(totalBaris / Math.max(1, Math.floor(rect.height / 1.1))),
    );
    const barisTampil = Math.ceil(totalBaris / langkah);
    const skala = Math.min(TINGGI_BARIS, rect.height / Math.max(barisTampil, 1));
    const baris = Math.min(
      Math.max(Math.round(((clientY - rect.top) / skala) * langkah) + 1, 1),
      totalBaris,
    );
    const pos = doc.line(baris).from;
    view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: 'center' }) });
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    lompat(e.clientY);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons === 1) lompat(e.clientY);
  };

  return (
    <div
      ref={hostRef}
      className="cm-minimap"
      data-testid="minimap"
      data-chars={renderCharacters ? '1' : '0'}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      role="presentation"
    >
      <canvas ref={canvasRef} data-testid="minimap-canvas" />
      <div
        className="cm-minimap-viewport"
        data-testid="minimap-viewport"
        style={{ transform: `translateY(${viewport.atas}px)`, height: `${viewport.tinggi}px` }}
      />
    </div>
  );
}
