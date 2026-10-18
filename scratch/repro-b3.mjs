import { pathToFileURL } from 'node:url';
import path from 'node:path';

/* Same globals the real harness sets before importing the bundle. */
globalThis.self = globalThis;
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

const AKAR = path.resolve('D:\\Zephyr');
const M = await import(pathToFileURL(path.join(AKAR, 'scratch', 'uji-anggaran-pesan', 'entri.bundle.mjs')).href);

const CAP = Math.max(20_000, M.PAYLOAD_MAX_CHARS - 10_892);
console.log('CAP_PESAN =', CAP);

const masuk = [{ role: 'system', content: 'S'.repeat(3000) }];
for (let i = 0; i < 6; i++) {
  masuk.push({ role: 'assistant', content: 'a'.repeat(4000) });
  masuk.push({ role: 'tool', name: 'read_file', content: `T${i}\n` + 't'.repeat(9000) });
}
masuk.push({ role: 'assistant', content: '', toolCalls: [{ name: 'read_file' }] });
masuk.push({ role: 'tool', name: 'read_file', content: '# EKOR-BERKAS\n' + 'e'.repeat(25_000) });

const asli = String(masuk.at(-1).content);
console.log('masuk total =', JSON.stringify(masuk).length, '| ekor asli =', asli.length);

const keluar = M.ringkasRiwayat(masuk, CAP);
console.log('keluar jumlah pesan =', keluar.length);
for (const [i, m] of keluar.entries()) {
  const c = typeof m.content === 'string' ? m.content : '';
  console.log(`  [${i}] role=${m.role} len=${c.length}${c.includes('batas gateway') ? ' ADA-CATATAN' : ''}`);
}
const ekor = String(keluar.filter((m) => m.role !== 'system').at(-1)?.content ?? '');
console.log('ekor terkirim =', ekor.length, '| dipotong =', ekor !== asli);
console.log('ada catatan =', /batas gateway/.test(ekor));
console.log('kepala ekor =', JSON.stringify(ekor.slice(0, 60)));
console.log('ekor ekor =', JSON.stringify(ekor.slice(-90)));
