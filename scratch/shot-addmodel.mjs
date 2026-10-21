/*
 * Open Add Model in the live panel and screenshot it, using rea for the capture.
 *
 * WHY VIA rea AND NOT A HAND-ROLLED CDP CALL: rea's capture is origin-scoped and
 * returns a self-verifying PNG artifact, which is the same path the reference
 * screenshots went through. A bespoke screenshot could silently capture a stale
 * frame and there would be no artifact identity to compare against.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { Cdp } from '../scripts/lib-cdp.mjs';

const TARGET = process.argv[2];
const OUT = process.argv[3] ?? 'scratch/addmodel.png';

const { cdp } = await Cdp.attach(9223, 'Zephyr');

const state = JSON.parse(
  await cdp.eval(
    `JSON.stringify({
       url: location.href,
       tambah: !!document.querySelector('[data-testid="aim-tambah"]'),
       modal: !!document.querySelector('[data-testid="aim-add-modal"]'),
     })`,
  ),
);
console.log('state', state);

if (!state.tambah) {
  console.log('BUKAN panel models:', state.url);
  process.exit(2);
}

if (!state.modal) {
  await cdp.eval(`document.querySelector('[data-testid="aim-tambah"]').click()`);
  await new Promise((r) => setTimeout(r, 700));
}

const info = JSON.parse(
  await cdp.eval(
    `JSON.stringify((() => {
       const m = document.querySelector('[data-testid="aim-add-modal"]');
       const tiles = [...document.querySelectorAll('[data-testid="aim-preset-grid"] .aim-preset-btn')];
       const custom = document.querySelector('[data-testid="aim-preset-custom"]');
       return {
         modal: !!m,
         tiles: tiles.length,
         customWidth: custom ? Math.round(custom.getBoundingClientRect().width) : 0,
         tileWidth: tiles[1] ? Math.round(tiles[1].getBoundingClientRect().width) : 0,
         modalWidth: m ? Math.round(m.querySelector('.aim-add').getBoundingClientRect().width) : 0,
         names: tiles.map((t) => t.querySelector('.aim-preset-nama')?.textContent),
         logos: tiles.filter((t) => t.querySelector('svg')).length,
       };
     })())`,
  ),
);
console.log('dialog', info);

const out = execFileSync(
  'C:\\Program Files\\nodejs\\npx.cmd',
  [
    '-y',
    'rea-agents@6.5.0',
    'capture-web-screenshot',
    'http://127.0.0.1:9223',
    TARGET,
    '--allowed-origins',
    'http://localhost:5173',
    '--format',
    'json',
  ],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
);
const j = JSON.parse(out);
fs.writeFileSync(OUT, Buffer.from(j.normalized_result.artifact.data_base64, 'base64'));
console.log('tersimpan', OUT, j.normalized_result.viewport.width + 'x' + j.normalized_result.viewport.height);
process.exit(0);
