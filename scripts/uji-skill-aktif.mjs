#!/usr/bin/env node
/*
 * uji-skill-aktif.mjs — GATE penyaring skill yang dimatikan pembaca.
 *
 * APA YANG DIJAGA
 *
 * Sakelar di Agent Customizations → Skills hanya berarti kalau dua hal terjadi
 * bersamaan: blok "AVAILABLE SKILLS" yang dikirim Rust tidak lagi memuat skill
 * yang dimatikan, DAN pemadaman itu tidak ikut memakan baris lain di teks yang
 * sama (blok memori menumpang di string itu). Harness ini menguji keduanya pada
 * fixture berbentuk persis keluaran `skills.rs` + `memory.rs`, plus penyimpanannya
 * (localStorage di app, gudang suntikan di sini).
 *
 * KENAPA DI NODE, TANPA APP
 *
 * `saringBlokSkill()` sengaja murni: teks masuk, teks keluar. Karena itu gate ini
 * bisa dijalankan tanpa provider, tanpa kuota, dan tanpa WebView — dan hasilnya
 * deterministik. Yang TIDAK dibuktikan di sini: bahwa prompt sungguhan mengambil
 * jalur itu. Itu diperiksa di app hidup oleh `verify-agc-skills-rules.mjs`.
 *
 * Pakai: node scripts/uji-skill-aktif.mjs
 * exit 0 = semua lulus; exit 1 = ada yang gagal (disebut mana).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..');
const KERJA = join(AKAR, 'scratch', 'uji-skill-aktif');

mkdirSync(KERJA, { recursive: true });
const ENTRI = join(KERJA, 'entri.ts');
writeFileSync(ENTRI, "export * from '../../src/lib/skillAktif';\n");
const BUNDEL = join(KERJA, 'entri.mjs');
await esbuild.build({
  entryPoints: [ENTRI],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: BUNDEL,
  logLevel: 'warning',
});

const M = await import(`file://${BUNDEL.replace(/\\/g, '/')}`);

/* Keluaran dua perintah Rust, digabung apa adanya seperti `agent_context`: blok
   memori DULU, lalu blok skill. Baris memori yang benar-benar berbeda bentuknya
   ikut di sini dengan sengaja — itu bagian yang paling gampang dirusak penyaring. */
const BLOK = [
  '',
  'MEMORY (ditulis user, jangan diubah):',
  '- [2026-10-13] global / keputusan: jawab pakai bahasa Indonesia.',
  '- [2026-10-14] proyek:zephyr-7f3a91/lain: py3 tidak ada, pakai python.',
  '',
  'AVAILABLE SKILLS (read one with the skill_view tool before starting work it matches):',
  '- brainstorming [global]: Use before building anything new.',
  '- brain [global]: Nama yang jadi awalan nama skill lain.',
  '- modlens [global]: Plug-in vision for text-only models.',
  '- rantau-site [workspace]: RANTAU travel guide static site.',
  '',
].join('\n');

const gudang = (awal = null) => {
  let isi = awal;
  return {
    baca: () => isi,
    tulis: (t) => {
      isi = t;
    },
    mentah: () => isi,
  };
};

const barisSkill = (teks) => teks.split('\n').filter((l) => /^- .+ \[(workspace|global)\]:/.test(l));

let lulus = 0;
let total = 0;
const cek = (nama, ok, info = '') => {
  total += 1;
  if (ok) lulus += 1;
  console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${nama}  ${info}`);
};

/* ── 1. Penyaring blok ─────────────────────────────────────────────────── */
cek('A1 tanpa daftar mati: teks tidak disentuh', M.saringBlokSkill(BLOK, []) === BLOK, 'identik');

const satuMati = M.saringBlokSkill(BLOK, ['modlens']);
cek(
  'A2 satu skill mati: barisnya hilang, sisanya utuh',
  !satuMati.includes('modlens [global]') && barisSkill(satuMati).length === 3,
  `sisa ${barisSkill(satuMati).length} baris skill`,
);
cek(
  'A3 header tetap ada selama masih ada baris',
  satuMati.includes('AVAILABLE SKILLS'),
  '',
);
cek(
  'A4 baris MEMORI tidak ikut tersaring',
  satuMati.includes('global / keputusan: jawab pakai bahasa Indonesia.') &&
    satuMati.includes('proyek:zephyr-7f3a91/lain'),
  '',
);

const awalan = M.saringBlokSkill(BLOK, ['brain']);
cek(
  'A5 nama yang jadi awalan tidak menghapus nama lain',
  !awalan.includes('- brain [global]') && awalan.includes('- brainstorming [global]'),
  `sisa: ${barisSkill(awalan).map((l) => l.split(' ')[1]).join(', ')}`,
);

const besarKecil = M.saringBlokSkill(BLOK, ['MODLENS']);
cek('A6 huruf besar/kecil tidak berpengaruh', !besarKecil.includes('modlens [global]'), '');

const semuaMati = M.saringBlokSkill(BLOK, ['brainstorming', 'brain', 'modlens', 'rantau-site']);
cek(
  'A7 semua dimatikan: header pun ikut dibuang',
  barisSkill(semuaMati).length === 0 && !semuaMati.includes('AVAILABLE SKILLS'),
  `sisa ${barisSkill(semuaMati).length} baris skill`,
);
cek(
  'A8 saat semua mati, blok memori tetap utuh',
  semuaMati.includes('global / keputusan: jawab pakai bahasa Indonesia.') &&
    semuaMati.includes('proyek:zephyr-7f3a91/lain'),
  '',
);

const tanpaHeader = M.saringBlokSkill('- modlens [global]: x\n', ['modlens']);
cek(
  'A9 teks tanpa header tidak disentuh sama sekali',
  tanpaHeader === '- modlens [global]: x\n',
  '',
);

const duplikat = M.saringBlokSkill(BLOK, ['modlens', 'MODLENS', ' modlens ']);
cek(
  'A10 daftar mati dengan ejaan ganda tetap sekali buang',
  duplikat === satuMati,
  '',
);

/* ── 2. Penyimpanan status ─────────────────────────────────────────────── */
const g1 = gudang();
cek('B1 gudang kosong = semuanya nyala', M.bacaNonaktif(g1).length === 0, '');

const setelah = M.setAktifNama('modlens', false, g1);
cek(
  'B2 mematikan satu skill tersimpan',
  setelah.length === 1 && setelah[0] === 'modlens' && JSON.parse(g1.mentah())[0] === 'modlens',
  `tersimpan: ${g1.mentah()}`,
);

const lagi = M.setAktifNama('modlens', true, g1);
cek('B3 menyalakan lagi menghapusnya dari daftar', lagi.length === 0, `tersimpan: ${g1.mentah()}`);

const g2 = gudang(JSON.stringify(['Zeta', 'alpha', 'alpha']));
cek(
  'B4 gudang dinormalkan: huruf kecil, unik, terurut',
  JSON.stringify(M.bacaNonaktif(g2)) === JSON.stringify(['alpha', 'zeta']),
  M.bacaNonaktif(g2).join(','),
);

const g3 = gudang('bukan-json-sama-sekali');
cek('B5 gudang rusak jatuh ke "semuanya nyala"', M.bacaNonaktif(g3).length === 0, '');

const g4 = gudang('{"a":1}');
cek('B6 JSON yang bukan daftar juga jatuh ke "semuanya nyala"', M.bacaNonaktif(g4).length === 0, '');

const g5 = gudang('modlens, brain');
cek(
  'B7 teks bebas TIDAK dipecah jadi nama skill',
  M.bacaNonaktif(g5).length === 0,
  `hasil: [${M.bacaNonaktif(g5).join(',')}]`,
);

const g6 = gudang();
M.setAktifNama('', false, g6);
cek('B8 nama kosong tidak menulis apa pun', (g6.mentah() ?? '') === '', String(g6.mentah()));

console.log(`\n== ${lulus}/${total} lulus ==`);
process.exit(lulus === total ? 0 : 1);
