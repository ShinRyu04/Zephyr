Add-Type -AssemblyName System.Drawing
$img=[System.Drawing.Bitmap]::FromFile("D:\Referensi TRAE Agent Window\1.png")
$f=1.25
Write-Output "=== baris berkonten SETELAH kotak composer (y css > 592) ==="
for($y=742;$y -lt 1130;$y++){
  $n=0
  for($x=380;$x -lt 1905;$x+=3){
    $c=$img.GetPixel($x,$y)
    if($c.R -gt 45 -or $c.G -gt 45 -or $c.B -gt 45){ $n++ }
  }
  if($n -gt 2){ Write-Output ("  css={0,6:N0}  terang={1}" -f ($y/$f),$n) }
}
$img.Dispose()
