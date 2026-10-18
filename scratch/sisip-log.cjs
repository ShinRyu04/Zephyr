const fs = require('fs');
const s = fs.readFileSync('scratch/hookbr-debug.mjs', 'utf8').split(/\r?\n/);
const idx = s.findIndex((b) => /const \{ cdp \} = await Cdp\.attach/.test(b));
s.splice(idx + 1, 0, "console.error('[MULAI] attach ok');");
fs.writeFileSync('scratch/hookbr-debug2.mjs', s.join('\n'));
console.log('ok idx=' + idx);
