// ram-uji.mjs — ukur RAM release untuk beberapa set flag WebView2, SEKALI dengan
// pembersihan sungguhan (kill → tunggu 0 proses → baru ukur).
//
// Kenapa harus begini: pengukuran sebelumnya sering tercemar proses sisa dari
// uji sebelumnya, sehingga angka 75/78/228 MB muncul padahal bukan efek flag.
// Skrip ini memverifikasi DUA hal per kandidat: angka RAM, dan apakah flag
// benar-benar terbaca di command line proses webview2.
//
// Jalankan: node scripts/ram-uji.mjs

import { spawn, execSync } from 'node:child_process';

const EXE = 'src-tauri/target/release/zephyr.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ps = (cmd) =>
  execSync(`powershell -NoProfile -Command "${cmd.replace(/"/g, '\\"')}"`, { encoding: 'utf8' }).trim();

function killSemua() {
  try {
    ps('Stop-Process -Name zephyr,msedgewebview2 -Force -ErrorAction SilentlyContinue');
  } catch {}
}

function jumlahProses() {
  try {
    return parseInt(ps('@(Get-Process zephyr,msedgewebview2 -ErrorAction SilentlyContinue).Count'), 10);
  } catch {
    return 0;
  }
}

async function tungguNol() {
  for (let i = 0; i < 60; i++) {
    if (jumlahProses() === 0) return true;
    await sleep(500);
  }
  return false;
}

function ukurRAM() {
  const out = execSync('powershell -NoProfile -ExecutionPolicy Bypass -File scripts/ram-tree.ps1', {
    encoding: 'utf8',
  });
  const m = /PRIVATE working set total : ([\d.]+)/.exec(out);
  return m ? +m[1] : null;
}

function rinci() {
  const out = execSync('powershell -NoProfile -ExecutionPolicy Bypass -File scripts/ram-tree.ps1', {
    encoding: 'utf8',
  });
  return out
    .split('\n')
    .filter((l) => /msedgewebview2|zephyr\.exe|PRIVATE/.test(l))
    .map((l) => l.trim())
    .join('\n');
}

/** Apakah flag benar-benar sampai ke proses webview2? */
function flagTerbaca(flag) {
  try {
    const out = ps(
      `(Get-CimInstance Win32_Process -Filter "Name='msedgewebview2.exe'" | ForEach-Object { $_.CommandLine }) -join '|'`,
    );
    return out.includes(flag);
  } catch {
    return false;
  }
}

const KANDIDAT = [
  ['baseline (tanpa flag)', ''],
  ['disable-gpu', '--disable-gpu'],
  ['renderer-process-limit=1', '--renderer-process-limit=1'],
  ['gpu-off + rpl1', '--disable-gpu --renderer-process-limit=1'],
];

console.log('kandidat | RAM MB | jumlah proses | flag terbaca');
for (const [label, args] of KANDIDAT) {
  killSemua();
  const nol = await tungguNol();
  if (!nol) console.log(`  (peringatan: proses sisa tidak habis untuk ${label})`);

  const env = { ...process.env };
  if (args) env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = args;
  else delete env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS;

  const p = spawn(EXE, [], { env, detached: true, stdio: 'ignore' });
  p.unref();

  await sleep(26000);
  const mb = ukurRAM();
  const n = jumlahProses();
  const terbaca = args ? flagTerbaca(args.split(' ')[0]) : true;
  console.log(`${label} | ${mb ?? 'GAGAL'} | ${n} | ${terbaca}`);
}

// rincian kandidat terakhir sebelum ditutup
console.log('\n=== rincian kandidat terakhir ===');
console.log(rinci());
killSemua();
console.log('selesai');
