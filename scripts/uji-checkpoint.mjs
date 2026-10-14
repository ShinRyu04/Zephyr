/**
 * uji-checkpoint.mjs - bukti logika checkpoint agent benar.
 *
 * Kenapa ini penting: ini jaring pengaman. Kalau ia salah mencatat, pembaca
 * menekan "kembalikan" dan mendapat berkas yang SETENGAH kembali — lebih buruk
 * daripada tidak ada tombol, karena ia percaya pekerjaannya sudah dibatalkan.
 *
 * Yang diuji:
 *   1. snapshot PERTAMA per berkas yang menang (bukan yang terakhir)
 *   2. berkas yang tidak ada sebelumnya dicatat sebagai `baru`
 *   3. tanpa turn aktif, penulisan tidak dicatat (kerja pembaca sendiri)
 *   4. turn tanpa berkas menghasilkan null (tanpa tombol)
 *   5. berkas baru DIHAPUS saat dipulihkan, bukan "dipulihkan"
 *   6. kegagalan satu berkas tidak menghentikan yang lain
 *
 * Murni: tidak menempel ke CDP, tidak butuh app jalan.
 *
 *   node scripts/uji-checkpoint.mjs
 */
import { reporter } from './lib-cdp.mjs';
import fs from 'node:fs';

const R = reporter('checkpoint agent');

let gagal = false;
const asli = R.check.bind(R);
R.check = (id, ok, detail) => {
  if (!ok) gagal = true;
  asli(id, ok, detail);
};

/* Cerminan checkpoint.ts. */
function buatCheckpoint() {
  let aktif = null;
  const snapshots = new Map();
  let nomor = 0;

  return {
    mulaiTurn(composerId, pesanId) {
      aktif = { composerId, pesanId, at: 1, berkas: [] };
    },
    async catat(path, adaDiDisk = true) {
      if (!aktif) return;
      if (aktif.berkas.some((b) => b.path === path)) return;
      if (adaDiDisk) {
        const id = `snap${++nomor}`;
        snapshots.set(`${path}|${id}`, 'isi-lama');
        aktif.berkas.push({ path, snapshotId: id, baru: false });
      } else {
        aktif.berkas.push({ path, snapshotId: null, baru: true });
      }
    },
    tutup() {
      const c = aktif && aktif.berkas.length > 0 ? aktif : null;
      aktif = null;
      return c;
    },
    snapshot: (path, id) => snapshots.get(`${path}|${id}`),
  };
}

async function pulihkan(c, adaSnapshot, hapus, opsi = {}) {
  const hasil = { dipulihkan: [], dihapus: [], gagal: [] };
  for (const b of c.berkas) {
    try {
      if (opsi.gagalDi?.includes(b.path)) throw new Error('gagal disengaja');
      if (b.baru || !b.snapshotId) {
        await hapus(b.path);
        hasil.dihapus.push(b.path);
        continue;
      }
      if (!adaSnapshot(b.path, b.snapshotId)) {
        hasil.gagal.push({ path: b.path, pesan: 'snapshot hilang' });
        continue;
      }
      hasil.dipulihkan.push(b.path);
    } catch (e) {
      hasil.gagal.push({ path: b.path, pesan: String(e.message) });
    }
  }
  return hasil;
}

/* ── 1. Snapshot PERTAMA yang menang ──────────────────────────────────── */

const cp = buatCheckpoint();
cp.mulaiTurn('', 'm1');
await cp.catat('a.ts', true);
await cp.catat('b.ts', true);
await cp.catat('a.ts', true); // edit kedua pada berkas yang sama
const c1 = cp.tutup();
R.check('K1', c1.berkas.length === 2, `dua berkas tercatat, bukan tiga (${c1.berkas.length})`);
const a = c1.berkas.find((b) => b.path === 'a.ts');
R.check('K2', a.snapshotId === 'snap1', `a.ts memakai snapshot PERTAMA (${a.snapshotId})`);
R.check('K3', cp.snapshot('a.ts', 'snap1') === 'isi-lama', 'snapshot pertama masih ada');
R.check('K4', !cp.snapshot('a.ts', 'snap3'), 'snapshot kedua TIDAK dibuat (dilewati)');

/* ── 2. Berkas baru dicatat sebagai `baru` ────────────────────────────── */

const cp2 = buatCheckpoint();
cp2.mulaiTurn('', 'm2');
await cp2.catat('baru.ts', false);
const c2 = cp2.tutup();
R.check('K5', c2.berkas[0].baru === true, 'berkas tak ada -> baru:true');
R.check('K6', c2.berkas[0].snapshotId === null, 'tanpa snapshotId');

/* ── 3. Tanpa turn aktif, tidak dicatat ───────────────────────────────── */

const cp3 = buatCheckpoint();
await cp3.catat('kerja-pembaca.ts', true);
R.check('K7', cp3.tutup() === null, 'penulisan di luar turn agent tidak dicatat');

/* ── 4. Turn tanpa berkas -> null ─────────────────────────────────────── */

const cp4 = buatCheckpoint();
cp4.mulaiTurn('', 'm4');
R.check('K8', cp4.tutup() === null, 'turn tanpa berkas -> null (tanpa tombol)');

/* ── 5. Berkas baru DIHAPUS saat dipulihkan ───────────────────────────── */

const ada = () => true;
const dihapus = [];
const h1 = await pulihkan(c2, ada, async (p) => dihapus.push(p));
R.check('K9', dihapus.length === 1 && dihapus[0] === 'baru.ts', `berkas baru dihapus (${dihapus.join(',')})`);
R.check('K10', h1.dihapus.length === 1 && h1.dipulihkan.length === 0, 'dilaporkan sebagai dihapus, bukan dipulihkan');

/* ── 6. Kegagalan satu berkas tidak menghentikan yang lain ────────────── */

const c3 = {
  composerId: '',
  pesanId: 'm',
  at: 1,
  berkas: [
    { path: 'x.ts', snapshotId: 'snapX', baru: false },
    { path: 'y.ts', snapshotId: 'snapY', baru: false },
    { path: 'z.ts', snapshotId: 'snapZ', baru: false },
  ],
};
const h2 = await pulihkan(c3, ada, async () => {}, { gagalDi: ['y.ts'] });
R.check('K11', h2.gagal.length === 1 && h2.gagal[0].path === 'y.ts', 'satu gagal dilaporkan');
R.check('K12', h2.dipulihkan.length === 2, `dua lainnya tetap dipulihkan (${h2.dipulihkan.length})`);
R.check('K13', h2.dipulihkan.includes('z.ts'), 'berkas SETELAH yang gagal tetap diproses');

/* ── 7. Snapshot hilang dilaporkan, bukan diam ────────────────────────── */

const h3 = await pulihkan(c3, (p, id) => id !== 'snapY', async () => {});
R.check('K14', h3.gagal.length === 1, `snapshot hilang dilaporkan (${h3.gagal.length})`);
R.check('K15', h3.gagal[0].pesan.includes('hilang'), `alasannya jelas (${h3.gagal[0].pesan})`);

/* ── 8. Pemeriksaan silang ke sumber ──────────────────────────────────── */

const src = (() => {
  try {
    return fs.readFileSync('src/lib/checkpoint.ts', 'utf8');
  } catch {
    return '';
  }
})();
R.check('S1', /export function mulaiTurn/.test(src), 'mulaiTurn diekspor');
R.check('S2', /export async function catat/.test(src), 'catat diekspor');
R.check('S3', /berkas\.some\(\(b\) => b\.path === path\)/.test(src), 'cek snapshot pertama ada di sumber');
R.check('S4', /if \(!aktif\) return;/.test(src), 'tanpa turn aktif tidak dicatat');
R.check('S5', /berkas\.length > 0 \? aktif : null/.test(src), 'turn kosong -> null');
R.check('S6', /b\.baru \|\| !b\.snapshotId/.test(src), 'berkas baru dihapus, bukan dipulihkan');

console.log('\n  catatan: aturan di atas mencerminkan src/lib/checkpoint.ts');
R.selesai();
process.exit(gagal ? 1 : 0);
