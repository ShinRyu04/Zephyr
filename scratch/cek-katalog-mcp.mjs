import { readFileSync } from 'node:fs';
const s = readFileSync('src/lib/katalogMcpServer.ts', 'utf8');
const mulai = s.indexOf('export const KATALOG_MCP_SERVER');
const akhir = s.indexOf('\n];', mulai);
const blok = s.slice(mulai, akhir);
const m = [...blok.matchAll(/id: ["']([a-z0-9-]+)["']/g)];
console.log('TOTAL=' + m.length);
console.log(m.map((x) => x[1]).join(', '));
