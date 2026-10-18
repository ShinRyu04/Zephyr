import { readFileSync } from 'node:fs';
const s = readFileSync('scripts/verify-sesi-per-folder.mjs', 'utf8');
const m = /const A = ([^\n]+)/.exec(s);
console.log('A =', m?.[1]);
const m2 = /mkdirSync|writeFileSync|rmSync/g;
console.log('setup:', [...s.matchAll(m2)].map((x) => x[0]).join(', '));
console.log(s.slice(0, 55).join?.('\n') ?? '');
