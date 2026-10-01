# shot-final.ps1 - potret area logo+menu dari menubar, dengan margin di atas
# menubar supaya clipping (kalau ada) terlihat.
#
# Catatan: GetWindowRect mengembalikan koordinat termasuk batas bayangan
# jendela; isi DOM mulai 18px di bawahnya (terukur).

Add-Type -AssemblyName System.Drawing

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class W5 {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
"@

$p = Get-Process zephyr -ErrorAction SilentlyContinue |
  Where-Object { $_.Path -like '*target\debug\*' -and $_.MainWindowHandle -ne 0 } |
  Select-Object -First 1
if (-not $p) { Write-Output '  app dev tidak jalan'; exit 1 }

[void][W5]::ShowWindow($p.MainWindowHandle, 5)
[void][W5]::SetForegroundWindow($p.MainWindowHandle)
Start-Sleep -Milliseconds 1400

$r = New-Object W5+RECT
[void][W5]::GetWindowRect($p.MainWindowHandle, [ref]$r)

# Mulai 10px DI ATAS menubar (offset terukur 18) supaya clipping terlihat.
$mulai = 8
$w = 200
$h = 60
$bmp = New-Object System.Drawing.Bitmap($w, $h)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($r.Left, $r.Top + $mulai, 0, 0, (New-Object System.Drawing.Size($w, $h)))
$g.Dispose()

$f = 10
$besar = New-Object System.Drawing.Bitmap(($w * $f), ($h * $f))
$g2 = [System.Drawing.Graphics]::FromImage($besar)
$g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$g2.DrawImage($bmp, 0, 0, $besar.Width, $besar.Height)
$g2.Dispose()

$out = 'D:\Zephyr\logo-final.png'
$besar.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
$besar.Dispose()

# Baris menubar ada di $mulai+10 .. $mulai+10+28 pada gambar.
Write-Output ("  menubar di baris {0}..{1} pada gambar (atasnya margin)" -f ($mulai + 10), ($mulai + 10 + 28))
Write-Output "  disimpan: $out"
