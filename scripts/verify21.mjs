// verify21.mjs — verifikasi fase 21 (LSP / Language Intelligence).
//
// Pakai:  node scripts/verify21.mjs [portCdp]
// Syarat: zephyr.exe dengan --remote-debugging-port=9223 + `npm run dev`.
//
// Peta V → spesifikasi fase 21:
//   V1  tsc 0 error; cargo build tanpa error
//   V2  buka .ts → server start (tercatat di Output "LSP"); completion, hover,
//       dan go-to-definition benar-benar menjawab
//   V3  kesalahan tipe → squiggle + entri Problems + badge status bar
//   V4  rename mengubah semua referensi; format merapikan dokumen
//   V5  tutup semua .ts → server mati setelah idle (proses benar-benar hilang)
//   V6  bahasa dinonaktifkan di Settings → server tidak start
//
// Bagian dipecah ke scripts/v21/*.mjs supaya tiap file kecil.
//
// CATATAN HARNESS (jangan diulang): variabel `s` di prelude lib-cdp.mjs adalah
// SNAPSHOT state saat runAsync dimulai. Setelah openPath, daftar tab hanya
// terlihat lewat `S.getState()` — memakai `s.tabs` menghasilkan undefined.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Cdp, reporter } from './lib-cdp.mjs';
import { bagian1 } from './v21/bagian1.mjs';
import { bagian2 } from './v21/bagian2.mjs';

const CDP_PORT = process.argv[2] ?? '9223';
const { check, selesai } = reporter('verify21');

/** File uji ditaruh DI DALAM repo supaya tsserver memakai tsconfig.json asli;
 *  di %TEMP% tsserver tidak punya konteks proyek dan diagnostics beda. */
export const FILE_UJI = 'D:/Zephyr/src/__uji21.ts';
export const FILE_REF = 'D:/Zephyr/src/__uji21_ref.ts';

const ISI_UJI = [
  'export function tambahAngka(a: number, b: number): number {',
  '  return a + b;',
  '}',
  '',
  '// Kesalahan tipe DISENGAJA untuk V3: number tidak bisa ke string.',
  '// Sengaja di-EXPORT: tsconfig repo ini memakai noUnusedLocals, jadi variabel',
  '// lokal yang tak terpakai memunculkan TS6133 sebagai error KEDUA dan uji',
  '// "error hilang setelah diperbaiki" tidak pernah bisa mencapai nol.',
  'export const salahTipe: string = tambahAngka(1, 2);',
  '',
  'export const hasil = tambahAngka(3, 4);',
  'export const lagi = tambahAngka(5, 6);',
  '',
].join('\n');

const ISI_REF = [
  "import { tambahAngka } from './__uji21';",
  '',
  'export const dariFileLain = tambahAngka(7, 8);',
  '',
].join('\n');

const tulisFixture = () => {
  fs.writeFileSync(FILE_UJI.replace(/\//g, path.sep), ISI_UJI);
  fs.writeFileSync(FILE_REF.replace(/\//g, path.sep), ISI_REF);
};

const hapusFixture = () => {
  for (const f of [FILE_UJI, FILE_REF]) {
    try {
      fs.rmSync(f.replace(/\//g, path.sep), { force: true });
    } catch {
      /* abaikan */
    }
  }
};

const main = async () => {
  const { cdp, page } = await Cdp.attach(CDP_PORT);
  console.log(`# target: ${page.title}\n`);

  // WebView2 tanpa fokus OS: element.focus() tidak memindah activeElement
  // (pelajaran fase 18) — completion & hover butuh view yang benar-benar fokus.
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});

  if ((await cdp.eval('typeof window.__ZEPHYR_LSP__')) === 'undefined') {
    throw new Error('__ZEPHYR_LSP__ tidak ada — reload halaman (devBridge fase 21)');
  }

  // ═════════ V1: tsc + cargo ═════════
  // DIJALANKAN SEBELUM fixture ditulis. Fixture V3 memang berisi kesalahan tipe
  // yang disengaja; kalau tsc dijalankan setelahnya, V1 gagal karena file uji
  // kita sendiri, bukan karena kode Zephyr.
  const tsc = spawnSync(process.execPath, ['node_modules/typescript/lib/tsc.js', '--noEmit'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  const cargo = spawnSync('cargo', ['build', '--quiet'], {
    cwd: path.join(process.cwd(), 'src-tauri'),
    encoding: 'utf8',
    shell: true,
  });
  const cargoErr = (cargo.stderr || '')
    .split('\n')
    .filter((l) => l.startsWith('error'))
    .slice(0, 4);
  check(
    'V1',
    tsc.status === 0 && cargoErr.length === 0,
    `tsc --noEmit exit ${tsc.status} (dijalankan sebelum fixture uji ditulis); ` +
      `cargo build exit ${cargo.status}, ${cargoErr.length} error` +
      (tsc.status !== 0 ? `\n${(tsc.stdout || '').split('\n').slice(0, 6).join('\n')}` : '') +
      (cargoErr.length > 0 ? `\n${cargoErr.join('\n')}` : ''),
  );

  tulisFixture();

  // Bersihkan state.
  await cdp.runAsync(
    `
    const L = window.__ZEPHYR_LSP__;
    const P = window.__ZEPHYR_PANEL__;
    await L.stopAll();
    S.getState().tabs.slice().forEach((t) => S.getState().forceCloseTab(t.id));
    S.getState().setSettingsOpen(false);
    P.problems.clearAll();
    P.output.clear('lsp');
    await S.getState().applySettings({ lsp: { enabled: true, idleSeconds: 300, servers: {} } });
    await S.getState().openWorkspace('D:/Zephyr');
    await wait(900);
    window.__ZEPHYR_NOTIF__.clear();
    return 'siap';
  `,
    90000,
  );

  await bagian1(cdp, check, FILE_UJI);
  await bagian2(cdp, check, FILE_UJI, FILE_REF);

  // Kembalikan keadaan bersih.
  await cdp.runAsync(
    `
    const L = window.__ZEPHYR_LSP__;
    await L.stopAll();
    S.getState().tabs.slice().forEach((t) => S.getState().forceCloseTab(t.id));
    window.__ZEPHYR_PANEL__.problems.clearAll();
    await S.getState().applySettings({ lsp: { enabled: true, idleSeconds: 300, servers: {} } });
    window.__ZEPHYR_NOTIF__.clear();
    return 'beres';
  `,
    60000,
  );

  await cdp.close();
  hapusFixture();
  selesai();
};

main().catch((e) => {
  console.error('verify21 error:', e.message);
  hapusFixture();
  process.exit(1);
});
