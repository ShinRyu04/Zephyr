Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Bitmap]::FromFile("D:\Referensi TRAE Agent Window\1.1.png")
$f = 1.25

function ProfilV($xcss, $y0, $y1, $label) {
  Write-Output "--- vertikal x=$xcss  ($label) ---"
  $prev = $null
  for ($y = [int]($y0*$f); $y -lt [int]($y1*$f); $y++) {
    $c = $img.GetPixel([int]($xcss*$f), $y)
    $k = "$($c.R),$($c.G),$($c.B)"
    if ($k -ne $prev) { Write-Output ("  y={0,4}  {1}" -f [math]::Round($y/$f), $k); $prev = $k }
  }
  Write-Output ""
}

function ProfilH($ycss, $x0, $x1, $label) {
  Write-Output "--- horizontal y=$ycss  ($label) ---"
  $prev = $null
  for ($x = [int]($x0*$f); $x -lt [int]($x1*$f); $x++) {
    $c = $img.GetPixel($x, [int]($ycss*$f))
    $k = "$($c.R),$($c.G),$($c.B)"
    if ($k -ne $prev) { Write-Output ("  x={0,4}  {1}" -f [math]::Round($x/$f), $k); $prev = $k }
  }
  Write-Output ""
}

ProfilV 520 440 640 "kolom kiri dalam kotak"
ProfilH 470 400 1400 "baris kontrol"
ProfilH 520 400 1400 "baris Local"
ProfilH 590 400 1400 "baris kartu"
$img.Dispose()
