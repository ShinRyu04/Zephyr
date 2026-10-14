import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach(process.argv[2] || '9223', ['Zephyr', 'Zephyr — Code Editor', 'localhost']);
await cdp.send('Page.reload', { ignoreCache: true });
for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  try {
    const o = await cdp.json(`return JSON.stringify({ r: !!window.__ZEPHYR_PROMPT__, s: !!(window.__ZEPHYR_AI__ && window.__ZEPHYR_AI__.store) })`);
    if (o && o.r && o.s) { 
      const frag = await cdp.json(`return JSON.stringify((() => {
        const NL = String.fromCharCode(10);
        const P = window.__ZEPHYR_PROMPT__;
        const teks = String(P.system('id', 'K', 'A') || '');
        const baris = teks.split(NL);
        const ada = (f) => baris.some((l) => l.indexOf(f) >= 0);
        return { aturan: ada('answered from the Zephyr facts block above'), folder: ada('Folder-scoped tools'), semua: ada('maxPanes') };
      })())`);
      console.log('reload siap: aturan=' + frag.aturan + ' folderTool=' + frag.folder + ' maxPanes=' + frag.semua);
      break;
    }
  } catch { /* halaman belum siap */ }
}
await cdp.close();
