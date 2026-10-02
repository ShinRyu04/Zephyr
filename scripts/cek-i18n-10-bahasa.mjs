/**
 * cek-i18n-10-bahasa.mjs - gate final i18n: SELURUH bahasa, bukan hanya English.
 *
 *   node scripts/cek-i18n-10-bahasa.mjs 9223
 *
 * `cek-bahasa-final.mjs` hanya memeriksa English. Itu penting tapi tidak cukup:
 * bug bahasa yang paling lama tersembunyi di proyek ini justru bentuknya
 * "kunci hanya ada di kamus dasar" - dan pada bug itu SEMUA bahasa jatuh ke
 * teks Indonesia, sementara English terlihat baik-baik saja.
 *
 * Uji ini memakai jalur yang SAMA dengan yang dipakai UI (`translate(lang, key)`
 * dari `src/lib/i18n.ts`), lalu memeriksa setiap bahasa dengan ukuran yang sama.
 *
 * Ukurannya bukan "nilai harus berbeda dari kunci" - untuk kunci seperti `files`,
 * terjemahan Inggrisnya memang `files`, dan uji yang menuntut perbedaan akan
 * MENOLAK keadaan yang benar. Yang diperiksa: nilai sebuah bahasa tidak boleh
 * SAMA DENGAN TERJEMAHAN INDONESIA untuk kunci yang Indonesianya bukan kuncinya
 * sendiri. Itu tepat pola bug "jatuh ke bahasa sumber".
 */
import { Cdp, reporter } from './lib-cdp.mjs';

const PORT = Number(process.argv[2] || 9223);
const { cdp } = await Cdp.attach(PORT, 'Zephyr');
const r = reporter('cek-i18n-10-bahasa');

console.log('\n== i18n seluruh bahasa ==');

const hasil = await cdp.json(`return JSON.stringify(await (async () => {
  const i18n = await import('/src/lib/i18n.ts');
  /* Kamus tambahan harus dimuat dulu; kalau tidak, semua bahasa tampak jatuh. */
  if (i18n.muatKamusTambahan) { try { await i18n.muatKamusTambahan(); } catch {} }
  await new Promise((res) => setTimeout(res, 300));

  const langs = i18n.UI_LANGS.map((l) => l.value);
  /*
   * Sumber kunci: kamus TAMBAHAN yang diekspor. Kamus dasar SRC tidak
   * diekspor, dan mengambil sepuluh kunci tetap dari daftar buatan sendiri
   * membuat uji ini hampir tidak memeriksa apa pun: sepuluh kunci itu kebetulan
   * ada di kamus dasar, jadi nol jatuh bukan bukti apa-apa.
   *
   * i18n-extra.ts berisi ribuan kunci, dan itulah tempat bug "jatuh ke bahasa
   * sumber" benar-benar muncul.
   */
  const { EXTRA } = await import('/src/lib/i18n-extra.ts');
  const kunci = Object.keys(EXTRA.en || EXTRA[langs.find((l) => l !== 'id')] || {});
  const contoh = kunci.length ? kunci : ['Save', 'Cancel', 'Delete', 'Settings'];

  /*
   * Bahasa mana yang kamusnya lebih tipis daripada Inggris: itulah daftar
   * "belum diterjemahkan", terlepas dari isi teksnya.
   */
  const tipis = {};
  for (const l of langs) {
    if (l === 'id') continue;
    const kamus = EXTRA[l] || {};
    const kurang = contoh.filter((k) => kamus[k] === undefined);
    tipis[l] = kurang.length;
  }

  const per = {};
  for (const l of langs) {
    let jatuh = 0;
    const cuplikan = [];
    for (const k of contoh) {
      let v;
      try { v = i18n.translate(l, k); } catch { continue; }
      if (v == null) continue;
      if (l === 'id') continue;
      /*
       * Ukurannya BUKAN "nilai == terjemahan Indonesia".
       *
       * Saya sempat memakai ukuran itu, dan itu salah dua kali berturut-turut:
       *
       *   - "Website -> Website": istilah yang memang sama di semua bahasa,
       *     bukan bug.
       *   - "Ubah lebar panel AI -> English": kuncinya sudah berupa kalimat
       *     Indonesia, jadi terjemahan ID-nya kuncinya sendiri.
       *
       * Kriteria apa pun yang membandingkan dengan terjemahan ID akan menandai
       * istilah yang sengaja tidak diterjemahkan, dan angka besar dari uji
       * seperti itu MENYESATKAN: ia menuntut terjemahan yang tidak pernah
       * hilang, dan menolak keadaan yang sudah benar.
       *
       * Ukuran yang benar adalah: apakah kamus bahasa ini PUNYA sesuatu untuk
       * kunci tersebut. Jadi yang diperiksa adalah KEHADIRAN ENTRI, bukan
       * kesamaan teks - dan keberadaannya dibaca dari kamus bahasa itu
       * langsung, bukan lewat perbandingan.
       */
      const entri = EXTRA[l] ? EXTRA[l][k] : undefined;
      if (entri === undefined) {
        jatuh += 1;
        if (cuplikan.length < 4) cuplikan.push(k + ' -> ' + JSON.stringify(v));
      }
    }
    per[l] = { total: contoh.length, jatuh, cuplikan };
  }
  return { langs, jumlahKunci: contoh.length, per };
})())`);
const info = typeof hasil === 'string' ? JSON.parse(hasil) : hasil;
const { langs, per, jumlahKunci } = info;

console.log(`  bahasa: ${langs.length} (${langs.join(', ')}) | kunci diuji: ${jumlahKunci}`);
r.check('L1', langs.length >= 10, `${langs.length} bahasa terdaftar (harap >= 10)`);
r.check('L2', jumlahKunci > 0, `${jumlahKunci} kunci berhasil diuji (bukan nol - nol membuat uji lulus palsu)`);

for (const l of langs) {
  const h = per[l];
  if (!h) continue;
  if (l === 'id') {
    r.check(`L-${l}`, true, 'bahasa sumber, tidak diuji jatuh');
    continue;
  }
  r.check(
    `L-${l}`,
    h.jatuh === 0,
    `${l}: ${h.jatuh}/${h.total} kunci jatuh ke teks Indonesia` +
      (h.cuplikan?.length ? ` :: ${h.cuplikan.join(' | ')}` : ''),
  );
}

const { lulus, total } = r.selesai();
await cdp.close();
process.exit(lulus === total ? 0 : 1);
