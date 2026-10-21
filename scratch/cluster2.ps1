Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Bitmap]::FromFile("D:\Referensi TRAE Agent Window\composer zephyr 2.png")
Write-Output "zephyr crop = $($img.Width)x$($img.Height) (scale 2x, padding 8px)"
$W=$img.Width; $H=$img.Height
# baris kontrol = 52*2 = 104 px terakhir dikurangi padding 16
$y1 = $H - 17
$y0 = $y1 - 96
$kolom = @()
for ($x=17; $x -lt ($W-17); $x++) {
  $n=0
  for ($y=$y0; $y -le $y1; $y++) {
    $c=$img.GetPixel($x,$y)
    if ([math]::Abs($c.R-32) -gt 10 -or [math]::Abs($c.G-33) -gt 10 -or [math]::Abs($c.B-36) -gt 10) { $n++ }
  }
  $kolom += $n
}
$mulai=-1; $akhir=-1; $cluster=@()
for ($i=0; $i -lt $kolom.Count; $i++) {
  $x = $i + 17
  if ($kolom[$i] -gt 0) { if ($mulai -lt 0) { $mulai=$x }; $akhir=$x }
  else { if ($mulai -ge 0 -and ($x-$akhir) -gt 12) { $cluster += ,@($mulai,$akhir); $mulai=-1 } }
}
if ($mulai -ge 0) { $cluster += ,@($mulai,$akhir) }
Write-Output "=== cluster ZEPHYR (x/2 = css px) ==="
$prevEnd=$null
foreach ($c in $cluster) {
  $w=$c[1]-$c[0]+1
  $gap = if ($prevEnd -ne $null) { $c[0]-$prevEnd-1 } else { 0 }
  Write-Output ("  css {0,5:N1}..{1,5:N1}  lebar={2,5:N1}  gap={3,5:N1}" -f ($c[0]/2),($c[1]/2),($w/2),($gap/2))
  $prevEnd=$c[1]
}
$img.Dispose()
