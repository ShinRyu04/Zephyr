/**
 * uji-mcp-uninstall.mjs - buktikan server MCP bisa di-uninstall dari kartunya.
 *
 *   node scripts/uji-mcp-uninstall.mjs [port]
 *
 * Menguji jalur yang SAMA dipakai tombol Uninstall di kartu (store
 * `removeServer`), lalu memeriksa settings.json di disk. Memasang dan
 * melepas satu server uji; keadaan akhir harus sama seperti sebelum uji.
 */
import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const SETTINGS = join(homedir(), 'AppData', 'Roaming', 'zephyr', 'settings.json');
const ID = 'uji-uninstall';

const idsDiDisk = () => {
  const d = JSON.parse(readFileSync(SETTINGS, 'utf8'));
  return (d?.mcp?.servers ?? []).map((s) => s.id);
};

const sebelum = idsDiDisk();
console.log('server sebelum      :', sebelum.length, sebelum.join(', '));

const page = await halamanZephyr(PORT);
const { cdp } = await Cdp.attach(PORT, page.title);

/* 1. Pasang lewat jalur yang sama dipakai tombol Install. */
await cdp.runAsync(`
  const m = await import('/src/lib/mcpStore.ts');
  await m.useMcp.getState().saveServer({
    id: '${ID}', label: 'Uji Uninstall', url: 'https://contoh.invalid/mcp', token: '',
  });
  return true;
`);
const sesudahPasang = idsDiDisk();
console.log('sesudah install     :', sesudahPasang.length, '| uji ada:', sesudahPasang.includes(ID));

/* 2. Lepas lewat jalur yang sama dipakai tombol Uninstall. */
await cdp.runAsync(`
  const m = await import('/src/lib/mcpStore.ts');
  await m.useMcp.getState().removeServer('${ID}');
  return true;
`);
const sesudahLepas = idsDiDisk();
console.log('sesudah uninstall   :', sesudahLepas.length, '| uji ada:', sesudahLepas.includes(ID));

/* 3. Keadaan akhir harus sama seperti sebelum uji. */
const bersih = sesudahLepas.length === sebelum.length && !sesudahLepas.includes(ID);
console.log('\nHASIL:', bersih ? 'OK - install lalu uninstall bekerja, disk kembali seperti semula' : 'GAGAL - disk tidak kembali seperti semula');
await cdp.close();
