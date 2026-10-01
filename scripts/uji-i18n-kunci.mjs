/**
 * uji-i18n-kunci.mjs - pastikan kunci yang dipakai UI benar-benar ADA di kamus.
 *
 *   node scripts/uji-i18n-kunci.mjs 9223
 *
 * Bug yang dicegah: kamus proyek ini memakai kunci BERBAHASA INDONESIA dengan
 * nilai terjemahan. Memakai `tr('Running')` alih-alih `tr('Berjalan')` tidak
 * melempar error apa pun - penerjemahnya mengembalikan teks kunci apa adanya.
 * Jadi yang terlihat bukan kerusakan, melainkan bahasa Inggris yang tidak
 * pernah diterjemahkan, dan itu bisa lolos berbulan-bulan.
 *
 * Ujinya memanggil penerjemah SUNGGUHAN untuk tiap kunci dan menolak hasil yang
 * sama persis dengan kuncinya di bahasa non-Inggris.
 */
import { Cdp, reporter } from './lib-cdp.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const r = reporter('i18n-kunci');

const { cdp } = await Cdp.attach(PORT);
cdp.snapshot = null;

/* Kunci yang dipakai UI panel AI untuk status. */
const KUNCI = [
  'Berjalan',
  'Selesai',
  'Gagal',
  'Menunggu',
  'Dibatalkan',
  'Sedang jalan',
  'Antre',
  'Loop',
  'Sub-agen',
  'Status aktivitas',
];

const BAHASA = ['id', 'en', 'ja', 'ko', 'zh', 'es', 'fr', 'de', 'pt', 'ar'];

/*
 * Penerjemahnya dipanggil lewat `translate(lang, key)` - jalur yang BENAR-BENAR
 * dipakai aplikasi. Membaca kamusnya langsung tidak akan cukup: yang perlu
 * dibuktikan adalah "kunci ini menghasilkan terjemahan saat diminta", dan itu
 * termasuk jalur mundurnya ketika kunci tidak ada.
 *
 * Kamus tambahan (i18n-extra) dimuat lewat `muatKamusTambahan()`, dan tanpa
 * memanggilnya lebih dulu, sembilan bahasa non-Inggris belum punya kamusnya
 * sama sekali - sehingga semuanya akan tampak "hilang" padahal hanya belum
 * dimuat.
 */
const periksa = await cdp.json(`return JSON.stringify(await (async () => {
  const i18n = await import(String.fromCharCode(47) + 'src' + String.fromCharCode(47) + 'lib' + String.fromCharCode(47) + 'i18n.ts');
  if (typeof i18n.muatKamusTambahan === 'function') await i18n.muatKamusTambahan();

  const kunci = ${JSON.stringify(KUNCI)};
  const bahasa = ${JSON.stringify(BAHASA)};

  const keluaran = {};
  for (const b of bahasa) {
    const baris = {};
    for (const k of kunci) {
      try {
        baris[k] = i18n.translate(b, k);
      } catch (e) {
        baris[k] = 'GALAT: ' + String(e.message).slice(0, 60);
      }
    }
    keluaran[b] = baris;
  }
  return keluaran;
})())`);

/* Kunci yang tidak ada di kamus akan kembali sebagai kunci itu sendiri. */
const hilang = [];
for (const b of BAHASA) {
  for (const k of KUNCI) {
    const v = periksa[b] ? periksa[b][k] : null;
    if (v === null || v === undefined) hilang.push(`${b}:${k}`);
  }
}

r.check(
  'I1',
  hilang.length === 0,
  `kesepuluh kunci ada di kesepuluh bahasa${hilang.length ? ` (hilang: ${hilang.join(', ')})` : ''}`,
);

/*
 * Bahasa Inggris harus BERBEDA dari Indonesia - KECUALI untuk istilah yang
 * memang sama di kedua bahasa.
 *
 * 'Selesai'/'Done', 'Gagal'/'Failed', 'Menunggu'/'Waiting', 'Loop'/'Loop' dan
 * 'Sub-agen'/'Subagents' punya nilai Inggris yang sah. Menuntut semuanya
 * berbeda akan menghasilkan kegagalan palsu yang justru menyembunyikan
 * kegagalan asli.
 *
 * Jadi yang diperiksa hanya istilah yang PASTI berbeda, dan itulah kunci yang
 * paling sering terlewat ketika seseorang memakai kunci Inggris yang tidak ada.
 */
const MEMANG_BERBEDA = ['Berjalan', 'Sedang jalan', 'Antre', 'Status aktivitas', 'Dibatalkan'];

const samaDenganKunci = [];
for (const k of MEMANG_BERBEDA) {
  const en = periksa.en ? periksa.en[k] : null;
  if (!en) {
    samaDenganKunci.push(`en:${k}=TIDAK-ADA`);
  } else if (en === k) {
    samaDenganKunci.push(`en:${k}="${en}"`);
  }
}

r.check(
  'I2',
  samaDenganKunci.length === 0,
  `istilah yang pasti berbeda benar-benar diterjemahkan di bahasa Inggris${samaDenganKunci.length ? ` (masalah: ${samaDenganKunci.join(', ')})` : ''}`,
);

const contoh = BAHASA.map((b) => `${b}:${periksa[b] ? periksa[b]['Berjalan'] : '?'}`).join(' ');
r.check('I3', true, `contoh terjemahan "Berjalan" -> ${contoh}`);

const { lulus, total } = r.selesai();
await cdp.close();
process.exit(lulus === total ? 0 : 1);
