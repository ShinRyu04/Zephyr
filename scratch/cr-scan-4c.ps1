Add-Type -AssemblyName System.Drawing
$dir = "C:\Users\Zyrex\.cleanroom\artifacts\docs"
$bmp = New-Object System.Drawing.Bitmap((Join-Path $dir "4.png"))

"=== 4.png: baris berisi teks terang di dalam composer (x 400..1010) ==="
for ($y = 937; $y -lt 1110; $y++) {
  $n = 0
  for ($x = 400; $x -lt 1010; $x++) {
    $p = $bmp.GetPixel($x, $y)
    if ($p.R -gt 80) { $n++ }
  }
  if ($n -gt 0) { "y=$y  terang=$n" }
}
""
"=== 4.png: batas vertikal dalam composer (y 940..1105) ==="
for ($x = 377; $x -lt 1030; $x++) {
  $n = 0
  for ($y = 940; $y -lt 1105; $y++) {
    $p = $bmp.GetPixel($x, $y)
    if ($p.R -ge 55 -and $p.R -le 78 -and [math]::Abs($p.R - $p.G) -lt 5) { $n++ }
  }
  if ($n -gt 30) { "x=$x  n=$n" }
}
$bmp.Dispose()