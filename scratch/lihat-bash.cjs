const fs = require('fs');
const t = fs.readFileSync('src/lib/zephyrTools/builtins.ts', 'utf8');
const i = t.indexOf('bash_run');
console.log('idx=' + i);
console.log(t.slice(i - 400, i + 2400));
