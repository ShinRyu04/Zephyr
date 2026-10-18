/*
 * Bukti: todo yang berbohong tidak bisa menutup run.
 *
 * Terukur di Fase 5 (run 62 detik): rencana berisi 10 item, SEMUANYA ditandai
 * `done`, dan `README.md` tidak pernah ditulis. Model melaporkan "kedelapan
 * berkas sudah ditulis" sementara disk berisi 7. Pembaca melihat ringkasan
 * percaya diri dan satu berkas hilang - lebih buruk daripada gagal jujur.
 *
 * Uji ini memeriksa ATURANNYA di sumber (bukan menjalankan agen 7 menit):
 *   V1  ada pemeriksa todo-yang-menyebut-berkas
 *   V2  ia memakai daftar berkas yang BENAR-BENAR ditulis (bukan tebakan)
 *   V3  todo yang bohong dibuka lagi dan diminta dikerjakan
 *   V4  todo yang tidak menyebut berkas tidak ikut dipersoalkan
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

cek('V1 pemeriksa todo-bohong ada', /todosBohong/.test(src), 'terpasang');
cek(
  'V2 memakai daftar berkas yang benar-benar ditulis',
  /berkasDitulisGiliran\.has\(nama\)/.test(src),
  'terpasang',
);
cek(
  'V3 todo bohong diminta ditulis ulang',
  /the file they name was NEVER written this turn/.test(src) &&
    /Write them now with write_file/.test(src),
  'terpasang',
);
cek(
  'V4 hanya bereaksi pada todo yang menyebut berkas',
  /\.md\|js\|ts\|tsx/.test(src) || /match\(\/\[A-Za-z0-9_\.\\-\/\\\\\]\+\\\./.test(src),
  'pola ekstensi ada',
);

/*
 * V5: simulasi aturan - todo "Tulis README.md" yang tidak pernah ditulis harus
 * terdeteksi, dan todo "Jalankan tes" tidak boleh ikut.
 */
const POLA =
  /[A-Za-z0-9_.\-/\\]+\.(?:md|js|ts|tsx|jsx|json|css|html|py|rs|toml|yml|yaml)/g;
const ditulis = new Set(['main.js', 'package.json', 'index.html']);
const cekTodo = (teks) => {
  const calon = teks.match(POLA);
  if (!calon) return false;
  return calon.some((n) => !ditulis.has(n));
};
cek('V5a "Tulis README.md" terdeteksi bohong', cekTodo('Tulis README.md') === true, 'terdeteksi');
cek('V5b "Jalankan tes" tidak dipersoalkan', cekTodo('Jalankan tes') === false, 'diabaikan');
cek('V5c "Tulis main.js" tidak dipersoalkan', cekTodo('Tulis main.js') === false, 'diabaikan');

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
process.exit(gagal ? 1 : 0);
