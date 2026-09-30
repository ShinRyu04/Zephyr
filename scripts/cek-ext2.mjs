import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
import { writeFileSync } from 'node:fs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  const ext = await import('/src/lib/extensionsStore19.ts');
  const stE = ext.useExt19.getState();
  out.loading = stE.loading;
  out.manifests = (stE.manifests || []).length;
  out.terpasang = (stE.terpasang || []).length;
  out.rekomendasi = (stE.rekomendasi || []).length;
  out.hasil = (stE.hasil || []).length;
  out.err = stE.err || null;
  out.info = stE.info || null;
  out.remote = (stE.remote || []).length;
  out.remoteUrl = stE.remoteUrl || null;

  // paksa muat registry
  try {
    await stE.muatRemote();
    out.muatOk = true;
  } catch (e) { out.muatErr = String(e).slice(0, 120); }
  await wait(1500);
  const st2 = ext.useExt19.getState();
  out.hasilSetelah = (st2.hasil || []).length;
  out.errSetelah = st2.err || null;
  return out;
`, 90000);
console.log(JSON.stringify(r, null, 1));
const sh = await cdp.send('Page.captureScreenshot', { format: 'png' });
writeFileSync('D:/Zephyr/shot-ext2.png', Buffer.from(sh.result.data, 'base64'));
cdp.close();
