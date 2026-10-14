/**
 * uji-rangkai-format.mjs - bukti rantai formatter eksternal benar.
 *
 * Kenapa ini penting: `eslint --fix` keluar dengan kode 1 saat ia BERHASIL
 * memperbaiki sesuatu, DAN saat ia menemukan masalah yang tak bisa diperbaiki.
 * Kalau kode keluar non-nol dianggap "gagal, buang hasilnya", perbaikan eslint
 * hilang diam-diam. Kalau stdout kosong dianggap hasil yang sah, berkas jadi
 * KOSONG saat formatter-nya tidak ada di PATH.
 *
 * Yang diuji:
 *   1. rantai berurutan: keluaran satu jadi masukan berikutnya
 *   2. stdout kosong + gagal = pertahankan teks sebelumnya (bukan kosong)
 *   3. stdout ada + kode keluar non-nol = PAKAI hasilnya (kasus eslint --fix)
 *   4. perintah gagal dilewati, rantai lanjut
 *   5. filter ekstensi dihormati
 *   6. perintah kosong dilewati
 *   7. yang tidak mengubah apa pun tidak dilaporkan sebagai perubahan
 *
 * Murni: tidak menempel ke CDP, tidak butuh app jalan.
 *
 *   node scripts/uji-rangkai-format.mjs
 */
import { reporter } from './lib-cdp.mjs';
import fs from 'node:fs';

const R = reporter('rantai formatter eksternal');

let gagal = false;
const asli = R.check.bind(R);
R.check = (id, ok, detail) => {
  if (!ok) gagal = true;
  asli(id, ok, detail);
};

/* Cerminan berlaku() + rangkaiFormat() di src/lib/formatters.ts. */
function berlaku(f, path) {
  const ext = (f.extensions ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (ext.length === 0) return true;
  const bawah = path.toLowerCase();
  return ext.some((e) => bawah.endsWith(e.startsWith('.') ? e : `.${e}`));
}

async function rangkaiFormat(teks, path, daftar, jalankan) {
  let kini = teks;
  const diubah = [];
  const gagal = [];
  for (const f of daftar) {
    if (!berlaku(f, path)) continue;
    const cmd = (f.cmd ?? '').trim();
    if (!cmd) continue;
    let hasil;
    try {
      hasil = await jalankan(cmd, kini);
    } catch (e) {
      gagal.push({ cmd, pesan: String(e?.message ?? e) });
      continue;
    }
    if (!hasil.out) {
      if (!hasil.ok) gagal.push({ cmd, pesan: (hasil.err || 'no output').trim().slice(0, 200) });
      continue;
    }
    if (hasil.out !== kini) diubah.push(cmd);
    kini = hasil.out;
  }
  return { teks: kini, diubah, gagal };
}

/* ── 1. Rantai berurutan ──────────────────────────────────────────────── */

const urut = [];
const jalankanUrut = async (cmd, input) => {
  urut.push({ cmd, input });
  /* Setiap perintah menambahkan penandanya sendiri. */
  return { ok: true, out: `${input}|${cmd}`, err: '' };
};
const r1 = await rangkaiFormat('awal', 'a.ts', [{ cmd: 'satu' }, { cmd: 'dua' }], jalankanUrut);
R.check('F1', r1.teks === 'awal|satu|dua', `keluaran berantai (${r1.teks})`);
R.check('F2', urut[1].input === 'awal|satu', 'perintah kedua menerima keluaran pertama');
R.check('F3', r1.diubah.length === 2, `keduanya dilaporkan berubah (${r1.diubah.length})`);

/* ── 2. stdout kosong + gagal = pertahankan ───────────────────────────── */

/*
 * Ini kasus "formatter tidak ada di PATH": exit non-nol, stdout kosong. Kalau
 * hasil kosong dipakai, berkasnya JADI KOSONG.
 */
const r2 = await rangkaiFormat('kode penting', 'a.ts', [{ cmd: 'hilang' }], async () => ({
  ok: false,
  out: '',
  err: 'command not found',
}));
R.check('F4', r2.teks === 'kode penting', `teks dipertahankan, tidak dikosongkan (${JSON.stringify(r2.teks)})`);
R.check('F5', r2.gagal.length === 1, `kegagalan dilaporkan (${r2.gagal.length})`);
R.check('F6', r2.gagal[0].pesan.includes('not found'), `pesannya diteruskan (${r2.gagal[0].pesan})`);

/* ── 3. stdout ada + kode non-nol = PAKAI (eslint --fix) ──────────────── */

/*
 * Keputusan yang paling mudah salah. `eslint --fix` keluar 1 saat berhasil
 * memperbaiki; membuang hasilnya berarti perbaikannya hilang.
 */
const r3 = await rangkaiFormat('let x=1', 'a.ts', [{ cmd: 'eslint --fix' }], async () => ({
  ok: false,
  out: 'let x = 1;',
  err: 'warning: 1 problem',
}));
R.check('F7', r3.teks === 'let x = 1;', `hasil DIPAKAI walau exit non-nol (${JSON.stringify(r3.teks)})`);
R.check('F8', r3.gagal.length === 0, 'tidak dilaporkan gagal karena ada keluaran');
R.check('F9', r3.diubah.length === 1, 'dilaporkan berubah');

/* ── 4. Gagal dilewati, rantai lanjut ─────────────────────────────────── */

const r4 = await rangkaiFormat(
  'x',
  'a.ts',
  [{ cmd: 'rusak' }, { cmd: 'baik' }],
  async (cmd, input) => (cmd === 'rusak' ? { ok: false, out: '', err: 'boom' } : { ok: true, out: `${input}!`, err: '' }),
);
R.check('F10', r4.teks === 'x!', `rantai lanjut setelah yang gagal (${r4.teks})`);
R.check('F11', r4.gagal.length === 1 && r4.diubah.length === 1, 'satu gagal, satu berubah');

/* ── 5. Filter ekstensi ───────────────────────────────────────────────── */

const dipanggil = [];
const jalankanCatat = async (cmd, input) => {
  dipanggil.push(cmd);
  return { ok: true, out: input, err: '' };
};
await rangkaiFormat('x', 'a.rs', [{ cmd: 'ts', extensions: ['.ts'] }, { cmd: 'rs', extensions: ['.rs'] }], jalankanCatat);
R.check('F12', dipanggil.length === 1 && dipanggil[0] === 'rs', `hanya yang cocok ekstensi (${dipanggil.join(',')})`);

/* Tanpa daftar ekstensi = berlaku untuk semua. */
dipanggil.length = 0;
await rangkaiFormat('x', 'a.rs', [{ cmd: 'semua' }], jalankanCatat);
R.check('F13', dipanggil.length === 1, 'tanpa extensions = berlaku untuk semua');

/* Ekstensi tanpa titik juga cocok. */
dipanggil.length = 0;
await rangkaiFormat('x', 'a.ts', [{ cmd: 'tanpa-titik', extensions: ['ts'] }], jalankanCatat);
R.check('F14', dipanggil.length === 1, 'ekstensi tanpa titik tetap cocok');

/* ── 6. Perintah kosong dilewati ──────────────────────────────────────── */

dipanggil.length = 0;
await rangkaiFormat('x', 'a.ts', [{ cmd: '  ' }, { cmd: '' }], jalankanCatat);
R.check('F15', dipanggil.length === 0, 'perintah kosong tidak dijalankan');

/* ── 7. Tidak berubah = tidak dilaporkan ──────────────────────────────── */

const r7 = await rangkaiFormat('sudah rapi', 'a.ts', [{ cmd: 'noop' }], async (_c, input) => ({
  ok: true,
  out: input,
  err: '',
}));
R.check('F16', r7.diubah.length === 0, 'yang tidak mengubah tidak dilaporkan berubah');
R.check('F17', r7.teks === 'sudah rapi', 'teksnya tetap');

/* ── 8. Exception saat menjalankan ditangkap ──────────────────────────── */

const r8 = await rangkaiFormat('x', 'a.ts', [{ cmd: 'lempar' }], async () => {
  throw new Error('proses mati');
});
R.check('F18', r8.teks === 'x' && r8.gagal.length === 1, `exception ditangkap, teks utuh (${r8.gagal[0]?.pesan})`);

/* ── 9. Pemeriksaan silang ke sumber ──────────────────────────────────── */

const src = (() => {
  try {
    return fs.readFileSync('src/lib/formatters.ts', 'utf8');
  } catch {
    return '';
  }
})();
const rs = (() => {
  try {
    return fs.readFileSync('src-tauri/src/hooks.rs', 'utf8');
  } catch {
    return '';
  }
})();

R.check('F19', /export async function rangkaiFormat/.test(src), 'rangkaiFormat diekspor');
R.check('F20', /if \(!hasil\.out\)/.test(src), 'stdout kosong ditangani khusus di sumber');
R.check('F21', /pub async fn format_text/.test(rs), 'format_text ada di Rust');
R.check('F22', /replace\("\{file\}"/.test(rs), 'substitusi {file} ada di Rust');
R.check('F23', /raw_arg\(format!\("\/d \/s \/c/.test(rs), 'format_text memakai /d /s /c seperti hook_run');

console.log('\n  catatan: aturan di atas mencerminkan src/lib/formatters.ts');
R.selesai();
process.exit(gagal ? 1 : 0);
