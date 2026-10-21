Add-Type -AssemblyName System.Drawing
$img=[System.Drawing.Bitmap]::FromFile("D:\Referensi TRAE Agent Window\1.png")
$W=$img.Width; $H=$img.Height
# area tengah: x 377..1909 (skala 1.25 => css 302..1527)
$f = 1.25
Write-Output "=== VERTIKAL tengah kolom (x=1140) - cari teks & kotak ==="
$prev=$null
for($y=0;$y -lt $H;$y++){
  $c=$img.GetPixel(1140,$y); $k="$($c.R),$($c.G),$($c.B)"
  if($k -ne $prev){ Write-Output ("  y={0,4} css={1,6:N0} {2}" -f $y,($y/$f),$k); $prev=$k }
}
$img.Dispose()
