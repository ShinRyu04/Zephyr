Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Bitmap]::FromFile("D:\Referensi TRAE Agent Window\1.1.png")
$f = 1.25

# Cari kotak kartu: cari piksel yang BUKAN latar (23,23,23) tapi juga bukan teks terang.
# Border kartu di TRAE ~ (64,64,64) atau sedikit di atas latar.
Write-Output "=== cari BORDER kartu: baris y=576..610, cari kolom dengan warna 40..80 ==="
for ($x = [int](400*$f); $x -lt [int](1400*$f); $x++) {
  $c = $img.GetPixel($x, [int](577*$f))
  if ($c.R -ge 40 -and $c.R -le 90 -and [math]::Abs($c.R-$c.G) -lt 6 -and [math]::Abs($c.G-$c.B) -lt 6) {
    Write-Output ("  border di css x={0,4}  ({1},{2},{3})" -f [math]::Round($x/$f), $c.R, $c.G, $c.B)
  }
}
$img.Dispose()
