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

const PORT = process.argv[2] ?? '9223';
const R = reporter('ekstensi-ikon');

function tulisPaket(id, nama, ikon) {
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
  return dir;
}

/* Format VS Code asli: definisi font + peta ekstensi. Tidak ada `glyph`. */
const dirFont = tulisPaket('uji.vsc-ikon-font', 'Uji VSC Font', {
  iconDefinitions: {
    _zz: { fontCharacter: '\\ue003', fontColor: '#123456' },
  },
  fileExtensions: { zzig: '_zz' },
});

/* Format VS Code yang hanya menunjuk GAMBAR: tidak bisa digambar sebagai glyph. */
const dirGambar = tulisPaket('uji.vsc-ikon-gambar', 'Uji VSC Gambar', {
  iconDefinitions: { _qq: { iconPath: './qq.svg' } },
  fileExtensions: { qqext: '_qq' },
});

const list = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).filter(
  (x) => x.type === 'page',
);
const t = list.find((x) => isApp(x) && (x.url ?? '').includes('#agents'));
if (!t) {
  R.check('I0', false, 'window Agents tidak ada di :' + PORT);
  R.selesai();
  keluarBersih(1);
}
const cdp = await Cdp.connect(t.webSocketDebuggerUrl);
R.check('I0', true, 'window Agents tersambung');

const hasil = await cdp.runAsync(
  [
    'const Ex = window.__ZEPHYR_EXT19__;',
    `const dirFont = ${JSON.stringify(dirFont)};`,
    `const dirGambar = ${JSON.stringify(dirGambar)};`,
    'const sebelumFont = Ex.ikonUntukExt("zzig");',
    'const sebelumGambar = Ex.ikonUntukExt("qqext");',
    'await Ex.install(dirFont);',
    'await new Promise(r => setTimeout(r, 900));',
    'await Ex.install(dirGambar);',
    'await new Promise(r => setTimeout(r, 900));',
    'const st = Ex.state();',
    'for (const id of ["uji.vsc-ikon-font", "uji.vsc-ikon-gambar"]) {',
    '  const e = st.manifests.find(m => m.manifest && m.manifest.id === id);',
    '  if (e) await st.setEnabled(id, true);',
    '}',
    'await Ex.muatSemua();',
    'await new Promise(r => setTimeout(r, 700));',
    'const sesudahFont = Ex.ikonUntukExt("zzig");',
    'const sesudahGambar = Ex.ikonUntukExt("qqext");',
    'return { sebelumFont, sebelumGambar, sesudahFont, sesudahGambar };',
  ].join('\n'),
  90000,
);

R.check(
  'I1',
  hasil.sebelumFont === null &&
    !!hasil.sesudahFont &&
    typeof hasil.sesudahFont.glyph === 'string' &&
    hasil.sesudahFont.glyph.length > 0,
  `format VS Code (fontCharacter) DIDAFTARKAN: zzig ${JSON.stringify(hasil.sebelumFont)} -> ` +
    `glyph U+${(hasil.sesudahFont?.glyph ?? '').codePointAt(0)?.toString(16).toUpperCase() ?? '?'} ` +
    `warna ${hasil.sesudahFont?.color}`,
);

R.check(
  'I2',
  hasil.sebelumGambar === null && hasil.sesudahGambar === null,
  `paket iconPath (gambar) TIDAK diklaim: qqext tetap ${JSON.stringify(hasil.sesudahGambar)}`,
);

/* Bersihkan: hapus paket uji dan muat ulang daftar. */
await cdp.runAsync(
  [
    'const Ex = window.__ZEPHYR_EXT19__;',
    'for (const id of ["uji.vsc-ikon-font", "uji.vsc-ikon-gambar"]) {',
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
} catch {
  /* temp dir */
}

R.selesai();
keluarBersih();
