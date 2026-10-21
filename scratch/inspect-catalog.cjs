const fs = require('fs');
const p = 'src/lib/modelCatalog.tsx';
const s = fs.readFileSync(p, 'utf8');

const a = s.indexOf("      {\n        id: 'local',");
const b = s.indexOf('    ];', a);
console.log('a=', a, 'b=', b);
console.log('HEAD:', JSON.stringify(s.slice(a - 4, a + 70)));
console.log('TAIL:', JSON.stringify(s.slice(b - 120, b + 8)));
