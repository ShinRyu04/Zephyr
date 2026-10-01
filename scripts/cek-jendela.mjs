// cek-jendela.mjs — buktikan tidak ada jendela konsol yang muncul.
//
// Cara uji yang tepat: proses anak Zephyr yang berupa konsol (conhost.exe)
// HANYA dibuat kalau ada proses anak tanpa CREATE_NO_WINDOW. Jadi jumlah
// conhost keturunan zephyr.exe adalah buktinya — bukan hitungan global
// (yang ikut menghitung terminal milik aplikasi lain).
//
// Pakai: node scripts/cek-jendela.mjs

import { execSync } from 'node:child_process';
import { Cdp, sleep } from 'file:///D:/Zephyr/scripts/lib-cdp.mjs';

const PS = `
$all = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name
$root = $all | Where-Object { $_.Name -eq 'zephyr.exe' }
$ids = New-Object System.Collections.Generic.HashSet[int]
foreach ($r in $root) { [void]$ids.Add([int]$r.ProcessId) }
$changed = $true
while ($changed) {
  $changed = $false
  foreach ($p in $all) {
    if ($ids.Contains([int]$p.ParentProcessId) -and -not $ids.Contains([int]$p.ProcessId)) {
      [void]$ids.Add([int]$p.ProcessId); $changed = $true
    }
  }
}
$konsole = @($all | Where-Object { $ids.Contains([int]$_.ProcessId) -and $_.Name -in @('conhost.exe','OpenConsole.exe') })
Write-Output $konsole.Count
`.replace(/\n/g, '; ');

function hitungKonsol() {
  const out = execSync(`powershell -NoProfile -Command "${PS}"`, { encoding: 'utf8' });
  return parseInt(out.trim().split(/\s+/).pop(), 10);
}

const sebelum = hitungKonsol();
console.log('conhost keturunan zephyr (sebelum):', sebelum);

const { cdp } = await Cdp.attach('9223');
await sleep(300);

// 1) jalur `reg query` (dulu memunculkan jendela tiap buka app)
await cdp.runAsync(`
  await window.__ZEPHYR_SET__.publicModels();
  return 'ok';
`);
await sleep(1200);
const a = hitungKonsol();
console.log('setelah publicModels (reg query) :', a);

// 2) jalur git (spawn `git`, dan `taskkill` saat batal)
await cdp.runAsync(`
  await window.__ZEPHYR_GIT__.refresh();
  return 'ok';
`);
await sleep(1500);
const b = hitungKonsol();
console.log('setelah git refresh              :', b);

// 3) jalur diagnostik (`git --version`)
await cdp.runAsync(`
  if (window.__ZEPHYR_DIAG__) { await window.__ZEPHYR_DIAG__.get(); }
  return 'ok';
`);
await sleep(1500);
const c = hitungKonsol();
console.log('setelah diagnostik               :', c);

const akhir = Math.max(a, b, c);
console.log('');
console.log(
  akhir <= sebelum ? 'LULUS' : 'GAGAL',
  `— jendela konsol anak: ${sebelum} → ${akhir} (harus tidak bertambah)`,
);
process.exit(akhir <= sebelum ? 0 : 1);
