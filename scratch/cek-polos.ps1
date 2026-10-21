Add-Type -AssemblyName System.Drawing
$img=[System.Drawing.Bitmap]::FromFile("D:\Referensi TRAE Agent Window\1.png")
Write-Output "=== contoh piksel di area bawah (cek apakah memang polos) ==="
foreach($y in @(760,800,850,900,950,1000,1050,1100)){
  $r=$img.GetPixel(600,$y); $r2=$img.GetPixel(1400,$y)
  Write-Output ("  y={0,4}  x600={1},{2},{3}   x1400={4},{5},{6}" -f $y,$r.R,$r.G,$r.B,$r2.R,$r2.G,$r2.B)
}
Write-Output "=== gambar sebenarnya 1917x1138; tinggi css = $([math]::Round(1138/1.25)) ==="
$img.Dispose()
