#!/usr/bin/env node
/**
 * uji-ghost-pemasok.mjs — harness SEAM penyedia saran inline (item 175).
 *
 * Menguji modul ASLI `src/lib/ghostPemasok.ts` — dibundel apa adanya dengan
 * esbuild (`export const PEMASOK_LOKAL: PemasokSaran = (p) => ...`), bukan
 * salinan: berkas .ts yang sama yang dipakai app. Modul itu murni (tanpa React,
 * tanpa Tauri, tanpa jaringan), jadi bisa dijalankan di Node tanpa app hidup.
 *
 * Yang dijaga (semua diminta tugas 175):
 *   A. saran kosong -> null
 *   B. saran kepanjangan dipotong (batas panjang)
 *   C. konteks yang dibaca dibatasi (karakter + baris) dan rentang digeser balik
 *   D. jalur hidup/mati (`setGhostAktif`) — mati = pemasok TIDAK dipanggil
 *   E. jalur terima/tolak mengembalikan keadaan SESUDAHNYA
 *   F. determinisme: input sama -> hasil sama (2x/3x), tanpa Date.now/Math.random
 *   G. rahasia/kunci API di konteks TIDAK BOLEH muncul di saran
 *   H. modul tidak punya jalur jaringan sama sekali (nol import)
 *
 * Cara pakai (dari akar repo):
 *   node scripts/uji-ghost-pemasok.mjs
 * exit 0 = semua lulus; exit 1 = ada yang gagal (disebut mana).
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..');
const KERJA = join(AKAR, 'node_modules', '.cache', 'zephyr-ghost-175');
const SUMBER = join(AKAR, 'src', 'lib', 'ghostPemasok.ts');
const BUNDEL = join(KERJA, 'ghostPemasok.mjs');

mkdirSync(KERJA, { recursive: true });
await esbuild.build({
  entryPoints: [SUMBER],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: BUNDEL,
  logLevel: 'warning',
});
const G = await import(pathToFileURL(BUNDEL).href);
const teksSumber = readFileSync(SUMBER, 'utf8');

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

/**
 * Sumber tanpa komentar — pemeriksaan E4/H1 harus membaca KODE, bukan
 * komentar yang menyebut nama API (memang sengaja ditulis di kepala berkas
 * sebagai daftar "yang tidak dipakai").
 */
const tanpaKomentar = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const KODE_SUMBER = tanpaKomentar(teksSumber);

/* ------------------------------------------------------------------ *
 * Data uji
 * ------------------------------------------------------------------ */
const KUNCI_SK = 'sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789'; // 48 char
const KUNCI_AWS = 'AKIAIOSFODNN7EXAMPLE';
const KUNCI_GH = `ghp_${'a1B2c3D4e5F6g7H8i9J0kLmNoPqRsTuVwXyZ'}`;

const BARIS_ATAS = 'const namaPengguna = ambilNama(user);';
const SEBELUM_ULANG = `${BARIS_ATAS}\nconst nama`;

const providerTerakhir = { p: null };

/* ------------------------------------------------------------------ *
 * A. Saran kosong -> null
 * ------------------------------------------------------------------ */
await kasus('A1', 'saran kosong -> null (PEMASOK_LOKAL, baris tanpa isi)', async () => {
  G.aturUlangGhost();
  G.setPemasokSaran(G.PEMASOK_LOKAL);
  const a = await G.ambilSaran('', 'ts', {});
  const b = await G.ambilSaran('   \n  ', 'ts', {});
  const c = await G.ambilSaran('const ab', 'ts', {}); // 2 char < PANJANG_MINIMUM
  return { lulus: a === null && b === null && c === null, detail: `''=${J(a)} spasi=${J(b)} pendek=${J(c)}` };
});

await kasus('A2', 'pemasok mengembalikan null/kosong/spasi -> null', async () => {
  const cek = [];
  for (const m of [null, '', '   ', { teks: '' }, { teks: '\n\t' }]) {
    G.setPemasokSaran(() => m);
    cek.push((await G.ambilSaran('const x = 1;', 'ts', {})) === null);
  }
  return { lulus: cek.every(Boolean), detail: `${cek.filter(Boolean).length}/5 bentuk kosong ditolak` };
});

/* ------------------------------------------------------------------ *
 * B. Batas panjang saran
 * ------------------------------------------------------------------ */
await kasus('B1', 'saran panjang dipotong (hard cut, satu token tanpa spasi)', async () => {
  G.aturUlangGhost();
  G.setPemasokSaran(() => 'x'.repeat(300));
  const u = await G.ambilSaran('const a = 1;', 'ts', {});
  return {
    lulus: !!u && u.teks.length === G.BATAS_PANJANG_SARAN && u.sebab === 'pemasok+dipotong',
    detail: `panjang=${u?.teks.length} batas=${G.BATAS_PANJANG_SARAN} sebab=${u?.sebab}`,
  };
});

await kasus('B2', 'saran panjang dipotong di batas spasi, tanpa spasi menggantung', async () => {
  const panjang = Array.from({ length: 40 }, (_, i) => `kata${i}`).join(' ');
  G.setPemasokSaran(() => panjang);
  const u = await G.ambilSaran('const a = 1;', 'ts', {});
  return {
    lulus:
      !!u &&
      u.teks.length <= G.BATAS_PANJANG_SARAN &&
      u.teks.length < panjang.length &&
      u.teks === u.teks.trimEnd() &&
      u.sebab.endsWith('+dipotong'),
    detail: `panjang=${u?.teks.length} <= ${G.BATAS_PANJANG_SARAN}, ekor=${J(u?.teks.slice(-12))}`,
  };
});

/* ------------------------------------------------------------------ *
 * C. Batas konteks yang dibaca + geseran rentang
 * ------------------------------------------------------------------ */
await kasus('C1', 'konteks dibatasi (<=4000 char, <=40 baris) dan berupa ekor', async () => {
  const besar = Array.from({ length: 200 }, (_, i) => `baris-${i}-${'x'.repeat(180)}`).join('\n');
  G.setPemasokSaran((p) => {
    providerTerakhir.p = p;
    return { teks: 'Z', dari: 0, sampai: 1, sebab: 'geser' };
  });
  const u = await G.ambilSaran(besar, 'ts', {});
  const p = providerTerakhir.p;
  const geser = besar.length - p.sebelum.length;
  return {
    lulus:
      p.sebelum.length <= G.BATAS_KONTEKS_KARAKTER &&
      p.sebelum.split('\n').length <= G.BATAS_KONTEKS_BARIS &&
      p.sebelum.length < besar.length &&
      besar.endsWith(p.sebelum) &&
      u.dari === geser &&
      u.sampai === geser + 1,
    detail: `input=${besar.length} char / 200 baris -> dibaca ${p.sebelum.length} char / ${p.sebelum.split('\n').length} baris; rentang ${u.dari}-${u.sampai} (geser ${geser} benar)`,
  };
});

/* ------------------------------------------------------------------ *
 * D. Jalur hidup/mati
 * ------------------------------------------------------------------ */
await kasus('D1', 'mati -> tidak ada saran, pemasok TIDAK dipanggil', async () => {
  G.aturUlangGhost();
  let panggil = 0;
  G.setPemasokSaran(() => {
    panggil++;
    return 'return 42';
  });
  G.setGhostAktif(false);
  const u = await G.ambilSaran('const a = 1;', 'ts', {});
  return { lulus: u === null && panggil === 0, detail: `saran=${J(u)} panggilanPemasok=${panggil}` };
});

await kasus('D2', 'hidup lagi -> saran muncul dan pemasok dipanggil sekali', async () => {
  let panggil = 0;
  G.setPemasokSaran(() => {
    panggil++;
    return 'return 42';
  });
  G.setGhostAktif(true);
  const u = await G.ambilSaran('const a = 1;', 'ts', {});
  return {
    lulus: G.ghostAktif() === true && u?.teks === 'return 42' && panggil === 1,
    detail: `teks=${J(u?.teks)} panggil=${panggil}`,
  };
});

/* ------------------------------------------------------------------ *
 * E. Terima / tolak mengembalikan keadaan sesudahnya
 * ------------------------------------------------------------------ */
await kasus('E1a', 'terima -> teks berubah + keadaan terima tercatat', async () => {
  G.aturUlangGhost();
  G.setPemasokSaran(G.PEMASOK_LOKAL);
  const u = await G.ambilSaran(SEBELUM_ULANG, 'ts', {});
  const k0 = G.pasangSaran(G.keadaanAwal(true), u);
  const h = G.terimaSaran(SEBELUM_ULANG, k0);
  const harap = `${SEBELUM_ULANG}Pengguna = ambilNama(user);`;
  return {
    lulus:
      h.diterapkan &&
      h.teks === harap &&
      h.teks !== SEBELUM_ULANG &&
      h.keadaan.diterima === 1 &&
      h.keadaan.ditolak === 0 &&
      h.keadaan.menunggu === null,
    detail: `sesudah=${J(h.teks)} diterima=${h.keadaan.diterima}`,
  };
});

await kasus('E1b', 'tolak -> teks kembali seperti semula, penolakan tercatat', async () => {
  G.aturUlangGhost();
  G.setPemasokSaran(G.PEMASOK_LOKAL);
  const u = await G.ambilSaran(SEBELUM_ULANG, 'ts', {});
  const k = G.pasangSaran(G.keadaanAwal(true), u);
  const h = G.tolakSaran(SEBELUM_ULANG, k);
  const h2 = G.terimaSaran(SEBELUM_ULANG, h.keadaan); // sesudah tolak: tidak ada yang menunggu
  return {
    lulus:
      h.teks === SEBELUM_ULANG &&
      h.diterapkan === false &&
      h.keadaan.ditolak === 1 &&
      h.keadaan.diterima === 0 &&
      h.keadaan.menunggu === null &&
      h2.diterapkan === false &&
      h2.teks === SEBELUM_ULANG,
    detail: `teks kembali identik=${h.teks === SEBELUM_ULANG}, ditolak=${h.keadaan.ditolak}, terima-sesudah-tolak=${h2.diterapkan}`,
  };
});

await kasus('E1c', 'keadaan mati -> terima/tolak tidak mengubah apa pun', async () => {
  const s = { teks: 'X', dari: 1, sampai: 1, sebab: 'pemasok' };
  const mati = G.pasangSaran(G.keadaanAwal(false), s);
  const ht = G.terimaSaran('const a', mati);
  const hk = G.tolakSaran('const a', mati);
  return {
    lulus:
      ht.diterapkan === false &&
      ht.teks === 'const a' &&
      ht.keadaan.diterima === 0 &&
      hk.keadaan.ditolak === 0 &&
      hk.teks === 'const a',
    detail: 'aktif=false: terima & tolak keduanya no-op',
  };
});

/* ------------------------------------------------------------------ *
 * E2. Determinisme (2x/3x) + tanpa sumber non-determinisme
 * ------------------------------------------------------------------ */
await kasus('E2', 'input sama -> hasil sama (PEMASOK_LOKAL, 3x)', async () => {
  G.aturUlangGhost();
  G.setPemasokSaran(G.PEMASOK_LOKAL);
  const a = await G.ambilSaran(SEBELUM_ULANG, 'ts', {});
  const b = await G.ambilSaran(SEBELUM_ULANG, 'ts', {});
  const c = await G.ambilSaran(SEBELUM_ULANG, 'ts', {});
  return { lulus: J(a) === J(b) && J(b) === J(c), detail: J(a) };
});

await kasus('E3', 'input sama -> hasil sama (pemasok async tetap, 2x)', async () => {
  G.setPemasokSaran(async () => 'lanjutan tetap');
  const a = await G.ambilSaran('const a = 1;', 'ts', {});
  const b = await G.ambilSaran('const a = 1;', 'ts', {});
  return { lulus: J(a) === J(b) && a.teks === 'lanjutan tetap', detail: J(a) };
});

await kasus('E4', 'non-determinisme tidak ada: KODE (tanpa komentar) tanpa Date.now/Math.random/perf', () => {
  const terlarang = ['Date.now', 'Math.random', 'performance.now', 'new Date'];
  const ketemu = terlarang.filter((t) => KODE_SUMBER.includes(t));
  return {
    lulus: ketemu.length === 0,
    detail: ketemu.length ? `ketemu: ${ketemu.join(', ')}` : 'bersih (0 sumber waktu/acak di kode)',
  };
});

/* ------------------------------------------------------------------ *
 * F. Rahasia tidak boleh muncul di saran
 * ------------------------------------------------------------------ */
await kasus('F1', 'kunci API mirip milik OpenAI di konteks tidak muncul di saran', async () => {
  G.aturUlangGhost();
  const sebelum = `const u = ambil();\nconst API_KEY = "${KUNCI_SK}";\nconst x = 1;`;
  // Pemasok "echo": mengulang baris terakhir konteks apa adanya (bug wajar).
  G.setPemasokSaran((p) => ({ teks: p.sebelum.split('\n').filter(Boolean).slice(-2).join('\n'), sebab: 'echo' }));
  const u = await G.ambilSaran(sebelum, 'ts', { rahasia: [KUNCI_SK] });
  const bocor = !!u && u.teks.includes(KUNCI_SK);
  return {
    lulus: !!u && !bocor && u.teks.includes(G.PENANDA_RAHASIA),
    detail: `saran=${J(u?.teks)} bocor=${bocor}`,
  };
});

await kasus('F2', 'pola kunci (AWS/GitHub/apiKey=) disaring walau tak terdaftar di kunci.rahasia', async () => {
  const sebelum = `const a = "${KUNCI_AWS}";\nconst b = '${KUNCI_GH}';\nconst c = { apiKey: "rahasiaPanjang1234567890" };`;
  G.setPemasokSaran((p) => ({ teks: p.sebelum, sebab: 'echo-seluruh-konteks' }));
  const u = await G.ambilSaran(sebelum, 'ts', {});
  const bocor = !!u && [KUNCI_AWS, KUNCI_GH, 'rahasiaPanjang1234567890'].filter((k) => u.teks.includes(k));
  return {
    lulus: !!u && bocor.length === 0 && u.teks.includes(G.PENANDA_RAHASIA),
    detail: `bocor=${J(bocor)} saran=${J(u?.teks.slice(0, 90))}...`,
  };
});

await kasus('F3', 'rahasia eksplisit multi-nilai + rahasia pendek (<4 char) tidak menghapus saran', async () => {
  const R1 = 'ZephyrRahasiaSangat1234';
  const sebelum = `const t = "${R1}";\nconst s = "ZephyrRahasiaSangat1234";`;
  G.setPemasokSaran((p) => p.sebelum);
  const u = await G.ambilSaran(sebelum, 'ts', { rahasia: [R1, 'a', ''] });
  const u2 = await (async () => {
    G.setPemasokSaran((p) => p);
    return G.ambilSaran(sebelum, 'ts', { rahasia: [R1] });
  })();
  return {
    lulus: !!u && !u.teks.includes(R1) && u2 === null,
    detail: `dua kemunculan disaring=${!!u && !u.teks.includes(R1)}, pemasok nakal (objek) -> null=${u2 === null}`,
  };
});

/* ------------------------------------------------------------------ *
 * G. Tukar-jalan pemasok + pemasok lokal
 * ------------------------------------------------------------------ */
await kasus('G1', 'tukar-jalan: set -> aktif, set(null) -> default mati (tanpa jaringan)', async () => {
  G.aturUlangGhost();
  const defaultAwal = G.pemasokSaran();
  const f = () => 'X';
  G.setPemasokSaran(f);
  const terpasang = G.pemasokSaran() === f;
  const u = await G.ambilSaran('const a = 1;', 'ts', {});
  G.setPemasokSaran(null);
  const u2 = await G.ambilSaran('const a = 1;', 'ts', {});
  return {
    lulus:
      defaultAwal === G.PEMASOK_MATI &&
      terpasang &&
      u?.teks === 'X' &&
      G.pemasokSaran() === G.PEMASOK_MATI &&
      u2 === null,
    detail: `default=PEMASOK_MATI=${defaultAwal === G.PEMASOK_MATI}, sesudah null -> saran=${J(u2)}`,
  };
});

await kasus('G2', 'PEMASOK_LOKAL: ulangi baris atas (hasil persis + label sebab)', async () => {
  G.setPemasokSaran(G.PEMASOK_LOKAL);
  const u = await G.ambilSaran(SEBELUM_ULANG, 'ts', {});
  return {
    lulus: u?.teks === 'Pengguna = ambilNama(user);' && u.sebab === 'ulangi-baris-atas' && u.dari === SEBELUM_ULANG.length && u.sampai === SEBELUM_ULANG.length,
    detail: J(u),
  };
});

await kasus('G3', 'PEMASOK_LOKAL: tutup pasangan ({ -> newline+indent }, ( , [)', async () => {
  const a = await G.ambilSaran('function f() {\n  if (x) {', 'ts', {});
  const b = await G.ambilSaran('const t = parseInt(', 'ts', {});
  const c = await G.ambilSaran('const t = arr[', 'ts', {});
  return {
    lulus: a?.teks === '\n  }' && a.sebab === 'tutup-blok' && b?.teks === ')' && c?.teks === ']',
    detail: `${J(a)} ${J(b?.teks)} ${J(c?.teks)}`,
  };
});

await kasus('G4', 'PEMASOK_LOKAL: badan kata kunci ikut bahasa (ts " {", py ":", lewat path)', async () => {
  const ts = await G.ambilSaran('} else', 'ts', {});
  const py = await G.ambilSaran('  else', 'python', {});
  const dariPath = await G.ambilSaran('try', '', { path: 'skrip.py' });
  return {
    lulus: ts?.teks === ' {' && ts.sebab === 'kata-kunci:ts' && py?.teks === ':' && dariPath?.teks === ':',
    detail: `ts=${J(ts?.teks)} (${ts?.sebab}) py=${J(py?.teks)} py-via-path=${J(dariPath?.teks)}`,
  };
});

/* ------------------------------------------------------------------ *
 * H. Tanpa jaringan + pemasok gagal tidak menjatuhkan editor
 * ------------------------------------------------------------------ */
await kasus('H1', 'modul inti tanpa jalur jaringan (nol import di KODE, tanpa fetch/tauri)', () => {
  const terlarang = [
    'fetch(',
    'XMLHttpRequest',
    'WebSocket',
    '@tauri-apps',
    "from './commands'",
    "from './aiStore'",
    "from 'react'",
  ];
  const ketemu = terlarang.filter((t) => KODE_SUMBER.includes(t));
  const impor = KODE_SUMBER.split('\n').filter((l) => /^\s*import\s/.test(l));
  return {
    lulus: ketemu.length === 0 && impor.length === 0,
    detail:
      ketemu.length || impor.length
        ? `ketemu: ${[...ketemu, ...impor].join(' | ')}`
        : 'kode tanpa import, tanpa token jaringan (fetch/XMLHttpRequest/WebSocket/@tauri-apps)',
  };
});

await kasus('H2', 'pemasok melempar/reject -> null (editor tidak jatuh), async tetap jalan', async () => {
  G.aturUlangGhost();
  G.setPemasokSaran(() => {
    throw new Error('boom');
  });
  const a = await G.ambilSaran('const a = 1;', 'ts', {});
  G.setPemasokSaran(async () => {
    throw new Error('boom-async');
  });
  const b = await G.ambilSaran('const a = 1;', 'ts', {});
  G.setPemasokSaran(async () => 'y');
  const c = await G.ambilSaran('const a = 1;', 'ts', {});
  return { lulus: a === null && b === null && c?.teks === 'y', detail: `throw=${J(a)} reject=${J(b)} async-ok=${J(c?.teks)}` };
});

await kasus('H3', 'rentang ganti sebagian kata diterapkan tepat (dari < sampai)', async () => {
  const sebelum = 'const namaX';
  G.setPemasokSaran((p) => ({ teks: 'Pengguna', dari: p.sebelum.length - 1, sampai: p.sebelum.length, sebab: 'ganti-kata' }));
  const u = await G.ambilSaran(sebelum, 'ts', {});
  const k = G.pasangSaran(G.keadaanAwal(true), u);
  const h = G.terimaSaran(sebelum, k);
  return {
    lulus: h.teks === 'const namaPengguna' && u.dari === 10 && u.sampai === 11 && u.sebab === 'ganti-kata',
    detail: `${J(h.teks)} rentang=${u.dari}-${u.sampai}`,
  };
});

/* ------------------------------------------------------------------ *
 * Ringkasan
 * ------------------------------------------------------------------ */
const gagal = hasil.filter((h) => !h.lulus);
console.log(`\n== ${hasil.length - gagal.length}/${hasil.length} lulus ==`);
if (gagal.length) {
  console.log(`GAGAL: ${gagal.map((g) => g.id).join(', ')}`);
  process.exit(1);
}
process.exit(0);
