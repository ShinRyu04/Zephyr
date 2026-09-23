import { autocompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { Compartment, RangeSetBuilder, type Extension } from '@codemirror/state';
import { Decoration, EditorView, hoverTooltip, type DecorationSet } from '@codemirror/view';
import { useLsp } from './lspStore';
import { COMPLETION_KIND, hoverText, pathToUri, uriToPath } from './lsp';
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

export const squiggleCompartment = new Compartment();

const MARK = {
  error: Decoration.mark({ class: 'cm-zdiag cm-zdiag-error' }),
  warning: Decoration.mark({ class: 'cm-zdiag cm-zdiag-warning' }),
  info: Decoration.mark({ class: 'cm-zdiag cm-zdiag-info' }),
  hint: Decoration.mark({ class: 'cm-zdiag cm-zdiag-hint' }),
};

export function squiggleFor(list: Diagnostic[], view: EditorView): DecorationSet {
  const doc = view.state.doc;
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

    if (!ctx.view) return null;
    const konteks = await konteksDari(ctx.view, path);
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

export function autocompletionZephyr(path: string, langId: () => string, adaLsp: boolean): Extension {
  const sumber = adaLsp
    ? [snippetCompletionSource(path, langId), lspCompletionSource(path)]
    : [snippetCompletionSource(path, langId)];
  return autocompletion({
    override: sumber,
    activateOnTyping: true,
    maxRenderedOptions: 60,
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
        severity: d.severity === 'error' ? 1 : d.severity === 'warning' ? 2 : 3,
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
