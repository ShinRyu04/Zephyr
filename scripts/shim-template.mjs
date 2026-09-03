// shim-template.mjs — isi shim CLI `zephyr` (fase 28).
//
// Dipisah dari buat-shim.mjs supaya HARNESS memakai isi yang SAMA dengan
// produk. Kalau harness menulis versi shim sendiri, yang diuji bukan shim
// yang dipakai user.

/**
 * Isi `zephyr.cmd`.
 *
 * Kenapa tidak `start /wait`: untuk aplikasi GUI, `start /wait` menunggu
 * PROSES SELESAI — artinya `zephyr --wait` baru kembali saat seluruh editor
 * ditutup, bukan saat tab-nya ditutup. Yang benar: app menghapus file penanda
 * saat tab ditutup, shim mengintip penanda itu.
 */
export function isiCmd(exe) {
  return `@echo off
rem zephyr.cmd — shim CLI Zephyr (fase 28). Dihasilkan scripts/buat-shim.mjs.
rem
rem GUI exe melepas shell begitu dijalankan, jadi --wait diselesaikan lewat
rem file penanda di %TEMP%\\zephyr-wait: app menghapusnya saat tab ditutup.
setlocal EnableDelayedExpansion
set "ZEXE=${exe}"

rem Apakah ada --wait / -w di argumen?
set "ZWAIT="
for %%A in (%*) do (
  if /I "%%~A"=="--wait" set "ZWAIT=1"
  if /I "%%~A"=="-w" set "ZWAIT=1"
)

if not defined ZWAIT (
  rem Pemanggilan normal WAJIB senyap (brief BRANDING CLI): tidak ada echo,
  rem tidak ada banner. start /B melepas tanpa membuka window console baru.
  start "" /B "%ZEXE%" %*
  exit /b 0
)

rem Token unik per pemanggilan: PID shell tidak tersedia di cmd, jadi dipakai
rem %RANDOM% dua kali. Tabrakan tidak berbahaya (penanda beda file per token).
set "ZTOK=w%RANDOM%%RANDOM%"
set "ZDIR=%TEMP%\\zephyr-wait"
if not exist "%ZDIR%" mkdir "%ZDIR%" >nul 2>&1
echo 1> "%ZDIR%\\%ZTOK%.wait"

start "" /B "%ZEXE%" %* --wait-token %ZTOK%

rem Tunggu app menghapus penanda. timeout /t tidak dipakai (butuh TTY dan
rem gagal saat stdin di-redirect); ping ke loopback bekerja di semua konteks,
rem termasuk saat dipanggil git sebagai core.editor.
:tunggu
if not exist "%ZDIR%\\%ZTOK%.wait" goto selesai
ping -n 2 127.0.0.1 >nul 2>&1
goto tunggu

:selesai
endlocal
exit /b 0
`;
}

/**
 * Isi `zephyr.ps1`.
 *
 * PowerShell menjalankan .cmd lewat cmd.exe dan redirection-nya jadi aneh di
 * dalam pipeline, jadi disediakan versi native.
 */
export function isiPs1(exe) {
  return `# zephyr.ps1 — shim CLI Zephyr (fase 28). Dihasilkan scripts/buat-shim.mjs.
param([Parameter(ValueFromRemainingArguments = $true)][string[]] $Args)

$exe = '${exe.replace(/\\/g, '\\\\')}'
$wait = $Args | Where-Object { $_ -ieq '--wait' -or $_ -ieq '-w' }

if (-not $wait) {
  # Senyap: tidak menunggu, tidak mencetak apa pun.
  Start-Process -FilePath $exe -ArgumentList $Args -WindowStyle Hidden | Out-Null
  exit 0
}

$tok = 'w' + [guid]::NewGuid().ToString('N').Substring(0, 12)
$dir = Join-Path $env:TEMP 'zephyr-wait'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
Set-Content -Path (Join-Path $dir "$tok.wait") -Value '1'

Start-Process -FilePath $exe -ArgumentList ($Args + @('--wait-token', $tok)) -WindowStyle Hidden | Out-Null

while (Test-Path (Join-Path $dir "$tok.wait")) { Start-Sleep -Milliseconds 400 }
exit 0
`;
}
