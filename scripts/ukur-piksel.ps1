# ukur-piksel.ps1 — ukur tinggi glyph logo Z dan tinggi huruf menu LANGSUNG
# dari piksel screenshot. Tidak bergantung model vision.
#
# PENTING: GetWindowRect mengembalikan koordinat TERMASUK batas bayangan
# jendela. Di build ini isi DOM mulai 18px di bawahnya. Offset itu ditemukan
# otomatis di sini dengan mencari baris pertama yang berisi piksel terang,
# supaya angka yang dilaporkan benar-benar piksel menubar.

Add-Type -AssemblyName System.Drawing

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class W3 {
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

[void][W3]::ShowWindow($p.MainWindowHandle, 5)
[void][W3]::SetForegroundWindow($p.MainWindowHandle)
Start-Sleep -Milliseconds 1200

$r = New-Object W3+RECT
[void][W3]::GetWindowRect($p.MainWindowHandle, [ref]$r)

$w = 400; $barH = 28
# Ambil lebih tinggi dari bar supaya offset bisa dicari.
$bmp = New-Object System.Drawing.Bitmap($w, 60)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($r.Left, $r.Top, 0, 0, (New-Object System.Drawing.Size($w, 60)))
$g.Dispose()

$ambang = 85

# 1. Cari offset: baris pertama yang punya piksel terang.
$offset = -1
for ($y = 0; $y -lt 50; $y++) {
  for ($x = 0; $x -lt $w; $x++) {
    $c = $bmp.GetPixel($x, $y)
    $lum = 0.299*$c.R + 0.587*$c.G + 0.114*$c.B
    if ($lum -gt $ambang) { $offset = $y; break }
  }
  if ($offset -ge 0) { break }
}
if ($offset -lt 0) { Write-Output '  menubar tidak terdeteksi'; $bmp.Dispose(); exit 1 }

function Rentang-Vertikal($x0, $x1, $y0, $y1) {
  $atas = -1; $bawah = -1
  for ($y = $y0; $y -lt $y1; $y++) {
    for ($x = $x0; $x -lt $x1; $x++) {
      $c = $bmp.GetPixel($x, $y)
      $lum = 0.299*$c.R + 0.587*$c.G + 0.114*$c.B
      if ($lum -gt $ambang) {
        if ($atas -lt 0) { $atas = $y }
        $bawah = $y
        break
      }
    }
  }
  if ($atas -lt 0) { return $null }
  return @{ atas = $atas; bawah = $bawah; tinggi = ($bawah - $atas + 1) }
}

$yA = $offset
$yB = $offset + $barH
# Zona logo: x 8..24 (persis dari DOM). Zona teks "File": x 36..80.
$logo = Rentang-Vertikal 8 24 $yA $yB
$menu = Rentang-Vertikal 36 80 $yA $yB

Write-Output ''
Write-Output ("  offset jendela   : {0} px (batas bayangan GetWindowRect)" -f $offset)
Write-Output ("  menubar          : y {0}..{1}  tinggi {2} px" -f $yA, ($yB-1), $barH)
if ($logo) { Write-Output ("  logo  Z          : y {0}..{1}  tinggi {2} px" -f $logo.atas, $logo.bawah, $logo.tinggi) }
else { Write-Output '  logo Z: tidak terdeteksi' }
if ($menu) { Write-Output ("  teks menu (File) : y {0}..{1}  tinggi {2} px" -f $menu.atas, $menu.bawah, $menu.tinggi) }
else { Write-Output '  teks menu: tidak terdeteksi' }

if ($logo -and $menu) {
  $rasio = [math]::Round($logo.tinggi / $menu.tinggi, 2)
  $geser = [math]::Round((($logo.atas + $logo.bawah) / 2) - (($menu.atas + $menu.bawah) / 2), 1)
  $cLogo = [math]::Round((($logo.atas + $logo.bawah) / 2) - $yA, 1)
  $cBar  = $barH / 2
  Write-Output ''
  Write-Output ("  rasio logo/teks  : {0}x   (target ~1.2, VS Code ~1.2)" -f $rasio)
  Write-Output ("  geser center     : {0} px (target 0, toleransi +/-1)" -f $geser)
  Write-Output ("  center logo      : {0} px dari atas menubar (bar center {1})" -f $cLogo, $cBar)

  $ok = ($rasio -ge 1.0 -and $rasio -le 1.4) -and ([math]::Abs($geser) -le 1.5)
  Write-Output ''
  if ($ok) { Write-Output '  KESIMPULAN: proporsional & sejajar' }
  else { Write-Output '  KESIMPULAN: masih perlu disesuaikan' }
}

$bmp.Dispose()
