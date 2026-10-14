import { useLsp } from './lspStore';
import { pathToUri, uriToPath, SYMBOL_KIND, serverForPath } from './lsp';
import { fsRead } from './commands';

/*
 * LSP for the AGENT, not the editor.
 *
 * The editor already gets completion, hover and go-to-definition from
 * `lspCm.ts`. The agent had none of it: its only ways to find code were `grep`
 * and `glob`, which match TEXT. That is a real difference in kind, not a
 * convenience:
 *
 *   - `grep` for a function name returns every occurrence, including the
 *     definition, every call, comments that mention it, and any string that
 *     happens to contain it. The agent then reads them all to guess which is
 *     which.
 *   - `textDocument/references` answers "who calls this" exactly, because the
 *     language server parsed the file rather than scanned it.
 *
 * On a large codebase the first gives an agent too much and often wrong; the
 * second gives it the answer. That is why these tools exist.
 *
 * ## Read-only by construction
 *
 * Every function here is a query. Nothing renames, formats or edits: a tool that
 * could apply a workspace-wide rename would be a write with a blast radius the
 * reader never saw, and the diff review path already covers deliberate changes.
 *
 * ## When there is no server
 *
 * `serverForPath` knows the servers Zephyr can run; a file whose language has
 * none, or whose server is not installed, gets a plain answer saying so. That
 * matters more than it sounds: an agent told "no results" would conclude the
 * symbol does not exist and move on, where the truth is that nobody was asked.
 */

/** A 1-based line and column, which is what both the agent and the editor use. */
export interface Posisi {
  line: number;
  column: number;
}

export interface LokasiLsp {
  file: string;
  line: number;
  column: number;
  /** The line's text, so the agent can judge the hit without another read. */
  teks?: string;
}

export interface SimbolLsp {
  name: string;
  kind: string;
  file: string;
  line: number;
  /** Nesting depth, so the agent can tell a method from a top-level function. */
  depth: number;
}

/* LSP positions are 0-based; every interface this module exposes is 1-based,
   matching what the agent reads in a file and what the editor shows. Getting
   this wrong shifts every answer by one line, which is worse than no answer. */
function keLsp(p: Posisi) {
  return { line: Math.max(0, p.line - 1), character: Math.max(0, p.column - 1) };
}

function dariLsp(r: { line?: number; character?: number } | undefined): { line: number; column: number } {
  return { line: (r?.line ?? 0) + 1, column: (r?.character ?? 0) + 1 };
}

/** Read one line of a file for context, or '' if it cannot be read. */
async function barisKe(file: string, line: number): Promise<string> {
  try {
    const isi = await fsRead(file, 'utf8');
    const teks = typeof isi === 'string' ? isi : ((isi as { content?: string })?.content ?? '');
    return (teks.split(/\r?\n/)[line - 1] ?? '').trim().slice(0, 200);
  } catch {
    return '';
  }
}

/**
 * Turn one LSP location into a readable hit.
 *
 * The shapes differ per server: `Location`, `LocationLink` (with
 * `targetUri`/`targetRange`), or a bare `{uri, range}`. All three appear in the
 * wild, and a response the agent cannot read is the same as no response.
 */
function bacaLokasi(raw: unknown): { file: string; line: number; column: number } | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const uri = (o.uri ?? o.targetUri) as string | undefined;
  const range = (o.range ?? o.targetSelectionRange ?? o.targetRange) as
    | { start?: { line?: number; character?: number } }
    | undefined;
  if (!uri || !range?.start) return null;
  return { file: uriToPath(uri), ...dariLsp(range.start) };
}

/** Flatten whatever the server returned into a list of locations. */
function daftarLokasi(res: unknown): { file: string; line: number; column: number }[] {
  const arr = Array.isArray(res) ? res : res ? [res] : [];
  const out: { file: string; line: number; column: number }[] = [];
  for (const item of arr) {
    const loc = bacaLokasi(item);
    if (loc) out.push(loc);
    if (out.length >= 100) break;
  }
  return out;
}

/** Is a language server available for this file at all? */
export function adaServer(path: string): boolean {
  return serverForPath(path) !== null;
}

function pesanTanpaServer(path: string): string {
  const def = serverForPath(path);
  if (!def) {
    return `Tidak ada language server untuk berkas ini (${path}). Pakai grep atau glob untuk mencari, dan sebutkan di jawaban bahwa hasilnya berbasis teks, bukan analisis simbol.`;
  }
  return `Language server "${def.id}" belum berjalan untuk ${path}, atau belum terpasang. Pakai grep atau glob sebagai gantinya.`;
}

/** Where a symbol is defined. */
export async function lspDefinitionTool(
  path: string,
  pos: Posisi,
): Promise<{ ok: true; hasil: LokasiLsp[] } | { ok: false; pesan: string }> {
  if (!adaServer(path)) return { ok: false, pesan: pesanTanpaServer(path) };
  try {
    const res = await useLsp.getState().req(path, 'textDocument/definition', {
      textDocument: { uri: pathToUri(path) },
      position: keLsp(pos),
    });
    const loc = daftarLokasi(res);
    const hasil: LokasiLsp[] = [];
    for (const l of loc) hasil.push({ ...l, teks: await barisKe(l.file, l.line) });
    return { ok: true, hasil };
  } catch (e) {
    return { ok: false, pesan: `Language server gagal menjawab: ${String(e)}` };
  }
}

/** Who references the symbol at this position — the calls, not the mentions. */
export async function lspReferencesTool(
  path: string,
  pos: Posisi,
  withDeclaration = false,
): Promise<{ ok: true; hasil: LokasiLsp[] } | { ok: false; pesan: string }> {
  if (!adaServer(path)) return { ok: false, pesan: pesanTanpaServer(path) };
  try {
    const res = await useLsp.getState().req(path, 'textDocument/references', {
      textDocument: { uri: pathToUri(path) },
      position: keLsp(pos),
      context: { includeDeclaration: withDeclaration },
    });
    const loc = daftarLokasi(res);
    const hasil: LokasiLsp[] = [];
    for (const l of loc) hasil.push({ ...l, teks: await barisKe(l.file, l.line) });
    return { ok: true, hasil };
  } catch (e) {
    return { ok: false, pesan: `Language server gagal menjawab: ${String(e)}` };
  }
}

/**
 * Call hierarchy: who calls this, and what this calls.
 *
 * The one navigation question `references` cannot answer. `references` returns
 * call SITES — a list of positions — and the reader still has to work out which
 * function each site lives inside. Call hierarchy returns the enclosing
 * FUNCTION, already named, with the call sites inside it. That is the shape of
 * the question "who calls this", and it is one round trip instead of N.
 *
 * Both directions are returned in one call so the agent does not have to decide
 * which it wants before knowing if either exists.
 */
export async function lspCallHierarchyTool(
  path: string,
  pos: Posisi,
): Promise<
  | { ok: true; simbol: string; pemanggil: LokasiLsp[]; dipanggil: LokasiLsp[] }
  | { ok: false; pesan: string }
> {
  if (!adaServer(path)) return { ok: false, pesan: pesanTanpaServer(path) };
  try {
    const { lspPrepareCallHierarchy, lspCallHierarchy } = await import('./lspCm');
    const { getActiveView } = await import('./editorRegistry');

    /*
     * `prepareCallHierarchy` takes a POSITION, so a view is needed to convert
     * one to an LSP offset. The agent may ask about a file that is not open;
     * in that case the offset is computed from the raw text by character
     * counting, which is exactly what a server expects — LSP positions are
     * UTF-16 code units from the start of the line.
     */
    const view = getActiveView();
    let offset = 0;
    if (view && view.state.doc.length > 0) {
      const baris = view.state.doc.line(Math.min(Math.max(1, pos.line), view.state.doc.lines));
      offset = baris.from + (pos.column - 1);
    } else {
      const res = await fsRead(path);
      const baris = String(res.content ?? '').split('\n');
      for (let i = 0; i < Math.min(pos.line - 1, baris.length); i += 1) offset += baris[i].length + 1;
      offset += pos.column - 1;
    }

    const item = await lspPrepareCallHierarchy(path, view as never, offset);
    if (item.length === 0) {
      return {
        ok: false,
        pesan:
          'Language server tidak menemukan fungsi di posisi itu. Call hierarchy hanya berlaku untuk fungsi/metode - ' +
          'pastikan baris dan kolom menunjuk ke NAMA fungsi, bukan ke isinya.',
      };
    }

    const utama = item[0];
    const [masuk, keluar] = await Promise.all([
      lspCallHierarchy(path, utama, 'incoming'),
      lspCallHierarchy(path, utama, 'outgoing'),
    ]);

    const ke = async (daftar: typeof masuk): Promise<LokasiLsp[]> => {
      const hasil: LokasiLsp[] = [];
      for (const c of daftar.slice(0, 60)) {
        hasil.push({
          file: c.file,
          line: c.line,
          column: c.column,
          teks: c.detail || c.name,
        });
      }
      return hasil;
    };

    return {
      ok: true,
      simbol: utama.detail ? `${utama.name} - ${utama.detail}` : utama.name,
      pemanggil: await ke(masuk),
      dipanggil: await ke(keluar),
    };
  } catch (e) {
    return { ok: false, pesan: `Language server gagal menjawab: ${String(e)}` };
  }
}

/** Hover text: the type signature and doc comment, as the editor would show. */
export async function lspHoverTool(
  path: string,
  pos: Posisi,
): Promise<{ ok: true; teks: string } | { ok: false; pesan: string }> {
  if (!adaServer(path)) return { ok: false, pesan: pesanTanpaServer(path) };
  try {
    const res = (await useLsp.getState().req(path, 'textDocument/hover', {
      textDocument: { uri: pathToUri(path) },
      position: keLsp(pos),
    })) as { contents?: unknown } | null;
    const c = res?.contents;
    /*
     * `contents` is MarkupContent, MarkedString, or an array of either. The
     * editor's own `hoverText` already flattens all three, so this reuses it
     * rather than growing a second parser that would drift from the first.
     */
    const { hoverText } = await import('./lsp');
    return { ok: true, teks: hoverText(c) };
  } catch (e) {
    return { ok: false, pesan: `Language server gagal menjawab: ${String(e)}` };
  }
}

/** Every symbol in one file, as a flat list with nesting depth. */
export async function lspDocumentSymbolsTool(
  path: string,
): Promise<{ ok: true; hasil: SimbolLsp[] } | { ok: false; pesan: string }> {
  if (!adaServer(path)) return { ok: false, pesan: pesanTanpaServer(path) };
  try {
    const res = await useLsp.getState().req(path, 'textDocument/documentSymbol', {
      textDocument: { uri: pathToUri(path) },
    });
    const hasil: SimbolLsp[] = [];
    /*
     * Two response shapes: `DocumentSymbol` (nested `children`, with `range`)
     * and `SymbolInformation` (flat, with `location`). Both are in the spec and
     * servers pick either, so both are walked.
     */
    const turun = (nodes: unknown, depth: number) => {
      if (!Array.isArray(nodes)) return;
      for (const n of nodes) {
        if (hasil.length >= 400) return;
        const o = n as Record<string, unknown>;
        const nama = String(o.name ?? '');
        const kind = SYMBOL_KIND[Number(o.kind)] ?? 'symbol';
        const range = (o.range ?? (o.location as { range?: unknown })?.range) as
          | { start?: { line?: number } }
          | undefined;
        const file =
          (o.location as { uri?: string } | undefined)?.uri !== undefined
            ? uriToPath((o.location as { uri: string }).uri)
            : path;
        if (nama) {
          hasil.push({
            name: nama,
            kind,
            file,
            line: (range?.start?.line ?? 0) + 1,
            depth,
          });
        }
        if (Array.isArray(o.children)) turun(o.children, depth + 1);
      }
    };
    turun(res, 0);
    return { ok: true, hasil };
  } catch (e) {
    return { ok: false, pesan: `Language server gagal menjawab: ${String(e)}` };
  }
}

/** Search symbols by NAME across the workspace. */
export async function lspWorkspaceSymbolsTool(
  query: string,
  pathAcuan: string,
): Promise<{ ok: true; hasil: SimbolLsp[] } | { ok: false; pesan: string }> {
  if (!adaServer(pathAcuan)) return { ok: false, pesan: pesanTanpaServer(pathAcuan) };
  try {
    /*
     * `workspace/symbol` needs a server to send it TO, and the request is not
     * bound to a file. Any server that is already running will do, so the
     * caller's reference file picks one.
     */
    const res = await useLsp.getState().req(pathAcuan, 'workspace/symbol', { query });
    const hasil: SimbolLsp[] = [];
    if (Array.isArray(res)) {
      for (const n of res) {
        if (hasil.length >= 100) break;
        const o = n as Record<string, unknown>;
        const loc = (o.location as { uri?: string; range?: { start?: { line?: number } } }) ?? {};
        const nama = String(o.name ?? '');
        if (!nama) continue;
        hasil.push({
          name: nama,
          kind: SYMBOL_KIND[Number(o.kind)] ?? 'symbol',
          file: loc.uri ? uriToPath(loc.uri) : '',
          line: (loc.range?.start?.line ?? 0) + 1,
          depth: 0,
        });
      }
    }
    return { ok: true, hasil };
  } catch (e) {
    return { ok: false, pesan: `Language server gagal menjawab: ${String(e)}` };
  }
}

/** Diagnostics the server has already published for one file. */
export async function lspDiagnosticsTool(path: string): Promise<
  | { ok: true; hasil: { line: number; column: number; severity: string; pesan: string; sumber: string }[] }
  | { ok: false; pesan: string }
> {
  if (!adaServer(path)) return { ok: false, pesan: pesanTanpaServer(path) };
  try {
    /*
     * Read from `problemsStore` rather than asking the server.
     *
     * The server PUSHES diagnostics; there is no request for "the current ones".
     * The editor subscribes to those pushes and keys them by file, so this store
     * already holds the answer, in the shape the Problems panel shows. Asking the
     * server again would return nothing useful and could disagree with what the
     * reader sees on screen.
     */
    const { useProblems } = await import('./problemsStore');
    const semua = useProblems.getState().byFile.get(path) ?? [];
    return {
      ok: true,
      hasil: semua.slice(0, 100).map((d) => ({
        line: d.line,
        column: d.column,
        severity: d.severity,
        pesan: String(d.message ?? '').slice(0, 300),
        sumber: d.source || 'language server',
      })),
    };
  } catch (e) {
    return { ok: false, pesan: `Tidak bisa membaca diagnostik: ${String(e)}` };
  }
}
