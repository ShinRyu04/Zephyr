// verify18.mjs — verifikasi fase 18 (Menu Bar + Keyboard Shortcuts).
//
// Pakai:  node scripts/verify18.mjs [portCdp]
// Syarat: zephyr.exe dengan --remote-debugging-port=9223 + `npm run dev`.
//
// Peta V → spesifikasi fase 18:
//   V1  menu bar tampil; klik File → dropdown; item punya accelerator
//   V2  Alt menyorot; Alt+F membuka File; panah + Enter memilih; Esc menutup
//   V3  palette menampilkan accelerator tiap command
//   V4  chord sequence Ctrl+K Ctrl+S; chord pertama tidak fire; Esc batal
//   V5  context key: fokus terminal vs editor menentukan pemilik Ctrl+Up
//   V6  F11 → fullscreen; saat debugActive → step-into (stub)
//   V7  remap file.save jadi Ctrl+Alt+S → menu + palette ikut berubah
//   V8  command yang fiturnya belum ada → item disabled, tidak crash
//   V9  chord editor (Ctrl+/, Alt+Up, Ctrl+D) tidak dicegat resolver global
//   V10 tsc 0; tidak ada chord yang menelan ketikan normal; 0 console error
//
// Bagian uji dipecah ke scripts/v18/*.mjs supaya tiap file tetap kecil.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Cdp, reporter } from './lib-cdp.mjs';
import { bagian1 } from './v18/bagian1.mjs';
import { bagian2 } from './v18/bagian2.mjs';
import { bagian3 } from './v18/bagian3.mjs';

const CDP_PORT = process.argv[2] ?? '9223';
const { check, selesai } = reporter('verify18');

/** File uji dibuka supaya command yang butuh tab aktif (file.save) hidup. */
const FILE_TAB = path.join(
  process.env.LOCALAPPDATA ?? '',
  'Temp',
  `zephyr-v18-tab-${process.pid}.ts`,
);

const main = async () => {
  fs.mkdirSync(path.dirname(FILE_TAB), { recursive: true });
  fs.writeFileSync(FILE_TAB, 'const a = 1;\nconst b = 2;\n');

  const { cdp, page } = await Cdp.attach(CDP_PORT);
  console.log(`# target: ${page.title}\n`);

  // WebView2 yang tidak dipegang OS melaporkan document.hasFocus() = false,
  // sehingga element.focus() TIDAK memindah document.activeElement dan context
  // key editorFocus/terminalFocus tidak pernah menyala. Focus emulation CDP
  // memperbaikinya — tanpa ini V9 gagal padahal aplikasinya benar.
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});

  if ((await cdp.eval('typeof window.__ZEPHYR_KB__')) === 'undefined') {
    throw new Error('__ZEPHYR_KB__ tidak ada — reload halaman (devBridge fase 18)');
  }

  // Bersihkan state: tutup semua tab/panel, reset keybinding user, tutup menu.
  // Satu file dibuka sebagai tab aktif karena `file.save`/`file.saveAll` punya
  // `enabled()` — tanpa tab keduanya tersaring dari palette dan V3/V7 gagal.
  await cdp.runAsync(
    `
    const KB = window.__ZEPHYR_KB__;
    for (const t of TS().terminalTabs.slice()) await TS().closeTab(t.id);
    s.tabs.slice().forEach((t) => s.forceCloseTab(t.id));
    s.setSettingsOpen(false);
    KB.editor(false);
    KB.setPending('');
    KB.setLastRun(null);
    await KB.resetAll();
    window.__ZEPHYR_NOTIF__.clear();
    document.body.click();
    await s.openPath(${JSON.stringify(FILE_TAB.replace(/\\/g, '/'))});
    await wait(700);
    return 'siap';
  `,
    60000,
  );

  await bagian1(cdp, check);
  await bagian2(cdp, check);
  await bagian3(cdp, check);

  // ═════════ V10: tsc + tidak menelan ketikan + console bersih ═════════
  const tsc = spawnSync(process.execPath, ['node_modules/typescript/lib/tsc.js', '--noEmit'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  const v10 = await cdp.json(
    `
    const KB = window.__ZEPHYR_KB__;
    // Ketikan normal di dalam input HARUS lolos (tidak dicegat resolver).
    KB.editor(true);
    await wait(300);
    const inp = q('[data-testid="kb-search"]');
    inp.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(inp, '');
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    for (const ch of 'save') {
      inp.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true, cancelable: true }));
      setter.call(inp, inp.value + ch);
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await wait(300);
    const nilaiInput = inp.value;
    const jml = q('[data-testid="kb-count"]') ? q('[data-testid="kb-count"]').textContent : '?';
    KB.editor(false);
    await wait(200);
    return JSON.stringify({
      nilaiInput,
      jml,
      errors: (window.__ZEPHYR_ERRORS__ || []).slice(0, 4),
      totalBinding: KB.bindings().length,
      // Fase 19: ekstensi uji yang tertinggal dari verify19 bisa menyisakan
      // error tak berhubungan di buffer. Catat agar penyebabnya terlihat.
      ekstensiTerpasang: window.__ZEPHYR_EXT19__
        ? window.__ZEPHYR_EXT19__.terpasang().map((x) => x.id)
        : [],
    });
  `,
    40000,
  );
  check(
    'V10',
    tsc.status === 0 && v10.nilaiInput === 'save' && v10.errors.length === 0,
    `tsc exit ${tsc.status}; ketikan "save" di field pencarian utuh ("${v10.nilaiInput}") → ` +
      `${v10.jml} baris cocok dari ${v10.totalBinding} binding; console error: ${v10.errors.length}` +
      (v10.errors.length > 0 ? `\n  → ${v10.errors.join('\n  → ').slice(0, 300)}` : '') +
      (v10.ekstensiTerpasang.length > 0
        ? `\n  (ekstensi terpasang saat uji: ${JSON.stringify(v10.ekstensiTerpasang)})`
        : '') +
      (tsc.status !== 0 ? `\n${(tsc.stdout || '').split('\n').slice(0, 6).join('\n')}` : ''),
  );

  // Kembalikan ke keadaan bersih supaya harness fase lain tidak terpengaruh.
  await cdp.runAsync(
    `
    await window.__ZEPHYR_KB__.resetAll();
    window.__ZEPHYR_KB__.editor(false);
    window.__ZEPHYR_KB__.setPending('');
    window.__ZEPHYR_NOTIF__.clear();
    s.setSettingsOpen(false);
    document.body.click();
    return 'beres';
  `,
    30000,
  );

  await cdp.close();
  try {
    fs.rmSync(FILE_TAB, { force: true });
  } catch {
    /* file sementara — abaikan */
  }
  selesai();
};

main().catch((e) => {
  console.error('verify18 error:', e.message);
  process.exit(1);
});
