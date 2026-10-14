/*
 * PEMBUNGKUS BAHASA + ATURAN KLAIM NILAI (item 161, sisa item 138).
 *
 * Murni: tanpa import, tanpa React, tanpa store, tanpa efek samping. Bisa
 * dijalankan tanpa app:
 *   node scripts/ukur-mutu-jawaban.mjs --uji-klaim-nilai
 *
 * Dipakai dua arah:
 *   1. `blokKlaimNilai(bahasa)` dan `blokPenutup(bahasa)` menghasilkan teks
 *      aturan untuk prompt. CATATAN JUJUR: `src/lib/systemPrompt.ts` BELUM
 *      memanggil berkas ini - berkas itu milik lane lain, jadi usulan
 *      tambalannya ditulis di docs/UKUR-MUTU-JAWABAN.md, bukan dikerjakan
 *      di sini. Sampai tambalan itu masuk, aturan ini belum menyentuh jawaban
 *      nyata (jujur: TIDAK TERPASANG).
 *   2. `periksaKlaimNilai(jawaban, fakta)` -> daftar pelanggaran deterministik.
 *      Rubrik `scripts/ukur-mutu-jawaban.mjs` memakainya (butir R8) supaya
 *      "angka karangan" bisa ditangkap tanpa memanggil model apa pun.
 *
 * Kenapa `blokPenutup` ada: blok gaya/panjang di systemPrompt.ts dikirim
 * SETELAH blok bentuk (tabel/daftar) - yang terakhir dibaca model yang paling
 * kuat pengaruhnya. Penutup ini ditaruh paling akhir supaya "bentuk yang
 * diminta user menang atas batas panjang" jadi aturan terakhir yang dibaca.
 */

/** Aturan klaim nilai, bahasa Indonesia. Urutan = urutan di prompt. */
export const ATURAN_NILAI_ID: readonly string[] = [
  'Setiap angka, versi, jumlah, port, atau nama kunci setelan yang kamu sebut harus ADA di blok fakta giliran ini atau di hasil `zephyr_self`. Kalau tidak ada di situ, katakan tidak ada dan tawarkan memeriksa - jangan menaksir.',
  'Jangan membulatkan atau menaksir angka yang sudah tertulis: tulis "67 tool", bukan "sekitar 60-an tool".',
  'Kalau menyebut sebuah nilai, sebutkan sumbernya sekaligus (nama kunci setelan, kategori indeks, atau jalur berkas) supaya user bisa memeriksa sendiri.',
  'Jangan mengarang nama berkas, jalur, kunci setelan, tombol, atau pintasan. Jalur berkas hanya boleh ditulis kalau kamu benar-benar membacanya atau tertulis di fakta.',
  'Kalau bentuk yang diminta user (tabel/daftar) berbenturan dengan batas panjang gaya jawaban, bentuk yang diminta MENANG: susun tabelnya, jangan diganti prosa.',
  'Tabel hanya berisi nilai nyata dari fakta. Jangan mengisi sel dengan contoh karangan supaya tabelnya kelihatan penuh - lebih baik satu baris lebih sedikit daripada satu angka palsu.',
];

/** Nilai aturan yang sama, bahasa Inggris (dipakai saat bahasa jawaban = en). */
export const ATURAN_NILAI_EN: readonly string[] = [
  'Every number, version, count, port, or setting key you state must exist in this turn\'s facts block or in `zephyr_self` output. If it is not there, say so and offer to check - never estimate.',
  'Never round or approximate a value that is already written down: say "67 tools", not "about 60 tools".',
  'When you state a value, name its source at the same time (setting key, index category, or file path) so the user can verify it.',
  'Never invent a file name, path, setting key, button label, or shortcut. Write a path only if you actually read it or it is written in the facts.',
  'If the shape the user asked for (table/list) collides with the answer-style length budget, the requested shape WINS: build the table instead of turning it into prose.',
  'A table holds real values from the facts only. Do not fill cells with invented examples to make it look complete - fewer rows beats one fake number.',
];

/** Penanda bahasa: dukung 'id', 'en', dan kode lain apa pun (jatuh ke Indonesia). */
function pilihBahasa(bahasa?: string): 'id' | 'en' {
  return (bahasa || 'id').toLowerCase().startsWith('en') ? 'en' : 'id';
}

/**
 * Blok aturan klaim nilai siap tempel ke prompt.
 * Deterministik: masukan sama -> keluaran sama (tanpa tanggal, tanpa acak).
 */
export function blokKlaimNilai(bahasa?: string): string {
  const id = pilihBahasa(bahasa) === 'id';
  const aturan = id ? ATURAN_NILAI_ID : ATURAN_NILAI_EN;
  const judul = id ? 'Nilai yang kamu sebut (wajib)' : 'Values you state (required)';
  const baris = aturan.map((a, i) => `${i + 1}. ${a}`);
  return [`## ${judul}`, ...baris].join('\n');
}

/**
 * Penutup prompt. HARUS ditaruh paling akhir di system prompt: aturan yang
 * dibaca terakhir paling menentukan bentuk jawaban.
 */
export function blokPenutup(bahasa?: string): string {
  const id = pilihBahasa(bahasa) === 'id';
  return id
    ? '## Terakhir, sebelum menjawab\nBila user meminta tabel atau daftar, susun bentuk itu lebih dulu - batas panjang gaya jawaban tidak boleh mengubahnya jadi prosa. Setiap angka di dalamnya harus angka nyata dari fakta; kalau angkanya tidak kamu pegang, tulis barisnya tanpa angka daripada mengarang.'
    : '## Last, before you answer\nIf the user asked for a table or a list, build that shape first - the answer-style length budget must not turn it into prose. Every number in it must be a real value from the facts; if you do not hold the number, leave the row without it rather than inventing one.';
}

/** Fakta yang boleh dikutip jawaban: nilai + jalur/kunci yang sudah dikenal. */
export interface FaktaNilai {
  /** Angka yang boleh disebut: port, jumlah, batas bawaan. */
  angka?: readonly number[];
  /** Versi yang boleh disebut, tanpa atau dengan awalan 'v'. */
  versi?: readonly string[];
  /** Jalur/kunci nyata; angka di dalamnya ikut diakui (mis. `vite.config.ts`). */
  jalur?: readonly string[];
}

export type JenisPelanggaranNilai = 'port-asing' | 'versi-asing';

export interface PelanggaranNilai {
  jenis: JenisPelanggaranNilai;
  token: string;
  /** Potongan jawaban di sekitar token - konteksnya tidak dipotong supaya bisa diperiksa. */
  konteks: string;
}

function himpunanAngka(fakta: FaktaNilai): Set<string> {
  const set = new Set<string>();
  for (const n of fakta.angka || []) set.add(String(n));
  for (const v of fakta.versi || []) {
    set.add(v);
    set.add(v.replace(/^v/i, ''));
  }
  for (const j of fakta.jalur || []) for (const d of j.match(/\d+/g) || []) set.add(d);
  return set;
}

/**
 * Cacat klaim nilai yang bisa dideteksi TANPA model:
 *   - `port-asing`  : angka 3-5 digit yang muncul di konteks port/kuota tetapi
 *                     tidak ada di fakta (mis. port bridge dikarang).
 *   - `versi-asing` : versi berbentuk x.y.z yang tidak ada di fakta.
 *
 * Batas yang jujur: fungsi ini hanya menangkap dua bentuk itu. Rujukan baris
 * seperti `aiStore.ts:2034` sengaja TIDAK dianggap pelanggaran (itu bukan
 * klaim nilai). Angka di dalam blok kode ikut diperiksa seperti teks biasa.
 */
export function periksaKlaimNilai(jawaban: string, fakta: FaktaNilai): PelanggaranNilai[] {
  const out: PelanggaranNilai[] = [];
  const dikenal = himpunanAngka(fakta);
  const teks = jawaban || '';

  const RE_ANGKA = /\b(\d{3,5})\b/g;
  let m: RegExpExecArray | null;
  while ((m = RE_ANGKA.exec(teks))) {
    const token = m[1];
    if (dikenal.has(token)) continue;
    const sebelum = teks.slice(Math.max(0, m.index - 24), m.index);
    const sesudah = teks.slice(m.index + token.length, m.index + token.length + 24);
    if (!/(port|cdp|mcp|dev|webview|kuota|quota)/i.test(sebelum) && !/(port|kuota|quota)/i.test(sesudah)) continue;
    // Rujukan baris (`berkas.ts:2034`) bukan klaim nilai.
    if (/[A-Za-z0-9_./-]:\s*$/.test(sebelum)) continue;
    out.push({ jenis: 'port-asing', token, konteks: `${sebelum}${token}${sesudah}`.trim() });
  }

  const RE_VERSI = /\bv?(\d+\.\d+\.\d+)\b/g;
  while ((m = RE_VERSI.exec(teks))) {
    const token = m[1];
    if (dikenal.has(token) || dikenal.has(`v${token}`)) continue;
    const sebelum = teks.slice(Math.max(0, m.index - 24), m.index);
    out.push({ jenis: 'versi-asing', token, konteks: `${sebelum}${m[0]}`.trim() });
  }

  return out;
}
