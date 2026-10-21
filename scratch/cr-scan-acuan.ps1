Add-Type -AssemblyName System.Drawing
$dir = "C:\Users\Zyrex\.cleanroom\artifacts\docs"
$files = Get-ChildItem $dir -Filter *.png | Sort-Object Name
foreach ($f in $files) {
  $bmp = New-Object System.Drawing.Bitmap($f.FullName)
  $w = $bmp.Width; $h = $bmp.Height
  # scan baris tengah untuk batas kolom (perubahan warna)
  $mid = [int]($h / 2)
  $prev = ""; $batas = @()
  for ($x = 0; $x -lt $w; $x++) {
    $p = $bmp.GetPixel($x, $mid)
    $c = "$($p.R),$($p.G),$($p.B)"
    if ($c -ne $prev) { $batas += $x; $prev = $c }
  }
  $bmp.Dispose()
  $ringkas = ($batas | Select-Object -First 12) -join ","
  "{0,-22} {1,5}x{2,-5} batas: {3}" -f $f.Name, $w, $h, $ringkas
}