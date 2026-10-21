Add-Type -AssemblyName System.Drawing
$dir = "C:\Users\Zyrex\.cleanroom\artifacts\docs"

function Warna($bmp, $x, $y) {
  $p = $bmp.GetPixel($x, $y)
  return "$($p.R),$($p.G),$($p.B)"
}

foreach ($nama in @("4.png", "7.png", "12.png", "13.png")) {
  $bmp = New-Object System.Drawing.Bitmap((Join-Path $dir $nama))
  "=== $nama  ($($bmp.Width)x$($bmp.Height)) ==="
  "  -- baris y=120 (di bawah titlebar): x 1000..1917 --"
  $prev = ""; $out = @()
  for ($x = 1000; $x -lt $bmp.Width; $x++) {
    $c = Warna $bmp $x 120
    if ($c -ne $prev) { $out += "x=$x $c"; $prev = $c }
  }
  "  " + (($out | Select-Object -First 10) -join " | ")
  "  -- kolom x=1500: y 60..400 --"
  $prev = ""; $out = @()
  for ($y = 60; $y -lt 400; $y++) {
    $c = Warna $bmp 1500 $y
    if ($c -ne $prev) { $out += "y=$y $c"; $prev = $c }
  }
  "  " + (($out | Select-Object -First 12) -join " | ")
  $bmp.Dispose()
}