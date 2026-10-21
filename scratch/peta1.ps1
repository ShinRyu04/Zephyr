Add-Type -AssemblyName System.Drawing
$img=[System.Drawing.Bitmap]::FromFile("D:\Referensi TRAE Agent Window\1.png")
$W=$img.Width; $H=$img.Height
# kolom tengah: cari batas kiri (setelah sidebar) dan kanan (sebelum panel kanan)
Write-Output "=== HORIZONTAL di y=300 (cari batas kolom) ==="
$prev=$null
for($x=0;$x -lt $W;$x++){
  $c=$img.GetPixel($x,300); $k="$($c.R),$($c.G),$($c.B)"
  if($k -ne $prev){ Write-Output ("  x={0,4} {1}" -f $x,$k); $prev=$k }
}
$img.Dispose()
