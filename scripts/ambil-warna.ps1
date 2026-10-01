# ambil-warna.ps1 — baca warna piksel nyata dari jendela Zephyr (level OS).
#
# Kenapa OS-level: CDP hanya melihat webview, sedangkan keluhan "hijau" bisa
# datang dari frame/native yang tidak terlihat DOM. Skrip ini mengambil
# beberapa titik di jendela dan melaporkan RGB-nya, lalu menandai yang hijau.
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class W {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
  public struct RECT { public int L, T, R, B; }
}
"@
$p = Get-Process zephyr -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $p) { Write-Output 'zephyr tidak jalan'; exit }
$h = $p.MainWindowHandle
[W]::ShowWindow($h, 9) | Out-Null   # SW_RESTORE
[W]::SetForegroundWindow($h) | Out-Null
Start-Sleep -Milliseconds 700
$r = New-Object W+RECT
[W]::GetWindowRect($h, [ref]$r) | Out-Null
$w = $r.R - $r.L; $ht = $r.B - $r.T
Write-Output ("jendela: {0},{1} {2}x{3}" -f $r.L, $r.T, $w, $ht)

$bmp = New-Object System.Drawing.Bitmap($w, $ht)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($r.L, $r.T, 0, 0, (New-Object System.Drawing.Size($w, $ht)))

$titik = @(
  @{ n = 'menubar';      x = [int]($w*0.02); y = 12 },
  @{ n = 'activitybar';  x = 24;             y = [int]($ht*0.4) },
  @{ n = 'sidebar';      x = [int]($w*0.10); y = [int]($ht*0.4) },
  @{ n = 'editor';       x = [int]($w*0.5);  y = [int]($ht*0.35) },
  @{ n = 'panel-bawah';  x = [int]($w*0.5);  y = [int]($ht*0.88) },
  @{ n = 'statusbar';    x = [int]($w*0.5);  y = ($ht - 12) },
  @{ n = 'statusbar-ki'; x = 200;            y = ($ht - 12) },
  @{ n = 'avatar-gh';    x = 24;             y = ($ht - 40) }
)
foreach ($t in $titik) {
  if ($t.x -lt 0 -or $t.y -lt 0 -or $t.x -ge $w -or $t.y -ge $ht) { continue }
  $c = $bmp.GetPixel($t.x, $t.y)
  $hijau = ''
  if ($c.G -gt 60 -and ($c.G - $c.R) -gt 25 -and ($c.G - $c.B) -gt 15) { $hijau = '   <== HIJAU' }
  Write-Output ("{0,-14} ({1,5},{2,5})  #{3:X2}{4:X2}{5:X2}{6}" -f $t.n, $t.x, $t.y, $c.R, $c.G, $c.B, $hijau)
}
$g.Dispose(); $bmp.Dispose()
