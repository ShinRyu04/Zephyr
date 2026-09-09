// verify-update.mjs — verifikasi manifest updater Tauri (latest.json) PERSIS
// seperti yang dilakukan tauri-plugin-updater v2 (Rust):
//
//   1. baca pubkey dari src-tauri/tauri.conf.json
//   2. rekonstruksi field `signature` manifest dari file `.sig`:
//        decode tiap baris `.sig` → gabung teks 4 baris (minisign) → base64 satu baris
//   3. simulasi `base64_to_string` + `Signature::decode` + `PublicKey::decode`
//   4. verifikasi ed25519 atas blake2b-512(installer) + global signature
//
// Pakai:
//   node scripts/verify-update.mjs <installer.exe> <installer.exe.sig> [--latest latest.json]
//
// Tanpa argumen cukup memvalidasi struktur `latest.json` di root proyek.

import { readFileSync } from 'node:fs';
import { createHash, verify as edVerify, createPublicKey } from 'node:crypto';

const B64 = (s) => Buffer.from(s, 'base64');

/** decode minisign public key (2 baris teks) -> { keyId, key (32B) } */
function decodePublicKey(pubkeyB64) {
  const text = B64(pubkeyB64).toString('utf8');
  const lines = text.split('\n').filter((l) => l.trim() !== '');
  if (lines.length < 2) throw new Error('pubkey: bukan 2 baris teks');
  const bytes = B64(lines[1].trim());
  if (bytes.length !== 42) throw new Error(`pubkey: panjang ${bytes.length} (harap 42)`);
  return { keyId: bytes.subarray(2, 10), key: bytes.subarray(10, 42) };
}

/** decode minisign signature (4 baris teks) -> { keyId, sig (64B), trustedComment, globalSig (64B), prehashed } */
function decodeSignature(text) {
  const lines = text.split('\n').filter((l) => l.trim() !== '');
  if (lines.length < 4) throw new Error(`signature: ${lines.length} baris (harap 4)`);
  const bin1 = B64(lines[1].trim());
  const bin2 = B64(lines[3].trim());
  if (bin1.length !== 74) throw new Error(`signature: blok 1 ${bin1.length} byte (harap 74)`);
  if (bin2.length !== 64) throw new Error(`signature: blok 2 ${bin2.length} byte (harap 64)`);
  if (!lines[2].startsWith('trusted comment: '))
    throw new Error('signature: baris 3 bukan "trusted comment: …"');
  const alg = (bin1[0] << 8) | bin1[1];
  if (alg !== 0x4544 && alg !== 0x4564)
    throw new Error(`signature: algoritma 0x${alg.toString(16)} (harap 0x4544/0x4564)`);
  return {
    keyId: bin1.subarray(2, 10),
    sig: bin1.subarray(10, 74),
    trustedComment: lines[2].slice('trusted comment: '.length),
    globalSig: bin2,
    prehashed: alg === 0x4544,
  };
}

/** simulasi `base64_to_string` + `Signature::decode` plugin Tauri */
function parseManifestSignature(signatureField) {
  return decodeSignature(B64(signatureField).toString('utf8'));
}

function ed25519PubKey(raw32) {
  return createPublicKey({
    key: { kty: 'OKP', crv: 'Ed25519', x: raw32.toString('base64url') },
    format: 'jwk',
  });
}

function verifikasi(installerPath, sigPath, pubkeyB64) {
  const installer = readFileSync(installerPath);
  const sigFile = readFileSync(sigPath, 'utf8').trim();

  // Rekonstruksi field `signature` manifest dari file .sig (decode per baris).
  const sigText = sigFile
    .split('\n')
    .map((line) => B64(line.trim()).toString('utf8').replace(/\n$/, ''))
    .join('\n');
  const signatureField = Buffer.from(sigText + '\n', 'utf8').toString('base64');

  const pk = decodePublicKey(pubkeyB64);
  const sg = parseManifestSignature(signatureField);

  const checks = [];
  const ok = (name, cond, detail) => {
    checks.push([name, cond, detail]);
    console.log(`${cond ? 'LULUS' : 'GAGAL'}  ${name.padEnd(34)} ${detail}`);
    return cond;
  };

  ok('key_id signature == pubkey', Buffer.compare(pk.keyId, sg.keyId) === 0, `id=${B64(sg.keyId).toString('hex').toUpperCase()}`);
  ok('mode pre-hashed (blake2b512)', sg.prehashed, `untrusted: ${sigText.split('\n')[0]}`);

  const digest = createHash('blake2b512').update(installer).digest();
  const message = sg.prehashed ? digest : installer;
  const pub = ed25519PubKey(pk.key);
  const sigOk = edVerify(null, message, pub, sg.sig);
  ok('ed25519 installer signature', sigOk, `installer ${installerPath} (${installer.length} B)`);

  const globalMsg = Buffer.concat([sg.sig, Buffer.from(sg.trustedComment, 'utf8')]);
  const globalOk = edVerify(null, globalMsg, pub, sg.globalSig);
  ok('ed25519 global signature', globalOk, `trusted comment: ${sg.trustedComment}`);

  const lulus = checks.every(([, c]) => c);
  if (!lulus) {
    console.error('\nSIGNATURE TIDAK VALID — jangan upload latest.json ini.');
    process.exit(1);
  }
  console.log('\nSIGNATURE VALID — field signature untuk latest.json:');
  console.log(signatureField);
  return signatureField;
}

/** validasi struktur manifest latest.json sesuai RemoteRelease plugin Tauri */
function validasiManifest(latestPath, pubkeyB64) {
  const raw = readFileSync(latestPath, 'utf8');
  let m;
  try {
    m = JSON.parse(raw);
  } catch (e) {
    console.error(`GAGAL  latest.json bukan JSON valid: ${e.message}`);
    process.exit(1);
  }
  const ok = (name, cond, detail) =>
    console.log(`${cond ? 'LULUS' : 'GAGAL'}  ${name.padEnd(34)} ${detail}`);

  ok('JSON ter-parse (UTF-8)', true, `${latestPath} (${raw.length} B)`);
  ok('field version', typeof m.version === 'string' && /^\d+\.\d+\.\d+/.test(m.version), m.version);
  ok('field pub_date (RFC3339)', !m.pub_date || !Number.isNaN(Date.parse(m.pub_date)), m.pub_date ?? '(kosong, diizinkan)');

  const target = m.platforms?.['windows-x86_64'];
  ok('platforms.windows-x86_64 ada', !!target, m.platforms ? Object.keys(m.platforms).join(', ') : '(tidak ada platforms!)');
  if (!target) process.exit(1);

  ok('url http(s) valid', /^https?:\/\//.test(target.url ?? ''), target.url);
  ok('field signature ada', typeof target.signature === 'string' && target.signature.length > 100, `${target.signature?.length ?? 0} char`);

  try {
    const sg = parseManifestSignature(target.signature);
    ok('signature ter-decode (format minisign)', true, `id=${B64(sg.keyId).toString('hex').toUpperCase()} prehashed=${sg.prehashed}`);
    const pk = decodePublicKey(pubkeyB64);
    ok('key_id signature == pubkey', Buffer.compare(pk.keyId, sg.keyId) === 0, 'kunci penandatangan cocok');
  } catch (e) {
    ok('signature ter-decode (format minisign)', false, e.message);
    process.exit(1);
  }
}

// ── main ──
const conf = JSON.parse(readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
const pubkeyB64 = conf.plugins?.updater?.pubkey;
if (!pubkeyB64) {
  console.error('pubkey tidak ditemukan di src-tauri/tauri.conf.json');
  process.exit(2);
}

const [, , installerPath, sigPath] = process.argv;
const latestIdx = process.argv.indexOf('--latest');
const latestPath = latestIdx >= 0 ? process.argv[latestIdx + 1] : 'latest.json';

console.log('== Verifikasi signature installer ==');
if (installerPath && sigPath) {
  verifikasi(installerPath, sigPath, pubkeyB64);
} else {
  console.log('(lewati — berikan <installer.exe> <installer.exe.sig> untuk verifikasi kriptografis)');
}

console.log('\n== Validasi manifest latest.json ==');
validasiManifest(latestPath, pubkeyB64);
console.log('\nOK — latest.json siap di-upload ke GitHub Releases.');