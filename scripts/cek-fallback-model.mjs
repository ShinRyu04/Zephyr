/*
 * Mengunci fallback model: setelah retry + tunggu-pulih habis pada error
 * provider yang BOLEH diulang, Zephyr pindah ke satu model lain alih-alih
 * menyerah. Fungsinya murni (contextBudget.ts) sehingga diuji di Node lewat
 * esbuild - tidak butuh aplikasi hidup, yang diuji adalah kode yang
 * benar-benar dijalankan.
 *
 * Yang dikunci di sini adalah KEPUTUSAN, bukan hanya mekanisme:
 *  - provider sama diutamakan (kunci & gateway sama, tidak menebak konfigurasi)
 *  - provider lain hanya kalau kuncinya sudah dikonfigurasi
 *  - model free-text (custom/local) tidak pernah gets换 - tidak ada alternatif
 *  - model paling mirip (ctx paling dekat) dipilih, bukan asal urutan
 */
import { build } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'fallback-'));
const out = join(dir, 'contextBudget.mjs');
await build({
  entryPoints: ['src/lib/contextBudget.ts'],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  outfile: out,
  logLevel: 'silent',
});
const M = await import('file:///' + out.replace(/\\/g, '/') + '?v=' + Date.now());

let lulus = 0, total = 0;
const cek = (nama, syarat, bukti) => {
  total++;
  if (syarat) { lulus++; console.log(`  OK    ${nama}${bukti !== undefined ? '  [' + bukti + ']' : ''}`); }
  else console.log(`  GAGAL ${nama}  [${bukti}]`);
};

// Katalog tiruan dengan ctx - berlaku untuk semua model, bukan satu provider.
const katalog = [
  { id: 'deepseek-v4.1-flash', provider: 'custom', ctx: 128000, freeText: true },
  { id: 'custom-model', provider: 'custom', ctx: undefined, freeText: true },
  { id: 'gpt-4o', provider: 'openai', ctx: 128000 },
  { id: 'gpt-4o-mini', provider: 'openai', ctx: 128000 },
  { id: 'claude-3-5-sonnet', provider: 'anthropic', ctx: 200000 },
  { id: 'claude-3-5-haiku', provider: 'anthropic', ctx: 200000 },
  { id: 'gemini-2.5-pro', provider: 'google', ctx: 1000000 },
];
const adaKunci = (...p) => (x) => p.includes(x);

// 1. Provider sama diutamakan: dari deepseek (freeText) tidak ada alternatif.
const dariCustom = M.pilihModelCadangan({ provider: 'custom', id: 'custom-model', ctx: 128000 }, katalog, adaKunci('custom', 'openai'));
cek('custom/free-text tidak jatuh ke model katalog', dariCustom === null, dariCustom && dariCustom.id);

// 2. OpenAI punya alternatif -> pilih yang ctx-nya paling dekat.
const dariOpenAI = M.pilihModelCadangan({ provider: 'openai', id: 'gpt-4o', ctx: 128000 }, katalog, adaKunci('openai'));
cek('pilih model provider-sama', dariOpenAI && dariOpenAI.provider === 'openai', dariOpenAI && dariOpenAI.id + ' ' + dariOpenAI.alasan);
cek('bukan model yang sedang dipakai', dariOpenAI && dariOpenAI.id !== 'gpt-4o', dariOpenAI && dariOpenAI.id);

// 3. Anthropic: dua kandidat dengan ctx sama besar - harus dapat yang ctx-nya dekat.
const dariAnthropic = M.pilihModelCadangan({ provider: 'anthropic', id: 'claude-3-5-sonnet', ctx: 200000 }, katalog, adaKunci('anthropic'));
cek('anthropic dapat alternatif', dariAnthropic && dariAnthropic.provider === 'anthropic', dariAnthropic && dariAnthropic.id);

// 4. Hanya satu model di provider itu -> pindah ke provider lain yang terkonfigurasi.
const satuAja = [{ id: 'solo', provider: 'solo', ctx: 128000 }, { id: 'lain', provider: 'openai', ctx: 128000 }];
const keLain = M.pilihModelCadangan({ provider: 'solo', id: 'solo', ctx: 128000 }, satuAja, adaKunci('openai'));
cek('provider lain jadi cadangan', keLain && keLain.provider === 'openai', keLain && keLain.alasan);

// 5. Provider lain TIDAK dikonfigurasi -> jangan pindah (akan gagal auth, bukan masalah asli).
const tanpaKunci = M.pilihModelCadangan({ provider: 'solo', id: 'solo', ctx: 128000 }, satuAja, adaKunci());
cek('tidak pindah ke provider tanpa kunci', tanpaKunci === null, tanpaKunci);

// 6. Tidak ada kandidat sama sekali -> null, bukan error.
const kosong = M.pilihModelCadangan({ provider: 'openai', id: 'gpt-4o', ctx: 128000 }, [{ id: 'gpt-4o', provider: 'openai', ctx: 128000 }], adaKunci('openai', 'anthropic'));
cek('katalog sepi -> tidak ada cadangan', kosong === null, kosong);

// 7. Chooses by capability, not list order: from a small window, do not fall
// back to a 1M-token model when a comparable one exists further down the list.
const campur = [
  { id: 'raksasa', provider: 'p', ctx: 1000000 },
  { id: 'sepadan', provider: 'p', ctx: 8000 },
];
const pilihKecil = M.pilihModelCadangan({ provider: 'p', id: 'sekarang', ctx: 8000 }, campur, adaKunci('p'));
cek('pilih yang ctx-nya paling dekat', pilihKecil && pilihKecil.id === 'sepadan', pilihKecil && pilihKecil.id);

// 8. Deterministik: panggilan berulang memberi hasil sama.
const a1 = M.pilihModelCadangan({ provider: 'openai', id: 'gpt-4o', ctx: 128000 }, katalog, adaKunci('openai'));
const a2 = M.pilihModelCadangan({ provider: 'openai', id: 'gpt-4o', ctx: 128000 }, katalog, adaKunci('openai'));
cek('deterministik', JSON.stringify(a1) === JSON.stringify(a2), JSON.stringify(a1));

console.log(`\n== ${lulus}/${total} lulus ==`);
process.exit(lulus === total ? 0 : 1);