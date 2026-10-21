Add-Type -AssemblyName System.Drawing
$img=[System.Drawing.Bitmap]::FromFile("D:\Referensi TRAE Agent Window\composer zephyr 2.png")
$f = $img.Width / 472.0
Write-Output "faktor = $f"
Write-Output "=== vertikal tengah (relatif ke tepi atas kotak, kotak mulai css 8) ==="
$midX=[int]($img.Width/2)
$prev=$null
for($y=0;$y -lt $img.Height;$y++){
  $c=$img.GetPixel($midX,$y); $k="$($c.R),$($c.G),$($c.B)"
  if($k -ne $prev){ Write-Output ("  css={0,6:N1}  {1}" -f (($y/$f)-8),$k); $prev=$k }
}
$img.Dispose()
