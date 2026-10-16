/**
 * nyalakan-terminal-control.mjs - nyalakan mcp.allow_terminal_control lewat
 * JALUR APLIKASI SENDIRI (store), bukan dengan mengedit settings.json diam-diam.
 *
 *   node scripts/nyalakan-terminal-control.mjs [port] [true|false]
 *
 * Kenapa lewat store: settings.json ditulis ulang oleh app. Mengedit file saat
 * app jalan berarti perubahan itu bisa hilang pada penyimpanan berikutnya - dan
 * yang lebih buruk, file di disk dan keadaan di memori berbeda tanpa ada yang
 * tahu. Lewat `applySettings` yang sama dipakai panel Setelan, tidak ada dua
 * keadaan.
 *
 * Membaca ulang dari disk sesudahnya untuk membuktikan perubahan benar-benar
 * tersimpan, bukan hanya berubah di memori.
 */
import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const MAU = (process.argv[3] ?? 'true') !== 'false';
const SETTINGS = join(homedir(), 'AppData', 'Roaming', 'zephyr', 'settings.json');

function dariDisk() {
  const d = JSON.parse(readFileSync(SETTINGS, 'utf8'));
  return d?.mcp?.allow_terminal_control;
}

const sebelum = dariDisk();
console.log('sebelum (disk) :', sebelum);

const page = await halamanZephyr(PORT);
const { cdp } = await Cdp.attach(PORT, page.title);

const r = await cdp.runAsync(`
  const st = await import('/src/lib/store.ts');
  await st.useStore.getState().applySettings({ mcp: { allow_terminal_control: ${MAU} } });
  const kini = st.useStore.getState().settings?.mcp?.allow_terminal_control;
  return { diMemori: kini };
`);

const s = typeof r === 'string' ? JSON.parse(r) : r;
console.log('sesudah (memori):', s.diMemori);

/* Beri app kesempatan menulis; lalu baca dari disk - itu buktinya. */
await new Promise((r2) => setTimeout(r2, 900));
const sesudah = dariDisk();
console.log('sesudah (disk) :', sesudah);

console.log(sesudah === MAU ? 'BUKTI: tersimpan di disk.' : 'GAGAL: disk belum berubah.');
await cdp.close();
