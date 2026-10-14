/*
 * Peta tokenColors VS Code -> token sintaks Zephyr.
 *
 * Memasang tema VS Code menjalankan `petakanTemaVscode` (warna UI: latar,
 * panel, tombol, ...) tetapi tema itu TIDAK pernah menyentuh `tokenColors`,
 * jadi chrome editor berubah sementara warna kode tetap seperti sebelumnya.
 * Berkas ini menutup celah itu: `tokenColors` dipetakan ke token sintaks
 * `--syn-*` yang sudah dipakai `src/styles/editor-themes.ts`
 * (v('--syn-keyword'), v('--syn-tag'), ...).
 *
 * Aturan yang dipegang di sini:
 *  - Entri TERAKHIR yang cocok menang, sama seperti VS Code (tema biasanya
 *    menaruh override di akhir berkas).
 *  - Selector paling spesifik menang di dalam SATU entri: `keyword.operator`
 *    harus jadi --syn-operator, bukan --syn-keyword. VS Code memilih prefix
 *    terpanjang, dan itu yang ditiru `tokenUntukSelector`.
 *  - Bentuk rusak (string, angka, null, array bersarang, `settings` hilang)
 *    tidak boleh melempar: yang tidak terbaca cukup dilewati.
 */

import { parseWarna, keCss } from './vscodeThemeMap';

type EntriMentah = Record<string, unknown>;

/*
 * Tabel scope -> token. Urutan penting hanya untuk seri panjang yang sama
 * (entri lebih awal menang), jadi daftar yang lebih umum diletakkan dulu.
 */
const TABEL_SCOPE: ReadonlyArray<readonly [string, string]> = [
  ['comment', '--syn-comment'],
  ['keyword', '--syn-keyword'],
  ['storage', '--syn-keyword'],
  ['keyword.control', '--syn-keyword'],
  ['storage.type', '--syn-keyword'],
  ['string', '--syn-string'],
  ['string.quoted', '--syn-string'],
  ['regexp', '--syn-string'],
  ['constant.numeric', '--syn-number'],
  ['number', '--syn-number'],
  ['entity.name.function', '--syn-function'],
  ['support.function', '--syn-function'],
  ['variable.function', '--syn-function'],
  ['entity.name.type', '--syn-type'],
  ['entity.name.class', '--syn-type'],
  ['storage.type.class', '--syn-type'],
  ['support.type', '--syn-type'],
  ['support.class', '--syn-type'],
  ['variable', '--syn-variable'],
  ['variable.other', '--syn-variable'],
  ['variable.parameter', '--syn-variable'],
  ['keyword.operator', '--syn-operator'],
  ['operator', '--syn-operator'],
  ['entity.other.attribute-name', '--syn-attr'],
  ['support.type.property-name', '--syn-attr'],
  ['entity.name.tag', '--syn-tag'],
  ['meta.tag', '--syn-tag'],
  ['punctuation.definition.tag', '--syn-tag'],
  ['invalid', '--syn-invalid'],
];

/*
 * Cocokkan satu selector ke token.
 *
 * Arah pencocokan hanya SATU arah: entri tabel harus sama dengan selector atau
 * menjadi prefix-nya (`comment` <- `comment.line.double-slash`). Arah
 * sebaliknya sengaja tidak dipakai - selector `keyword` harus jadi
 * --syn-keyword, bukan tertarik ke `keyword.operator` hanya karena entri itu
 * lebih panjang. Di antara yang cocok, prefix TERPANJANG menang supaya
 * `keyword.operator` mengalahkan `keyword`, sama seperti VS Code.
 */
function tokenUntukSelector(selector: string): string | null {
  let terbaik: string | null = null;
  let panjang = -1;
  for (const [scope, token] of TABEL_SCOPE) {
    if (selector !== scope && !selector.startsWith(scope + '.')) continue;
    if (scope.length > panjang) {
      panjang = scope.length;
      terbaik = token;
    }
  }
  return terbaik;
}

/*
 * Kumpulkan entri tokenColors, termasuk yang tersembunyi di array bersarang
 * (`[[{...}]]` muncul di beberapa tema hasil ekspor). Apa pun yang bukan
 * objek/array dilewati tanpa melempar.
 */
function kumpulkanEntri(input: unknown, out: EntriMentah[]): void {
  if (Array.isArray(input)) {
    for (const item of input) kumpulkanEntri(item, out);
    return;
  }
  if (input && typeof input === 'object') out.push(input as EntriMentah);
}

/* Scope bisa string ("a, b"), array, atau array bersarang. */
function daftarSelector(scope: unknown, out: string[]): void {
  if (typeof scope === 'string') {
    for (const bagian of scope.split(',')) {
      const s = bagian.trim();
      if (s) out.push(s);
    }
    return;
  }
  if (Array.isArray(scope)) {
    for (const item of scope) daftarSelector(item, out);
  }
}

/*
 * Ambil `settings.foreground` (beberapa tema menaruh `foreground` langsung di
 * entri). Nilai dinormalkan lewat helper warna milik vscodeThemeMap supaya
 * formatnya seragam dengan warna UI; kalau tidak terbaca sebagai warna,
 * string mentahnya tetap dipakai — CSS mungkin paham (mis. `hsl(...)`).
 * Entri tanpa foreground mengembalikan null dan dilewati pemanggil.
 */
function ambilForeground(entri: EntriMentah): string | null {
  const sumber: unknown[] = [];
  const settings = entri.settings;
  if (settings && typeof settings === 'object') {
    sumber.push((settings as EntriMentah).foreground);
  }
  sumber.push(entri.foreground);
  for (const f of sumber) {
    if (typeof f !== 'string') continue;
    const t = f.trim();
    if (!t) continue;
    const p = parseWarna(t);
    return p ? keCss(p) : t;
  }
  return null;
}

/**
 * tokenColors (array entri VS Code) -> peta token CSS Zephyr `--syn-*`.
 *
 * Selalu mengembalikan objek; bentuk rusak tidak melempar.
 */
export function petakanTokenWarna(tokenColors: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const entri: EntriMentah[] = [];
    kumpulkanEntri(tokenColors, entri);
    for (const e of entri) {
      try {
        const fg = ambilForeground(e);
        if (!fg) continue;
        const selector: string[] = [];
        daftarSelector(e.scope, selector);
        for (const s of selector) {
          const token = tokenUntukSelector(s);
          if (token) out[token] = fg; // entri terakhir yang cocok menang
        }
      } catch {
        /* satu entri rusak tidak boleh menggagalkan seluruh tema */
      }
    }
  } catch {
    /* bentuk masukan rusak: kembalikan apa yang sempat terbaca */
  }
  return out;
}
