Add-Type -AssemblyName System.Drawing
$img=[System.Drawing.Bitmap]::FromFile("D:\Referensi TRAE Agent Window\composer.png")
Write-Output "=== sapuan tombol kirim (x 700..745, y 125..152) ==="
$maks=0; $warna=$null
for($y=125;$y -lt 153;$y++){
  for($x=700;$x -lt 746;$x++){
    $c=$img.GetPixel($x,$y)
    if($c.G -gt 60 -and $c.G -gt ($c.R+20)){ if($c.G -gt $maks){ $maks=$c.G; $warna="$($c.R),$($c.G),$($c.B) @ $x,$y" } }
  }
}
Write-Output "  hijau paling terang: $warna"
Write-Output "=== tengah tombol ==="
foreach($p in @(@(714,138),@(716,140),@(720,136),@(724,144),@(712,132))){
  $c=$img.GetPixel($p[0],$p[1]); Write-Output ("  ({0},{1}) = {2},{3},{4}" -f $p[0],$p[1],$c.R,$c.G,$c.B)
}
$img.Dispose()
