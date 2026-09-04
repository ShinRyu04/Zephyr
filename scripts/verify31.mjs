// verify31.mjs — verifikasi fase 31 (accessibility pass).
//
// Pakai:  node scripts/verify31.mjs [portCdp]
// Syarat: zephyr.exe --remote-debugging-port=9223 + `npm run dev`.
//
// V1 tsc bersih
// V2 Navigasi penuh TANPA mouse: palette → cari file → buka → panel Problems →
//    Settings, semua lewat keyboard; focus trap dialog mengurung Tab
// V3 Pohon aksesibilitas benar (role/nama tab, tree, editor, live region) —
//    diperiksa lewat CDP Accessibility.getFullAXTree, POHON YANG SAMA yang
//    dibaca Narrator. Narrator sendiri tidak bisa diotomasi; itu dinyatakan
//    apa adanya, tidak diklaim lulus.
// V4 Kontras >= AA untuk 7 tema (angka dilaporkan); high-contrast aktif & AAA
// V5 prefers-reduced-motion + setelan app mematikan animasi; font scaling
//    (zoom 50-200%) tidak merusak layout
// V6 axe-core: 0 pelanggaran critical/serious
//
// Library context7 fase ini: React 18 (WAI-ARIA), axe-core 4.13.0.
//
// PERINGATAN PERMANEN: JANGAN pakai backtick di komentar yang berada DI DALAM
// template literal — template tertutup lebih awal dan `node --check` tetap
// lolos. Sudah kena 4 kali (verify26, verify25, fixture22, verify22).

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { Cdp } from './lib-cdp.mjs';
import { bagian1 } from './v31/bagian1.mjs';
import { bagian2 } from './v31/bagian2.mjs';

const PORT = process.argv[2] || '9223';
const AKAR = path.resolve(import.meta.dirname, '..');

const F = {
  akar: AKAR,
  axeJs: path.join(AKAR, 'node_modules/axe-core/axe.min.js'),
  fileUji: 'D:/Zephyr/.zephyr/uji31/a11y-target.ts',
  dir: 'D:/Zephyr/.zephyr/uji31',
};

const hasil = [];
const check = (id, ok, detail) => {
  hasil.push({ id, ok: !!ok, detail });
  console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${id}  ${detail}`);
};

async function main() {
  // Fixture minimal: satu file untuk dibuka lewat keyboard di V2.
  fs.mkdirSync(F.dir, { recursive: true });
  fs.writeFileSync(
    F.fileUji,
    [
      '// target uji fase 31 (accessibility)',
      'export const nilai = 1;',
      '',
      '// baris sengaja panjang untuk menguji layout saat zoom 200%:',
      'export const panjang = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";',
      '',
    ].join('\n'),
    'utf8',
  );

  const { cdp } = await Cdp.attach(PORT);

  // Keadaan awal bersih (pelajaran fase 08/28: Settings yang tertinggal
  // terbuka membuat harness lain gagal karena editor tidak dirender).
  await cdp.json(`
    S.getState().setSettingsOpen(false);
    for (const t of [...S.getState().tabs]) S.getState().forceCloseTab(t.id);
    await S.getState().openWorkspace('D:/Zephyr');
    await wait(700);
    return JSON.stringify({ ws: S.getState().workspace })
  `);

  // ═══════════════════ V1: tsc 0 error ═══════════════════
  const tsc = spawnSync(process.execPath, ['node_modules/typescript/lib/tsc.js', '--noEmit'], {
    cwd: AKAR,
    encoding: 'utf8',
    timeout: 300000,
  });
  const barisError = (tsc.stdout || '').split('\n').filter((l) => /error TS\d+/.test(l));
  check(
    'F31-V1',
    tsc.status === 0 && barisError.length === 0,
    `tsc exit ${tsc.status}, ${barisError.length} error${
      barisError.length ? `: ${barisError[0].slice(0, 90)}` : ''
    }`,
  );

  await bagian1(cdp, check, F);
  await bagian2(cdp, check, F, { fs, spawnSync, path });

  const lulus = hasil.filter((x) => x.ok).length;
  console.log(`\n== ${lulus}/${hasil.length} lulus ==`);
  process.exit(lulus === hasil.length ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
