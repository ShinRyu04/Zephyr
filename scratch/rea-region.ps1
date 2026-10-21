Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Bitmap]::FromFile("D:\Referensi TRAE Agent Window\1.1.png")
$f = 1.25

Write-Output "=== REGION: kotak composer + Local + kartu (css y 440..640) ==="
Write-Output "--- profil vertikal di x=760 (tengah kolom) ---"
$prev = $null
for ($y = [int](440*$f); $y -lt [int](640*$f); $y++) {
  $c = $img.GetPixel([int](760*$f), $y)
  $k = "$($c.R),$($c.G),$($c.B)"
  if ($k -ne $prev) {
    Write-Output ("  css y={0,4}  {1}" -f [math]::Round($y/$f), $k)
    $prev = $k
  }
}

Write-Output ""
Write-Output "--- batas kotak: profil horizontal di css y=520 (baris Local) ---"
$prev = $null
for ($x = [int](400*$f); $x -lt [int](1400*$f); $x++) {
  $c = $img.GetPixel($x, [int](520*$f))
  $k = "$($c.R),$($c.G),$($c.B)"
  if ($k -ne $prev) {
    Write-Output ("  css x={0,4}  {1}" -f [math]::Round($x/$f), $k)
    $prev = $k
  }
}
$img.Dispose()
