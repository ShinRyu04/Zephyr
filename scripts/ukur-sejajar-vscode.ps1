Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class VA {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
"@
$p = Get-Process Code -EA SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
[void][VA]::ShowWindow($p.MainWindowHandle, 5)
[void][VA]::SetForegroundWindow($p.MainWindowHandle)
Start-Sleep -Milliseconds 1500
$r = New-Object VA+RECT
[void][VA]::GetWindowRect($p.MainWindowHandle, [ref]$r)

$w = 120; $h = 200
$bmp = New-Object System.Drawing.Bitmap($w, $h)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($r.Left, $r.Top + 20, 0, 0, (New-Object System.Drawing.Size($w, $h)))
$g.Dispose()

# Kolom mana yang berisi konten terang? (logo menubar + ikon activity bar)
Write-Output '  kolom berisi konten (menubar y0-18, activity bar y30+):'
for ($x = 0; $x -lt $w; $x++) {
  $m = 0; $a = 0
  for ($y = 0; $y -lt 18; $y++) {
    $c = $bmp.GetPixel($x, $y)
    if ((0.299*$c.R + 0.587*$c.G + 0.114*$c.B) -gt 70) { $m++ }
  }
  for ($y = 30; $y -lt 190; $y++) {
    $c = $bmp.GetPixel($x, $y)
    if ((0.299*$c.R + 0.587*$c.G + 0.114*$c.B) -gt 70) { $a++ }
  }
  if ($m -gt 0 -or $a -gt 0) {
    Write-Output ("    x={0,3}  menubar={1,3}  activitybar={2,3}" -f $x, $m, $a)
  }
}
# Cari border activity bar (garis vertikal terang)
Write-Output ''
Write-Output '  kandidat border vertical activity bar:'
for ($x = 30; $x -lt 70; $x++) {
  $n = 0
  for ($y = 40; $y -lt 180; $y++) {
    $c = $bmp.GetPixel($x, $y)
    $lum = 0.299*$c.R + 0.587*$c.G + 0.114*$c.B
    if ($lum -gt 40 -and $lum -lt 90) { $n++ }
  }
  if ($n -gt 100) { Write-Output ("    x={0}  skor={1}" -f $x, $n) }
}
$bmp.Dispose()
