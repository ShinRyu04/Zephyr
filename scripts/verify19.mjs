// verify19.mjs — verifikasi fase 19 (Extensions: activity bar + loader).
//
// Pakai:  node scripts/verify19.mjs [portCdp]
// Syarat: zephyr.exe dengan --remote-debugging-port=9223 + `npm run dev`.
//
// Peta V → brief fase 19 (19.7):
//   V1  Ikon Extensions di activity bar KIRI; klik → ExtensionsView; Ctrl+Shift+X
//   V2  Pencarian memfilter katalog; Install → status Disable; installed.json naik
//   V3  Tema contoh → muncul di Settings→Theme; diterapkan mengubah warna app
//   V4  Keymap contoh → chord aktif + Source = ekstensi di Keyboard Shortcuts
//   V5  Language pack → .toml dapat parser + label bahasa dari ekstensi
//   V6  commands[] → muncul di palette & bisa dipanggil; handler JS TIDAK jalan
//   V7  Disable → kontribusi hilang; Enable → kembali
//   V8  Uninstall → konfirmasi → folder + entri hilang; kontribusi lenyap
//   V9  Install dari folder lokal (bukan katalog) berhasil
//   V10 Registry remote kosong → "tidak tersedia", BUKAN error
//   V11 tsc 0 + cargo test; RAM wajar (lang pack lazy)
//   V12 (commit dilakukan manual setelah 11/11 lulus)
//
// CATATAN HARNESS:
//  * Fixture ditulis di LUAR folder proyek (os.tmpdir) — menulis di dalam repo
//    memicu Vite HMR full reload yang menghapus window[slot] milik runAsync
//    di tengah jalan (pelajaran fase 24).
//  * prelude lib-cdp.mjs SUDAH menyediakan S, s, q, qa, wait, CP, LSP, EX, E19 —
//    jangan deklarasi ulang.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Cdp, reporter } from './lib-cdp.mjs';
import { bagian1 } from './v19/bagian1.mjs';
import { bagian2 } from './v19/bagian2.mjs';

const CDP_PORT = process.argv[2] ?? '9223';
const { check, selesai } = reporter('verify19');

/** Folder fixture di luar repo (hindari HMR). */
export const DIR_UJI = path.join(os.tmpdir(), 'zephyr-uji19');
/** Ekstensi lokal dengan commands[] + handler yang mencoba akses fs (V6/V9). */
export const EXT_LOKAL = path.join(DIR_UJI, 'uji.perkakas');
/** Ekstensi dengan manifest rusak (dipakai memastikan tidak bikin crash). */
export const EXT_RUSAK = path.join(DIR_UJI, 'uji.rusak');

const MANIFEST_LOKAL = {
  id: 'uji.perkakas',
  name: 'Perkakas Uji',
  publisher: 'uji',
  version: '2.1.0',
  description: 'Ekstensi lokal untuk verify19: commands + snippet.',
  engines: { zephyr: '>=1.0' },
  categories: ['Other', 'Snippets'],
  contributes: {
    commands: [
      { command: 'sapa', title: 'Perkakas: Sapa Dunia', description: 'uji command manifest' },
      { command: 'hitung', title: 'Perkakas: Hitung Baris' },
    ],
    snippets: [{ language: 'plain', path: './snippets/uji.json' }],
  },
};

const SNIPPET_LOKAL = {
  sapa: { prefix: 'sapa', body: ['Halo ${1:dunia}!'], description: 'sapaan uji' },
  blok: { prefix: 'blok', body: ['awal', '\t${1:isi}', 'akhir'], description: 'blok uji' },
};

/** Handler JS yang SENGAJA mencoba akses fs — v1 tidak boleh menjalankannya. */
const HANDLER_JAHAT = `
// Kalau file ini pernah dieksekusi, jejaknya akan terlihat di window.
globalThis.__EKSTENSI_JALAN__ = true;
try {
  const fs = require('fs');
  globalThis.__EKSTENSI_BACA_FS__ = fs.readdirSync('C:/').length;
} catch (e) {
  globalThis.__EKSTENSI_FS_ERROR__ = String(e);
}
export function main() { return 'seharusnya tidak pernah dipanggil'; }
`;

const tulisFixture = () => {
  fs.rmSync(DIR_UJI, { recursive: true, force: true });
  fs.mkdirSync(path.join(EXT_LOKAL, 'snippets'), { recursive: true });
  fs.writeFileSync(
    path.join(EXT_LOKAL, 'zephyr-extension.json'),
    JSON.stringify(MANIFEST_LOKAL, null, 2),
  );
  fs.writeFileSync(
    path.join(EXT_LOKAL, 'snippets', 'uji.json'),
    JSON.stringify(SNIPPET_LOKAL, null, 2),
  );
  fs.writeFileSync(path.join(EXT_LOKAL, 'index.js'), HANDLER_JAHAT);

  fs.mkdirSync(EXT_RUSAK, { recursive: true });
  fs.writeFileSync(
    path.join(EXT_RUSAK, 'zephyr-extension.json'),
    '{ "id": "uji.rusak", "name": kurung tidak ditutup',
  );
};

const hapusFixture = () => {
  try {
    fs.rmSync(DIR_UJI, { recursive: true, force: true });
  } catch {
    /* abaikan */
  }
};

/** Bersihkan ekstensi uji yang mungkin tertinggal dari run sebelumnya. */
const bersihkanTerpasang = async (cdp) => {
  await cdp.runAsync(
    `
    const E = window.__ZEPHYR_EXT19__;
    await E.refresh();
    for (const x of E.terpasang()) {
      if (x.id.startsWith('uji.') || x.id.startsWith('zephyr.')) {
        await E.uninstall(x.id);
      }
    }
    await E.refresh();
    return E.terpasang().length;
  `,
    90000,
  );
};

const main = async () => {
  const { cdp, page } = await Cdp.attach(CDP_PORT);
  console.log(`# target: ${page.title}\n`);
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});

  if ((await cdp.eval('typeof window.__ZEPHYR_EXT19__')) === 'undefined') {
    throw new Error('__ZEPHYR_EXT19__ tidak ada — reload halaman (devBridge fase 19)');
  }

  // ═════════ V11 (bagian statis): tsc + cargo test SEBELUM fixture ═════════
  const tsc = spawnSync(process.execPath, ['node_modules/typescript/lib/tsc.js', '--noEmit'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  const cargo = spawnSync('cargo', ['test', '--lib', '--quiet'], {
    cwd: path.join(process.cwd(), 'src-tauri'),
    encoding: 'utf8',
    shell: true,
  });
  const cargoOk = cargo.status === 0;

  tulisFixture();

  // Bersihkan state & pastikan panel siap.
  await cdp.runAsync(
    `
    S.getState().tabs.slice().forEach((t) => S.getState().forceCloseTab(t.id));
    S.getState().setSettingsOpen(false);
    S.getState().setFindOpen(false);
    if (TS().visible) TS().setVisible(false);
    await S.getState().applySettings({
      general: { theme: 'dark' },
      theme: { current: 'zephyr-dark', accent: '' },
    });
    window.__ZEPHYR_NOTIF__.clear();
    return 'siap';
  `,
    60000,
  );
  await bersihkanTerpasang(cdp);

  await bagian1(cdp, check, { DIR_UJI, EXT_LOKAL, EXT_RUSAK });
  await bagian2(cdp, check, { DIR_UJI, EXT_LOKAL, EXT_RUSAK, tsc, cargo, cargoOk });

  // Kembalikan keadaan: lepas semua ekstensi uji, tema default.
  await bersihkanTerpasang(cdp);
  await cdp.runAsync(
    `
    await S.getState().applySettings({
      general: { theme: 'dark' },
      theme: { current: 'zephyr-dark', accent: '' },
    });
    S.getState().tabs.slice().forEach((t) => S.getState().forceCloseTab(t.id));
    S.getState().setActivity('explorer');
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
  console.error('verify19 error:', e.message);
  hapusFixture();
  process.exit(1);
});
