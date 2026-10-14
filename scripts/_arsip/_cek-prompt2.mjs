import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach(process.argv[2] || '9223', ['Zephyr', 'Zephyr — Code Editor', 'localhost']);
const o = await cdp.json(`return JSON.stringify((() => {
  const NL = String.fromCharCode(10);
  const P = window.__ZEPHYR_PROMPT__;
  const k = ['id','en'].map((l) => String(P.system(l, 'K', 'A') || ''));
  const teks = k.sort((a,b) => b.length - a.length)[0] || '';
  const baris = teks.split(NL);
  const cari = (frag) => baris.filter((l) => l.indexOf(frag) >= 0).map((l) => l.slice(0, 300));
  return {
    panjang: teks.length,
    jumlahBaris: baris.length,
    maxPanes: cari('maxPanes'),
    seksiZephyr: cari('Answering questions about Zephyr itself'),
    aturanPrompt: cari('answered from the Zephyr facts block above'),
    toolFolder: cari('Folder-scoped tools'),
  };
})())`, 40000);
for (const [k, v] of Object.entries(o)) console.log(k + ' => ' + (Array.isArray(v) ? JSON.stringify(v) : v));
await cdp.close();
