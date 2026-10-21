const { execFileSync } = require('child_process');
const fs = require('fs');
const GIT = 'C:\\Program Files\\Git\\cmd\\git.exe';
const g = (a) => execFileSync(GIT, a, { encoding: 'utf8', maxBuffer: 67108864, cwd: 'D:\\Zephyr' });

const files = g(['status', '--porcelain=v1'])
  .split('\n')
  .filter(Boolean)
  .filter((l) => !l.includes('scratch/') && !l.includes('target2'))
  .map((l) => l.slice(3).trim());

const out = [];
out.push('FILES (' + files.length + '):');
out.push(files.join('\n'));
out.push('');
for (const f of files) {
  try {
    const d = g(['diff', '--numstat', 'HEAD', '--', f]).trim();
    out.push((d || '(baru)') + '  ' + f);
  } catch {
    out.push('(?) ' + f);
  }
}
fs.writeFileSync('D:\\Zephyr\\scratch\\diff-ringkas.txt', out.join('\n'), 'utf8');
console.log('OK');
