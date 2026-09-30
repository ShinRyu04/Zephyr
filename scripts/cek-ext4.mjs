import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
import { writeFileSync } from 'node:fs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);

const r = await cdp.runAsync(`
  const out = {};
  const st = window.__ZEPHYR__.getState();
  st.setActivity('extensions');
  await wait(2500);

  out.activity = window.__ZEPHYR__.getState().activity;
  out.view = !!q('.xv-list');
  out.kartu = qa('[data-ext-card]').length;
  out.kosong = (q('[data-testid="ext-kosong"]') || {}).textContent || null;
  out.recKosong = (q('[data-testid="ext-rec-empty"]') || {}).textContent || null;
  out.err = (q('[data-testid="ext-err"]') || {}).textContent || null;

  const ext = await import('/src/lib/extensionsStore19.ts');
  const e = ext.useExt19.getState();
  out.remote = (e.remote || []).length;
  out.remoteUrl = e.remoteUrl;
  out.hasil = e.hasil().length;
  out.tab = e.tab;
  out.loading = e.loading;
  return out;
`, 90000);
console.log(JSON.stringify(r, null, 1));
const sh = await cdp.send('Page.captureScreenshot', { format: 'png' });
writeFileSync('D:/Zephyr/shot-ext3.png', Buffer.from(sh.result.data, 'base64'));
cdp.close();
