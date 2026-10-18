const fs = require('fs');
let s = fs.readFileSync('scripts/verify-agc-hooks-browser.mjs', 'utf8');
s = s.replace("from './lib-cdp.mjs'", "from '../scripts/lib-cdp.mjs'");
s = s.replace(
  'const raw = await cdp.runAsync(badan, ms);',
  [
    'let raw;',
    '  try { raw = await cdp.runAsync(badan, ms); }',
    '  catch (e) { console.error("[J-GAGAL] " + String(e).slice(0,120)); console.error("[BODY] " + badan.slice(0,260)); throw e; }',
  ].join('\n  '),
);
fs.writeFileSync('scratch/dbg4.mjs', s);
console.log('dbg4 dibuat');
