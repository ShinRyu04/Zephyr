/*
 * cek-indeks-sinkron.mjs - cek sinkron + basi peta kode & indeks fakta Zeph AI.
 *
 * Beda dari scripts/cek-cakupan-fakta.mjs (gate cakupan "AI tahu 100%"):
 * skrip ini menjawab pertanyaan OPERASIONAL tiap kali kode berubah -
 *   a. cap versi/basi indeks cocok dengan app + sumber SEKARANG? (item 160)
 *   b. berapa entri peta kode yang BASI karena berkasnya sudah tidak ada,
 *      barisnya sudah bergeser, atau simbolnya sudah hilang? (item 102)
 *   c. berkas sumber mana yang belum punya entri peta kode?
 *   d. label/tombol/teks UI mana yang belum bisa dicari Zeph? (item 139)
 *
 * Ketiga pemeriksaan angka itu dihitung dari ARTEFAK yang dibundel
 * (src/lib/zephyrIndeks.ts), bukan dari keluaran generator - jadi ia tetap
 * memberi jawaban walau generatornya sendiri sedang rusak.
 *
 * Jalankan:
 *   node scripts/cek-indeks-sinkron.mjs                 # cek artefak repo
 *   node scripts/cek-indeks-sinkron.mjs --indeks <berkas>  # cek berkas lain
 *   node scripts/cek-indeks-sinkron.mjs --ringkas        # hanya ringkasan
 *
 * Exit 0 = sinkron & cakupan penuh. Exit 1 = ada yang basi/bolong (daftarnya
 * dicetak, bukan lewat diam-diam).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const akar = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const argNilai = (nama, bawaan) => {
  const i = argv.indexOf(nama);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : bawaan;
};
const ARG_INDEKS = argNilai('--indeks', 'src/lib/zephyrIndeks.ts');
const RINGKAS = argv.includes('--ringkas');
const berkasIndeks = ARG_INDEKS.includes(':') || ARG_INDEKS.startsWith('/')
  ? ARG_INDEKS
  : join(akar, ARG_INDEKS);

const baca = (p) => readFileSync(join(akar, p), 'utf8');
const ada = (p) => existsSync(join(akar, p));
let keluhan = 0;
const cetak = (...a) => { if (!RINGKAS) console.log(...a); };
const kepala = (n, judul) => cetak(`\n${n}. ${judul}`);
const contoh = (arr, n = 6) => arr.slice(0, n).join(', ') + (arr.length > n ? `, ...(+${arr.length - n})` : '');
const soal = (nama, benar, detail = '') => {
  console.log(`  ${benar ? 'ok   ' : 'BASI '}${nama}${detail ? ` - ${detail}` : ''}`);
  if (!benar) keluhan++;
};

/* ---------------------------------------------------------------- */
/* artefak                                                          */
/* ---------------------------------------------------------------- */

const isiIndeks = readFileSync(berkasIndeks, 'utf8').replace(/\r/g, '');
const entri = [];
for (const baris of isiIndeks.split('\n')) {
  const m = /^\s*\["([a-z]+)","((?:[^"\\]|\\.)*)","((?:[^"\\]|\\.)*)"\],?$/.exec(baris);
  if (m) entri.push([m[1], JSON.parse(`"${m[2]}"`), JSON.parse(`"${m[3]}"`)]);
}
const perKat = {};
for (const [kat, kunci, teks] of entri) (perKat[kat] ??= []).push([kunci, teks]);
const katUrut = Object.keys(perKat).sort();
const cap = /FAKTA_VERSI = \{ aplikasi: '([^']+)', hashSumber: '([^']+)' \}/.exec(isiIndeks);

console.log(`cek-indeks-sinkron - ${relative(akar, berkasIndeks).replace(/\\/g, '/') || berkasIndeks}`);
soal(`artefak terbaca (${entri.length} entri)`, entri.length > 500, `${isiIndeks.length} byte, cap ${cap?.[1]} / ${cap?.[2]}`);

/* ---------------------------------------------------------------- */
/* 1. cap versi + hash sumber (item 160)                            */
/* ---------------------------------------------------------------- */

kepala(1, 'cap versi + hash sumber (deteksi basi)');
let versiTauri = '', versiPkg = '';
try { versiTauri = JSON.parse(baca('src-tauri/tauri.conf.json')).version; } catch (e) { console.log(`  (tauri.conf.json tidak terbaca: ${e.message})`); }
try { versiPkg = JSON.parse(baca('package.json')).version; } catch (e) { console.log(`  (package.json tidak terbaca: ${e.message})`); }
soal(`versi indeks = versi app (${cap?.[1]})`, !!cap?.[1] && cap[1] === versiTauri && cap[1] === versiPkg,
  `tauri=${versiTauri} pkg=${versiPkg}`);
soal(`hash sumber terisi (${cap?.[2]})`, /^[0-9a-f]{8,}$/.test(String(cap?.[2])));

/* Hash sumber SEKARANG: tanya generatornya sendiri (--print-cakupan tidak
   menulis berkas apa pun), supaya skrip ini tidak menyalin parser generator. */
let hashSekarang = '';
let langkahSinkron = '';
try {
  const keluaran = execFileSync(process.execPath, ['scripts/gen-fakta-zephyr.mjs', '--print-cakupan'], {
    cwd: akar, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024,
  });
  hashSekarang = JSON.parse(keluaran.trim().split('\n')[0]).hashSumber ?? '';
} catch (e) {
  console.log(`  (generator --print-cakupan gagal: ${String(e.message).split('\n')[0]})`);
}
try {
  execFileSync(process.execPath, ['scripts/gen-fakta-zephyr.mjs', '--check'], {
    cwd: akar, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  langkahSinkron = 'ok';
} catch (e) {
  langkahSinkron = String(e.stderr ?? e.message).trim().split('\n')[0] || 'gagal';
}
soal('generator --check (berkas hasil generate = sumber)', langkahSinkron === 'ok', langkahSinkron);
if (hashSekarang) {
  soal(`hash indeks = hash sumber sekarang (${cap?.[2]} vs ${hashSekarang})`, cap?.[2] === hashSekarang,
    'indeks dibuat dari sumber yang lebih lama -> Zeph harus bilang "jawaban bisa basi"');
}

/* ---------------------------------------------------------------- */
/* 2. peta kode: basi karena berkas hilang / baris geser / simbol   */
/* ---------------------------------------------------------------- */

kepala(2, 'peta kode: entri yang basi');
const kodeKat = perKat.kode ?? [];
const hilang = [];
const barisBeda = [];
const simbolHilang = [];
const rusak = [];
for (const [rel, teks] of kodeKat) {
  if (!ada(rel)) { hilang.push(rel); continue; }
  const m = /^(\d+) baris · (.*)$/.exec(teks);
  if (!m) { rusak.push(rel); continue; }
  const barisCatat = Number(m[1]);
  const isi = baca(rel).replace(/\r/g, '');
  /* Generator menghitung garis sebagai `split('\n').length`, jadi baris kosong
     terakhir ikut terhitung. Konvensinya harus sama, atau SEMUA entri terlihat
     basi (393 dari 398 pada percobaan pertama). */
  const barisNyata = isi.split('\n').length;
  if (barisNyata !== barisCatat) barisBeda.push(`${rel} (${barisCatat} -> ${barisNyata})`);
  const ekspor = /ekspor: (.*)$/.exec(m[2]);
  if (!ekspor) continue;
  const dipotong = /…\(\+\d+\)$/.test(ekspor[1]);
  const daftar = ekspor[1].replace(/…\(\+\d+\)$/, '').split(', ').map((s) => s.trim()).filter(Boolean);
  const kurang = daftar.filter((s) => !new RegExp(`\\b${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(isi));
  if (kurang.length) simbolHilang.push(`${rel} (${kurang.length}/${daftar.length}${dipotong ? ' dari yang tercatat' : ''}: ${contoh(kurang, 3)})`);
}
soal(`berkas entri peta kode masih ada (${kodeKat.length - hilang.length}/${kodeKat.length})`, hilang.length === 0, contoh(hilang));
soal(`entri bisa diparse (${kodeKat.length - rusak.length}/${kodeKat.length})`, rusak.length === 0, contoh(rusak));
soal(`jumlah baris masih cocok (${kodeKat.length - barisBeda.length}/${kodeKat.length})`, barisBeda.length === 0, contoh(barisBeda));
soal(`simpul yang tercatat masih ada di berkasnya (${kodeKat.length - simbolHilang.length}/${kodeKat.length})`, simbolHilang.length === 0, contoh(simbolHilang));
cetak(`   ringkas basi: berkas hilang ${hilang.length} · baris geser ${barisBeda.length} · simbol hilang ${simbolHilang.length} · entri rusak ${rusak.length}`);

/* berkas sumber yang belum punya entri sama sekali */
const LEWATI = new Set(['node_modules', 'dist', 'target', '.git', 'coverage', '.vite', 'build']);
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
for (const d of ['src', 'src-tauri/src']) if (ada(d)) jelajah(d);
const kunciKode = new Set(kodeKat.map(([k]) => k));
const tanpaEntri = berkasSumber.filter((f) => !kunciKode.has(f)).sort();
soal(`semua berkas sumber punya entri peta kode (${berkasSumber.length - tanpaEntri.length}/${berkasSumber.length})`,
  tanpaEntri.length === 0, contoh(tanpaEntri));

/* ---------------------------------------------------------------- */
/* 3. cakupan label / tombol / teks UI (item 139)                   */
/* ---------------------------------------------------------------- */

kepala(3, 'cakupan label UI (kamus + permukaan komponen)');
const kanonik = (s) => String(s).replace(/\\(['"\\])/g, '$1').replace(/\s+/g, ' ').trim();
const label = new Set((perKat.label ?? []).map(([k]) => k));
/* Kunci map format (`tf('{n} steps done', …)`) masuk indeks sebagai kategori
   `layar` ("label tanpa kamus di layar"), bukan `label` - jadi keduanya harus
   dihitung sebagai "sudah punya entri". */
const kunciLayar = new Set((perKat.layar ?? []).map(([k]) => k));
const teksLabel = new Set((perKat.label ?? []).map(([, t]) => t));
const teksSemua = entri.map(([, , t]) => t).join('\n');

/* 3a. kunci kamus i18n -> harus jadi kunci entri `label` */
const kunciKamus = new Set();
for (const berkas of ['src/lib/i18n.ts', 'src/lib/i18n-src.ts', 'src/lib/i18n-extra.ts']) {
  if (!ada(berkas)) continue;
  const isi = baca(berkas).replace(/\r/g, '');
  const potongan = isi.split(/\n(?:export )?const [A-Za-z_]+: (?:Dict|Record<string, string>) = \{[^\S\n]*\n/);
  for (const blok of potongan.slice(1)) {
    const akhir = blok.indexOf('\n};');
    for (const m of (akhir >= 0 ? blok.slice(0, akhir) : blok).matchAll(/^\s*(?:'([^']+)'|"([^"]+)")\s*:/gm))
      kunciKamus.add(kanonik(m[1] ?? m[2]));
  }
}
const kamusHilang = [...kunciKamus].filter((k) => !label.has(k));
soal(`kunci kamus punya entri label (${kunciKamus.size - kamusHilang.length}/${kunciKamus.size})`, kamusHilang.length === 0, contoh(kamusHilang));

/* 3b. permukaan komponen: label tombol, judul, aria, placeholder, testid, teks */
const berkasKomponen = [];
const telusuriKomponen = (rel) => {
  for (const n of readdirSync(join(akar, rel), { withFileTypes: true })) {
    const r = `${rel}/${n.name}`;
    if (n.isDirectory()) { if (!LEWATI.has(n.name) && n.name !== '__snapshots__') telusuriKomponen(r); }
    else if (/\.tsx$/.test(n.name) && !/\.test\.tsx$/.test(n.name)) berkasKomponen.push(r);
  }
};
if (ada('src/components')) telusuriKomponen('src/components');
const kandidat = new Map(); // teks -> berkas
const tambah = (teks, berkas) => {
  const s = kanonik(teks);
  if (s.length < 2) return;
  if (!kandidat.has(s)) kandidat.set(s, new Set());
  kandidat.get(s).add(berkas);
};
for (const rel of berkasKomponen) {
  const isi = baca(rel);
  for (const m of isi.matchAll(/\b(?:tr|tf|tx)\(\s*'((?:[^'\\]|\\.)*)'/g)) tambah(m[1], rel);
  for (const m of isi.matchAll(/\btitle="([^"]*)"/g)) tambah(m[1], rel);
  for (const m of isi.matchAll(/\baria-label="([^"]*)"/g)) tambah(m[1], rel);
  for (const m of isi.matchAll(/\bplaceholder="([^"]*)"/g)) tambah(m[1], rel);
  for (const m of isi.matchAll(/\bdata-testid="([^"]*)"/g)) tambah(m[1], rel);
  for (const m of isi.matchAll(/>\s*([A-Za-z][^<>{}\n]{2,60}?)\s*</g)) {
    const x = m[1].trim();
    if (x.length < 3 || /^[\w./-]+$/.test(x) || /=>|::|\/\//.test(x)) continue;
    tambah(x, rel);
  }
}
/* String permukaan dianggap terjangkau kalau: jadi kunci `label`/`layar`, muncul
   di teks entri, atau ada di kamus (nanti ditranslate tr()). Teks JSX bertemplat
   (`{n} steps done`) tidak muncul apa adanya - indeks menyimpan segmennya - jadi
   placeholder dibuang dulu sebelum dicocokkan. */
const terjangkau = (teks) =>
  label.has(teks) || kunciLayar.has(teks) || kunciKamus.has(teks) || teksSemua.includes(teks) ||
  (teks.includes('{') && (() => {
    const polos = teks.replace(/\{[^}]*\}/g, ' ').replace(/\s+/g, ' ').trim();
    return polos.length >= 3 && (label.has(polos) || kunciLayar.has(polos) || kunciKamus.has(polos) || teksSemua.includes(polos));
  })());
const tidakAda = [...kandidat.keys()].filter((t) => !terjangkau(t));
/* Berkas komponen yang tidak punya entri permukaan `layar` sama sekali */
const layarTeks = (perKat.layar ?? []).map(([, t]) => t).join('\n');
const komponenTanpaEntri = berkasKomponen.filter((f) => !layarTeks.includes(f));
/* Info, bukan keluhan: komponen yang tidak punya satu pun teks yang dibaca user
   (ikon, pembungkus murni) memang tidak diberi entri permukaan oleh generator. */
cetak(`   entri permukaan per berkas komponen: ${berkasKomponen.length - komponenTanpaEntri.length}/${berkasKomponen.length} ` +
  `(sisanya tanpa teks yang dibaca user, mis. ${contoh(komponenTanpaEntri, 3)})`);
const tampilHilang = tidakAda.slice(0, 6)
  .map((t) => `${JSON.stringify(t)} @ ${[...(kandidat.get(t) ?? [])].slice(0, 2).join('|')}`)
  .join(', ') + (tidakAda.length > 6 ? ` ...(+${tidakAda.length - 6})` : '');
soal(`label/teks permukaan bisa dicari (${kandidat.size - tidakAda.length}/${kandidat.size})`, tidakAda.length === 0, tampilHilang);
cetak(`   kamus ${kunciKamus.size} kunci -> ${label.size} entri label; permukaan ${berkasKomponen.length} berkas -> ${kandidat.size} teks unik`);

/* ---------------------------------------------------------------- */
/* 4. jumlah entri per jenis                                        */
/* ---------------------------------------------------------------- */

kepala(4, `jumlah entri per jenis (total ${entri.length})`);
cetak(`   ${katUrut.map((k) => `${k}=${perKat[k].length}`).join(', ')}`);
cetak(`   label unik=${new Set((perKat.label ?? []).map(([k]) => k)).size}, teks label unik=${teksLabel.size}`);

console.log(`\n${keluhan === 0 ? 'SINKRON' : 'BASI'} - ${keluhan} keluhan`);
process.exit(keluhan === 0 ? 0 : 1);
