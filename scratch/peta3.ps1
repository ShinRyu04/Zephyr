Add-Type -AssemblyName System.Drawing
$img=[System.Drawing.Bitmap]::FromFile("D:\Referensi TRAE Agent Window\1.png")
$f=1.25
# cari baris berisi konten di area bawah kotak (y 600..900 css => px 750..1125)
Write-Output "=== baris berkonten (y css) di x 302..1527 ==="
for($y=740;$y -lt 1125;$y++){
  $n=0
  for($x=380;$x -lt 1900;$x+=2){
    $c=$img.GetPixel($x,$y)
    if([math]::Abs($c.R-23) -gt 12 -or [math]::Abs($c.G-23) -gt 12 -or [math]::Abs($c.B-23) -gt 12){ $n++ }
  }
  if($n -gt 3){ Write-Output ("  y_px={0,4} css={1,6:N0}  konten={2}" -f $y,($y/$f),$n) }
}
$img.Dispose()
