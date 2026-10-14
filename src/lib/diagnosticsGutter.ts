import { gutter, GutterMarker, Decoration, WidgetType, EditorView, type DecorationSet } from '@codemirror/view';
import { Compartment, RangeSet, StateEffect, StateField, type EditorState, type Extension } from '@codemirror/state';
import type { Diagnostic } from './problemsStore';

class DiagMarker extends GutterMarker {
  constructor(private severity: Diagnostic['severity']) {
    super();
  }

  override toDOM() {
    const el = document.createElement('span');
    el.className = `cm-diag-marker is-${this.severity}`;
    el.textContent = this.severity === 'error' ? '⊗' : this.severity === 'warning' ? '⚠' : 'ⓘ';
    el.title = this.severity;
    return el;
  }
}

const MARKERS = {
  error: new DiagMarker('error'),
  warning: new DiagMarker('warning'),
  info: new DiagMarker('info'),
  hint: new DiagMarker('hint'),
};

const RANK: Record<Diagnostic['severity'], number> = { error: 0, warning: 1, info: 2, hint: 3 };

export const diagCompartment = new Compartment();

/* ── Inline diagnostics lens ───────────────────────────────────────────────
 *
 * The message, printed at the end of the offending line.
 *
 * The gutter marker says a line is broken; it does not say HOW. Reading the
 * reason meant hovering, or leaving the buffer for the Problems panel — and
 * when a run is being reviewed because the agent reported a failure, the
 * reason is exactly what is being looked for. Zed calls this an "error lens".
 *
 * A widget rather than a line decoration because it must sit AFTER the last
 * character of the line and take part in horizontal layout: a decoration
 * spanning the line would push the text and break selection.
 *
 * Only the highest-severity diagnostic per line is shown, matching the gutter.
 * Printing several would put two overlapping messages in the same place, and
 * the reader cannot act on either.
 */

/** Longest message rendered inline before it is cut. A wrapped message pushes
 *  the line height around and makes the buffer jump as diagnostics arrive. */
const LENS_MAX = 120;

class LensWidget extends WidgetType {
  constructor(
    readonly teks: string,
    readonly severity: Diagnostic['severity'],
    readonly title: string,
  ) {
    super();
  }

  override eq(other: LensWidget) {
    return other.teks === this.teks && other.severity === this.severity;
  }

  override toDOM() {
    const el = document.createElement('span');
    el.className = `cm-diag-lens is-${this.severity}`;
    el.textContent = this.teks;
    /*
     * The full message in the tooltip even when the visible text was cut, so
     * nothing is lost — the lens just stops at a readable width.
     */
    el.title = this.title;
    /* Selecting across the line should not pick up the lens text: it is not
       part of the document, and copying it would put a compiler message into
       the user's source. */
    el.setAttribute('aria-hidden', 'true');
    return el;
  }

  override ignoreEvent() {
    return false;
  }
}

const setLens = StateEffect.define<Diagnostic[]>();

/** Build the per-line widget ranges from a diagnostic list.
 *
 *  Takes an `EditorState`, not an `EditorView`: a `StateField` update only ever
 *  has the state, and reaching for a view there is what made the first version
 *  of this unreadable. */
function lensRanges(list: Diagnostic[], state: EditorState): DecorationSet {
  const perLine = new Map<number, Diagnostic>();
  for (const d of list) {
    if (d.line < 1 || d.line > state.doc.lines) continue;
    const ada = perLine.get(d.line);
    if (!ada || RANK[d.severity] < RANK[ada.severity]) perLine.set(d.line, d);
  }

  const ranges = [...perLine.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([line, d]) => {
      const baris = state.doc.line(line);
      const pesan = d.message.trim();
      const pendek = pesan.length > LENS_MAX ? `${pesan.slice(0, LENS_MAX - 1)}…` : pesan;
      const teks = d.source ? `${pendek}  ${d.source}` : pendek;
      const penuh = d.source ? `${pesan}\n\n${d.source}` : pesan;
      return Decoration.widget({
        widget: new LensWidget(teks, d.severity, penuh),
        side: 1,
      }).range(baris.to);
    });

  return Decoration.set(ranges, true);
}

export const lensField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    /*
     * A lens is anchored to the END of a line, so any edit moves the position
     * it was built from. Remapping would leave a message attached to whatever
     * line slid into that offset, which reads as a diagnostic on the wrong
     * code. The caller re-pushes after an edit, so dropping the stale set is
     * both simpler and more honest than keeping a wrong one.
     */
    const efek = tr.effects.find((e) => e.is(setLens));
    if (efek) return lensRanges(efek.value, tr.state);
    if (tr.docChanged) return deco.map(tr.changes);
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/**
 * The effect that sets the lens contents.
 *
 * Exported as an effect (rather than a `pushLens(view, list)` helper) because
 * the editor dispatches it alongside the gutter and squiggle reconfigures in
 * ONE transaction. A helper taking a view would force a second dispatch, and
 * two dispatches per diagnostic update is two renders of the same line.
 */
export function setLensEffect(list: Diagnostic[]) {
  return setLens.of(list);
}



export function diagnosticsGutter(list: Diagnostic[], docLines: number): Extension {
  if (list.length === 0) return [];

  const perLine = new Map<number, Diagnostic['severity']>();
  for (const d of list) {
    if (d.line < 1 || d.line > docLines) continue;
    const ada = perLine.get(d.line);
    if (!ada || RANK[d.severity] < RANK[ada]) perLine.set(d.line, d.severity);
  }
  if (perLine.size === 0) return [];

  return gutter({
    class: 'cm-diag-gutter',
    markers: (view) => {
      /*
       * The clamp above runs against `docLines`, which is a snapshot: it was
       * read when this extension was built. The `markers` callback, however,
       * runs later, against whatever document is in the view THEN — and the
       * document can have shrunk in between (a file changed on disk is
       * rewritten under the editor, and diagnostics computed from the longer
       * text are still around). Indexing a stale line number throws
       * "Invalid line number N in M-line document" INSIDE CodeMirror's render,
       * which does not just lose the marker: the plugin crashes, the view is
       * left half-built, and the next range comparison fails with
       * "Position N is out of range for changeset of length 0" - the whole
       * editor section lands in the error boundary. So the live document gets
       * its own check, and markers past its end are dropped rather than
       * trusted.
       */
      const batas = view.state.doc.lines;
      const ranges = [...perLine.entries()]
        .filter(([line]) => line >= 1 && line <= batas)
        .sort((a, b) => a[0] - b[0])
        .map(([line, sev]) => {
          const from = view.state.doc.line(line).from;
          return MARKERS[sev].range(from);
        });
      return RangeSet.of(ranges, true);
    },
    initialSpacer: () => MARKERS.error,
  });
}
