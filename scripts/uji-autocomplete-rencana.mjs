#!/usr/bin/env node
/**
 * uji-autocomplete-rencana.mjs — harness RENCANA penyelesaian kode otomatis di
 * editor (item ZEPH-AUTOCOMPLETE-INLINE).
 *
 * Menguji modul ASLI `src/lib/ghostPemasok.ts` — dibundel apa adanya dengan
 * esbuild (murni: tanpa React, tanpa Tauri, tanpa jaringan), bukan salinan.
 * Untuk hal yang hidup di dalam editor (pemicu, penyambungan), ia membaca
 * SUMBER NYATA sebagai teks: `src/lib/ghostText.ts`, `src/lib/lspCm.ts`,
 * `src/components/editor/CodeMirrorEditor.tsx`.
 *
 * Pertanyaan yang dijawab, apa adanya:
 *   - Apakah penyedia penyelesaian ADA di repo? (jangan mengarang)
 *   - Di mana titik sambung NYATA-nya?
 *   - Apakah usulan bisa membocorkan isi berkas rahasia?
 *   - Apakah batas jumlah/panjang usulan punya angka yang bisa disebut?
 *   - Apakah pemicu berada HANYA di dalam editor (bukan hotkey global)?
 *
 * Cara pakai (dari akar repo):
 *   node scripts/uji-autocomplete-rencana.mjs
 * exit 0 = semua lulus; exit 1 = ada yang gagal (disebut mana).
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..');
const KERJA = join(AKAR, 'node_modules', '.cache', 'zephyr-autocomplete-rencana');
const SUMBER_PEMASOK = join(AKAR, 'src', 'lib', 'ghostPemasok.ts');
const BUNDEL = join(KERJA, 'ghostPemasok.mjs');

const baca = (p) => {
  try {
    return readFileSync(p, 'utf8');
  } catch {
    return '';
  }
};
const SUMBER_GHOSTTEXT = join(AKAR, 'src', 'lib', 'ghostText.ts');
const SUMBER_LSPCM = join(AKAR, 'src', 'lib', 'lspCm.ts');
const SUMBER_EDITOR = join(AKAR, 'src', 'components', 'editor', 'CodeMirrorEditor.tsx');

mkdirSync(KERJA, { recursive: true });
await esbuild.build({
  entryPoints: [SUMBER_PEMASOK],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: BUNDEL,
  logLevel: 'warning',
});
const G = await import(pathToFileURL(BUNDEL).href);

const teksPemasok = baca(SUMBER_PEMASOK);
/* Kode tanpa komentar — pemeriksaan "murni" harus membaca KODE, bukan prosa
 * komentar yang memang menyebut nama API jaringan sebagai daftar "tidak dipakai". */
const tanpaKomentar = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const KODE_PEMASOK = tanpaKomentar(teksPemasok);
const teksGhost = baca(SUMBER_GHOSTTEXT);
const teksLsp = baca(SUMBER_LSPCM);
const teksEditor = baca(SUMBER_EDITOR);

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

console.log('UJI RENCANA AUTOCOMPLETE INLINE (item ZEPH-AUTOCOMPLETE-INLINE)');
console.log(`akar repo: ${AKAR}`);

/* ------------------------------------------------------------------ *
 * TEMUAN AWAL: di mana penyedia penyelesaian berada (apa adanya)
 * ------------------------------------------------------------------ */
const adaCompletionLsp = /export function autocompletionZephyr\b/.test(teksLsp);
const adaSnippet = /export function snippetCompletionSource\b/.test(teksLsp);
const adaPemasokLokal = /export const PEMASOK_LOKAL\b/.test(teksPemasok);
const pemasokDipakaiEditor = /from '\.\/ghostPemasok'/.test(teksGhost);
const pasangLokal = /setPemasokSaran\(PEMASOK_LOKAL\)/.test(teksGhost);
const adaAmbilSaran = /await ambilSaran\(/.test(teksGhost);
console.log('\n== TEMUAN: titik sambung penyelesaian (dari sumber) ==');
console.log(`  lspCm.ts  autocompletionZephyr    : ${adaCompletionLsp ? 'ADA' : 'TIDAK ADA'}`);
console.log(`  lspCm.ts  snippetCompletionSource : ${adaSnippet ? 'ADA' : 'TIDAK ADA'}`);
console.log(`  ghostPemasok.ts PEMASOK_LOKAL     : ${adaPemasokLokal ? 'ADA' : 'TIDAK ADA'}`);
console.log(`  ghostText.ts impor ghostPemasok   : ${pemasokDipakaiEditor ? 'YA' : 'TIDAK'}`);
console.log(`  ghostText.ts setPemasokSaran(LOKAL): ${pasangLokal ? 'YA' : 'TIDAK'}`);
console.log(
  `  ghostText.ts mintaSaran coba seam DULU: ${adaAmbilSaran ? 'YA (lokal dulu, AI cadangan)' : 'BELUM (masih ke cmd.aiChat langsung)'}`,
);

/* ================================================================== *
 * KASUS
 * ================================================================== */
console.log('\n-- Kasus --');

await kasus('A1', 'saran kosong / konteks terlalu pendek -> null', async () => {
  G.aturUlangGhost();
  G.setPemasokSaran(G.PEMASOK_LOKAL);
  const a = await G.ambilSaran('   ', 'ts', {});
  const b = await G.ambilSaran('ab', 'ts', {}); // 2 char < PANJANG_MINIMUM (3)
  const c = await G.ambilSaran('const x', 'ts', {}); // tak ada pola yang dilanjutkan
  return { lulus: a === null && b === null, detail: `spasi=${J(a)} pendek=${J(b)} biasa=${J(c)}` };
});

await kasus('A2', 'usulan TIDAK boleh memuat isi berkas rahasia', async () => {
  G.aturUlangGhost();
  // (a) saringRahasia langsung: kunci API yang dikenal
  const k1 = 'sk-ABCDEFGHIJKLMNOPQRSTUVWXYZ012345';
  const s1 = G.saringRahasia(`apiKey = "${k1}"`);
  // (b) lewat ambilSaran: pemasok yang mengulang rahasia + daftar rahasia eksplisit
  const RAHASIA = 'TOKEN-RAHASIA-PENGGUNA-9';
  G.setPemasokSaran(() => ({ teks: `const t = '${RAHASIA}';` }));
  G.setGhostAktif(true);
  const u = await G.ambilSaran('const t =', 'ts', { rahasia: [RAHASIA] });
  const tidakBocor = s1.includes('***') && !s1.includes(k1);
  const tidakBocor2 = u ? !u.teks.includes(RAHASIA) && u.teks.includes('***') : false;
  return {
    lulus: tidakBocor && tidakBocor2,
    detail: `saring=${J(s1)} usulan=${J(u?.teks)}`,
  };
});

await kasus('A3', 'batas PANJANG usulan disebut angkanya & ditegakkan', async () => {
  const batas = G.BATAS_PANJANG_SARAN;
  const panjang = 'x'.repeat(batas + 200);
  const { teks, dipotong } = G.potongSaran(panjang);
  return {
    lulus: batas === 120 && dipotong === true && teks.length <= batas,
    detail: `BATAS_PANJANG_SARAN=${batas} panjangHasil=${teks.length} dipotong=${dipotong}`,
  };
});

await kasus('A4', 'batas KONTEKS yang dibaca disebut angkanya & ditegakkan', async () => {
  const kc = G.BATAS_KONTEKS_KARAKTER;
  const kb = G.BATAS_KONTEKS_BARIS;
  const seratusBaris = Array.from({ length: 100 }, (_, i) => `baris ke-${i}`).join('\n');
  const potong = G.potongKonteks(seratusBaris);
  const sufiks = seratusBaris.endsWith(potong);
  const jmlBarisHasil = potong.split('\n').length;
  return {
    lulus: kc === 4000 && kb === 40 && jmlBarisHasil <= kb && sufiks,
    detail: `KARAKTER=${kc} BARIS=${kb} barisHasil=${jmlBarisHasil} sufiks=${sufiks}`,
  };
});

await kasus('A5', 'pemicu HANYA di dalam editor (bukan hotkey global)', async () => {
  // Pemicu ghost = keymap CodeMirror + event Tauri ai-chunk. TIDAK boleh ada
  // listener keydown global di window/document.
  const adaKeymap = /keymap\.of\(/.test(teksGhost);
  const adaKeydownGlobal = /(?:window|document)\.addEventListener\(\s*['"]keydown['"]/.test(teksGhost);
  const ghostDiEditor = /ghostText\(/.test(teksEditor);
  return {
    lulus: adaKeymap && !adaKeydownGlobal && ghostDiEditor,
    detail: `keymapEditor=${adaKeymap} keydownGlobal=${adaKeydownGlobal} dipasangDiEditor=${ghostDiEditor}`,
  };
});

await kasus('A6', 'penyedia ADA + seam SUDAH tersambung (lokal dulu, AI cadangan)', async () => {
  // Sebelum tambalan sesi ini: `mintaSaran` memanggil cmd.aiChat langsung dan
  // `ghostPemasok` tidak diimpor berkas app mana pun — celah "belum tersambung".
  // Sesudah: seam DIPASANG (`setPemasokSaran(PEMASOK_LOKAL)`) dan dicoba SEBELUM
  // jaringan, dengan jalur AI tetap sebagai cadangan. Jadi jawabannya BUKAN
  // "TIDAK ADA" dan bukan "belum tersambung" lagi.
  const sambungLsp = /autocompletionZephyr\(/.test(teksEditor);
  const cadanganAi = /cmd\.aiChat\(/.test(teksGhost);
  return {
    lulus:
      adaCompletionLsp &&
      adaPemasokLokal &&
      sambungLsp &&
      pemasokDipakaiEditor &&
      pasangLokal &&
      adaAmbilSaran &&
      cadanganAi,
    detail:
      `autocompletionZephyr=${sambungLsp}; impor seam=${pemasokDipakaiEditor}; ` +
      `pasangLokal=${pasangLokal}; ambilSaran=${adaAmbilSaran}; cadanganAi=${cadanganAi}`,
  };
});

await kasus('A7', 'determinisme: input sama -> usulan sama (tanpa waktu/acak)', async () => {
  G.aturUlangGhost();
  G.setPemasokSaran(G.PEMASOK_LOKAL);
  const sebelum = 'function tambah(a, b) {';
  const x = await G.ambilSaran(sebelum, 'ts', {});
  const y = await G.ambilSaran(sebelum, 'ts', {});
  const z = await G.ambilSaran(sebelum, 'ts', {});
  const sama = J(x) === J(y) && J(y) === J(z);
  return { lulus: sama, detail: `usulan=${J(x?.teks)}` };
});

await kasus('A8', 'modul pemasok MURNI: nol impor Tauri/jaringan', async () => {
  const adaImpor = /^\s*import\s/m.test(KODE_PEMASOK);
  const adaTauri = /@tauri-apps|invoke\(|fetch\(|XMLHttpRequest/.test(KODE_PEMASOK);
  return {
    lulus: !adaImpor && !adaTauri,
    detail: `import=${adaImpor} tauri/jaringan=${adaTauri}`,
  };
});

await kasus('A9', 'usulan panjang dipotong di batas (bukan dipenggal kasar tengah kata)', async () => {
  const teks = 'kata '.repeat(60).trim(); // ~299 char, banyak batas kata
  const r = G.potongSaran(teks);
  const berakhirRapi = r.teks === r.teks.replace(/[ \t]+$/, '') && !r.teks.endsWith(' ');
  return { lulus: r.dipotong && r.teks.length <= G.BATAS_PANJANG_SARAN && berakhirRapi, detail: `len=${r.teks.length}` };
});

await kasus('A10', 'seam MATI -> pemasok TIDAK dipanggil sama sekali', async () => {
  G.aturUlangGhost();
  let dipanggil = 0;
  G.setPemasokSaran(() => {
    dipanggil++;
    return 'seharusnya tidak muncul';
  });
  G.setGhostAktif(false);
  const u = await G.ambilSaran('function f() {', 'ts', {});
  G.setGhostAktif(true);
  return { lulus: u === null && dipanggil === 0, detail: `usulan=${J(u)} dipanggil=${dipanggil}` };
});

await kasus('A11', 'pemasok yang MELEMPAR tidak menjatuhkan pemanggil -> null', async () => {
  G.aturUlangGhost();
  G.setPemasokSaran(() => {
    throw new Error('pemasok rusak');
  });
  G.setGhostAktif(true);
  const u = await G.ambilSaran('const a =', 'ts', {});
  return { lulus: u === null, detail: `usulan=${J(u)}` };
});

await kasus('A12', 'saran NYATA muncul dari seam lokal (angka disebut)', async () => {
  G.aturUlangGhost();
  G.setPemasokSaran(G.PEMASOK_LOKAL);
  G.setGhostAktif(true);
  const u = await G.ambilSaran('function tambah(a, b) {', 'ts', { path: 'a.ts' });
  return { lulus: u?.teks === '\n}', detail: `teks=${J(u?.teks)} sebab=${u?.sebab} dari=${u?.dari}` };
});

await kasus('A13', 'lokal DULU: ambilSaran mendahului cmd.aiChat di mintaSaran (sumber)', async () => {
  const iAmbil = teksGhost.indexOf('await ambilSaran(');
  const iAi = teksGhost.indexOf('await cmd.aiChat(');
  const adaEarlyReturn = /if \(lokal\) \{[\s\S]*?return;/.test(teksGhost);
  return {
    lulus: iAmbil > -1 && iAi > -1 && iAmbil < iAi && adaEarlyReturn,
    detail: `idxAmbilSaran=${iAmbil} idxAiChat=${iAi} earlyReturn=${adaEarlyReturn}`,
  };
});

await kasus('A14', 'NEGATIF: seam lokal tidak membocorkan rahasia berkas ke usulan', async () => {
  G.aturUlangGhost();
  const RAHASIA = 'KUNCI-DIAM-DIAM-5566';
  G.setPemasokSaran(() => ({ teks: `const k = '${RAHASIA}';` }));
  G.setGhostAktif(true);
  const u = await G.ambilSaran('const k =', 'ts', { rahasia: [RAHASIA] });
  const bocor = u ? u.teks.includes(RAHASIA) : true;
  return { lulus: u !== null && !bocor && u.teks.includes('***'), detail: `bocor=${bocor} teks=${J(u?.teks)}` };
});

await kasus('A15', 'jalur lokal pulang-awal: listener jaringan hanya dipasang di jalur AI', async () => {
  const iReturn = teksGhost.indexOf('if (lokal) {');
  const iListener = teksGhost.indexOf('pastikanListener();');
  const adaReturn = /if \(lokal\) \{[\s\S]*?return;/.test(teksGhost);
  return {
    lulus: adaReturn && iReturn > -1 && iListener > -1 && iReturn < iListener,
    detail: `idxLokalReturn=${iReturn} idxPastikanListener=${iListener}`,
  };
});

/* ------------------------------------------------------------------ *
 * RINGKASAN
 * ------------------------------------------------------------------ */
const lulus = hasil.filter((h) => h.lulus).length;
const gagal = hasil.length - lulus;
console.log(`\nRINGKASAN: ${lulus}/${hasil.length} LULUS, ${gagal} GAGAL`);
if (gagal) {
  console.log('  gagal: ' + hasil.filter((h) => !h.lulus).map((h) => h.id).join(', '));
  process.exit(1);
}
process.exit(0);
