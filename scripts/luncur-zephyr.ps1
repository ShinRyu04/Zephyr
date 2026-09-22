# luncur-zephyr.ps1 — jalankan Zephyr DEBUG dengan CDP 9223 TANPA merebut fokus.
#
# Kenapa ada: user main game sambil gua verifikasi. Jendela yang muncul di
# depan akan menutup game / merebut keyboard. Skrip ini:
#   1. menyalakan app debug dengan port debug WebView2,
#   2. menunggu jendela muncul,
#   3. LANGSUNG minimize (SW_MINIMIZE) — tidak pernah foreground,
#   4. memastikan CDP 9223 hidup untuk harness.
#
# Pemakaian: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/luncur-zephyr.ps1 [-Tunggu 45]

param(
  [int]$Tunggu = 45,      # detik maks menunggu CDP siap
  [switch]$Tampilkan       # kalau diset, jendela TIDAK diminimize (debug manual)
)

$ErrorActionPreference = 'Stop'
$root = 'D:\Zephyr'
$exe = Join-Path $root 'src-tauri\target\debug\zephyr.exe'

if (-not (Test-Path $exe)) {
  Write-Output "GAGAL: $exe belum dibangun"
  exit 1
}

# ── Win32: minimize tanpa mengaktifkan jendela ──
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32Min {
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int X, int Y, int cx, int cy, uint flags);
  public const int SW_MINIMIZE = 6;
  public const int SW_SHOWNOACTIVATE = 4;
  public static readonly IntPtr HWND_BOTTOM = new IntPtr(1);
  public const uint SWP_NOACTIVATE = 0x0010;
  public const uint SWP_NOMOVE = 0x0002;
  public const uint SWP_NOSIZE = 0x0001;
}
"@

# ── 1. matikan sisa proses zephyr debug (jangan sentuh instalasi user) ──
Get-Process zephyr -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "$root*" } | ForEach-Object {
  try { $_.Kill(); Write-Output "  hentikan zephyr debug lama pid=$($_.Id)" } catch {}
}
Start-Sleep -Milliseconds 800

# ── 2. luncurkan dengan port debug; CreateNoWindow agar tidak ada console ──
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9223'
$p = Start-Process -FilePath $exe -WorkingDirectory $root -PassThru -WindowStyle Minimized
Write-Output "  luncur pid=$($p.Id) (minimized)"

# ── 3. tunggu jendela muncul, lalu paksa minimize (tanpa foreground) ──
$deadline = (Get-Date).AddSeconds($Tunggu)
$hMin = $false
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Milliseconds 700
  $proc = Get-Process -Id $p.Id -ErrorAction SilentlyContinue
  if (-not $proc) { break }
  if ($proc.MainWindowHandle -ne 0 -and -not $hMin) {
    if (-not $Tampilkan) {
      # ShowWindow MINIMIZE + dorong ke dasar z-order: tidak pernah di depan.
      [Win32Min]::ShowWindow($proc.MainWindowHandle, [Win32Min]::SW_MINIMIZE) | Out-Null
      [Win32Min]::SetWindowPos($proc.MainWindowHandle, [Win32Min]::HWND_BOTTOM, 0, 0, 0, 0,
        [Win32Min]::SWP_NOMOVE -bor [Win32Min]::SWP_NOSIZE -bor [Win32Min]::SWP_NOACTIVATE) | Out-Null
    }
    $hMin = $true
    Write-Output "  jendela diminimize (handle=$($proc.MainWindowHandle))"
  }
  # CDP siap?
  try {
    $r = Invoke-WebRequest -Uri 'http://127.0.0.1:9223/json/version' -TimeoutSec 2 -UseBasicParsing
    if ($r.StatusCode -eq 200) {
      Write-Output "  CDP 9223 SIAP"
      if (-not $Tampilkan -and $proc.MainWindowHandle -ne 0) {
        [Win32Min]::ShowWindow($proc.MainWindowHandle, [Win32Min]::SW_MINIMIZE) | Out-Null
      }
      exit 0
    }
  } catch { }
}

Write-Output "  CDP 9223 belum siap setelah ${Tunggu}s (app mungkin masih kompilasi/loading)"
exit 2
