Add-Type -AssemblyName System.Drawing
$img=[System.Drawing.Bitmap]::FromFile("D:\Referensi TRAE Agent Window\1.png")
$f=1.25
Write-Output "=== SEMUA baris berkonten, y css, x 302..1527 ==="
$baris=@()
for($y=80;$y -lt 1130;$y++){
  $n=0
  for($x=380;$x -lt 1905;$x+=4){
    $c=$img.GetPixel($x,$y)
    if($c.R -gt 50 -or $c.G -gt 50 -or $c.B -gt 50){ $n++ }
  }
  if($n -gt 1){ $baris += ,@([math]::Round($y/$f),$n) }
}
# gabung baris berdekatan jadi pita
$pita=@(); $m=$null; $a=$null
foreach($b in $baris){
  if($m -eq $null){ $m=$b[0]; $a=$b[0] }
  elseif($b[0] - $a -le 6){ $a=$b[0] }
  else { $pita += ,@($m,$a); $m=$b[0]; $a=$b[0] }
}
if($m -ne $null){ $pita += ,@($m,$a) }
foreach($p in $pita){ Write-Output ("  css y {0,4} .. {1,4}  (tinggi {2})" -f $p[0],$p[1],($p[1]-$p[0])) }
$img.Dispose()
