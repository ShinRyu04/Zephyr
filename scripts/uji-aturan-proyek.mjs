/**
 * uji-aturan-proyek.mjs - bukti penemuan berkas aturan proyek benar.
 *
 * Kenapa ini penting: berkas aturan adalah instruksi yang dibaca agen SETIAP
 * giliran. Kalau daftarnya kurang, sebuah repo yang sudah punya konvensi alat
 * lain tampak seperti tidak punya aturan sama sekali — agen lalu mengabaikan
 * panduan yang sudah ditulis orang. Kalau urutannya salah, aturan yang lebih
 * umum bisa menimpa yang lebih spesifik tanpa ada yang tahu.
 *
 * Yang diuji:
 *   1. cakupan: nama berkas konvensi alat lain ikut dibaca
 *   2. urutan: AGENTS.md dan ZEPHYR.md lebih dulu
 *   3. jalur bersarang (`.github/…`) dibentuk dengan benar
 *   4. SEMUA yang cocok digabung, bukan first-match-wins
 *   5. batas per-berkas dan total dihormati
 *
 * Murni: tidak menempel ke CDP, tidak butuh app jalan.
 *
 *   node scripts/uji-aturan-proyek.mjs
 */
import { reporter } from './lib-cdp.mjs';
import fs from 'node:fs';

const R = reporter('penemuan berkas aturan proyek');

let gagal = false;
const asli = R.check.bind(R);
R.check = (id, ok, detail) => {
  if (!ok) gagal = true;
  asli(id, ok, detail);
};

/* Cerminan FILE_ATURAN + loop di aturanProyek(). */
const FILE_ATURAN = [
  'AGENTS.md',
  'ZEPHYR.md',
  'CLAUDE.md',
  'GEMINI.md',
  'TERAX.md',
  'QWEN.md',
  '.cursorrules',
  '.windsurfrules',
  '.clinerules',
  '.rules',
  '.github/copilot-instructions.md',
  '.github/instructions.md',
];
const ATURAN_MAX_CHARS = 4000;
const ATURAN_TOTAL_MAX = 12000;

function gabung(ws, ada) {
  const bagian = [];
  let total = 0;
  for (const nama of FILE_ATURAN) {
    if (total >= ATURAN_TOTAL_MAX) break;
    if (!ada(nama)) continue;
    const teks = ada(nama);
    /* The source checks `teks.trim()` before using it — a file of only spaces
       is not guidance, and including it would put an empty heading in the
       prompt. The first version of this mirror omitted that check, so the test
       failed while the code was right. */
    if (!teks.trim()) continue;
    const potong = teks.slice(0, ATURAN_MAX_CHARS);
    bagian.push('## ' + nama + '\n' + potong);
    total += potong.length;
  }
  return bagian;
}

const jalur = (ws, nama) => `${ws}/${nama}`.replace(/\\/g, '/');

/* ── 1. Cakupan ───────────────────────────────────────────────────────── */

for (const nama of ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md', '.windsurfrules', '.clinerules', '.rules']) {
  R.check(`C-${nama}`, FILE_ATURAN.includes(nama), `${nama} ikut dibaca`);
}

/* ── 2. Urutan: AGENTS.md dan ZEPHYR.md di depan ──────────────────────── */

R.check('U1', FILE_ATURAN[0] === 'AGENTS.md', `AGENTS.md pertama (${FILE_ATURAN[0]})`);
R.check('U2', FILE_ATURAN[1] === 'ZEPHYR.md', `ZEPHYR.md kedua (${FILE_ATURAN[1]})`);
R.check(
  'U3',
  FILE_ATURAN.indexOf('AGENTS.md') < FILE_ATURAN.indexOf('CLAUDE.md'),
  'AGENTS.md sebelum CLAUDE.md',
);
R.check(
  'U4',
  FILE_ATURAN.indexOf('ZEPHYR.md') < FILE_ATURAN.indexOf('.cursorrules'),
  'ZEPHYR.md sebelum .cursorrules',
);

/* ── 3. Jalur bersarang ───────────────────────────────────────────────── */

R.check(
  'N1',
  jalur('D:/proj', '.github/copilot-instructions.md') === 'D:/proj/.github/copilot-instructions.md',
  `jalur .github benar (${jalur('D:/proj', '.github/copilot-instructions.md')})`,
);
R.check(
  'N2',
  jalur('D:\\proj', '.github/instructions.md') === 'D:/proj/.github/instructions.md',
  'backslash dinormalkan',
);

/* ── 4. Semua yang cocok DIGABUNG ─────────────────────────────────────── */

const semuaAda = () => 'aturan contoh';
const hasil = gabung('D:/p', semuaAda);
R.check('G1', hasil.length === FILE_ATURAN.length, `semua ${FILE_ATURAN.length} berkas digabung (${hasil.length})`);
R.check('G2', hasil[0].startsWith('## AGENTS.md'), `yang pertama AGENTS.md (${hasil[0].split('\n')[0]})`);
R.check('G3', hasil[1].startsWith('## ZEPHYR.md'), 'yang kedua ZEPHYR.md');

/* Hanya sebagian ada -> hanya itu yang masuk, urutannya tetap. */
const sebagian = (n) => (['CLAUDE.md', 'AGENTS.md'].includes(n) ? 'x' : null);
const h2 = gabung('D:/p', sebagian);
R.check('G4', h2.length === 2, `dua berkas ada -> dua bagian (${h2.length})`);
R.check('G5', h2[0].startsWith('## AGENTS.md'), 'urutan daftar dihormati, bukan urutan berkas');
R.check('G6', h2[1].startsWith('## CLAUDE.md'), 'CLAUDE.md setelahnya');

/* ── 5. Batas ─────────────────────────────────────────────────────────── */

const panjang = () => 'x'.repeat(10000);
const h3 = gabung('D:/p', panjang);
R.check('B1', h3[0].length <= ATURAN_MAX_CHARS + 20, `per berkas dipotong (${h3[0].length})`);
const totalH3 = h3.reduce((n, s) => n + s.length, 0);
R.check('B2', totalH3 <= ATURAN_TOTAL_MAX + 400, `total dibatasi (${totalH3} <= ${ATURAN_TOTAL_MAX})`);
R.check('B3', h3.length < FILE_ATURAN.length, `loop berhenti saat total penuh (${h3.length} bagian)`);

/* ── 6. Berkas kosong / whitespace dilewati ───────────────────────────── */

const kosong = (n) => (n === 'AGENTS.md' ? '   \n  ' : null);
const h4 = gabung('D:/p', kosong);
R.check('E1', h4.length === 0, `berkas whitespace-saja tidak dimasukkan (${h4.length})`);

/* ── 7. Pemeriksaan silang ke sumber ──────────────────────────────────── */

const src = (() => {
  try {
    return fs.readFileSync('src/lib/systemPrompt.ts', 'utf8');
  } catch {
    return '';
  }
})();

R.check('S1', /const FILE_ATURAN = \[/.test(src), 'FILE_ATURAN ada di sumber');
for (const nama of ['AGENTS.md', 'ZEPHYR.md', 'GEMINI.md', '.windsurfrules', '.clinerules']) {
  R.check(`S-${nama}`, src.includes(`'${nama}'`), `${nama} ada di sumber`);
}
R.check('S2', /ATURAN_MAX_CHARS/.test(src), 'batas per berkas ada');
R.check('S3', /ATURAN_TOTAL_MAX/.test(src), 'batas total ada');
R.check(
  'S4',
  /if \(total >= ATURAN_TOTAL_MAX\) break;/.test(src),
  'loop berhenti saat total penuh',
);

console.log('\n  catatan: aturan di atas mencerminkan src/lib/systemPrompt.ts');
R.selesai();
process.exit(gagal ? 1 : 0);
