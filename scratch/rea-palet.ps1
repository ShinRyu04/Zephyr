Add-Type -AssemblyName System.Drawing

function Sampel($path, $label) {
  $img = [System.Drawing.Bitmap]::FromFile($path)
  $f = $img.Width / 1534.0
  Write-Output "=== $label  ($($img.Width)x$($img.Height), faktor=$([math]::Round($f,3))) ==="
  $titik = @(
    @(10,   300, "frame kiri"),
    @(150,  300, "sidebar isi"),
    @(150,  80,  "sidebar atas"),
    @(700,  300, "kanvas tengah"),
    @(700,  200, "kanvas atas"),
    @(700,  400, "kanvas bawah"),
    @(700,  470, "atas composer"),
    @(700,  520, "dalam composer"),
    @(700,  575, "baris kontrol"),
    @(700,  620, "bawah composer"),
    @(700,  700, "bawah kanvas"),
    @(1520, 300, "tepi kanan")
  )
  foreach ($t in $titik) {
    $x = [int]($t[0] * $f); $y = [int]($t[1] * $f)
    if ($x -lt $img.Width -and $y -lt $img.Height) {
      $c = $img.GetPixel($x, $y)
      $hex = "#{0:x2}{1:x2}{2:x2}" -f $c.R, $c.G, $c.B
      Write-Output ("  {0,-16} css({1,4},{2,4}) = {3,3},{4,3},{5,3}  {6}" -f $t[2], $t[0], $t[1], $c.R, $c.G, $c.B, $hex)
    }
  }
  $img.Dispose()
  Write-Output ""
}

Sampel "D:\Referensi TRAE Agent Window\1.png" "TRAE"
Sampel "D:\Referensi TRAE Agent Window\agents zephyr 2.png" "ZEPHYR"
