import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
  type CompletionSource,
} from '@codemirror/autocomplete';
import { RangeSetBuilder, StateEffect, StateField, Text, type Extension } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  hoverTooltip,
  showPanel,
  type DecorationSet,
  type Panel,
} from '@codemirror/view';
import { useLsp } from './lspStore';
import { kunciPath } from './pathKey';
import { fsRead } from './commands';
import { COMPLETION_KIND, SYMBOL_KIND, hoverText, pathToUri, uriToPath } from './lsp';
import { keCompletion, konteksDari, useSnip } from './snippetStore';
import { useStore } from './store';
import type { Diagnostic } from './problemsStore';

export function offsetToLsp(view: EditorView, pos: number) {
  const line = view.state.doc.lineAt(pos);
  return { line: line.number - 1, character: pos - line.from };
}

export function lspToOffset(view: EditorView, pos: { line: number; character: number }): number {
  const doc = view.state.doc;
  const ln = Math.min(Math.max(pos.line + 1, 1), doc.lines);
  const line = doc.line(ln);
  return Math.min(line.from + Math.max(pos.character, 0), line.to);
}

const MARK = {
  error: Decoration.mark({ class: 'cm-zdiag cm-zdiag-error' }),
  warning: Decoration.mark({ class: 'cm-zdiag cm-zdiag-warning' }),
  info: Decoration.mark({ class: 'cm-zdiag cm-zdiag-info' }),
  hint: Decoration.mark({ class: 'cm-zdiag cm-zdiag-hint' }),
};

export function squiggleFor(list: Diagnostic[], doc: Text): DecorationSet {
  const b = new RangeSetBuilder<Decoration>();
  
  const rentang: { from: number; to: number; sev: Diagnostic['severity'] }[] = [];
  for (const d of list) {
    if (d.line < 1 || d.line > doc.lines) continue;
    const l1 = doc.line(d.line);
    const from = Math.min(l1.from + Math.max(d.column - 1, 0), l1.to);
    const endLine = d.endLine && d.endLine >= 1 && d.endLine <= doc.lines ? d.endLine : d.line;
    const l2 = doc.line(endLine);
    let to = Math.min(l2.from + Math.max((d.endColumn ?? d.column) - 1, 0), l2.to);
    
    if (to <= from) to = Math.min(from + 1, doc.length);
    if (to > from) rentang.push({ from, to, sev: d.severity });
  }
  rentang.sort((a, z) => a.from - z.from || a.to - z.to);
  for (const r of rentang) b.add(r.from, r.to, MARK[r.sev]);
  return b.finish();
}

const setSquiggle = StateEffect.define<Diagnostic[]>();

/**
 * Squiggles live in a state field, not in a reconfigured compartment.
 *
 * A compartment holds the value it was given, and `EditorView.decorations.of(set)`
 * hands over a set that was already built from ONE document. The moment that set
 * meets a different document - a file opened over the old one, an extension
 * install that remounts the editor - CodeMirror diffs it against the current
 * document and maps positions that no longer fit, which throws
 * `RangeError: Position N is out of range for changeset of length 0` and takes
 * the whole editor down with it.
 *
 * A field cannot get into that state: the old set is remapped through every
 * change, and a fresh set is only ever built from `tr.state.doc`, the document
 * the pair actually belongs to.
 */
export const squiggleField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) if (e.is(setSquiggle)) deco = squiggleFor(e.value, tr.state.doc);
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/** Pusatkan daftar diagnostik ke field squiggle (satu transaksi bersama gutter & lens). */
export function setSquiggleEffect(list: Diagnostic[]) {
  return setSquiggle.of(list);
}

export function lspCompletionSource(path: string) {
  return async (ctx: CompletionContext): Promise<CompletionResult | null> => {
    const lsp = useLsp.getState();
    if (!lsp.docs[path]) return null;

    const view = ctx.view;
    if (!view) return null;
    const posLsp = offsetToLsp(view, ctx.pos);
    
    const before = ctx.matchBefore(/[\w$]*/);
    const from = before ? before.from : ctx.pos;

    let res: unknown;
    try {
      res = await lsp.req(path, 'textDocument/completion', {
        textDocument: { uri: pathToUri(path) },
        position: posLsp,
        context: { triggerKind: ctx.explicit ? 1 : 2 },
      });
    } catch {
      return null;
    }

    const items = Array.isArray(res)
      ? res
      : ((res as { items?: unknown[] })?.items ?? []);
    if (!Array.isArray(items) || items.length === 0) return null;

    return {
      from,
      
      validFor: /^[\w$]*$/,
      options: items.slice(0, 500).map((raw) => {
        const it = raw as Record<string, unknown>;
        const label = String(it.label ?? '');
        const kindNum = typeof it.kind === 'number' ? it.kind : 0;
        const detailRaw = it.detail;
        return {
          label,
          type: COMPLETION_KIND[kindNum] ?? 'text',
          detail: typeof detailRaw === 'string' ? detailRaw : undefined,
          apply:
            typeof it.insertText === 'string' && it.insertText !== label
              ? (it.insertText as string)
              : undefined,
          boost: typeof it.sortText === 'string' ? 0 : undefined,
        };
      }),
    };
  };
}

export function snippetCompletionSource(path: string, langId: () => string) {
  return async (ctx: CompletionContext): Promise<CompletionResult | null> => {
    const mode = pengaturanSnippet();
    if (mode === 'none') return null;

    const lang = langId();
    const S = useSnip.getState();
    
    let daftar = S.untuk(lang);
    if (daftar.length === 0) {
      const setb = await S.muat(lang);
      daftar = setb?.snippets ?? [];
    }
    if (daftar.length === 0) return null;

    const kata = ctx.matchBefore(/[\w$-]*/);
    const from = kata ? kata.from : ctx.pos;
    const diketik = kata ? kata.text : '';
    
    if (!ctx.explicit && diketik.length === 0) return null;

    const cocok = diketik
      ? daftar.filter((s) => s.prefix.toLowerCase().startsWith(diketik.toLowerCase()))
      : daftar;
    if (cocok.length === 0) return null;

    const konteks = await konteksDari(ctx.state, path);
    const boostMode = mode === 'top' ? 99 : mode === 'bottom' ? -99 : 0;

    return {
      from,
      options: cocok.slice(0, 80).map((s) => {
        const c = keCompletion(s, konteks);
        return { ...c, boost: (c.boost ?? 0) + boostMode };
      }),
      validFor: /^[\w$-]*$/,
    };
  };
}

function pengaturanSnippet(): 'top' | 'bottom' | 'inline' | 'none' {
  const m = useStore.getState().settings.editor?.snippetSuggestions ?? 'inline';
  return m === 'top' || m === 'bottom' || m === 'none' ? m : 'inline';
}

export function lspAutocompletion(path: string): Extension {
  return autocompletion({
    override: [lspCompletionSource(path)],
    activateOnTyping: true,
    maxRenderedOptions: 60,
  });
}

/*
 * Words already in the file.
 *
 * This is the source that makes a popup appear for ordinary identifiers without
 * waiting on anything external. It is deliberately local and cheap: scan the
 * visible text, collect identifier-shaped runs, rank the ones nearest the
 * cursor first. A language server would give better results, but it is not
 * always running and completion should not be dead until it is.
 */
function sumberKataDokumen(): CompletionSource {
  return (ctx: CompletionContext): CompletionResult | null => {
    const kata = ctx.matchBefore(/[\w$]+/);
    if (!kata || (kata.from === kata.to && !ctx.explicit)) return null;
    const diketik = kata.text;
    /* Allow single character matching so typing 't' offers words starting with 't' */
    if (diketik.length < 1 && !ctx.explicit) return null;

    const kandidat = new Map<string, number>();
    const doc = ctx.state.doc;
    const sekitar = ctx.state.sliceDoc(
      Math.max(0, ctx.pos - 40_000),
      Math.min(doc.length, ctx.pos + 4_000),
    );
    for (const m of sekitar.matchAll(/[A-Za-z_$][\w$]{1,40}/g)) {
      const w = m[0];
      if (w === diketik) continue;
      if (!w.toLowerCase().startsWith(diketik.toLowerCase())) continue;
      kandidat.set(w, (kandidat.get(w) ?? 0) + 1);
    }
    if (kandidat.size === 0) return null;

    const opsi: Completion[] = [...kandidat.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 40)
      .map(([label, freq]) => ({
        label,
        type: /^[A-Z]/.test(label) ? 'class' : 'variable',
        boost: freq,
        /* A plain text label: inserting it must not run snippet syntax. */
        apply: label,
      }));

    return { from: kata.from, options: opsi, validFor: /^[\w$]*$/ };
  };
}

function sumberSemuaCompletion(
  path: string,
  langId: () => string,
  adaLsp: boolean,
): CompletionSource {
  const lsp = adaLsp ? lspCompletionSource(path) : null;
  const snip = snippetCompletionSource(path, langId);
  const kata = sumberKataDokumen();

  return async (ctx: CompletionContext): Promise<CompletionResult | null> => {
    const langSources = ctx.state.languageDataAt<CompletionSource>('autocomplete', ctx.pos);
    const promises: Promise<CompletionResult | null>[] = [];
    for (const src of langSources) {
      try {
        promises.push(Promise.resolve(src(ctx)));
      } catch {
        // ignore
      }
    }
    if (lsp) {
      try {
        promises.push(Promise.resolve(lsp(ctx)));
      } catch {
        // ignore
      }
    }
    try {
      promises.push(Promise.resolve(snip(ctx)));
    } catch {
      // ignore
    }
    try {
      promises.push(Promise.resolve(kata(ctx)));
    } catch {
      // ignore
    }

    const results = await Promise.all(promises);
    const valid = results.filter(
      (r): r is CompletionResult => r !== null && Array.isArray(r.options) && r.options.length > 0,
    );
    if (valid.length === 0) return null;

    let from = ctx.pos;
    const options: Completion[] = [];
    const seen = new Set<string>();

    for (const r of valid) {
      if (r.from < from) from = r.from;
      for (const opt of r.options) {
        if (!seen.has(opt.label)) {
          seen.add(opt.label);
          options.push(opt);
        }
      }
    }

    return {
      from,
      options,
      validFor: /^[\w$]*$/,
    };
  };
}

export function autocompletionZephyr(path: string, langId: () => string, adaLsp: boolean): Extension {
  return autocompletion({
    override: [sumberSemuaCompletion(path, langId, adaLsp)],
    activateOnTyping: true,
    maxRenderedOptions: 60,
    defaultKeymap: true,
  });
}

export function lspHover(path: string): Extension {
  return hoverTooltip(async (view, pos) => {
    const lsp = useLsp.getState();
    if (!lsp.docs[path]) return null;
    let res: unknown;
    try {
      res = await lsp.req(path, 'textDocument/hover', {
        textDocument: { uri: pathToUri(path) },
        position: offsetToLsp(view, pos),
      });
    } catch {
      return null;
    }
    if (!res) return null;
    const teks = hoverText((res as { contents?: unknown }).contents);
    if (!teks.trim()) return null;

    return {
      pos,
      above: true,
      create: () => {
        const dom = document.createElement('div');
        dom.className = 'cm-zhover';
        dom.setAttribute('data-testid', 'cm-hover');
        
        dom.textContent = teks.replace(/```[a-z]*\n?/g, '').trim();
        return { dom };
      },
    };
  }, { hoverTime: 220 });
}

export interface LspLocation {
  file: string;
  line: number;
  column: number;
}

const asLocation = (raw: unknown): LspLocation | null => {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  
  const uri = (o.uri ?? o.targetUri) as string | undefined;
  const range = (o.range ?? o.targetSelectionRange ?? o.targetRange) as
    | Record<string, Record<string, number>>
    | undefined;
  if (!uri || !range?.start) return null;
  return {
    file: uriToPath(uri),
    line: (range.start.line ?? 0) + 1,
    column: (range.start.character ?? 0) + 1,
  };
};

export async function lspDefinition(path: string, view: EditorView, pos: number) {
  const res = await useLsp.getState().req(path, 'textDocument/definition', {
    textDocument: { uri: pathToUri(path) },
    position: offsetToLsp(view, pos),
  });
  const arr = Array.isArray(res) ? res : res ? [res] : [];
  for (const r of arr) {
    const loc = asLocation(r);
    if (loc) return loc;
  }
  return null;
}

export async function lspReferences(path: string, view: EditorView, pos: number) {
  const res = await useLsp.getState().req(path, 'textDocument/references', {
    textDocument: { uri: pathToUri(path) },
    position: offsetToLsp(view, pos),
    context: { includeDeclaration: true },
  });
  const arr = Array.isArray(res) ? res : [];
  return arr.map(asLocation).filter((x): x is LspLocation => !!x);
}

export async function lspDocumentSymbols(path: string) {
  const res = await useLsp.getState().req(path, 'textDocument/documentSymbol', {
    textDocument: { uri: pathToUri(path) },
  });
  return Array.isArray(res) ? res : [];
}

/* ── Call hierarchy ───────────────────────────────────────────────────────
 *
 * "Who calls this, and what does this call" — the one navigation question the
 * rest of the LSP surface cannot answer. `references` finds call sites but not
 * the enclosing function, so answering it by hand means reading each hit's
 * surroundings; `definition` goes the other way. A server that implements this
 * answers it in one round trip.
 *
 * The protocol is three steps, not one:
 *
 *   1. `prepareCallHierarchy` at a position -> the item(s) under the cursor
 *   2. `callHierarchy/incomingCalls` on an item -> its callers
 *   3. `callHierarchy/outgoingCalls` on an item -> its callees
 *
 * Steps 2 and 3 take the ITEM from step 1, not a position, and the item must be
 * passed back verbatim — a server may key its internal state on the `data`
 * field it put there. So the raw item is kept and sent unmodified.
 */

export interface CallItem {
  name: string;
  kind: string;
  /** `file`, `line` (1-based), `column` (1-based) of the item's own location. */
  file: string;
  line: number;
  column: number;
  detail?: string;
  /** The call sites inside the CALLER that reach the callee. */
  fromRanges?: { line: number; column: number }[];
  /** Kept so the item can be sent back unmodified. */
  raw: unknown;
}

function keCallItem(raw: Record<string, unknown>, bawaan?: string): CallItem | null {
  const uri = String(raw.uri ?? '');
  const range = raw.range as { start?: { line?: number; character?: number } } | undefined;
  const start = range?.start;
  if (!uri || !start || typeof start.line !== 'number') return null;
  return {
    name: String(raw.name ?? '(tanpa nama)'),
    kind: SYMBOL_KIND[Number(raw.kind ?? 0)] ?? 'function',
    file: uriToPath(uri),
    line: start.line + 1,
    column: (start.character ?? 0) + 1,
    detail: raw.detail ? String(raw.detail) : bawaan,
    raw,
  };
}

/** Step 1: what is under the cursor, as call-hierarchy items. */
export async function lspPrepareCallHierarchy(
  path: string,
  view: EditorView,
  pos: number,
): Promise<CallItem[]> {
  const res = await useLsp.getState().req(path, 'textDocument/prepareCallHierarchy', {
    textDocument: { uri: pathToUri(path) },
    position: offsetToLsp(view, pos),
  });
  if (!Array.isArray(res)) return [];
  return res
    .map((r) => keCallItem(r as Record<string, unknown>))
    .filter((x): x is CallItem => x !== null);
}

/**
 * Steps 2 and 3.
 *
 * `arah` picks the method; the response shape differs by direction, which is
 * why the two are unpacked separately rather than by a shared mapper. Incoming
 * items carry `from` (the caller) plus `fromRanges` (where inside the caller
 * the call sits); outgoing carry `to` (the callee) plus `fromRanges` (where
 * inside THIS function the call sits).
 */
export async function lspCallHierarchy(
  path: string,
  item: CallItem,
  arah: 'incoming' | 'outgoing',
): Promise<CallItem[]> {
  const metode =
    arah === 'incoming' ? 'callHierarchy/incomingCalls' : 'callHierarchy/outgoingCalls';
  const res = await useLsp.getState().req(path, metode, { item: item.raw });
  if (!Array.isArray(res)) return [];

  const keluar: CallItem[] = [];
  for (const raw of res as Record<string, unknown>[]) {
    const isi = (arah === 'incoming' ? raw.from : raw.to) as Record<string, unknown> | undefined;
    if (!isi) continue;
    const dasar = keCallItem(isi);
    if (!dasar) continue;

    /*
     * The ranges are where the CALL is written, in the OTHER file. They are
     * what makes the result navigable: a caller with three call sites should
     * jump to the one you picked, not to the top of the function.
     */
    const ranges = Array.isArray(raw.fromRanges)
      ? (raw.fromRanges as { start?: { line?: number; character?: number } }[])
          .filter((r) => r.start && typeof r.start.line === 'number')
          .map((r) => ({ line: (r.start as { line: number }).line + 1, column: (r.start?.character ?? 0) + 1 }))
      : [];

    keluar.push({ ...dasar, fromRanges: ranges.length ? ranges : undefined });
  }
  return keluar;
}

export interface TextEditLsp {
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
  newText: string;
}

export function applyEdits(view: EditorView, edits: TextEditLsp[]): number {
  if (edits.length === 0) return 0;
  const konversi = edits.map((e) => ({
    from: lspToOffset(view, e.range.start),
    to: lspToOffset(view, e.range.end),
    insert: e.newText,
  }));
  konversi.sort((a, b) => b.from - a.from);
  view.dispatch({ changes: konversi });
  return konversi.length;
}

export async function lspFormat(path: string, view: EditorView, tabSize: number, insertSpaces: boolean) {
  const res = await useLsp.getState().req(path, 'textDocument/formatting', {
    textDocument: { uri: pathToUri(path) },
    options: { tabSize, insertSpaces },
  });
  const edits = Array.isArray(res) ? (res as TextEditLsp[]) : [];
  return applyEdits(view, edits);
}

/**
 * Apply a `WorkspaceEdit` to one open buffer, counting the edits that landed.
 *
 * Lifted out of `LspOverlay`, which had this inline. It is needed in two places
 * now — the code-action menu and fix-all-on-save — and two copies of an
 * "apply these ranges in reverse order" routine is exactly the kind of
 * duplication where one copy gets the sort direction wrong and silently
 * corrupts the buffer.
 *
 * Edits aimed at OTHER files are ignored, not applied: this editor has one
 * buffer per view, and the caller (`fixAllOnSave`) is formatting the file it is
 * about to write. A multi-file edit is reported by its count so the caller can
 * say so rather than pretending nothing happened.
 */
export function applyWorkspaceEdit(
  view: EditorView,
  path: string,
  edit: Record<string, unknown> | undefined,
  /** Called for edits that target a different file. */
  onLain?: (path: string, edits: TextEditLsp[]) => void,
): number {
  if (!edit) return 0;
  let diterapkan = 0;

  const changes = edit.changes as Record<string, TextEditLsp[]> | undefined;
  if (changes) {
    for (const [uri, edits] of Object.entries(changes)) {
      if (!Array.isArray(edits)) continue;
      const f = uriToPath(uri);
      if (kunciPath(f) === kunciPath(path)) diterapkan += applyEdits(view, edits);
      else onLain?.(f, edits);
    }
  }

  const dc = edit.documentChanges as unknown[] | undefined;
  if (Array.isArray(dc)) {
    for (const d of dc) {
      const o = d as Record<string, unknown>;
      const uri = (o.textDocument as Record<string, unknown> | undefined)?.uri as string | undefined;
      const edits = o.edits as TextEditLsp[] | undefined;
      if (!uri || !Array.isArray(edits)) continue;
      const f = uriToPath(uri);
      if (kunciPath(f) === kunciPath(path)) diterapkan += applyEdits(view, edits);
      else onLain?.(f, edits);
    }
  }

  return diterapkan;
}

/**
 * Run the language server's "fix everything" action for this file.
 *
 * `source.fixAll` is the LSP's own name for "apply all safe automated fixes"
 * (ESLint, tsserver, gopls all implement it). It is requested over the whole
 * document with the CURRENT diagnostics attached, because most servers select
 * which fixes to offer from that context — asking with an empty list makes
 * ESLint answer with nothing at all.
 *
 * The `only` filter is deliberate. Without it the server may return every
 * action that happens to overlap the range, including refactors that are not
 * safe to run unattended on save. `only` is the protocol's own way of saying
 * "just the fixes".
 *
 * Returns the number of edits applied, and whether the server offered anything
 * at all — the caller needs to tell "nothing to fix" from "no such capability".
 */
export async function lspFixAll(
  path: string,
  view: EditorView,
  diags: { line: number; column: number; endLine?: number; endColumn?: number; severity: string; message: string; source: string }[],
): Promise<{ diterapkan: number; ditawarkan: number; lain: string[] }> {
  const res = await useLsp.getState().req(path, 'textDocument/codeAction', {
    textDocument: { uri: pathToUri(path) },
    range: {
      start: { line: 0, character: 0 },
      end: offsetToLsp(view, view.state.doc.length),
    },
    context: {
      only: ['source.fixAll'],
      diagnostics: diags.map((d) => ({
        range: {
          start: { line: d.line - 1, character: d.column - 1 },
          end: { line: (d.endLine ?? d.line) - 1, character: (d.endColumn ?? d.column) - 1 },
        },
        /*
         * LSP distinguishes Information (3) from Hint (4), and `problemsStore`
         * carries both — `severityFromLsp` maps 4 to `'hint'`. Collapsing them
         * here sent a Hint back to the server as Information, so the value the
         * server emitted did not survive the round trip.
         */
        severity:
          d.severity === 'error' ? 1 : d.severity === 'warning' ? 2 : d.severity === 'info' ? 3 : 4,
        message: d.message,
        source: d.source,
      })),
    },
  });

  const daftar = Array.isArray(res) ? (res as Record<string, unknown>[]) : [];
  /* Fix-all is a whole-file action, so the FIRST one is the whole-file one.
     Applying every returned action would run overlapping edits from different
     fixes over the same ranges. */
  const aksi = daftar.find((a) => {
    const kind = String(a.kind ?? '');
    return kind === 'source.fixAll' || kind.startsWith('source.fixAll.');
  }) ?? daftar[0];

  const lain: string[] = [];
  const diterapkan = applyWorkspaceEdit(view, path, aksi?.edit as Record<string, unknown> | undefined, (f) =>
    lain.push(f),
  );

  return { diterapkan, ditawarkan: daftar.length, lain };
}

/*
 * Rapikan import lewat server bahasa.
 *
 * `source.organizeImports` adalah nama protokol untuk "buang yang tidak dipakai,
 * urutkan yang tersisa" — tsserver, gopls, rust-analyzer, dan Pyright semuanya
 * mengenalnya. Dijalankan atas permintaan pengguna, bukan saat menyimpan, karena
 * aksi ini MENGHAPUS baris: menyimpannya sebagai efek samping Ctrl+S berarti
 * kode bisa berubah tanpa ada yang memintanya.
 *
 * `only` dipakai supaya server tidak mengembalikan refactor lain yang kebetulan
 * beririsan dengan seluruh dokumen.
 */
export async function lspOrganizeImports(
  path: string,
  view: EditorView,
): Promise<{ diterapkan: number; ditawarkan: number }> {
  let res: unknown;
  try {
    res = await useLsp.getState().req(path, 'textDocument/codeAction', {
      textDocument: { uri: pathToUri(path) },
      range: {
        start: { line: 0, character: 0 },
        end: offsetToLsp(view, view.state.doc.length),
      },
      context: { only: ['source.organizeImports'], diagnostics: [] },
    });
  } catch {
    return { diterapkan: 0, ditawarkan: 0 };
  }

  const daftar = Array.isArray(res) ? (res as Record<string, unknown>[]) : [];
  const aksi = daftar.find((a) => {
    const kind = String(a.kind ?? '');
    return kind === 'source.organizeImports' || kind.startsWith('source.organizeImports.');
  });

  /* Tanpa aksi yang tepat, tidak ada yang diterapkan. Aksi lain (fixAll,
     refactor) bukan pengganti: menjalankannya di sini akan mengubah kode lebih
     banyak daripada yang diminta. */
  const diterapkan = applyWorkspaceEdit(view, path, aksi?.edit as Record<string, unknown> | undefined);
  return { diterapkan, ditawarkan: daftar.length };
}

export async function lspRename(path: string, view: EditorView, pos: number, baru: string) {
  const res = (await useLsp.getState().req(path, 'textDocument/rename', {
    textDocument: { uri: pathToUri(path) },
    position: offsetToLsp(view, pos),
    newName: baru,
  })) as Record<string, unknown> | null;
  if (!res) return { perFile: {} as Record<string, TextEditLsp[]>, total: 0 };

  const perFile: Record<string, TextEditLsp[]> = {};
  const changes = res.changes as Record<string, TextEditLsp[]> | undefined;
  if (changes) {
    for (const [uri, edits] of Object.entries(changes)) perFile[uriToPath(uri)] = edits;
  }
  const docChanges = res.documentChanges as unknown[] | undefined;
  if (Array.isArray(docChanges)) {
    for (const dc of docChanges) {
      const o = dc as Record<string, unknown>;
      const uri = (o.textDocument as Record<string, unknown> | undefined)?.uri as string | undefined;
      const edits = o.edits as TextEditLsp[] | undefined;
      if (uri && Array.isArray(edits)) {
        const f = uriToPath(uri);
        perFile[f] = (perFile[f] ?? []).concat(edits);
      }
    }
  }
  const total = Object.values(perFile).reduce((n, e) => n + e.length, 0);
  return { perFile, total };
}

export async function lspCodeActions(path: string, view: EditorView, from: number, to: number, diags: Diagnostic[]) {
  const res = await useLsp.getState().req(path, 'textDocument/codeAction', {
    textDocument: { uri: pathToUri(path) },
    range: { start: offsetToLsp(view, from), end: offsetToLsp(view, to) },
    context: {
      diagnostics: diags.map((d) => ({
        range: {
          start: { line: d.line - 1, character: d.column - 1 },
          end: { line: (d.endLine ?? d.line) - 1, character: (d.endColumn ?? d.column) - 1 },
        },
        /*
         * LSP distinguishes Information (3) from Hint (4), and `problemsStore`
         * carries both — `severityFromLsp` maps 4 to `'hint'`. Collapsing them
         * here sent a Hint back to the server as Information, so the value the
         * server emitted did not survive the round trip.
         */
        severity:
          d.severity === 'error' ? 1 : d.severity === 'warning' ? 2 : d.severity === 'info' ? 3 : 4,
        message: d.message,
        source: d.source,
      })),
    },
  });
  return Array.isArray(res) ? res : [];
}

export async function lspSignatureHelp(path: string, view: EditorView, pos: number) {
  const res = (await useLsp.getState().req(path, 'textDocument/signatureHelp', {
    textDocument: { uri: pathToUri(path) },
    position: offsetToLsp(view, pos),
  })) as Record<string, unknown> | null;
  if (!res) return null;
  const sigs = res.signatures as Record<string, unknown>[] | undefined;
  if (!sigs || sigs.length === 0) return null;
  const idx = typeof res.activeSignature === 'number' ? res.activeSignature : 0;
  const sig = sigs[Math.min(idx, sigs.length - 1)];
  return {
    label: String(sig.label ?? ''),
    activeParameter: typeof res.activeParameter === 'number' ? res.activeParameter : 0,
    count: sigs.length,
  };
}

export interface SymbolOutline {
  name: string;
  kind: string;
  line: number;
  column: number;
  detail?: string;
  children: SymbolOutline[];
}

const asRangeStart = (raw: Record<string, unknown>) => {
  const range =
    (raw.selectionRange as Record<string, Record<string, number>> | undefined) ??
    (raw.range as Record<string, Record<string, number>> | undefined) ??
    ((raw.location as Record<string, unknown> | undefined)?.range as
      | Record<string, Record<string, number>>
      | undefined);
  return range?.start;
};

export async function lspSymbolTree(path: string): Promise<SymbolOutline[]> {
  const res = await lspDocumentSymbols(path);
  const susun = (arr: unknown[]): SymbolOutline[] => {
    const out: SymbolOutline[] = [];
    for (const raw of arr) {
      if (!raw || typeof raw !== 'object') continue;
      const o = raw as Record<string, unknown>;
      const nama = String(o.name ?? '');
      const start = asRangeStart(o);
      if (!nama || !start) continue;
      const anak = Array.isArray(o.children) ? susun(o.children) : [];
      out.push({
        name: nama,
        kind: SYMBOL_KIND[Number(o.kind ?? 0)] ?? '',
        line: (start.line ?? 0) + 1,
        column: (start.character ?? 0) + 1,
        detail: typeof o.detail === 'string' ? o.detail : undefined,
        children: anak,
      });
    }
    return out;
  };
  return susun(res);
}

interface PeekData {
  file: string;
  line: number;
  column: number;
  startLine: number;
  endLine: number;
  lines: string[];
}

const setPeek = StateEffect.define<PeekData | null>();

const peekField = StateField.define<PeekData | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setPeek)) return e.value;
    }
    return value;
  },
});

const PEEK_WINDOW = 5;

class PeekPanel implements Panel {
  dom: HTMLElement;
  top = true;
  private view: EditorView;
  private onDocDown: (e: MouseEvent) => void;
  private onKeyDown: (e: KeyboardEvent) => void;

  constructor(view: EditorView) {
    this.view = view;
    this.dom = document.createElement('div');
    this.dom.setAttribute('data-testid', 'cm-peek-wrap');
    this.render();

    this.onDocDown = (e: MouseEvent) => {
      const data = view.state.field(peekField, false);
      if (!data) return;
      const t = e.target as Node | null;
      if (t && this.dom.contains(t)) return;
      view.dispatch({ effects: setPeek.of(null) });
    };
    this.onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const data = view.state.field(peekField, false);
      if (!data) return;
      e.preventDefault();
      view.dispatch({ effects: setPeek.of(null) });
    };

    this.dom.addEventListener('mousedown', (e) => e.stopPropagation());
    window.addEventListener('mousedown', this.onDocDown, true);
    window.addEventListener('keydown', this.onKeyDown, true);
  }

  update() {
    this.render();
  }

  private render() {
    const data = this.view.state.field(peekField, false);
    this.dom.textContent = '';
    if (!data) {
      this.dom.style.display = 'none';
      return;
    }
    this.dom.style.display = '';
    this.dom.className = 'cm-zpeek';
    this.dom.setAttribute('data-testid', 'cm-peek');

    const head = document.createElement('div');
    head.className = 'cm-zpeek-head';
    const judul = document.createElement('span');
    judul.className = 'cm-zpeek-path';
    judul.textContent = data.file;
    judul.title = data.file;
    const tutup = document.createElement('button');
    tutup.className = 'cm-zpeek-close';
    tutup.setAttribute('data-testid', 'cm-peek-close');
    tutup.setAttribute('aria-label', 'Close peek');
    tutup.textContent = '\u00d7';
    tutup.addEventListener('click', () => {
      this.view.dispatch({ effects: setPeek.of(null) });
    });
    head.append(judul, tutup);

    const body = document.createElement('div');
    body.className = 'cm-zpeek-body';
    data.lines.forEach((teks, i) => {
      const no = data.startLine + i;
      const row = document.createElement('div');
      row.className = 'cm-zpeek-row';
      if (no === data.line) {
        row.classList.add('is-target');
        row.setAttribute('data-testid', 'cm-peek-target');
      }
      const ln = document.createElement('span');
      ln.className = 'cm-zpeek-ln';
      ln.textContent = String(no);
      const code = document.createElement('span');
      code.className = 'cm-zpeek-code';
      code.textContent = teks;
      row.append(ln, code);
      body.append(row);
    });

    this.dom.append(head, body);
  }

  destroy() {
    window.removeEventListener('mousedown', this.onDocDown, true);
    window.removeEventListener('keydown', this.onKeyDown, true);
  }
}

export function lspPeekExtension(): Extension {
  return [peekField, showPanel.of((view) => new PeekPanel(view))];
}

export function tutupPeek(view: EditorView): void {
  view.dispatch({ effects: setPeek.of(null) });
}

export async function peekDefinition(path: string, view: EditorView, pos: number): Promise<boolean> {
  const loc = await lspDefinition(path, view, pos);
  if (!loc) return false;

  const isi = await fsRead(loc.file);
  const baris = isi.content.split(/\r?\n/);
  const dari = Math.max(1, loc.line - PEEK_WINDOW);
  const sampai = Math.min(baris.length, loc.line + PEEK_WINDOW);
  const data: PeekData = {
    file: loc.file,
    line: loc.line,
    column: loc.column,
    startLine: dari,
    endLine: sampai,
    lines: baris.slice(dari - 1, sampai),
  };
  view.dispatch({ effects: setPeek.of(data) });
  return true;
}
