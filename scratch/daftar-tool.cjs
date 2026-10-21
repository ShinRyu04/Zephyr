const fs = require('fs');
const t = fs.readFileSync('src/lib/zephyrTools/builtins.ts', 'utf8');
const m = [...t.matchAll(/name:\s*['"`]([a-zA-Z_0-9]+)['"`]/g)].map((x) => x[1]);
console.log('TOOLS(' + m.length + '):');
console.log(m.join(' '));
