/**
 * Semantic tokens — language-server highlighting layered over the parser's.
 *
 * ## What the parser cannot know
 *
 * CodeMirror's highlighter (Lezer) is a SYNTAX highlighter: it knows that a
 * token is an identifier, not that the identifier is a struct, a local, a
 * parameter, or a type alias. In `let x = Foo::bar(y)`, Lezer sees three
 * identifiers; a language server sees a local, a type and a parameter, and can
 * colour them differently.
 *
 * Zen of the feature is that the difference is real and visible: fields tinted
 * apart from locals is what makes Rust and TypeScript readable at a glance.
 *
 * ## The legend
 *
 * `textDocument/semanticTokens/full` returns flat integers, not a list of
 * named things: five numbers per token (deltaLine, deltaStart, length,
 * tokenType, modifiers), where the type is an INDEX into a legend the SERVER
 * declares in its capabilities. Reading the response without the legend is
 * meaningless, so the legend is read from the server's own capabilities rather
 * than hardcoded — every server has its own ordering.
 *
 * ## Why a state field and not a plugin
 *
 * The decoration set is computed by the caller after an async round trip, so it
 * arrives as an effect. A view plugin could do it, but it would have to hold the
 * set itself and re-sync on every reconfigure; a field stores it in the state,
 * which is what the decorations facet reads.
 *
 * ## Dropped, not mapped, on a change
 *
 * Same reasoning as inlay hints: the decoration ranges describe a document the
 * server saw. Mapping them onto an edited buffer paints colours on the wrong
 * words, and the re-request is debounced, so the wrong colours would persist.
 */
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view';
import { StateEffect, StateField } from '@codemirror/state';
import { offsetToLsp } from './lspCm';
import { pathToUri } from './lsp';
import { useLsp } from './lspStore';

/** Cap on tokens drawn at once; a dense file can return thousands. */
const TOKEN_MAX = 8000;

/*
 * Fallback token types, indexed by POSITION, used only when the server did not
 * declare a legend.
 *
 * Positional, not by name, because that is what the protocol means: the
 * response carries an index, and the legend maps index -> name. A server that
 * sends tokens without a legend is out of spec; this list is the standard
 * ordering so such a server still gets sensible colours instead of none.
 */
const LEGEND_STANDAR = [
  'namespace', 'type', 'class', 'enum', 'interface', 'struct', 'typeParameter',
  'parameter', 'variable', 'property', 'enumMember', 'event', 'function',
  'method', 'macro', 'keyword', 'modifier', 'comment', 'string', 'number',
  'regexp', 'operator', 'decorator',
];

/*
 * Which highlight CLASS each token type maps to.
 *
 * Mapped onto CodeMirror's existing highlight tags rather than to a parallel
 * colour system: the theme already defines those tags, so semantic tokens
 * automatically follow the active theme instead of needing a second palette,
 * and a token type the theme has no colour for simply keeps the parser's.
 */
const KELAS: Record<string, string> = {
  namespace: 'cmt-namespace',
  type: 'cmt-type',
  class: 'cmt-type',
  enum: 'cmt-type',
  interface: 'cmt-type',
  struct: 'cmt-type',
  typeParameter: 'cmt-type',
  parameter: 'cmt-parameter',
  variable: 'cmt-variable',
  property: 'cmt-property',
  enumMember: 'cmt-property',
  event: 'cmt-property',
  function: 'cmt-function',
  method: 'cmt-function',
  macro: 'cmt-macro',
  keyword: 'cmt-keyword',
  modifier: 'cmt-modifier',
  comment: 'cmt-comment',
  string: 'cmt-string',
  number: 'cmt-number',
  regexp: 'cmt-string',
  operator: 'cmt-operator',
  decorator: 'cmt-macro',
};

/** Read the server's legend for one language, falling back to the standard order. */
export function legendFor(caps: Record<string, unknown> | undefined | null): string[] {
  const provider = caps?.semanticTokensProvider as
    | { legend?: { tokenTypes?: unknown } }
    | null
    | undefined;
  const types = provider?.legend?.tokenTypes;
  if (Array.isArray(types) && types.length > 0) {
    return types.map((t) => String(t));
  }
  return LEGEND_STANDAR;
}

/**
 * Find the running server's capabilities for a file.
 *
 * Keyed by server ID, which is what `lspStore.aktif` uses — `serverForPath`
 * returns the server DEFINITION, so its `id` is what indexes the running set.
 * Reading the map without that step was the first version's mistake and it
 * silently produced `undefined`, which fell back to the standard legend for
 * every file.
 */
export function capsUntukPath(
  def: { id?: string } | null,
  aktif: Record<string, { caps?: Record<string, unknown> }>,
): Record<string, unknown> | undefined {
  if (!def?.id) return undefined;
  return aktif[def.id]?.caps;
}

export interface TokenSet {
  /** Flat five-integer groups, exactly as the server sent them. */
  data: number[];
  legend: string[];
}

/**
 * Decode the flat stream into decorations.
 *
 * The encoding is DELTA-based: each token's line and start are relative to the
 * previous token, not absolute. Decoding it as if it were absolute is the
 * classic mistake here — the first token lands correctly and every one after it
 * drifts further out, which looks like the server sending garbage rather than
 * like a decoder bug.
 */
function tokenDecorations(set: TokenSet, view: EditorView): DecorationSet {
  const { data, legend } = set;
  if (data.length < 5) return Decoration.none;

  const ranges = [];
  let baris = 0;
  let kolom = 0;
  let jumlah = 0;

  for (let i = 0; i + 4 < data.length; i += 5) {
    if (jumlah >= TOKEN_MAX) break;
    const dLine = data[i];
    const dStart = data[i + 1];
    const panjang = data[i + 2];
    const jenis = data[i + 3];

    if (dLine > 0) {
      baris += dLine;
      kolom = dStart;
    } else {
      kolom += dStart;
    }
    if (panjang <= 0) continue;

    /* A line beyond the document means the server's view is stale (the buffer
       was edited between request and reply). Stop rather than guess at a
       position — every later token is delta-encoded off this one. */
    if (baris + 1 > view.state.doc.lines) break;

    const docLine = view.state.doc.line(baris + 1);
    const from = docLine.from + kolom;
    const to = from + panjang;
    if (from < 0 || to > view.state.doc.length || from >= to) continue;

    const nama = legend[jenis];
    const kelas = nama ? KELAS[nama] : undefined;
    if (!kelas) continue;

    ranges.push(Decoration.mark({ class: kelas }).range(from, to));
    jumlah += 1;
  }
  return Decoration.set(ranges, true);
}

const setTokens = StateEffect.define<DecorationSet>();

export const semField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    const efek = tr.effects.find((e) => e.is(setTokens));
    if (efek) return efek.value;
    if (tr.docChanged) return Decoration.none;
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export function setTokensEffect(view: EditorView, set: TokenSet) {
  return setTokens.of(tokenDecorations(set, view));
}

export function clearTokensEffect() {
  return setTokens.of(Decoration.none);
}

/**
 * Ask the server for the tokens of the visible ranges.
 *
 * Full-document tokens would be correct but wasteful on a large file, so the
 * range request is used where the server supports it and the full request
 * otherwise. Both return the same flat encoding.
 */
export async function mintaSemanticTokens(
  path: string,
  view: EditorView,
  legend: string[],
): Promise<TokenSet | null> {
  const rentang =
    view.visibleRanges.length > 0 ? view.visibleRanges : [{ from: 0, to: view.state.doc.length }];
  const gabung: number[] = [];

  for (const r of rentang) {
    const res = (await useLsp.getState().req(path, 'textDocument/semanticTokens/range', {
      textDocument: { uri: pathToUri(path) },
      range: { start: offsetToLsp(view, r.from), end: offsetToLsp(view, r.to) },
    })) as { data?: unknown } | null;

    /* A server that does not implement the range request answers with an error,
       which `req` throws; the caller retries with the full request. Returning
       null here keeps that decision with the caller. */
    const data = res?.data;
    if (!Array.isArray(data)) return null;
    gabung.push(...(data as number[]));
    if (gabung.length >= TOKEN_MAX * 5) break;
  }
  return { data: gabung, legend };
}

/**
 * The whole-document fallback.
 *
 * Used when the range request is unsupported. Its deltas are absolute from the
 * start of the file, which the decoder already handles — the first token's
 * `dLine` is measured from line 0.
 */
export async function mintaSemanticTokensPenuh(
  path: string,
  view: EditorView,
  legend: string[],
): Promise<TokenSet | null> {
  const res = (await useLsp.getState().req(path, 'textDocument/semanticTokens/full', {
    textDocument: { uri: pathToUri(path) },
  })) as { data?: unknown } | null;
  const data = res?.data;
  if (!Array.isArray(data)) return null;
  void view;
  return { data: data as number[], legend };
}
