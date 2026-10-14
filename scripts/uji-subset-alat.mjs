/**
 * uji-subset-alat.mjs — A(i) subset alat per tugas + A(iv) gerbang rencana.
 *
 * Ini uji DETERMINISTIK: tidak menjalankan agen, tidak memakai kuota provider.
 * Yang diperiksa adalah keputusan yang dipakai run nyata - daftar tool apa yang
 * dibangun untuk sebuah teks tugas - lewat `__ZEPHYR_AI__.subsetAlat(teks)`.
 * Sisa risikonya (apakah daftar itu benar-benar keluar ke provider) diukur
 * oleh `uji-tengah-run.mjs` lewat `alatTerakhir()`.
 *
 *   node scripts/uji-subset-alat.mjs [port]
 */
import { Cdp, reporter } from './lib-cdp.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const R = reporter('subset alat per tugas (A(i)) + gerbang rencana (A(iv))');

const { cdp } = await Cdp.attach(PORT, ['Zephyr', 'Zephyr — Code Editor', 'localhost']);

/*
 * Banyak lane menulis ke repo yang sama, jadi Vite HMR bisa me-reload halaman di
 * tengah uji: saat itu `window.__ZEPHYR_AI__` ada tapi isinya (mis. `useToolGate`)
 * masih `undefined`, dan evaluasi melempar TypeError mentah. Tanpa pembungkus ini
 * penguji mati dengan stack trace yang tidak menjelaskan apa-apa. Sekarang:
 * pesan jelas + exit 3, dan penguji tinggal diulang.
 */
const jsonAsli = cdp.json.bind(cdp);
const cdpAman = async (expr) => {
  try {
    return await jsonAsli(expr);
  } catch (e) {
    console.log(
      `     BERHENTI: evaluasi halaman gagal - ${String(e.message || e).split('\n')[0]}\n` +
        '     Halaman kemungkinan sedang di-reload Vite (HMR: banyak lane menulis berkas). Ulangi uji ini.',
    );
    await cdp.close();
    process.exit(3);
  }
};

/*
 * Jembatan yang dipakai uji ini harus versi yang SUDAH memakai subset per tugas
 * (`subsetAlat(...).batasTool` + tabel keluarga di `__ZEPHYR_AI__.subsetTugas`).
 * Bundel lama masih ada di halaman yang belum di-reload, dan menguji bundel lama
 * akan melaporkan 23 tool sambil hijau - justru kesalahan yang uji ini ada untuk
 * menangkapnya. Karena itu bundel lama = berhenti, bukan lulus.
 */
const jembatan = await cdpAman(
  `return (() => {
     const zai = window.__ZEPHYR_AI__;
     return JSON.stringify({
       ada: !!(zai && zai.subsetAlat),
       batas: zai && zai.subsetAlat ? (zai.subsetAlat('x').batasTool ?? null) : null,
       subsetTugas: !!(zai && zai.subsetTugas && zai.subsetTugas.keluargaHilang &&
         zai.subsetTugas.hitung && zai.subsetTugas.bawaan),
     });
   })()`,
);
if (!jembatan.ada) {
  console.log('     BERHENTI: bridge subsetAlat belum ada di halaman ini (app perlu di-reload).');
  await cdp.close();
  process.exit(2);
}
if (jembatan.batas === null || !jembatan.subsetTugas) {
  console.log(
    `     BERHENTI: jembatan versi LAMA masih terpasang di halaman (batasTool=${jembatan.batas}, ` +
      `subsetTugas=${jembatan.subsetTugas}) - reload app supaya bundel baru terbaca.`,
  );
  await cdp.close();
  process.exit(2);
}

const TUGAS_TULIS = [
  'Buat 40 berkas artikel di folder artikel: artikel/01.md sampai artikel/40.md.',
  'Tiap artikel minimal 12 baris tentang topik yang berbeda, bahasa Indonesia.',
  'Buat juga index.html yang menautkan keempat puluh artikel itu, gaya.css, app.js, dan README.md.',
  'Tulis semua berkas satu per satu sampai selesai.',
].join(' ');

const TUGAS_RINGAN = 'Baca README.md lalu sebutkan satu baris pertama isinya. Jangan menulis apa pun.';

const TUGAS_WEB = 'Cari di google harga 1 USD ke IDR hari ini, lalu rangkum dari situs web terpercaya.';

const TUGAS_WEB_MURNI = 'Buka https://example.com di browser dan sebutkan judul halamannya.';

async function tanya(teks) {
  return await cdpAman(`return JSON.stringify(window.__ZEPHYR_AI__.subsetAlat(${JSON.stringify(teks)}))`);
}

const penuh = await cdpAman(`return JSON.stringify(window.__ZEPHYR_AI__.subsetAlat('x'))`);
const semuaAktif = penuh.alatAktif;
const adaBrowser = semuaAktif.filter((n) => n.startsWith('browser_') || n === 'web_fetch');

const tulis = await tanya(TUGAS_TULIS);
const ringan = await tanya(TUGAS_RINGAN);
const web = await tanya(TUGAS_WEB);
const webMurni = await tanya(TUGAS_WEB_MURNI);

const buangBrowser = (r) => r.alatKirim.filter((n) => n.startsWith('browser_') || n === 'web_fetch');

console.log(`     aktif: ${semuaAktif.length} tool, ${adaBrowser.length} di antaranya web (${adaBrowser.slice(0, 3).join(', ')}…)`);
console.log(`     tulis  : kirim=${tulis.alatKirim.length} berat=${tulis.berat} web=${tulis.butuhWeb} buang-web=${buangBrowser(tulis).length}`);
console.log(`     ringan : kirim=${ringan.alatKirim.length} berat=${ringan.berat} web=${ringan.butuhWeb} buang-web=${buangBrowser(ringan).length}`);
console.log(`     web    : kirim=${web.alatKirim.length} berat=${web.berat} web=${web.butuhWeb} buang-web=${buangBrowser(web).length}`);
console.log(`     browser-murni: kirim=${webMurni.alatKirim.length} web=${webMurni.butuhWeb}`);

/*
 * Basis acuan (26 tool `TOOL_DIKIRIM_SELALU`) untuk S4.
 *
 * S4 versi lama memakai jembatan TANPA batas (jalur `alatUntukTugas`), jadi ia
 * tidak mungkin gagal karena batas 20 - padahal jalur nyata app sudah dipangkas
 * sejak LAMA-a1. Pada gerbang nyata default (62 aktif) batas 20 memang memangkas
 * 62 -> 20, sehingga "SEMUA tool web ikut" bukan sifat jalur yang dikirim.
 * Yang benar-benar dijamin dan diuji di sini: detektor kelas menyalakan web, dan
 * semua tool baca yang di-ROUTE prompt (`catalog.ts`: "buka URL -> browser_open",
 * "baca halaman -> browser_read/web_fetch") ikut pada basis acuan. Pemangkasan di
 * gerbang nyata tidak disembunyikan - dihitung apa adanya di S17.
 */
const ROUTE_WEB = ['web_search', 'web_fetch', 'browser_open', 'browser_read'];
const acuanWeb = await cdpAman(`return (() => {
  const S = window.__ZEPHYR_AI__.subsetTugas;
  const route = ${JSON.stringify(ROUTE_WEB)};
  const h = S.hitung(${JSON.stringify(TUGAS_WEB)}, S.bawaan, true);
  return JSON.stringify({
    lama: h.alatKirimLama.length,
    kirim: h.alatKirim.length,
    webLama: h.alatKirimLama.filter((n) => route.includes(n)),
    webIkut: h.alatKirim.filter((n) => route.includes(n)),
  });
})()`);

R.check('S1', tulis.berat === true && tulis.butuhWeb === false,
  `tugas 40+ berkas dinilai BERAT dan tidak butuh web (berat=${tulis.berat}, web=${tulis.butuhWeb})`);
R.check('S2', buangBrowser(tulis).length === 0 && tulis.alatKirim.length < semuaAktif.length,
  `tugas tulis: semua tool web DIBUANG (${buangBrowser(tulis).length} sisa), katalog menyusut ${semuaAktif.length}->${tulis.alatKirim.length}`);
R.check('S3', ringan.berat === false && buangBrowser(ringan).length === 0,
  `tugas ringan tidak dipaksa merancang, tool web tetap dibuang (berat=${ringan.berat})`);
R.check('S4', web.butuhWeb === true && acuanWeb.webIkut.length === acuanWeb.webLama.length && acuanWeb.webIkut.length > 0,
  `tugas riset web: detektor menyalakan web & SEMUA tool baca yang di-route prompt ikut pada basis acuan ` +
    `(${acuanWeb.webIkut.length}/${acuanWeb.webLama.length}: ${acuanWeb.webIkut.join(', ')}); ` +
    `di gerbang nyata ${adaBrowser.length} tool web tersaring jadi ${buangBrowser(web).length} - selisihnya dihitung S17`);
R.check('S5', webMurni.alatKirim.length > 0 && buangBrowser(webMurni).length > 0,
  `tugas murni-browser tidak pernah kehabisan tool (kirim=${webMurni.alatKirim.length})`);

/* ---- Tanpa folder terbuka: tool ber-scope folder tidak boleh ikut ---- */
const TANPA_FOLDER_TOOL = ['list_directory', 'glob', 'grep'];
const tanpaFolder = await cdpAman(
  `return JSON.stringify(window.__ZEPHYR_AI__.subsetAlat(${JSON.stringify(TUGAS_RINGAN)}, false))`,
);
const pakaiFolder = await cdpAman(
  `return JSON.stringify(window.__ZEPHYR_AI__.subsetAlat(${JSON.stringify(TUGAS_RINGAN)}, true))`,
);
const webTanpaFolder = await cdpAman(
  `return JSON.stringify(window.__ZEPHYR_AI__.subsetAlat(${JSON.stringify(TUGAS_WEB)}, false))`,
);
const adaToolFolder = (r) => r.alatKirim.filter((n) => TANPA_FOLDER_TOOL.includes(n));

console.log(
  `     tanpa-folder: kirim=${tanpaFolder.alatKirim.length} (folder-tool=${adaToolFolder(tanpaFolder).length}) ` +
    `| pakai-folder: kirim=${pakaiFolder.alatKirim.length} (folder-tool=${adaToolFolder(pakaiFolder).length})`,
);

R.check('S8', adaToolFolder(tanpaFolder).length === 0 && adaToolFolder(pakaiFolder).length === TANPA_FOLDER_TOOL.length,
  `tanpa folder, ${TANPA_FOLDER_TOOL.join('/')} DIBUANG (${adaToolFolder(tanpaFolder).length} sisa); dengan folder ketiganya ada ` +
    `(${adaToolFolder(pakaiFolder).length}/${TANPA_FOLDER_TOOL.length})`);
R.check('S9', webTanpaFolder.alatKirim.length > 0 && adaToolFolder(webTanpaFolder).length === 0,
  `tugas web tanpa folder tetap punya tool (kirim=${webTanpaFolder.alatKirim.length}) dan tanpa tool folder`);

/* S6/S7 memeriksa gerbang rencana pada keadaan BER-FOLDER: dengan folder
   terbuka, langkah pertama tugas berat boleh memuat alat baca folder. Keadaan
   tanpa folder diperiksa terpisah di S10 - di sana tiga alat folder itu memang
   tidak ada, dan gerbangnya harus tetap masuk akal. */
const tulisFolder = await cdpAman(
  `return JSON.stringify(window.__ZEPHYR_AI__.subsetAlat(${JSON.stringify(TUGAS_TULIS)}, true))`,
);
const tulisTanpa = await cdpAman(
  `return JSON.stringify(window.__ZEPHYR_AI__.subsetAlat(${JSON.stringify(TUGAS_TULIS)}, false))`,
);
const perlu = ['todo_write', 'list_directory', 'glob', 'grep', 'read_file'];
const kurang = perlu.filter((n) => !tulisFolder.rencanaPertama.includes(n));
const terlarang = tulisFolder.rencanaPertama.filter(
  (n) => n === 'write_file' || n === 'bash_run' || n.startsWith('browser_') || n === 'edit',
);
R.check('S6', kurang.length === 0 && terlarang.length === 0,
  `langkah-1 tugas berat (ber-folder) = rencana + baca saja (kurang: ${kurang.join(',') || '-'} / bocor: ${terlarang.join(',') || '-'})`);
R.check('S7', tulisFolder.gerbangSiap === true,
  `gerbang rencana siap menyala (todo_write ada di katalog aktif)`);
R.check('S10', !tulisTanpa.rencanaPertama.some((n) => TANPA_FOLDER_TOOL.includes(n)) &&
    tulisTanpa.rencanaPertama.includes('todo_write') && tulisTanpa.rencanaPertama.includes('read_file') &&
    tulisTanpa.gerbangSiap === true,
  `tanpa folder, gerbang rencana tetap jalan tanpa alat folder (${tulisTanpa.rencanaPertama.join(', ')})`);

/* ------------------------------------------------------------------ *
 * S11..S15 — subset <= 20 tool + SUPERSET KEMAMPUAN, diukur pada
 * jembatan yang sama yang dipakai penguji lain (satu evaluasi halaman,
 * supaya 19 kasus tidak jadi 19 permintaan CDP).
 *
 * 20 di bawah adalah jumlah dari spesifikasi item LAMA-a1 (dan dipin
 * terpisah di cek-subset-tugas.mjs lewat `BATAS_TOOL_TUGAS === 20`),
 * SENGAJA bukan dibaca dari jembatan: kalau jembatan yang berbohong
 * (kirim 23 sambil lapor 20), angka dari jembatan tidak akan menangkapnya.
 * ------------------------------------------------------------------ */
const BATAS_PER_GILIRAN = 20;

const KASUS_JEMBATAN = [
  ['baca', 'Baca src/lib/aiStore.ts, ringkas fungsi penyimpanan pesan', true],
  ['perbaiki+uji', 'Perbaiki bug di src/lib/zephyrTools/builtins.ts lalu jalankan test-nya', true],
  ['tulis-banyak', 'Tulis 20 komponen React baru untuk halaman admin di src/components/admin', true],
  ['web', 'Cari harga tiket pesawat ke Bali di web, lalu buka halaman hasilnya', true],
  ['repo-wide+hapus', 'Rapikan repo: ganti nama folder, hapus berkas build, jalankan build ulang', true],
  ['repo-wide+tulis', 'Rekam regresi di seluruh repo lalu tulis ringkasannya ke docs/laporan.md', true],
  ['tanya(ambigu)', 'lanjut', true],
  ['uji+shell', 'Jalankan npm test di terminal lalu laporkan hasilnya', true],
  ['git', 'Commit perubahan ini ke branch feat/ai-panel dan tunjukkan diff-nya', true],
  ['jadwal', 'Buat jadwal pengingat tiap jam untuk cek status build', true],
  ['memori', 'Ingat preferensi saya: selalu pakai pnpm, jangan npm', true],
  ['panel', 'Buka panel preview lalu ambil screenshot halaman itu', true],
  ['teks kosong', '', true],
  ['APP tulis 40', TUGAS_TULIS, true],
  ['APP ringan', TUGAS_RINGAN, true],
  ['APP web', TUGAS_WEB, true],
  ['APP web-murni', TUGAS_WEB_MURNI, true],
  ['APP ringan tanpa folder', TUGAS_RINGAN, false],
  ['APP web tanpa folder', TUGAS_WEB, false],
  ['APP tulis 40 tanpa folder', TUGAS_TULIS, false],
];

const rapor = await cdpAman(`return (() => {
  const zai = window.__ZEPHYR_AI__;
  const S = zai.subsetTugas;
  const kasus = ${JSON.stringify(KASUS_JEMBATAN)};
  const out = [];
  for (const [label, teks, folder] of kasus) {
    const r = zai.subsetAlat(teks, folder);
    const keluargaKirim = new Set(S.keluargaDaftar(r.alatKirim));
    const dipangkas = r.alatKirimLama.filter((n) => !r.alatKirim.includes(n));
    out.push({
      label,
      folder,
      batas: r.batasTool,
      lama: r.alatKirimLama.length,
      kirim: r.alatKirim.length,
      jumlahOk: r.alatKirim.length <= r.batasTool,
      namaSuperset: r.alatKirim.every((n) => r.alatKirimLama.includes(n)),
      tambahan: r.alatKirim.filter((n) => !r.alatKirimLama.includes(n)),
      hilang: S.keluargaHilang(r.alatKirimLama, r.alatKirim),
      yatim: dipangkas.filter((n) => !S.keluarga(n).some((k) => keluargaKirim.has(k))),
      intiDipangkas: dipangkas.filter((n) => S.inti.includes(n)),
      dipangkasSelaras:
        dipangkas.length === r.dipangkas.length && dipangkas.every((n) => r.dipangkas.includes(n)),
      adaSearch: r.alatKirim.includes('tool_search'),
      adaCall: r.alatKirim.includes('tool_call'),
      diLuarAktif: r.alatKirim.filter((n) => !r.alatAktif.includes(n)),
    });
  }
  return JSON.stringify(out);
})()`);

console.log(`\n     sebelum/sesudah lewat jembatan (batas lapor=${rapor[0].batas}, batas spesifikasi=${BATAS_PER_GILIRAN}):`);
console.log(
  `     ${'kasus'.padEnd(26)}${'folder'.padEnd(8)}${'lama'.padEnd(6)}${'kirim'.padEnd(7)}${'<=batas'.padEnd(9)}` +
    `${'namaSuperset'.padEnd(14)}${'pangkas'.padEnd(8)}tambah`,
);
for (const r of rapor) {
  console.log(
    `     ${r.label.padEnd(26)}${String(r.folder).padEnd(8)}${String(r.lama).padEnd(6)}${String(r.kirim).padEnd(7)}` +
      `${(r.jumlahOk ? 'ya' : 'TIDAK').padEnd(9)}${(r.namaSuperset ? 'ya' : 'tidak').padEnd(14)}` +
      `${String(r.lama - r.kirim).padEnd(8)}${r.tambahan.length}`,
  );
}
const rusak = (f) => rapor.filter(f).map((r) => r.label).join(', ') || '-';
const tambahanTotal = rapor.reduce((n, r) => n + r.tambahan.length, 0);
const namaSupersetYa = rapor.filter((r) => r.namaSuperset).length;

/*
 * S12/S13: jaminan "kemampuan tidak berkurang" diukur pada BASIS ACUAN - 26 tool
 * `TOOL_DIKIRIM_SELALU`, basis yang sama dengan angka audit (17/23/20) dan dengan
 * scripts/cek-subset-tugas.mjs. Alasannya nyata dan bukan pelunakan: gerbang
 * default user terbuka lebar (62 tool aktif), dan pada basis selebar itu jalur
 * nyata memang mengirim jendela <= 20 tool sementara sisanya terjangkau lewat
 * tool_search/tool_call - itu desain `aiStore.ts`, dan superset-nama di basis 62
 * memang tidak mungkin (62 -> 20). Yang WAJIB di basis acuan: tak ada keluarga
 * kemampuan yang hilang dan tak ada tool yang dipangkas tanpa rumah keluarga.
 * Di basis nyata yang tetap dituntut: tool inti utuh + jalur tool_search/tool_call
 * selalu ada (S13/S14), plus angka keluarga yang hanya terjangkau lewat jalur itu
 * dilaporkan apa adanya (S16).
 */
const acuan = await cdpAman(`return (() => {
  const S = window.__ZEPHYR_AI__.subsetTugas;
  const kasus = ${JSON.stringify(KASUS_JEMBATAN.map((k) => [k[0], k[1]]))};
  const out = [];
  for (const [label, teks] of kasus) {
    const h = S.hitung(teks, S.bawaan, true);
    const setKirim = new Set(S.keluargaDaftar(h.alatKirim));
    const dipangkas = h.alatKirimLama.filter((n) => !h.alatKirim.includes(n));
    out.push({
      label,
      lama: h.alatKirimLama.length,
      kirim: h.alatKirim.length,
      hilang: S.keluargaHilang(h.alatKirimLama, h.alatKirim),
      yatim: dipangkas.filter((n) => !S.keluarga(n).some((k) => setKirim.has(k))),
      intiDipangkas: dipangkas.filter((n) => S.inti.includes(n)),
      adaSearch: h.alatKirim.includes('tool_search'),
      adaCall: h.alatKirim.includes('tool_call'),
    });
  }
  return JSON.stringify(out);
})()`);

const bawaan = await cdpAman(`return JSON.stringify(window.__ZEPHYR_AI__.subsetTugas.bawaan.length)`);
console.log(`\n     sebelum/sesudah pada BASIS ACUAN (${bawaan} tool "dikirim selalu", basis angka audit):`);
console.log(
  `     ${'kasus'.padEnd(26)}${'lama'.padEnd(6)}${'kirim'.padEnd(7)}${'<=20'.padEnd(7)}${'keluargaHilang'.padEnd(16)}yatim`,
);
for (const a of acuan) {
  console.log(
    `     ${a.label.padEnd(26)}${String(a.lama).padEnd(6)}${String(a.kirim).padEnd(7)}` +
      `${(a.kirim <= BATAS_PER_GILIRAN ? 'ya' : 'TIDAK').padEnd(7)}${String(a.hilang.length).padEnd(16)}${a.yatim.length}`,
  );
}
const rusakAcuan = (f) => acuan.filter(f).map((a) => a.label).join(', ') || '-';
const tambahanTerjangkau = rapor.reduce(
  (n, r) => n + r.tambahan.length + (r.hilang.length ? r.lama - r.kirim : 0),
  0,
);
const yatimNyata = rapor.reduce((n, r) => n + r.yatim.length, 0);
const keluargaHilangNyata = rapor.reduce((n, r) => n + r.hilang.length, 0);
const keluargaHilangAcuan = acuan.reduce((n, a) => n + a.hilang.length, 0);

R.check('S11', rapor.every((r) => r.kirim <= BATAS_PER_GILIRAN && r.jumlahOk),
  `jembatan mengirim <= ${BATAS_PER_GILIRAN} tool di ${rapor.length} kasus gerbang nyata (maks ${Math.max(...rapor.map((r) => r.kirim))}; ` +
    `batas dilaporkan jembatan=${[...new Set(rapor.map((r) => r.batas))].join('/')}; menembus: ${rusak((r) => r.kirim > BATAS_PER_GILIRAN)})`);
R.check('S12', acuan.every((a) => a.hilang.length === 0),
  `kemampuan hilang 0 di ${acuan.length} kasus basis acuan: keluarga(lama) superset keluarga(kirim) (gagal: ${rusakAcuan((a) => a.hilang.length)})`);
R.check('S13', acuan.every((a) => a.yatim.length === 0 && a.kirim <= BATAS_PER_GILIRAN) &&
    rapor.every((r) => r.intiDipangkas.length === 0),
  `tak ada tool dipangkas TANPA rumah keluarga di basis acuan (yatim: ${rusakAcuan((a) => a.yatim.length)}); ` +
    `tool inti utuh di ${rapor.length} kasus gerbang nyata (dipangkas: ${rusak((r) => r.intiDipangkas.length)})`);
R.check('S14', rapor.every((r) => r.adaSearch && r.adaCall) && acuan.every((a) => a.adaSearch && a.adaCall),
  `tool_search + tool_call ikut di tiap kasus (nyata ${rapor.length} + acuan ${acuan.length}) supaya yang dipangkas tetap terjangkau ` +
    `(gagal: ${rusak((r) => !(r.adaSearch && r.adaCall))})`);
R.check('S15', rapor.every((r) => r.dipangkasSelaras && r.diLuarAktif.length === 0),
  `field dipangkas jembatan = (lama \\ kirim) & tak ada tool di luar daftar aktif (gagal: ${rusak((r) => !(r.dipangkasSelaras && r.diLuarAktif.length === 0))})`);
console.log(
  `     S16 (laporan, bukan gerbang): pada gerbang nyata ${semuaAktif.length} aktif, ${rapor.length} kasus dipangkas jadi <= ${BATAS_PER_GILIRAN} tool ` +
    `(maks ${Math.max(...rapor.map((r) => r.kirim))}); ${tambahanTerjangkau} tool/keluarga di luar jendela itu terjangkau lewat tool_search/tool_call, ` +
    'sesuai desain aiStore.ts - bukan kehilangan, tapi juga bukan klaim "tanpa pemangkasan"',
);
console.log(
  `     S17 (laporan, bukan gerbang - ANGKA INI HARUS DIKETAHUI, bukan disembunyikan): kemampuan yang TIDAK ikut jendela <= ${BATAS_PER_GILIRAN} tool\n` +
    `          - basis acuan ${bawaan} aktif : ${keluargaHilangAcuan} keluarga hilang\n` +
    `          - gerbang nyata ${semuaAktif.length} aktif: ${keluargaHilangNyata} keluarga hilang, ${yatimNyata} tool terjangkau HANYA lewat tool_search/tool_call\n` +
    `          - artinya: "kemampuan tidak berkurang" TERBUKTI pada basis acuan (angka audit) dan TIDAK berlaku harfiah pada gerbang lebar; ` +
    'yang berlaku di gerbang lebar = reachability (S14). Kalau "tanpa pemangkasan di gerbang lebar" dituntut, itu perubahan di src/lib/subsetTugas.ts (bukan berkas lane ini)',
);
console.log(
  `     catatan arah superset NAMA: (lama ⊇ kirim) ${namaSupersetYa}/${rapor.length} kasus gerbang nyata; ` +
    `${rapor.length - namaSupersetYa} kasus lain hanya MENAMBAH ${tambahanTotal} tool yang jalur lama tidak kirim ` +
    '(perluasan, bukan kehilangan - kolom namaSuperset di atas)',
);

await cdp.close();
R.selesai();
