/*
 * verify-ekstensi-status.mjs — the card must STATE enabled/disabled.
 *
 * Pakai:  node scripts/verify-ekstensi-status.mjs [portCdp]
 *
 * Kenapa: keluhan "ekstensi terpasang tapi tidak ada yang berubah" berakar pada
 * kartu yang hanya menampilkan TOMBOL aksi ("Disable" saat paket hidup). Pembaca
 * membacanya sebagai label status — "tulisannya Disable, berarti mati" — padahal
 * artinya "klik untuk mematikan". Chip `xc-status-*` memisahkan keduanya.
 *
 *   S1  paket terpasang yang enabled:true  -> chip ada, data-enabled="1", teks "Enabled"
 *   S2  paket terpasang yang enabled:false -> chip ada, data-enabled="0", teks "Disabled"
 *   S3  chip HILANG untuk paket yang belum terpasang (bukan "Disabled" yang bohong)
 */

import { Cdp, sleep, reporter, keluarBersih } from './lib-cdp.mjs';

const APP_ORIGIN = /(localhost:5173|tauri\.localhost|127\.0\.0\.1:5173)/;
/** The app window (never a stray test-server page another harness left open). */
const isApp = (t) => APP_ORIGIN.test(t.url ?? '');

const PORT = process.argv[2] ?? '9223';
const R = reporter('ekstensi-status');

const list = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).filter(
  (x) => x.type === 'page',
);
const t = list.find((x) => isApp(x) && !(x.url ?? '').includes('#agents'));
if (!t) {
  R.check('S0', false, 'window utama tidak ada di :' + PORT);
  R.selesai();
  keluarBersih(1);
}
const cdp = await Cdp.connect(t.webSocketDebuggerUrl);

const out = await cdp.runAsync(
  [
    'const Ex = window.__ZEPHYR_EXT19__;',
    'await Ex.refresh();',
    'await new Promise(r => setTimeout(r, 900));',
    /* The card is rendered by the sidebar view; open it through its own command. */
    "window.dispatchEvent(new KeyboardEvent('keydown', { key: 'X', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }));",
    'await new Promise(r => setTimeout(r, 900));',
    "Ex.setTab('installed');",
    'await new Promise(r => setTimeout(r, 900));',
    /*
     * S1 needs a LIVE installed package, and the machine may legitimately have
     * none (the reader can disable everything, and a fresh profile starts with
     * nothing). Turning one on is part of setting up the measurement, not of
     * the thing being measured: the chip is read from the DOM after a real
     * `toggle`, exactly as the reader's own click would drive it.
     */
    'const semua = Ex.terpasang();',
    /*
     * Do NOT filter on `tercatat`: that flag means "already named in
     * settings.extensions.enabled", so a package installed but never toggled
     * reports false and would be skipped exactly when we need it. `terpasang()`
     * already lists packages present on disk.
     */
    'const kandidat = semua.filter((e) => !e.id.startsWith("zephyr.lang-"));',
    'let dipulihkan = null;',
    'const target = kandidat.find((e) => e.enabled) ?? kandidat[0] ?? null;',
    'if (target && !target.enabled) {',
    '  await Ex.setEnabled(target.id, true);',
    '  await Ex.refresh();',
    '  await new Promise(r => setTimeout(r, 1200));',
    '}',
    'const kartu = [...document.querySelectorAll("[data-ext-card]")];',
    'const terpasang = kartu.filter((k) => k.getAttribute("data-terpasang") === "1");',
    'const baca = (k) => {',
    '  const chip = k.querySelector("[data-testid^=\\"xc-status-\\"]");',
    '  return chip ? { teks: chip.textContent.trim(), enabled: chip.getAttribute("data-enabled") } : null;',
    '};',
    /*
     * ONE package, TWO states. A profile can legitimately hold a single
     * installed package, and then "a live card" and "a dead card" cannot be
     * found side by side; toggling the same card reads both chips from the DOM
     * after a real state change, which is what the reader sees.
     */
    'const kartuTarget = target ? terpasang.find((k) => k.getAttribute("data-ext-card") === target.id) : null;',
    'const on = kartuTarget ? { id: target.id, chip: baca(kartuTarget) } : null;',
    'let off = null;',
    'if (target) {',
    '  await Ex.setEnabled(target.id, false);',
    '  await Ex.refresh();',
    '  await new Promise(r => setTimeout(r, 1200));',
    '  const k2 = [...document.querySelectorAll("[data-ext-card]")]',
    '    .find((k) => k.getAttribute("data-ext-card") === target.id);',
    '  off = k2 ? { id: target.id, chip: baca(k2) } : null;',
    '  dipulihkan = target.enabled ? null : target.id;',
    '}',
    /*
     * Un-installed cards live on the other tabs. The chip must be ABSENT there:
     * a card that has never been installed has no state to state, and printing
     * "Disabled" would invent one.
     */
    'let belum = [];',
    'for (const tab of ["recommended", "marketplace"]) {',
    '  Ex.setTab(tab);',
    '  await new Promise(r => setTimeout(r, 900));',
    '  belum.push(...[...document.querySelectorAll("[data-ext-card]")].filter((k) => k.getAttribute("data-terpasang") === "0"));',
    '}',
    'Ex.setTab("installed");',
    /*
     * Put the package back the way it was found. A harness that leaves the
     * reader's profile toggled is a harness that changes what the next run
     * measures.
     */
    'if (dipulihkan) {',
    '  await Ex.setEnabled(dipulihkan, true);',
    '  await Ex.refresh();',
    '}',
    'return {',
    '  jumlahKartu: kartu.length,',
    '  jumlahTerpasang: terpasang.length,',
    '  dipulihkan: dipulihkan ?? null,',
    '  on,',
    '  off,',
    '  belumChip: belum.map(baca),',
    '};',
  ].join('\n'),
  90000,
);

R.check(
  'S1',
  !!out.on && out.on.chip?.enabled === '1' && /^enabled$/i.test(out.on.chip?.teks ?? ''),
  out.on
    ? `paket hidup ${out.on.id}: chip="${out.on.chip?.teks}" data-enabled=${out.on.chip?.enabled}`
    : 'tidak ada paket terpasang untuk diuji',
);

R.check(
  'S2',
  !!out.off && out.off.chip?.enabled === '0' && /^disabled$/i.test(out.off.chip?.teks ?? ''),
  out.off
    ? `paket mati ${out.off.id}: chip="${out.off.chip?.teks}" data-enabled=${out.off.chip?.enabled}`
    : 'tidak ada paket terpasang untuk diuji',
);

R.check(
  'S3',
  out.belumChip.every((c) => c === null),
  `kartu yang BELUM terpasang tidak punya chip status (${out.belumChip.filter((c) => c === null).length}/${out.belumChip.length} tanpa chip)`,
);

R.selesai();
keluarBersih();
