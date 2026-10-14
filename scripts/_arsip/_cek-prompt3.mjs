import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach(process.argv[2] || '9223', ['Zephyr', 'Zephyr — Code Editor', 'localhost']);
const o = await cdp.json(`return JSON.stringify((() => {
  const NL = String.fromCharCode(10);
  const P = window.__ZEPHYR_PROMPT__;
  const hasil = {};
  for (const l of ['id', 'en']) {
    const teks = String(P.system(l, 'K', 'A') || '');
    const baris = teks.split(NL);
    const ada = (f) => baris.some((b) => b.indexOf(f) >= 0);
    hasil[l] = {
      panjang: teks.length,
      rules: baris.filter((b) => b.indexOf('Zephyr facts block') >= 0 || b.indexOf('blok fakta Zephyr') >= 0).slice(0, 2),
      folderTool: baris.filter((b) => b.indexOf('Folder-scoped tools') >= 0 || b.indexOf('ber-scope folder') >= 0).slice(0, 2),
      tanpa: baris.filter((b) => b.indexOf('without one') >= 0 || b.indexOf('tanpa workspace') >= 0 || b.indexOf('tanpa folder') >= 0).slice(0, 2),
    };
  }
  return hasil;
})())`, 40000);
console.log(JSON.stringify(o, null, 1));
await cdp.close();
