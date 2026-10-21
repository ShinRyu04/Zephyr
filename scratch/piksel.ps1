Add-Type -AssemblyName System.Drawing
function Analisa($path, $label) {
  $img = [System.Drawing.Bitmap]::FromFile($path)
  Write-Output "=== $label ($($img.Width)x$($img.Height)) ==="
  $W = $img.Width; $H = $img.Height
  # scan baris tengah vertikal untuk cari tepi atas/bawah kotak
  $midX = [int]($W/2)
  $prev = $null
  for ($y=0; $y -lt $H; $y++) {
    $c = $img.GetPixel($midX, $y)
    $k = "$($c.R),$($c.G),$($c.B)"
    if ($k -ne $prev) { Write-Output ("  y={0,3}  {1}" -f $y, $k); $prev = $k }
  }
  $img.Dispose()
}
Analisa "D:\Referensi TRAE Agent Window\composer.png" "TRAE"
