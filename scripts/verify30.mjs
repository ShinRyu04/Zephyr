// verify30.mjs — verifikasi fase 30 (snippets engine).
//
// Pakai:  node scripts/verify30.mjs [portCdp]
// Syarat: zephyr.exe --remote-debugging-port=9223 + `npm run dev`.
//
// V1 tsc bersih (dijalankan lewat jalur produk, bukan diasumsikan)
// V2 Ketik prefix -> snippet muncul di completion; accept -> placeholder aktif
// V3 Tab/Shift+Tab menavigasi stop; mengubah ${1} mengubah occurrence lain
// V4 ${TM_SELECTED_TEXT} memakai seleksi; ${CURRENT_YEAR} terisi benar
// V5 User snippet dari file json termuat; snippet ekstensi (19) muncul;
//    prioritas user > ekstensi > bawaan
//
// Library context7 yang dipakai fase ini: /codemirror/autocomplete
// (snippet, snippetKeymap, nextSnippetField, prevSnippetField, clearSnippet).
//
// PERINGATAN PERMANEN: JANGAN pakai backtick di komentar yang berada DI DALAM
// template literal — template tertutup lebih awal dan `node --check` tetap
// lolos. Sudah kena 4 kali (verify26, verify25, fixture22, verify22).

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { Cdp } from './lib-cdp.mjs';
import { bagian1 } from './v30/bagian1.mjs';
import { bagian2 } from './v30/bagian2.mjs';

const PORT = process.argv[2] || '9223';
const AKAR = path.resolve(import.meta.dirname, '..');
const APPDATA = process.env.APPDATA || 'C:/Users/home/AppData/Roaming';

const F = {
  dir: 'D:/Zephyr/.zephyr/uji30',
  ts: 'D:/Zephyr/.zephyr/uji30/target30.ts',
  rs: 'D:/Zephyr/.zephyr/uji30/target30.rs',
  userSnip: path.join(APPDATA, 'zephyr', 'snippets', 'typescript.json'),
  extDir: path.join(APPDATA, 'zephyr', 'extensions', 'uji30-snippets'),
  extId: 'uji30-snippets',
};

const hasil = [];
const check = (id, ok, detail) => {
  hasil.push({ id, ok: !!ok, detail });
  console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${id}  ${detail}`);
};

async function main() {
  // Fixture dulu (tidak menyentuh workspace aktif, jadi tidak kena EBUSY
  // seperti fase 29 — fixture30 hanya menulis file, tidak menghapus folder).
  const fx = spawnSync(process.execPath, [path.join(AKAR, 'scripts/uji30/buat-fixture30.mjs')], {
    encoding: 'utf8',
  });
  if (fx.status !== 0) {
    console.error(`fixture gagal: ${fx.stderr || fx.stdout}`);
    process.exit(1);
  }

  const { cdp } = await Cdp.attach(PORT);

  // Keadaan awal bersih: tutup Settings + semua tab, workspace ke D:/Zephyr.
  // (Pelajaran fase 08/28: Settings yang tertinggal terbuka merusak harness
  // lain karena editor tidak dirender.)
  await cdp.json(`
    S.getState().setSettingsOpen(false);
    for (const t of [...S.getState().tabs]) S.getState().forceCloseTab(t.id);
    await S.getState().openWorkspace('D:/Zephyr');
    await wait(700);
    return JSON.stringify({ ws: S.getState().workspace })
  `);

  // ═══════════════════ V1: tsc 0 error (jalur produk) ═══════════════════
  //
  // spawnSync('npx.cmd') mengembalikan status null di MSYS/git-bash
  // (pelajaran fase 12) — tsc dipanggil lewat process.execPath.
  const tsc = spawnSync(process.execPath, ['node_modules/typescript/lib/tsc.js', '--noEmit'], {
    cwd: AKAR,
    encoding: 'utf8',
    timeout: 300000,
  });
  const barisError = (tsc.stdout || '').split('\n').filter((l) => /error TS\d+/.test(l));
  check(
    'F30-V1',
    tsc.status === 0 && barisError.length === 0,
    `tsc exit ${tsc.status}, ${barisError.length} error${
      barisError.length ? `: ${barisError[0].slice(0, 90)}` : ''
    }`,
  );

  await bagian1(cdp, check, F);
  await bagian2(cdp, check, F, { fs });

  const lulus = hasil.filter((x) => x.ok).length;
  console.log(`\n== ${lulus}/${hasil.length} lulus ==`);
  process.exit(lulus === hasil.length ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
