/*
 * Bukti: argumen tool rusak TIDAK lagi mengakhiri run.
 *
 * Keluhan berulang, dua run Fase 5 berturut-turut: agen menulis 8-9 dari 10
 * berkas, lalu model mengirim JSON argumen yang tidak tertutup untuk berkas
 * TERAKHIR dan run mati dengan "Agent stopped: Protocol: ...". Pekerjaannya ada
 * di disk, tinggal satu berkas, dan pembaca melihat merah.
 *
 * opencode tidak berhenti di situ: panggilan rusak = SATU LANGKAH GAGAL, model
 * diminta menulis ulang, dan run berlanjut. Uji ini menahan tiga bagian dari
 * perilaku itu:
 *
 *   A1  jatah toleransi argumen rusak berurutan = 4 (dulu 2)
 *   A2  kategori `protocol` BOLEH dilanjutkan (dulu hanya provider/timeout)
 *   A3  auto-resume dibatasi 2 dan tidak jalan kalau user membatalkan
 *   A4  pesan pemulihan menyuruh MEMPECAH berkas besar (bukan mengulang sama)
 *   A5  penghitung rusak di-reset setelah langkah sukses
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const akar = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(akar, 'src/lib/aiStore.ts'), 'utf8');

let lulus = 0;
let gagal = 0;
const cek = (n, ok, info = '') => {
  console.log(`  ${ok ? 'LULUS' : 'GAGAL'}  ${n}${info ? `  ${info}` : ''}`);
  if (ok) lulus++;
  else gagal++;
};

/* A1 */
const mBatas = /BATAS_ARGUMEN_RUSAK_BERTURUT = (\d+)/.exec(src);
cek('A1 jatah argumen rusak berurutan = 4', mBatas?.[1] === '4', `nilai=${mBatas?.[1] ?? '?'}`);

/* A2 */
cek(
  'A2 kategori protocol ikut bisa dilanjutkan',
  /agentFailure\.category === 'protocol'/.test(src) &&
    /bisaLanjut =\s*[\s\S]{0,260}protocol/.test(src),
  'terpasang',
);

/* A3 */
const mAUTO = /AUTO_LANJUT_MAKS = (\d+)/.exec(src);
cek('A3a batas auto-resume = 2', mAUTO?.[1] === '2', `nilai=${mAUTO?.[1] ?? '?'}`);
cek(
  'A3b auto-resume tidak jalan saat run dibatalkan user',
  /agentFailure\.category === 'protocol' && autoLanjut < AUTO_LANJUT_MAKS && !agentBatal/.test(src),
  'terpasang',
);
cek(
  'A3c auto-resume tidak merebut composer yang sedang sibuk',
  /if \(st\.agentBusy \|\| st\.pending \|\| !st\.agentResume\) return;/.test(src),
  'terpasang',
);

/* A4 */
cek(
  'A4 pemulihan menyuruh memecah berkas besar',
  /JANGAN kirim sebagai satu panggilan raksasa/.test(src) &&
    /multi_edit/.test(src.slice(src.indexOf('JANGAN kirim sebagai satu panggilan raksasa') - 400, src.indexOf('JANGAN kirim sebagai satu panggilan raksasa') + 400)),
  'terpasang',
);

/* A5 */
cek(
  'A5 penghitung rusak di-reset setelah langkah sukses',
  /argumenRusakBerturut = 0;\n\n\s*\/\*\n\s*\* Teks yang sudah dikatakan model/.test(src) ||
    /Langkah ini berakhir TANPA error[\s\S]{0,200}argumenRusakBerturut = 0;/.test(src),
  'terpasang',
);

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
process.exit(gagal ? 1 : 0);
