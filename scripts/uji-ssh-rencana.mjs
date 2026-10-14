/*
 * uji-ssh-rencana — mengunci jalur aman menyentuh mesin lewat SSH (item 169 /
 * ZEPH-SSH-JALUR): allowlist sempit, tanpa terminal bebas ke model, rahasia
 * tidak menyeberang.
 *
 *   node scripts/uji-ssh-rencana.mjs
 *
 * Yang diuji BUKAN koneksi (tidak ada host, jaringan, atau aplikasi hidup),
 * melainkan tiga pagar:
 *
 *   A. FUNGSI PRODUK NYATA (di-bundle esbuild)
 *      - `src/lib/sshArgv.ts`    : penyusun argv murni (argv = daftar, bukan string shell)
 *      - `src/lib/sshRedaksi.ts` : penyensor rahasia untuk keluaran proses
 *      - `src/lib/agentGuard.ts` : periksaBaca() (berkas rahasia) & periksaPerintahShell()
 *      Ketiganya dipanggil apa adanya; harness tidak menyalin satu regex pun.
 *
 *   B. MODEL RUJUKAN — dua aturan yang BELUM ada di produk dan diusulkan di
 *      `docs/USULAN-JADWAL-DAN-SSH.md`: (1) allowlist host, fail-closed;
 *      (2) penandaan pemisah shell pada perintah remote. Dipisah jelas dari (A)
 *      supaya tidak ada klaim "produk sudah begini" yang tidak benar.
 *
 *   C. INVARIAN SUMBER NYATA — dibaca sebagai TEKS: `mcp.ts` masih stub (tidak
 *      ada aksi `run`), `ssh.rs` belum memancarkan opsi keamanan.
 */
import { build } from 'esbuild';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..');
const baca = (rel) => readFileSync(join(AKAR, rel), 'utf8');

const dir = mkdtempSync(join(tmpdir(), 'jalur-'));
async function muat(rel, nama) {
  const out = join(dir, nama);
  await build({
    entryPoints: [join(AKAR, rel)],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    outfile: out,
    logLevel: 'silent',
  });
  return import('file:///' + out.replace(/\\/g, '/') + '?v=' + Date.now());
}

let lulus = 0;
let total = 0;
const cek = (nama, syarat, bukti) => {
  total++;
  if (syarat) {
    lulus++;
    console.log(`  OK    ${nama}${bukti !== undefined ? '  [' + bukti + ']' : ''}`);
  } else {
    console.log(`  GAGAL ${nama}  [${bukti}]`);
  }
};

const A = await muat('src/lib/sshArgv.ts', 'sshArgv.mjs');
const R = await muat('src/lib/sshRedaksi.ts', 'sshRedaksi.mjs');
const G = await muat('src/lib/agentGuard.ts', 'agentGuard.mjs');

const MCP = baca('src/lib/zephyrTools/mcp.ts');
const SSH_RS = baca('src-tauri/src/ssh.rs');
const CATALOG = baca('src/lib/zephyrTools/catalog.ts');

/* ---------------- B. model rujukan (usulan, BUKAN produk) ---------------- */

/**
 * Allowlist host — usulan. Fail-closed: daftar kosong = semua ditolak.
 * Entri `*.internal` cocok untuk subdomain (bukan untuk `evilinternal` atau
 * `staging.internal.evil`). Host yang sah secara SINTAKS (sudah lolos
 * `hostSah`) TETAP ditolak kalau tidak ada di daftar — validitas sintaks bukan
 * izin.
 */
function hostDiAllowlist(host, allowlist) {
  if (!Array.isArray(allowlist) || allowlist.length === 0) return false;
  return allowlist.some((entri) => {
    if (entri === host) return true;
    if (entri.startsWith('*.')) {
      const dasar = entri.slice(2);
      return (
        typeof host === 'string' &&
        host.length > dasar.length + 1 &&
        host.endsWith('.' + dasar)
      );
    }
    return false;
  });
}

/** Pemisah shell yang harus ditandai pada perintah remote (usulan). */
const PEMISAH_SHELL = [
  { nama: 'titik-koma', pola: /;/ },
  { nama: 'pipa', pola: /\|/ },
  { nama: 'dan-dan', pola: /&&/ },
  { nama: 'substitusi-perintah', pola: /\$\(/ },
  { nama: 'backtick', pola: /`/ },
];
function tandaiPemisah(perintah) {
  const tanda = [];
  for (const { nama, pola } of PEMISAH_SHELL) {
    if (pola.test(perintah)) tanda.push(nama);
  }
  return tanda;
}

/* ---------------- lingkungan & target contoh ---------------- */

const OPSI = {
  knownHostsFile: 'C:\\Users\\Zyrex\\AppData\\Roaming\\zephyr\\known_hosts',
  configFile: 'C:\\Users\\Zyrex\\AppData\\Roaming\\zephyr\\ssh_config',
};

const target = (ubah = {}) => ({
  id: 'h1',
  host: 'app.internal',
  user: 'ryu',
  port: 22,
  auth: 'key',
  keyPath: 'C:\\Users\\Zyrex\\.ssh\\id_ed25519',
  ...ubah,
});

const tolak = (fn, kode) => {
  try {
    fn();
    return false;
  } catch (e) {
    return e instanceof A.GalatSsh && (kode === undefined || e.kode === kode);
  }
};

/* ---------------- 1-5: allowlist host ---------------- */

console.log('\n# Allowlist host (model rujukan: fail-closed)');

const ALLOW = ['app.internal', '10.0.0.5', '*.staging.internal'];

cek(
  'host di luar allowlist ditolak (walau sintaksnya sah)',
  hostDiAllowlist('evil.example.com', ALLOW) === false,
  'evil.example.com ditolak'
);

cek(
  'host persis di allowlist diizinkan',
  hostDiAllowlist('app.internal', ALLOW) === true &&
    hostDiAllowlist('10.0.0.5', ALLOW) === true,
  'app.internal + 10.0.0.5 diizinkan'
);

cek(
  'wildcard *.staging.internal cocok subdomain, TIDAK cocok evilinternal / staging.internal.evil',
  hostDiAllowlist('api.staging.internal', ALLOW) === true &&
    hostDiAllowlist('evilinternal', ALLOW) === false &&
    hostDiAllowlist('staging.internal.evil', ALLOW) === false,
  'api.staging.internal OK; dua lainnya ditolak'
);

cek(
  'allowlist KOSONG = semua ditolak (fail-closed, bukan wildcard)',
  hostDiAllowlist('app.internal', []) === false &&
    hostDiAllowlist('app.internal', undefined) === false,
  '[] dan undefined -> false'
);

cek(
  'host di luar allowlist tidak pernah dipakai menyusun argv (gerbang sebelum susunArgv)',
  (() => {
    // Aturan usulan: gerbang allowlist jalan lebih dulu; argv tidak dibuat sama sekali.
    const gerbang = (t) => {
      if (!hostDiAllowlist(t.host, ALLOW)) throw new Error('host-di-luar-allowlist');
      return A.susunArgv(t, OPSI);
    };
    const ditolak = (() => {
      try {
        gerbang(target({ host: 'evil.example.com' }));
        return false;
      } catch (e) {
        return String(e.message) === 'host-di-luar-allowlist';
      }
    })();
    const lolos = gerbang(target()).includes('ryu@app.internal');
    return ditolak && lolos;
  })(),
  'evil ditolak di gerbang; app.internal menghasilkan argv'
);

/* ---------------- 6-9: berkas kunci privat ---------------- */

console.log('\n# Kunci privat tidak boleh dibaca (periksaBaca NYATA)');

cek(
  '".ssh/id_rsa" ditolak dibaca',
  G.periksaBaca('C:/Users/Zyrex/.ssh/id_rsa').ok === false,
  G.periksaBaca('C:/Users/Zyrex/.ssh/id_rsa').alasan
);
cek(
  'berkas "*.pem" ditolak dibaca',
  G.periksaBaca('D:/Zephyr/certs/server.pem').ok === false,
  G.periksaBaca('D:/Zephyr/certs/server.pem').alasan
);
cek(
  '".ssh/config" ditolak (direktori terproteksi)',
  G.periksaBaca('C:/Users/Zyrex/.ssh/config').ok === false,
  G.periksaBaca('C:/Users/Zyrex/.ssh/config').alasan
);
cek(
  'berkas biasa /var/log/app.log TETAP boleh dibaca (tidak over-block)',
  G.periksaBaca('/var/log/app.log').ok === true,
  '/var/log/app.log -> ok'
);

/* ---------------- 10-11: rahasia tidak menyeberang ---------------- */

console.log('\n# Rahasia tidak menyeberang ke argv');

const KUNCI_PALSU =
  '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAA\n-----END OPENSSH PRIVATE KEY-----';

cek(
  'jagaArgv menolak blok kunci privat di argv (kode rahasia-di-argv)',
  tolak(() => A.jagaArgv(['ssh', '-i', KUNCI_PALSU]), 'rahasia-di-argv'),
  'rahasia-di-argv'
);

cek(
  'targetMembawaRahasia mendeteksi field privateKey (isian disimpan, bukan dibaca)',
  A.targetMembawaRahasia({ ...target(), privateKey: 'x' }) === true &&
    A.targetMembawaRahasia(target()) === false,
  'true / false'
);

/* ---------------- 12-18: pemisah shell & perintah berbahaya ---------------- */

console.log('\n# Pemisah shell & perintah berbahaya');

cek("perintah dengan ';' ditandai", tandaiPemisah('a; rm -rf /').includes('titik-koma'), 'titik-koma');
cek("perintah dengan '|' ditandai", tandaiPemisah('echo x | sh').includes('pipa'), 'pipa');
cek("perintah dengan '&&' ditandai", tandaiPemisah('a && b').includes('dan-dan'), 'dan-dan');
cek('perintah dengan $() ditandai', tandaiPemisah('echo $(id)').includes('substitusi-perintah'), 'substitusi-perintah');
cek('perintah dengan backtick ditandai', tandaiPemisah('echo `id`').includes('backtick'), 'backtick');

cek(
  'perintah aman tidak ditandai (tidak over-flag)',
  tandaiPemisah('ls -la /var/log').length === 0,
  '0 tanda'
);

cek(
  'perintah berbahaya (rm -rf /) ditolak periksaPerintahShell NYATA',
  G.periksaPerintahShell('rm -rf /').ok === false &&
    G.periksaPerintahShell('ls -la /var/log').ok === true,
  'rm -rf / ditolak; ls lolos'
);

/* ---------------- 19-20: bentuk argv ---------------- */

console.log('\n# Bentuk argv (sshArgv NYATA)');

cek(
  'argv berupa ARRAY (bukan string shell) & host jadi token tersendiri',
  (() => {
    const argv = A.susunArgv(target(), OPSI);
    return (
      Array.isArray(argv) &&
      argv.includes('ryu@app.internal') &&
      argv.includes('-p') &&
      argv.includes('BatchMode=yes')
    );
  })(),
  'Array + ryu@app.internal + -p + BatchMode=yes'
);

cek(
  "pemisah ';' tidak memecah argv skrip mentah (dinetralkan jadi satu elemen)",
  (() => {
    const a = A.susunArgvSkripMentah(target(), OPSI, 'echo a');
    const b = A.susunArgvSkripMentah(target(), OPSI, 'echo a; rm -rf /');
    return b.argv.length === a.argv.length && b.argv[b.argv.length - 1] === 'echo a; rm -rf /';
  })(),
  'jumlah elemen sama; skrip utuh satu elemen'
);

/* ---------------- 21-22: keluaran tidak memuat pola token ---------------- */

console.log('\n# Keluaran tidak memuat pola token (sshRedaksi NYATA)');

cek(
  'sensorRahasia menyensor gh*/sk-/JWT/blok kunci, dan token memang ADA sebelum sensor',
  (() => {
    const kotor =
      'token=ghp_ABCDEFGHIJKLMNOPQRSTUVWX\n' +
      'key=sk-abcdefghijklmnopqrst\n' +
      'auth eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcdefgh\n' +
      'privkey ' +
      KUNCI_PALSU;
    const bersih = R.sensorRahasia(kotor);
    const adaLah =
      /ghp_[A-Za-z0-9]{20,}/.test(kotor) &&
      /sk-[A-Za-z0-9]{16,}/.test(kotor) &&
      /eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{4,}/.test(kotor) &&
      /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/.test(kotor);
    const tokenHilang =
      !/ghp_[A-Za-z0-9]{20,}/.test(bersih) &&
      !/sk-[A-Za-z0-9]{16,}/.test(bersih) &&
      !/eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{4,}/.test(bersih) &&
      !/b3BlbnNzaC1rZXktdjEAAAAA/.test(bersih);
    return adaLah && tokenHilang;
  })(),
  'token ada sebelum sensor, hilang sesudahnya'
);

cek(
  'kalimat tetap terbaca: hanya NILAI yang diganti (password=...)',
  R.sensorRahasia('password=rahasia123').includes('password=') &&
    !R.sensorRahasia('password=rahasia123').includes('rahasia123'),
  R.sensorRahasia('password=rahasia123')
);

/* ---------------- 23-26: invarian sumber nyata ---------------- */

console.log('\n# Invarian sumber nyata (mcp.ts, ssh.rs, catalog.ts)');

cek(
  'mcp.ts: aksi ssh masih list|connect (tidak ada terminal bebas ke model)',
  MCP.includes("enum: ['list', 'connect']") && !MCP.includes("action === 'run'"),
  "enum ['list','connect'], tanpa 'run'"
);

cek(
  'ssh.rs: validate() hanya memeriksa KOSONG (allowlist host belum ada)',
  SSH_RS.includes('host is required') &&
    SSH_RS.includes('user is required') &&
    !/allowlist|daftar putih|whitelist/i.test(SSH_RS),
  'hanya non-kosong -> celah allowlist'
);

cek(
  'ssh.rs: jalur PTY belum memancarkan opsi keamanan (BatchMode/StrictHostKeyChecking)',
  !SSH_RS.includes('BatchMode') && !SSH_RS.includes('StrictHostKeyChecking'),
  'argv PTY = -i / -p / user@host saja'
);

cek(
  'katalog: ssh dideklarasikan butuh izin (efek exec)',
  CATALOG.includes("'ssh', 'control', 'exec', true"),
  "['ssh','control','exec',true,...]"
);

console.log(`\n== ${lulus}/${total} lulus ==`);
process.exit(lulus === total ? 0 : 1);
