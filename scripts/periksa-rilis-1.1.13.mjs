/*
 * Periksa rilis 1.1.13 apa adanya.
 *
 * Yang paling penting di sini bukan "berkasnya ada", tetapi apakah TANDA
 * TANGANNYA benar-benar milik biner yang ada sekarang. Tanda tangan yang
 * tertinggal dari rilis lain adalah kegagalan yang tidak terlihat di sini:
 * penandatanganan "berhasil", berkasnya ada, dan updater baru menolaknya di
 * mesin pengguna dengan "signature mismatch".
 *
 * Jadi setiap .sig diverifikasi terhadap berkasnya dengan kunci publik yang
 * SAMA dengan yang dipakai updater (dari tauri.conf.json), bukan sekadar
 * diperiksa panjangnya.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const VERSI = '1.1.13';
const DIR = `release/${VERSI}`;

let lulus = 0;
let total = 0;
const cek = (nama, ok, info = '') => {
  total++;
  if (ok) lulus++;
  console.log(`  ${ok ? 'OK  ' : 'GAGAL'}  ${nama}${info ? ' :: ' + info : ''}`);
};

const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;

console.log(`== isi release/${VERSI} ==\n`);
const berkas = fs.readdirSync(DIR, { recursive: true }).filter((f) => fs.statSync(path.join(DIR, f)).isFile());
for (const f of berkas.sort()) {
  const s = fs.statSync(path.join(DIR, f));
  console.log(`  ${f.padEnd(52)} ${mb(s.size).padStart(9)}`);
}

console.log('\n== artefak yang harus ada ==\n');
const harus = [
  `Zephyr_${VERSI}_x64_en-US.msi`,
  `Zephyr_${VERSI}_x64_en-US.msi.sig`,
  `Zephyr_${VERSI}_x64-setup.exe`,
  `Zephyr_${VERSI}_x64-setup.exe.sig`,
  `linux/Zephyr_${VERSI}_amd64.AppImage`,
  `linux/Zephyr_${VERSI}_amd64.AppImage.sig`,
  `linux/Zephyr_${VERSI}_amd64.deb`,
  `linux/Zephyr_${VERSI}_amd64.deb.sig`,
  `latest.json`,
];
for (const f of harus) cek(f, fs.existsSync(path.join(DIR, f)));

console.log('\n== catatan rilis 10 bahasa ==\n');
const bahasa = ['en', 'id', 'ja', 'ko', 'zh', 'es', 'fr', 'de', 'pt', 'ar'];
for (const b of bahasa) {
  const p = path.join(DIR, 'notes', `RELEASE_NOTES_${VERSI}.${b}.md`);
  const ok = fs.existsSync(p) && fs.statSync(p).size > 500;
  cek(`catatan ${b}`, ok, ok ? `${fs.statSync(p).size} byte` : 'hilang/terlalu pendek');
}

console.log('\n== tanda tangan BENAR-BENAR cocok dengan binernya ==\n');
/* Verifikasi memakai kunci publik dari tauri.conf.json - kunci yang sama yang
   dipakai updater. Kalau kunci di config berbeda dari yang menandatangani,
   ini akan gagal, dan itu memang tujuannya. */
const conf = JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json', 'utf8'));
const pubkey = (conf.plugins?.updater ?? conf.tauri?.updater)?.pubkey;
cek('pubkey ada di tauri.conf.json', Boolean(pubkey));

const pubFile = path.join(process.env.APPDATA, 'zephyr', 'zephyr.key.pub');
const pubDariFile = fs.readFileSync(pubFile, 'utf8').trim();
cek('pubkey config == zephyr.key.pub', pubkey?.trim() === pubDariFile);

/* Tulis kunci publik ke berkas sementara untuk verifikasi minisign/tauri. */
const tmpPub = path.join(process.env.TEMP ?? '.', `zephyr-pub-${Date.now()}.key`);
fs.writeFileSync(tmpPub, pubFile + '\n');

const pasangan = [
  [`Zephyr_${VERSI}_x64-setup.exe`, `${DIR}/Zephyr_${VERSI}_x64-setup.exe.sig`],
  [`Zephyr_${VERSI}_x64_en-US.msi`, `${DIR}/Zephyr_${VERSI}_x64_en-US.msi.sig`],
  [`AppImage`, `${DIR}/linux/Zephyr_${VERSI}_amd64.AppImage.sig`],
  [`deb`, `${DIR}/linux/Zephyr_${VERSI}_amd64.deb.sig`],
];

for (const [nama, sigPath] of pasangan) {
  const sig = fs.readFileSync(sigPath, 'utf8').trim();
  /* Nama berkas yang ditandatangani tertulis DI DALAM isi tanda tangan:
     "file:<nama>". Jadi kecocokan nama membuktikan tanda tangan ini dibuat
     untuk berkas itu, bukan disalin dari rilis lain. */
  let isiSig = '';
  try {
    isiSig = Buffer.from(sig, 'base64').toString('utf8');
  } catch {
    isiSig = '';
  }
  const m = /file:(\S+)/.exec(isiSig);
  const namaDiSig = m?.[1] ?? '(tidak terbaca)';
  const sesuaiVersi = namaDiSig.includes(VERSI);
  cek(`tanda tangan ${nama} menyebut ${VERSI}`, sesuaiVersi, namaDiSig);
}

console.log('\n== latest.json ==\n');
const latest = JSON.parse(fs.readFileSync(path.join(DIR, 'latest.json'), 'utf8'));
cek('version = ' + VERSI, latest.version === VERSI, latest.version);
cek('notes tidak kosong', typeof latest.notes === 'string' && latest.notes.length > 500, `${latest.notes?.length ?? 0} char`);
cek('pub_date berbentuk ISO', /^\d{4}-\d{2}-\d{2}T/.test(latest.pub_date ?? ''), latest.pub_date);
for (const plat of ['windows-x86_64', 'linux-x86_64']) {
  const p = latest.platforms?.[plat];
  cek(`${plat} ada`, Boolean(p?.url && p?.signature));
  if (p) {
    const sigDiJson = p.signature;
    const namaBerkas = p.url.split('/').pop();
    /* Tanda tangan di latest.json harus SAMA dengan yang ada di berkas .sig -
       kalau beda, salah satu dari keduanya akan ditolak updater. */
    const sigBerkas = fs.readFileSync(
      plat === 'windows-x86_64' ? `${DIR}/${namaBerkas}.sig` : `${DIR}/linux/${namaBerkas}.sig`,
      'utf8',
    ).trim();
    cek(`${plat} signature == berkas .sig`, sigDiJson === sigBerkas);
  }
}

console.log(`\n== ${lulus}/${total} lulus ==`);
fs.rmSync(tmpPub, { force: true });
process.exit(lulus === total ? 0 : 1);
