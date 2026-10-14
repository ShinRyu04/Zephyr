/*
 * cek-cakupan-fakta.mjs - gate cakupan \"Zephyr AI tahu 100% soal Zephyr\".
 *
 * ## Apa yang dibuktikan
 *
 * Klaim \"AI-nya tahu segalanya soal Zephyr\" hanya berarti kalau bisa DIUKUR.
 * Skrip ini menghitung sendiri isi sumbernya - daftar berkas, kunci kamus,
 * baris katalog tool, daftar perintah, pintasan, dokumen - lalu memastikan
 * SETIAP-nya benar-benar ikut ke indeks yang dibundel di aplikasi
 * (`src/lib/zephyrIndeks.ts`). Yang baru ditambahkan ke aplikasi tapi tidak
 * masuk indeks akan membuat skrip ini GAGAL, bukan lewat diam-diam.
 *
 * Arah pemeriksaannya dua:
 *   - sumber -> indeks: tidak ada yang tertinggal (cakupan).
 *   - indeks -> sumber: tidak ada kunci hantu yang menunjuk berkas/entri yang
 *     sudah tidak ada (basi).
 *
 * Ditambah tiga hal yang tidak bisa dibuktikan dengan daftar:
 *   1. `--check` generator: indeks memang sinkron dengan sumber saat ini.
 *   2. Versi aplikasi di indeks = versi di tauri.conf.json/package.json, dan
 *      hash sumber terisi. Kalau app lebih baru dari indeks, AI harus bilang
 *      \"basi\" - dan itu hanya mungkin kalau capnya ada.
 *   3. `--live`: modul pencariannya benar-benar bisa dimuat oleh aplikasi yang
 *      sedang berjalan (Vite mentransformasi .ts), lalu beberapa pertanyaan
 *      nyata dijalankan di halaman dan harus mengembalikan hasil.
 *
 * Jalankan:
 *   node scripts/cek-cakupan-fakta.mjs            # statis saja
 *   node scripts/cek-cakupan-fakta.mjs --live     # + cek dari app yang jalan (CDP 9223)
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const akar = join(dirname(fileURLToPath(import.meta.url)), '..');
const baca = (p) => readFileSync(join(akar, p), 'utf8');
const ada = (p) => existsSync(join(akar, p));
const node = process.execPath;
const adaLive = process.argv.includes('--live');

let gagal = 0;
const keluhan = [];
function periksa(nama, benar, detail = '') {
  if (benar) console.log(`  ok    ${nama}`);
  else {
    gagal++;
    console.log(`  GAGAL ${nama}${detail ? ` - ${detail}` : ''}`);
    keluhan.push(nama);
  }
}
const contoh = (arr, n = 4) => arr.slice(0, n).join(', ') + (arr.length > n ? `, ...(+${arr.length - n})` : '');

/* ------------------------------------------------------------------ */
/* 0. sinkron + snapshot indeks                                        */
/* ------------------------------------------------------------------ */

console.log('0. indeks sinkron dengan sumber');
try {
  execFileSync(node, ['scripts/gen-fakta-zephyr.mjs', '--check'], {
    cwd: akar,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  periksa('gen-fakta-zephyr --check', true);
} catch (e) {
  periksa('gen-fakta-zephyr --check', false, String(e.stderr || e.message).trim().split('\n')[0]);
}

/* Indeks dibaca dari ARTEFAK yang benar-benar dibundel (`zephyrIndeks.ts`), bukan
   dari keluaran generator: yang diperiksa adalah apa yang sampai ke aplikasi.
   Parsernya milik skrip ini sendiri - kalau ia dan generator sama-sama salah
   dengan cara yang sama, langkah `--check` di atas masih menangkapnya. */
const ARTEFAK = 'src/lib/zephyrIndeks.ts';
const isiIndeks = baca(ARTEFAK).replace(/\r/g, '');
const entri = [];
for (const baris of isiIndeks.split('\n')) {
  const m = /^\s*\["([a-z]+)","((?:[^"\\]|\\.)*)","((?:[^"\\]|\\.)*)"\],?$/.exec(baris);
  if (m) entri.push([m[1], JSON.parse(`"${m[2]}"`), JSON.parse(`"${m[3]}"`)]);
}
const idx = {};
const teksKat = {};
for (const [kat, kunci, teks] of entri) {
  (idx[kat] ??= []).push(kunci);
  (teksKat[kat] ??= []).push(teks);
}
const KAT = Object.keys(idx).sort();
const setKat = (k) => new Set(idx[k] ?? []);
const capVersi = /FAKTA_VERSI = \{ aplikasi: '([^']+)', hashSumber: '([^']+)' \}/.exec(isiIndeks);
const cap = { versi: capVersi?.[1], hashSumber: capVersi?.[2] };
periksa('artefak indeks terbaca (>= 500 entri)', entri.length > 500, `${entri.length} entri`);
console.log(
  `   indeks: ${entri.length} entri, ${KAT.length} kategori (${KAT.map((k) => `${k}=${idx[k].length}`).join(', ')})`,
);

/* ------------------------------------------------------------------ */
/* 1. peta kode: setiap berkas sumber ada di indeks                    */
/* ------------------------------------------------------------------ */

console.log('\n1. peta kode (berkas -> simbol -> ringkasan)');
const LEWATI = new Set(['node_modules', 'dist', 'target', '.git', 'coverage', '.vite', 'build']);
/* Kedua berkas hasil generate sengaja TIDAK masuk peta kode: keduanya keluaran
   generator ini sendiri, dan memasukkannya membuat hasilnya bergantung pada
   hasil run sebelumnya. */
const HASIL_GENERATE = new Set(['src/lib/zephyrFakta.ts', 'src/lib/zephyrIndeks.ts']);
const berkasSumber = [];
const jelajah = (rel) => {
  for (const n of readdirSync(join(akar, rel), { withFileTypes: true })) {
    if (LEWATI.has(n.name)) continue;
    const r = `${rel}/${n.name}`;
    if (n.isDirectory()) jelajah(r);
    else if (/\.(ts|tsx|rs)$/.test(n.name) && !HASIL_GENERATE.has(r)) berkasSumber.push(r);
  }
};
jelajah('src');
jelajah('src-tauri/src');
berkasSumber.sort();
const kode = setKat('kode');
const kodeHilang = berkasSumber.filter((f) => !kode.has(f));
const kodeHantu = [...kode].filter((f) => !ada(f));
periksa(
  `semua berkas sumber masuk indeks (${berkasSumber.length - kodeHilang.length}/${berkasSumber.length})`,
  kodeHilang.length === 0,
  contoh(kodeHilang),
);
periksa(`tidak ada berkas hantu di indeks (${kode.size} entri)`, kodeHantu.length === 0, contoh(kodeHantu));
/* Keluaran generator tidak boleh memetakan dirinya sendiri: kalau ikut, isinya
   berubah tiap kali digenerate dan sinkronisasi generator tak pernah stabil. */
const kodeTerlarang = [...kode].filter((f) => HASIL_GENERATE.has(f));
periksa('berkas hasil generate tidak masuk peta kode', kodeTerlarang.length === 0, contoh(kodeTerlarang));

/* ------------------------------------------------------------------ */
/* 2. label antarmuka: semua kunci kamus ikut                          */
/* ------------------------------------------------------------------ */

console.log('\n2. label antarmuka (kamus i18n)');
const kunciKamus = new Set();
/* Bentuk kanonik sebuah kunci label. Di berkas kamus, kunci ditulis sebagai
   literal JavaScript, jadi teks yang dibaca user TIDAK selalu sama persis dengan
   byte-nya: 'Alt+\\ x' berisi satu backslash, dan beberapa kunci punya spasi di
   ujung (mis. '  Panel belum tampil ...'). Indeks menyimpan teksnya seperti yang
   tampil di layar dan sudah dipangkas, jadi perbandingan di sini juga harus begitu
   - kalau tidak, kunci yang justru sudah ada akan dilaporkan hilang. */
const kanonik = (s) => String(s).replace(/\\(['"\\])/g, '$1').trim();

for (const berkas of ['src/lib/i18n-src.ts', 'src/lib/i18n-extra.ts']) {
  /* Dua bentuk kepala kamus dipakai repo ini: `const ID: Dict = {` di
     i18n-extra.ts dan `export const EN: Record<string, string> = {` di
     i18n-src.ts. Baris kosong tepat sesudah `{` ikut ditelan dan CRLF
     dinormalkan - tanpa keduanya salah satu berkas terbaca sebagai nol kunci dan
     cakupan label tampak "lengkap" padahal tidak diperiksa sama sekali. */
  const isi = baca(berkas).replace(/\r/g, '');
  const potongan = isi.split(/\n(?:export )?const [A-Za-z_]+: (?:Dict|Record<string, string>) = \{[^\S\n]*\n/);
  for (const blok of potongan.slice(1)) {
    const akhir = blok.indexOf('\n};');
    const badan = akhir >= 0 ? blok.slice(0, akhir) : blok;
    /* Kunci hanya diambil dari awal baris: di dalam nilai ada teks bebas yang
       mengandung kutip dan titik dua, dan memindainya sebagai kunci akan
       mengarang temuan. */
    for (const m of badan.matchAll(/^\s*(?:'([^']+)'|"([^"]+)")\s*:/gm)) kunciKamus.add(kanonik(m[1] ?? m[2]));
  }
}
const label = setKat('label');
const labelHilang = [...kunciKamus].filter((k) => !label.has(k));
periksa(
  `semua kunci kamus jadi label di indeks (${kunciKamus.size - labelHilang.length}/${kunciKamus.size})`,
  kunciKamus.size > 0 && labelHilang.length === 0,
  contoh(labelHilang),
);

/* ------------------------------------------------------------------ */
/* 3. tool, perintah palet, pintasan                                   */
/* ------------------------------------------------------------------ */

console.log('\n3. tool katalog');
const katalog = baca('src/lib/zephyrTools/catalog.ts');
const namaTool = new Set();
for (const m of katalog.matchAll(/^\s*\[\s*'([a-zA-Z0-9_]+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*(?:true|false)/gm))
  namaTool.add(m[1]);
const tool = setKat('tool');
const toolHilang = [...namaTool].filter((t) => !tool.has(t));
const toolHantu = [...tool].filter((t) => !namaTool.has(t));
periksa(`semua tool katalog masuk indeks (${namaTool.size - toolHilang.length}/${namaTool.size})`, toolHilang.length === 0, contoh(toolHilang));
periksa('tidak ada tool hantu di indeks', toolHantu.length === 0, contoh(toolHantu));
/* Setiap tool juga harus punya deskripsi di SEPULUH peta bahasa; kalau tidak,
   panel Tools memakai bahasa Inggris untuk tool itu dan \"tahu 100%\" jadi bohong
   di sembilan bahasa antarmuka. */
const deskripsi = baca('src/lib/zephyrTools/deskripsiTool.ts');
const petaBahas = ['ID', 'EN', 'JA', 'KO', 'ZH', 'ES', 'FR', 'DE', 'PT', 'AR'];
const petaKurang = [];
for (const b of petaBahas) {
  const i = deskripsi.indexOf(`export const DESKRIPSI_TOOL_${b}: Record<string, string> = {`);
  const j = deskripsi.indexOf('\n};', i);
  const badan = deskripsi.slice(i, j);
  for (const t of namaTool) if (!new RegExp(`^\\s*${t}:`, 'm').test(badan)) petaKurang.push(`${b}:${t}`);
}
periksa('deskripsi tool lengkap di 10 bahasa', petaKurang.length === 0, contoh(petaKurang));

console.log('\n4. perintah palet');
const registry = baca('src/lib/commandRegistry.ts').replace(/\r/g, '');
const idPerintah = new Set();
for (const m of registry.matchAll(/\{\s*id:\s*'([^']+)',\s*title:\s*'(?:[^'\\]|\\.)*',\s*group:\s*'([^']+)'/g))
  idPerintah.add(m[1]);
/* Kunci entri `perintah` adalah JUDUL yang tampil di palet; id-nya ada di teks
   entri (`perintah palet . id file.save . grup File`). Id yang dicocokkan karena
   itulah yang dipakai model untuk menyebut perintah dengan tepat. */
const teksPerintah = (teksKat.perintah ?? []).join('\n');
const perintahHilang = [...idPerintah].filter((id) => !teksPerintah.includes(`id ${id}`));
periksa(
  `semua id perintah terdaftar ikut ke indeks (${idPerintah.size - perintahHilang.length}/${idPerintah.size})`,
  perintahHilang.length === 0,
  contoh(perintahHilang),
);

console.log('\n5. pintasan');
const pintasanSrc = baca('src/lib/shortcuts.ts');
const barisPintasan = [...pintasanSrc.matchAll(/\{\s*id:\s*'([^']+)'[^}]*?\}/g)].map((m) => m[0]);
const pintasan = setKat('pintasan');
const pintasanHilang = barisPintasan
  .map((b) => /default:\s*'([^']*)'/.exec(b)?.[1] ?? '')
  .filter((t) => t && !pintasan.has(t));
periksa(
  `semua tombol bawaan ada di indeks (${barisPintasan.length - pintasanHilang.length}/${barisPintasan.length})`,
  barisPintasan.length > 0 && pintasanHilang.length === 0,
  contoh(pintasanHilang),
);

/* ------------------------------------------------------------------ */
/* 6. setelan kritis, ekstensi, dokumen, cap versi                     */
/* ------------------------------------------------------------------ */

console.log('\n6. setelan kritis');
const setelan = setKat('setelan');
/* Sengaja daftar tangan, bukan pantulan settings.rs: yang diuji adalah \"apakah
   kunci yang paling sering ditanyakan user benar-benar bisa dijawab\". Kunci ini
   yang muncul di keluhan nyata (panel hilang, AI di mana, izin subagent). */
const SETELAN_KRITIS = [
  'mcp.enabled',
  'mcp.port',
  'panel.visibleTabs',
  'panel.activeTab',
  'panel.height',
  'subagent.allowWrite',
  'aiPanel',
  'theme',
  'fontSize',
  'autoSave',
  'wordWrap',
  'editor.formatOnSave',
];
/* Kunci setelan disimpan berkelompok (`general.aiPanel`, `editor.wordWrap`).
   Daftar ini memakai nama pendeknya, jadi cocokkan apa adanya ATAU sebagai
   akhiran - kalau tidak, pemeriksaan ini gagal pada nama yang justru benar. */
const kritisHilang = SETELAN_KRITIS.filter(
  (k) => !setelan.has(k) && ![...setelan].some((s) => s.endsWith(`.${k}`)),
);
periksa(`setelan kritis ada (${SETELAN_KRITIS.length - kritisHilang.length}/${SETELAN_KRITIS.length})`, kritisHilang.length === 0, contoh(kritisHilang));

console.log('\n7. ekstensi bawaan');
const extSrc = baca('src/lib/extCatalog.ts');
const idExt = new Set([...extSrc.matchAll(/\bid:\s*'([a-z0-9][a-z0-9._-]+)'/g)].map((m) => m[1]));
const ekstensi = setKat('ekstensi');
const extHilang = [...idExt].filter((e) => !ekstensi.has(e));
const extHantu = [...ekstensi].filter((e) => !extSrc.includes(`'${e}'`));
periksa(`ekstensi bawaan ikut ke indeks (${idExt.size - extHilang.length}/${idExt.size})`, idExt.size > 0 && extHilang.length === 0, contoh(extHilang));
periksa('tidak ada ekstensi hantu di indeks', extHantu.length === 0, contoh(extHantu));

console.log('\n8. dokumen yang dibundel');
/* Daftar ini = "dokumen yang IKUT DIKIRIM bersama aplikasi", dan sengaja ditulis
   di sini terpisah dari generator: kalau generator diam-diam berhenti membundel
   satu dokumen, cakupannya tetap terlihat bolong. Berkas .md lain di repo
   (catatan kerja, laporan build) memang TIDAK dikirim - dilaporkan sebagai info,
   bukan sebagai keluhan. */
const DOKUMEN_DIKIRIM = [
  'README.md',
  'ARCHITECTURE.md',
  'AGENTS.md',
  'CHANGELOG.md',
  'docs/ATURAN-KERJA.md',
  'docs/cara-pasang-plugin.md',
  'docs/rekomendasi-suara-lokal.md',
];
for (const n of readdirSync(akar).filter((f) => /^RELEASE_NOTES.*\.md$/.test(f)).sort())
  DOKUMEN_DIKIRIM.push(n);
const semuaMd = [];
for (const n of readdirSync(akar)) if (n.endsWith('.md')) semuaMd.push(n);
if (ada('docs')) for (const n of readdirSync(join(akar, 'docs'))) if (n.endsWith('.md')) semuaMd.push(`docs/${n}`);
const dokumen = [...setKat('dokumen')];
const berkasDokumen = new Set(dokumen.map((k) => k.split('#')[0]));
const dokHilang = DOKUMEN_DIKIRIM.filter((f) => !berkasDokumen.has(f));
const dokHantu = [...berkasDokumen].filter((f) => !ada(f));
periksa(
  `semua dokumen yang dikirim ada di indeks (${DOKUMEN_DIKIRIM.length - dokHilang.length}/${DOKUMEN_DIKIRIM.length})`,
  dokHilang.length === 0,
  contoh(dokHilang),
);
console.log(
  `   (${semuaMd.length - DOKUMEN_DIKIRIM.length} berkas .md lain memang tidak dikirim, mis. ` +
    `${contoh(semuaMd.filter((f) => !DOKUMEN_DIKIRIM.includes(f)), 2)})`,
);
periksa('tidak ada dokumen hantu di indeks', dokHantu.length === 0, contoh(dokHantu));

console.log('\n9. cap versi + hash sumber');
const versiTauri = JSON.parse(baca('src-tauri/tauri.conf.json')).version;
const versiPkg = JSON.parse(baca('package.json')).version;
periksa(`versi indeks = versi app (${cap.versi})`, cap.versi === versiTauri && cap.versi === versiPkg, `tauri=${versiTauri} pkg=${versiPkg}`);
periksa(`hash sumber terisi (${cap.hashSumber})`, /^[0-9a-f]{8,}$/.test(String(cap.hashSumber)));
periksa('blok inti tetap kecil (< 32 KiB)', baca('src/lib/zephyrFakta.ts').length < 32768, `${baca('src/lib/zephyrFakta.ts').length} byte`);

/* ------------------------------------------------------------------ */
/* 10. live: modul pencarian benar-benar jalan di aplikasi             */
/* ------------------------------------------------------------------ */

if (adaLive) {
  console.log('\n10. live: pencarian dijalankan di dalam aplikasi (CDP 9223)');
  const KUERI = [
    'Ctrl+J',
    'panel.visibleTabs',
    'mcp.port',
    'zephyr_self',
    'subagent.allowWrite',
    'panelStore.ts',
    'CHANGELOG',
    'Settings',
    'ekstensi bawaan',
  ];
  try {
    const { Cdp } = await import('./lib-cdp.mjs');
    const cdp = await Cdp.attach('9223', 'Zephyr');
    const hasil = await cdp.json(`(async () => {
      const m = await import('/src/lib/zephyrCari.ts');
      const kueri = ${JSON.stringify(KUERI)};
      return {
        total: m.jumlahEntri(),
        versi: m.versiFakta(),
        kategori: m.kategoriTersedia(),
        hasil: kueri.map((q) => {
          const h = m.cariFakta(q, { batas: 3 });
          return { q, n: h.length, top: h.length ? h[0].kunci : null, kat: h.length ? h[0].kategori : null };
        }),
      };
    })()`);
    periksa(`modul pencarian dimuat aplikasi (${hasil.total} entri)`, hasil.total === Object.values(idx).reduce((a, b) => a + b.length, 0));
    periksa(`versi yang dibundel = versi app (${hasil.versi?.aplikasi})`, hasil.versi?.aplikasi === versiTauri);
    const kosong = hasil.hasil.filter((h) => h.n === 0).map((h) => h.q);
    for (const h of hasil.hasil) console.log(`       ${h.n ? 'hit ' : 'MISS'} ${h.q} -> ${h.top ?? '(nihil)'} [${h.kat ?? '-'}]`);
    periksa(`semua ${KUERI.length} pertanyaan contoh terjawab`, kosong.length === 0, contoh(kosong));
    await cdp.close();
  } catch (e) {
    periksa('live: app + CDP 9223', false, String(e?.message ?? e).split('\n')[0]);
  }
}

/* ------------------------------------------------------------------ */

console.log(`\n${gagal === 0 ? 'LULUS' : 'GAGAL'} - ${gagal} keluhan`);
if (keluhan.length) console.log(`keluhan: ${keluhan.join(' | ')}`);
process.exit(gagal === 0 ? 0 : 1);
