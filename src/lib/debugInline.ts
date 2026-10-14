/**
 * Debugger inline values — the locals, shown at the line execution stopped on.
 *
 * ## What it replaces
 *
 * While stepping, the values live in the Variables panel: a separate pane the
 * reader has to look away from the code to read, and then look back from. Inline
 * values put them next to the line being executed, so stepping through a loop
 * and watching a variable change is one glance instead of two panes.
 *
 * ## Why they sit at the STOP LINE and not at each declaration
 *
 * This is the honest part, and it is a real difference from an editor with full
 * debug-adapter support.
 *
 * The protocol (`Debug Adapter Protocol`) reports a variable's NAME and VALUE;
 * it does not report where that variable is declared in the file. Placing each
 * value at its declaration means GUESSING which line declares it — matching the
 * identifier against lines above the stop point — and a wrong guess paints
 * `total = 42` next to a line that has nothing to do with `total`. In a file
 * with a parameter and a local of the same name, or a shadowed variable, the
 * guess is wrong and silently so.
 *
 * So the values are collected into one annotation on the line execution is
 * actually stopped at. That line is a fact the adapter reported, not an
 * inference. The reader gets the same information in the same glance, and
 * nothing is claimed about a line nobody is stopped on.
 *
 * (Editors that DO place per-declaration values use `textDocument/inlineValue`,
 * an LSP request served by the language server — a different protocol from the
 * DAP one this debugger speaks.)
 *
 * ## Which scope
 *
 * The first non-expensive scope, matching what the Variables panel expands by
 * default. `expensive` is the adapter saying "this scope is costly to read";
 * pulling it on every step would make stepping slow for a value the reader
 * rarely wants.
 */
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import { StateEffect, StateField } from '@codemirror/state';

/** Longest annotation drawn before it is cut. */
const MAKS = 240;

class NilaiWidget extends WidgetType {
  constructor(
    readonly teks: string,
    readonly penuh: string,
  ) {
    super();
  }

  override eq(other: NilaiWidget) {
    return other.teks === this.teks;
  }

  override toDOM() {
    const el = document.createElement('span');
    el.className = 'cm-debug-inline';
    el.textContent = this.teks;
    el.title = this.penuh;
    /* Not document text: a drag-select must not copy a runtime value into the
       reader's source. */
    el.setAttribute('aria-hidden', 'true');
    return el;
  }

  override ignoreEvent() {
    return false;
  }
}

export interface VariabelDebug {
  name: string;
  value: string;
  type?: string;
}

/**
 * Build the annotation text for one line.
 *
 * `name = value`, comma-separated, with the type in brackets only when the
 * adapter supplied one — inventing a type would be a second guess on top of the
 * first.
 *
 * Truncated at `MAKS` with the full list in the tooltip: a frame with forty
 * locals would otherwise push the code off the right edge, and the reader
 * wanting all of them has the Variables panel.
 */
function teksNilai(vars: VariabelDebug[]): string {
  if (vars.length === 0) return '';
  const bagian = vars.map((v) => {
    const t = v.type ? `: ${v.type}` : '';
    return `${v.name}${t} = ${v.value}`;
  });
  const semua = bagian.join(', ');
  return semua.length > MAKS ? `${semua.slice(0, MAKS - 1)}…` : semua;
}

/** Decoration for one line, or none when there is nothing to show. */
function nilaiDecorations(
  line: number,
  vars: VariabelDebug[],
  view: EditorView,
): DecorationSet {
  const teks = teksNilai(vars);
  if (!teks) return Decoration.none;
  if (line < 1 || line > view.state.doc.lines) return Decoration.none;

  /*
   * Anchored at the END of the line, like the diagnostic lens and blame.
   * Placing it at the start would push the code right on the line being read,
   * which is the line the eye is already on.
   */
  const baris = view.state.doc.line(line);
  return Decoration.set([
    Decoration.widget({
      widget: new NilaiWidget(teks, vars.map((v) => `${v.name} = ${v.value}`).join('\n')),
      side: 1,
    }).range(baris.to),
  ]);
}

const setNilai = StateEffect.define<DecorationSet>();

export const debugInlineField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    const efek = tr.effects.find((e) => e.is(setNilai));
    if (efek) return efek.value;
    /*
     * Kept across a doc change, unlike the LSP inlay hints.
     *
     * A runtime value is not tied to the text: it describes what the debugger
     * is stopped on, and it stays true while the reader edits elsewhere. The
     * one thing that invalidates it is the stop POSITION moving, and the
     * debugger re-pushes on every step.
     */
    if (tr.docChanged) return deco.map(tr.changes);
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/** Replace the values. The caller builds them, because it has the view. */
export function setNilaiEffect(view: EditorView, line: number, vars: VariabelDebug[]) {
  return setNilai.of(nilaiDecorations(line, vars, view));
}

export function clearNilaiEffect() {
  return setNilai.of(Decoration.none);
}
