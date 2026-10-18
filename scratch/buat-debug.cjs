const fs = require('fs');
let s = fs.readFileSync('scripts/verify-agc-hooks-browser.mjs', 'utf8');

s = s.replace(
  'const raw = await cdp.runAsync(`return JSON.stringify(await (${expr}))`, ms);',
  [
    'let raw;',
    '  try {',
    '    raw = await cdp.runAsync(`return JSON.stringify(await (${expr}))`, ms);',
    '  } catch (e) {',
    "    console.error('[J-GAGAL] ' + String(e).slice(0, 200));",
    "    console.error('[EXPR] ' + expr.slice(0, 300));",
    '    throw e;',
    '  }',
  ].join('\n  '),
);

s = s.replace("from './lib-cdp.mjs'", "from '../scripts/lib-cdp.mjs'");
fs.writeFileSync('scratch/hookbr-debug.mjs', s);
console.log('debug dibuat');
