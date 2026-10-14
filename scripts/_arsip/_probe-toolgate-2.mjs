import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach('9223', ['Zephyr']);
const out = await cdp.json(`return JSON.stringify(await (async () => {
  const tidur = (ms) => new Promise(r => setTimeout(r, ms));
  const klik = (s) => { const el = document.querySelector(s); if (!el) throw new Error('tidak ada: ' + s); el.click(); };
  if (!document.querySelector('[data-testid="toolgate"]')) {
    klik('[data-testid="ai-more"]'); await tidur(250);
    klik('[data-testid="ai-open-toolsets"]'); await tidur(400);
  }
  const panel = document.querySelector('[data-testid="toolgate"]');
  const terbuka = !!panel;
  const total = panel ? (panel.querySelector('[data-testid="toolgate-total"]')?.textContent || '').trim() : '';
  const baris = panel ? panel.querySelectorAll('.tg-row').length : 0;
  const bagian = panel ? [...panel.querySelectorAll('.tg-bagian-nama')].map(e=>e.textContent.trim()) : [];
  // tutup pakai Escape (jalur asli)
  const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
  window.dispatchEvent(esc); await tidur(300);
  return { terbuka, total, baris, bagian, tertutupSesudahEsc: !document.querySelector('[data-testid="toolgate"]'),
    adaAngka: !!document.querySelector('[data-testid="ai-toolgate-angka"]') };
})())`);
console.log(JSON.stringify(out, null, 1));
await cdp.close();
