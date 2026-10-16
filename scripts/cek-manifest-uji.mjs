/**
 * cek-manifest-uji.mjs - apakah Rust melihat paket uji di disk?
 *   node scripts/cek-manifest-uji.mjs [port]
 */
import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const ID = 'zephyr.uji-tool-ekstensi';
const EXT_DIR = join(homedir(), 'AppData', 'Roaming', 'zephyr', 'extensions', ID);

mkdirSync(EXT_DIR, { recursive: true });
writeFileSync(
  join(EXT_DIR, 'package.json'),
  JSON.stringify({
    name: ID, displayName: 'Uji Tool Ekstensi', version: '1.0.0', publisher: 'zephyr',
    engines: { zephyr: '*' },
    contributes: { commands: [
      { command: 'uji.satu', title: 'Uji Satu', description: 'd' },
      { command: 'uji.dua', title: 'Uji Dua', description: 'd' },
    ] },
  }, null, 2),
  'utf8',
);

const page = await halamanZephyr(PORT);
const { cdp } = await Cdp.attach(PORT, page.title);

const r = await cdp.runAsync(`
  const cmd = await import('/src/lib/commands.ts');
  const m = await cmd.extensionsManifests();
  return {
    jumlah: m.length,
    ids: m.map((x) => (x.manifest ? x.manifest.id : '(?)')),
    ujiAda: m.some((x) => x.manifest && String(x.manifest.id).includes('uji-tool-ekstensi')),
    ujiCommands: (m.find((x) => x.manifest && String(x.manifest.id).includes('uji-tool-ekstensi')) || {}).manifest?.contributes?.commands?.length ?? null,
  };
`);
const s = typeof r === 'string' ? JSON.parse(r) : r;
console.log('manifest dibaca Rust :', s.jumlah);
console.log('paket uji terlihat   :', s.ujiAda ? 'YA' : 'TIDAK');
console.log('commands di manifest :', s.ujiCommands);
console.log('semua id             :', s.ids.join(', '));

rmSync(EXT_DIR, { recursive: true, force: true });
console.log('dibersihkan.');
await cdp.close();
