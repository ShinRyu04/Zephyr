#!/usr/bin/env node
/**
 * uji-replace-multi-berkas.mjs — harness penggantian teks lintas banyak berkas
 * (item ZEPH-REPLACE-IN-FILES: `replace_in_files` -> `search_replace`).
 *
 * Tiga tingkat bukti, ditandai jelas per kasus:
 *
 *   P — PRODUK NYATA (dijalankan). Bundel `src/lib/agentGuard.ts` apa adanya
 *       dengan esbuild (modul murni, tanpa React/Tauri), lalu panggil
 *       `periksaTulis`/`periksaBaca` yang SUNGGUH dipakai `builtins.ts`
 *       lewat `jagaTulis`. Ini menguji penjaga berkas rahasia/.git pada kode
 *       asli, bukan salinan.
 *
 *   S — SUMBER NYATA (dibaca sebagai teks, invarian). `src-tauri/src/search.rs`
 *       dan `src/lib/zephyrTools/builtins.ts` dicek langsung: batas 200,
 *       pesan yang menyebut ANGKA, urutan penolakan sebelum loop, jalur galat
 *       per berkas. Mesin `ganti_lintas_berkas` (Rust) TIDAK bisa dijalankan di
 *       Node — ia butuh `AppState`; uji unit Rust-nya ada di `search.rs`
 *       (`ganti_ditolak_saat_daftar_melebihi_batas`, dst) dan dijalankan lewat
 *       `cargo test` (lihat docs). Yang di sini adalah INVARIAN sumbernya.
 *
 *   M — MODEL ACUAN (dijalankan). Implementasi rujukan murni-JS dari kontrak
 *       yang SAMA (pola kosong ditolak; >200 ditolak menyebut angka; berkas
 *       rahasia tak pernah disentuh; baris kosong berlebih ditandai; tiap
 *       penggantian melaporkan berkas + baris nyata; gagal != sukses). Model
 *       ini memakai `periksaTulis` NYATA dari P untuk langkah penjaganya, jadi
 *       langkah penjaganya bukan tafsiran. Ia BUKAN produk: ia kontrak-acuan
 *       supaya perilaku yang diminta bisa dibuktikan sebelum mesin Rust-nya
 *       diubah.
 *
 * Cara pakai (dari akar repo):
 *   node scripts/uji-replace-multi-berkas.mjs
 * exit 0 = semua lulus; exit 1 = ada yang gagal (disebut mana).
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..');
const KERJA = join(AKAR, 'node_modules', '.cache', 'zephyr-replace-multi');
const SUMBER_GUARD = join(AKAR, 'src', 'lib', 'agentGuard.ts');
const BUNDEL_GUARD = join(KERJA, 'agentGuard.mjs');
const SUMBER_RUST = join(AKAR, 'src-tauri', 'src', 'search.rs');
const SUMBER_TS = join(AKAR, 'src', 'lib', 'zephyrTools', 'builtins.ts');

mkdirSync(KERJA, { recursive: true });
await esbuild.build({
  entryPoints: [SUMBER_GUARD],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: BUNDEL_GUARD,
  logLevel: 'warning',
});
const P = await import(pathToFileURL(BUNDEL_GUARD).href);

const teksRust = readFileSync(SUMBER_RUST, 'utf8');
const teksTs = readFileSync(SUMBER_TS, 'utf8');

/* ------------------------------------------------------------------ *
 * Pelari kasus
 * ------------------------------------------------------------------ */
const hasil = [];
async function kasus(id, nama, fn) {
  let lulus = false;
  let detail = '';
  try {
    const r = await fn();
    lulus = typeof r === 'boolean' ? r : Boolean(r?.lulus);
    detail = typeof r === 'object' && r ? String(r.detail ?? '') : '';
  } catch (e) {
    lulus = false;
    detail = `lempar: ${e instanceof Error ? e.message : String(e)}`;
  }
  hasil.push({ id, nama, lulus });
  console.log(`${lulus ? 'LULUS' : 'GAGAL'} ${id}  ${nama}${detail ? ` - ${detail}` : ''}`);
  return lulus;
}
const J = (x) => JSON.stringify(x);

/* Kode tanpa komentar — invarian S harus membaca KODE, bukan prosa komentar
 * yang memang menyebut angka (mis. catatan "Kenapa 200"). */
const tanpaKomentar = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const KODE_RUST = tanpaKomentar(teksRust);
const KODE_TS = tanpaKomentar(teksTs);

/* ------------------------------------------------------------------ *
 * MODEL ACUAN (M) — kontrak ganti lintas berkas
 * ------------------------------------------------------------------ */
function fsMem(awal) {
  const peta = new Map(Object.entries(awal));
  return {
    peta,
    baca(f) {
      if (!peta.has(f)) throw new Error(`ENOENT ${f}`);
      return peta.get(f);
    },
    tulis(f, s) {
      peta.set(f, s);
    },
  };
}
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Kontrak `ganti_lintas_berkas` dalam JS. Langkah penjaganya memakai
 * `P.periksaTulis` NYATA. Perhatikan: jumlah hanya dihitung untuk berkas yang
 * benar-benar tertulis; gagal tulis -> { jumlah: 0, error }.
 */
function gantiLintasBerkas(berkas, opsi, { maksBerkas = 200, fs } = {}) {
  const pola = String(opsi.pola ?? '');
  if (pola.trim() === '') {
    throw new Error('pola kosong: ditolak sebelum berkas apa pun dibaca');
  }
  if (berkas.length > maksBerkas) {
    throw new Error(
      `penggantian lintas berkas menerima paling banyak ${maksBerkas} berkas, ` +
        `daftar ini ${berkas.length} berkas - persempit glob/root atau pecah jadi beberapa panggilan`,
    );
  }
  const flags = opsi.caseSensitive ? 'g' : 'gi';
  const re = new RegExp(opsi.regex ? pola : escapeRe(pola), flags);
  const out = [];
  for (const f of berkas) {
    const g = P.periksaTulis(f);
    if (!g.ok) {
      out.push({ path: f, jumlah: 0, error: g.alasan, baris: [], barisKosongBerlebih: false });
      continue;
    }
    let lama;
    try {
      lama = fs.baca(f);
    } catch (e) {
      out.push({ path: f, jumlah: 0, error: String(e), baris: [], barisKosongBerlebih: false });
      continue;
    }
    const cocok = [...lama.matchAll(re)];
    if (cocok.length === 0) {
      out.push({ path: f, jumlah: 0, error: '', baris: [], barisKosongBerlebih: false });
      continue;
    }
    const baris = cocok.map((m) => lama.slice(0, m.index).split('\n').length);
    const baru = lama.replace(re, opsi.pengganti);
    const barisKosongBerlebih = /\n[ \t]*\n[ \t]*\n/.test(baru) && !/\n[ \t]*\n[ \t]*\n/.test(lama);
    try {
      if (!opsi.dryRun) fs.tulis(f, baru);
    } catch (e) {
      out.push({ path: f, jumlah: 0, error: String(e), baris: [], barisKosongBerlebih: false });
      continue;
    }
    out.push({ path: f, jumlah: cocok.length, error: '', baris, barisKosongBerlebih });
  }
  return out;
}

const WS = 'D:/Zephyr';

console.log('UJI REPLACE LINTAS BERKAS (item ZEPH-REPLACE-IN-FILES)');
console.log(`akar repo: ${AKAR}\n`);

/* ================================================================== *
 * P — PRODUK NYATA (agentGuard.ts dibundel apa adanya)
 * ================================================================== */
console.log('-- P. Penjaga berkas rahasia/.git (kode ASLI agentGuard.ts) --');

await kasus('P1', '.git/config ditolak tulis (direktori terproteksi)', async () => {
  const r = P.periksaTulis(`${WS}/.git/config`);
  return { lulus: r.ok === false, detail: r.ok ? 'DIIZINKAN (salah)' : r.alasan };
});

await kasus('P2', '.env ditolak tulis (pola berkas rahasia)', async () => {
  const r = P.periksaTulis(`${WS}/.env`);
  return { lulus: r.ok === false, detail: r.ok ? 'DIIZINKAN (salah)' : r.alasan };
});

await kasus('P3', 'src/.env.local di dalam workspace ditolak tulis', async () => {
  const r = P.periksaTulis(`${WS}/src/.env.local`);
  return { lulus: r.ok === false, detail: r.ok ? 'DIIZINKAN (salah)' : r.alasan };
});

await kasus('P4', 'kunci.pem ditolak tulis', async () => {
  const r = P.periksaTulis(`${WS}/certs/kunci.pem`);
  return { lulus: r.ok === false, detail: r.ok ? 'DIIZINKAN (salah)' : r.alasan };
});

await kasus('P5', 'server.key ditolak tulis', async () => {
  const r = P.periksaTulis(`${WS}/config/server.key`);
  return { lulus: r.ok === false, detail: r.ok ? 'DIIZINKAN (salah)' : r.alasan };
});

await kasus('P6', 'kontrol positif: src/a.ts DIIZINKAN tulis', async () => {
  const r = P.periksaTulis(`${WS}/src/a.ts`);
  return { lulus: r.ok === true, detail: r.ok ? 'diizinkan (benar)' : r.alasan };
});

/* ================================================================== *
 * S — SUMBER NYATA (invarian dari kode produk)
 * ================================================================== */
console.log('\n-- S. Invarian sumber produk (search.rs + builtins.ts) --');

const mBatas = KODE_RUST.match(/MAKS_BERKAS_GANTI\s*:\s*usize\s*=\s*(\d+)/);
await kasus('S1', 'search.rs menetapkan MAKS_BERKAS_GANTI = 200', async () => {
  return { lulus: mBatas?.[1] === '200', detail: `nilai=${mBatas?.[1] ?? 'tidak ada'}` };
});

await kasus('S2', 'penolakan >batas menyebut ANGKA keduanya (bukan dipotong diam-diam)', async () => {
  // pesan format memuat batas DAN jumlah yang diminta
  const blok = KODE_RUST.slice(KODE_RUST.indexOf('if files.len() > MAKS_BERKAS_GANTI'));
  const pesan = blok.slice(0, blok.indexOf('}\n    }') + 1);
  const adaBatas = pesan.includes('{MAKS_BERKAS_GANTI}');
  const adaJumlah = /\{\}/.test(pesan) || pesan.includes('files.len()');
  return {
    lulus: adaBatas && adaJumlah,
    detail: `batasInline=${adaBatas} jumlahInline=${adaJumlah}`,
  };
});

await kasus('S3', 'penolakan terjadi SEBELUM loop (tidak ada berkas tersentuh)', async () => {
  const iTolak = KODE_RUST.indexOf('if files.len() > MAKS_BERKAS_GANTI');
  const iLoop = KODE_RUST.indexOf('for f in files {');
  return {
    lulus: iTolak > -1 && iLoop > -1 && iTolak < iLoop,
    detail: `idxTolak=${iTolak} idxLoop=${iLoop}`,
  };
});

await kasus('S4', 'pola kosong ditolak lewat trim().is_empty() sebelum loop', async () => {
  const iEmpty = KODE_RUST.indexOf('opts.query.trim().is_empty()');
  const iLoop = KODE_RUST.indexOf('for f in files {');
  return { lulus: iEmpty > -1 && iEmpty < iLoop, detail: `idxEmpty=${iEmpty}` };
});

await kasus('S5', 'galat per berkas menyetel jumlah: 0 DAN error terisi', async () => {
  const blok = KODE_RUST.slice(KODE_RUST.indexOf('unwrap_or_else(|e| ReplaceHasil'));
  const ok = /jumlah:\s*0/.test(blok) && /error:\s*e\.to_string\(\)/.test(blok);
  return { lulus: ok, detail: ok ? 'jumlah=0 + error=e.to_string()' : blok.slice(0, 80) };
});

await kasus('S6', 'spec replace_in_files menandai pattern & replacement WAJIB', async () => {
  const blok = KODE_TS.slice(KODE_TS.indexOf("name: 'replace_in_files'"));
  const req = blok.slice(blok.indexOf('required:'), blok.indexOf('required:') + 60);
  const ok = req.includes("'pattern'") && req.includes("'replacement'");
  return { lulus: ok, detail: req.replace(/\s+/g, ' ').trim().slice(0, 50) };
});

await kasus('S7', 'temuan: ReplaceHasil TIDAK punya medan baris/lines', async () => {
  const blok = KODE_RUST.slice(KODE_RUST.indexOf('struct ReplaceHasil'));
  const isi = blok.slice(0, blok.indexOf('}'));
  const adaBaris = /\b(baris|lines)\b/.test(isi);
  return {
    lulus: adaBaris === false,
    detail: adaBaris ? 'ADA medan baris' : 'medan: path, jumlah, snapshot, error (tanpa baris)',
  };
});

await kasus('S8', 'pelaporan TS: berubah=jumlah>0, galat=error (gagal tidak masuk sukses)', async () => {
  const blok = KODE_TS.slice(KODE_TS.indexOf("name: 'replace_in_files'"));
  const ok =
    /const berubah = hasil\.filter\(\(h\) => h\.jumlah > 0\)/.test(blok) &&
    /const galat = hasil\.filter\(\(h\) => h\.error\)/.test(blok);
  return { lulus: ok, detail: ok ? 'berubah=jumlah>0 ; galat=error' : 'pola tidak ditemukan' };
});

/* ================================================================== *
 * M — MODEL ACUAN (dijalankan)
 * ================================================================== */
console.log('\n-- M. Model acuan kontrak ganti lintas berkas --');

await kasus('M1', 'pola kosong -> ditolak', async () => {
  let ditolak = false;
  try {
    gantiLintasBerkas([`${WS}/src/a.ts`], { pola: '   ', pengganti: 'x' }, { fs: fsMem({}) });
  } catch {
    ditolak = true;
  }
  return { lulus: ditolak, detail: ditolak ? 'ditolak' : 'TIDAK ditolak' };
});

await kasus('M2', 'daftar 201 berkas -> DITOLAK, pesan menyebut 200 dan 201', async () => {
  const berkas = Array.from({ length: 201 }, (_, i) => `${WS}/src/f${i}.ts`);
  let pesan = '';
  try {
    gantiLintasBerkas(berkas, { pola: 'a', pengganti: 'b' }, { fs: fsMem({}) });
  } catch (e) {
    pesan = String(e.message);
  }
  const ok = pesan.includes('200') && pesan.includes('201') && pesan.includes('berkas');
  return { lulus: ok, detail: ok ? 'menyebut 200 & 201' : pesan.slice(0, 70) };
});

await kasus('M3', 'daftar tepat 200 berkas -> BOLEH (tidak dipotong)', async () => {
  const berkas = Array.from({ length: 200 }, (_, i) => `${WS}/src/f${i}.ts`);
  const fs = fsMem(Object.fromEntries(berkas.map((f) => [f, 'halo\n'])));
  const out = gantiLintasBerkas(berkas, { pola: 'halo', pengganti: 'hai' }, { fs });
  return { lulus: out.length === 200, detail: `hasil=${out.length} berkas` };
});

await kasus('M4', 'berkas di .git/ TIDAK pernah disentuh', async () => {
  const f = `${WS}/.git/config`;
  const fs = fsMem({ [f]: 'halo\n' });
  const out = gantiLintasBerkas([f], { pola: 'halo', pengganti: 'hai' }, { fs });
  return {
    lulus: out[0].jumlah === 0 && fs.peta.get(f) === 'halo\n' && out[0].error !== '',
    detail: `jumlah=${out[0].jumlah} isi=${J(fs.peta.get(f))}`,
  };
});

await kasus('M5', '.env TIDAK pernah disentuh', async () => {
  const f = `${WS}/.env`;
  const fs = fsMem({ [f]: 'halo=1\n' });
  const out = gantiLintasBerkas([f], { pola: 'halo', pengganti: 'hai' }, { fs });
  return { lulus: out[0].jumlah === 0 && fs.peta.get(f) === 'halo=1\n', detail: `jumlah=${out[0].jumlah}` };
});

await kasus('M6', 'berkas .pem TIDAK pernah disentuh', async () => {
  const f = `${WS}/certs/a.pem`;
  const fs = fsMem({ [f]: 'halo\n' });
  const out = gantiLintasBerkas([f], { pola: 'halo', pengganti: 'hai' }, { fs });
  return { lulus: out[0].jumlah === 0 && fs.peta.get(f) === 'halo\n', detail: `jumlah=${out[0].jumlah}` };
});

await kasus('M7', 'berkas .key TIDAK pernah disentuh', async () => {
  const f = `${WS}/certs/b.key`;
  const fs = fsMem({ [f]: 'halo\n' });
  const out = gantiLintasBerkas([f], { pola: 'halo', pengganti: 'hai' }, { fs });
  return { lulus: out[0].jumlah === 0 && fs.peta.get(f) === 'halo\n', detail: `jumlah=${out[0].jumlah}` };
});

await kasus('M8', 'penggantian yang menghasilkan baris kosong berlebih DITANDAI', async () => {
  const f = `${WS}/src/a.ts`;
  const fs = fsMem({ [f]: 'const a = 1;\nconst b = 2;\n' });
  // ganti "const b = 2;" dengan tiga baris kosong -> \n\n\n muncul
  const out = gantiLintasBerkas([f], { pola: 'const b = 2;', pengganti: '\n\n' }, { fs });
  return { lulus: out[0].barisKosongBerlebih === true, detail: `tanda=${out[0].barisKosongBerlebih}` };
});

await kasus('M9', 'tiap penggantian melaporkan berkas + NOMOR BARIS nyata', async () => {
  const f = `${WS}/src/a.ts`;
  const isi = 'baris1 halo\nbaris2\nbaris3 halo halo\n';
  const fs = fsMem({ [f]: isi });
  const out = gantiLintasBerkas([f], { pola: 'halo', pengganti: 'X' }, { fs });
  const baris = out[0].baris.join(',');
  return {
    lulus: out[0].jumlah === 3 && baris === '1,3,3',
    detail: `path=${out[0].path} jumlah=${out[0].jumlah} baris=[${baris}]`,
  };
});

await kasus('M10', 'penulisan GAGAL -> TIDAK dilaporkan sukses (jumlah 0 + error)', async () => {
  const f = `${WS}/src/a.ts`;
  const fs = fsMem({ [f]: 'halo\n' });
  fs.tulis = () => {
    throw new Error('EACCES: ditolak');
  };
  const out = gantiLintasBerkas([f], { pola: 'halo', pengganti: 'hai' }, { fs });
  const berubah = out.filter((h) => h.jumlah > 0);
  const galat = out.filter((h) => h.error);
  return {
    lulus: out[0].jumlah === 0 && galat.length === 1 && berubah.length === 0,
    detail: `jumlah=${out[0].jumlah} galat=${galat.length} berubah=${berubah.length}`,
  };
});

await kasus('M11', 'dryRun melaporkan tanpa mengubah berkas', async () => {
  const f = `${WS}/src/a.ts`;
  const fs = fsMem({ [f]: 'halo\n' });
  const out = gantiLintasBerkas([f], { pola: 'halo', pengganti: 'hai', dryRun: true }, { fs });
  return { lulus: out[0].jumlah === 1 && fs.peta.get(f) === 'halo\n', detail: `jumlah=${out[0].jumlah} isi tetap` };
});

await kasus('M12', 'berkas tanpa kecocokan -> jumlah 0, TANPA galat', async () => {
  const f = `${WS}/src/a.ts`;
  const fs = fsMem({ [f]: 'tidak ada kata itu\n' });
  const out = gantiLintasBerkas([f], { pola: 'halo', pengganti: 'hai' }, { fs });
  return { lulus: out[0].jumlah === 0 && out[0].error === '', detail: `jumlah=0 error='${out[0].error}'` };
});

/* ------------------------------------------------------------------ *
 * RINGKASAN
 * ------------------------------------------------------------------ */
const lulus = hasil.filter((h) => h.lulus).length;
const gagal = hasil.length - lulus;
console.log(`\nRINGKASAN: ${lulus}/${hasil.length} LULUS, ${gagal} GAGAL`);
const perTingkat = { P: 0, S: 0, M: 0 };
for (const h of hasil) if (h.lulus) perTingkat[h.id[0]]++;
console.log(`  P (produk nyata)  : ${perTingkat.P}/6`);
console.log(`  S (sumber nyata)  : ${perTingkat.S}/8`);
console.log(`  M (model acuan)   : ${perTingkat.M}/12`);
if (gagal) {
  console.log('  gagal: ' + hasil.filter((h) => !h.lulus).map((h) => h.id).join(', '));
  process.exit(1);
}
process.exit(0);
