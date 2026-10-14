
import { Cdp, sleep } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach('9223', ['Zephyr','localhost']);
const r = await cdp.json(`return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR_SET__;
  const asli = window.__ZEPHYR__.getState().settings.general.uiLang;
  await S.set({ general: { ...window.__ZEPHYR__.getState().settings.general, uiLang: 'id' } });
  window.__ZEPHYR_SETTINGS__.buka('mcp');
  await new Promise((r) => setTimeout(r, 1000));
  const cards = [...document.querySelectorAll('.mcp-direction-card')].map((c) => (c.innerText||'').slice(0,300));
  const row = document.querySelector('[data-testid="mcp-max-tools"]')?.closest('.set-row')?.innerText;
  const all = (document.querySelector('.settings-page')?.innerText || document.body.innerText || '');
  const hasil = {
    cards,
    row: (row || '').slice(0,200),
    adaId: all.includes('Maksimal'),
    adaNama: all.includes('Maksimal tool per server MCP'),
    lang: window.__ZEPHYR__.getState().settings.general.uiLang,
    cuplikan: (all||'').slice(0, 300),
  };
  window.__ZEPHYR_SETTINGS__.tutup();
  await S.set({ general: { ...window.__ZEPHYR__.getState().settings.general, uiLang: asli } });
  return hasil;
})())`);
console.log(JSON.stringify(r, null, 1).slice(0, 2500));
await cdp.close();
