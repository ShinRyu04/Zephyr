/*
 * verify-ekstensi-ikon.mjs — a VS Code icon theme must CHANGE the file tree.
 *
 * Pakai:  node scripts/verify-ekstensi-ikon.mjs [portCdp]
 * Syarat: zephyr.exe hidup dengan --remote-debugging-port=9223.
 *
 * Kenapa ini ada. Keluhan pembaca: "ekstensi terpasang tapi tidak ada yang
 * berubah". Untuk icon theme format VS Code itu dulu BENAR secara harfiah —
 * paketnya dihitung "0 icon definitions" karena glyph-nya hidup di
 * `fontCharacter`, bukan di kunci `glyph`, jadi tidak ada satu pun ikon yang
 * digambar. Perbaikannya membaca `fontCharacter`; uji ini menahannya:
 *
 *   I1  paket format VS Code (iconDefinitions + fontCharacter) benar-benar
 *       mendaftarkan glyph untuk ekstensi yang sebelumnya TIDAK punya.
 *   I2  paket yang hanya punya `iconPath` (gambar) TIDAK diklaim didukung:
 *       tidak ada glyph yang didaftarkan, karena Zephyr menggambar glyph.
 *
 * Paket uji dibuat di direktori sementara dan dihapus lagi di akhir, jadi
 * `installed.json` pembaca tidak berubah setelah uji.
 */

import { Cdp, sleep, reporter, keluarBersih } from './lib-cdp.mjs';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const APP_ORIGIN = /(localhost:5173|tauri\.localhost|127\.0\.0\.1:5173)/;
/** The app window (never a stray test-server page another harness left open). */
const isApp = (t) => APP_ORIGIN.test(t.url ?? '');

/*
 * ── Kenapa uji ini ditulis ulang ───────────────────────────────────────────
 *
 * Versi lama menguji "paket VS Code mendaftarkan glyph TANPA dipilih", dan itu
 * tidak lagi benar: Zephyr sekarang punya SATU tema aktif, jadi paket yang baru
 * dipasang tidak langsung menggambar apa pun sampai dipilih. Klaim lamanya
 * ("terpasang = langsung berlaku") justru bug yang sudah diperbaiki.
 *
 * Yang diuji sekarang, sesuai perilaku nyata:
 *
 *   I1  paket format VS Code (fontCharacter) TERBACA sebagai paket ikon -
 *       muncul di daftar paket dengan jumlah ikon > 0.
 *   I2  setelah paket itu DIPILIH, ekstensinya benar-benar menghasilkan ikon.
 *   I3  paket yang hanya menunjuk PNG tidak menghasilkan gambar (pohon
 *       menyisipkan SVG, bukan raster).
 */
const PORT = process.argv[2] ?? '9223';
const R = reporter('ekstensi-ikon');

function tulisPaket(id, nama, ikon, berkas = {}) {
  const dir = mkdtempSync(join(tmpdir(), `zephyr-ikon-${id.replace(/\W/g, '-')}-`));
  mkdirSync(join(dir, 'icons'), { recursive: true });
  writeFileSync(
    join(dir, 'zephyr-extension.json'),
    JSON.stringify(
      {
        id,
        name: nama,
        version: '1.0.0',
        publisher: 'uji',
        contributes: { iconThemes: [{ id: 'vsc', label: nama, path: 'icons/vsc.json' }] },
      },
      null,
      2,
    ),
  );
  writeFileSync(join(dir, 'icons', 'vsc.json'), JSON.stringify(ikon, null, 2));
  /* Berkas gambar yang dirujuk `iconPath` harus BENAR-BENAR ada: paket yang
     menunjuk berkas hilang diuji sebagai "tidak ada ikon", bukan "svg didukung",
     dan itu akan lolos dengan alasan yang salah. */
  for (const [namaBerkas, isi] of Object.entries(berkas)) {
    writeFileSync(join(dir, 'icons', namaBerkas), isi);
  }
  return dir;
}

/* Format VS Code asli: definisi font + peta ekstensi. Tidak ada `glyph`. */
const dirFont = tulisPaket('uji.vsc-ikon-font', 'Uji VSC Font', {
  iconDefinitions: {
    _zz: { fontCharacter: '\\ue003', fontColor: '#123456' },
  },
  fileExtensions: { zzig: '_zz' },
});

/* Format VS Code yang menunjuk GAMBAR SVG: sekarang DIDUKUNG (digambar). */
const dirGambar = tulisPaket(
  'uji.vsc-ikon-gambar',
  'Uji VSC Gambar',
  {
    iconDefinitions: { _qq: { iconPath: './qq.svg' } },
    fileExtensions: { qqext: '_qq' },
  },
  { 'qq.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="currentColor"/></svg>' },
);

/* Format VS Code yang menunjuk PNG: TIDAK didukung - pohon menyisipkan SVG. */
const dirPng = tulisPaket(
  'uji.vsc-ikon-png',
  'Uji VSC Png',
  {
    iconDefinitions: { _pp: { iconPath: './pp.png' } },
    fileExtensions: { ppext: '_pp' },
  },
  { 'pp.png': Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
);

/*
 * The Agents window is not required any more.
 *
 * This probe used to demand `#agents` because the icon map lived there. It lives
 * in the MAIN window now (the file tree is there), and requiring a window the
 * test never uses made the whole probe fail with "window Agents tidak ada" on
 * every normal run - a prerequisite that proved nothing.
 */
const list = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).filter(
  (x) => x.type === 'page',
);
const t = list.find((x) => isApp(x) && !(x.url ?? '').includes('#panel='));
if (!t) {
  R.check('I0', false, 'jendela utama tidak ada di :' + PORT);
  R.selesai();
  keluarBersih(1);
}
const cdp = await Cdp.connect(t.webSocketDebuggerUrl);
R.check('I0', true, 'jendela utama tersambung');

const hasil = await cdp.runAsync(
  [
    'const Ex = window.__ZEPHYR_EXT19__;',
    `const dirFont = ${JSON.stringify(dirFont)};`,
    `const dirGambar = ${JSON.stringify(dirGambar)};`,
    `const dirPng = ${JSON.stringify(dirPng)};`,
    'const sebelumFont = Ex.ikonUntukExt("zzig");',
    'const sebelumGambar = Ex.ikonUntukExt("qqext");',
    'await Ex.install(dirFont);',
    'await new Promise(r => setTimeout(r, 900));',
    'await Ex.install(dirGambar);',
    'await new Promise(r => setTimeout(r, 900));',
    'await Ex.install(dirPng);',
    'await new Promise(r => setTimeout(r, 900));',
    /*
     * Read the manifest list FRESH, then enable, then reload.
     *
     * `Ex.state()` was captured before the installs, so `st.manifests` did not
     * contain the new packages and the loop enabled nothing - the packs stayed
     * disabled, the loader skipped them, and the probe reported "not
     * registered" for a feature that works. Refresh first, enable, then reload.
     */
    'await Ex.refresh();',
    'await new Promise(r => setTimeout(r, 600));',
    'for (const id of ["uji.vsc-ikon-font", "uji.vsc-ikon-gambar", "uji.vsc-ikon-png"]) {',
    '  try { await Ex.setEnabled(id, true); } catch (e) {}',
    '}',
    'await new Promise(r => setTimeout(r, 500));',
    'await Ex.muatSemua();',
    'await new Promise(r => setTimeout(r, 900));',
    /* Paket yang terbaca - inilah yang membuktikan formatnya DIDUKUNG. */
    'const paket = Ex.themesEkstensi ? null : null;',
    'const st2 = Ex.state();',
    'const daftarIkon = (window.__ZEPHYR_IKON_TEMA_STORE__?.getState?.().packs ?? []).map(p => ({ id: p.extId, ikon: Object.keys(p.ikon).length }));',
    /* Pilih paket uji font, lalu ukur ekstensinya. */
    'const paketFont = (window.__ZEPHYR_IKON_TEMA_STORE__?.getState?.().packs ?? []).find(p => p.extId.includes("uji.vsc-ikon-font"));',
    'let sesudahFont = null;',
    'if (paketFont) {',
    '  window.__ZEPHYR_IKON_TEMA_STORE__.getState().pilih(paketFont.extId);',
    '  await new Promise(r => setTimeout(r, 700));',
    '  sesudahFont = Ex.ikonUntukExt("zzig");',
    '}',
    'const paketPng = (window.__ZEPHYR_IKON_TEMA_STORE__?.getState?.().packs ?? []).find(p => p.extId.includes("uji.vsc-ikon-png"));',
    'let sesudahPng = null;',
    'if (paketPng) {',
    '  window.__ZEPHYR_IKON_TEMA_STORE__.getState().pilih(paketPng.extId);',
    '  await new Promise(r => setTimeout(r, 700));',
    '  sesudahPng = Ex.ikonUntukExt("ppext");',
    '}',
    'return { sebelumFont, sebelumGambar, sesudahFont, sesudahGambar: null, sesudahPng, daftarIkon };',
  ].join('\n'),
  120000,
);

R.check(
  'I1',
  (hasil.daftarIkon ?? []).some((p) => p.id.includes('uji.vsc-ikon-font') && p.ikon > 0),
  `format VS Code (fontCharacter) TERBACA: ${JSON.stringify((hasil.daftarIkon ?? []).filter((p) => p.id.includes('uji.')))}`,
);

R.check(
  'I2',
  !!hasil.sesudahFont &&
    (typeof hasil.sesudahFont.glyph === 'string' || typeof hasil.sesudahFont.svg === 'string'),
  `setelah DIPILIH, ekstensi zzig menghasilkan ikon: ${hasil.sesudahFont ? (hasil.sesudahFont.svg ? 'svg' : 'glyph U+' + (hasil.sesudahFont.glyph ?? '').codePointAt(0)?.toString(16)) : 'null'}`,
);

/*
 * I3: a pack that only points at PNG must not produce a drawing.
 *
 * The tree inlines SVG; a raster iconPath cannot be inlined, so the row falls
 * back to the built-in art. Claiming otherwise would be the same lie the old
 * probe was written to catch.
 */
R.check(
  'I3',
  hasil.sesudahPng === null || !hasil.sesudahPng?.svg,
  `paket iconPath .png TIDAK menghasilkan gambar: ppext ${hasil.sesudahPng ? 'ada (salah)' : 'null (benar)'}`,
);

/* Bersihkan: hapus paket uji dan muat ulang daftar. */
await cdp.runAsync(
  [
    'const Ex = window.__ZEPHYR_EXT19__;',
    'for (const id of ["uji.vsc-ikon-font", "uji.vsc-ikon-gambar", "uji.vsc-ikon-png"]) {',
    '  try { await Ex.uninstall(id); } catch {}',
    '}',
    'await new Promise(r => setTimeout(r, 500));',
    'await Ex.muatSemua();',
    'return 1;',
  ].join('\n'),
  40000,
);
try {
  rmSync(dirFont, { recursive: true, force: true });
  rmSync(dirGambar, { recursive: true, force: true });
  rmSync(dirPng, { recursive: true, force: true });
} catch {
  /* temp dir */
}

R.selesai();
keluarBersih();
