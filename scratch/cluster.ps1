Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Bitmap]::FromFile("D:\Referensi TRAE Agent Window\composer.png")
# baris kontrol: y 128..152 (52px terakhir). Cari cluster horizontal.
$y0=126; $y1=152
$kolom = @()
for ($x=13; $x -lt 744; $x++) {
  $n=0
  for ($y=$y0; $y -le $y1; $y++) {
    $c=$img.GetPixel($x,$y)
    if ([math]::Abs($c.R-32) -gt 8 -or [math]::Abs($c.G-33) -gt 8 -or [math]::Abs($c.B-36) -gt 8) { $n++ }
  }
  $kolom += $n
}
# cluster: kolom berisi > 0, gabung jika jarak <= 8px
$mulai=-1; $akhir=-1; $cluster=@()
for ($i=0; $i -lt $kolom.Count; $i++) {
  $x = $i + 13
  if ($kolom[$i] -gt 0) {
    if ($mulai -lt 0) { $mulai = $x }
    $akhir = $x
  } else {
    if ($mulai -ge 0 -and ($x - $akhir) -gt 8) { $cluster += ,@($mulai,$akhir); $mulai=-1 }
  }
}
if ($mulai -ge 0) { $cluster += ,@($mulai,$akhir) }
Write-Output "=== cluster kontrol (x awal..akhir, lebar, gap ke sebelumnya) ==="
$prevEnd = $null
foreach ($c in $cluster) {
  $w = $c[1] - $c[0] + 1
  $gap = if ($prevEnd -ne $null) { $c[0] - $prevEnd - 1 } else { 0 }
  Write-Output ("  {0,3}..{1,3}  lebar={2,3}  gap={3,3}" -f $c[0],$c[1],$w,$gap)
  $prevEnd = $c[1]
}
$img.Dispose()
