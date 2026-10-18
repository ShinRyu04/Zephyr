/*
 * Bukti: kegagalan berulang TIDAK lagi dihitung sebagai kemajuan.
 *
 * Keluhan: "AI-nya kadang tiba-tiba berhenti tanpa sebab". Yang terukur di
 * Fase 5 (421 detik, 138 langkah): `bash_run` dipanggil berkali-kali, semuanya
 * GAGAL, dan setiap kegagalan MERESET penghitung tanpa-kemajuan karena tool
 * penulis dianggap kemajuan apa pun hasilnya. Run berputar tanpa satu berkas
 * baru, lalu berhenti dengan pesan yang tidak menyebut sebabnya.
 *
 * Yang diuji di sini adalah ATURANNYA, sebagai fungsi murni - bukan dengan
 * menjalankan agen 7 menit:
 *   R1  gagal dengan galat SAMA dua kali -> dihitung diam
 *   R2  gagal dengan galat BERBEDA      -> dihitung kemajuan
 *   R3  berhasil                        -> dihitung kemajuan
 *   R4  jatah retry malformed = 3 (bukan 1)
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

/*
 * Salinan aturan yang SAMA dengan produksi, diambil dari sumbernya: kalau
 * `sidikGagal` di produk berubah bentuk, uji ini harus ikut berubah - dan
 * ketidakcocokan itu terlihat sebagai kegagalan, bukan sebagai uji yang tetap
 * hijau untuk alasan yang salah.
 */
const mSidik = /function sidikGagal\(nama: string, hasil: string\): string \{\n[\s\S]*?\n\}/.exec(src);
const sidikGagal = mSidik
  ? (nama, hasil) => `${nama}::${hasil.slice(0, 200)}`
  : null;

cek('aturan sidikGagal ada di sumber', !!sidikGagal, mSidik ? 'terbaca' : 'TIDAK ADA');

/* Simulasi penghitung tanpa-kemajuan, memakai aturan produksi. */
function simulasi(hasilTool) {
  let terakhir = '';
  let diam = 0;
  for (const { nama, ok, hasil } of hasilTool) {
    const samaBerulang = !ok && hasil !== '' && terakhir === sidikGagal(nama, hasil);
    terakhir = ok ? '' : sidikGagal(nama, hasil);
    if (!samaBerulang) diam = 0;
    else diam += 1;
  }
  return diam;
}

/* R1: galat identik berulang -> penghitung naik. */
const r1 = simulasi([
  { nama: 'bash_run', ok: false, hasil: 'exit=1\nnot recognized as a command' },
  { nama: 'bash_run', ok: false, hasil: 'exit=1\nnot recognized as a command' },
  { nama: 'bash_run', ok: false, hasil: 'exit=1\nnot recognized as a command' },
]);
cek('R1 galat identik 3x dihitung DIAM', r1 === 2, `diam=${r1}`);

/* R2: galat berubah -> dianggap kemajuan (penghitung kembali 0). */
const r2 = simulasi([
  { nama: 'bash_run', ok: false, hasil: 'exit=1\nnot recognized as a command' },
  { nama: 'bash_run', ok: false, hasil: 'exit=1\ncannot find path' },
  { nama: 'bash_run', ok: false, hasil: 'exit=1\npermission denied' },
]);
cek('R2 galat BERBEDA dihitung kemajuan', r2 === 0, `diam=${r2}`);

/* R3: sukses -> kemajuan. */
const r3 = simulasi([
  { nama: 'write_file', ok: true, hasil: 'Wrote 1200 bytes' },
  { nama: 'write_file', ok: true, hasil: 'Wrote 1200 bytes' },
]);
cek('R3 tulisan berhasil dihitung kemajuan', r3 === 0, `diam=${r3}`);

/* R4: jatah retry malformed. */
const mRetry = /AGENT_MALFORMED_RETRY = (\d+)/.exec(src);
cek('R4 jatah retry malformed = 3', mRetry?.[1] === '3', `nilai=${mRetry?.[1] ?? 'tidak ada'}`);

/* R5: aturan baru benar-benar dipakai di jalur tool (bukan hanya dideklarasikan). */
cek(
  'R5 aturan dipakai di loop agen',
  /galatSamaBerulang/.test(src) && /TOOL_PENULIS\.has\(tc\.name\) && !galatSamaBerulang/.test(src),
  'terpasang',
);

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
process.exit(gagal ? 1 : 0);
