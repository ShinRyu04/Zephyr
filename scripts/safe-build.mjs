import { existsSync, renameSync, mkdirSync, readdirSync, statSync, rmSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { homedir } from 'node:os';

const APPDATA = process.env.APPDATA || join(homedir(), 'AppData', 'Roaming');
const DIR = join(APPDATA, 'zephyr');
const SECRETS = join(DIR, 'secrets.json');
const HOLD = join(DIR, '.build-hold');
const HOLD_FILE = join(HOLD, 'secrets.json');

const config = process.argv[2] || 'src-tauri/tauri.release.conf.json';

let dipindah = false;

function amankan() {
  if (!existsSync(SECRETS)) return;
  mkdirSync(HOLD, { recursive: true });
  renameSync(SECRETS, HOLD_FILE);
  dipindah = true;
  console.log('[secrets-guard] secrets.json dijauhkan dari build');
}

function kembalikan() {
  if (!dipindah) return;
  try {
    if (existsSync(HOLD_FILE)) renameSync(HOLD_FILE, SECRETS);
    if (existsSync(HOLD)) rmSync(HOLD, { recursive: true, force: true });
    console.log('[secrets-guard] secrets.json dikembalikan');
  } catch (e) {
    console.error('[secrets-guard] GAGAL mengembalikan:', e.message);
  }
}

function scanArtefak() {
  const base = 'src-tauri/target/release/bundle';
  if (!existsSync(base)) return;
  const tanda = ['secrets.json'];
  const hasil = [];
  const walk = (d) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      const s = statSync(p);
      if (s.isDirectory()) walk(p);
      else if (tanda.some((t) => n.includes(t))) hasil.push(p);
    }
  };
  walk(base);
  if (hasil.length) {
    console.error('[secrets-guard] PERINGATAN: artefak memuat file secrets:', hasil.join(', '));
    process.exitCode = 1;
  } else {
    console.log('[secrets-guard] artefak bersih dari file secrets');
  }
}

process.on('exit', kembalikan);
process.on('SIGINT', () => { kembalikan(); process.exit(130); });

amankan();
try {
  // Signing key: dibaca dari %APPDATA%\zephyr (di luar repo, .gitignore menutup
  // *.key & signing-key.txt). Tanpa keduanya `tauri build` gagal di tahap updater
  // artifact dengan "A public key has been found, but no private key" — dan
  // installer terbit tanpa .sig sehingga auto-update tidak bisa memverifikasinya.
  const KEY = join(DIR, 'zephyr.key');
  const KEYFILE = join(DIR, 'signing-key.txt');
  const env = { ...process.env };
  if (existsSync(KEY)) {
    // The CLI takes the base64 key itself, not a path: handed a path it tries to
    // decode "C:\..." and dies with "Invalid symbol 58" (the colon).
    env.TAURI_SIGNING_PRIVATE_KEY = readFileSync(KEY, 'utf8').trim();
    console.log('[signing] private key dipasang dari ' + KEY);
  } else {
    console.error('[signing] PERINGATAN: zephyr.key tidak ada — artefak updater tidak akan ditandatangani');
  }
  if (existsSync(KEYFILE)) {
    env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD = readFileSync(KEYFILE, 'utf8').trim();
    console.log('[signing] password kunci dibaca dari signing-key.txt');
  }
  execSync(`npx tauri build --config ${config}`, { stdio: 'inherit', env });
} finally {
  kembalikan();
  scanArtefak();
}
