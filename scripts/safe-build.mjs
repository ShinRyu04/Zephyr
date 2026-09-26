import { existsSync, renameSync, mkdirSync, readdirSync, statSync, rmSync } from 'node:fs';
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
  execSync(`npx tauri build --config ${config}`, { stdio: 'inherit' });
} finally {
  kembalikan();
  scanArtefak();
}
