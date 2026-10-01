// cek-comp13.mjs — does ANY compartment reconfigure reach the view?
//
// Patch Compartment.prototype.reconfigure to count calls, then open a file.
// If the count is zero, the component never configures the language. If it is
// non-zero but the tree stays empty, the extension itself is being dropped.

import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach('9223', 'Zephyr');
const r = await cdp.runAsync(
  `
  const St = window.__ZEPHYR__;
  const tunggu = (ms) => new Promise(r => setTimeout(r, ms));

  const dir = 'C:/Users/home/AppData/Local/Temp/zephyr-cek-cm';
  St.getState().setSettingsOpen(false);
  await tunggu(500);
  St.getState().tabs.slice().forEach(t => St.getState().forceCloseTab(t.id));
  await tunggu(600);

  // Bungkus reconfigure pada prototipe Compartment milik modul yang dipakai
  // komponen (di-resolve lewat modul app supaya instance-nya sama).
  const catatan = [];
  try {
    const m = await import('/src/lib/cmTheme.ts');
    // cmTheme tidak mengekspor Compartment; ambil lewat jalur yang sama dengan
    // komponen: '/src/lib/lang.ts' juga tidak. Jadi pakai modul app lain yang
    // mengimpornya, atau jatuh ke node_modules (instance kedua) hanya untuk
    // MENGHITUNG panggilan — angka panggilan tetap valid sebagai sinyal.
    const { Compartment } = await import('/node_modules/@codemirror/state/dist/index.js');
    const asli = Compartment.prototype.reconfigure;
    Compartment.prototype.reconfigure = function (ext) {
      catatan.push({ jumlah: Array.isArray(ext) ? ext.length : 1 });
      return asli.call(this, ext);
    };
  } catch (e) {
    return JSON.stringify({ err: String(e).slice(0, 140) });
  }

  await St.getState().openPath(dir + '/contoh.ts');
  await tunggu(3000);

  const cm = document.querySelector('.cm-content');
  const sp = cm ? [...cm.querySelectorAll('span')].filter(s => !/cm-zbr/.test(s.className)) : [];
  return JSON.stringify({
    panggilanReconfigure: catatan.length,
    contoh: catatan.slice(0, 8),
    spanSintaks: sp.length,
  });
`,
  120000,
);
console.log(r);
await cdp.close();
