Add-Type -AssemblyName System.Drawing
$dir = "C:\Users\Zyrex\.cleanroom\artifacts\docs"
$bmp = New-Object System.Drawing.Bitmap((Join-Path $dir "4.png"))

function IsBorder($p) {
  return ($p.R -ge 55 -and $p.R -le 78 -and [math]::Abs($p.R - $p.G) -lt 5 -and [math]::Abs($p.R - $p.B) -lt 5)
}

"=== 4.png: garis horizontal di kolom chat (x 390..1010) ==="
for ($y = 70; $y -lt 1125; $y++) {
  $n = 0
  for ($x = 390; $x -lt 1010; $x++) { if (IsBorder($bmp.GetPixel($x, $y))) { $n++ } }
  if ($n -gt 400) { "y=$y  n=$n" }
}

"=== 4.png: garis horizontal di area kanan (x 1040..1900) ==="
for ($y = 70; $y -lt 1125; $y++) {
  $n = 0
  for ($x = 1040; $x -lt 1900; $x++) { if (IsBorder($bmp.GetPixel($x, $y))) { $n++ } }
  if ($n -gt 400) { "y=$y  n=$n" }
}
$bmp.Dispose()