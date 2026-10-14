/**
 * uji-konteks-zephyr.mjs — uji pengelolaan `.zephyr-context.md` TANPA aplikasi.
 *
 * Yang diuji: modul murni `src/lib/konteksZephyr.ts` (kapan berkas dibuat, isi
 * minimal, timpa vs tambah, batas ukuran, blokir rahasia) PLUS satu bagian yang
 * benar-benar menyentuh disk: penjaga jalur. Penjaga itu diuji dengan MENULIS
 * berkas sungguhan ke folder sementara, lalu memeriksa bahwa yang ditolak memang
 * tidak meninggalkan berkas di luar folder yang diizinkan - bukan sekadar
 * "fungsinya mengembalikan false".
 *
 *   node scripts/uji-konteks-zephyr.mjs
 *
 * Folder sementara dibersihkan di akhir; tidak ada berkas di repo yang disentuh.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  BATAS_BYTE,
  BERKAS_DIBLOKIR,
  JUDUL_AGEN,
  JUDUL_APLIKASI,
  NAMA_KONTEKS,
  batasiUkuran,
  berkasDiblokir,
  cariRahasia,
  diDalamAkar,
  jalurKonteks,
  pecahBagian,
  redaksi,
  rencanaTulis,
  saring,
} from '../src/lib/konteksZephyr.ts';

let lulus = 0;
let total = 0;
const cek = (id, ok, pesan) => {
  total += 1;
  if (ok) lulus += 1;
  console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${id.padEnd(4)} ${pesan}`);
};

const DATA = {
  repo: 'D:/Testing/bug-kejam',
  cabang: 'main',
  tugasBerjalan: 'Perbaiki keluhan total diskon di kasir.js',
  keputusanPenting: ['Perbaikan di kasir.js, bukan tambalan di laporan.js', 'data/keranjang.json tidak diubah'],
  berkasPenting: ['kasir.js', 'laporan.js', 'KELUHAN.md'],
  hasilTerakhir: 'total 485500 cocok dengan hitungan manual',
  waktu: '2026-10-14T03:00:00.000Z',
};

const KOTOR = fs.mkdtempSync(path.join(os.tmpdir(), 'zephyr-konteks-'));
const BERSIH = fs.mkdtempSync(path.join(os.tmpdir(), 'zephyr-diizinkan-'));

console.log(`— konteks workspace (folder uji: ${KOTOR.replace(/\\/g, '/')})\n`);

/* B1 — dibuat saat perlu, dan isi berkasnya bisa ditulis. */
{
  const r = rencanaTulis(null, DATA);
  const j = jalurKonteks(KOTOR);
  let ditulis = null;
  if (j.ok) {
    fs.writeFileSync(j.jalur, r.teks, 'utf8');
    ditulis = fs.readFileSync(j.jalur, 'utf8');
  }
  cek(
    'B1',
    r.ok === true && r.aksi === 'buat' && r.teks.includes(JUDUL_APLIKASI) && fs.existsSync(path.join(KOTOR, NAMA_KONTEKS)) && ditulis === r.teks,
    `berkas belum ada -> dibuat ("${r.aksi}") di ${j.jalur}, ${r.teks.length} karakter`,
  );
}

/* B2 — isi minimal lengkap: repo, tugas berjalan, keputusan penting, berkas penting. */
{
  const r = rencanaTulis(null, DATA);
  const t = r.teks;
  const punya = {
    repo: t.includes('D:/Testing/bug-kejam') && t.includes('main'),
    tugas: t.includes('Perbaiki keluhan total diskon'),
    keputusan: t.includes('bukan tambalan di laporan.js'),
    berkas: t.includes('kasir.js') && t.includes('KELUHAN.md'),
  };
  const lengkap = Object.values(punya).every(Boolean);
  const kurang = Object.entries(punya).filter(([, v]) => !v).map(([k]) => k);
  cek('B2', lengkap, `isi minimal lengkap: repo/tugas/keputusan/berkas semua ada${lengkap ? '' : ` (kurang: ${kurang.join(', ')})`}`);
}

/* B3 — timpa vs tambah vs lewati. */
{
  const lama = rencanaTulis(null, DATA).teks;
  const sama = rencanaTulis(lama, DATA);
  const tambah = rencanaTulis(lama, DATA, { catatanAgenBaru: ['pakai node laporan.js untuk membuktikan'] });
  const timpa = rencanaTulis(lama, { ...DATA, tugasBerjalan: 'Tugas berikutnya: tambah tes' });
  cek(
    'B3',
    timpa.aksi === 'timpa' && tambah.aksi === 'tambah' && sama.aksi === 'lewati',
    `tugas berubah -> "${timpa.aksi}"; catatan baru saja -> "${tambah.aksi}"; tidak ada yang baru -> "${sama.aksi}" (teks ditulis ulang: ${sama.teks.length === 0 ? 'tidak' : 'ya'})`,
  );
}

/* B4 — bagian aplikasi ditimpa ulang, catatan agen DIPERTAHANKAN. */
{
  const lama = `${rencanaTulis(null, DATA).teks}${JUDUL_AGEN}\n- catatan lama yang harus selamat\n`;
  const r = rencanaTulis(lama, { ...DATA, tugasBerjalan: 'Tugas kedua' }, { catatanAgenBaru: ['catatan baru'] });
  const pecah = pecahBagian(r.teks);
  cek(
    'B4',
    r.aksi === 'timpa' &&
      r.teks.includes('catatan lama yang harus selamat') &&
      r.teks.includes('catatan baru') &&
      r.teks.includes('Tugas kedua') &&
      !r.teks.includes('Perbaiki keluhan total diskon di kasir.js') &&
      pecah.aplikasi.trim().endsWith('_Diperbarui: 2026-10-14T03:00:00.000Z_'),
    `bagian aplikasi ditimpa (tugas lama hilang: ${!r.teks.includes('Perbaiki keluhan total diskon di kasir.js')}), catatan agen lama + baru tetap ada`,
  );
}

/* B5 — batas ukuran: dipotong di batas baris, dengan penanda. */
{
  const banyak = Array.from({ length: 4000 }, (_, i) => `- baris ${i} ${'x'.repeat(20)}`).join('\n');
  const p = batasiUkuran(banyak);
  const byte = (s) => new TextEncoder().encode(s).length;
  const kecil = batasiUkuran('pendek sekali');
  cek(
    'B5',
    p.terpotong === true &&
      byte(p.teks) <= BATAS_BYTE + 400 &&
      p.barisDibuang > 0 &&
      /Isi dipotong aplikasi/.test(p.teks) &&
      kecil.terpotong === false &&
      kecil.teks === 'pendek sekali',
    `isi besar dipotong (${p.barisDibuang} baris dibuang, hasil ${byte(p.teks)} byte dari batas ${BATAS_BYTE}), isi kecil utuh`,
  );
}

/* B6 — rahasia diblokir: berkas TIDAK ditulis, nilai disensor. */
{
  const denganKunci = {
    ...DATA,
    berkasPenting: ['kasir.js', '..../.env'],
    keputusanPenting: ['pakai OPENAI_API_KEY=sk-proj-abcdefghijklmnop12345 untuk uji'],
  };
  const r = rencanaTulis(null, denganKunci);
  const catatan = rencanaTulis(null, DATA, { catatanAgenBaru: ['token ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345 di catatan'] });
  const s = saring('kunci: sk-ant-abcdefghijklmnop1234 dan password: "rahasia-banget-123"');
  const temuanNama = [...r.temuan, ...catatan.temuan].map((t) => t.aturan).join(', ');
  const nilaiAsliBocor = `${r.teks}${catatan.teks}${s.teks}`.includes('sk-ant-abcdefghijklmnop1234')
    || `${r.teks}${catatan.teks}${s.teks}`.includes('rahasia-banget-123');
  cek(
    'B6',
    r.ok === false &&
      r.teks === '' &&
      r.temuan.length > 0 &&
      catatan.ok === false &&
      s.ok === false &&
      s.temuan.length >= 2 &&
      !nilaiAsliBocor &&
      /«disensor»/.test(s.teks),
    `rahasia diblokir: data -> ok=${r.ok} teks=${r.teks.length} karakter; catatan agen -> ok=${catatan.ok}; temuan: ${temuanNama}; keluaran tersensor: "${s.teks}"`,
  );
}

/* B7 — daftar blokir nama berkas. */
{
  const harus = ['.env', '.env.local', 'D:/repo/.env.production', 'id_rsa', 'C:/Users/x/.ssh/id_ed25519', 'a.pem', 'server.key', 'credentials.json', 'secrets.yaml'];
  const tidak = ['kasir.js', 'src/index.ts', 'laporan.md', '.zephyr-context.md', 'package.json'];
  const gagal = harus.filter((f) => !berkasDiblokir(f)).concat(tidak.filter((f) => berkasDiblokir(f)));
  cek(
    'B7',
    gagal.length === 0 && BERKAS_DIBLOKIR.length >= 15,
    `daftar blokir (${BERKAS_DIBLOKIR.length} entri) menolak ${harus.length} berkas rahasia & meloloskan ${tidak.length} berkas biasa${gagal.length ? ` (salah: ${gagal.join(', ')})` : ''}`,
  );
}

/* B8 — TIDAK menulis di luar folder yang diizinkan (diuji dengan disk sungguhan). */
{
  const kasus = [
    ['akar memuat ".."', () => jalurKonteks(`${BERSIH}/../zephyr-luar`), false],
    ['akar kosong', () => jalurKonteks(''), false],
    ['berkas .env', () => jalurKonteks(BERSIH, '.env'), false],
    ['subfolder', () => jalurKonteks(BERSIH, `sub/${NAMA_KONTEKS}`), false],
    ['nama lain', () => jalurKonteks(BERSIH, 'notes.md'), false],
    ['akar sah', () => jalurKonteks(BERSIH), true],
  ];
  const hasilKasus = kasus.map(([nama, fn, diharap]) => ({ nama, hasil: fn(), diharap }));
  const salah = hasilKasus.filter((k) => k.hasil.ok !== k.diharap);

  /* Yang boleh: benar-benar ditulis. Yang ditolak: jangan pernah ditulis. */
  const rencana = rencanaTulis(null, DATA);
  const tertulis = [];
  for (const k of hasilKasus) {
    if (k.hasil.ok && k.hasil.jalur) {
      fs.writeFileSync(k.hasil.jalur, rencana.teks, 'utf8');
      tertulis.push(k.hasil.jalur);
    }
  }
  const luarSengaja = path.join(path.dirname(BERSIH), 'zephyr-luar');
  const adaDiLuar = fs.existsSync(path.join(luarSengaja, NAMA_KONTEKS));
  const diIzinkan = fs.existsSync(path.join(BERSIH, NAMA_KONTEKS));
  const esc = path.join(BERSIH, '..', 'zephyr-luar', NAMA_KONTEKS);
  const guardLuar = diDalamAkar(BERSIH, esc) === false;
  cek(
    'B8',
    salah.length === 0 && tertulis.length === 1 && diIzinkan && !adaDiLuar && guardLuar && !fs.existsSync(path.join(BERSIH, 'sub')),
    `jalur dijaga: ${hasilKasus.length - 1} bentuk ditolak, 1 diterima; korban ditolak hanya ${hasilKasus.filter((k) => !k.hasil.ok).map((k) => k.nama).join(', ')}; berkas sungguhan hanya lahir di ${path.join(BERSIH, NAMA_KONTEKS).replace(/\\/g, '/')}`,
  );
}

/* B9 — repo kosong: berkas tidak ditulis, sebabnya disebut. */
{
  const r = rencanaTulis(null, { ...DATA, repo: '   ' });
  cek(
    'B9',
    r.ok === false && r.teks === '' && r.kurang.includes('repo') && typeof r.pesan === 'string',
    `repo belum diketahui -> tidak menulis (kurang: ${r.kurang.join(', ')}; pesan="${r.pesan}")`,
  );
}

/* B10 — cariRahasia tidak "lupa" pada pemanggilan berulang (regex tanpa flag g). */
{
  const teks = 'sk-ant-abcdefghijklmnop1234 ada di sini';
  const a = cariRahasia(teks).length;
  const b = cariRahasia(teks).length;
  const c = cariRahasia(teks).length;
  const persis = cariRahasia(teks).map((t) => t.aturan).join(',');
  cek('B10', a === 1 && b === 1 && c === 1 && persis === 'kunci-anthropic', `pemanggilan berulang tetap menemukan rahasia yang sama (${a}/${b}/${c} temuan, aturan=${persis})`);
}

/* B11 — redaksi menyensor NILAI, kalimatnya tetap terbaca. */
{
  const asli = 'export OPENAI_API_KEY=sk-proj-1234567890abcdef\ncatatan biasa';
  const hasil = redaksi(asli);
  const baris1 = hasil.split('\n')[0];
  cek(
    'B11',
    !hasil.includes('sk-proj-1234567890abcdef') && hasil.includes('«disensor»') && hasil.includes('catatan biasa') && baris1.includes('OPENAI_API_KEY='),
    `nilai disensor, kunci & teks lain tetap terbaca ("${baris1}")`,
  );
}

fs.rmSync(KOTOR, { recursive: true, force: true });
fs.rmSync(BERSIH, { recursive: true, force: true });
fs.rmSync(path.join(path.dirname(BERSIH), 'zephyr-luar'), { recursive: true, force: true });

console.log(`\n== ${lulus}/${total} lulus ==`);
if (lulus !== total) process.exitCode = 1;
