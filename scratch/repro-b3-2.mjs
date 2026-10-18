import { pathToFileURL } from 'node:url';
import path from 'node:path';

globalThis.self = globalThis;
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

const AKAR = path.resolve('D:\\Zephyr');
const M = await import(pathToFileURL(path.join(AKAR, 'scratch', 'uji-anggaran-pesan', 'entri.bundle.mjs')).href);

const CAP = Math.max(20_000, M.PAYLOAD_MAX_CHARS - 10_892);

function uji(panjangEkor, label) {
  const masuk = [{ role: 'system', content: 'S'.repeat(3000) }];
  for (let i = 0; i < 6; i++) {
    masuk.push({ role: 'assistant', content: 'a'.repeat(4000) });
    masuk.push({ role: 'tool', name: 'read_file', content: `T${i}\n` + 't'.repeat(9000) });
  }
  masuk.push({ role: 'assistant', content: '', toolCalls: [{ name: 'read_file' }] });
  masuk.push({ role: 'tool', name: 'read_file', content: '# EKOR-BERKAS\n' + 'e'.repeat(panjangEkor) });
  const asli = String(masuk.at(-1).content);
  const keluar = M.ringkasRiwayat(masuk, CAP);
  const ekor = String(keluar.filter((m) => m.role !== 'system').at(-1)?.content ?? '');
  console.log(
    `${label}: ekor ${asli.length} -> ${ekor.length} | dipotong=${ekor !== asli} | catatan=${/batas gateway/.test(ekor)}`,
  );
}

uji(25_000, 'sekarang (25k)');
uji(90_000, 'diperbesar (90k)');
