// probe15c.mjs — cek flag render-pause + apakah PTY hidup di Rust.
import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(process.argv[2] ?? '9223');
const out = await cdp.json(
  `
  const ids = PTY.ids();
  const id = ids[0] || null;
  const listRust = await PTY.list();
  // Lepas render-pause (window mungkin dianggap minimized karena tidak fokus).
  await window.__ZEPHYR_SET_PAUSED__(false);
  await wait(400);
  let layarSebelum = id ? PTY.read(id, 40) : '';
  if (id) await PTY.write(id, 'echo HALO3\\r');
  await wait(2500);
  const layar = id ? PTY.read(id, 40) : '';
  const d = await D.get();
  return JSON.stringify({
    id, idsXterm: ids, listRust, ptyCount: d.ptyCount,
    hidden: document.hidden, visState: document.visibilityState,
    panjangSebelum: layarSebelum.length, panjangSesudah: layar.length,
    adaHalo: /HALO3/.test(layar),
    cuplikan: layar.replace(/\\n/g, '|').slice(-160),
  });
`,
  60000,
);
console.log(JSON.stringify(out, null, 2));
cdp.close();
