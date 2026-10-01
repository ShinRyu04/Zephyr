# shot-jendela.ps1 — screenshot jendela app TANPA butuh debug port / CDP.
#
# Build rilis tidak punya CDP (config additionalBrowserArgs menimpa env var),
# jadi verifikasi visual build rilis harus lewat jendela asli.
#
# Pakai: powershell -File scripts/shot-jendela.ps1 <out.png> [namaProses]
param([string]$Out = "shot-jendela.png", [string]$Name = "zephyr")

Add-Type -AssemblyName System.Drawing
if (-not ("WinCap" -as [type])) {
  Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinCap {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
"@
}

$p = Get-Process -Name $Name -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $p) { Write-Output "GAGAL: jendela '$Name' tidak ditemukan"; exit 1 }

$h = $p.MainWindowHandle
[WinCap]::ShowWindow($h, 9) | Out-Null          # SW_RESTORE kalau minimize
[WinCap]::SetForegroundWindow($h) | Out-Null
Start-Sleep -Milliseconds 900

$r = New-Object WinCap+RECT
[WinCap]::GetWindowRect($h, [ref]$r) | Out-Null
$w = $r.Right - $r.Left
$ht = $r.Bottom - $r.Top
if ($w -le 0 -or $ht -le 0) { Write-Output "GAGAL: ukuran jendela tidak valid"; exit 1 }

$bmp = New-Object System.Drawing.Bitmap($w, $ht)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($r.Left, $r.Top, 0, 0, (New-Object System.Drawing.Size($w, $ht)))
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Output ("tersimpan: {0} ({1}x{2})" -f $Out, $w, $ht)
