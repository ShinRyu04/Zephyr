#!/usr/bin/env node
/**
 * uji-baca-kode.mjs - harness item ZEPH-BACA-KODE-SENDIRI (lanjutan ai-tahu-100-8).
 *
 * Yang dibuktikan di sini, dengan angka yang DIUKUR dari berkas nyata (bukan
 * diketik di prosa), dan tanpa menjalankan aplikasi (nol CDP, nol :9223):
 *
 *   A. BISA MEMBACA ISI. Peta kode cuma bisa MENUNJUK berkas (mis.
 *      `src/components/shell/ActivityBar.tsx`). Di sini berkas yang sama
 *      benar-benar DIBACA, barisnya dikirim bernomor, dan TIAP baris yang
 *      keluar dicocokkan ulang dengan isi disk - jadi klaim "bisa membaca"
 *      punya bukti byte-per-byte, bukan contoh karangan. Termasuk
 *      determinisme (dua panggilan sama = byte-identik).
 *
 *   B. BATASNYA NYATA DAN DISEBUT. 120 baris/pembacaan, berkas <= 512 KiB,
 *      400 karakter/baris, 6000 karakter/pembacaan, 1 berkas/panggilan,
 *      12 pembacaan/sesi. Tiap batas diuji: permintaan di atas batas harus
 *      DIPOTONG atau DITOLAK, dan penolakannya menyebut angkanya.
 *
 *   C. UJI NEGATIF WAJIB. `..`, jalur absolut (`/etc/hosts`, `C:/Windows/...`),
 *      jalur UNC (`\\server\share\...`), bentuk ter-encode, byte kontrol,
 *      berkas rahasia (.env/*.key/*.pem/secrets.json/id_rsa/.npmrc/jalur
 *      terproteksi, termasuk folder rahasia), symlink/junction keluar repo,
 *      berkas biner, isi ber-NUL, folder, dan daftar di args: semuanya
 *      DITOLAK. Untuk penolakan jalur/rahasia dibuktikan jembatan berkas
 *      TIDAK disentuh sama sekali (hitungan pemanggilan = 0), bukan cuma "ada
 *      pesan penolakan".
 *
 *   D. TETAP LOKAL, HANYA BACA. Modul `src/lib/bacaKode.ts` dipindai sesudah
 *      komentar dibuang: nol permintaan jaringan, nol akses berkas Node, nol
 *      folder rumah, nol variabel lingkungan, nol kemampuan tulis. Ditambah
 *      bukti runtime: Proxy mencatat SETIAP akses properti ke objek jembatan
 *      (hanya `realpath`/`fsStat`/`fsRead` yang boleh muncul), tiap jalur yang
 *      dibaca wajib di dalam akar repo, dan berkas yang dibaca punya sidik
 *      (ukuran+mtime+sha1) identik sebelum & sesudah uji.
 *
 *   E. LAPISAN TOOL. Spesifikasi tool `zephyr_kode` + handler-nya diuji lewat
 *      `pasangJembatanBacaKode`/`jalankanBacaKode` - bukan cuma fungsi murninya.
 *
 *   F. BUKTI PINJAM-DAFTAR. Daftar berkas rahasia BUKAN daftar baru: modul
 *      meminjam `alasanBlokirRahasia()` (`src/lib/konteksRepo.ts`), yang
 *      memakai daftar bersama `src/lib/agentGuard.ts`. Harness menyebut baris
 *      nyatanya, memeriksa identitas objeknya, dan membandingkan putusan kedua
 *      gerbang pada nama yang sama (yang diblokir gerbang bersama tidak boleh
 *      lolos di modul ini).
 *
 *   G. BUKTI NON-DUPLIKASI. Baris ekspor fungsi yang SUDAH ada di modul nyata
 *      (agentGuard/konteksRepo/zephyrIndeks/zephyrCari/alurVerifikasi) dicetak.
 *
 * Cara pakai:
 *   node scripts/uji-baca-kode.mjs      (semua kasus; exit 1 kalau ada merah)
 */
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const AKAR = resolve(join(dirname(fileURLToPath(import.meta.url)), '..'));
const KERJA = mkdtempSync(join(tmpdir(), 'uji-baca-kode-'));
const AKARN = (realpathSync(AKAR) ?? AKAR).replace(/\\/g, '/').toLowerCase();

/* ------------------------------------------------------------------ cetak */

let lulus = 0;
let total = 0;
const merah = [];
const cek = (bagian, nama, syarat, bukti) => {
  total++;
  if (syarat) {
    lulus++;
    console.log(`  OK    ${bagian} ${nama}${bukti !== undefined ? `  [${bukti}]` : ''}`);
  } else {
    merah.push(`${bagian} ${nama}`);
    console.log(`  GAGAL ${bagian} ${nama}  [${bukti}]`);
  }
};
const angka = (nama, nilai) => console.log(`  ANGKA ${nama.padEnd(58)} ${nilai}`);

console.log('UJI BACA KODE ZEPHYR (ZEPH-BACA-KODE-SENDIRI)');

/* ------------------------------------------------------------------ modul NYATA lewat esbuild
 * Yang diuji adalah modul yang benar-benar ikut bundel aplikasi
 * (`src/lib/bacaKode.ts` + yang ia impor), bukan salinan aturannya di dalam
 * skrip ini. `splitting` dipakai supaya `konteksRepo`/`agentGuard` cuma punya
 * SATU instance modul di antara ketiga titik masuk - itu yang membuat uji
 * identitas daftar (bagian F) sah, bukan sekadar mirip. */

await esbuild.build({
  entryPoints: [
    join(AKAR, 'src', 'lib', 'bacaKode.ts'),
    join(AKAR, 'src', 'lib', 'konteksRepo.ts'),
    join(AKAR, 'src', 'lib', 'agentGuard.ts'),
  ],
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'node',
  target: 'es2022',
  logLevel: 'silent',
  outdir: join(KERJA, 'bundel'),
});
writeFileSync(join(KERJA, 'bundel', 'package.json'), '{"type":"module"}', 'utf8');
const imp = (nama) => import(pathToFileURL(join(KERJA, 'bundel', nama)).href);
const BK = await imp('bacaKode.js');
const KR = await imp('konteksRepo.js');
const AG = await imp('agentGuard.js');

/* ------------------------------------------------------------------ jembatan berkas yang mencatat
 * Tiap kemampuan menaikkan hitungannya, jadi "ditolak SEBELUM disk disentuh"
 * bisa dibuktikan dengan angka, bukan dengan percaya. */
const JALUR_DIBACA = [];

function buatJembatan(akar, opsi = {}) {
  const hitung = { realpath: 0, fsStat: 0, fsRead: 0 };
  const akarAsli = (() => {
    try {
      return realpathSync(akar);
    } catch {
      return akar;
    }
  })();
  const cmd = {
    async realpath(p) {
      hitung.realpath++;
      return realpathSync(p);
    },
    async fsStat(p) {
      hitung.fsStat++;
      const st = statSync(p);
      return { size: opsi.ukuranPalsu ?? st.size, isDir: opsi.paksaFolder === true ? true : st.isDirectory() };
    },
    async fsRead(p) {
      hitung.fsRead++;
      JALUR_DIBACA.push({ akar: akarAsli, p });
      if (opsi.isiPalsu !== undefined) return { content: opsi.isiPalsu };
      return { content: readFileSync(p, 'utf8') };
    },
  };
  const diakses = new Set();
  const ditutup = new Proxy(cmd, {
    get(t, prop) {
      if (typeof prop === 'string') diakses.add(prop);
      return t[prop];
    },
  });
  return { jembatan: { cmd: opsi.pakaiProxy === false ? cmd : ditutup, akar }, hitung, diakses };
}

const jemUtama = buatJembatan(AKAR);
const KELUARAN = [];
const catat = (r) => {
  if (r && typeof r === 'object') {
    if (typeof r.teks === 'string') KELUARAN.push(r.teks);
    if (typeof r.alasan === 'string') KELUARAN.push(r.alasan);
  } else if (typeof r === 'string') KELUARAN.push(r);
  return r;
};

/* ------------------------------------------------------------------ pembaca baris keluaran */

function uraikan(teks) {
  const baris = String(teks).split('\n');
  const isi = [];
  for (const b of baris.slice(1)) {
    const m = /^(\d+)\| (.*)$/.exec(b);
    if (m) isi.push({ nomor: Number(m[1]), teks: m[2] });
  }
  return { kepala: baris[0] ?? '', isi, semua: baris };
}

/** Baris nyata di disk, memakai aturan pemotong yang sama dengan modul. */
function barisDisk(p) {
  const bagian = readFileSync(p, 'utf8').split(/\r\n|\r|\n/);
  if (bagian.length && bagian[bagian.length - 1] === '') bagian.pop();
  return bagian;
}

const AKTIVITAS = 'src/components/shell/ActivityBar.tsx';
const KONTEKS = 'src/lib/konteksRepo.ts';
const sumberModul = readFileSync(join(AKAR, 'src', 'lib', 'bacaKode.ts'), 'utf8');

/** berkas kecil (dibaca utuh) - dicari di disk, bukan diketik di sini */
const berkasKecil = (() => {
  const telusuri = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        const h = telusuri(p);
        if (h) return h;
      } else if (e.name.endsWith('.ts') && !e.name.endsWith('.d.ts') && barisDisk(p).length < 100) {
        return relative(AKAR, p).replace(/\\/g, '/');
      }
    }
    return null;
  };
  return telusuri(join(AKAR, 'src', 'lib'));
})();

/** sidik berkas yang akan dibaca: bukti tidak ada yang MENULIS ke sana */
const sidik = (p) => {
  const st = statSync(p);
  return `${st.size}:${Math.round(st.mtimeMs)}:${createHash('sha1').update(readFileSync(p)).digest('hex').slice(0, 12)}`;
};
const SEBELUM = Object.fromEntries([AKTIVITAS, KONTEKS, berkasKecil].map((r) => [r, sidik(join(AKAR, r))]));
const jumlahBerkasRepo = (() => {
  const lewat = new Set(['node_modules', 'target', '.git', 'dist', '.vite']);
  let n = 0;
  const jalan = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (!lewat.has(e.name)) jalan(join(dir, e.name));
      } else n++;
    }
  };
  jalan(AKAR);
  return n;
})();

/* ================================================================== A. BISA MEMBACA ISI */

let adaContoh = true;
try {
  statSync(join(AKAR, AKTIVITAS));
} catch {
  adaContoh = false;
}
const barisAktivitas = barisDisk(join(AKAR, AKTIVITAS));

cek(
  'A0',
  'berkas contoh ada di repo DAN disebut peta kode sebagai entri `kode` (jadi kasusnya nyata, bukan karangan)',
  adaContoh && sumberModul.includes(AKTIVITAS) && readFileSync(join(AKAR, 'src', 'lib', 'zephyrIndeks.ts'), 'utf8').includes(AKTIVITAS),
  `${AKTIVITAS}, ${barisAktivitas.length} baris di disk`,
);

const t0 = Date.now();
const A1 = catat(await BK.bacaBerkasKode({ berkas: AKTIVITAS, dari: 350, sampai: 360 }, jemUtama.jembatan));
const t1 = Date.now();
cek(
  'A1',
  'ISI berkas dibaca (bukan ditunjuk) dan kepalanya menyebut berkas + rentang baris nyata',
  A1.ok && A1.teks.startsWith('[baca_kode v') && A1.teks.includes(`${AKTIVITAS}:350-360`),
  A1.teks.split('\n')[0],
);

const uA1 = uraikan(A1.teks);
const diskAktivitas = barisDisk(join(AKAR, AKTIVITAS));
const semuaCocok = uA1.isi.every((b) => diskAktivitas[b.nomor - 1] === b.teks);
cek(
  'A2',
  'tiap baris keluaran sama PERSIS dengan baris nyata di disk (bisa dilacak balik ke berkas+baris)',
  A1.ok && uA1.isi.length === 11 && semuaCocok && uA1.isi[0].nomor === 350 && uA1.isi[10].nomor === 360,
  `${uA1.isi.length} baris dicocokkan ulang ke disk, ${semuaCocok ? 'semua sama' : 'ADA YANG BEDA'}`,
);

const A3 = catat(await BK.bacaBerkasKode({ berkas: KONTEKS, simbol: 'normalJalur' }, jemUtama.jembatan));
const barisKonteks = barisDisk(join(AKAR, KONTEKS));
const diharapNormalJalur = barisKonteks.findIndex((b) => /^export function normalJalur\b/.test(b)) + 1;
cek(
  'A3',
  'pembacaan lewat SIMBOL menemukan baris definisi yang benar dan mengirim jendelanya',
  A3.ok &&
    A3.potongan.simbolBaris === diharapNormalJalur &&
    A3.potongan.dari === diharapNormalJalur - BK.JENDELA_SEBELUM_SIMBOL &&
    A3.potongan.sampai === diharapNormalJalur + BK.JENDELA_SESUDAH_SIMBOL,
  `normalJalur@${A3.ok ? A3.potongan.simbolBaris : '?'} (harusnya ${diharapNormalJalur}), jendela ${A3.ok ? `${A3.potongan.dari}-${A3.potongan.sampai}` : '?'}`,
);

/* A4 - determinisme: isi + rentang sama harus byte-identik, termasuk lewat dua
 * jembatan yang berbeda dan lewat fungsi murninya. */
const isiKontek = readFileSync(join(AKAR, KONTEKS), 'utf8');
const p1 = BK.rakitPotongan(BK.bacaPotongan(isiKontek, KONTEKS, { dari: 530, sampai: 540 }).potongan);
const p2 = BK.rakitPotongan(BK.bacaPotongan(isiKontek, KONTEKS, { dari: 530, sampai: 540 }).potongan);
const A4a = catat(await BK.bacaBerkasKode({ berkas: KONTEKS, dari: 530, sampai: 540 }, jemUtama.jembatan));
const A4b = catat(await BK.bacaBerkasKode({ berkas: KONTEKS, dari: 530, sampai: 540 }, buatJembatan(AKAR).jembatan));
cek(
  'A4',
  'DETERMINISME: panggilan sama = byte-identik (2x murni + 2x lewat jembatan berbeda)',
  p1 === p2 && A4a.ok && A4a.teks === p1 && A4b.ok && A4b.teks === p1,
  `${p1.length} byte identik, tag isi ${BK.tagIsi(isiKontek)}`,
);

/* A5 - simbol yang tidak ada: tolak jelas, bukan mengarang isi. */
const A5 = catat(await BK.bacaBerkasKode({ berkas: AKTIVITAS, simbol: 'SIMBOL_YANG_TIDAK_ADA_XYZ' }, jemUtama.jembatan));
cek('A5', 'simbol tidak ditemukan -> ditolak dengan alasan jelas (tidak mengarang isi)', A5.ok === false && /tidak ditemukan/.test(A5.alasan), A5.alasan);

/* A6 - berkas kecil dibaca SELURUHNYA (bukan cuma jendela). */
const A6 = catat(await BK.bacaBerkasKode({ berkas: berkasKecil }, jemUtama.jembatan));
cek(
  'A6',
  'berkas kecil dibaca SELURUHNYA (1..baris terakhir), potongnya bukan karena batas',
  A6.ok &&
    A6.potongan.dari === 1 &&
    A6.potongan.sampai === A6.potongan.totalBaris &&
    A6.potongan.baris.length < BK.BATAS_BARIS_POTONGAN &&
    A6.potongan.sebabPotong === 'ujung-berkas',
  `${berkasKecil}: 1-${A6.ok ? A6.potongan.sampai : '?'} dari ${A6.ok ? A6.potongan.totalBaris : '?'} baris`,
);

angka('A. baris ActivityBar.tsx bisa dikutip', `${diskAktivitas.length} baris`);
angka('A. baris konteksRepo.ts bisa dikutip', `${barisKonteks.length} baris`);
angka('A. waktu satu pembacaan 11 baris nyata (ms)', Math.max(1, t1 - t0));
angka('A. ukuran potongan 11 baris yang dikirim (karakter)', A1.ok ? A1.teks.length : 0);

/* ================================================================== B. BATAS */

const B1 = catat(await BK.bacaBerkasKode({ berkas: KONTEKS, dari: 1, sampai: 100000 }, jemUtama.jembatan));
const uB1 = uraikan(B1.teks);
const cocokB1 = uB1.isi.every((b) => barisKonteks[b.nomor - 1] === b.teks);
cek(
  'B1',
  `berkas nyata (${barisKonteks.length} baris) dipotong: tidak lebih dari ${BK.BATAS_BARIS_POTONGAN} baris, dan kepala menyebut baris awal-akhir + TOTAL baris nyata`,
  B1.ok &&
    B1.potongan.baris.length <= BK.BATAS_BARIS_POTONGAN &&
    B1.potongan.baris.length >= 20 &&
    B1.potongan.dari === 1 &&
    B1.potongan.sampai === B1.potongan.baris.length &&
    B1.potongan.totalBaris === barisKonteks.length &&
    B1.teks.includes(`(${BK.angkaTitik(B1.potongan.baris.length)} dari ${BK.angkaTitik(B1.potongan.totalBaris)} baris`) &&
    cocokB1,
  `baris 1-${B1.ok ? B1.potongan.sampai : '?'} dari ${B1.ok ? B1.potongan.totalBaris : '?'} (${uB1.isi.length} baris dikirim, sebab=${B1.ok ? B1.potongan.sebabPotong : '?'}; ${cocokB1 ? 'semua cocok disk' : 'ADA YANG BEDA'})`,
);
angka('B. berkas nyata 1.340 baris -> keluaran (baris, karakter, sebab potong)', `${B1.ok ? B1.potongan.baris.length : '?'} baris, ${B1.ok ? B1.teks.length : 0} karakter, sebab=${B1.ok ? B1.potongan.sebabPotong : '?'}`);

/* B1b - batas 120 baris diuji dengan baris PENDEK, supaya yang memotong memang
 * batas baris (di berkas nyata di atas, anggaran 6000 karakter memotong lebih
 * dulu - dan itu memang perilaku yang diinginkan). */
const isiPendekPjg = Array.from({ length: 300 }, (_, i) => `baris ${i + 1}`).join('\n');
const B1b = BK.bacaPotongan(isiPendekPjg, 'contoh/pendek.ts', { dari: 1, sampai: 100000 });
const teksB1b = B1b.ok ? BK.rakitPotongan(B1b.potongan) : B1b.alasan;
catat(teksB1b);
const uB1b = B1b.ok ? uraikan(teksB1b) : { isi: [] };
cek(
  'B1b',
  `300 baris pendek -> TEPAT ${BK.BATAS_BARIS_POTONGAN} baris dikirim (1-${BK.BATAS_BARIS_POTONGAN} dari 300), sebabnya 'batas-baris'`,
  B1b.ok &&
    B1b.potongan.baris.length === BK.BATAS_BARIS_POTONGAN &&
    B1b.potongan.dari === 1 &&
    B1b.potongan.sampai === BK.BATAS_BARIS_POTONGAN &&
    B1b.potongan.totalBaris === 300 &&
    B1b.potongan.sebabPotong === 'batas-baris' &&
    uB1b.isi.length === BK.BATAS_BARIS_POTONGAN &&
    uB1b.isi[0].nomor === 1 &&
    uB1b.isi[0].teks === 'baris 1',
  `${B1b.ok ? B1b.potongan.baris.length : '?'} baris, 1-${B1b.ok ? B1b.potongan.sampai : '?'} dari ${B1b.ok ? B1b.potongan.totalBaris : '?'}, sebab=${B1b.ok ? B1b.potongan.sebabPotong : '?'}`,
);

const jemBesar = buatJembatan(AKAR, { ukuranPalsu: BK.BATAS_BYTE_BERKAS + 1 });
const B2 = catat(await BK.bacaBerkasKode({ berkas: KONTEKS, dari: 1, sampai: 5 }, jemBesar.jembatan));
cek(
  'B2',
  `batas ukuran berkas ${BK.BATAS_BYTE_BERKAS} B (${BK.BATAS_BYTE_BERKAS / 1024} KiB) ditegakkan dan angkanya disebut`,
  B2.ok === false && /terlalu besar/.test(B2.alasan) && B2.alasan.includes(`${BK.BATAS_BYTE_BERKAS / 1024} KiB`),
  B2.alasan.slice(0, 100),
);
cek('B2b', 'berkas di atas batas ukuran TIDAK pernah dibaca', jemBesar.hitung.fsRead === 0, `fsRead=${jemBesar.hitung.fsRead}`);

const anggaran = BK.buatAnggaranBaca();
let bolehB3 = 0;
let ditolakB3 = null;
for (let i = 0; i < BK.BATAS_BACAAN_SESI + 1; i++) {
  const h = catat(await BK.bacaBerkasKode({ berkas: KONTEKS, dari: 1 + i, sampai: 2 + i }, jemUtama.jembatan, anggaran));
  if (h.ok) bolehB3++;
  else ditolakB3 = h;
}
cek(
  'B3',
  `anggaran sesi: ${BK.BATAS_BACAAN_SESI} pembacaan boleh, ke-${BK.BATAS_BACAAN_SESI + 1} ditolak + angkanya disebut`,
  bolehB3 === BK.BATAS_BACAAN_SESI && ditolakB3 !== null && /anggaran/.test(ditolakB3.alasan),
  `boleh ${bolehB3}x, lalu: ${ditolakB3 ? ditolakB3.alasan.slice(0, 68) : '-'}`,
);

/* B4 - satu berkas per panggilan (angka: BATAS_BERKAS_PER_PANGGILAN). */
const jemDaftar = buatJembatan(AKAR);
const B4 = catat(await BK.bacaBerkasKode({ berkas: [AKTIVITAS, KONTEKS], dari: 1, sampai: 5 }, jemDaftar.jembatan));
cek(
  'B4',
  `BATAS JUMLAH BERKAS/PANGGILAN = ${BK.BATAS_BERKAS_PER_PANGGILAN}: daftar berkas ditolak + angkanya disebut`,
  B4.ok === false && B4.alasan.includes(`${BK.BATAS_BERKAS_PER_PANGGILAN} berkas per panggilan`) && jemDaftar.hitung.fsRead === 0,
  B4.alasan,
);
cek(
  'B4b',
  'skema tool juga membatasi: `berkas` bertipe string tunggal (bukan array)',
  BK.SPEC_BACA_KODE.parameters.properties.berkas.type === 'string' && BK.SPEC_BACA_KODE.parameters.required.join(',') === 'berkas',
  `type=${BK.SPEC_BACA_KODE.parameters.properties.berkas.type}, required=${BK.SPEC_BACA_KODE.parameters.required.join(',')}`,
);

/* B5 - panjang baris dipangkas pada 400 karakter. */
const B5 = BK.bacaPotongan('x'.repeat(5000), 'contoh/panjang.ts', { dari: 1, sampai: 1 });
catat(B5.ok ? BK.rakitPotongan(B5.potongan) : B5.alasan);
cek(
  'B5',
  `baris lebih panjang dari ${BK.BATAS_KARAKTER_BARIS} karakter DIPANGKAS (tidak dikirim utuh) dan nomor barisnya disebut`,
  B5.ok && B5.potongan.baris[0].length === BK.BATAS_KARAKTER_BARIS && B5.potongan.dipangkas.includes(1) && BK.rakitPotongan(B5.potongan).includes(`${BK.BATAS_KARAKTER_BARIS} karakter`),
  `1 baris 5.000 karakter -> ${B5.ok ? B5.potongan.baris[0].length : '?'} karakter`,
);

/* B6 - anggaran karakter per potongan (6000). */
const B6 = BK.bacaPotongan(Array.from({ length: 300 }, (_, i) => `baris-${i} ${'y'.repeat(100)}`).join('\n'), 'contoh/banyak.ts', { dari: 1, sampai: 300 });
const teksB6 = B6.ok ? BK.rakitPotongan(B6.potongan) : '';
catat(teksB6);
cek(
  'B6',
  `anggaran ${BK.BATAS_CHAR_POTONGAN} karakter/pembacaan memotong LEBIH JAUH dari batas ${BK.BATAS_BARIS_POTONGAN} baris, dan sebabnya disebut`,
  B6.ok && B6.potongan.baris.length < BK.BATAS_BARIS_POTONGAN && B6.potongan.sebabPotong === 'batas-karakter' && /karakter\/pembacaan/.test(teksB6),
  `${B6.ok ? B6.potongan.baris.length : '?'} baris (dari ${BK.BATAS_BARIS_POTONGAN} yang diizinkan), keluaran ${teksB6.length} karakter`,
);

angka('B. batas baris/pembacaan', `${BK.BATAS_BARIS_POTONGAN} baris`);
angka('B. batas ukuran berkas', `${BK.BATAS_BYTE_BERKAS} B (${BK.BATAS_BYTE_BERKAS / 1024} KiB)`);
angka('B. batas karakter/baris dan /pembacaan', `${BK.BATAS_KARAKTER_BARIS} / ${BK.angkaTitik(BK.BATAS_CHAR_POTONGAN)}`);
angka('B. batas berkas/panggilan dan pembacaan/sesi', `${BK.BATAS_BERKAS_PER_PANGGILAN} / ${BK.BATAS_BACAAN_SESI}`);

/* ================================================================== C. NEGATIF (WAJIB) */

const jalurTerlarang = [
  '../../Windows/win.ini',
  '..\\..\\rahasia.ts',
  '..',
  '../src/lib/konteksRepo.ts',
  'src/..',
  '/etc/hosts',
  'D:/Zephyr/src/lib/bacaKode.ts',
  'C:/Windows/win.ini',
  'C:\\Windows\\System32\\drivers\\etc\\hosts',
  '\\\\server\\share\\rahasia.ts',
  '//server/share/rahasia.ts',
  '\\\\?\\D:\\Zephyr\\src\\lib\\bacaKode.ts',
  '%2e%2e/x.ts',
  '%2E%2E%2Fx.ts',
  'src/../../x.ts',
  'src/lib/../../../rahasia.ts',
  'src\\..\\..\\rahasia.ts',
  'src/lib/ba\u0000ca.ts',
  '',
  '   ',
  42,
  null,
  undefined,
];
let lolosTraversal = [];
let sentuhTraversal = 0;
for (const j of jalurTerlarang) {
  const jem = buatJembatan(AKAR);
  const h = catat(await BK.bacaBerkasKode({ berkas: j, dari: 1, sampai: 5 }, jem.jembatan));
  if (h.ok) lolosTraversal.push(String(j));
  sentuhTraversal += jem.hitung.fsRead + jem.hitung.fsStat + jem.hitung.realpath;
}
cek(
  'C1',
  `\`..\`, jalur absolut Windows/Linux, dan jalur UNC ditolak (${jalurTerlarang.length} bentuk sekaligus)`,
  lolosTraversal.length === 0,
  lolosTraversal.length ? `LOLOS: ${lolosTraversal.join(' | ')}` : `${jalurTerlarang.length} bentuk ditolak`,
);
cek('C1b', 'penolakan jalur terjadi SEBELUM jembatan berkas disentuh', sentuhTraversal === 0, `pemanggilan jembatan=${sentuhTraversal}`);

/* C2 - nama berkas rahasia. Daftarnya diambil dari berkas NYATA: pola yang
 * dipakai modul adalah `alasanBlokirRahasia()` (konteksRepo.ts) yang memakai
 * daftar bersama `agentGuard.ts` (POLA_RAHASIA + DIR_TERPROTEKSI). */
const jalurRahasia = [
  '.env',
  '.env.local',
  '.env.production',
  'src-tauri/.env',
  'src/lib/.env.example',
  'konfigurasi/kunci.key',
  'certs/sertifikat.pem',
  'sertifikat.p12',
  'secrets.json',
  'kredensial/credentials.yml',
  'token.txt',
  'id_rsa',
  'id_ed25519',
  '.npmrc',
  '.git/config',
  '.git-credentials',
  '.ssh/known_hosts',
  '.aws/credentials',
  '.azure/azureProfile.json',
  '.gnupg/secring.gpg',
  'src-tauri/tauri.key',
  'src/lib/password.txt',
  'src/.env/x.ts',
  '.config/gh/hosts.yml',
];
let lolosRahasia = [];
let sentuhRahasia = 0;
let sebutRahasia = 0;
for (const j of jalurRahasia) {
  const jem = buatJembatan(AKAR);
  const h = catat(await BK.bacaBerkasKode({ berkas: j, dari: 1, sampai: 5 }, jem.jembatan));
  if (h.ok) lolosRahasia.push(j);
  if (/ditolak/.test(h.alasan)) sebutRahasia++;
  sentuhRahasia += jem.hitung.fsRead + jem.hitung.fsStat + jem.hitung.realpath;
}
cek(
  'C2',
  `.env / *.key / *.pem / *.p12 / kredensial / id_rsa / .npmrc / folder terproteksi / FOLDER rahasia ditolak (${jalurRahasia.length} nama)`,
  lolosRahasia.length === 0 && sebutRahasia === jalurRahasia.length,
  lolosRahasia.length ? `LOLOS: ${lolosRahasia.join(' | ')}` : `${jalurRahasia.length} nama ditolak dengan alasan`,
);
cek('C2b', 'berkas rahasia TIDAK PERNAH dibaca: nol pemanggilan jembatan pada semua nama itu', sentuhRahasia === 0, `pemanggilan jembatan=${sentuhRahasia}`);

/* C3 - symlink/junction keluar repo. Repo asli tidak disentuh: yang dibuat
 * adalah akar PALSU di temp, `mintarepo/src/tautan` -> `luar/`. Jalur
 * `src/tautan/rahasia.ts` LOLOS semua pemeriksaan teks (relatif, .ts, bukan
 * nama rahasia) dan hanya tertangkap pagar realpath - itu sebabnya ada. */
let c3Bukti = 'tidak bisa dibuat';
let c3Lolos = true;
let c3Disk = -1;
let c3Realpath = -1;
try {
  const mintarepo = join(KERJA, 'mintarepo');
  const luar = join(KERJA, 'luar');
  mkdirSync(join(mintarepo, 'src'), { recursive: true });
  mkdirSync(luar, { recursive: true });
  writeFileSync(join(luar, 'rahasia.ts'), 'export const RAHASIA = "jangan sampai terbaca";\n', 'utf8');
  symlinkSync(luar, join(mintarepo, 'src', 'tautan'), 'junction');
  const jem = buatJembatan(mintarepo);
  const h = catat(await BK.bacaBerkasKode({ berkas: 'src/tautan/rahasia.ts', dari: 1, sampai: 1 }, jem.jembatan));
  c3Lolos = h.ok;
  c3Disk = jem.hitung.fsRead;
  c3Realpath = jem.hitung.realpath;
  c3Bukti = h.ok ? 'LOLOS: isi berkas di luar repo terbaca' : `ditolak: ${h.alasan.slice(0, 64)}`;
} catch (e) {
  c3Bukti = `tautan tidak bisa dibuat di mesin ini (${e.code ?? e.message})`;
  c3Lolos = false;
}
cek('C3', 'symlink/junction yang menunjuk KELUAR akar repo ditolak', !c3Lolos, c3Bukti);
cek('C3b', 'berkas di balik tautan keluar repo tidak pernah dibaca (realpath dipakai dulu, lalu ditolak)', c3Disk === 0 && c3Realpath >= 2, `fsRead=${c3Disk}, realpath=${c3Realpath}`);

/* C4 - biner NYATA di repo: ditolak tanpa dibaca, dan deteksi isi memang
 * mengenali berkas itu biner. */
const pngNama = (() => {
  const dir = join(AKAR, 'src-tauri', 'icons');
  const f = readdirSync(dir).find((n) => n.endsWith('.png'));
  return f ? `src-tauri/icons/${f}` : null;
})();
let c4Bukti = 'tidak ada .png di repo';
let c4Ok = false;
let c4Biner = null;
try {
  const jem = buatJembatan(AKAR);
  const h = catat(await BK.bacaBerkasKode({ berkas: pngNama, dari: 1, sampai: 2 }, jem.jembatan));
  c4Biner = BK.apakahBiner(readFileSync(join(AKAR, pngNama)).toString('latin1'));
  c4Ok = h.ok === false && /bukan berkas teks/.test(h.alasan) && jem.hitung.fsRead === 0 && c4Biner === true;
  c4Bukti = `${h.alasan.slice(0, 52)} | fsRead=${jem.hitung.fsRead} | deteksi-isi-biner=${c4Biner}`;
} catch (e) {
  c4Bukti = `png tidak terbaca: ${e.message}`;
}
cek('C4', 'berkas biner (.png nyata) DITOLAK, tidak dipaksa jadi teks - dan isinya memang terdeteksi biner', c4Ok, c4Bukti);

/* C5 - biner yang MENYAMAR: byte .png asli ditaruh di berkas ber-ekstensi .ts
 * di akar PALSU, jadi yang menangkapnya harus lapisan ISI (byte NUL), bukan
 * daftar ekstensi - dan isinya tidak pernah dikirim sebagai teks rusak. */
const pngLatin = pngNama ? readFileSync(join(AKAR, pngNama)).toString('latin1') : 'x\u0000y';
const C5a = BK.apakahBiner('export const a = 1;\n\u0000\n');
const C5b = BK.bacaPotongan('export const a = 1;\n\u0000\n', 'src/palsu.ts', { dari: 1, sampai: 2 });
catat(C5b.ok ? '' : C5b.alasan);
let c5cOk = false;
let c5cTeks = '';
try {
  const mintarepo2 = join(KERJA, 'mintarepo2');
  mkdirSync(join(mintarepo2, 'src'), { recursive: true });
  writeFileSync(join(mintarepo2, 'src', 'palsu.ts'), readFileSync(join(AKAR, pngNama)));
  const jem = buatJembatan(mintarepo2);
  const h = catat(await BK.bacaBerkasKode({ berkas: 'src/palsu.ts', dari: 1, sampai: 2 }, jem.jembatan));
  c5cOk = h.ok === false && /bukan teks/.test(h.alasan) && jem.hitung.fsRead === 1;
  c5cTeks = h.alasan;
} catch (e) {
  c5cTeks = `gagal: ${e.message}`;
}
cek(
  'C5',
  'biner ber-NUL yang MENYAMAR sebagai .ts ditolak di lapisan ISI (bukan cuma daftar ekstensi)',
  C5a === true && C5b.ok === false && c5cOk,
  `apakahBiner(ber-NUL)=${C5a}; bacaPotongan tolak; lewat jembatan: ${c5cTeks.slice(0, 46)}`,
);

/* C6 - jalur yang menunjuk FOLDER ditolak, walau berekstensi .ts. */
const jemFolder = buatJembatan(AKAR, { paksaFolder: true });
const C6 = catat(await BK.bacaBerkasKode({ berkas: KONTEKS, dari: 1, sampai: 2 }, jemFolder.jembatan));
cek('C6', 'jalur yang menunjuk FOLDER ditolak (bukan dikirim sebagai berkas)', C6.ok === false && /folder/.test(C6.alasan), C6.alasan);

/* C7 - berkas tidak ada: ditolak sebagai "tidak ada", bukan lempar pengecualian. */
const C7 = catat(await BK.bacaBerkasKode({ berkas: 'src/lib/tidak-ada-sama-sekali.ts', dari: 1, sampai: 2 }, jemUtama.jembatan));
cek('C7', 'berkas tidak ada ditolak sebagai "tidak ada" (bukan crash)', C7.ok === false && /tidak ada/.test(C7.alasan), C7.alasan);

/* C8 - ekstensi di luar daftar putih: jembatan tidak disentuh. */
const jemExt = buatJembatan(AKAR);
const C8 = catat(await BK.bacaBerkasKode({ berkas: 'docs/LAPORAN-BACA-KODE.md.exe', dari: 1, sampai: 2 }, jemExt.jembatan));
cek('C8', 'ekstensi di luar daftar putih ditolak sebelum jembatan disentuh', C8.ok === false && jemExt.hitung.fsRead + jemExt.hitung.realpath === 0, C8.alasan);

/* C9 - jembatan tanpa `realpath`: fail-closed, bukan jalan dengan tebakan. */
const C9 = catat(
  await BK.bacaBerkasKode(
    { berkas: KONTEKS, dari: 1, sampai: 2 },
    { cmd: { fsRead: async () => ({ content: 'x' }), fsStat: async () => ({ size: 1 }) }, akar: AKAR },
  ),
);
cek('C9', 'jembatan tanpa `realpath` ditolak (fail-closed, bukan dilewati)', C9.ok === false && /lengkap/.test(C9.alasan), C9.alasan);

angka('C. bentuk jalur terlarang diuji', `${jalurTerlarang.length} bentuk`);
angka('C. nama/folder rahasia diuji', `${jalurRahasia.length} nama`);
angka('C. total pemanggilan jembatan pada SEMUA penolakan (harus 0)', `${sentuhTraversal + sentuhRahasia + jemExt.hitung.fsRead + jemExt.hitung.realpath}`);

/* ================================================================== D. TETAP LOKAL + HANYA BACA */

/** Buang komentar supaya pindai statis tidak menuduh kalimat dokumentasi. */
const tanpaKomentar = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/([^:"])\/\/[^\n]*$/gm, '$1');
const kodeModul = tanpaKomentar(sumberModul);

const polaTerlarang = [
  ['permintaan jaringan', /fetch\(|XMLHttpRequest|WebSocket|https?:\/\/|EventSource|sendBeacon/],
  ['akses berkas Node', /from\s+['"]node:|require\(|readFileSync|fs\.promises/],
  ['folder rumah', /homedir\(|USERPROFILE|APPDATA|LOCALAPPDATA|os\.tmpdir/],
  ['variabel lingkungan', /process\.env|import\.meta\.env/],
  ['IPC Tauri langsung', /@tauri-apps|invoke\(/],
  ['kemampuan TULIS', /writeFile|appendFile|createWriteStream|mkdir|rmdir|unlink|rename\(|copyFile|truncate|chmod|fsWrite|writeText/],
];
const temuan = polaTerlarang.filter(([, re]) => re.test(kodeModul)).map(([nama]) => nama);
cek(
  'D1',
  `modul bebas jaringan / akses berkas Node / folder rumah / env / TULIS (${polaTerlarang.length} pola, sesudah komentar dibuang)`,
  temuan.length === 0,
  temuan.length ? `ditemukan: ${temuan.join(', ')}` : `${polaTerlarang.length} pola dipindai, 0 kemunculan`,
);

const diLuarRepo = JALUR_DIBACA.filter(
  ({ akar, p }) => !resolve(p).replace(/\\/g, '/').toLowerCase().startsWith((realpathSync(akar) ?? akar).replace(/\\/g, '/').toLowerCase()),
);
const jumlahAkar = new Set(JALUR_DIBACA.map((r) => r.akar)).size;
cek(
  'D2',
  `setiap jalur yang benar-benar dibaca berada DI DALAM akar yang diberikan pemanggil (${jumlahAkar} akar: repo nyata + ${jumlahAkar - 1} repo contoh/uji)`,
  diLuarRepo.length === 0,
  `${JALUR_DIBACA.length} jalur dibaca, ${diLuarRepo.length} di luar akar-nya${diLuarRepo.length ? `: ${diLuarRepo.map((r) => r.p).join(', ')}` : ''}`,
);
angka('D. pemanggilan fsRead nyata pada disk', `${JALUR_DIBACA.length} pembacaan isi berkas`);

/* D3 - Proxy: modul cuma boleh menyentuh 3 nama di objek jembatan. */
const diakses = [...jemUtama.diakses].sort();
const takDiizinkan = diakses.filter((p) => !['realpath', 'fsStat', 'fsRead'].includes(p));
cek(
  'D3',
  'HANYA BACA: Proxy mencatat setiap properti jembatan yang disentuh - tidak ada nama di luar realpath/fsStat/fsRead',
  takDiizinkan.length === 0,
  `disentuh: {${diakses.join(', ')}}`,
);

/* D4 - sidik berkas yang dibaca: harus identik sebelum & sesudah. */
const SESUDAH = Object.fromEntries([AKTIVITAS, KONTEKS, berkasKecil].map((r) => [r, sidik(join(AKAR, r))]));
const berubah = Object.keys(SEBELUM).filter((r) => SEBELUM[r] !== SESUDAH[r]);
cek(
  'D4',
  'berkas yang dibaca TIDAK tersentuh: ukuran+mtime+sha1 identik sebelum & sesudah uji',
  berubah.length === 0,
  berubah.length ? `berubah: ${berubah.join(', ')}` : `${Object.keys(SEBELUM).length} berkas sha1 sama`,
);

/* D5b - uji negatif yang lebih keras daripada memindai pola: berkas rahasia
 * yang BENAR-BENAR ada di disk dan BENAR-BENAR berisi nilai berbentuk kunci.
 * Modul harus menolaknya karena NAMA-nya (bukan karena isinya kebetulan tidak
 * cocok pola), dan nilai itu tidak boleh muncul di keluaran mana pun. */
const repoSandi = join(KERJA, 'mintarepo3');
mkdirSync(repoSandi, { recursive: true });
const NILAI_RAHASIA = 'sk-proj-AAAABBBBCCCCDDDDEEEEFFFF1234';
writeFileSync(join(repoSandi, '.env'), `OPENAI_API_KEY=${NILAI_RAHASIA}\nDATABASE_PASSWORD=hunter2hunter2hunter2\n`, 'utf8');
writeFileSync(join(repoSandi, 'server.pem'), `-----BEGIN PRIVATE KEY-----\n${NILAI_RAHASIA}\n-----END PRIVATE KEY-----\n`, 'utf8');
const jemSandi = buatJembatan(repoSandi);
const tolakSandi = [];
for (const n of ['.env', 'server.pem']) {
  const h = catat(await BK.bacaBerkasKode({ berkas: n, dari: 1, sampai: 5 }, jemSandi.jembatan));
  if (h.ok !== false) tolakSandi.push(`${n} LOLOS`);
}
const memuatNilai = KELUARAN.filter((t) => t.includes(NILAI_RAHASIA));
cek(
  'D5b',
  'berkas rahasia yang BENAR-BENAR ada dan berisi nilai kunci tetap ditolak, nilainya TIDAK PERNAH muncul di keluaran',
  tolakSandi.length === 0 && memuatNilai.length === 0 && jemSandi.hitung.fsRead === 0,
  tolakSandi.length
    ? tolakSandi.join(', ')
    : `2 berkas rahasia berisi nilai nyata: ditolak semua, nilai tidak muncul di ${KELUARAN.length} keluaran, fsRead=${jemSandi.hitung.fsRead}`,
);
angka('D. berkas rahasia berisi nilai nyata (uji negatif keras)', `${tolakSandi.length} lolos dari 2 berkas; fsRead=${jemSandi.hitung.fsRead}`);

/* D5 - keluaran tidak pernah memuat nilai rahasia berbentuk penugasan. */
const polaNilaiRahasia = /(api[_-]?key|secret|token|passwd|password|PRIVATE KEY)\s*[:=]\s*["']?[A-Za-z0-9_\-+/.]{12,}/i;
const bocorNilai = KELUARAN.filter((t) => polaNilaiRahasia.test(t));
cek('D5', `keluaran tidak memuat nilai kunci/rahasia apa pun (${KELUARAN.length} keluaran dipindai)`, bocorNilai.length === 0, bocorNilai.length ? `bocor: ${bocorNilai[0].slice(0, 60)}` : `${KELUARAN.length} keluaran bersih`);

/* D6 - keluaran hanya jalur relatif: tidak ada akar repo, tidak ada nama user.
 * Jalur yang PEMANGGIL sendiri kirim boleh muncul kembali di pesan penolakan
 * (modul mengutip apa yang ditolak) - itu bukan kebocoran, jadi yang diperiksa
 * adalah jalur yang modul TAHU SENDIRI: akar repo dan folder rumah. */
const masukanPemanggil = [...jalurTerlarang, ...jalurRahasia, AKTIVITAS, KONTEKS, berkasKecil, pngNama, 'SIMBOL_YANG_TIDAK_ADA_XYZ']
  .filter((s) => typeof s === 'string' && s.length > 2)
  .sort((a, b) => b.length - a.length);
const bersihkanKutipan = (t) => masukanPemanggil.reduce((a, s) => a.split(s).join('<masukan-pemanggil>'), t);
const userNama = process.env.USERNAME ?? process.env.USER ?? '';
const rahasiaModul = [AKAR.replace(/\\/g, '/'), 'C:/Users', userNama].filter((s) => s.length > 2);
const kebocoran = rahasiaModul.filter((s) => KELUARAN.some((t) => bersihkanKutipan(t).includes(s)));
cek(
  'D6',
  'keluaran tidak memuat akar repo / folder rumah yang TAHU SENDIRI oleh modul (kutipan jalur dari pemanggil tidak dihitung)',
  kebocoran.length === 0,
  kebocoran.length ? `bocor: ${kebocoran.join(', ')}` : `${KELUARAN.length} keluaran bersih dari ${rahasiaModul.length} jalur milik-modul`,
);

/* D7 - berapa banyak berkas repo yang bisa dibaca HARI INI (angka nyata). */
const lewat = new Set(['node_modules', 'target', '.git', 'dist', '.vite']);
let jumlahBisa = 0;
let jumlahSemua = 0;
const hitungBerkas = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (!lewat.has(e.name)) hitungBerkas(p);
    } else {
      jumlahSemua++;
      if (BK.bolehDibacaKode(relative(AKAR, p).replace(/\\/g, '/')).ok) jumlahBisa++;
    }
  }
};
hitungBerkas(AKAR);
cek('D7', 'berkas repo yang lolos kebijakan baca jauh lebih banyak dari nol (tool ini benar-benar bisa dipakai)', jumlahBisa > 100, `${jumlahBisa} dari ${jumlahSemua} berkas`);
angka('D. berkas repo yang lolos kebijakan baca', `${jumlahBisa} dari ${jumlahSemua} berkas`);
angka('D. jumlah berkas repo saat uji (dihitung, bukan syarat; lane lain boleh menyunting repo)', `${jumlahBerkasRepo} -> ${jumlahSemua}`);

/* ================================================================== E. LAPISAN TOOL */

cek(
  'E1',
  'spesifikasi tool `zephyr_kode` ada, wajib `berkas`, dan menyebut batasnya di deskripsi',
  BK.SPEC_BACA_KODE.name === 'zephyr_kode' &&
    BK.SPEC_BACA_KODE.parameters.required.join(',') === 'berkas' &&
    BK.SPEC_BACA_KODE.description.includes(String(BK.BATAS_BARIS_POTONGAN)) &&
    BK.SPEC_BACA_KODE.description.includes('1 berkas/panggilan'),
  `name=${BK.SPEC_BACA_KODE.name}`,
);
cek('E1b', 'entri tool `TOOL_BACA_KODE` menunjuk spec + handler yang sama', BK.TOOL_BACA_KODE.spec === BK.SPEC_BACA_KODE && typeof BK.TOOL_BACA_KODE.run === 'function', 'spec+run terpasang');

BK.pasangJembatanBacaKode(null);
const E2 = catat(await BK.jalankanBacaKode({ berkas: AKTIVITAS, dari: 1, sampai: 5 }));
cek('E2', 'tanpa jembatan, tool mati dengan pesan jujur (tidak menebak akar repo)', /belum tersambung/.test(E2), E2.slice(0, 64));

const jemE3 = buatJembatan(AKAR);
BK.pasangJembatanBacaKode(jemE3.jembatan);
cek('E3a', 'jembatan yang dipasang tersimpan apa adanya (bukan disalin/ditebak)', BK.jembatanBacaKode() === jemE3.jembatan && BK.jembatanBacaKode().cmd === jemE3.jembatan.cmd, `akar=${BK.jembatanBacaKode()?.akar}`);
const E3 = catat(await BK.jalankanBacaKode({ berkas: AKTIVITAS, dari: 360, sampai: 365 }));
cek('E3', 'lewat lapisan tool: argumen tool -> potongan baris nyata', E3.startsWith('[baca_kode v') && E3.includes(`${AKTIVITAS}:360-365`), E3.split('\n')[0]);

/* E3b - bentuk jembatan yang SALAH harus ditolak, bukan dipakai setengah
 * jalan. Ini pernah jadi bug nyata di harness ini sendiri (objek jembatan
 * dibungkus sebagai `{cmd: <pembungkus>}` sehingga `cmd` berisi undefined dan
 * pembacaan gagal dengan pesan "belum lengkap"), jadi kasusnya diawasi. */
BK.pasangJembatanBacaKode({ cmd: { fsRead: async () => ({ content: 'x' }), fsStat: async () => ({ size: 1 }) }, akar: AKAR });
const E3b = catat(await BK.jalankanBacaKode({ berkas: AKTIVITAS, dari: 1, sampai: 2 }));
BK.pasangJembatanBacaKode(jemE3.jembatan);
cek('E3b', 'jembatan tidak lengkap (tanpa realpath) ditolak, bukan dipakai setengah jalan', /belum lengkap/.test(E3b), E3b.slice(0, 64));

const E4 = catat(await BK.jalankanBacaKode({ berkas: '.env', dari: 1, sampai: 5 }));
cek('E4', 'lewat lapisan tool: berkas rahasia tetap ditolak', E4.startsWith('ditolak:'), E4.slice(0, 72));

const E5 = catat(await BK.jalankanBacaKode({ berkas: [AKTIVITAS, KONTEKS] }));
const E5b = catat(await BK.bacaBerkasKode({ berkas: [AKTIVITAS, KONTEKS] }, buatJembatan(AKAR).jembatan));
cek(
  'E5',
  `lewat lapisan tool: daftar berkas ditolak (tool layer menolak sebagai berkas kosong; inti: "${BK.BATAS_BERKAS_PER_PANGGILAN} berkas per panggilan")`,
  /berkas kosong/.test(E5) && E5b.ok === false && E5b.alasan.includes(`${BK.BATAS_BERKAS_PER_PANGGILAN} berkas per panggilan`),
  `${E5.slice(0, 36)} || ${E5b.alasan.slice(0, 40)}`,
);

/* ================================================================== F. BUKTI PINJAM-DAFTAR (bukan duplikat) */

const barisAG = readFileSync(join(AKAR, 'src', 'lib', 'agentGuard.ts'), 'utf8').split(/\r?\n/);
const barisKR = barisKonteks;
const brs = (b, re) => b.findIndex((l) => re.test(l)) + 1;
const akhirBlok = (b, mulai) => {
  for (let i = mulai; i < b.length; i++) if (/^\];/.test(b[i])) return i + 1;
  return -1;
};
const lPola = brs(barisAG, /^export const POLA_RAHASIA\b/);
const lPolaAkhir = akhirBlok(barisAG, lPola);
const lDir = brs(barisAG, /^export const DIR_TERPROTEKSI\b/);
const lDirAkhir = akhirBlok(barisAG, lDir);
const lPeriksa = brs(barisAG, /^export function periksaBaca\b/);
const lImporKR = brs(barisKR, /from '\.\/agentGuard'/);
const lEfektif = brs(barisKR, /^export const POLA_RAHASIA_EFEKTIF\b/);
const lAlasan = brs(barisKR, /^export function alasanBlokirRahasia\b/);
const lNormal = brs(barisKR, /^export function normalJalur\b/);
const lAlasanImpor = brs(sumberModul.split(/\r?\n/), /^import \{ alasanBlokirRahasia, normalJalur \} from '\.\/konteksRepo'/);

cek(
  'F1',
  'daftar rahasia DIPINJAM, bukan disalin: `KR.POLA_RAHASIA` adalah objek yang SAMA dengan `AG.POLA_RAHASIA`',
  lImporKR > 0 && KR.POLA_RAHASIA === AG.POLA_RAHASIA && KR.DIR_TERPROTEKSI === AG.DIR_TERPROTEKSI,
  `agentGuard.ts:${lPola}-${lPolaAkhir} (POLA_RAHASIA, ${AG.POLA_RAHASIA.length} pola) + :${lDir}-${lDirAkhir} (DIR_TERPROTEKSI, ${AG.DIR_TERPROTEKSI.length} entri) <- konteksRepo.ts:${lImporKR} impor, :${lEfektif} POLA_RAHASIA_EFEKTIF, :${lAlasan} alasanBlokirRahasia`,
);

const mencurigakan = (kodeModul.match(/\/[^\n/]*\/(?=[gimsuy]*[.,;)\]}\s])/g) ?? []).filter((r) => /env|\.pem|\.key|credential|id_rsa|passwd|secret|token/i.test(r));
cek(
  'F2',
  'modul ini TIDAK punya daftar pola rahasia sendiri (nol regex bernuansa rahasia di kodenya)',
  lAlasanImpor > 0 && mencurigakan.length === 0,
  `impor di bacaKode.ts:${lAlasanImpor}; regex bernuansa rahasia di dalamnya: ${mencurigakan.length ? mencurigakan.join(' ') : 0}`,
);

/* F3 - putusan gerbang yang DIPINJAM harus dipatuhi modul: apa pun yang
 * diblokir `alasanBlokirRahasia()` (daftar efektif = daftar bersama
 * `agentGuard.ts` + tambahan) WAJIB ditolak modul ini. Kalau tidak, itu
 * regresi: berkas yang diblokir di satu jalur lolos di jalur lain.
 *
 * F3b - selisih dengan `periksaBaca()` dibedah, bukan disembunyikan. Gerbang
 * itu memakai pencocokan substring `${cmp}/`.includes(dir) sehingga folder
 * repo biasa bernama `etc/`, `proc/`, `sys/` ikut terblokir; `konteksRepo.ts`
 * SENGAJA tidak mengadopsi vonis itu untuk jalur relatif (lihat catatan di
 * dalam `alasanBlokirRahasia`). Jadi selisih hanya sah kalau semuanya jatuh ke
 * kategori folder SISTEM absolut itu - bukan sembarang nama. */
const namaUji = [...new Set([...jalurRahasia, ...AG.DIR_TERPROTEKSI.map((d) => `${d.replace(/^\//, '')}/x.txt`)])];
const bedaEfektif = [];
const selisihGerbang = [];
const selisihBukanSistem = [];
let modulLebihKetat = 0;
for (const n of namaUji) {
  const efektifBlokir = KR.alasanBlokirRahasia(n, AKAR) !== null;
  const modulBlokir = BK.bolehDibacaKode(n, AKAR).ok === false;
  if (efektifBlokir && !modulBlokir) bedaEfektif.push(n);
  if (!efektifBlokir && modulBlokir) modulLebihKetat++;
  const gerbang = AG.periksaBaca(n);
  if (gerbang.ok === false && !efektifBlokir) {
    selisihGerbang.push(n);
    const sistemAbsolut = AG.DIR_TERPROTEKSI.some((d) => !d.includes('/.') && `/${n.toLowerCase()}/`.includes(`${d.toLowerCase()}/`));
    if (!sistemAbsolut) selisihBukanSistem.push(n);
  }
}
cek(
  'F3',
  `gerbang yang dipinjam dan modul ini SEPAKAT pada ${namaUji.length} nama: yang diblokir gerbang efektif tidak pernah lolos di sini`,
  bedaEfektif.length === 0,
  bedaEfektif.length ? `LOLOS PADAHAL DIBLOKIR GERBANG EFEKTIF: ${bedaEfektif.join(', ')}` : `${namaUji.length} nama, 0 pelanggaran (modul lebih ketat pada ${modulLebihKetat} nama)`,
);
cek(
  'F3b',
  `selisih dengan periksaBaca() hanya folder SISTEM absolut yang sengaja diabaikan untuk jalur relatif (${selisihGerbang.length} nama, semuanya kategori itu)`,
  selisihBukanSistem.length === 0,
  selisihBukanSistem.length
    ? `SELISIH TAK TERDUGA: ${selisihBukanSistem.join(', ')}`
    : `${selisihGerbang.length} nama: /etc, /private/etc, /proc, /sys, /var/db, /var/root; contoh ${selisihGerbang.slice(0, 3).join(', ')}`,
);

angka('F. daftar bersama di agentGuard.ts', `POLA_RAHASIA ${lPola}-${lPolaAkhir} (${AG.POLA_RAHASIA.length} pola), DIR_TERPROTEKSI ${lDir}-${lDirAkhir} (${AG.DIR_TERPROTEKSI.length} entri)`);
angka('F. pemakaian ulang di konteksRepo.ts', `impor:${lImporKR} efektif:${lEfektif} alasan:${lAlasan} normalJalur:${lNormal}`);
angka('F. nama diuji lewat kedua gerbang', `${namaUji.length} nama, ${selisihGerbang.length} selisih (semuanya folder sistem absolut), ${bedaEfektif.length} pelanggaran`);

/* ================================================================== G. fungsi nyata yang SUDAH ada (bukti tidak menduplikasi) */

const modulNyata = [
  ['src/lib/agentGuard.ts', /^export (const|function|interface) /],
  ['src/lib/konteksRepo.ts', /^export (const|function|interface) /],
  ['src/lib/zephyrIndeks.ts', /^export (const|function|interface) /],
  ['src/lib/zephyrCari.ts', /^export (const|function|interface|async function) /],
  ['src/lib/alurVerifikasi.ts', /^export (const|function|interface|async function) /],
];
let jumlahFungsiNyata = 0;
for (const [berkas, re] of modulNyata) {
  const b = readFileSync(join(AKAR, berkas), 'utf8').split(/\r?\n/);
  const barisEkspor = b.map((l, i) => (re.test(l) ? i + 1 : 0)).filter((n) => n > 0);
  jumlahFungsiNyata += barisEkspor.length;
  angka(`G. ${berkas} - ekspor yang sudah ada`, `${barisEkspor.length} di baris ${barisEkspor.slice(0, 9).join(', ')}${barisEkspor.length > 9 ? ', ...' : ''}`);
}
cek('G1', 'fungsi nyata yang SUDAH ada dihitung (bukti tool ini memakai ulang, bukan menduplikasi)', jumlahFungsiNyata > 10, `${jumlahFungsiNyata} ekspor di ${modulNyata.length} berkas`);

/* ------------------------------------------------------------------ bersihkan */

rmSync(KERJA, { recursive: true, force: true });

console.log('');
console.log(`  SKOR: ${lulus}/${total} diperiksa`);
console.log(`  BACA KODE: v${BK.BACA_KODE_VERSI}, ${BK.EKSTENSI_TEKS.length} ekstensi teks + ${BK.NAMA_TEKS.length} nama tanpa ekstensi, ${jumlahBisa} berkas repo terbaca dari ${jumlahSemua}`);
console.log(`  VERDICT BACA KODE: ${merah.length === 0 ? 'LULUS' : `GAGAL (${merah.join('; ')})`}`);
process.exit(merah.length === 0 ? 0 : 1);
