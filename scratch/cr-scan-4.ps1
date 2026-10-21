Add-Type -AssemblyName System.Drawing
$dir = "C:\Users\Zyrex\.cleanroom\artifacts\docs"

function W($bmp, $x, $y) {
  $p = $bmp.GetPixel($x, $y)
  return "$($p.R),$($p.G),$($p.B)"
}

$bmp = New-Object System.Drawing.Bitmap((Join-Path $dir "4.png"))
"=== 4.png: kolom x=1400 (tengah panel kanan), y 60..1133 ==="
$prev = ""; $out = @()
for ($y = 60; $y -lt 1133; $y++) {
  $c = W $bmp 1400 $y
  if ($c -ne $prev) { $out += "y=$y $c"; $prev = $c }
}
($out | Select-Object -First 40) -join "`n"
""
"=== 4.png: baris y=200, x 1020..1917 (isi panel kanan) ==="
$prev = ""; $out = @()
for ($x = 1020; $x -lt 1917; $x++) {
  $c = W $bmp $x 200
  if ($c -ne $prev) { $out += "x=$x $c"; $prev = $c }
}
($out | Select-Object -First 40) -join "`n"
$bmp.Dispose()