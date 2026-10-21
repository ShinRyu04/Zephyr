Add-Type -AssemblyName System.Drawing
$dir = "C:\Users\Zyrex\.cleanroom\artifacts\docs"

function W($bmp, $x, $y) {
  $p = $bmp.GetPixel($x, $y)
  return "$($p.R),$($p.G),$($p.B)"
}

$bmp = New-Object System.Drawing.Bitmap((Join-Path $dir "4.png"))
"=== 4.png: panel kanan, kolom x=1100 (kiri panel), y 60..1133 ==="
$prev = ""; $out = @()
for ($y = 60; $y -lt 1133; $y++) {
  $c = W $bmp 1100 $y
  if ($c -ne $prev) { $out += "y=$y $c"; $prev = $c }
}
($out | Select-Object -First 30) -join " | "
""
"=== 4.png: cari kotak composer di panel kanan (x 1040..1900), y 900..1133 ==="
for ($y = 900; $y -lt 1133; $y++) {
  $n = 0
  for ($x = 1040; $x -lt 1900; $x++) {
    $c = W $bmp $x $y
    if ($c -ne "23,23,23" -and $c -ne "38,38,38") { $n++ }
  }
  if ($n -gt 400) { "y=$y  nonlatar=$n" }
}
$bmp.Dispose()