/**
 * uji-search-editor.mjs - bukti penggabungan petikan benar.
 *
 * Kenapa ini penting: dua kecocokan yang berdekatan harus jadi SATU petikan.
 * Kalau tidak, baris yang sama dicetak dua kali dengan celah di antaranya — dan
 * pembaca menyimpulkan kodenya berubah di situ, padahal cuma batas petikan.
 *
 * Yang diuji:
 *   1. kecocokan tunggal -> satu petikan dengan konteks
 *   2. konteks dipotong di tepi berkas (baris 1, baris terakhir)
 *   3. kecocokan berdekatan DIGABUNG, tidak dicetak dua kali
 *   4. kecocokan berjauhan jadi petikan terpisah
 *   5. nomor kecocokan dilacak benar setelah digabung
 *   6. Markdown menandai baris yang cocok
 *
 * Murni: tidak menempel ke CDP, tidak butuh app jalan.
 *
 *   node scripts/uji-search-editor.mjs
 */
import { reporter } from './lib-cdp.mjs';
import fs from 'node:fs';

const R = reporter('search editor');

let gagal = false;
const asli = R.check.bind(R);
R.check = (id, ok, detail) => {
  if (!ok) gagal = true;
  asli(id, ok, detail);
};

const KONTEKS = 3;

function petikanUntuk(isi, barisCocok) {
  const semua = isi.split('\n');
  if (barisCocok.length === 0) return [];
  const urut = [...new Set(barisCocok)].sort((a, b) => a - b);
  const keluar = [];
  let kini = null;
  for (const b of urut) {
    const dari = Math.max(1, b - KONTEKS);
    const sampai = Math.min(semua.length, b + KONTEKS);
    if (kini && dari <= kini.sampai + 1) {
      for (let n = kini.sampai + 1; n <= sampai; n += 1) kini.teks.push(semua[n - 1] ?? '');
      kini.sampai = sampai;
      kini.cocok[b] = true;
      continue;
    }
    kini = { dari, sampai, teks: semua.slice(dari - 1, sampai), cocok: { [b]: true } };
    keluar.push(kini);
  }
  return keluar;
}

function keMarkdown(query, bagian) {
  const out = [`# Search: ${query}`, ''];
  const total = bagian.reduce((n, b) => n + b.petikan.length, 0);
  out.push(`${total} result${total === 1 ? '' : 's'} in ${bagian.length} file${bagian.length === 1 ? '' : 's'}`, '');
  for (const b of bagian) {
    for (const p of b.petikan) {
      const cocok = Object.keys(p.cocok).map(Number).sort((x, y) => x - y);
      out.push(`## ${b.path}:${cocok.join(',')}`, '```');
      for (let i = 0; i < p.teks.length; i += 1) {
        const nomor = p.dari + i;
        out.push(`${p.cocok[nomor] ? '>' : ' '} ${String(nomor).padStart(5)}  ${p.teks[i]}`);
      }
      out.push('```', '');
    }
  }
  return out.join('\n');
}

const isi = Array.from({ length: 30 }, (_, i) => `baris${i + 1}`).join('\n');

/* ── 1. Kecocokan tunggal ─────────────────────────────────────────────── */

const p1 = petikanUntuk(isi, [10]);
R.check('P1', p1.length === 1, `satu kecocokan -> 1 petikan (${p1.length})`);
R.check('P2', p1[0].dari === 7 && p1[0].sampai === 13, `3 baris konteks tiap sisi (${p1[0].dari}-${p1[0].sampai})`);
R.check('P3', p1[0].teks.length === 7, `7 baris total (${p1[0].teks.length})`);
R.check('P4', p1[0].cocok[10] === true, 'baris 10 ditandai cocok');
R.check('P5', !p1[0].cocok[9] && !p1[0].cocok[11], 'baris tetangga tidak ditandai');

/* ── 2. Konteks dipotong di tepi ──────────────────────────────────────── */

const p2 = petikanUntuk(isi, [1]);
R.check('P6', p2[0].dari === 1, `di baris 1, konteks atas dipotong (dari=${p2[0].dari})`);
R.check('P7', p2[0].sampai === 4, `sampai 1+3 (${p2[0].sampai})`);

const p3 = petikanUntuk(isi, [30]);
R.check('P8', p3[0].sampai === 30, `di baris terakhir, konteks bawah dipotong (sampai=${p3[0].sampai})`);
R.check('P9', p3[0].dari === 27, `dari 30-3 (${p3[0].dari})`);

/* ── 3. Berdekatan DIGABUNG ───────────────────────────────────────────── */

/*
 * Baris 10 dan 12 berjarak 2, sementara konteks 3 tiap sisi -> petikannya
 * tumpang tindih. Harus jadi SATU, bukan dua yang mencetak baris 11 dua kali.
 */
const p4 = petikanUntuk(isi, [10, 12]);
R.check('P10', p4.length === 1, `kecocokan berdekatan -> SATU petikan (${p4.length})`);
R.check('P11', p4[0].cocok[10] === true && p4[0].cocok[12] === true, 'kedua baris ditandai');
R.check('P12', p4[0].teks.length === p4[0].sampai - p4[0].dari + 1, 'tidak ada baris yang dicetak dobel');

/* Tepat bersinggungan: 10 dan 17 -> konteks 7-13 dan 14-20, tidak tumpang
   tindih tapi BERSAMBUNG. Digabung juga, karena kalau tidak akan ada dua
   petikan yang berbatasan tanpa baris di antaranya. */
const p5 = petikanUntuk(isi, [10, 17]);
R.check('P13', p5.length === 1, `bersinggungan -> digabung (${p5.length})`);
R.check('P14', p5[0].dari === 7 && p5[0].sampai === 20, `rentang 7-20 (${p5[0].dari}-${p5[0].sampai})`);

/* ── 4. Berjauhan jadi terpisah ───────────────────────────────────────── */

const p6 = petikanUntuk(isi, [5, 25]);
R.check('P15', p6.length === 2, `berjauhan -> 2 petikan (${p6.length})`);
R.check('P16', p6[0].sampai < p6[1].dari, 'tidak tumpang tindih');

/* ── 5. Duplikat & urutan ─────────────────────────────────────────────── */

const p7 = petikanUntuk(isi, [10, 10, 10]);
R.check('P17', p7.length === 1, `baris duplikat -> 1 petikan (${p7.length})`);
R.check('P18', Object.keys(p7[0].cocok).length === 1, 'satu penanda, bukan tiga');

const p8 = petikanUntuk(isi, [25, 5]);
R.check('P19', p8[0].dari < p8[1].dari, 'diurutkan naik walau masukannya terbalik');

R.check('P20', petikanUntuk(isi, []).length === 0, 'tanpa kecocokan -> tanpa petikan');

/* ── 6. Markdown ──────────────────────────────────────────────────────── */

const md = keMarkdown('cari', [{ path: 'a.ts', petikan: p1 }]);
R.check('M1', md.startsWith('# Search: cari'), 'judul ada');
R.check('M2', md.includes('## a.ts:10'), 'heading berkas:baris');
R.check('M3', /^> +10 {2}baris10$/m.test(md), 'baris cocok ditandai >');
/*
 * A context line is `' ' + padStart(5)` — the marker column AND the right-aligned
 * number — so a one-digit line number is preceded by SIX spaces. Written as
 * `{2}` and then `{4}` before that, both wrong; the output was right each time.
 * Counting the columns explicitly is what the assertion should have done from
 * the start.
 */
R.check('M4', /^ {6}7 {2}baris7$/m.test(md), 'baris konteks tidak ditandai');
R.check('M5', (md.match(/```/g) || []).length === 2, 'satu blok kode');
R.check('M6', md.includes('1 result in 1 file'), 'ringkasan tunggal betul');

const md2 = keMarkdown('x', []);
R.check('M7', md2.includes('0 results in 0 files'), `tanpa hasil (${md2.split('\n')[2]})`);

/* ── 7. Pemeriksaan silang ke sumber ──────────────────────────────────── */

const src = (() => {
  try {
    return fs.readFileSync('src/lib/searchEditor.ts', 'utf8');
  } catch {
    return '';
  }
})();
R.check('S1', /export function petikanUntuk/.test(src), 'petikanUntuk diekspor');
R.check('S2', /dari <= kini\.sampai \+ 1/.test(src), 'aturan penggabungan ada di sumber');
R.check('S3', /export function keMarkdown/.test(src), 'keMarkdown diekspor');
R.check('S4', /KONTEKS = 3/.test(src), 'konteks 3 baris');

console.log('\n  catatan: aturan di atas mencerminkan src/lib/searchEditor.ts');
R.selesai();
process.exit(gagal ? 1 : 0);
