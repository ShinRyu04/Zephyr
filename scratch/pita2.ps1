Add-Type -AssemblyName System.Drawing
$img=[System.Drawing.Bitmap]::FromFile("D:\Referensi TRAE Agent Window\1.png")
$f=1.25
Write-Output "=== baris y css 600..904, cari kartu (ambang rendah) ==="
$pita=@(); $m=$null; $a=$null
for($y=750;$y -lt 1129;$y++){
  $n=0
  for($x=380;$x -lt 1905;$x+=2){
    $c=$img.GetPixel($x,$y)
    if($c.R -gt 30 -or $c.G -gt 30 -or $c.B -gt 30){ $n++ }
  }
  if($n -gt 40){
    $cy=[math]::Round($y/$f)
    if($m -eq $null){ $m=$cy; $a=$cy } elseif($cy-$a -le 8){ $a=$cy } else { $pita+=,@($m,$a); $m=$cy; $a=$cy }
  }
}
if($m -ne $null){ $pita+=,@($m,$a) }
foreach($p in $pita){ Write-Output ("  css y {0,4} .. {1,4}" -f $p[0],$p[1]) }
$img.Dispose()
