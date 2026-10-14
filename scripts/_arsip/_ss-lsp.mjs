/* Ambil tangkapan layar seksi Settings -> Language Servers sebagai bukti mata. */
import fs from 'node:fs';
import { Cdp } from './lib-cdp.mjs';

const out = process.argv[2] || 'lsp-bukti.png';
const { cdp } = await Cdp.attach(process.argv[3] || '9223');
await cdp.runAsync(`window.__ZEPHYR__.getState().setSettingsOpen(true); return 1;`, 20000);
await new Promise((r) => setTimeout(r, 1200));
let n = await cdp.runAsync(`return document.querySelectorAll('.lsp-baris').length;`, 20000);
if (!n) {
  await cdp.runAsync(
    `
    const k = [...document.querySelectorAll('button, [role="tab"], [data-testid]')].filter((el) => {
      const t = (el.textContent || '').toLowerCase();
      return t.includes('language server') || t.includes('intellisense');
    });
    if (k[0]) k[0].click();
    return k.length;
    `,
    20000,
  );
  await new Promise((r) => setTimeout(r, 1200));
  n = await cdp.runAsync(`return document.querySelectorAll('.lsp-baris').length;`, 20000);
}
/* Gulir seksi ke viewport supaya terlihat di potret. */
await cdp.runAsync(
  `
  const el = document.querySelector('.lsp-baris');
  if (el) el.scrollIntoView({ block: 'start' });
  return 1;
  `,
  20000,
);
await new Promise((r) => setTimeout(r, 600));
const png = await cdp.screenshot();
fs.writeFileSync(out, Buffer.from(png, 'base64'));
console.log(`baris=${n} -> ${out} (${fs.statSync(out).size} byte)`);
await cdp.close();
