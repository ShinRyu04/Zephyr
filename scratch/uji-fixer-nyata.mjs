import { cdp } from './cdp2.mjs';
import { readFileSync } from 'fs';

/*
 * A REAL fixer run, on a throwaway project.
 *
 * The point is not "the command returned" — it is that the file on disk changed.
 * A fixer that reports success while the bytes are identical is the failure this
 * feature exists to avoid, so the assertion is on the file content before/after.
 */
const AKAR = 'D:\\Zephyr\\scratch\\proyek-uji';
const BERKAS = AKAR + '\\src\\a.js';
const sebelum = readFileSync(BERKAS, 'utf8');

const c = await cdp(9223, 'localhost:5173');
const j = async (body, ms = 180000) => {
  const src = `(async () => {
    const batas = new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT')), ${ms}));
    try {
      const __r = await Promise.race([(async () => { ${body} })(), batas]);
      return JSON.stringify(__r);
    } catch (e) { return JSON.stringify({ galat: String(e && e.message ? e.message : e) }); }
  })()`;
  return JSON.parse(await c.eval(src));
};

/* Run the Rust command directly — this is the same call the module makes. */
const hasil = await j(`
  const core = await import('/node_modules/.vite/deps/@tauri-apps_api_core.js');
  const r = await core.invoke('lint_fix_files', {
    root: ${JSON.stringify(AKAR)},
    paths: [${JSON.stringify(BERKAS)}],
  });
  return r;
`);

console.log('hasil Rust: ' + JSON.stringify(hasil, null, 1));

const sesudah = readFileSync(BERKAS, 'utf8');
console.log('sebelum: ' + JSON.stringify(sebelum));
console.log('sesudah: ' + JSON.stringify(sesudah));
console.log('berubah di disk: ' + (sebelum !== sesudah));

c.close();
process.exit(0);
