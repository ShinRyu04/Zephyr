import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  const cmd = await import('/src/lib/commands.ts');
  try {
    const arr = await cmd.extRegistryList('');
    out.jumlah = Array.isArray(arr) ? arr.length : 'bukan array';
    out.contoh = Array.isArray(arr) ? arr.slice(0, 3).map((e) => e.id + ' | ' + e.name + ' | ' + e.publisher) : null;
  } catch (e) {
    out.err = String(e).slice(0, 200);
  }
  return out;
`, 90000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
