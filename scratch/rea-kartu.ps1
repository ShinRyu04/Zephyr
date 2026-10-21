Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Bitmap]::FromFile("D:\Referensi TRAE Agent Window\1.1.png")
$f = 1.25

Write-Output "=== KARTU KATEGORI: batas horizontal di y=590 ==="
$prev = $null
$start = $null
for ($x = [int](400*$f); $x -lt [int](1400*$f); $x++) {
  $c = $img.GetPixel($x, [int](590*$f))
  $terang = ($c.R -gt 30 -or $c.G -gt 30 -or $c.B -gt 30)
  $k = if ($terang) { "T" } else { "G" }
  if ($k -ne $prev) {
    Write-Output ("  css x={0,4}  {1}  ({2},{3},{4})" -f [math]::Round($x/$f), $k, $c.R, $c.G, $c.B)
    $prev = $k
  }
}

Write-Output ""
Write-Output "=== KARTU: profil vertikal di x=560 (kartu pertama) ==="
$prev = $null
for ($y = [int](560*$f); $y -lt [int](640*$f); $y++) {
  $c = $img.GetPixel([int](560*$f), $y)
  $k = "$($c.R),$($c.G),$($c.B)"
  if ($k -ne $prev) { Write-Output ("  y={0,4}  {1}" -f [math]::Round($y/$f), $k); $prev = $k }
}
$img.Dispose()
