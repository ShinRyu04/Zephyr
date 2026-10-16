/*
 * Verify Settings > Shortcuts now reports the RUNTIME bindings.
 *
 * The bug was that the page rendered `ACTIONS` — a stale 35-row copy — so it
 * claimed chords the app does not respond to (F4 for next-match when the real
 * chord is F3, `terminal.new` as Ctrl+Shift+T when it is Ctrl+Shift+`, and
 * bindings that do not exist at all). This asserts the page's rows agree with
 * `useKb.bindings`, which is what actually fires on a keypress.
 */
import CDP from 'chrome-remote-interface';

const PORT = Number(process.argv[2] || 9223);
const hasil = [];
const check = (nama, lulus, detail = '') => {
  hasil.push({ nama, lulus });
  console.log(`${lulus ? 'PASS' : 'FAIL'}  ${nama}${detail ? ` — ${detail}` : ''}`);
};

async function runAsync(Runtime, expr, timeoutMs = 10000) {
  const key = `__s_${Math.random().toString(36).slice(2)}`;
  await Runtime.evaluate({
    expression:
      `window.${key} = undefined;(async () => {\n${expr}\n})().then(` +
      `function(v){ window.${key} = JSON.stringify({__ok: v}); },` +
      `function(e){ window.${key} = JSON.stringify({__err: String((e && e.stack) || e)}); });`,
    returnByValue: true,
  });
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const r = await Runtime.evaluate({ expression: `window.${key}`, returnByValue: true });
    const v = r.result?.value;
    if (typeof v === 'string') {
      await Runtime.evaluate({ expression: `delete window.${key}` });
      try {
        const p = JSON.parse(v);
        return p.__err !== undefined ? { __err: p.__err } : p.__ok;
      } catch {
        return { __err: v.slice(0, 200) };
      }
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return { __err: 'timeout' };
}

const targets = await CDP.List({ port: PORT });
const utama = targets.find((t) => t.type === 'page' && !t.url.includes('#a'));
const c = await CDP({ port: PORT, target: utama });
const { Runtime } = c;
await Runtime.enable();

/*
 * Open Settings on the Shortcuts section, through the DEV BRIDGE.
 *
 * `window.__ZEPHYR__` IS the app's `useStore` (devBridge.ts:199), so this drives
 * the very store React rendered — unlike `import('/src/lib/store.ts')`, which
 * resolves to a different module instance and silently does nothing.
 */
const buka = await runAsync(Runtime, `
  window.__ZEPHYR__.getState().setSettingsOpen(true);
  const ui = window.__ZEPHYR_SETUI__;
  ui.setSection('shortcuts');
  await new Promise((r) => setTimeout(r, 1500));
  return { section: ui.section() };
`);
check('halaman Settings bisa dibuka', buka?.section === 'shortcuts', JSON.stringify(buka));

const dom = await runAsync(Runtime, `
  const rows = Array.from(document.querySelectorAll('[data-sc-row]'));
  return {
    jumlah: rows.length,
    grup: Array.from(document.querySelectorAll('.sc-group-title')).map((e) => e.textContent),
    contoh: rows.slice(0, 8).map((r) => ({
      id: r.getAttribute('data-sc-row'),
      label: r.querySelector('.sc-label')?.textContent ?? '',
      binding: r.querySelector('.sc-binding')?.getAttribute('data-binding') ?? '',
      command: r.querySelector('.sc-binding')?.getAttribute('data-command') ?? '',
    })),
  };
`);
check('tabel Shortcuts ter-render', (dom?.jumlah ?? 0) > 0, `${dom?.jumlah} baris`);
console.log('    grup:', (dom?.grup ?? []).join(', '));
for (const r of dom?.contoh ?? []) {
  console.log(`    ${r.id} [${r.command}] = ${r.binding}`);
}

/*
 * The decisive check: the page must agree with the runtime table, row for row.
 * Compared per COMMAND (the page may key a row by action id, but the chord it
 * shows for that command has to match what the key handler resolves).
 */
const cocok = await runAsync(Runtime, `
  const bindings = window.__ZEPHYR_KB__.bindings();
  const runtimeByChord = new Map();
  for (const b of bindings) runtimeByChord.set(b.command + '|' + b.chord, true);

  const rows = Array.from(document.querySelectorAll('[data-sc-row]'));
  const beda = [];
  for (const r of rows) {
    const tombol = r.querySelector('.sc-binding');
    const command = tombol?.getAttribute('data-command');
    const binding = tombol?.getAttribute('data-binding');
    if (!command) continue;
    if (!runtimeByChord.has(command + '|' + binding)) {
      beda.push({ command, binding });
    }
  }
  return { totalRuntime: bindings.length, rowsDiperiksa: rows.length, beda: beda.slice(0, 10), jumlahBeda: beda.length };
`);
check(
  'setiap baris halaman cocok dengan tabel runtime',
  (cocok?.jumlahBeda ?? 99) === 0,
  `diperiksa=${cocok?.rowsDiperiksa} runtime=${cocok?.totalRuntime} beda=${cocok?.jumlahBeda} ${JSON.stringify(cocok?.beda)}`,
);

/* The old page's specific lies must be gone. */
const bohong = await runAsync(Runtime, `
  const cari = (cmd) => {
    const el = document.querySelector('[data-command="' + cmd + '"]');
    return el ? el.getAttribute('data-binding') : null;
  };
  const rows = Array.from(document.querySelectorAll('[data-sc-row]'));
  return {
    findNext: cari('editor.findNext'),
    terminalNew: cari('terminal.new'),
    adaReplaceInFiles: rows.some((r) => r.getAttribute('data-sc-row') === 'edit.replaceInFiles'),
    adaAiSend: rows.some((r) => r.getAttribute('data-sc-row') === 'ai.send'),
    adaTasksBuild: rows.some((r) => r.getAttribute('data-sc-row') === 'tasks.build'),
  };
`);
check('editor.findNext tampil sebagai F3 (dulu salah: F4)', bohong?.findNext === 'F3', `= ${bohong?.findNext}`);
check(
  'terminal.new tampil sebagai Ctrl+Shift+` (dulu salah: Ctrl+Shift+T)',
  bohong?.terminalNew === 'Ctrl+Shift+`',
  `= ${bohong?.terminalNew}`,
);
check('baris phantom edit.replaceInFiles hilang', bohong?.adaReplaceInFiles === false);
check('baris phantom ai.send hilang', bohong?.adaAiSend === false);

await c.close();

const lulus = hasil.filter((h) => h.lulus).length;
console.log(`\n== ${lulus}/${hasil.length} lulus ==`);
process.exit(lulus === hasil.length ? 0 : 1);
