/**
 * uji-bug-kejam2.mjs — BUKTI bahwa bug "versi kejam" itu NYATA, TANPA aplikasi hidup.
 *
 * Kenapa berkas ini ada: `scripts/uji-bug-kejam.mjs` (yang lama) menguji HAL YANG
 * BERBEDA — ia menyambung ke aplikasi Zephyr lewat CDP (`Cdp.attach(port)`) lalu
 * menyuruh AGEN memperbaiki proyek `D:/Testing/bug-kejam`, dan menilai hasil
 * perbaikan agen (9 pemeriksaan K1..K9). Untuk bisa dijalankan ia BUTUH APP hidup
 * + agen + provider; kalau aplikasinya mati, skrip itu tidak menghasilkan bukti
 * apa pun tentang bugnya sendiri.
 *
 * Berkas ini menjawab pertanyaan yang lebih dasar dan tidak butuh apa pun selain
 * Node: APAKAH BUGNYA BENAR-BENAR ADA? Semua bukti diambil dari kode NYATA di
 * disk (`kasir.js`, `laporan.js`, `data/keranjang.json`) yang dijalankan sendiri
 * oleh harness ini - bukan dari salinan, bukan dari klaim agen.
 *
 *   node scripts/uji-bug-kejam2.mjs [akar-proyek]     (default D:/Testing/bug-kejam)
 *
 * ARTI WARNA DI SINI DIBALIK DAN ITU DISENGAJA:
 *   * `LULUS` = bukti bahwa bug MASIH ADA (gejala terlihat). Ini hasil yang
 *     diharapkan sekarang.
 *   * `GAGAL` = bug TIDAK BISA dibuktikan lagi pada kondisi saat itu (mis. ada
 *     yang sudah memperbaiki `kasir.js`, atau datanya berubah). Keluar `exit 1`.
 * Jadi angka "== n/m bukti-bug lulus ==" di bawah artinya "n dari m gejala bug
 * berhasil direproduksi", BUKAN "n dari m perbaikan berhasil".
 *
 * Harness ini TIDAK mengubah satu berkas pun di proyek uji (sha256 dibandingkan
 * sebelum/sesudah) dan tidak butuh app, provider, maupun jaringan.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const AKAR = (process.argv[2] ?? 'D:/Testing/bug-kejam').replace(/\\/g, '/');
const berkas = {
  kasir: path.join(AKAR, 'kasir.js'),
  laporan: path.join(AKAR, 'laporan.js'),
  data: path.join(AKAR, 'data/keranjang.json'),
  keluhan: path.join(AKAR, 'KELUHAN.md'),
};

let lulus = 0;
let total = 0;
const cek = (id, ok, pesan) => {
  total += 1;
  if (ok) lulus += 1;
  console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${id}  ${pesan}`);
};

const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const bacaJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const adaSemua = Object.values(berkas).every((f) => fs.existsSync(f));
if (!adaSemua) {
  console.log(`BERHENTI: proyek uji tidak lengkap di ${AKAR}`);
  console.log(`  ada: ${Object.entries(berkas).map(([k, f]) => `${k}=${fs.existsSync(f)}`).join(' ')}`);
  process.exit(1);
}

console.log(`proyek uji: ${AKAR}`);
const sebelum = Object.fromEntries(Object.entries(berkas).map(([k, f]) => [k, sha(f)]));

/* ── hitungan BENAR, dihitung harness sendiri dari data mentah ───────────────── */
const dataAwal = bacaJson(berkas.data);
const hitunganBenar = dataAwal.reduce((n, it) => {
  const bruto = it.harga * it.qty;
  const potongan = it.diskon ? Math.round((bruto * Number(it.diskon_persen ?? 10)) / 100) : 0;
  return n + bruto - potongan;
}, 0);

/* ── jalankan programnya seperti user: `node laporan.js` ────────────────────── */
const jalan = spawnSync(process.execPath, ['laporan.js'], { cwd: AKAR, encoding: 'utf8' });
let keluaran = null;
try {
  keluaran = JSON.parse(String(jalan.stdout || '{}'));
} catch {
  keluaran = null;
}
const totalDilaporkan = keluaran && typeof keluaran.total === 'number' ? keluaran.total : null;

/* ── JEJAK NYATA dari kode nyata: `hitungTotal` dijalankan pada array yang
      dipantau, jadi tiap baca indeks dan tiap `splice` tercatat apa adanya.
      Tidak ada berkas yang diubah dan tidak ada algoritma yang disalin. ─────── */
const { hitungTotal, rincian } = require(berkas.kasir);

function jalankanDenganJejak(arr) {
  const jejak = [];
  const proxy = new Proxy(arr, {
    get(t, p, r) {
      if (p === 'splice') {
        return (mulai, hapus, ...sisa) => {
          const dibuang = t.slice(mulai, mulai + (hapus ?? 1)).map((x) => x.nama);
          const hasil = Array.prototype.splice.call(t, mulai, hapus, ...sisa);
          jejak.push(
            `splice(${mulai},${hapus ?? 1}) membuang [${dibuang.join(', ')}] -> isi sekarang [${t.map((x) => x.nama).join(', ')}] (panjang ${t.length})`,
          );
          return hasil;
        };
      }
      if (typeof p === 'string' && /^\d+$/.test(p)) {
        const isi = t[Number(p)];
        jejak.push(`baca items[${p}] = ${isi ? isi.nama : '(kosong)'}`);
      }
      return Reflect.get(t, p, r);
    },
  });
  const total = hitungTotal(proxy);
  return { total, jejak, sisaNama: arr.map((x) => x.nama) };
}

const salinan1 = bacaJson(berkas.data);
const { total: totalJejak, jejak, sisaNama } = jalankanDenganJejak(salinan1);

/* ── idempotensi pada OBJEK YANG SAMA (bukan dua salinan baru) ──────────────── */
const objekSama = bacaJson(berkas.data);
const panggilan1 = hitungTotal(objekSama);
const panggilan2 = hitungTotal(objekSama);

/* ── mutasi bocor ke pemanggil: panjang array setelah dihitung ─────────────── */
const untukMutasi = bacaJson(berkas.data);
const panjangSebelum = untukMutasi.length;
hitungTotal(untukMutasi);
const panjangSesudah = untukMutasi.length;
const namaSisa = untukMutasi.map((it) => it.nama);

const sumberKasir = fs.readFileSync(berkas.kasir, 'utf8');
const barisSumber = sumberKasir.split('\n');
const noBarisLoop = barisSumber.findIndex((b) => /for\s*\(/.test(b) && /items\.length/.test(b)) + 1;
const noBarisSplice = barisSumber.findIndex((b) => /items\.splice\(/.test(b)) + 1;

/* ═══════════════════════════ BUKTI ═══════════════════════════ */

const tumbler = dataAwal.find((it) => /Tumbler/.test(it.nama));

cek(
  'B1',
  jalan.status === 0 && totalDilaporkan !== null,
  `\`node laporan.js\` jalan tanpa error (exit=${jalan.status}) dan mencetak total=${totalDilaporkan} - gejalanya angka SALAH, bukan crash`,
);
cek(
  'B2',
  totalDilaporkan !== hitunganBenar,
  `total laporan BEDA dari hitungan benar: ${totalDilaporkan} vs ${hitunganBenar} (selisih ${hitunganBenar - totalDilaporkan})`,
);
{
  const hargaTumbler = tumbler.harga * tumbler.qty;
  cek(
    'B3',
    hitunganBenar - totalDilaporkan === hargaTumbler,
    `selisihnya PERSIS harga satu item yang terlewat: "${tumbler.nama}" ${tumbler.harga} x ${tumbler.qty} = ${hargaTumbler}`,
  );
}
{
  const baca = jejak.filter((j) => j.startsWith('baca'));
  const bacaTumbler = baca.filter((j) => /Tumbler/.test(j)).length;
  cek(
    'B4',
    baca.length === dataAwal.length - 1 && bacaTumbler === 0,
    `jejak loop nyata: hanya ${baca.length} kali baca untuk ${dataAwal.length} item; "${tumbler.nama}" dibaca ${bacaTumbler}x - setelah splice ia ada di items[0] tapi loop sudah melompat ke i=1`,
  );
}
cek(
  'B5',
  Array.isArray(keluaran?.rincian) && keluaran.rincian.length === dataAwal.length - 1 && !keluaran.rincian.some((r) => /Kopi/.test(r.nama)),
  `rincian di keluaran laporan HANYA ${keluaran?.rincian?.length ?? '?'} baris (data ${dataAwal.length} item) dan "${dataAwal[0].nama}" HILANG dari struk`,
);
{
  const jumlahRincian = (keluaran?.rincian ?? []).reduce((n, r) => n + r.baris - r.diskon, 0);
  cek(
    'B6',
    jumlahRincian !== keluaran?.total,
    `laporan TIDAK konsisten dengan dirinya sendiri: total=${keluaran?.total} tapi jumlah baris rinciannya=${jumlahRincian} (bukti kedua angka ini dihitung dari keadaan array yang berbeda dalam satu program yang sama)`,
  );
}
cek(
  'B7',
  panggilan1 !== panggilan2 && panggilan1 === totalJejak,
  `dipanggil DUA KALI pada objek yang sama hasilnya berubah: ${panggilan1} lalu ${panggilan2} - fungsi mengubah masukannya sendiri (uji idempotensi lama memakai dua salinan baru, jadi ini lolos tanpa terlihat)`,
);
cek(
  'B8',
  panjangSesudah === panjangSebelum - 1 && !namaSisa.some((n) => /Kopi/.test(n)),
  `array MILIK PEMANGGIL ikut berubah: panjang ${panjangSebelum} -> ${panjangSesudah}, sisa [${namaSisa.join(', ')}] - inilah sebab rincian() kehilangan item berdiskon`,
);
cek(
  'B9',
  noBarisLoop > 0 && noBarisSplice > noBarisLoop,
  `jejak akar di sumber: loop pada kasir.js:${noBarisLoop} memakai indeks, lalu kasir.js:${noBarisSplice} memanggil \`items.splice(i, 1)\` di dalam loop - indeks berikutnya melompati satu item`,
);
cek(
  'B10',
  Object.entries(berkas).every(([k, f]) => sha(f) === sebelum[k]),
  `harness ini TIDAK mengubah apa pun: sha256 kasir.js/laporan.js/data/keranjang.json/KELUHAN.md sama sebelum & sesudah`,
);

console.log('\n--- jejak nyata hitungTotal(data/keranjang.json) ---');
for (const j of jejak) console.log(`     ${j}`);
console.log(`     -> total dihitung = ${totalJejak}; sisa array = [${sisaNama.join(', ')}]`);
console.log('\n--- rincian yang ikut tercetak (dihitung dari array yang sudah dimutasi) ---');
if (Array.isArray(keluaran?.rincian)) for (const r of keluaran.rincian) console.log(`     ${r.nama}: ${r.baris - r.diskon}`);
console.log('\n--- hitungan BENAR (harness, dari data mentah) ---');
for (const it of dataAwal) {
  const bruto = it.harga * it.qty;
  const potongan = it.diskon ? Math.round((bruto * Number(it.diskon_persen ?? 10)) / 100) : 0;
  console.log(`     ${it.nama}: ${bruto}${potongan ? ` - ${potongan} diskon` : ''} = ${bruto - potongan}`);
}
console.log(`     TOTAL BENAR = ${hitunganBenar}   (laporan mencetak ${totalDilaporkan}, kurang ${hitunganBenar - (totalDilaporkan ?? 0)})`);

console.log('\n--- langkah repro minimal (tanpa aplikasi, 30 detik) ---');
console.log(`     1. cd ${AKAR}`);
console.log('     2. node laporan.js              # "total" = 365500 padahal hitungan manual 485500');
console.log('     3. node laporan.js | grep -c nama   # rincian cuma 3 baris, "Kopi Arabika 250g" hilang');
console.log('     4. node D:/Zephyr/scripts/uji-bug-kejam2.mjs   # seluruh bukti + jejak loop di atas');
console.log('     catatan: scripts/uji-bug-kejam.mjs (lama) menguji PERBAIKAN oleh agen dan butuh APP hidup (CDP 9223);');
console.log('              berkas ini menguji KEBERADAAN bugnya dan tidak butuh app/provider/jaringan.');

console.log(`\n== ${lulus}/${total} bukti-bug lulus ==`);
if (lulus === total) {
  console.log('BUG TERBUKTI NYATA di ' + AKAR + ' (semua gejala direproduksi tanpa aplikasi hidup).');
} else {
  console.log('BUG TIDAK BISA DIBUKTIKAN LAGI pada kondisi saat ini - kemungkinan kasir.js sudah diperbaiki atau data uji berubah.');
  process.exitCode = 1;
}
