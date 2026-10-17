/**
 * `lsp` — one tool, six language-server questions.
 *
 * ## Why the six became one
 *
 * The catalogue carried `lsp_symbols`, `lsp_references`, `lsp_definition`,
 * `lsp_hover`, `lsp_diagnostics` and `lsp_call_hierarchy` as six separate tools.
 * They share every parameter except one, they all read the same language server,
 * and none can write. Six names for one capability means:
 *
 *   - six rows the model has to choose between for what is one decision
 *     ("ask the language server about this position");
 *   - six entries competing in `tool_search` results, so a search for "where is
 *     this defined" returns five near-misses;
 *   - six schema blobs in the prompt for what fits in one.
 *
 * OpenCode ships exactly this shape - a single `lsp` tool with an operation
 * parameter - and it is the pattern this follows rather than an invention.
 *
 * ## What did NOT change
 *
 * Every branch is the SAME call the old tool made (`lspSymbols`, `lspRefs`,
 * `lspDef`, `lspHover`, `lspDiagnostics`, `lspCallHierarchy`), with the same
 * wording, including the "no language server" sentence each one returns. The
 * degradation matters: an agent told "no results" concludes the symbol does not
 * exist, when the truth may be that nobody was asked.
 *
 * ## Position, and why `line`/`column` stay separate
 *
 * They are not folded into a "position" string. A string would have to be parsed
 * and mis-parsed positions produce confidently wrong answers, which is the one
 * failure mode a language server is supposed to prevent.
 */
import type { AgentTool } from '../agentTools';
import type { LokasiLsp, SimbolLsp } from '../agentLsp';

/* The six implementations, injected so this module stays free of the store. */
export interface LspBridge {
  symbols: (path: string) => Promise<{ ok: true; hasil: SimbolLsp[] } | { ok: false; pesan: string }>;
  refs: (
    path: string,
    pos: { line: number; column: number },
    includeDeclaration: boolean,
  ) => Promise<{ ok: true; hasil: LokasiLsp[] } | { ok: false; pesan: string }>;
  def: (
    path: string,
    pos: { line: number; column: number },
  ) => Promise<{ ok: true; hasil: LokasiLsp[] } | { ok: false; pesan: string }>;
  hover: (path: string, pos: { line: number; column: number }) => Promise<{ ok: true; teks: string } | { ok: false; pesan: string }>;
  diagnostics: (
    path: string,
  ) => Promise<
    | { ok: true; hasil: { line: number; column: number; severity: string; pesan: string; sumber: string }[] }
    | { ok: false; pesan: string }
  >;
  callHierarchy: (
    path: string,
    pos: { line: number; column: number },
  ) => Promise<
    | { ok: true; simbol: string; pemanggil: LokasiLsp[]; dipanggil: LokasiLsp[] }
    | { ok: false; pesan: string }
  >;
}

const AKSI = ['symbols', 'references', 'definition', 'hover', 'diagnostics', 'call_hierarchy'] as const;
export type LspAksi = (typeof AKSI)[number];

const angka = (v: unknown): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
};

const posisi = (a: Record<string, unknown>) => ({
  line: angka(a.line) ?? 1,
  column: angka(a.column) ?? 1,
});

const lokasi = (l: { file: string; line: number; column: number; teks?: string }) =>
  `${l.file}:${l.line}:${l.column}  ${l.teks ?? ''}`.trimEnd();

/**
 * Build the tool against a bridge.
 *
 * Injected rather than imported so the six implementations stay in `builtins.ts`
 * where they already live, and so a harness can drive every branch without a
 * language server - the branch logic is what changed here, not the calls.
 */
export function buatLspTool(bridge: LspBridge): AgentTool {
  return {
    spec: {
      name: 'lsp',
      description:
        'Tanya LANGUAGE SERVER tentang sebuah posisi di berkas - hasilnya pemakaian yang sebenarnya, bukan kemunculan teks. ' +
        'aksi: symbols (struktur berkas: fungsi/kelas/metode beserta jenis dan kedalaman), references (semua TEMPAT yang memakai simbol), definition (lokasi definisinya), hover (tipe + dokumentasi), diagnostics (galat/peringatan untuk berkas), call_hierarchy (fungsi mana yang memanggil dan dipanggil - bernama, bukan sekadar lokasi). ' +
        'path wajib; line/column dihitung dari 1 dan hanya dipakai aksi yang butuh posisi. ' +
        'Pakai references sebelum mengubah tanda tangan fungsi, diagnostics sesudah mengubah kode. ' +
        'Kalau tidak ada language server untuk berkas itu, jawabannya kalimat biasa - itu bukan "tidak ada hasil", jadi jangan simpulkan simbolnya tidak ada.',
      parameters: {
        type: 'object',
        properties: {
          aksi: {
            type: 'string',
            enum: [...AKSI],
            description: 'Pertanyaan mana yang diajukan ke language server.',
          },
          path: { type: 'string', description: 'Jalur berkas.' },
          line: { type: ['number', 'string'], description: 'Baris, dihitung dari 1.' },
          column: { type: ['number', 'string'], description: 'Kolom, dihitung dari 1.' },
          includeDeclaration: {
            type: ['boolean', 'string'],
            description: 'Untuk references: ikutkan baris deklarasinya. Bawaan: tidak.',
          },
        },
        required: ['aksi', 'path'],
      },
    },
    run: async (a) => {
      const aksi = String(a.aksi ?? '').trim() as LspAksi;
      const path = String(a.path ?? '').trim();
      if (!path) throw new Error('ERROR: lsp butuh "path".');
      if (!AKSI.includes(aksi)) {
        throw new Error(`ERROR: aksi "${a.aksi}" tidak dikenal. Pilihan: ${AKSI.join(', ')}.`);
      }
      const pos = posisi(a);

      switch (aksi) {
        case 'symbols': {
          const r = await bridge.symbols(path);
          if (!r.ok) return r.pesan;
          if (r.hasil.length === 0) return `Tidak ada simbol yang dilaporkan untuk ${path}.`;
          return r.hasil
            .map((s) => `${'  '.repeat(Math.min(s.depth, 4))}${s.name} (${s.kind}) - baris ${s.line}`)
            .join('\n');
        }
        case 'references': {
          const ikut = a.includeDeclaration === true || a.includeDeclaration === 'true';
          const r = await bridge.refs(path, pos, ikut);
          if (!r.ok) return r.pesan;
          if (r.hasil.length === 0) {
            return `Tidak ada pemakaian lain yang dilaporkan untuk simbol di ${path}:${pos.line}:${pos.column}.`;
          }
          return `${r.hasil.length} pemakaian:\n` + r.hasil.map(lokasi).join('\n');
        }
        case 'definition': {
          const r = await bridge.def(path, pos);
          if (!r.ok) return r.pesan;
          if (r.hasil.length === 0) return `Definisi tidak ditemukan untuk simbol di ${path}:${pos.line}.`;
          return r.hasil.map((l) => `${l.file}:${l.line}:${l.column}\n  ${l.teks ?? ''}`).join('\n');
        }
        case 'hover': {
          const r = await bridge.hover(path, pos);
          if (!r.ok) return r.pesan;
          return r.teks.trim() || `Tidak ada informasi tipe untuk simbol di ${path}:${pos.line}.`;
        }
        case 'diagnostics': {
          const r = await bridge.diagnostics(path);
          if (!r.ok) return r.pesan;
          if (r.hasil.length === 0) return `Tidak ada galat atau peringatan yang dilaporkan untuk ${path}.`;
          const jumlah = r.hasil.filter((d) => d.severity === 'error').length;
          return (
            `${r.hasil.length} masalah (${jumlah} galat):\n` +
            r.hasil.map((d) => `${d.line}:${d.column} [${d.severity}] ${d.pesan} (${d.sumber})`).join('\n')
          );
        }
        case 'call_hierarchy': {
          const r = await bridge.callHierarchy(path, pos);
          if (!r.ok) return r.pesan;
          /*
           * Both directions, and "none" said out loud. A missing section reads as
           * "this function is unused", which is the wrong conclusion to draw from
           * a server that simply does not implement this request.
           */
          const bagian = (judul: string, daftar: { file: string; line: number; column: number; teks?: string }[]) =>
            daftar.length === 0 ? `${judul}: tidak ada.` : `${judul} (${daftar.length}):\n` + daftar.map((l) => `  ${lokasi(l)}`).join('\n');
          return `${r.simbol}\n\n${bagian('Dipanggil oleh', r.pemanggil)}\n\n${bagian('Memanggil', r.dipanggil)}`;
        }
      }
    },
  };
}
