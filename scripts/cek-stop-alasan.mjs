/*
 * Mengunci peta alasan-berhenti agent (src/lib/agentStop.ts).
 *
 * Bug yang dijaga di sini: guard kemajuan (aksi berulang / langkah baca
 * beruntun) dulu menyetel `agentStopReason = 'watchdog'`, sehingga user
 * dilaporkan "Provider berhenti menjawab" padahal providernya sehat dan
 * guard-nya yang menembak. Sekarang guard punya alasan sendiri ('guard') dan
 * kategori 'tool'.
 *
 * Fungsinya murni, jadi diuji langsung di Node lewat esbuild - tanpa aplikasi
 * hidup dan tanpa menunggu loop 15 menit yang jadi satu-satunya cara lain
 * memicunya.
 */
import { build } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'agentstop-'));
const out = join(dir, 'agentStop.mjs');
await build({
  entryPoints: ['src/lib/agentStop.ts'],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  outfile: out,
  logLevel: 'silent',
});
const M = await import('file:///' + out.replace(/\\/g, '/') + '?v=' + Date.now());

let lulus = 0, total = 0;
const cek = (nama, syarat, bukti) => {
  total++;
  if (syarat) { lulus++; console.log(`  OK    ${nama}${bukti !== undefined ? '  [' + bukti + ']' : ''}`); }
  else console.log(`  GAGAL ${nama}  [${bukti}]`);
};

// 1. Guard kemajuan = kategori 'tool', bukan 'timeout' provider.
const guard = M.agentStopMessage('guard');
cek('guard -> kategori tool', guard && guard.category === 'tool', guard && guard.category);
cek('guard -> pesan menyebut kemajuan', !!guard && guard.message.includes('kemajuan'), guard && guard.message);

// 2. Batas keras 15 menit = timeout.
const hard = M.agentStopMessage('hard-limit');
cek('hard-limit -> kategori timeout', hard && hard.category === 'timeout', hard && hard.category);

// 3. Watchdog provider tetap timeout dan tetap menuduh provider (bukan guard).
const wd = M.agentStopMessage('watchdog');
cek('watchdog -> kategori timeout', wd && wd.category === 'timeout', wd && wd.category);
cek('watchdog -> pesan menyebut Provider', !!wd && wd.message.includes('Provider'), wd && wd.message);

// 4. Alasan yang TIDAK dipetakan di sini -> null, artinya "jangan sentuh
//    agentFailure yang sudah dibangun catch". Kalau ini mengembalikan objek,
//    pesan error provider yang asli akan tertimpa teks generik.
cek("provider -> null (jangan timpa catch)", M.agentStopMessage('provider') === null, M.agentStopMessage('provider'));
cek('user -> null (jalur cancelled sendiri)', M.agentStopMessage('user') === null, M.agentStopMessage('user'));

console.log(`\n== ${lulus}/${total} lulus ==`);
process.exit(lulus === total ? 0 : 1);
