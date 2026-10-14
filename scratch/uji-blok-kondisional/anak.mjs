import { writeFileSync } from 'node:fs';
import * as m from './bundel.mjs';
const pesan = JSON.parse(process.env.KOND_PESAN ?? '[]');
const out = pesan.map((p) => ({ pesan: p, kelas: m.kelasKondisional(p), teks: m.blokKondisional(p) }));
writeFileSync(process.env.KOND_KELUAR, JSON.stringify(out));
