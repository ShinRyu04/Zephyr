/**
 * Inlay hints — inferred types and parameter names, drawn inside the code.
 *
 * ## What they are for
 *
 * A language server knows the type of every expression, and most of that is
 * invisible in the source: `let x = vec![]` says nothing about what `x` holds,
 * and a call with four positional arguments says nothing about which is which.
 * Reading the answer normally costs a hover or a jump per expression.
 *
 * An inlay hint puts it in the buffer instead, faint and non-selectable, so the
 * reader gets the type without leaving the line.
 *
 * ## Why a widget, not a decoration over text
 *
 * The hint must not be part of the document. A decoration spanning a range
 * would make it selectable and copyable — a drag-select down the file would
 * pick up server-generated type names and paste them into the reader's code. A
 * widget at a position takes part in layout without being text.
 *
 * ## Why the visible range only
 *
 * `textDocument/inlayHint` is answered per RANGE, and a server asked for a
 * 20,000-line file computes hints for all of it — types it would then send
 * across the wire for lines nobody is looking at. The viewport is what is on
 * screen, so that is what is asked for; scrolling re-asks.
 */
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import { StateEffect, StateField } from '@codemirror/state';
import { lspToOffset, offsetToLsp } from './lspCm';
import { pathToUri } from './lsp';
import { useLsp } from './lspStore';

/** One hint as the server described it. */
export interface InlayHint {
  position: { line: number; character: number };
  /** 1 = Type, 2 = Parameter. Used only for styling. */
  kind?: number;
  label: unknown;
  paddingLeft?: boolean;
  paddingRight?: boolean;
  tooltip?: unknown;
}

/**
 * Cap on how many hints are drawn at once.
 *
 * A viewport can still produce hundreds in a dense file, and each one is a
 * widget the view has to lay out. The cap is high enough that a normal screen
 * is unaffected.
 */
const HINT_MAX = 400;

class HintWidget extends WidgetType {
  constructor(
    readonly teks: string,
    readonly jenis: 'type' | 'param',
    readonly kiri: boolean,
    readonly kanan: boolean,
    readonly tip: string,
  ) {
    super();
  }

  override eq(other: HintWidget) {
    return (
      other.teks === this.teks &&
      other.jenis === this.jenis &&
      other.kiri === this.kiri &&
      other.kanan === this.kanan
    );
  }

  override toDOM() {
    const el = document.createElement('span');
    el.className = `cm-inlay is-${this.jenis}${this.kiri ? ' pad-kiri' : ''}${this.kanan ? ' pad-kanan' : ''}`;
    el.textContent = this.teks;
    if (this.tip) el.title = this.tip;
    /*
     * Not part of the document, and not announced: a screen reader reading the
     * code aloud should read the CODE, not a type annotation the server
     * inferred. The tooltip carries it for anyone who wants it.
     */
    el.setAttribute('aria-hidden', 'true');
    return el;
  }

  override ignoreEvent() {
    return false;
  }
}

/**
 * Coerce one server label into a string.
 *
 * `label` is either a string or an array of parts, where a part carries the
 * text in `value`. Both are flattened rather than only the string form being
 * accepted — rust-analyzer always uses parts, so rejecting them would mean hints
 * never appear for one of the languages that supports them best.
 */
function teksLabel(label: unknown): string {
  if (typeof label === 'string') return label;
  if (Array.isArray(label)) {
    return label
      .map((p) => (typeof p === 'string' ? p : String((p as { value?: unknown }).value ?? '')))
      .join('');
  }
  return '';
}

function teksTooltip(t: unknown): string {
  if (typeof t === 'string') return t;
  if (t && typeof t === 'object') {
    const v = (t as { value?: unknown }).value;
    if (typeof v === 'string') return v;
  }
  return '';
}

/**
 * Build the widget decorations for one response.
 *
 * Takes the view because the positions are resolved through it; exported so the
 * rule can be tested without a live editor.
 */
function hintDecorations(list: InlayHint[], view: EditorView): DecorationSet {
  if (list.length === 0) return Decoration.none;

  const ranges = [];
  let dipakai = 0;
  for (const h of list) {
    if (dipakai >= HINT_MAX) break;
    const teks = teksLabel(h.label).trim();
    if (!teks) continue;

    const pos = lspToOffset(view, h.position);
    /* A position outside the document would throw when the decoration is built,
       so it is skipped rather than clamped — a clamped hint sits on the wrong
       line and reads as a wrong type, which is worse than no hint. */
    if (pos < 0 || pos > view.state.doc.length) continue;

    ranges.push(
      Decoration.widget({
        widget: new HintWidget(
          teks,
          h.kind === 2 ? 'param' : 'type',
          !!h.paddingLeft,
          !!h.paddingRight,
          teksTooltip(h.tooltip),
        ),
        side: 1,
      }).range(pos),
    );
    dipakai += 1;
  }
  return Decoration.set(ranges, true);
}

const setHints = StateEffect.define<DecorationSet>();

/**
 * The field.
 *
 * Hints are DROPPED on a document change rather than mapped. A mapped hint
 * keeps its text while the code under it moves, so it would claim
 * `x: Vec<i32>` about a line the reader had already edited to something else,
 * and the re-request only happens on a debounce — so the wrong text would be on
 * screen for as long as that takes. Empty is the honest state in between.
 */
export const inlayField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    const efek = tr.effects.find((e) => e.is(setHints));
    if (efek) return efek.value;
    if (tr.docChanged) return Decoration.none;
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/** Replace the hints. The caller builds them, because it has the view. */
export function setHintsEffect(view: EditorView, list: InlayHint[]) {
  return setHints.of(hintDecorations(list, view));
}

/** Clear them (setting off, no server, tab switched). */
export function clearHintsEffect() {
  return setHints.of(Decoration.none);
}

/**
 * Ask the server for the hints visible right now.
 *
 * Returns the list rather than dispatching, so the caller decides whether the
 * view is still the same one it asked about.
 */
export async function mintaInlayHints(path: string, view: EditorView): Promise<InlayHint[]> {
  /* Every visible range, not just the first: with a collapsed fold or a
     scrolled viewport CodeMirror reports more than one, and asking for only the
     first would leave part of the screen without hints. */
  const rentang =
    view.visibleRanges.length > 0 ? view.visibleRanges : [{ from: 0, to: view.state.doc.length }];
  const hasil: InlayHint[] = [];
  for (const r of rentang) {
    const res = await useLsp.getState().req(path, 'textDocument/inlayHint', {
      textDocument: { uri: pathToUri(path) },
      range: { start: offsetToLsp(view, r.from), end: offsetToLsp(view, r.to) },
    });
    if (Array.isArray(res)) hasil.push(...(res as InlayHint[]));
    if (hasil.length >= HINT_MAX) break;
  }
  return hasil;
}
