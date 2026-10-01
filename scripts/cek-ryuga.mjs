import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
import { writeFileSync } from 'node:fs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(
  `
  const st = window.__ZEPHYR__.getState();
  const setui = window.__ZEPHYR_SETUI__;
  const sub = window.__ZEPHYR_SUB__;
  st.setActivity('settings'); st.setSettingsOpen(true); await wait(1300);
  setui.setSection('subagent'); await wait(2000);

  // kartu daftar: ikon apa yang dipakai baris Ryuga
  sub.muat(); await wait(500);
  const baris = q('[data-testid="sub-custom-c-mumuyx53-a20w6"]');
  const ikonBaris = baris ? baris.querySelector('[data-ikon], svg') : null;

  // ringkasan kartu, biar bisa dibandingkan dengan yang user lihat
  const kartu = q('[data-testid="sub-custom-card"]');
  const teks = kartu ? kartu.textContent.replace(/\\s+/g,' ').trim() : null;

  const out = {
    ikonDiBaris: ikonBaris ? (ikonBaris.getAttribute('data-ikon') || 'svg') : null,
    pathIkon: baris ? baris.querySelector('path')?.getAttribute('d')?.slice(0, 40) : null,
    teksKartu: teks,
    d: sub.daftar().map(x => ({ nama: x.nama, ikon: x.ikon, alat: (x.alat||[]).length })),
  };
  return out;
`,
  120000,
);
console.log(JSON.stringify(r, null, 1));
const sh = await cdp.send('Page.captureScreenshot', { format: 'png' });
writeFileSync('D:/Zephyr/shot-ryuga.png', Buffer.from(sh.result.data, 'base64'));
cdp.close();
