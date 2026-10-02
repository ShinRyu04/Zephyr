/**
 * abadikan-panel.mjs - simpan tangkapan layar panel AI ke berkas PNG.
 *
 *   node scripts/abadikan-panel.mjs [port] [nama-berkas]
 *
 * Alat bantu untuk MELIHAT hasil kerja, bukan uji. Dipakai karena keluhan
 * "melayang" dan "ketimbun" hanya bisa dinilai dengan mata - angka tinggi dan
 * overflow tidak menangkap kesan visualnya.
 */
import { Cdp } from './lib-cdp.mjs';
import fs from 'node:fs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const NAMA = process.argv[3] || 'panel-ai.png';

const { cdp } = await Cdp.attach(PORT);

/* Buka panel AI kalau belum terbuka. */
await cdp.eval(`(() => {
  const btns = [...document.querySelectorAll('.activitybar button, .activitybar [role="button"]')];
  const ai = btns.find((b) => /ai/i.test((b.getAttribute('aria-label') || '') + (b.title || '')));
  if (ai && !document.querySelector('.ai-chat')) ai.click();
  return true;
})()`);

await new Promise((r) => setTimeout(r, 1200));

const ukuran = await cdp.eval(
  `JSON.stringify((() => {
    const p = document.querySelector('.ai-chat');
    const r = p ? p.getBoundingClientRect() : { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
    return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
  })())`,
);

const kotak = JSON.parse(ukuran);
console.log('wilayah tangkapan:', kotak);

const data = await cdp.screenshot(kotak);
fs.writeFileSync(NAMA, Buffer.from(data, 'base64'));
console.log('tersimpan:', NAMA, fs.statSync(NAMA).size, 'byte');

await cdp.close();
process.exit(0);
