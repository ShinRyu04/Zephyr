// verify24.mjs — verifikasi fase 24 (Editor Extras).
//
// Pakai:  node scripts/verify24.mjs [portCdp]
// Syarat: zephyr.exe dengan --remote-debugging-port=9223 + `npm run dev`.
//
// Peta V → brief fase 24:
//   V1 tsc bersih (+ cargo build)
//   V2 Breadcrumbs tampil + klik symbol lompat; sticky scroll menempel
//   V3 Minimap render file 5000 baris tanpa jank (frame dicatat); marker error
//   V4 Color decorator: #ff0000 tampil swatch; ubah via picker mengubah teks
//   V5 Bracket colorization + Ctrl+D multi-cursor + Alt+Up move line
//   V6 Semua toggle via Settings & menu View bekerja & persist
//
// CATATAN HARNESS: prelude lib-cdp.mjs SUDAH menyediakan S, s, q, qa, wait,
// CP, LSP, EX — jangan deklarasi ulang. `X` milik bridge AI, bukan extras.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Cdp, reporter } from './lib-cdp.mjs';
import { bagianA } from './v24/bagianA.mjs';
import { bagianB } from './v24/bagianB.mjs';

const CDP_PORT = process.argv[2] ?? '9223';
const { check, selesai } = reporter('verify24');

/** File uji di DALAM repo supaya tsserver memakai tsconfig.json asli. */
export const FILE_UJI = 'D:/Zephyr/src/__uji24.ts';
export const FILE_BESAR = 'D:/Zephyr/src/__uji24_besar.ts';

const ISI_UJI = [
  'export class KotakWarna {',
  '  // Sengaja beberapa warna dengan format berbeda (V4).',
  '  merah = "#ff0000";',
  '  biru = "rgb(0, 0, 255)";',
  '  hijau = "hsl(120, 100%, 50%)";',
  '',
  '  hitung(n: number): number[] {',
  '    const keluar: number[] = [];',
  '    if (n > 0) {',
  '      for (let i = 0; i < n; i++) {',
  '        keluar.push(((i * 2) + 1));',
  // Isian panjang DISENGAJA: tanpa ini file lebih pendek dari viewport, tidak
  // ada scroll yang mungkin, dan sticky scroll tidak pernah benar-benar teruji.
  ...Array.from(
    { length: 70 },
    (_, i) => `        keluar.push(${i} + (n % ${(i % 7) + 2}));`,
  ),
  '      }',
  '    }',
  '    return keluar;',
  '  }',
  '',
  '  ulangi(n: number): string {',
  '    const kata = "ulang";',
  '    const lain = kata;',
  '    return kata + lain + n;',
  '  }',
  '}',
  '',
  '// Karakter unicode ambigu DISENGAJA (tanda kutip cerdas):',
  'export const pesan = "hal\u2019o";',
  '',
  'export function bantu(a: number, b: number): number {',
  '  return a + b;',
  '}',
  '',
].join('\n');

/** 5000 baris untuk V3. Dibuat berulang tapi tidak identik supaya minimap
 *  benar-benar punya variasi panjang baris untuk digambar. */
const isiBesar = () => {
  const baris = ['export const daftarBesar = ['];
  for (let i = 0; i < 5000; i++) {
    const pad = '  '.repeat((i % 5) + 1);
    baris.push(`${pad}{ id: ${i}, nama: "item-${i}", nilai: ${(i * 7) % 991} },`);
  }
  baris.push('];', '');
  return baris.join('\n');
};

const tulisFixture = () => {
  fs.writeFileSync(FILE_UJI.replace(/\//g, path.sep), ISI_UJI);
  fs.writeFileSync(FILE_BESAR.replace(/\//g, path.sep), isiBesar());
};
const hapusFixture = () => {
  for (const f of [FILE_UJI, FILE_BESAR]) {
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

  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});

  if ((await cdp.eval('typeof window.__ZEPHYR_EXTRAS__')) === 'undefined') {
    throw new Error('__ZEPHYR_EXTRAS__ tidak ada — reload halaman (devBridge fase 24)');
  }

  // ═════════ V1: tsc + cargo (SEBELUM fixture ditulis) ═════════
  // Fixture V4 memuat unicode ambigu & file 5000 baris; menjalankan tsc setelah
  // itu berarti menguji fixture, bukan kode Zephyr (pelajaran fase 21).
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
    `tsc --noEmit exit ${tsc.status} (sebelum fixture ditulis); cargo build exit ` +
      `${cargo.status}, ${cargoErr.length} error` +
      (tsc.status !== 0 ? `\n${(tsc.stdout || '').split('\n').slice(0, 6).join('\n')}` : '') +
      (cargoErr.length > 0 ? `\n${cargoErr.join('\n')}` : ''),
  );

  tulisFixture();

  // Menulis file di src/ memicu Vite HMR → FULL RELOAD halaman. Reload itu
  // menghapus window[slot] milik runAsync di tengah jalan ("undefined is not
  // valid JSON") DAN menghapus semua bridge devBridge sesaat. Jadi: tulis
  // fixture dulu, tunggu reload selesai, baru mulai menempel.
  await new Promise((r) => setTimeout(r, 6000));
  for (let i = 0; i < 20; i++) {
    const siap = await cdp.eval('typeof window.__ZEPHYR_EXTRAS__');
    if (siap === 'object') break;
    await new Promise((r) => setTimeout(r, 500));
  }

  // Bersihkan state & nyalakan semua extras.
  await cdp.runAsync(
    `
    S.getState().tabs.slice().forEach((t) => S.getState().forceCloseTab(t.id));
    S.getState().setSettingsOpen(false);
    S.getState().setFindOpen(false);
    window.__ZEPHYR_PANEL__.problems.clearAll();
    await S.getState().applySettings({
      general: { lowRam: false },
      editor: { breadcrumbs: true, stickyScroll: true, stickyScrollMaxLines: 3,
                minimap: true, minimapRenderCharacters: false, indentGuides: true,
                colorDecorators: true, unicodeHighlight: true,
                bracketPairColorization: true },
    });
    await S.getState().openWorkspace('D:/Zephyr');
    await wait(900);
    window.__ZEPHYR_NOTIF__.clear();
    return 'siap';
  `,
    90000,
  );

  await bagianA(cdp, check, FILE_UJI, FILE_BESAR);
  await bagianB(cdp, check, FILE_UJI);

  // Kembalikan default.
  await cdp.runAsync(
    `
    S.getState().tabs.slice().forEach((t) => S.getState().forceCloseTab(t.id));
    S.getState().setFindOpen(false);
    S.getState().setSettingsOpen(false);
    window.__ZEPHYR_PANEL__.problems.clearAll();
    await S.getState().applySettings({
      editor: { breadcrumbs: true, stickyScroll: false, stickyScrollMaxLines: 3,
                minimap: false, minimapRenderCharacters: false, indentGuides: true,
                colorDecorators: true, unicodeHighlight: true,
                bracketPairColorization: true },
    });
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
  console.error('verify24 error:', e.message);
  hapusFixture();
  process.exit(1);
});
