// symbolTree.ts — jalur simbol untuk breadcrumbs & sticky scroll (fase 24).
//
// Satu sumber data untuk dua fitur, karena keduanya menjawab pertanyaan yang
// sama: "kursor saya sekarang ada di dalam apa?".
//
// Dua sumber, dengan urutan jelas:
//   1. LSP `textDocument/documentSymbol` (fase 21) — akurat, tahu class/method,
//      tapi hanya ada untuk bahasa yang punya language server terpasang.
//   2. Fallback INDENTASI — dipakai kalau tidak ada LSP. Tidak sepintar (1),
//      tapi lebih baik daripada breadcrumbs kosong, dan untuk sticky scroll
//      hasilnya praktis sama untuk kode yang indentasinya rapi.
//
// SymbolKind angka mengikuti spesifikasi LSP 3.17.

import type { EditorState } from '@codemirror/state';
import { lspDocumentSymbols } from './lspCm';

/** Simpul simbol yang sudah dinormalkan dari kedua sumber. */
export interface SimpulSimbol {
  nama: string;
  /** SymbolKind LSP; 0 = tidak diketahui (fallback indentasi) */
  kind: number;
  /** baris 1-based (inklusif) */
  dari: number;
  sampai: number;
  anak: SimpulSimbol[];
}

/** Nama & ikon SymbolKind LSP yang benar-benar muncul di breadcrumbs. */
const KIND: Record<number, { label: string; ikon: string }> = {
  1: { label: 'File', ikon: '▤' },
  2: { label: 'Module', ikon: '◫' },
  3: { label: 'Namespace', ikon: '◫' },
  4: { label: 'Package', ikon: '◫' },
  5: { label: 'Class', ikon: '◇' },
  6: { label: 'Method', ikon: 'ƒ' },
  7: { label: 'Property', ikon: '▪' },
  8: { label: 'Field', ikon: '▪' },
  9: { label: 'Constructor', ikon: 'ƒ' },
  10: { label: 'Enum', ikon: '≡' },
  11: { label: 'Interface', ikon: '◈' },
  12: { label: 'Function', ikon: 'ƒ' },
  13: { label: 'Variable', ikon: '▫' },
  14: { label: 'Constant', ikon: '▫' },
  15: { label: 'String', ikon: '"' },
  16: { label: 'Number', ikon: '#' },
  17: { label: 'Boolean', ikon: '◐' },
  18: { label: 'Array', ikon: '[]' },
  19: { label: 'Object', ikon: '{}' },
  20: { label: 'Key', ikon: '⚿' },
  22: { label: 'Struct', ikon: '◇' },
  23: { label: 'Event', ikon: '⚡' },
  25: { label: 'TypeParameter', ikon: '◈' },
};

export const ikonKind = (kind: number) => KIND[kind]?.ikon ?? '▫';
export const labelKind = (kind: number) => KIND[kind]?.label ?? 'Symbol';

/** Kind yang layak jadi baris sticky / segmen breadcrumb. Variabel lokal dan
 *  properti tidak masuk — kalau ikut, breadcrumbs jadi ramai tanpa guna. */
const KIND_STRUKTUR = new Set([2, 3, 4, 5, 6, 9, 10, 11, 12, 22, 23]);

/**
 * DocumentSymbol (bersarang) ATAU SymbolInformation (rata) → pohon kami.
 * Server bebas memilih bentuknya, jadi keduanya harus ditangani; tsserver
 * mengirim DocumentSymbol, beberapa server lama mengirim SymbolInformation.
 */
const dariLsp = (raw: unknown[]): SimpulSimbol[] => {
  const konversi = (o: Record<string, unknown>): SimpulSimbol | null => {
    const nama = typeof o.name === 'string' ? o.name : '';
    if (!nama) return null;
    const kind = typeof o.kind === 'number' ? o.kind : 0;

    // DocumentSymbol punya `range`; SymbolInformation punya `location.range`.
    const range = (o.range ??
      (o.location as Record<string, unknown> | undefined)?.range) as
      | { start?: { line?: number }; end?: { line?: number } }
      | undefined;
    if (!range?.start || !range?.end) return null;

    const anakRaw = Array.isArray(o.children) ? o.children : [];
    return {
      nama,
      kind,
      dari: (range.start.line ?? 0) + 1,
      sampai: (range.end.line ?? 0) + 1,
      anak: anakRaw
        .map((c) => konversi(c as Record<string, unknown>))
        .filter((x): x is SimpulSimbol => !!x),
    };
  };

  const datar = raw
    .map((r) => konversi(r as Record<string, unknown>))
    .filter((x): x is SimpulSimbol => !!x);

  // SymbolInformation datang rata; susun ulang berdasarkan range yang memuat.
  const punyaAnak = datar.some((d) => d.anak.length > 0);
  if (punyaAnak) return datar;

  const urut = [...datar].sort((a, b) => a.dari - b.dari || b.sampai - a.sampai);
  const akar: SimpulSimbol[] = [];
  const tumpukan: SimpulSimbol[] = [];
  for (const s of urut) {
    while (tumpukan.length > 0 && tumpukan[tumpukan.length - 1].sampai < s.dari) tumpukan.pop();
    if (tumpukan.length === 0) akar.push(s);
    else tumpukan[tumpukan.length - 1].anak.push(s);
    tumpukan.push(s);
  }
  return akar;
};

/** Kolom indentasi sebuah baris (tab dihitung sebagai tabSize). */
const indentDari = (teks: string, tabSize: number): number => {
  let n = 0;
  for (const ch of teks) {
    if (ch === ' ') n += 1;
    else if (ch === '\t') n += tabSize - (n % tabSize);
    else return n;
  }
  return -1;
};

/** Baris yang MEMBUKA blok — dipakai fallback tanpa LSP. */
const RE_HEADER =
  /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:pub(?:\([^)]*\))?\s+)?(?:public|private|protected|internal|static|final|abstract|override)?\s*(?:class|struct|enum|interface|trait|impl|namespace|module|def|fn|func|function|type)\b|^\s*(?:[\w$.<>[\]]+\s+)?[\w$]+\s*\([^)]*\)\s*(?:->\s*[^{;]+)?\s*\{\s*$|^\s*(?:const|let|var)\s+[\w$]+\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>)/;

/**
 * Fallback tanpa LSP: baris yang cocok RE_HEADER jadi simbol, jangkauannya
 * sampai baris terakhir yang indentasinya lebih dalam.
 */
const dariIndentasi = (state: EditorState): SimpulSimbol[] => {
  const doc = state.doc;
  const tabSize = state.tabSize;
  const total = doc.lines;
  // File sangat besar: fallback dilewati — biayanya O(n) dan tanpa LSP nilainya
  // tidak sebanding (sticky scroll masih jalan dari struktur yang ada).
  if (total > 20000) return [];

  const kandidat: { baris: number; indent: number; teks: string }[] = [];
  for (let n = 1; n <= total; n++) {
    const teks = doc.line(n).text;
    if (teks.trim().length === 0) continue;
    if (!RE_HEADER.test(teks)) continue;
    kandidat.push({ baris: n, indent: Math.max(indentDari(teks, tabSize), 0), teks });
  }

  const namaDari = (teks: string): string => {
    const bersih = teks.trim().replace(/\{\s*$/, '').trim();
    return bersih.length > 80 ? `${bersih.slice(0, 77)}…` : bersih;
  };

  const akar: SimpulSimbol[] = [];
  const tumpukan: SimpulSimbol[] = [];
  const indentTumpukan: number[] = [];

  for (let i = 0; i < kandidat.length; i++) {
    const k = kandidat[i];
    // Akhir blok: baris berikut dengan indent <= milik kita.
    let akhir = total;
    for (let n = k.baris + 1; n <= total; n++) {
      const t = doc.line(n).text;
      if (t.trim().length === 0) continue;
      const ind = indentDari(t, tabSize);
      if (ind >= 0 && ind <= k.indent) {
        akhir = n - 1;
        break;
      }
    }

    const simpul: SimpulSimbol = {
      nama: namaDari(k.teks),
      kind: 0,
      dari: k.baris,
      sampai: Math.max(akhir, k.baris),
      anak: [],
    };

    while (indentTumpukan.length > 0 && indentTumpukan[indentTumpukan.length - 1] >= k.indent) {
      tumpukan.pop();
      indentTumpukan.pop();
    }
    if (tumpukan.length === 0) akar.push(simpul);
    else tumpukan[tumpukan.length - 1].anak.push(simpul);
    tumpukan.push(simpul);
    indentTumpukan.push(k.indent);
  }
  return akar;
};

/**
 * Pohon simbol untuk sebuah file. Mencoba LSP dulu; kalau kosong atau gagal,
 * pakai fallback indentasi. `punyaLsp` dipakai UI untuk menandai bahwa jalur
 * yang ditampilkan adalah perkiraan.
 */
export async function pohonSimbol(
  path: string | undefined,
  state: EditorState,
): Promise<{ pohon: SimpulSimbol[]; punyaLsp: boolean }> {
  if (path) {
    try {
      const raw = await lspDocumentSymbols(path);
      if (raw.length > 0) return { pohon: dariLsp(raw), punyaLsp: true };
    } catch {
      // Server mati / belum siap — fallback saja, jangan ganggu user.
    }
  }
  return { pohon: dariIndentasi(state), punyaLsp: false };
}

/** Jalur simbol yang memuat `baris`, dari terluar ke terdalam. */
export function jalurKe(pohon: SimpulSimbol[], baris: number): SimpulSimbol[] {
  const out: SimpulSimbol[] = [];
  let level = pohon;
  for (;;) {
    const cocok = level.find((s) => baris >= s.dari && baris <= s.sampai);
    if (!cocok) break;
    out.push(cocok);
    level = cocok.anak;
  }
  return out;
}

/** Baris header yang harus menempel di atas untuk posisi kursor/scroll. */
export function barisSticky(
  pohon: SimpulSimbol[],
  barisAtas: number,
  maks: number,
): SimpulSimbol[] {
  return jalurKe(pohon, barisAtas)
    .filter((s) => s.kind === 0 || KIND_STRUKTUR.has(s.kind))
    .filter((s) => s.dari < barisAtas)
    .slice(-maks);
}

/** Simbol sebaya (untuk dropdown breadcrumb). */
export function sebaya(pohon: SimpulSimbol[], jalur: SimpulSimbol[], index: number): SimpulSimbol[] {
  if (index <= 0) return pohon;
  return jalur[index - 1]?.anak ?? [];
}
