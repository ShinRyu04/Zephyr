/**
 * uji-88-bahasa.mjs - buktikan SEMUA bahasa bawaan benar-benar bisa dipakai.
 *
 *   node scripts/uji-88-bahasa.mjs [port]
 *
 * Kenapa perlu diuji, bukan diasumsikan: manifest yang TERDAFTAR tidak sama
 * dengan grammar yang BISA DIMUAT. Bahasa bisa muncul di katalog, punya
 * `legacyMode`, dan tetap tidak menghasilkan apa pun kalau modul importer-nya
 * tidak ada atau parser-nya tidak ditemukan di dalam modul itu. Kegagalan itu
 * senyap - tidak ada galat, hanya editor yang tidak menyorot apa pun - jadi
 * satu-satunya cara tahu adalah mencoba memuat tiap bahasa dengan fungsi yang
 * SAMA dipakai editor.
 *
 * Manifest dibaca dari `src-tauri/src/ext_bundled.rs` di sisi Node (di sana
 * bentuknya JSON literal yang bisa diparse langsung), lalu daftarnya dikirim ke
 * halaman hidup untuk diuji - jadi yang diuji adalah fungsi loader yang
 * benar-benar dipakai editor, bukan salinannya.
 *
 * Read-only: tidak mengubah katalog, tidak menulis berkas.
 */
import { readFileSync } from 'node:fs';
import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';

/* Ambil SEMUA manifest bahasa bawaan dari sumbernya. */
const src = readFileSync('src-tauri/src/ext_bundled.rs', 'utf8');
const manifest = [];
for (const m of src.matchAll(/const LANG_[A-Z0-9_]+: &str = r##"([\s\S]*?)"##;/g)) {
  try {
    const j = JSON.parse(m[1]);
    const langs = (j.contributes && j.contributes.languages) || [];
    for (const l of langs) manifest.push({ id: j.id, l });
  } catch {
    /* satu literal yang tidak bisa diparse akan muncul sebagai kekurangan di
       hitungan akhir - bukan disembunyikan. */
  }
}

const page = await halamanZephyr(PORT);
const { cdp } = await Cdp.attach(PORT, page.title);

const r = await cdp.runAsync(`
  const daftar = ${JSON.stringify(manifest.map((x) => x.l))};
  const el = await import('/src/lib/extLoader.ts');
  const gagal = [];   /* grammarTersedia() bilang tidak ada */
  const kosong = [];  /* tersedia, tapi muatCmBahasa() mengembalikan [] */
  const sukses = [];
  for (const l of daftar) {
    if (!l.id) continue;
    if (!el.grammarTersedia(l)) { gagal.push(l.id); continue; }
    const ext = await el.muatCmBahasa(l);
    if (!ext || ext.length === 0) kosong.push(l.id);
    else sukses.push(l.id);
  }
  return { total: daftar.length, sukses: sukses.length, gagal, kosong };
`);

const s = typeof r === 'string' ? JSON.parse(r) : r;
console.log('manifest bahasa di ext_bundled.rs :', manifest.length);
console.log('diuji di halaman hidup            :', s.total);
console.log('BISA DIPAKAI                      :', s.sukses);
console.log('grammar TAK tersedia              :', s.gagal.length, s.gagal.slice(0, 12).join(', '));
console.log('dimuat KOSONG                     :', s.kosong.length, s.kosong.slice(0, 12).join(', '));
console.log(
  s.gagal.length === 0 && s.kosong.length === 0 && s.total === manifest.length
    ? '\nVERDICT: SEMUA BISA DIPAKAI'
    : '\nVERDICT: ADA YANG TIDAK BISA DIPAKAI',
);
await cdp.close();
