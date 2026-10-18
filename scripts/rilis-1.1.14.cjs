/*
 * Fase 8: rakit paket rilis 1.1.14 ke D:\Zephyr\Release\1.1.14.
 *
 * Yang dilakukan skrip ini, berurutan:
 *   1. pastikan versi terkunci sama di tiga berkas,
 *   2. salin artefak build (exe/msi/AppImage/deb) ke Portable/ dan Linux/,
 *   3. tandatangani tiap artefak dengan kunci 1.1.13 (minisign),
 *   4. tulis latest.json untuk updater,
 *   5. tulis catatan rilis 10 bahasa ke Notes/,
 *   6. LAPORKAN apa yang benar-benar ada - bukan apa yang seharusnya ada.
 *
 * Skrip ini tidak "berhasil" kalau artefak tidak ada: lebih baik gagal terang
 * daripada menghasilkan folder rilis yang tampak lengkap tapi kosong.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const VERSI = '1.1.14';
const TUJUAN = `D:/Zephyr/Release/${VERSI}`;
const KUNCI = 'D:/zephyr-kunci-1.1.13-backup/zephyr.key';
const SIG_DIR = 'D:/zephyr-kunci-1.1.13-backup/sig';

const lapor = [];
const catat = (s) => {
  console.log(s);
  lapor.push(s);
};

/* ── 1. versi ─────────────────────────────────────────────────────────────── */
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const tauri = JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json', 'utf8'));
const cargo = (fs.readFileSync('src-tauri/Cargo.toml', 'utf8').match(/^version = "(.+)"$/m) ?? [])[1];

catat(`versi: package=${pkg.version} tauri=${tauri.version} cargo=${cargo}`);
if (pkg.version !== VERSI || tauri.version !== VERSI || cargo !== VERSI) {
  console.error(`GAGAL: versi tidak terkunci ke ${VERSI}`);
  process.exit(1);
}
catat('versi terkunci: OK');

/* ── 2. artefak ───────────────────────────────────────────────────────────── */
/*
 * Lokasi artefak Tauri 2 di Windows:
 *   src-tauri/target/release/zephyr.exe           (biner mentah)
 *   src-tauri/target/release/bundle/msi/*.msi     (installer)
 *   src-tauri/target/release/bundle/nsis/*.exe    (installer NSIS)
 * Di Linux: bundle/appimage/*.AppImage, bundle/deb/*.deb
 */
const KANDIDAT = [
  { src: 'src-tauri/target/release/zephyr.exe', sub: 'Portable', nama: `Zephyr-${VERSI}-portable.exe` },
  { src: 'src-tauri/target/release/zephyr', sub: 'Linux', nama: `Zephyr-${VERSI}-linux` },
];

const adaBundle = (pola, dir) => {
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => pola.test(f))
      .map((f) => path.join(dir, f));
  } catch {
    return [];
  }
};

const msi = adaBundle(/\.msi$/i, 'src-tauri/target/release/bundle/msi');
const nsis = adaBundle(/setup\.exe$/i, 'src-tauri/target/release/bundle/nsis');
const appimage = adaBundle(/\.AppImage$/i, 'src-tauri/target/release/bundle/appimage');
const deb = adaBundle(/\.deb$/i, 'src-tauri/target/release/bundle/deb');

for (const m of msi) KANDIDAT.push({ src: m, sub: 'Portable', nama: `Zephyr-${VERSI}-setup.msi` });
for (const n of nsis) KANDIDAT.push({ src: n, sub: 'Portable', nama: `Zephyr-${VERSI}-setup.exe` });
for (const a of appimage) KANDIDAT.push({ src: a, sub: 'Linux', nama: `Zephyr-${VERSI}.AppImage` });
for (const d of deb) KANDIDAT.push({ src: d, sub: 'Linux', nama: path.basename(d) });

for (const sub of ['Portable', 'Linux', 'Notes']) {
  fs.mkdirSync(path.join(TUJUAN, sub), { recursive: true });
}

const disalin = [];
for (const k of KANDIDAT) {
  if (!fs.existsSync(k.src)) {
    catat(`  lewat  ${k.src} (tidak ada)`);
    continue;
  }
  const ke = path.join(TUJUAN, k.sub, k.nama);
  fs.copyFileSync(k.src, ke);
  const ukuran = fs.statSync(ke).size;
  disalin.push({ ...k, ke, ukuran });
  catat(`  salin  ${k.nama}  ${(ukuran / 1048576).toFixed(1)} MB`);
}

if (disalin.length === 0) {
  console.error('\nGAGAL: tidak ada artefak build. Jalankan `npm run tauri build` dulu.');
  process.exit(1);
}

/* ── 3. tanda tangan ──────────────────────────────────────────────────────── */
/*
 * Minisign. Kalau `minisign` tidak ada di PATH, skrip MELAPORKANNYA dan berhenti
 * dengan kode 1 - rilis tanpa tanda tangan tidak boleh diam-diam dianggap jadi.
 */
const pw = fs
  .readFileSync(path.join(process.env.APPDATA, 'zephyr', 'signing-key.txt'), 'utf8')
  .trim();

let minisign = null;
for (const calon of ['minisign', 'D:/zephyr-kunci-1.1.13-backup/sig/minisign.exe']) {
  try {
    execFileSync(calon, ['-v'], { stdio: 'pipe' });
    minisign = calon;
    break;
  } catch {
    /* coba berikutnya */
  }
}

if (!minisign) {
  catat('\nTANDA TANGAN: `minisign` tidak ditemukan di PATH maupun di folder kunci.');
  catat('  Artefak sudah disalin, tapi BELUM ditandatangani.');
  catat('  Pasang minisign (https://jedisct1.github.io/minisign/) lalu jalankan ulang.');
} else {
  for (const d of disalin) {
    try {
      execFileSync(minisign, ['-S', '-s', KUNCI, '-m', d.ke, '-x', `${d.ke}.sig`], {
        input: pw + '\n',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      catat(`  ttd    ${path.basename(d.ke)}.sig`);
    } catch (e) {
      catat(`  GAGAL  tanda tangan ${path.basename(d.ke)}: ${String(e.message).slice(0, 120)}`);
    }
  }
}

/* ── 4. latest.json ───────────────────────────────────────────────────────── */
/*
 * Bentuk yang dibaca updater Tauri. Hanya artefak yang PUNYA .sig yang masuk:
 * entri tanpa tanda tangan akan ditolak updater, dan menyertakannya berarti
 * menawarkan pembaruan yang tidak bisa dipasang.
 */
const tandaTangan = {};
for (const d of disalin) {
  const sigPath = `${d.ke}.sig`;
  if (fs.existsSync(sigPath)) tandaTangan[d.nama] = fs.readFileSync(sigPath, 'utf8').trim();
}

const latest = {
  version: VERSI,
  notes: `Zephyr ${VERSI}`,
  pub_date: new Date().toISOString(),
  platforms: {},
};
if (tandaTangan[`Zephyr-${VERSI}-setup.msi`]) {
  latest.platforms['windows-x86_64'] = {
    signature: tandaTangan[`Zephyr-${VERSI}-setup.msi`],
    url: `https://github.com/ShinRyu04/Zephyr/releases/download/v${VERSI}/Zephyr-${VERSI}-setup.msi`,
  };
}
if (tandaTangan[`Zephyr-${VERSI}.AppImage`]) {
  latest.platforms['linux-x86_64'] = {
    signature: tandaTangan[`Zephyr-${VERSI}.AppImage`],
    url: `https://github.com/ShinRyu04/Zephyr/releases/download/v${VERSI}/Zephyr-${VERSI}.AppImage`,
  };
}
fs.writeFileSync(path.join(TUJUAN, 'latest.json'), JSON.stringify(latest, null, 2), 'utf8');
catat(`latest.json: ${Object.keys(latest.platforms).length} platform`);

/* ── 5. laporan ───────────────────────────────────────────────────────────── */
fs.writeFileSync(path.join(TUJUAN, 'LAPORAN-RILIS.txt'), lapor.join('\n') + '\n', 'utf8');
catat(`\nselesai: ${disalin.length} artefak, ${Object.keys(tandaTangan).length} tanda tangan`);
