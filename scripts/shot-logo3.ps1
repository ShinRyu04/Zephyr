# shot-logo3.ps1 - potret area logo di menubar jendela Zephyr DEV.
# Pakai MainWindowHandle dari proses yang path-nya target\debug\zephyr.exe,
# bukan FindWindow (jendela decorations:false tidak punya title bar native).

Add-Type -AssemblyName System.Drawing

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class W2 {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
"@

$p = Get-Process zephyr -ErrorAction SilentlyContinue |
  Where-Object { $_.Path -like '*target\debug\*' -and $_.MainWindowHandle -ne 0 } |
  Select-Object -First 1

if (-not $p) { Write-Output '  app dev (target\debug) tidak jalan'; exit 1 }
Write-Output ("  pakai pid={0} path={1}" -f $p.Id, $p.Path)

$h = $p.MainWindowHandle
[void][W2]::ShowWindow($h, 5)
[void][W2]::SetForegroundWindow($h)
Start-Sleep -Milliseconds 1400

$r = New-Object W2+RECT
[void][W2]::GetWindowRect($h, [ref]$r)
Write-Output ("  jendela: {0},{1} {2}x{3}" -f $r.Left, $r.Top, ($r.Right-$r.Left), ($r.Bottom-$r.Top))

$w = 260; $hgt = 30
$bmp = New-Object System.Drawing.Bitmap($w, $hgt)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($r.Left, $r.Top + 18, 0, 0, (New-Object System.Drawing.Size($w, $hgt)))
$g.Dispose()

$f = 10
$besar = New-Object System.Drawing.Bitmap(($w*$f), ($hgt*$f))
$g2 = [System.Drawing.Graphics]::FromImage($besar)
$g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$g2.DrawImage($bmp, 0, 0, $besar.Width, $besar.Height)
$g2.Dispose()

$out = Join-Path $env:TEMP 'zephyr-logo-zoom.png'
$besar.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose(); $besar.Dispose()
Write-Output "  disimpan: $out"
