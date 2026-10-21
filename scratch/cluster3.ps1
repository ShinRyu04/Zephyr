Add-Type -AssemblyName System.Drawing
$img=[System.Drawing.Bitmap]::FromFile("D:\Referensi TRAE Agent Window\composer zephyr 2.png")
$f=$img.Width/472.0
$kotakBg = @(22,26,32)
# baris kontrol: css 86..138 relatif kotak, +8 offset => css 94..146 => piksel (94+8)*f .. (146+8)*f
$y0=[int]((86+8)*$f); $y1=[int]((138+8)*$f)
$kolom=@()
for($x=0;$x -lt $img.Width;$x++){
  $n=0
  for($y=$y0;$y -lt $y1;$y++){
    $c=$img.GetPixel($x,$y)
    if([math]::Abs($c.R-$kotakBg[0]) -gt 10 -or [math]::Abs($c.G-$kotakBg[1]) -gt 10 -or [math]::Abs($c.B-$kotakBg[2]) -gt 10){$n++}
  }
  $kolom+=$n
}
$mulai=-1;$akhir=-1;$cluster=@()
for($i=0;$i -lt $kolom.Count;$i++){
  if($kolom[$i] -gt 0){ if($mulai -lt 0){$mulai=$i}; $akhir=$i }
  else { if($mulai -ge 0 -and ($i-$akhir) -gt 6){ $cluster+=,@($mulai,$akhir); $mulai=-1 } }
}
if($mulai -ge 0){$cluster+=,@($mulai,$akhir)}
Write-Output "=== cluster ZEPHYR (css, relatif kotak kiri) ==="
$prevEnd=$null
foreach($c in $cluster){
  $a=($c[0]/$f)-8; $b=($c[1]/$f)-8; $w=$b-$a
  $gap = if($prevEnd -ne $null){ $a-$prevEnd } else { 0 }
  Write-Output ("  {0,6:N1} .. {1,6:N1}  lebar={2,5:N1}  gap={3,5:N1}" -f $a,$b,$w,$gap)
  $prevEnd=$b
}
$img.Dispose()
