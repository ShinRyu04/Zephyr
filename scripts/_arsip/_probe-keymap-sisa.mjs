import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach('9223', ['Zephyr']);
const out = await cdp.json(`return JSON.stringify(await (async () => {
  const E = window.__ZEPHYR_EXT19__, KB = window.__ZEPHYR_KB__;
  const q = () => KB.bindings().filter(b => b.chord === 'Ctrl+K Ctrl+B').map(b => ({id:b.id,cmd:b.command,layer:b.layer,isCustom:b.isCustom}));
  const paket = 'zephyr.keymap-sublime';
  const a = { terpasang: E.terpasang().map(m => m.id), chord: q() };
  if (a.terpasang.includes(paket)) { await E.uninstall(paket); await new Promise(r=>setTimeout(r,3000)); }
  return { a, setelah: { terpasang: E.terpasang().map(m=>m.id), chord: q(), keymapEkstensi: E.keymapEkstensi() } };
})())`);
console.log(JSON.stringify(out, null, 1).slice(0, 2600));
await cdp.close();
