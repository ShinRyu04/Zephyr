Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Bitmap]::FromFile("D:\Referensi TRAE Agent Window\composer.png")
$W=$img.Width; $H=$img.Height
Write-Output "=== baris yg banyak piksel != bg (divider/kontrol) ==="
for ($y=18; $y -lt 153; $y++) {
  $n=0
  for ($x=20; $x -lt 735; $x+=1) {
    $c=$img.GetPixel($x,$y)
    if ($c.R -ne 32 -or $c.G -ne 33 -or $c.B -ne 36) { $n++ }
  }
  if ($n -gt 400) { Write-Output ("  y={0,3}  beda={1}" -f $y,$n) }
}
Write-Output "=== vertikal di x=60 (kolom tombol +) ==="
$prev=$null
for ($y=140; $y -lt 160; $y++) {
  $c=$img.GetPixel(60,$y); $k="$($c.R),$($c.G),$($c.B)"
  if ($k -ne $prev) { Write-Output ("  y={0,3}  {1}" -f $y,$k); $prev=$k }
}
$img.Dispose()
