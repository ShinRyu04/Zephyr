const fs = require('fs');
const s = fs.readFileSync('src/lib/modelCatalog.tsx', 'utf8');

const target = ['groq', 'gmi', 'novita', 'azure', 'byteplus', 'gitee'];
for (const id of target) {
  const i = s.indexOf("id: '" + id + "'");
  if (i < 0) {
    console.log('TIDAK ADA', id);
    continue;
  }
  const blk = s.slice(i, s.indexOf('      },', i));
  const mids = [...blk.matchAll(/\{ id: '([^']+)'/g)].map((m) => m[1]);
  console.log('=== ' + id + ' ===');
  console.log('  ' + mids.join('\n  '));
}
