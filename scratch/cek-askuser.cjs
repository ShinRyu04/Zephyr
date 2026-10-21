const fs = require('fs');
const { execFileSync } = require('child_process');
const GIT = 'C:\\Program Files\\Git\\cmd\\git.exe';
const g = (a) => execFileSync(GIT, a, { encoding: 'utf8', maxBuffer: 67108864, cwd: 'D:\\Zephyr' });

const cat = fs.readFileSync('src/lib/zephyrTools/catalog.ts', 'utf8');
const bi = fs.readFileSync('src/lib/zephyrTools/builtins.ts', 'utf8');
const de = fs.readFileSync('src/lib/zephyrTools/deskripsiTool.ts', 'utf8');
const la = fs.readFileSync('src/lib/labelAksi.ts', 'utf8');

const out = [];
out.push('WORKING TREE');
out.push('  catalog    : ' + cat.includes("'ask_user'"));
out.push('  builtins   : ' + bi.includes("name: 'ask_user'"));
out.push('  deskripsi  : ' + de.includes('ask_user'));
out.push('  labelAksi  : ' + la.includes('ask_user'));

const head = g(['show', 'HEAD:src/lib/zephyrTools/catalog.ts']);
out.push('HEAD catalog has ask_user: ' + head.includes('ask_user'));
out.push('HEAD commit: ' + g(['rev-parse', '--short', 'HEAD']).trim());

fs.writeFileSync('D:\\Zephyr\\scratch\\cek-askuser.txt', out.join('\n'), 'utf8');
console.log('OK');
