#!/usr/bin/env node
/*
 * Uji pemetaan tokenColors VS Code -> token sintaks Zephyr (--syn-*).
 *
 * Memasang tema VS Code harus mengubah WARNA KODE, bukan cuma chrome editor.
 * Skrip ini membundel fungsi murni `src/lib/vscodeTokenMap.ts` dengan esbuild
 * (lewat Node API kalau ada, kalau tidak lewat CLI) ke berkas sementara di
 * direktori scratch, mengimpornya, lalu menjalankan kasus-kasus di bawah:
 *
 *   A. 11 tokenColors -> 11 token --syn-* dengan nilai benar.
 *   B. entri terakhir yang cocok menang (override VS Code).
 *   C. tanpa/tokenColors kosong -> 0 token sintaks, bukan kegagalan.
 *   D. bentuk rusak (string, angka, null, array bersarang, scope aneh)
 *      -> tidak melempar.
 *
 * Keluar 0 kalau semua lulus, 1 kalau ada yang gagal.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entry = path.join(root, 'src', 'lib', 'vscodeTokenMap.ts');
const scratch =
  process.env.UJI_TEMA_SCRATCH ||
  'C:/Users/Zyrex/AppData/Local/hermes/cache/scratch';
const bundel = path.join(scratch, 'uji-tema-sintaks-vscode.bundle.mjs');

let lulus = 0;
let gagal = 0;
const daftarGagal = [];

function cek(kondisi, nama, info) {
  if (kondisi) {
    lulus++;
    console.log(`  ok    ${nama}`);
  } else {
    gagal++;
    daftarGagal.push(nama);
    console.log(`  GAGAL ${nama}${info ? ` — ${info}` : ''}`);
  }
}

function samaDengan(nyata, harap, nama) {
  cek(
    nyata === harap,
    nama,
    `harap ${JSON.stringify(harap)}, dapat ${JSON.stringify(nyata)}`,
  );
}

/* ---------------------------------------------------------------- bundling */

async function bundelFungsi() {
  mkdirSync(scratch, { recursive: true });
  try {
    const require = createRequire(path.join(root, 'package.json'));
    const esbuild = require('esbuild');
    await esbuild.build({
      entryPoints: [entry],
      bundle: true,
      format: 'esm',
      platform: 'node',
      outfile: bundel,
      logLevel: 'silent',
    });
    return 'node-api';
  } catch (e) {
    const bin = path.join(
      root,
      'node_modules',
      '.bin',
      process.platform === 'win32' ? 'esbuild.cmd' : 'esbuild',
    );
    const r = spawnSync(
      bin,
      [entry, '--bundle', '--format=esm', '--platform=node', `--outfile=${bundel}`],
      { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' },
    );
    if (r.status !== 0) {
      throw new Error(
        `bundling gagal (api: ${e.message} | cli: ${(r.stderr || r.stdout || '').trim()})`,
      );
    }
    return 'cli';
  }
}

/* ------------------------------------------------------------------ kasus */

// [scope masukan, foreground, token yang diharapkan, nilai yang diharapkan]
const KASUS_11 = [
  ['comment', '#858585', '--syn-comment', 'rgb(133, 133, 133)'],
  [['keyword', 'storage'], '#c586c0', '--syn-keyword', 'rgb(197, 134, 192)'],
  ['string', '#ce9178', '--syn-string', 'rgb(206, 145, 120)'],
  ['constant.numeric', '#b5cea8', '--syn-number', 'rgb(181, 206, 168)'],
  ['entity.name.function', '#dcdcaa', '--syn-function', 'rgb(220, 220, 170)'],
  ['entity.name.type', '#4ec9b0', '--syn-type', 'rgb(78, 201, 176)'],
  ['variable.other', '#9cdcfe', '--syn-variable', 'rgb(156, 220, 254)'],
  ['keyword.operator', 'rgba(0, 0, 0, 0.5)', '--syn-operator', 'rgba(0, 0, 0, 0.5)'],
  ['entity.other.attribute-name', '#e0e0e0', '--syn-attr', 'rgb(224, 224, 224)'],
  ['entity.name.tag', '#569cd6', '--syn-tag', 'rgb(86, 156, 214)'],
  ['invalid', '#f44747', '--syn-invalid', 'rgb(244, 71, 71)'],
];

function tema11() {
  return KASUS_11.map(([scope, fg], i) => ({
    scope,
    settings: { foreground: fg, fontStyle: i === 0 ? 'italic' : undefined },
  }));
}

async function main() {
  const mode = await bundelFungsi();
  const mod = await import(pathToFileURL(bundel).href + `?t=${Date.now()}`);
  const { petakanTokenWarna } = mod;
  if (typeof petakanTokenWarna !== 'function') {
    console.log('GAGAL mengekspor petakanTokenWarna dari vscodeTokenMap.ts');
    process.exit(1);
  }

  console.log(`# uji-tema-sintaks-vscode (bundling: ${mode})`);
  console.log(`# bundel: ${bundel}`);

  /* A. 11 tokenColors -> 11 token --syn-* */
  console.log('\nA. tema dengan 11 tokenColors');
  const peta11 = petakanTokenWarna(tema11());
  const kunci11 = Object.keys(peta11);
  samaDengan(kunci11.length, 11, 'jumlah token --syn-* = 11');
  for (const [, , token, nilai] of KASUS_11) {
    samaDengan(peta11[token], nilai, `${token} = ${nilai}`);
  }
  cek(
    kunci11.every((k) => k.startsWith('--syn-')),
    'semua kunci berawalan --syn-',
    kunci11.filter((k) => !k.startsWith('--syn-')).join(', '),
  );
  samaDengan(kunci11.length, new Set(kunci11).size, 'tidak ada kunci ganda');

  /* B. entri terakhir menang */
  console.log('\nB. entri terakhir yang cocok menang');
  const override = [
    ...tema11(),
    { scope: 'comment', settings: { foreground: '#ff0000' } },
  ];
  const petaB = petakanTokenWarna(override);
  samaDengan(Object.keys(petaB).length, 11, 'jumlah token tetap 11');
  samaDengan(petaB['--syn-comment'], 'rgb(255, 0, 0)', 'override comment menang');
  const scopePanjang = petakanTokenWarna([
    { scope: 'keyword.operator', settings: { foreground: '#010203' } },
  ]);
  samaDengan(
    scopePanjang['--syn-operator'],
    'rgb(1, 2, 3)',
    'selector paling spesifik (keyword.operator -> --syn-operator)',
  );
  samaDengan(
    scopePanjang['--syn-keyword'],
    undefined,
    'keyword.operator tidak ikut jadi --syn-keyword',
  );
  const koma = petakanTokenWarna([
    { scope: 'comment, string', settings: { foreground: '#111111' } },
  ]);
  samaDengan(koma['--syn-comment'], 'rgb(17, 17, 17)', 'scope string dipisah koma');
  samaDengan(koma['--syn-string'], 'rgb(17, 17, 17)', 'scope string dipisah koma (2)');
  const bersarang = petakanTokenWarna([
    { scope: ['comment', ['string', ['keyword']]], settings: { foreground: '#222222' } },
  ]);
  samaDengan(
    Object.keys(bersarang).length,
    3,
    'array scope bersarang -> 3 token',
  );

  /* C. tanpa tokenColors */
  console.log('\nC. tanpa tokenColors');
  for (const [nama, masukan] of [
    ['undefined', undefined],
    ['null', null],
    ['[]', []],
    ['{}', {}],
  ]) {
    const hasil = petakanTokenWarna(masukan);
    samaDengan(Object.keys(hasil).length, 0, `tanpa tokenColors (${nama}) -> 0 token`);
  }

  /* D. bentuk rusak tidak melempar */
  console.log('\nD. bentuk rusak tidak melempar');
  const rusak = [
    ['string', 'bukan array'],
    ['angka', 42],
    ['boolean', true],
    ['array bersarang', [[{ scope: 'comment', settings: { foreground: '#abc' } }]]],
    ['entri null/angka/string', [null, 3, 'x', false]],
    ['settings null', [{ scope: 'comment', settings: null }]],
    ['settings string', [{ scope: 'comment', settings: 'italic' }]],
    ['tanpa settings & tanpa foreground', [{ scope: 'comment' }, { scope: 'keyword' }]],
    ['scope angka', [{ scope: 123, settings: { foreground: '#ffffff' } }]],
    ['scope null', [{ scope: null, settings: { foreground: '#ffffff' } }]],
    ['scope array kosong', [{ scope: [], settings: { foreground: '#ffffff' } }]],
    ['foreground angka', [{ scope: 'comment', settings: { foreground: 12345 } }]],
    ['foreground kosong', [{ scope: 'comment', settings: { foreground: '   ' } }]],
    ['foreground aneh', [{ scope: 'comment', settings: { foreground: 'var(--x)' } }]],
    ['scope tidak dikenal', [{ scope: 'foo.bar.baz', settings: { foreground: '#ffffff' } }]],
  ];
  for (const [nama, masukan] of rusak) {
    let hasil = null;
    let lemparan = null;
    try {
      hasil = petakanTokenWarna(masukan);
    } catch (e) {
      lemparan = e;
    }
    cek(
      lemparan === null && hasil !== null && typeof hasil === 'object',
      `rusak: ${nama}`,
      lemparan ? `melempar ${lemparan.message}` : 'hasil bukan objek',
    );
  }
  const nested = petakanTokenWarna([
    [[{ scope: 'comment', settings: { foreground: '#abc' } }]],
  ]);
  samaDengan(nested['--syn-comment'], 'rgb(170, 187, 204)', 'array bersarang tetap terbaca');
  const aneh = petakanTokenWarna([
    { scope: 'comment', settings: { foreground: 'var(--x)' } },
  ]);
  samaDengan(aneh['--syn-comment'], 'var(--x)', 'foreground tak terparse dipakai apa adanya');

  /* ------------------------------------------------------------- ringkasan */
  console.log('\n# ringkasan');
  console.log(`# lulus: ${lulus}`);
  console.log(`# gagal: ${gagal}`);
  if (gagal > 0) {
    console.log(`# kasus gagal: ${daftarGagal.join('; ')}`);
    process.exit(1);
  }
  console.log('# hasil: OK');
  process.exit(0);
}

main().catch((e) => {
  console.log(`# ERROR ${e && e.stack ? e.stack : e}`);
  console.log('# lulus: ' + lulus);
  console.log('# gagal: ' + (gagal + 1));
  process.exit(1);
});
