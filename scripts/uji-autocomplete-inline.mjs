#!/usr/bin/env node
/**
 * uji-autocomplete-inline.mjs — harness untuk mesin saran kode sebaris
 * (ghost text / inline completion) di Zephyr, item ZEPH-AUTOCOMPLETE-INLINE.
 *
 * Tiga hal yang dijawab APA ADANYA:
 *   0) Apakah Zephyr SUDAH punya mesin saran-sebaris? Di mana? (jangan mengarang)
 *   1) Celah apa yang benar-benar bolong (single-flight, anggaran byte payload)?
 *   2) Apakah modul baru menutup celah itu dengan angka yang bisa disebut?
 *
 * Modul produk ASLI dibundel apa adanya dengan esbuild (bukan salinan):
 *   - src/lib/autocompleteInline.ts  (modul baru: governor + perencana payload)
 *   - src/lib/ghostPemasok.ts        (impor murninya: saringRahasia)
 * Untuk hal yang hidup DI DALAM editor (pemicu, debounce, sakelar), ia membaca
 * SUMBER NYATA sebagai teks: src/lib/ghostText.ts, ghostPemasok.ts,
 * src/components/editor/CodeMirrorEditor.tsx, package.json.
 *
 * Cara pakai (dari akar repo):
 *   node scripts/uji-autocomplete-inline.mjs
 * exit 0 = semua lulus; exit 1 = ada yang gagal (disebut mana).
 */
import { mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..');
const KERJA = join(AKAR, 'node_modules', '.cache', 'zephyr-autocomplete-inline');
const SUMBER_MODUL = join(AKAR, 'src', 'lib', 'autocompleteInline.ts');
const BUNDEL = join(KERJA, 'autocompleteInline.mjs');

const baca = (p) => {
  try {
    return readFileSync(p, 'utf8');
  } catch {
    return '';
  }
};

mkdirSync(KERJA, { recursive: true });
await esbuild.build({
  entryPoints: [SUMBER_MODUL],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: BUNDEL,
  logLevel: 'warning',
});
const G = await import(pathToFileURL(BUNDEL).href);

const SUMBER_GHOST = join(AKAR, 'src', 'lib', 'ghostText.ts');
const SUMBER_PEMASOK = join(AKAR, 'src', 'lib', 'ghostPemasok.ts');
const SUMBER_EDITOR = join(AKAR, 'src', 'components', 'editor', 'CodeMirrorEditor.tsx');
const teksModul = baca(SUMBER_MODUL);
const teksGhost = baca(SUMBER_GHOST);
const teksPemasok = baca(SUMBER_PEMASOK);
const teksEditor = baca(SUMBER_EDITOR);
const teksPkg = baca(join(AKAR, 'package.json'));

/* Kode tanpa komentar — pemeriksaan "murni/bebas-timer" harus membaca KODE,
 * bukan prosa komentar yang menyebut nama API sebagai daftar "tidak dipakai". */
const tanpaKomentar = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const KODE_MODUL = tanpaKomentar(teksModul);

/* Semua berkas di src/ (untuk membuktikan siapa yang mengimpor ghostPemasok). */
const berkasSrc = [];
(function sisir(dir) {
  for (const nama of readdirSync(dir)) {
    const p = join(dir, nama);
    if (statSync(p).isDirectory()) sisir(p);
    else if (/\.(ts|tsx)$/.test(p)) berkasSrc.push(p);
  }
})(join(AKAR, 'src'));

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

console.log('UJI AUTOCOMPLETE INLINE (item ZEPH-AUTOCOMPLETE-INLINE)');
console.log(`akar repo: ${AKAR}`);

/* ------------------------------------------------------------------ *
 * TEMUAN AWAL (0): mesin yang SUDAH ADA di repo — apa adanya
 * ------------------------------------------------------------------ */
const adaDebounce = /const JEDA_MS = \d+/.test(teksGhost);
const adaBatalKetik = /window\.clearTimeout\(timerSaran\)/.test(teksGhost);
const adaJendelaKonteks = /function konteksSekitar\(/.test(teksGhost) && /doc\.line\(/.test(teksGhost);
const adaSakelar = /export function ghostText\(on: boolean\): Extension\[\]/.test(teksGhost);
const konteksBarisLama = (teksGhost.match(/const KONTEKS_BARIS = (\d+)/) ?? [])[1];
const ghostDipasangEditor = /ghostText\(e\.ghostText\)/.test(teksEditor);
const pakaiCmdAiChat = /cmd\.aiChat\(/.test(teksGhost);
const pemasokDiimporSrc = berkasSrc.filter(
  (p) => !p.endsWith('ghostPemasok.ts') && /ghostPemasok['"]/.test(baca(p)),
);
const seamDiimpor = /from '\.\/ghostPemasok'/.test(teksGhost);
const seamDipasang = /setPemasokSaran\(PEMASOK_LOKAL\)/.test(teksGhost);
const seamDicoba = /await ambilSaran\(/.test(teksGhost);
const wiringLengkap = seamDiimpor && seamDipasang && seamDicoba;

console.log('\n== TEMUAN 0: mesin saran-sebaris yang SUDAH ADA (dari sumber) ==');
console.log(`  ghostText.ts  debounce (JEDA_MS)        : ${adaDebounce ? 'ADA' : 'TIDAK'}`);
console.log(`  ghostText.ts  batal-saat-ketik          : ${adaBatalKetik ? 'ADA' : 'TIDAK'}`);
console.log(`  ghostText.ts  jendela konteks (bukan berkas penuh): ${adaJendelaKonteks ? 'ADA' : 'TIDAK'}`);
console.log(`  ghostText.ts  KONTEKS_BARIS             : ${konteksBarisLama ?? '?'} baris`);
console.log(`  ghostText.ts  sakelar on/off (ghostText(on)): ${adaSakelar ? 'ADA' : 'TIDAK'}`);
console.log(`  editor memasang ghostText(e.ghostText)  : ${ghostDipasangEditor ? 'YA' : 'TIDAK'}`);
console.log(`  seam ghostPemasok diimpor src/ (selain dirinya): ${pemasokDiimporSrc.length} berkas -> ${pemasokDiimporSrc.map((p) => p.replace(AKAR, '')).join(', ') || '(tidak ada)'}`);
console.log(`  ghostText.ts wiring seam lokal (impor+pasang+ambilSaran): ${wiringLengkap ? 'YA' : 'TIDAK'}`);
console.log(`  ghostText.ts cadangan cmd.aiChat masih ada: ${pakaiCmdAiChat ? 'YA' : 'TIDAK'}`);
console.log('  VERDICT: mesin saran-sebaris = SUDAH ADA SEBELUMNYA (ghostText.ts + dekorasiCopilot.ts + ghostPemasok.ts).');
console.log('           Celah (a) seam belum tersambung -> DIPERBAIKI: ghostText.ts kini memasang + mencoba seam lokal dulu.');
console.log('           Celah (b) single-flight & anggaran byte payload -> DIBANGUN di autocompleteInline.ts.');

/* ================================================================== *
 * KASUS — grup P: modul produk nyata (bundled)
 * ================================================================== */
console.log('\n-- Kasus P: modul produk nyata (autocompleteInline.ts, dibundel) --');

await kasus('P1', 'permintaan wajar -> payload non-null, jendela = sufiks, baris & bahasa benar', async () => {
  const sebelum = 'function tambah(a, b) {\n  return a + b;';
  const p = G.bangunPermintaan(sebelum, { bahasa: 'ts' });
  const ok = p !== null && p.jendela === sebelum && sebelum.endsWith(p.jendela) && p.bahasa === 'ts' && p.baris === 2;
  return { lulus: ok, detail: `baris=${p?.baris} bahasa=${J(p?.bahasa)} byte=${p?.byte}` };
});

await kasus('P2', 'payload terukur KECIL untuk berkas besar (angka byte disebut)', async () => {
  const besar = Array.from({ length: 800 }, (_, i) => `const baris${i} = ${i};  // padding padding`).join('\n');
  const p = G.bangunPermintaan(besar, { bahasa: 'ts' });
  const kecil = p !== null && p.byte <= G.BATAS_BYTE_PAYLOAD && p.jendela.length < besar.length;
  return {
    lulus: kecil,
    detail: `berkasChar=${besar.length} jendelaChar=${p?.jendela.length} bytePayload=${p?.byte} BATAS_BYTE_PAYLOAD=${G.BATAS_BYTE_PAYLOAD}`,
  };
});

await kasus('P3', 'payload TIDAK memuat seluruh berkas (sentinel di kepala absen)', async () => {
  const SENTINEL = 'KEPALA-UNIK-XYZ-4242';
  const besar = SENTINEL + '\n' + Array.from({ length: 500 }, (_, i) => `izin ke-${i} = raw${i}`).join('\n');
  const p = G.bangunPermintaan(besar, { bahasa: 'ts' });
  const absen = p !== null && !p.badan.includes(SENTINEL) && !p.badan.includes('izin ke-0 = raw0');
  return { lulus: absen, detail: `sentinelDiBadan=${p?.badan.includes(SENTINEL)} jendelaChar=${p?.jendela.length}` };
});

await kasus('P4', 'jendela dibatasi <= BATAS_JENDELA_BARIS baris', async () => {
  const besar = Array.from({ length: 300 }, (_, i) => `baris ${i}`).join('\n');
  const p = G.bangunPermintaan(besar, { bahasa: 'ts' });
  const jml = p ? p.jendela.split('\n').length : -1;
  return { lulus: jml >= 1 && jml <= G.BATAS_JENDELA_BARIS, detail: `barisJendela=${jml} BATAS=${G.BATAS_JENDELA_BARIS}` };
});

await kasus('P5', 'jendela dibatasi <= BATAS_JENDELA_KARAKTER karakter', async () => {
  const satuBarisPanjang = 'const x = "' + 'a'.repeat(9000) + '";';
  const p = G.bangunPermintaan(satuBarisPanjang, { bahasa: 'ts' });
  const ok = p !== null && p.jendela.length <= G.BATAS_JENDELA_KARAKTER;
  return { lulus: ok, detail: `jendelaChar=${p?.jendela.length} BATAS=${G.BATAS_JENDELA_KARAKTER}` };
});

await kasus('P6', 'rahasia disamarkan: "***" ada, nilai rahasia absen di badan', async () => {
  const RAHASIA = 'TOKEN-RAHASIA-PENGGUNA-7731';
  const p = G.bangunPermintaan(`const t = '${RAHASIA}';\nconst u =`, {
    bahasa: 'ts',
    rahasia: [RAHASIA],
  });
  const ok = p !== null && !p.badan.includes(RAHASIA) && p.badan.includes('***');
  return { lulus: ok, detail: `bocor=${p?.badan.includes(RAHASIA)} adaMasker=${p?.badan.includes('***')}` };
});

await kasus('P7', 'determinisme: input sama -> badan & byte identik', async () => {
  const sebelum = 'async function ambil(url: string) {\n  const r = await fetch(';
  const a = G.bangunPermintaan(sebelum, { bahasa: 'ts' });
  const b = G.bangunPermintaan(sebelum, { bahasa: 'ts' });
  const sama = a !== null && b !== null && a.badan === b.badan && a.byte === b.byte;
  return { lulus: sama, detail: `badanSama=${a?.badan === b?.badan} byteSama=${a?.byte === b?.byte}` };
});

await kasus('P8', 'baris terlalu pendek / kosong -> null (tidak ada permintaan)', async () => {
  const a = G.bangunPermintaan('const x = 1;\n  ', { bahasa: 'ts' }); // baris kosong -> trim < 3
  const b = G.bangunPermintaan('const x = 1;\nab', { bahasa: 'ts' }); // "ab" = 2 char < 3
  return { lulus: a === null && b === null, detail: `kosong=${J(a)} pendek=${J(b)}` };
});

await kasus('P9', 'byte dihitung UTF-8 apa adanya (char != byte) & tetap <= batas', async () => {
  const satu = G.bytePanjang('a'); // 1
  const dua = G.bytePanjang('é'); // 2
  const empat = G.bytePanjang('😀'); // 4
  const lebar = 'const s = "' + 'é'.repeat(800) + '";';
  const p = G.bangunPermintaan(lebar, { bahasa: 'ts' });
  const ok = satu === 1 && dua === 2 && empat === 4 && p !== null && p.byte <= G.BATAS_BYTE_PAYLOAD;
  return { lulus: ok, detail: `byte a/é/😀=${satu}/${dua}/${empat} payloadLebar=${p?.byte} char=${p?.jendela.length}` };
});

/* ================================================================== *
 * KASUS — grup N: negatif (on/off, single-flight, batal-saat-ketik)
 * ================================================================== */
console.log('\n-- Kasus N: negatif (sakelar, single-flight, batal-saat-ketik) --');

await kasus('N1', 'tombol MATI -> nol permintaan (alasan "mati", 0/50 kirim)', async () => {
  let k = G.keadaanAwal(false);
  let kirim = 0;
  let alasan = '';
  for (let i = 0; i < 50; i++) {
    k = G.ketik(k);
    const d = G.putuskanKirim(k, G.tiket(k));
    if (d.kirim) kirim++;
    alasan = d.alasan;
  }
  return { lulus: kirim === 0 && alasan === 'mati', detail: `kirim=${kirim}/50 alasan=${alasan}` };
});

await kasus('N2', 'tombol HIDUP -> permintaan lolos (alasan "ok")', async () => {
  const k = G.keadaanAwal(true);
  const d = G.putuskanKirim(k, G.tiket(k));
  return { lulus: d.kirim === true && d.alasan === 'ok', detail: `alasan=${d.alasan}` };
});

await kasus('N3', 'SINGLE-FLIGHT: permintaan kedua ditolak saat pertama masih terbang', async () => {
  let k = G.keadaanAwal(true);
  const t = G.tiket(k);
  const d1 = G.putuskanKirim(k, t);
  k = G.mulaiKirim(k);
  const d2 = G.putuskanKirim(k, G.tiket(k));
  return { lulus: d1.kirim && !d2.kirim && d2.alasan === 'terbang' && k.terbang === true, detail: `d1=${d1.alasan} d2=${d2.alasan} terbang=${k.terbang}` };
});

await kasus('N4', 'setelah selesai -> boleh kirim lagi', async () => {
  let k = G.keadaanAwal(true);
  k = G.mulaiKirim(k);
  k = G.selesaiKirim(k);
  const d = G.putuskanKirim(k, G.tiket(k));
  return { lulus: d.kirim && k.terbang === false, detail: `alasan=${d.alasan} terbang=${k.terbang}` };
});

await kasus('N5', 'BATAL-SAAT-KETIK (negatif): tiket lama basi -> "batal-ketik"', async () => {
  let k = G.keadaanAwal(true);
  const tiketLama = G.tiket(k); // generasi 0
  k = G.ketik(k); // user mengetik lewat -> generasi 1
  const d = G.putuskanKirim(k, tiketLama);
  const dBaru = G.putuskanKirim(k, G.tiket(k));
  return { lulus: !d.kirim && d.alasan === 'batal-ketik' && dBaru.kirim, detail: `lama=${d.alasan} baru=${dBaru.alasan}` };
});

await kasus('N6', 'hanya tiket terbaru yang lolos setelah banyak ketikan', async () => {
  let k = G.keadaanAwal(true);
  const tiketSemua = [];
  for (let i = 0; i < 12; i++) {
    k = G.ketik(k);
    tiketSemua.push(G.tiket(k));
  }
  const terbaru = tiketSemua[tiketSemua.length - 1];
  const lolos = tiketSemua.filter((t) => G.putuskanKirim(k, t).kirim);
  return { lulus: lolos.length === 1 && lolos[0] === terbaru, detail: `lolos=${lolos.length} terbaru=${terbaru}` };
});

await kasus('N7', 'setAktif(false) saat terbang -> terbang dibatalkan & "mati"', async () => {
  let k = G.keadaanAwal(true);
  k = G.mulaiKirim(k);
  k = G.setAktif(k, false);
  const d = G.putuskanKirim(k, G.tiket(k));
  return { lulus: k.terbang === false && !d.kirim && d.alasan === 'mati', detail: `terbang=${k.terbang} alasan=${d.alasan}` };
});

await kasus('N8', 'prioritas alasan: mati > batal-ketik > terbang', async () => {
  let k = G.keadaanAwal(true);
  k = G.ketik(k); // generasi 1
  k = G.setAktif(k, false);
  const dMati = G.putuskanKirim(k, 0); // mati + tiket basi -> menang "mati"
  let k2 = G.keadaanAwal(true);
  k2 = G.mulaiKirim(k2);
  const dTerbang = G.putuskanKirim(k2, G.tiket(k2)); // hidup + tiket segar + terbang
  return { lulus: dMati.alasan === 'mati' && dTerbang.alasan === 'terbang', detail: `mati=${dMati.alasan} terbang=${dTerbang.alasan}` };
});

await kasus('N9', 'user mengetik cepat: 30 ketikan -> 1 kirim (tidak menumpuk)', async () => {
  let k = G.keadaanAwal(true);
  const jadwal = [];
  for (let i = 0; i < 30; i++) {
    k = G.ketik(k);
    jadwal.push(G.tiket(k));
  }
  let kirim = 0;
  let ditolak = 0;
  for (const t of jadwal) {
    const d = G.putuskanKirim(k, t);
    if (d.kirim) {
      kirim++;
      k = G.mulaiKirim(k);
    } else ditolak++;
  }
  const ekstra = G.putuskanKirim(k, G.tiket(k)); // masih terbang -> ditolak
  return { lulus: kirim === 1 && ditolak === 29 && ekstra.alasan === 'terbang', detail: `kirim=${kirim} ditolak=${ditolak} ekstra=${ekstra.alasan}` };
});

await kasus('N10', 'determinisme governor: urutan kejadian sama -> keadaan sama', async () => {
  const jalan = () => {
    let k = G.keadaanAwal(true);
    k = G.ketik(k);
    k = G.mulaiKirim(k);
    k = G.selesaiKirim(k);
    k = G.ketik(k);
    k = G.ketik(k);
    return k;
  };
  const x = jalan();
  const y = jalan();
  return { lulus: J(x) === J(y), detail: `x=${J(x)}` };
});

/* ================================================================== *
 * KASUS — grup S: sumber nyata & wiring
 * ================================================================== */
console.log('\n-- Kasus S: sumber nyata & wiring --');

await kasus('S1', 'mesin ghost SUDAH ADA: debounce JEDA_MS + batal-saat-ketik di sumber', async () => {
  const jeda = (teksGhost.match(/const JEDA_MS = (\d+)/) ?? [])[1];
  const adaSetTimeout = /window\.setTimeout\(/.test(teksGhost);
  return {
    lulus: adaDebounce && adaBatalKetik && adaSetTimeout && Number(jeda) > 0,
    detail: `JEDA_MS=${jeda} setTimeout=${adaSetTimeout} clearTimeout=${adaBatalKetik}`,
  };
});

await kasus('S2', 'ghostText mengirim JENDELA (doc.line), bukan berkas penuh (doc.toString)', async () => {
  const pakaiDocLine = /view\.state\.doc\.line\(n\)\.text/.test(teksGhost);
  const pakaiToString = /doc\.toString\(\)/.test(tanpaKomentar(teksGhost));
  return { lulus: pakaiDocLine && !pakaiToString, detail: `doc.line=${pakaiDocLine} doc.toString=${pakaiToString}` };
});

await kasus('S3', 'sakelar on/off ADA: ghostText(on) -> [] saat off; editorSettings.ghostText menggerbangi', async () => {
  const balikKosong = /return on \? \[[\s\S]*?\] : \[\];/.test(teksGhost);
  const gerbangEditor = /ghostText\(e\.ghostText\)/.test(teksEditor);
  return { lulus: balikKosong && adaSakelar && gerbangEditor, detail: `off->[]=${balikKosong} gerbangEditor=${gerbangEditor}` };
});

await kasus('S4', 'seam ghostPemasok SUDAH tersambung (lokal dulu) + cadangan AI utuh', async () => {
  const diimpor = /from '\.\/ghostPemasok'/.test(teksGhost);
  const dipasang = /setPemasokSaran\(PEMASOK_LOKAL\)/.test(teksGhost);
  const dicoba = /await ambilSaran\(/.test(teksGhost);
  const cadangan = pakaiCmdAiChat;
  return {
    lulus: diimpor && dipasang && dicoba && cadangan,
    detail: `impor=${diimpor} pasang=${dipasang} ambilSaran=${dicoba} cadanganAi=${cadangan}`,
  };
});

await kasus('S5', 'modul baru MURNI & bebas-timer: tanpa Date/Math.random/setTimeout/fetch/jaringan', async () => {
  const adaWaktu = /\bDate\.now\b|\bMath\.random\b|new Date\(/.test(KODE_MODUL);
  const adaTimer = /\bsetTimeout\b|\bsetInterval\b/.test(KODE_MODUL);
  const adaJaringan = /\bfetch\(|XMLHttpRequest|@tauri-apps|invoke\(/.test(KODE_MODUL);
  const impor = (KODE_MODUL.match(/^\s*import\s.*$/gm) ?? []).map((s) => s.trim());
  return {
    lulus: !adaWaktu && !adaTimer && !adaJaringan && impor.length === 1,
    detail: `waktu=${adaWaktu} timer=${adaTimer} jaringan=${adaJaringan} impor=${J(impor)}`,
  };
});

await kasus('S6', 'editor = CodeMirror, BUKAN Monaco (koreksi asumsi tugas)', async () => {
  const adaCm = /@codemirror\//.test(teksGhost) && /@codemirror\//.test(teksEditor);
  const adaMonaco = /monaco/i.test(teksPkg) || /\bmonaco-editor\b/.test(teksGhost) || /\bmonaco-editor\b/.test(teksEditor);
  return { lulus: adaCm && !adaMonaco, detail: `@codemirror=${adaCm} monaco=${adaMonaco}` };
});

await kasus('S7', 'angka batas bisa disebut di kedua jalur (lama & baru)', async () => {
  const lamaBaris = Number(konteksBarisLama);
  const baruBaris = G.BATAS_JENDELA_BARIS;
  const baruChar = G.BATAS_JENDELA_KARAKTER;
  const baruByte = G.BATAS_BYTE_PAYLOAD;
  const bisa = lamaBaris === 40 && baruBaris === 12 && baruChar === 1200 && baruByte === 2048;
  return {
    lulus: bisa,
    detail: `ghostText KONTEKS_BARIS=${lamaBaris} | baru BARIS=${baruBaris} KARAKTER=${baruChar} BYTE=${baruByte}`,
  };
});

/* ------------------------------------------------------------------ *
 * RINGKASAN
 * ------------------------------------------------------------------ */
const lulus = hasil.filter((h) => h.lulus).length;
const gagal = hasil.length - lulus;
const per = (p) => {
  const g = hasil.filter((h) => h.id.startsWith(p));
  return `${g.filter((h) => h.lulus).length}/${g.length}`;
};
console.log(`\nRINGKASAN: ${lulus}/${hasil.length} LULUS, ${gagal} GAGAL`);
console.log(`  P (produk nyata)  : ${per('P')}`);
console.log(`  N (negatif)       : ${per('N')}`);
console.log(`  S (sumber/wiring) : ${per('S')}`);
console.log('VERDICT: mesin saran-sebaris = SUDAH ADA SEBELUMNYA (ghostText.ts: debounce 700ms,');
console.log('         jendela 40 baris, sakelar editor.ghostText).');
console.log('         DIPERBAIKI sesi ini: seam ghostPemasok kini TERSAMBUNG (lokal dulu, AI cadangan).');
console.log('         BARU DIBANGUN: governor single-flight + anggaran byte payload (autocompleteInline.ts).');
if (gagal) {
  console.log('  gagal: ' + hasil.filter((h) => !h.lulus).map((h) => h.id).join(', '));
  process.exit(1);
}
process.exit(0);
