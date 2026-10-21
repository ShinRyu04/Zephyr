const { execFileSync } = require('child_process');
const fs = require('fs');
const GIT = 'C:\\Program Files\\Git\\cmd\\git.exe';
const g = (a) => execFileSync(GIT, a, { encoding: 'utf8', maxBuffer: 67108864, cwd: 'D:\\Zephyr' });

const head = g(['show', 'HEAD:src/lib/zephyrTools/catalog.ts']);
const idx = head.indexOf('ask_user');
const out = [];
out.push('occurrences in HEAD: ' + (head.split('ask_user').length - 1));
out.push('context:');
out.push(idx >= 0 ? head.slice(Math.max(0, idx - 300), idx + 300) : '(none)');
out.push('');
out.push('files changed vs HEAD:');
out.push(g(['status', '--porcelain=v1']).split('\n').filter(Boolean).filter((l) => !l.includes('scratch/')).join('\n'));
fs.writeFileSync('D:\\Zephyr\\scratch\\cek2.txt', out.join('\n'), 'utf8');
console.log('OK');
