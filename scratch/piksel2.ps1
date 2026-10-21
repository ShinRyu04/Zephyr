Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Bitmap]::FromFile("D:\Referensi TRAE Agent Window\composer.png")
$W=$img.Width; $H=$img.Height
Write-Output "=== HORIZONTAL di y=100 ==="
$prev=$null
for ($x=0; $x -lt $W; $x++) {
  $c=$img.GetPixel($x,100); $k="$($c.R),$($c.G),$($c.B)"
  if ($k -ne $prev) { Write-Output ("  x={0,3}  {1}" -f $x,$k); $prev=$k }
}
Write-Output "=== cari DIVIDER (baris yg beda tipis di dalam kotak) ==="
for ($y=20; $y -lt 152; $y++) {
  $c=$img.GetPixel(300,$y); $k="$($c.R),$($c.G),$($c.B)"
  if ($k -ne "32,33,36") { Write-Output ("  y={0,3}  {1}" -f $y,$k) }
}
$img.Dispose()
