import type { EditorState } from '@codemirror/state';
import { lspDocumentSymbols } from './lspCm';

export interface SimpulSimbol {
  nama: string;
  
  kind: number;
  
  dari: number;
  sampai: number;
  anak: SimpulSimbol[];
}

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

const KIND_STRUKTUR = new Set([2, 3, 4, 5, 6, 9, 10, 11, 12, 22, 23]);

const dariLsp = (raw: unknown[]): SimpulSimbol[] => {
  const konversi = (o: Record<string, unknown>): SimpulSimbol | null => {
    const nama = typeof o.name === 'string' ? o.name : '';
    if (!nama) return null;
    const kind = typeof o.kind === 'number' ? o.kind : 0;

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

const indentDari = (teks: string, tabSize: number): number => {
  let n = 0;
  for (const ch of teks) {
    if (ch === ' ') n += 1;
    else if (ch === '\t') n += tabSize - (n % tabSize);
    else return n;
  }
  return -1;
};

const RE_HEADER =
  /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:pub(?:\([^)]*\))?\s+)?(?:public|private|protected|internal|static|final|abstract|override)?\s*(?:class|struct|enum|interface|trait|impl|namespace|module|def|fn|func|function|type)\b|^\s*(?:[\w$.<>[\]]+\s+)?[\w$]+\s*\([^)]*\)\s*(?:->\s*[^{;]+)?\s*\{\s*$|^\s*(?:const|let|var)\s+[\w$]+\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>)/;

const dariIndentasi = (state: EditorState): SimpulSimbol[] => {
  const doc = state.doc;
  const tabSize = state.tabSize;
  const total = doc.lines;
  
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

export async function pohonSimbol(
  path: string | undefined,
  state: EditorState,
): Promise<{ pohon: SimpulSimbol[]; punyaLsp: boolean }> {
  if (path) {
    try {
      const raw = await lspDocumentSymbols(path);
      if (raw.length > 0) return { pohon: dariLsp(raw), punyaLsp: true };
    } catch {
      // Server down or not ready yet, fall back quietly without bothering the user.
    }
  }
  return { pohon: dariIndentasi(state), punyaLsp: false };
}

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

export function sebaya(pohon: SimpulSimbol[], jalur: SimpulSimbol[], index: number): SimpulSimbol[] {
  if (index <= 0) return pohon;
  return jalur[index - 1]?.anak ?? [];
}
