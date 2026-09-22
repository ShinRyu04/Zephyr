# shot-topmost.ps1 — screenshot jendela yang DIJAMIN tidak ketutupan window lain.
#
# Masalah script lama: CopyFromScreen menyalin PIKsel LAYAR pada koordinat
# jendela. Kalau ada window lain menutupi koordinat itu, yang tersimpan
# window lain tersebut (pernah kejadian: ketangkap window Abel).
#
# Perbaikan: paksa jendela ke TOPMOST dulu (SetWindowPos HWND_TOPMOST),
# baru salin layar, lalu kembalikan ke NOTOPMOST.
#
# Pakai: powershell -File scripts/shot-topmost.ps1 <out.png> [namaProses]

param([string]$Out = "shot-topmost.png", [string]$Name = "zephyr")

Add-Type -AssemblyName System.Drawing
if (-not ("WinTop" -as [type])) {
  Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinTop {
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
"@
}

$HWND_TOPMOST   = [IntPtr](-1)
$HWND_NOTOPMOST = [IntPtr](-2)
$SWP_NOMOVE = 0x0002; $SWP_NOSIZE = 0x0001; $SWP_SHOWWINDOW = 0x0040
$flags = $SWP_NOMOVE -bor $SWP_NOSIZE -bor $SWP_SHOWWINDOW

$p = Get-Process -Name $Name -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $p) { Write-Output "GAGAL: jendela '$Name' tidak ditemukan"; exit 1 }

$h = $p.MainWindowHandle
[WinTop]::ShowWindow($h, 9) | Out-Null            # SW_RESTORE
[WinTop]::SetWindowPos($h, $HWND_TOPMOST, 0, 0, 0, 0, $flags) | Out-Null
[WinTop]::SetForegroundWindow($h) | Out-Null
Start-Sleep -Milliseconds 1200

$r = New-Object WinTop+RECT
[WinTop]::GetWindowRect($h, [ref]$r) | Out-Null
$w = $r.Right - $r.Left; $ht = $r.Bottom - $r.Top
if ($w -le 0 -or $ht -le 0) { Write-Output "GAGAL: ukuran jendela tidak valid"; exit 1 }

$bmp = New-Object System.Drawing.Bitmap($w, $ht)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($r.Left, $r.Top, 0, 0, (New-Object System.Drawing.Size($w, $ht)))
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()

[WinTop]::SetWindowPos($h, $HWND_NOTOPMOST, 0, 0, 0, 0, $flags) | Out-Null

Write-Output ("tersimpan: {0} ({1}x{2})  proses={3}  judul=[{4}]" -f $Out, $w, $ht, $p.ProcessName, $p.MainWindowTitle)
