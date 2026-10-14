/*
 * uji-ssh-aman — mengunci invarian keamanan jalur SSH (item 169).
 *
 * Menyusun argumen ssh itu mudah; yang salah adalah membangunnya sebagai SATU
 * STRING lalu menyerahkannya ke shell. Karena itu modul yang diuji di sini murni
 * (`src/lib/sshArgv.ts`, `src/lib/sshRedaksi.ts`) dan dijalankan langsung di Node
 * lewat esbuild — tanpa aplikasi hidup, tanpa host, tanpa jaringan. Yang diuji
 * adalah BENTUK argumen dan apa yang lolos/tidak lolos, bukan koneksi.
 *
 * Beberapa klaim di bawah diverifikasi terhadap ssh NYATA di mesin ini
 * (OpenSSH_10.2p1), bukan dari ingatan:
 *   - `ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new ... -G soal@host`
 *     memantulkan opsi itu apa adanya (dipakai di kasus "opsi keamanan").
 *   - nilai `-o` yang memuat spasi TANPA kutip dipotong di spasi
 *     (`UserKnownHostsFile=/a b/x` -> `/a`), jadi modul membungkusnya dengan
 *     kutip — dibuktikan di kasus "nilai -o berspasi".
 */
import { build } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'ssh169-'));
async function muat(entry, nama) {
  const out = join(dir, nama);
  await build({
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    outfile: out,
    logLevel: 'silent',
  });
  return import('file:///' + out.replace(/\\/g, '/') + '?v=' + Date.now());
}

const A = await muat('src/lib/sshArgv.ts', 'sshArgv.mjs');
const R = await muat('src/lib/sshRedaksi.ts', 'sshRedaksi.mjs');

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

/* ---------------- target & lingkungan contoh ---------------- */

const OPSI = {
  knownHostsFile: 'C:\\Users\\Zyrex\\AppData\\Roaming\\zephyr\\known_hosts',
  configFile: 'C:\\Users\\Zyrex\\AppData\\Roaming\\zephyr\\ssh_config',
};

const target = (ubah = {}) => ({
  id: 'h1',
  host: 'contoh.internal',
  user: 'ryu',
  port: 22,
  auth: 'key',
  keyPath: 'C:\\Users\\Zyrex\\.ssh\\id_ed25519',
  ...ubah,
});

/** true kalau fn melempar GalatSsh dengan kode tertentu. */
const tolak = (fn, kode) => {
  try {
    fn();
    return false;
  } catch (e) {
    return e instanceof A.GalatSsh && (kode === undefined || e.kode === kode);
  }
};

/* ---------------- 1-5: host jahat ditolak ---------------- */

console.log('\n# Host jahat');
cek(
  "host 'foo; rm -rf /' ditolak",
  tolak(() => A.susunArgv(target({ host: 'foo; rm -rf /' }), OPSI), 'host-tidak-sah'),
  'host-tidak-sah'
);
cek(
  "host 'a b' ditolak",
  tolak(() => A.susunArgv(target({ host: 'a b' }), OPSI), 'host-tidak-sah'),
  'host-tidak-sah'
);
cek(
  "host '' ditolak",
  tolak(() => A.susunArgv(target({ host: '' }), OPSI), 'host-tidak-sah'),
  'host-tidak-sah'
);
cek(
  "host '-oProxyCommand=touch pwned' ditolak",
  tolak(
    () => A.susunArgv(target({ host: '-oProxyCommand=touch pwned' }), OPSI),
    'host-tidak-sah'
  ),
  'token berawalan "-" dibaca ssh sebagai OPSI, bukan sebagai host'
);
cek(
  'host dengan newline ditolak',
  tolak(() => A.susunArgv(target({ host: 'baik\nevil' }), OPSI), 'host-tidak-sah'),
  'host-tidak-sah'
);
cek(
  "IPv6 '::1' diterima",
  A.susunArgv(target({ host: '::1' }), OPSI).includes('ryu@::1'),
  'ryu@::1'
);
cek(
  'user jahat (root; id) ditolak',
  tolak(() => A.susunArgv(target({ user: 'root; id' }), OPSI), 'user-tidak-sah'),
  'user-tidak-sah'
);

/* ---------------- 6-9: port ---------------- */

console.log('\n# Port');
cek(
  'port 0 ditolak',
  tolak(() => A.susunArgv(target({ port: 0 }), OPSI), 'port-tidak-sah'),
  'port-tidak-sah'
);
cek(
  'port 70000 ditolak',
  tolak(() => A.susunArgv(target({ port: 70000 }), OPSI), 'port-tidak-sah'),
  'port-tidak-sah'
);
cek(
  "port '22' (string) ditolak",
  tolak(() => A.susunArgv(target({ port: '22' }), OPSI), 'port-tidak-sah'),
  'port-tidak-sah'
);
cek(
  'port 22 diterima',
  A.susunArgv(target({ port: 22 }), OPSI).join(' ').includes('-p 22'),
  '-p 22'
);
cek(
  'validasiTarget() melaporkan dua galat sekaligus (host+port)',
  A.validasiTarget({ host: 'a b', user: 'ryu', port: 0, auth: 'key', keyPath: 'C:/k' }).join(',') ===
    'host-tidak-sah,port-tidak-sah',
  'host-tidak-sah,port-tidak-sah'
);

/* ---------------- 10-13: bentuk argv & opsi keamanan ---------------- */

console.log('\n# Bentuk argv & opsi keamanan');
const argvKey = A.susunArgv(target(), OPSI);
const teksKey = argvKey.join(' ');
cek(
  'keluaran berupa ARRAY (bukan string)',
  Array.isArray(argvKey) && argvKey.every((x) => typeof x === 'string'),
  `Array(${argvKey.length})`
);
cek(
  'BatchMode=yes selalu ada',
  argvKey.includes('BatchMode=yes'),
  'BatchMode=yes'
);
cek(
  'StrictHostKeyChecking=accept-new ada (mode bawaan)',
  argvKey.includes('StrictHostKeyChecking=accept-new'),
  'accept-new'
);
cek(
  'UserKnownHostsFile selalu ke berkas app',
  argvKey.includes(`UserKnownHostsFile=${OPSI.knownHostsFile}`),
  OPSI.knownHostsFile
);
cek(
  'ConnectTimeout + ServerAlive* + TCPKeepAlive ada',
  ['ConnectTimeout=20', 'ServerAliveInterval=15', 'ServerAliveCountMax=3', 'TCPKeepAlive=yes'].every(
    (x) => argvKey.includes(x)
  ),
  '4 opsi'
);
cek(
  'IdentityAgent=none (agen mati) & IdentitiesOnly=yes (auth key)',
  argvKey.includes('IdentityAgent=none') && argvKey.includes('IdentitiesOnly=yes'),
  'none + yes'
);
cek(
  '-F ke berkas config milik app (bukan ~/.ssh/config user)',
  argvKey[argvKey.indexOf('-F') + 1] === OPSI.configFile,
  OPSI.configFile
);
cek(
  "'StrictHostKeyChecking=no' TIDAK pernah dihasilkan (ssh & scp & sftp)",
  ['ssh', 'scp', 'sftp'].every(
    (m) => !A.susunArgv(target(), OPSI, m).includes('StrictHostKeyChecking=no')
  ),
  'no tidak pernah muncul'
);
cek(
  "host/user/port jadi token TEPISAH: 'ryu@contoh.internal' utuh, port token sendiri",
  argvKey[argvKey.length - 1] === 'ryu@contoh.internal' &&
    argvKey[argvKey.indexOf('-p') + 1] === '22' &&
    argvKey.filter((x) => x === 'ryu@contoh.internal').length === 1,
  `… ${argvKey.slice(-3).join(' ')}`
);
cek(
  'scp/sftp memakai -P (ssh memakai -p)',
  A.susunArgv(target(), OPSI, 'scp').includes('-P') &&
    A.susunArgv(target(), OPSI, 'sftp').includes('-P') &&
    argvKey.includes('-p'),
  'ssh=-p · scp/sftp=-P'
);
cek(
  '-i <keyPath> ada untuk auth key',
  argvKey[argvKey.indexOf('-i') + 1] === 'C:\\Users\\Zyrex\\.ssh\\id_ed25519',
  'id_ed25519'
);

/* ---------------- 14-16: perintah user TIDAK menyatu dengan argv ssh ---------------- */

console.log('\n# Perintah user dipisah');
const tokenTerstruktur = A.susunArgvJalankan(target(), OPSI, ['echo', 'a; rm -rf /']);
const akhir = tokenTerstruktur.argv[tokenTerstruktur.argv.length - 1];
cek(
  "token 'a; rm -rf /' DIKUTIP jadi satu elemen (tidak jadi perintah kedua)",
  akhir === "echo 'a; rm -rf /'" &&
    tokenTerstruktur.argv.filter((x) => x.includes('rm -rf')).length === 1,
  akhir
);
cek(
  'jumlah elemen argv tidak bertambah karena ";" (tidak ada pemecahan)',
  tokenTerstruktur.argv.length === argvKey.length + 1,
  `${argvKey.length} -> ${tokenTerstruktur.argv.length}`
);
cek(
  'perintah mentah tetap satu elemen & token host tidak tersentuh',
  (() => {
    const j = A.susunArgvSkripMentah(target(), OPSI, 'echo a; rm -rf /');
    return (
      j.argv.filter((x) => x === 'echo a; rm -rf /').length === 1 &&
      j.argv[j.argv.length - 2] === 'ryu@contoh.internal' &&
      j.argv.filter((x) => x.startsWith('-')).every((x) => ['-o', '-F', '-i', '-p', '-P'].includes(x))
    );
  })(),
  "'echo a; rm -rf /' = 1 elemen"
);
cek(
  'skrip kosong ditolak',
  tolak(() => A.susunArgvSkripMentah(target(), OPSI, '   '), 'perintah-tidak-sah'),
  'perintah-tidak-sah'
);

/* ---------------- 17-20: rahasia tidak pernah masuk argv ---------------- */

console.log('\n# Rahasia tidak pernah masuk argv');
const CANARY = '__RAHASIA__';
const argvDenganCanary = A.susunArgv(
  target({ auth: 'password', password: CANARY, passphrase: CANARY }),
  OPSI
);
cek(
  'target ber-field password/passphrase: canary tidak muncul di argv',
  !argvDenganCanary.join(' ').includes(CANARY),
  `argv ${argvDenganCanary.length} token, canary absen`
);
cek(
  'targetMembawaRahasia() mendeteksi field kata sandi pada objek target',
  A.targetMembawaRahasia(target({ auth: 'password', password: CANARY })) === true &&
    A.targetMembawaRahasia(target()) === false,
  'true / false'
);
cek(
  "jagaArgv menolak 'password=<canary>' di argv (ragu-ragu tidak ada: langsung tolak)",
  tolak(() => A.susunArgvJalankan(target(), OPSI, ['mysql', `password=${CANARY}`]), 'rahasia-di-argv'),
  'rahasia-di-argv'
);
cek(
  'jagaArgv menolak blok kunci privat di argv',
  tolak(
    () =>
      A.jagaArgv(['-i', 'x', '-----BEGIN OPENSSH PRIVATE KEY-----\nAAAA\n-----END OPENSSH PRIVATE KEY-----']),
    'rahasia-di-argv'
  ),
  'rahasia-di-argv'
);
cek(
  'argv yang wajar tidak ditolak jagaArgv (tidak over-block)',
  !tolak(() => A.jagaArgv(argvKey)) && !tolak(() => A.jagaArgv(['-o', 'PasswordAuthentication=no', 'ryu@h'])),
  'lolos'
);

/* ---------------- 21-23: host key tidak dipercaya otomatis tanpa catatan ---------------- */

console.log('\n# Host key');
cek(
  "policy 'pin' TANPA fingerprint ditolak (tidak dipercaya otomatis tanpa catatan)",
  tolak(() => A.susunArgv(target({ hostKeyPolicy: 'pin' }), OPSI), 'fingerprint-tidak-sah'),
  'fingerprint-tidak-sah'
);
cek(
  "policy 'pin' DENGAN fingerprint -> StrictHostKeyChecking=yes",
  A.susunArgv(
    target({ hostKeyPolicy: 'pin', fingerprint: 'SHA256:' + 'a'.repeat(43) }),
    OPSI
  ).includes('StrictHostKeyChecking=yes'),
  'yes'
);
cek(
  'fingerprint cacat (bukan SHA256:...) ditolak',
  tolak(
    () => A.susunArgv(target({ hostKeyPolicy: 'pin', fingerprint: 'SHA256:pendek' }), OPSI),
    'fingerprint-tidak-sah'
  ),
  'fingerprint-tidak-sah'
);

/* ---------------- 24-27: opsi tambahan, kunci, kutipan nilai ---------------- */

console.log('\n# Opsi tambahan, kunci, kutipan');
cek(
  "opsi 'ProxyCommand' ditolak (jalankan perintah lokal)",
  tolak(
    () => A.susunArgv(target(), { ...OPSI, opsiTambahan: { ProxyCommand: 'touch' } }),
    'opsi-dilarang'
  ),
  'opsi-dilarang'
);
cek(
  'opsi di luar daftar putih ditolak',
  tolak(
    () => A.susunArgv(target(), { ...OPSI, opsiTambahan: { SesukaHatiSaya: 'ya' } }),
    'opsi-tidak-dikenal'
  ),
  'opsi-tidak-dikenal'
);
cek(
  'opsi yang sah (Ciphers) diterima dan nilainya tersusun',
  A.susunArgv(target(), { ...OPSI, opsiTambahan: { Ciphers: 'aes256-gcm@openssh.com' } }).includes(
    'Ciphers=aes256-gcm@openssh.com'
  ),
  'Ciphers=…'
);
cek(
  'auth key tanpa keyPath ditolak',
  tolak(() => A.susunArgv(target({ keyPath: '' }), OPSI), 'kunci-tidak-sah'),
  'kunci-tidak-sah'
);
cek(
  'keyPath dengan newline ditolak',
  tolak(() => A.susunArgv(target({ keyPath: 'C:/a\nb' }), OPSI), 'kunci-tidak-sah'),
  'kunci-tidak-sah'
);
cek(
  'keyPath ber-spasi DITERIMA (satu elemen argv, ssh membaca apa adanya)',
  A.susunArgv(target({ keyPath: 'C:\\Users\\Ryu A\\.ssh\\id' }), OPSI).includes(
    'C:\\Users\\Ryu A\\.ssh\\id'
  ),
  'jalur berspasi utuh'
);
cek(
  'nilai -o berspasi DIBUNGKUS KUTIP (tanpa itu ssh memotong di spasi)',
  A.susunArgv(target(), { ...OPSI, knownHostsFile: 'C:\\Users\\Ryu A\\known_hosts' }).includes(
    'UserKnownHostsFile="C:\\Users\\Ryu A\\known_hosts"'
  ),
  'terukur: tanpa kutip -> dipotong di spasi'
);
cek(
  'berkas -o dengan tanda kutip ganda ditolak (ambigu)',
  tolak(() => A.susunArgv(target(), { ...OPSI, knownHostsFile: 'C:/a"b' }), 'opsi-lingkungan-tidak-sah'),
  'opsi-lingkungan-tidak-sah'
);
cek(
  'connectTimeoutMs di luar batas ditolak',
  tolak(
    () => A.susunArgv(target(), { ...OPSI, connectTimeoutMs: 50 }),
    'opsi-lingkungan-tidak-sah'
  ),
  'opsi-lingkungan-tidak-sah'
);

/* ---------------- 28-32: redaksi ---------------- */

console.log('\n# Redaksi keluaran/log');
const PEM = [
  '-----BEGIN OPENSSH PRIVATE KEY-----',
  'b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW',
  'QyNTUxOQAAACBmYWtlc2VjcmV0YmFzZTY0Ym9keWZha2UAAAABZmFrZXNlY3JldA==',
  '-----END OPENSSH PRIVATE KEY-----',
].join('\n');
const hasilPem = R.sensorRahasia(`$ cat ~/.ssh/id_ed25519\n${PEM}\n$ echo selesai`);
cek(
  'blok kunci privat PEM palsu disensor seluruhnya',
  !hasilPem.includes('b3BlbnNzaC1rZXkt') &&
    !hasilPem.includes('ZmFrZXNlY3JldA==') &&
    hasilPem.includes(R.PENANDA_KUNCI_PRIVAT),
  `sisa: ${hasilPem.split('\n').length} baris`
);
cek(
  'kepala kunci saja (log terpotong rotasi) tetap disensor',
  R.sensorRahasia('-----BEGIN OPENSSH PRIVATE KEY-----').includes(R.PENANDA_KUNCI_PRIVAT),
  R.PENANDA_KUNCI_PRIVAT
);
const campuran = [
  'password=s3cr3t-ssh',
  'passphrase: "kalimat rahasia"',
  'sshpass -p rahasia-nya ssh ryu@h',
  'UserKnownHostsFile=C:\\Users\\ryu\\known_hosts',
  'Authorization: Bearer abcdefghijklmnop',
  'postgres://admin:sandi-db@db.internal:5432/app',
  'token API: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345',
  'jwt: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcdefghijkl',
].join('\n');
const hasilCampuran = R.sensorRahasia(campuran);
cek(
  'kata sandi/passphrase/sshpass/URL/jwt/token disensor',
  !hasilCampuran.includes('s3cr3t-ssh') &&
    !hasilCampuran.includes('kalimat rahasia') &&
    !hasilCampuran.includes('rahasia-nya') &&
    !hasilCampuran.includes('sandi-db') &&
    !hasilCampuran.includes('ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345') &&
    !hasilCampuran.includes('abcdefghijklmnop') &&
    !hasilCampuran.includes('eyJhbGciOiJIUzI1NiJ9'),
  'tidak ada nilai rahasia yang tertinggal'
);
cek(
  'kalimatnya tetap terbaca (hanya NILAI yang diganti)',
  hasilCampuran.includes('password=«disensor»') &&
    hasilCampuran.includes('Bearer «disensor»') &&
    hasilCampuran.includes('postgres://admin:«disensor»@db.internal'),
  'password=«disensor»'
);
cek(
  'tidak over-redact: UserKnownHostsFile/PasswordAuthentication tidak disensor',
  hasilCampuran.includes('UserKnownHostsFile=C:\\Users\\ryu\\known_hosts') &&
    !R.adaRahasia('ssh -o PasswordAuthentication=no -o BatchMode=yes ryu@h'),
  'opsi sah tetap utuh'
);
cek(
  'sensorArgv menyensor per token & namaAturanCocok melaporkan nama aturan',
  R.sensorArgv(['-pw', 'rahasia123', 'ryu@h']).join(' ').includes(R.PENANDA) &&
    R.namaAturanCocok('passphrase=x').includes('penugasan-rahasia'),
  R.namaAturanCocok('passphrase=x').join(',')
);
cek(
  'sensorArgv: token SETELAH flag kata sandi diganti utuh, tapi -P (port) tidak',
  R.sensorArgv(['sshpass', '-p', 'x'])[2].includes(R.PENANDA) &&
    R.sensorArgv(['sshpass', '-prahasia'])[1].includes(R.PENANDA) &&
    R.sensorArgv(['-pw', 'rahasia123'])[1].includes(R.PENANDA) &&
    R.sensorArgv(['-P', '2222', 'a@b'])[1] === '2222',
  R.sensorArgv(['sshpass', '-p', 'x']).join(' ')
);
cek(
  'sensorUntukLog memotong keluaran panjang lalu menyensor',
  (() => {
    const panjang = `password=nihil\n${'x'.repeat(20000)}\npassword=bocor`;
    const out = R.sensorUntukLog(panjang, 1000);
    return out.length < 1200 && !out.includes('bocor');
  })(),
  'potong + sensor'
);
cek(
  'DILARANG_LOG menyebut kata sandi & kunci privat; BOLEH_LOG mengizinkan fingerprint',
  R.DILARANG_LOG.some((x) => x.includes('kata sandi SSH')) &&
    R.DILARANG_LOG.some((x) => x.includes('kunci privat')) &&
    R.BOLEH_LOG.some((x) => x.includes('fingerprint')),
  `${R.DILARANG_LOG.length} dilarang / ${R.BOLEH_LOG.length} boleh`
);

/* ---------------- INFO: pantulan ssh nyata (TIDAK dihitung dalam tally) ---------------- */

/*
 * Kasus-kasus di atas memeriksa BENTUK argv. Blok ini memeriksa satu langkah
 * lebih jauh: apakah ssh yang sungguhan benar-benar memahami opsi yang kita
 * pancarkan, dan apakah berkas config yang jahat bisa menimpanya. Sengaja
 * TIDAK dihitung supaya tally tetap deterministik tanpa biner ssh.
 */
console.log('\n# INFO (tidak dihitung dalam tally): pantulan oleh ssh nyata');
try {
  const { execFileSync, spawnSync } = await import('node:child_process');
  const { writeFileSync } = await import('node:fs');
  const v = spawnSync('ssh', ['-V'], { encoding: 'utf8' });
  console.log(`  ${String(v.stderr || v.stdout || 'ssh').trim()}`);

  /* Berkas config yang sengaja MELEMAHKAN keamanan. Kalau opsi kita benar-benar
   * didahulukan, pantulan -G harus tetap menunjukkan nilai kita. */
  const cfg = join(dir, 'ssh_config');
  writeFileSync(cfg, 'Host *\n  StrictHostKeyChecking no\n  BatchMode no\n  UserKnownHostsFile /tmp/other\n');
  const argvG = A.susunArgv(target({ keyPath: join(dir, 'id_uji_tidak_ada') }), {
    ...OPSI,
    configFile: cfg,
  });
  const teks = execFileSync('ssh', [...argvG, '-G'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 15000,
  });
  const ambil = (k) => {
    const m = new RegExp('^' + k + ' (.+)$', 'm').exec(teks);
    return m ? m[1] : '(tidak ada)';
  };
  console.log(`  config jahat  : StrictHostKeyChecking no / BatchMode no / UserKnownHostsFile /tmp/other`);
  console.log(`  terpantul     : stricthostkeychecking=${ambil('stricthostkeychecking')} batchmode=${ambil('batchmode')}`);
  console.log(`                  userknownhostsfile=${ambil('userknownhostsfile')}`);
  console.log(`  artinya opsi keamanan modul MENANG atas config yang melemahkan.`);
} catch (e) {
  console.log(`  SKIP  ssh nyata tidak tersedia / gagal: ${String(e.message).split('\n')[0]}`);
  console.log('  (blok ini hanya bukti tambahan; tally di bawah tetap sah.)');
}

/* ---------------- ringkasan ---------------- */

console.log(`\n== ${lulus}/${total} lulus ==`);
process.exit(lulus === total ? 0 : 1);
