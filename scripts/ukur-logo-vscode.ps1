# ukur-logo-vscode.ps1 — ukur khusus LOGO VS Code (piksel biru) di kiri menubar.
# Logo VS Code berwarna biru; teks menu abu-abu netral. Pemisahnya: kanal B
# jauh lebih tinggi dari R.

Add-Type -AssemblyName System.Drawing

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class VW2 {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
"@

$p = Get-Process Code -ErrorAction SilentlyContinue |
  Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $p) { Write-Output '  VS Code tidak jalan'; exit 1 }

[void][VW2]::ShowWindow($p.MainWindowHandle, 5)
[void][VW2]::SetForegroundWindow($p.MainWindowHandle)
Start-Sleep -Milliseconds 1500

$r = New-Object VW2+RECT
[void][VW2]::GetWindowRect($p.MainWindowHandle, [ref]$r)

$w = 200; $scan = 50
$bmp = New-Object System.Drawing.Bitmap($w, $scan)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($r.Left, $r.Top, 0, 0, (New-Object System.Drawing.Size($w, $scan)))
$g.Dispose()

# Offset menubar = 20 (terukur sebelumnya)
$off = 20

# Zona logo: cari kolom-kolom yang punya piksel BIRU (kanal B unggul).
function AdaLiru($x) {
  for ($y = $off; $y -lt ($off + 24); $y++) {
    $c = $bmp.GetPixel($x, $y)
    if ($c.B -gt ($c.R + 30) -and $c.B -gt 80) { return $true }
  }
  return $false
}

# Rentang kolom logo
$kiri = -1; $kanan = -1
for ($x = 0; $x -lt 60; $x++) {
  if (AdaLiru $x) { if ($kiri -lt 0) { $kiri = $x }; $kanan = $x }
}
Write-Output ("  kolom logo (biru): x {0}..{1}  lebar {2} px" -f $kiri, $kanan, ($kanan-$kiri+1))

# Rentang baris logo dalam zona x itu
$atas = -1; $bawah = -1
for ($y = $off; $y -lt ($off + 26); $y++) {
  $ada = $false
  for ($x = $kiri; $x -le $kanan; $x++) {
    $c = $bmp.GetPixel($x, $y)
    if ($c.B -gt ($c.R + 30) -and $c.B -gt 80) { $ada = $true; break }
  }
  if ($ada) { if ($atas -lt 0) { $atas = $y }; $bawah = $y }
}
Write-Output ("  baris logo       : y {0}..{1}  tinggi {2} px" -f ($atas-$off), ($bawah-$off), ($bawah-$atas+1))

# Teks menu: abu-abu netral (R~G~B), luminance > 70, di kanan logo
$tAtas = -1; $tBawah = -1
for ($y = $off; $y -lt ($off + 26); $y++) {
  $ada = $false
  for ($x = ($kanan + 6); $x -lt ($kanan + 120); $x++) {
    $c = $bmp.GetPixel($x, $y)
    $lum = 0.299*$c.R + 0.587*$c.G + 0.114*$c.B
    # netral: B tidak jauh lebih tinggi dari R
    if ($lum -gt 70 -and ($c.B - $c.R) -lt 25) { $ada = $true; break }
  }
  if ($ada) { if ($tAtas -lt 0) { $tAtas = $y }; $tBawah = $y }
}
Write-Output ("  baris teks menu  : y {0}..{1}  tinggi {2} px" -f ($tAtas-$off), ($tBawah-$off), ($tBawah-$tAtas+1))

# Warna logo
$cs = @()
foreach ($y in ($atas..$bawah)) {
  foreach ($x in ($kiri..$kanan)) {
    $c = $bmp.GetPixel($x, $y)
    if ($c.B -gt ($c.R + 30) -and $c.B -gt 80) { $cs += $c }
  }
}
if ($cs.Count -gt 0) {
  $rAvg = [math]::Round(($cs | Measure-Object R -Average).Average)
  $gAvg = [math]::Round(($cs | Measure-Object G -Average).Average)
  $bAvg = [math]::Round(($cs | Measure-Object B -Average).Average)
  Write-Output ("  warna logo       : rgb({0},{1},{2})" -f $rAvg, $gAvg, $bAvg)
}

if ($atas -ge 0 -and $tAtas -ge 0) {
  $hl = $bawah - $atas + 1
  $ht = $tBawah - $tAtas + 1
  Write-Output ''
  Write-Output ("  RASIO logo/teks  : {0}x" -f [math]::Round($hl / $ht, 2))
  Write-Output ("  geser center     : {0} px" -f [math]::Round((($atas+$bawah)/2) - (($tAtas+$tBawah)/2), 1))
}

$bmp.Dispose()
