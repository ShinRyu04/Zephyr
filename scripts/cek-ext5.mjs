import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
import { writeFileSync } from 'node:fs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);

const r = await cdp.runAsync(`
  const out = {};
  const EXX = window.__ZEPHYR_EXT19__;

  // state dari bridge (bukan import kedua)
  const e = EXX.state();
  out.tab = e.tab;
  out.remote = (e.remote || []).length;
  out.remoteUrl = e.remoteUrl;
  out.hasil = e.hasil().length;
  out.rekomendasi = e.rekomendasi().length;
  out.loading = e.loading;
  out.manifests = (e.manifests || []).length;

  // paksa muat
  await EXX.state().muatRemote();
  await wait(2000);
  const e2 = EXX.state();
  out.remoteSetelah = (e2.remote || []).length;
  out.hasilSetelah = e2.hasil().length;
  out.kartu = qa('[data-ext-card]').length;
  return out;
`, 90000);
console.log(JSON.stringify(r, null, 1));
const sh = await cdp.send('Page.captureScreenshot', { format: 'png' });
writeFileSync('D:/Zephyr/shot-ext4.png', Buffer.from(sh.result.data, 'base64'));
cdp.close();
