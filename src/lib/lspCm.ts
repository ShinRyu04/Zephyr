// lspCm.ts — jembatan LSP ↔ CodeMirror 6 (fase 21).
//
// Semua extension CodeMirror yang butuh LSP ada di sini supaya
// CodeMirrorEditor.tsx tetap kecil dan tidak tahu detail protokol.
//
// Catatan penting soal squiggle:
//   Diagnostik dari fase 20 disimpan PER FILE di problemsStore. Squiggle
//   dirender dengan Decoration mark + Compartment (bukan @codemirror/lint),
//   karena lint punya panel & tooltip sendiri yang menabrak Problems panel dan
//   membuat dua sumber kebenaran untuk diagnostik yang sama.

import { autocompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { Compartment, RangeSetBuilder, type Extension } from '@codemirror/state';
import { Decoration, EditorView, hoverTooltip, type DecorationSet } from '@codemirror/view';
import { useLsp } from './lspStore';
import { COMPLETION_KIND, hoverText, pathToUri, uriToPath } from './lsp';
import { keCompletion, konteksDari, useSnip } from './snippetStore';
import { useStore } from './store';
import type { Diagnostic } from './problemsStore';

/** posisi CodeMirror (offset) → posisi LSP (line/character, 0-based). */
export function offsetToLsp(view: EditorView, pos: number) {
  const line = view.state.doc.lineAt(pos);
  return { line: line.number - 1, character: pos - line.from };
}

/** posisi LSP → offset CodeMirror. Di-clamp supaya tidak melempar saat
 *  dokumen sudah berubah sebelum balasan server datang. */
export function lspToOffset(view: EditorView, pos: { line: number; character: number }): number {
  const doc = view.state.doc;
  const ln = Math.min(Math.max(pos.line + 1, 1), doc.lines);
  const line = doc.line(ln);
  return Math.min(line.from + Math.max(pos.character, 0), line.to);
}

// ───────────────────────── squiggle inline ─────────────────────────

export const squiggleCompartment = new Compartment();

const MARK = {
  error: Decoration.mark({ class: 'cm-zdiag cm-zdiag-error' }),
  warning: Decoration.mark({ class: 'cm-zdiag cm-zdiag-warning' }),
  info: Decoration.mark({ class: 'cm-zdiag cm-zdiag-info' }),
  hint: Decoration.mark({ class: 'cm-zdiag cm-zdiag-hint' }),
};

/** Bangun DecorationSet dari daftar diagnostik (koordinat 1-based). */
export function squiggleFor(list: Diagnostic[], view: EditorView): DecorationSet {
  const doc = view.state.doc;
  const b = new RangeSetBuilder<Decoration>();
  // RangeSetBuilder MENUNTUT urutan `from` naik; diagnostik dari LSP tidak
  // dijamin terurut, jadi urutkan dulu — kalau tidak `add()` melempar.
  const rentang: { from: number; to: number; sev: Diagnostic['severity'] }[] = [];
  for (const d of list) {
    if (d.line < 1 || d.line > doc.lines) continue;
    const l1 = doc.line(d.line);
    const from = Math.min(l1.from + Math.max(d.column - 1, 0), l1.to);
    const endLine = d.endLine && d.endLine >= 1 && d.endLine <= doc.lines ? d.endLine : d.line;
    const l2 = doc.line(endLine);
    let to = Math.min(l2.from + Math.max((d.endColumn ?? d.column) - 1, 0), l2.to);
    // Rentang kosong tidak terlihat — beri minimal satu karakter.
    if (to <= from) to = Math.min(from + 1, doc.length);
    if (to > from) rentang.push({ from, to, sev: d.severity });
  }
  rentang.sort((a, z) => a.from - z.from || a.to - z.to);
  for (const r of rentang) b.add(r.from, r.to, MARK[r.sev]);
  return b.finish();
}

// ───────────────────────── completion ─────────────────────────

/** Sumber completion CodeMirror yang bertanya ke language server. */
export function lspCompletionSource(path: string) {
  return async (ctx: CompletionContext): Promise<CompletionResult | null> => {
    const lsp = useLsp.getState();
    if (!lsp.docs[path]) return null;

    const view = ctx.view;
    if (!view) return null;
    const posLsp = offsetToLsp(view, ctx.pos);
    // Kata yang sedang diketik menentukan `from` hasil completion.
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
      // Server sudah menyaring; jangan filter ulang secara agresif.
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

/**
 * Sumber completion snippet untuk CodeMirror.
 *
 * DIPAKAI BERSAMA sumber lain, tidak menggantikannya: `autocompletion({
 * override: [...] })` mengganti SELURUH sumber, jadi snippet didaftarkan
 * sebagai sumber tambahan supaya completion LSP fase 21 dan kata-dari-dokumen
 * tetap jalan.
 *
 * Konteks variabel dibaca SAAT SUMBER DIPANGGIL, bukan saat ekstensi dibuat:
 * seleksi dan baris kursor berubah tiap ketikan, dan konteks yang dibekukan di
 * awal akan mengisi ${TM_SELECTED_TEXT} dengan seleksi lama.
 */
export function snippetCompletionSource(path: string, langId: () => string) {
  return async (ctx: CompletionContext): Promise<CompletionResult | null> => {
    const mode = pengaturanSnippet();
    if (mode === 'none') return null;

    const lang = langId();
    const S = useSnip.getState();
    // Muat sekali per bahasa; hasilnya di-cache di store.
    let daftar = S.untuk(lang);
    if (daftar.length === 0) {
      const setb = await S.muat(lang);
      daftar = setb?.snippets ?? [];
    }
    if (daftar.length === 0) return null;

    const kata = ctx.matchBefore(/[\w$-]*/);
    const from = kata ? kata.from : ctx.pos;
    const diketik = kata ? kata.text : '';
    // Tanpa apa pun yang diketik, jangan banjiri popup — kecuali user memang
    // meminta eksplisit (Ctrl+Space).
    if (!ctx.explicit && diketik.length === 0) return null;

    const cocok = diketik
      ? daftar.filter((s) => s.prefix.toLowerCase().startsWith(diketik.toLowerCase()))
      : daftar;
    if (cocok.length === 0) return null;

    // ctx.view bisa undefined (completion dari state tanpa view) — tanpa view
    // tidak ada seleksi/baris untuk dibaca, jadi snippet dilewati.
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

/** Nilai `editor.snippetSuggestions` dari settings (fase 08). */
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

/**
 * Autocompletion lengkap: snippet (fase 30) + LSP (fase 21) bila ada.
 *
 * Keduanya di SATU `autocompletion()`. Dua instance membuat dua popup bersaing
 * (pelajaran fase 21), jadi sumbernya digabung dalam satu `override`.
 */
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

// ───────────────────────── hover ─────────────────────────

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
        // Markdown ringan: buang fence & tampilkan sebagai teks. Render HTML
        // penuh dari server pihak ketiga = permukaan XSS yang tidak perlu.
        dom.textContent = teks.replace(/```[a-z]*\n?/g, '').trim();
        return { dom };
      },
    };
  }, { hoverTime: 220 });
}

// ───────────────────────── navigasi & refactor ─────────────────────────

export interface LspLocation {
  file: string;
  line: number;
  column: number;
}

const asLocation = (raw: unknown): LspLocation | null => {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  // Location | LocationLink
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

/** Ambil satu lokasi definisi (F12). */
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

/** Semua referensi (Shift+F12). */
export async function lspReferences(path: string, view: EditorView, pos: number) {
  const res = await useLsp.getState().req(path, 'textDocument/references', {
    textDocument: { uri: pathToUri(path) },
    position: offsetToLsp(view, pos),
    context: { includeDeclaration: true },
  });
  const arr = Array.isArray(res) ? res : [];
  return arr.map(asLocation).filter((x): x is LspLocation => !!x);
}

/** Symbol dokumen (Ctrl+Shift+O, breadcrumbs fase 24). */
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

/** Terapkan daftar TextEdit LSP ke satu view. Edit diterapkan dari BELAKANG
 *  supaya offset edit sebelumnya tidak bergeser. */
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

/** Format seluruh dokumen (Shift+Alt+F). */
export async function lspFormat(path: string, view: EditorView, tabSize: number, insertSpaces: boolean) {
  const res = await useLsp.getState().req(path, 'textDocument/formatting', {
    textDocument: { uri: pathToUri(path) },
    options: { tabSize, insertSpaces },
  });
  const edits = Array.isArray(res) ? (res as TextEditLsp[]) : [];
  return applyEdits(view, edits);
}

/** Rename (F2). Mengembalikan peta file → jumlah edit; edit di file yang
 *  tidak terbuka dikembalikan apa adanya supaya pemanggil bisa menulisnya. */
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

/** Code actions / quick fix (Ctrl+.). */
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

/** Signature help (auto saat mengetik dalam kurung). */
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
