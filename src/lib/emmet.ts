/*
 * Emmet (HTML/CSS) — ekspansi singkatan, tanpa paket eksternal.
 *
 * `div.kartu>h2{Judul}+p*2` harus menjadi HTML bersarang, dan `m10-20` harus
 * menjadi `margin: 10px 20px;`. Pustaka resmi Emmet besar (parser penuh +
 * resolusi vendor prefix), sementara yang dibutuhkan editor ini hanya bagian
 * yang orang benar-benar mengetik: anak `>`, saudara `+`, kelas `.`, id `#`,
 * atribut `[]`, teks `{}`, pengulangan `*` dengan `$`, dan singkatan CSS yang
 * umum. Karena itu tabelnya ditulis di sini — satu berkas, bisa diuji tanpa
 * aplikasi, dan tidak menambah dependensi yang harus diperbarui.
 *
 * Yang SENGAJA tidak didukung: `^` (naik satu level), `|` filter, `lorem`,
 * resolusi vendor prefix, dan singkatan CSS bertingkat (`bd+`). Singkatan yang
 * tidak bisa dibaca dengan pasti mengembalikan `null`; editor lalu membiarkan
 * Tab melakukan indentasi seperti biasa, bukan menebak dan merusak baris.
 */

export interface HasilEmmet {
  /** Teks pengganti, siap dimasukkan ke dokumen. */
  teks: string;
  /** Posisi kursor DI DALAM `teks` setelah sisipan. */
  kursor: number;
}

/** Elemen yang tidak punya penutup dan tidak bisa punya anak. */
const TAG_KOSONG = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

const PENANDA = '\u0001';

interface Simpul {
  tag: string;
  kelas: string[];
  id: string | null;
  attrs: [string, string][];
  teks: string | null;
  anak: Simpul[];
  ulang: number;
}

function simpulKosong(tag: string): Simpul {
  return { tag, kelas: [], id: null, attrs: [], teks: null, anak: [], ulang: 1 };
}

/*
 * Satu level: nama tag opsional lalu modifier apa pun yang menempel.
 *
 * Regex ini sengaja longgar pada nama tag (`my-widget` boleh) tetapi ketat
 * pada posisi modifier, karena urutan itulah yang membuat `a.x#y[href=#]`
 * terbaca tanpa perlu parser karakter demi karakter.
 */
function bacaLevel(teks: string): Simpul | null {
  const m = /^([a-zA-Z][\w:-]*)?((?:[.#][\w-]+|\[[^\]]*\]|\{[^}]*\})*)(?:\*(\d+))?$/.exec(teks);
  if (!m) return null;
  const [, nama, modifier, kali] = m;
  const simpul = simpulKosong(nama || 'div');
  if (kali) {
    const n = Number(kali);
    if (!Number.isFinite(n) || n < 1 || n > 200) return null;
    simpul.ulang = n;
  }

  let sisa = modifier ?? '';
  while (sisa.length > 0) {
    const c = sisa[0];
    if (c === '.' || c === '#') {
      const m2 = /^[.#]([\w-]+)/.exec(sisa);
      if (!m2) return null;
      if (c === '.') simpul.kelas.push(m2[1]);
      else simpul.id = m2[1];
      sisa = sisa.slice(m2[0].length);
    } else if (c === '[') {
      const akhir = sisa.indexOf(']');
      if (akhir < 0) return null;
      for (const bagian of sisa.slice(1, akhir).match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? []) {
        const eq = bagian.indexOf('=');
        if (eq < 0) simpul.attrs.push([bagian, '']);
        else {
          const nilai = bagian.slice(eq + 1).replace(/^["']|["']$/g, '');
          simpul.attrs.push([bagian.slice(0, eq), nilai]);
        }
      }
      sisa = sisa.slice(akhir + 1);
    } else if (c === '{') {
      const akhir = sisa.indexOf('}');
      if (akhir < 0) return null;
      simpul.teks = sisa.slice(1, akhir);
      sisa = sisa.slice(akhir + 1);
    } else return null;
  }
  return simpul;
}

/** Pecah pada pemisah tingkat atas saja (di luar `[]` dan `{}`). */
function pecah(teks: string, pemisah: string): string[] {
  const hasil: string[] = [];
  let buf = '';
  let kurung = 0;
  for (const c of teks) {
    if (c === '[' || c === '{') kurung++;
    if (c === ']' || c === '}') kurung = Math.max(0, kurung - 1);
    if (c === pemisah && kurung === 0) {
      hasil.push(buf);
      buf = '';
    } else buf += c;
  }
  hasil.push(buf);
  return hasil;
}

/*
 * `a>b+c` adalah a berisi (b DAN c), bukan a berisi b lalu c sejajar a.
 * Itu sebabnya rantai `>` dipecah per kelompok `+` terlebih dahulu: kelompok
 * menjadi saudara, dan setiap kelompok adalah satu jalur turun.
 */
function baca(abbr: string): Simpul[] | null {
  const kelompok = pecah(abbr, '+');
  const akar: Simpul[] = [];
  for (const k of kelompok) {
    const jalur = pecah(k, '>');
    let induk: Simpul | null = null;
    for (const bagian of jalur) {
      if (!bagian) return null;
      const simpul = bacaLevel(bagian);
      if (!simpul) return null;
      if (induk) induk.anak.push(simpul);
      else akar.push(simpul);
      induk = simpul;
    }
  }
  return akar;
}

/** `$` di nama/teks/nilai atribut menjadi nomor urut 1..n. */
function nomor(teks: string, i: number): string {
  return teks.replace(/\$/g, String(i));
}

function tulis(simpul: Simpul, kedalaman: number, indentasi: string, keluaran: string[], state: { sudah: boolean }): void {
  const n = Math.max(1, simpul.ulang);
  for (let i = 1; i <= n; i++) {
    const tag = nomor(simpul.tag, i);
    /* Emmet menggabungkan kelas menjadi SATU atribut; `.a.b` bukan dua class. */
    const kelasAttr = simpul.kelas.length ? ` class="${simpul.kelas.map((k) => nomor(k, i)).join(' ')}"` : '';
    const idAttr = simpul.id ? ` id="${nomor(simpul.id, i)}"` : '';
    const attr = simpul.attrs
      .map(([k, v]) => (v === '' ? ` ${k}` : ` ${k}="${nomor(v, i)}"`))
      .join('');
    const buka = `<${tag}${kelasAttr}${idAttr}${attr}>`;
    const kosong = TAG_KOSONG.has(tag.toLowerCase());
    const teks = simpul.teks === null ? null : nomor(simpul.teks, i);

    if (kosong) {
      /* `<img>` tidak punya penutup; teks/anak diabaikan seperti Emmet. */
      keluaran.push(`${indentasi.repeat(kedalaman)}<${tag}${kelasAttr}${idAttr}${attr}>`);
      continue;
    }

    if (teks !== null) {
      keluaran.push(`${indentasi.repeat(kedalaman)}${buka}${teks}</${tag}>`);
      continue;
    }

    if (simpul.anak.length === 0) {
      /* Slot kosong: di sinilah kursor diletakkan. Hanya yang PERTAMA supaya
         `ul>li*3` menaruh kursor di li pertama, bukan di ketiganya. */
      const isi = state.sudah ? '' : PENANDA;
      state.sudah = true;
      keluaran.push(`${indentasi.repeat(kedalaman)}${buka}${isi}</${tag}>`);
      continue;
    }

    keluaran.push(`${indentasi.repeat(kedalaman)}${buka}`);
    for (const a of simpul.anak) tulis(a, kedalaman + 1, indentasi, keluaran, state);
    keluaran.push(`${indentasi.repeat(kedalaman)}</${tag}>`);
  }
}

/**
 * Ekspansi singkatan HTML.
 *
 * Mengembalikan `null` bila singkatan tidak bisa dibaca — pemanggil harus
 * memperlakukan itu sebagai "bukan Emmet", bukan sebagai teks kosong.
 */
export function expandHtml(abbr: string, indentasi = '  '): HasilEmmet | null {
  if (!abbr.trim()) return null;
  const akar = baca(abbr.trim());
  if (!akar || akar.length === 0) return null;

  const keluaran: string[] = [];
  const state = { sudah: false };
  for (const s of akar) tulis(s, 0, indentasi, keluaran, state);

  const gabung = keluaran.join('\n');
  const pos = gabung.indexOf(PENANDA);
  const teks = pos >= 0 ? gabung.replace(PENANDA, '') : gabung;
  return { teks, kursor: pos >= 0 ? pos : teks.length };
}

/* ── CSS ─────────────────────────────────────────────────────────────────── */

interface PropertiCss {
  nama: string;
  /** Properti yang nilainya angka polos, tanpa `px`. */
  polos?: boolean;
}

const CSS: Record<string, PropertiCss> = {
  m: { nama: 'margin' },
  mt: { nama: 'margin-top' },
  mr: { nama: 'margin-right' },
  mb: { nama: 'margin-bottom' },
  ml: { nama: 'margin-left' },
  p: { nama: 'padding' },
  pt: { nama: 'padding-top' },
  pr: { nama: 'padding-right' },
  pb: { nama: 'padding-bottom' },
  pl: { nama: 'padding-left' },
  w: { nama: 'width' },
  h: { nama: 'height' },
  maw: { nama: 'max-width' },
  mah: { nama: 'max-height' },
  miw: { nama: 'min-width' },
  mih: { nama: 'min-height' },
  fz: { nama: 'font-size' },
  lh: { nama: 'line-height', polos: true },
  fw: { nama: 'font-weight', polos: true },
  op: { nama: 'opacity', polos: true },
  z: { nama: 'z-index', polos: true },
  br: { nama: 'border-radius' },
  gap: { nama: 'gap' },
  t: { nama: 'top' },
  r: { nama: 'right' },
  b: { nama: 'bottom' },
  l: { nama: 'left' },
  d: { nama: 'display' },
  pos: { nama: 'position' },
  ov: { nama: 'overflow' },
  cur: { nama: 'cursor' },
  ta: { nama: 'text-align' },
  td: { nama: 'text-decoration' },
  c: { nama: 'color' },
  bg: { nama: 'background' },
  ff: { nama: 'font-family' },
  bs: { nama: 'box-shadow' },
};

/** Nilai gaya pendek: `f` → flex, `n` → none, `a` → auto, `r` → relative. */
const NILAI: Record<string, string> = {
  f: 'flex',
  n: 'none',
  a: 'auto',
  r: 'relative',
  ab: 'absolute',
  b: 'block',
  ib: 'inline-block',
  if: 'inline-flex',
  g: 'grid',
  h: 'hidden',
  p: 'pointer',
};

function nilaiCss(bagian: string, polos: boolean): string | null {
  if (/^#[0-9a-f]{3,8}$/i.test(bagian)) return bagian;
  if (NILAI[bagian]) return NILAI[bagian];
  const m = /^(-?\d+(?:\.\d+)?)(px|p|e|r|%)?$/.exec(bagian);
  if (!m) return null;
  const angka = m[1];
  const unit = m[2];
  if (polos && !unit) return angka;
  if (unit === '%') return `${angka}%`;
  if (unit === 'e') return `${angka}em`;
  if (unit === 'r') return `${angka}rem`;
  return `${angka}px`;
}

/**
 * Ekspansi singkatan CSS: `m10-20` → `margin: 10px 20px;`.
 *
 * Hanya satu properti per singkatan. `d:f` dan vendor prefix tidak didukung;
 * mengembalikan `null` lebih jujur daripada menghasilkan CSS yang salah.
 */
export function expandCss(abbr: string): HasilEmmet | null {
  const m = /^([a-z]+)(.+)$/.exec(abbr.trim());
  if (!m) return null;
  const [, kunci, sisa] = m;
  const prop = CSS[kunci];
  if (!prop) return null;

  /* `m10-20` = dua nilai, `m-10` = satu nilai negatif. Pemisah hanya `-` yang
     didahului angka, supaya tanda minus di awal tidak terpotong. */
  const bagian = sisa.replace(/^:/, '').replace(/(\d)-/g, '$1\u0000').split('\u0000');
  const nilai: string[] = [];
  for (const b of bagian) {
    const v = nilaiCss(b, prop.polos === true);
    if (v === null) return null;
    nilai.push(v);
  }
  return { teks: `${prop.nama}: ${nilai.join(' ')};`, kursor: 0 };
}

/* ── Pemilih bahasa ──────────────────────────────────────────────────────── */

const BAHASA_HTML = new Set(['html', 'vue', 'svelte', 'xml', 'php', 'jinja', 'handlebars']);
const BAHASA_CSS = new Set(['css', 'scss', 'less', 'sass']);

/**
 * Ekspansi sesuai bahasa berkas, atau `null` bila bahasa ini bukan sasaran
 * Emmet (Python, Rust, TS, …) — di sana Tab harus tetap menjadi indentasi.
 */
export function expandEmmet(abbr: string, lang: string | null | undefined): HasilEmmet | null {
  const l = (lang ?? '').toLowerCase();
  if (BAHASA_HTML.has(l)) return expandHtml(abbr);
  if (BAHASA_CSS.has(l)) return expandCss(abbr);
  return null;
}
