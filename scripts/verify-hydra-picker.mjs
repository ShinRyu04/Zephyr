/*
 * verify-hydra-picker.mjs — HydraFusion adalah MODEL di picker, bukan switch.
 *
 * Pakai:  node scripts/verify-hydra-picker.mjs [portCdp]
 * Syarat: zephyr.exe hidup dengan --remote-debugging-port=9223 dan vite di :5173.
 *
 * Yang dibuktikan (dari app HIDUP, bukan dari membaca kode):
 *
 *   P1  Baris HydraFusion ADA di picker walau `settings.hydrafusion.enabled`
 *       MATI. Dulu baris itu hanya dirender ketika flag sudah nyala, sehingga
 *       satu-satunya cara menemukannya adalah menyalakan flag yang langsung
 *       merutekan setiap giliran — keluhan "HydraFusion nyala sendiri".
 *   P2  Memilih baris itu MENGUBAH MODEL (sentinel `hydrafusion`) dan chip
 *       composer menampilkan "HydraFusion".
 *   P3  Sentinel TIDAK ditulis ke setelan tersimpan. Kalau ditulis, setiap
 *       request akan menyebut model yang tidak dilayani provider (404) dan
 *       model "terakhir" pengguna rusak.
 *   P4  Memilih model biasa mengembalikan keadaan: chip = label model itu.
 *
 * Keadaan awal dipulihkan di akhir, termasuk flag HydraFusion.
 */

import { Cdp, reporter, keluarBersih } from './lib-cdp.mjs';

const PORT = process.argv[2] ?? '9223';
const R = reporter('hydra-picker');

const list = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).filter(
  (x) => x.type === 'page',
);
const t = list.find(
  (x) => (x.url ?? '').startsWith('http://localhost:5173') && !(x.url ?? '').includes('#agents'),
);
if (!t) {
  R.check('P0', false, 'target app tidak ada di :' + PORT);
  R.selesai();
  keluarBersih(1);
}
const cdp = await Cdp.connect(t.webSocketDebuggerUrl);

const out = await cdp.runAsync(
  [
    'const out = {};',
    'for (let i = 0; i < 60; i++) {',
    '  if (typeof S !== "undefined" && S && typeof S.getState === "function" && typeof X !== "undefined" && X && X.store) break;',
    '  await wait(500);',
    '}',
    'out.siap = typeof S !== "undefined" && !!S && typeof S.getState === "function";',
    'if (!out.siap) return out;',
    '',
    '/* Keadaan awal, untuk dipulihkan di akhir. */',
    'const awal = {',
    '  model: X.store.getState().model,',
    '  provider: X.store.getState().provider,',
    '  flag: S.getState().settings.hydrafusion?.enabled === true,',
    '};',
    'out.awal = awal;',
    '',
    '/* P1: flag MATI, baris picker tetap ada. */',
    'await S.getState().applySettings({ hydrafusion: { enabled: false } });',
    'await wait(1500);',
    'out.flagMati = S.getState().settings.hydrafusion.enabled;',
    'X.store.getState().setModelMenuOpen(true);',
    'await wait(700);',
    'const baris = document.querySelector("[data-testid=ai-model-hydra]");',
    'out.barisPicker = !!baris;',
    'out.teksBaris = baris ? baris.textContent : null;',
    'out.adaBadgeRiset = baris ? /Research preview/i.test(baris.textContent || "") : false;',
    'X.store.getState().setModelMenuOpen(false);',
    'await wait(300);',
    '',
    '/* P2: memilih HydraFusion mengubah model + chip. */',
    'await X.store.getState().setModel("hydrafusion", "custom");',
    'await wait(1200);',
    'out.modelHydra = X.store.getState().model;',
    'out.chipHydra = (document.querySelector("[data-testid=ai-model-btn] .ai-model-name") || {}).textContent || null;',
    '',
    '/* P3: sentinel tidak bocor ke setelan tersimpan. */',
    'out.modelTersimpan = (S.getState().settings.models.providers.custom ?? {}).model ?? null;',
    '',
    '/* P4: kembali ke model biasa. */',
    'await X.store.getState().setModel(awal.model || "gemini-3.8-flash", awal.provider || "custom");',
    'await wait(1000);',
    'out.modelKembali = X.store.getState().model;',
    'out.chipKembali = (document.querySelector("[data-testid=ai-model-btn] .ai-model-name") || {}).textContent || null;',
    '',
    '/* Pulihkan flag semula. */',
    'await S.getState().applySettings({ hydrafusion: { enabled: awal.flag } });',
    'await wait(1200);',
    'out.flagDipulihkan = S.getState().settings.hydrafusion.enabled;',
    'return out;',
  ].join('\n'),
  180000,
);

R.check('P0', out.siap === true, 'app siap dan bridge dev tersedia');
R.check(
  'P1',
  out.flagMati === false && out.barisPicker === true && out.adaBadgeRiset === true,
  `flag=${out.flagMati}, baris picker=${out.barisPicker}, badge "Research preview"=${out.adaBadgeRiset}`,
);
R.check(
  'P2',
  out.modelHydra === 'hydrafusion' && out.chipHydra === 'HydraFusion',
  `model=${out.modelHydra}, chip=${JSON.stringify(out.chipHydra)}`,
);
R.check(
  'P3',
  out.modelTersimpan !== 'hydrafusion' && !!out.modelTersimpan,
  `model tersimpan=${JSON.stringify(out.modelTersimpan)} (tidak boleh sentinel)`,
);
R.check(
  'P4',
  out.modelKembali !== 'hydrafusion' && out.chipKembali !== 'HydraFusion',
  `model=${out.modelKembali}, chip=${JSON.stringify(out.chipKembali)}`,
);
R.check('P5', out.flagDipulihkan === out.awal.flag, `flag dipulihkan ke ${out.awal.flag}`);

R.selesai();
keluarBersih(process.exitCode === 1 ? 1 : 0);
