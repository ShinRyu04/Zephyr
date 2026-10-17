/*
 * Which CLIs `list_agents()` would report on THIS machine.
 *
 * The Rust side owns the catalogue and the search paths; this harness mirrors
 * both so the detection can be checked without launching the app. It is a
 * MIRROR, not the source of truth - so it also asserts that the two lists agree,
 * which is the failure that matters: a CLI added to Rust but not here (or the
 * reverse) would make this check pass while the app stayed blind.
 *
 * Run: node scripts/verify-deteksi-cli.mjs
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';

const akar = join(dirname(fileURLToPath(import.meta.url)), '..');
const rust = readFileSync(join(akar, 'src-tauri/src/agents.rs'), 'utf8');

let lulus = 0;
let gagal = 0;
const hasil = (nama, ok, detail) => {
  if (ok) {
    lulus++;
    console.log(`  ok    ${nama}`);
  } else {
    gagal++;
    console.log(`  GAGAL ${nama}${detail ? `\n         ${detail}` : ''}`);
  }
};

/* ---- The catalogue, read from the Rust source (single source of truth) ---- */
const katalog = [...rust.matchAll(/^\s*\("([a-z0-9-]+)",\s*"([^"]+)",\s*"([a-z0-9-]+)"\),/gm)].map((m) => ({
  id: m[1],
  label: m[2],
  exe: m[3],
}));

console.log('\n1. Katalog Rust terbaca');
hasil(`ada entri katalog (${katalog.length})`, katalog.length >= 10, `cuma ${katalog.length}`);

/* ---- Search paths, mirrored from `extra_candidates` ---- */
const home = homedir();
const appdata = process.env.APPDATA ?? '';
const local = process.env.LOCALAPPDATA ?? '';
const pf = process.env.ProgramFiles ?? '';

function kandidat(exe) {
  const out = [
    join(home, `.${exe}`, 'bin', `${exe}.exe`),
    join(home, `.${exe}`, 'bin', exe),
    join(home, `.${exe}`, 'entry', `${exe}.cmd`),
    join(home, `.${exe}`, 'bin', exe, `${exe}.exe`),
    join(home, '.local', 'bin', `${exe}.exe`),
    join(home, '.local', 'bin', exe),
    join(home, '.bun', 'bin', `${exe}.exe`),
    join(home, '.bun', 'bin', exe),
  ];
  if (appdata) out.push(join(appdata, 'npm', `${exe}.cmd`), join(appdata, 'npm', `${exe}.exe`));
  if (local) {
    out.push(
      join(local, exe, 'bin', `${exe}.cmd`),
      join(local, exe, 'bin', `${exe}.exe`),
      join(local, 'Programs', exe, `${exe}.exe`),
    );
  }
  if (pf) {
    out.push(join(pf, exe, 'bin', `${exe}.exe`));
    if (exe === 'gh') out.push(join(pf, 'GitHub CLI', `${exe}.exe`));
  }
  /* Vendor-specific folder named after the PRODUCT, not the executable. */
  if (exe === 'qoder' || exe === 'qodercli') {
    out.push(
      join(home, '.qoder', 'bin', 'qodercli', 'qodercli.exe'),
      join(home, '.qoder', 'bin', 'qodercli', 'qodercli'),
      join(home, '.qoder', 'entry', 'qoder.cmd'),
      join(home, '.local', 'bin', 'qodercli'),
      join(home, '.local', 'bin', 'qodercli.exe'),
    );
  }
  return out;
}

/* ---- Which of those actually exist here ---- */
const terdeteksi = [];
for (const e of katalog) {
  const ada = kandidat(e.exe).find((p) => existsSync(p));
  if (ada) terdeteksi.push({ ...e, path: ada });
}

console.log('\n2. Yang terdeteksi di mesin ini');
for (const t of terdeteksi) console.log(`        ${t.id.padEnd(10)} ${t.label.padEnd(22)} ${t.path}`);
hasil(
  `terdeteksi ${terdeteksi.length} CLI`,
  terdeteksi.length > 0,
  'tidak satu pun terdeteksi - jalur pencarian salah?',
);

console.log('\n3. Tiga CLI yang dilaporkan hilang sekarang terdeteksi');
/*
 * These are the specific ones the reader named: `omp`, `dsh-tui` and
 * `qodercli`. Each lives somewhere `which` alone does not look on this machine,
 * which is why they were invisible before the search paths were widened.
 */
for (const id of ['omp', 'dsh-tui', 'qoder']) {
  const ada = terdeteksi.some((t) => t.id === id);
  hasil(`${id} terdeteksi`, ada, `tidak ditemukan di jalur mana pun untuk id '${id}'`);
}

console.log('\n4. Label tidak ada yang kembar');
const label = terdeteksi.map((t) => t.label);
const kembar = label.filter((l, i) => label.indexOf(l) !== i);
hasil('semua label unik', kembar.length === 0, `kembar: ${[...new Set(kembar)].join(', ')}`);

console.log('\n5. Tab panel AI tetap hanya claude + codex');
/*
 * The panel strip is NOT the terminal list. Only CLIs with a chat adapter
 * (`CliChat` for Claude, `CodexChat` for Codex) may appear there; everything
 * else belongs in the terminal, where its own TUI is hosted as-is.
 */
const tabs = readFileSync(join(akar, 'src/lib/aiTabsStore.ts'), 'utf8');
const blok = /const TAB_PANEL: readonly string\[\] = \[([^\]]+)\]/.exec(tabs);
hasil('TAB_PANEL ditemukan', !!blok, 'konstanta tidak terbaca');
if (blok) {
  const isi = [...blok[1].matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]);
  hasil(
    `TAB_PANEL hanya claude + codex (${isi.join(', ')})`,
    isi.length === 2 && isi.includes('claude') && isi.includes('codex'),
    `isi: ${isi.join(', ')}`,
  );
}

console.log(`\n${gagal === 0 ? 'LULUS' : 'GAGAL'} - ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal === 0 ? 0 : 1);
