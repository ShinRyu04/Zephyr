/*
 * uji-ikon-bersih.mjs — jaga agar `LOGO_URI` tidak menyimpan ikon mati.
 *
 * Kenapa ada skrip ini, bukan sekadar cek ad-hoc saat curiga:
 * `LOGO_URI` di src-tauri/src/ext_lang_icons.rs dicocokkan ke id paket yang
 * benar-benar ditawarkan (`PAKET_BAHASA` di ext_bundled.rs). Baris yang id-nya
 * tidak lagi punya paket tidak merusak apa pun — ia cuma tidak pernah dipakai,
 * jadi sampah yang menumpuk tanpa ada yang bisa menjawab "id ini untuk paket
 * mana?". Temuan 2026-10-14 (`zeph-ikon-ketinggalan-12`) persis soal itu: 12 id
 * tinggal di LOGO_URI padahal paketnya sudah dibuang dari katalog.
 *
 * Skrip ini menuntut tiga hal, semuanya dibaca dari sumber Rust yang nyata
 * (tanpa app, tanpa Tauri):
 *   1. SETIAP id di LOGO_URI punya paket bahasa yang benar-benar ada di
 *      katalog (ext_bundled.rs + ext_bundled_extra.rs). Daftar mati HARUS
 *      kosong; satu saja yang ketinggalan -> gagal.
 *   2. Tidak ada id ganda di LOGO_URI (satu id dua baris = salah satunya mati
 *      sejak ditulis).
 *   3. Jumlahnya tercetak sebelum/sesudah supaya pembersihan bisa dilacak, dan
 *      hasil akhir dicetak `== n/n lulus ==`.
 *
 * Exit != 0 kalau ada satu saja yang gagal, supaya bisa dipakai di gerbang CI.
 *
 * Pakai: node scripts/uji-ikon-bersih.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const AKAR = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const IKON = 'src-tauri/src/ext_lang_icons.rs';
const KATALOG = ['src-tauri/src/ext_bundled.rs', 'src-tauri/src/ext_bundled_extra.rs'];

let lulus = 0;
let diperiksa = 0;
const pesan = [];

function harus(nama, syarat, detail) {
  diperiksa += 1;
  if (syarat) {
    lulus += 1;
    console.log(`  LULUS  ${nama}`);
  } else {
    console.log(`  GAGAL  ${nama}${detail ? ` — ${detail}` : ''}`);
    pesan.push(nama);
  }
}

/* ── Parser ─────────────────────────────────────────────────────────── */

/*
 * Id di LOGO_URI selalu ditulis `("zephyr.lang-<nama>", "data:image/…")`.
 * Ambil tiap token id persis apa adanya, urut sesuai berkas, supaya id ganda
 * bisa terdeteksi (bukan diset dulu lalu hilang).
 */
function idDariIkon(teks) {
  return [...teks.matchAll(/"(\zephyr\.lang-[a-z0-9-]+)"/g)].map((m) => m[1]);
}

/*
 * Id paket bahasa yang benar-benar ada.
 *
 * Dua sumber digabung, keduanya dari berkas Rust yang sama:
 *   a. manifest `"id": "zephyr.lang-…"` di dalam katalog (yang dibaca user),
 *   b. array `PAKET_BAHASA` — daftar yang benar-benar diiterasi index_bundled()
 *      saat mencocokkan LOGO_URI (`ext_bundled.rs` sekitar baris 1553).
 * Digabung supaya parser yang salah baca tidak bisa membuat uji ini lolos
 * palsu (paket > 0 wajib).
 */
function idDariKatalog() {
  const id = new Set();
  for (const berkas of KATALOG) {
    const path = join(AKAR, berkas);
    if (!existsSync(path)) continue;
    const teks = readFileSync(path, 'utf8');
    for (const m of teks.matchAll(/"id"\s*:\s*"(zephyr\.lang-[^"]+)"/g)) id.add(m[1]);
  }
  const pathBundled = join(AKAR, KATALOG[0]);
  if (existsSync(pathBundled)) {
    const teks = readFileSync(pathBundled, 'utf8');
    const awal = teks.indexOf('PAKET_BAHASA:');
    if (awal !== -1) {
      const buka = teks.indexOf('&[', awal);
      const tutup = teks.indexOf('\n];', buka === -1 ? awal : buka);
      if (buka !== -1 && tutup !== -1) {
        const blok = teks.slice(buka, tutup);
        for (const m of blok.matchAll(/zephyr\.lang-[a-z0-9-]+/g)) id.add(m[0]);
      }
    }
  }
  return id;
}

/*
 * Jumlah di HEAD: dipakai sebagai angka "sebelum" yang bisa dilacak. Kalau
 * repo tidak punya riwayat git, angka ini cukup dilewati, bukan digagalkan.
 */
function jumlahIkonHEAD() {
  try {
    const teks = execFileSync('git', ['show', `HEAD:${IKON}`], {
      cwd: AKAR,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return new Set(idDariIkon(teks)).size;
  } catch {
    return null;
  }
}

/* ── Jalan ──────────────────────────────────────────────────────────── */

console.log('== UJI IKON BERSIH (LOGO_URI vs katalog paket bahasa) ==');
console.log('');
console.log(`Akar kerja: ${AKAR}`);
console.log('');

const pathIkon = join(AKAR, IKON);
if (!existsSync(pathIkon)) {
  console.log(`GAGAL - ${IKON} tidak ada`);
  console.log('');
  console.log('== 0/1 lulus ==');
  process.exit(1);
}

const teksIkon = readFileSync(pathIkon, 'utf8');
const daftarIkon = idDariIkon(teksIkon);
const unikIkon = new Set(daftarIkon);
const idKatalog = idDariKatalog();

const jmlHEAD = jumlahIkonHEAD();
const mati = [...unikIkon].filter((id) => !idKatalog.has(id)).sort();
const ganda = [...new Set(daftarIkon.filter((x, i) => daftarIkon.indexOf(x) !== i))].sort();
const sesudah = unikIkon.size - mati.length;

console.log('SEBELUM:');
console.log(`  id di LOGO_URI (HEAD)      : ${jmlHEAD === null ? '(tanpa git)' : jmlHEAD}`);
console.log(`  id di LOGO_URI (worktree)  : ${unikIkon.size}`);
console.log('');
console.log('SESUDAH (setelah id mati dibuang):');
console.log(`  id di LOGO_URI             : ${sesudah}`);
console.log(`  id ikon mati dibuang       : ${mati.length}`);
console.log('');
console.log(`Katalog paket bahasa terbaca : ${idKatalog.size} id`);
console.log('');

harus('katalog paket terbaca (parser tidak kosong)', idKatalog.size > 0, `terbaca ${idKatalog.size}`);
harus('LOGO_URI tidak kosong', unikIkon.size > 0, `terbaca ${unikIkon.size}`);
harus('tidak ada id ganda di LOGO_URI', ganda.length === 0, ganda.join(', ') || undefined);
harus(
  'setiap id LOGO_URI punya paket yang ada (daftar mati kosong)',
  mati.length === 0,
  mati.length ? `mati: ${mati.join(', ')}` : undefined,
);

console.log('');
if (pesan.length) {
  console.log(`GAGAL - ${mati.length} ikon mati / ${ganda.length} id ganda:`);
  for (const id of mati) console.log(`  - ${id}  <- hapus barisnya dari ${IKON}`);
  for (const id of ganda) console.log(`  - ${id}  <- id ganda`);
  console.log('');
}
console.log(`== ${lulus}/${diperiksa} lulus ==`);
process.exit(lulus === diperiksa ? 0 : 1);
