// uji-t10-debug-launch.mjs — prove the debug launch.json fix works end to end.
//
// The bug: pressing Run on a workspace with no launch.json showed "create
// .zephyr/launch.json first" and stopped, with no way to create the file from
// inside the editor. The fix writes a detected config and continues.
//
// This checks the real store action and the real file on disk, not just that
// the function exists.

import { Cdp } from './lib-cdp.mjs';
import fs from 'node:fs';

const { cdp } = await Cdp.attach('9223', 'Zephyr');

const hasil = await cdp.runAsync(`
  await new Promise(r => setTimeout(r, 2000));
  const out = {};
  const mod = await import('/src/lib/debugStore.ts');
  const dbg = mod.useDebug ?? mod.default;
  const st = dbg.getState();

  out.punyaBuatLaunch = typeof st.buatLaunch === 'function';
  out.launchSebelum = st.launch ? st.launch.configurations.length : null;

  try {
    out.berhasil = await st.buatLaunch();
    await new Promise(r => setTimeout(r, 1200));
    const s2 = dbg.getState();
    out.launchSesudah = s2.launch ? s2.launch.configurations.length : null;
    out.namaConfig = s2.launch ? s2.launch.configurations.map(c => c.name) : [];
    out.terpilih = s2.configTerpilih;
  } catch (e) {
    out.err = String(e).slice(0, 250);
  }

  return JSON.stringify(out);
`);

console.log('== store ==');
console.log(hasil);

const f = 'D:/Zephyr/.zephyr/launch.json';
if (fs.existsSync(f)) {
  const isi = JSON.parse(fs.readFileSync(f, 'utf8'));
  console.log('\n== file ==');
  console.log('  version:', isi.version);
  console.log('  configurations:', isi.configurations.length);
  for (const c of isi.configurations) {
    console.log('    -', c.name, '|', c.type, '|', c.request);
  }
} else {
  console.log('\n== file ==');
  console.log('  NOT WRITTEN');
}

await cdp.close();
